import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import { useGoodsStore } from './goods'
import { useEventsStore } from './events'
import { usePresetsStore, normalizeCharacterName } from './presets'
import { useRechargeStore } from '@/stores/recharge'
import { useGoodsGroupStore } from '@/stores/goods/goodsGroup'
import { useAuthStore } from '@/stores/auth'
import { useSyncLogger } from '@/composables/sync/useSyncLogger'
import { createSyncConflictService } from '@/services/sync/syncConflictService'
import { createSyncOrchestrator } from '@/services/sync/syncOrchestrator'
import { createSupabaseBackendAdapter } from '@/services/supabaseAdapter/index'
import { createSyncImageService } from '@/services/sync/syncImageService'
import { createSyncPayloadService } from '@/services/sync/syncPayloadService'
import { withRetry } from '@/services/sync/syncRetry'
import { getItemTimestamp, resolveGoodsTrashMaps } from '@/utils/sync/shared'
import { readOrCreateDeviceId, readSyncKey, writeSyncKey, removeSyncKey } from '@/utils/sync/storage'
import { SyncError, buildSyncErrorStatus } from '@/services/sync/syncError'
import { initSupabaseClient, testSupabaseConnection, reconnectSupabase, isSupabaseConfigured, loadEndpointPreference } from '@/utils/sync/supabaseClient'
import { readLocalImageAsDataUrl } from '@/utils/image/localImage'
import { getDeviceInfo } from '@/utils/platform/deviceInfo'
import { compressImageToBlob } from '@/composables/image/useImageExport'
import { isFeatureBlocked, FEATURE_KEYS } from '@/services/maintenanceModeService'
import { createLogger } from '@/utils/logger'
import i18n from '@/locales'
import {
  IMAGE_FILE_PREFIX,
  EVENT_COVER_PREFIX,
  EVENT_PHOTO_PREFIX,
  RECHARGE_IMAGE_PREFIX,
  BATCH_DRAFT_IMAGE_PREFIX,
  IMAGE_FILE_SIZE_LIMIT,
  SYNC_SCHEMA_VERSION
} from '@/constants/syncConstants'
import packageJson from '../../package.json'
import { normalizeVersionTag } from '@/utils/github/release'
import { normalizeCustomFieldDefs } from '@/utils/goods/customFields'

const LAST_SYNC_KEY = 'sync_last_synced_at'
const EVENT_LAST_SYNC_KEY = 'sync_event_last_synced_at'
// 服务器域水位线：最后已见 manifest synced_at（行域 LAST_SYNC_KEY 仅作增量拉取的 since）
const LAST_SERVER_SYNC_KEY = 'sync_last_server_synced_at'
// 同步数据格式版本：持久化的格式版本低于 SYNC_SCHEMA_VERSION 时，首次同步强制全量回填
const SYNC_SCHEMA_VERSION_KEY = 'sync_schema_version'
// 历史版本遗留（加密功能已移除，仅用于一次性清理）
const LEGACY_SYNC_PASSWORD_KEY = 'sync_password'
const DEVICE_ID_KEY = Capacitor.isNativePlatform() ? 'sync_native_device_id' : 'sync_web_device_id'
// 历史版本遗留（加密功能已移除，仅用于一次性清理）
const LEGACY_ENCRYPTION_ENABLED_KEY = 'sync_encryption_enabled'
const SUPABASE_URL_KEY = 'sync_supabase_url'
const SUPABASE_ANON_KEY_KEY = 'sync_supabase_anon_key'
const SYNC_BACKEND_KEY = 'sync_backend'
const SYNC_PAUSED_KEY = 'sync_paused'
const PENDING_PUSH_KEY = 'sync_pending_push'
const LAST_SYNC_USER_KEY = 'sync_last_user_id'

const IS_NATIVE = Capacitor.isNativePlatform()

// 设备级强制重同步：服务端 devices.force_resync_at 时间戳，本地记住「已处理」值避免重复触发
const DEVICE_FORCE_RESYNC_KEY = 'sync_device_force_resync_at'
// 心跳上报的 app 版本（JS bundle 版本，同步用 FALLBACK_VERSION 模式）
const APP_VERSION = normalizeVersionTag(
  import.meta.env.VITE_APP_VERSION || packageJson.version || '0.0.0'
) || '0.0.0'

function generateDeviceId() {
  const platform = IS_NATIVE ? 'native' : 'web'
  return `device_${platform}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function shouldApplyRemoteItem(localItem, remoteItem) {
  if (!localItem) return true
  return getItemTimestamp(remoteItem) > getItemTimestamp(localItem)
}

export const useSyncStore = defineStore('sync', () => {
  const { syncLogs, clearSyncLogs, trackSyncStep } = useSyncLogger()

  // ── Sync Timestamps ──
  const lastSyncedAt = ref('')
  const eventLastSyncedAt = ref('')
  // 服务器域水位线：最后已见 manifest synced_at，与行域 lastSyncedAt（推送方客户端时间域）分开，
  // 供 remote-ahead / 冲突分支判定，消除跨时钟域比较造成的误报冲突
  const lastServerSyncedAt = ref('')
  const pendingPush = ref(null) // crash-safe push 标记：{ ts, eventTs, deviceId }

  // 同步数据格式版本升级待回填：init 时发现持久化格式版本低于当前版本即置位，
  // 首次同步/拉取先做一次全量重放（时间戳相等也应用远端行）再固化为当前版本
  const schemaResyncPending = ref(false)

  // ── Maintenance Mode ──
  // 从 sync_manifest.maintenance_mode JSONB 字段读取，零额外请求
  const maintenanceMode = ref(null) // { enabled, message, blocks } | null

  // 同步代际：3 分钟超时重置后旧管道可能仍在后台运行；每轮同步开始与每次强制
  // 重置都 bump 代际，旧代际管道的关键落盘（水位线 / pendingPush）会被守卫拒绝，
  // 避免双管道并发互相覆盖
  let syncGeneration = 0
  const STALE_SYNC_MESSAGE = 'SYNC_STALE_GENERATION'
  const log = createLogger('sync')

  // ── Device ──
  const deviceId = ref('')

  // ── Backend Selection ──
  const syncBackend = ref('supabase')
  const supabaseUrl = ref('')
  const supabaseAnonKey = ref('')

  // ── Sync Lifecycle / UI State ──
  const isInitialized = ref(false)
  const isSyncing = ref(false)
  const isPulling = ref(false)
  const syncPaused = ref(false)
  const syncStatus = ref('')
  const lastError = ref('')
  const syncPhase = ref(null)
  const syncCause = ref(null)
  const syncSuggestion = ref(null)
  const syncNotice = ref(null)
  const conflictData = ref(null)
  const syncSource = ref('')

  const isConfigured = computed(() => isSupabaseConfigured())

  async function ensureEventsStoreReady() {
    const eventsStore = useEventsStore()
    if (!eventsStore.isReady) await eventsStore.init()
    return eventsStore
  }

  // ── Persistence helpers ──

  async function saveLastSyncedAt(timestamp) {
    lastSyncedAt.value = timestamp
    await writeSyncKey(LAST_SYNC_KEY, timestamp)
  }

  async function saveEventLastSyncedAt(timestamp) {
    eventLastSyncedAt.value = timestamp
    await writeSyncKey(EVENT_LAST_SYNC_KEY, timestamp)
  }

  async function saveLastServerSyncedAt(timestamp) {
    lastServerSyncedAt.value = timestamp
    await writeSyncKey(LAST_SERVER_SYNC_KEY, timestamp)
  }

  // crash-safe push：写远端前持久化标记，推送完整落盘后清除
  async function savePendingPush(marker) {
    pendingPush.value = marker || null
    await writeSyncKey(PENDING_PUSH_KEY, marker ? JSON.stringify(marker) : '')
  }

  async function clearPendingPush() {
    if (!pendingPush.value) return
    pendingPush.value = null
    await writeSyncKey(PENDING_PUSH_KEY, '')
  }

  // 账号切换检测：换账号后旧账号的水位线会让增量拉取跳过新账号的历史数据，
  // pendingPush 标记还可能误快进水位线；同步/拉取前发现 uid 变化即清空两者。
  // dirty 标记保留，让切换后的首次同步走完整对比 + 现有冲突确认流程。
  // 返回是否发生了账号切换（水位线已被清空）。
  let lastCheckedSyncUid = ''
  async function ensureSyncAccountConsistent() {
    const authStore = useAuthStore()
    const uid = authStore.user?.id || ''
    if (!uid || uid === lastCheckedSyncUid) return false
    const prevUid = (await readSyncKey(LAST_SYNC_USER_KEY)) || ''
    const switched = !!prevUid && prevUid !== uid
    if (switched) {
      console.warn('[sync] account switched, clearing sync watermarks')
      lastSyncedAt.value = ''; eventLastSyncedAt.value = ''; lastServerSyncedAt.value = ''; pendingPush.value = null
      await Promise.all([
        writeSyncKey(LAST_SYNC_KEY, ''), writeSyncKey(EVENT_LAST_SYNC_KEY, ''),
        writeSyncKey(LAST_SERVER_SYNC_KEY, ''), writeSyncKey(PENDING_PUSH_KEY, '')
      ])
    }
    if (prevUid !== uid) await writeSyncKey(LAST_SYNC_USER_KEY, uid)
    lastCheckedSyncUid = uid
    return switched
  }

  async function saveSupabaseConfig(url, anonKey) {
    supabaseUrl.value = url
    supabaseAnonKey.value = anonKey
    await writeSyncKey(SUPABASE_URL_KEY, url)
    await writeSyncKey(SUPABASE_ANON_KEY_KEY, anonKey)
    if (url && anonKey) {
      initSupabaseClient(url, anonKey, { custom: true })
    }
  }

  async function setSyncBackend(backend) {
    if (isSyncing.value) {
      console.warn('[sync] force reset isSyncing on backend switch')
      resetSyncingState()
    }

    if (backend === 'supabase') {
      if (isSupabaseConfigured()) {
        if (supabaseUrl.value && supabaseAnonKey.value) {
          try { initSupabaseClient(supabaseUrl.value, supabaseAnonKey.value, { custom: true }) } catch (e) { console.warn('[sync] initSupabaseClient failed on setSyncBackend:', e.message) }
        }
      }
    }

    syncBackend.value = backend
    await writeSyncKey(SYNC_BACKEND_KEY, backend)
  }

  function isSupabaseMode() {
    return syncBackend.value === 'supabase'
  }

  function ensureBackendReady() {
    if (!isSupabaseConfigured()) {
      throw new Error(i18n.global.t('sync.notConfigured'))
    }
  }

  function publishSyncNotice({ source = 'manual', level = 'error', message = '' } = {}) {
    syncNotice.value = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      source,
      level,
      message: String(message || '').trim()
    }
  }

  function applySyncError(error, fallbackStatus) {
    if (error instanceof SyncError) {
      lastError.value = error.message
      syncStatus.value = buildSyncErrorStatus(error)
      syncPhase.value = error.phase
      syncCause.value = error.cause
      syncSuggestion.value = error.suggestion
      return
    }

    lastError.value = error?.message || fallbackStatus
    syncStatus.value = fallbackStatus
  }

  function getCurrentBackend() {
    if (isSupabaseConfigured()) {
      if (supabaseUrl.value && supabaseAnonKey.value) {
        initSupabaseClient(supabaseUrl.value, supabaseAnonKey.value, { custom: true })
      }
      const authStore = useAuthStore()
      return createSupabaseBackendAdapter({
        trackSyncStep,
        deviceIdRef: () => deviceId.value,
        userIdRef: () => authStore.user?.id || ''
      })
    }
    throw new Error(i18n.global.t('sync.notConfigured'))
  }

  // ── Service wiring ──
  // payloadService 必须整对象透传 createSyncPayloadService 的返回值。
  // 2026-09 曾手工拼装漏挂 buildBatchDraftSyncPayload，导致草稿推不上云。
  const payloadService = createSyncPayloadService({
    deviceIdRef: deviceId, imageCloudIdRef: ref(''), lastSyncedAtRef: lastSyncedAt,
    buildPresetsData, ensureEventsStoreReady, useGoodsStore, useRechargeStore, useEventsStore, useGoodsGroupStore,
    readLocalImageAsDataUrl, compressImageToBlob, imageFileSizeLimit: IMAGE_FILE_SIZE_LIMIT
  })

  let activeBackend = getCurrentBackend()

  const imageService = createSyncImageService({
    backend: activeBackend,
    getBackend: () => activeBackend,
    trackSyncStep,
    imageFilePrefix: IMAGE_FILE_PREFIX,
    eventCoverPrefix: EVENT_COVER_PREFIX,
    eventPhotoPrefix: EVENT_PHOTO_PREFIX,
    rechargeImagePrefix: RECHARGE_IMAGE_PREFIX,
    // 新增同步域图片前缀时必须同步挂到这里，否则 collectSupabaseOrphanImageFiles
    // 会直接 skip（matchedPrefix 为空），该域云端图永远无法回收
    batchDraftImagePrefix: BATCH_DRAFT_IMAGE_PREFIX
  })

  const conflictService = createSyncConflictService({
    backend: activeBackend,
    getBackend: () => activeBackend,
    lastSyncedAtRef: lastSyncedAt,
    useGoodsStore,
    useRechargeStore,
    useEventsStore,
    useGoodsGroupStore,
    shouldApplyRemoteItem,
    buildRechargeSyncData: payloadService.buildRechargeSyncData,
    buildEventSyncData: payloadService.buildEventSyncData,
    getLatestLocalModifiedAt
  })

  const orchestrator = createSyncOrchestrator({
    backend: activeBackend, payload: payloadService, image: imageService, conflict: conflictService,
    useGoodsStore, useRechargeStore, useEventsStore, usePresetsStore, useGoodsGroupStore, trackSyncStep,
    userIdRef: () => { const authStore = useAuthStore(); return authStore.user?.id || '' }
  })

  async function restoreImageFromCloud(cloudFileName) {
    const name = String(cloudFileName || '').trim()
    if (!name) return null
    const resolvedBackend = activeBackend
    if (!resolvedBackend?.readImage) return null
    try {
      const dataUrl = await resolvedBackend.readImage(name)
      return String(dataUrl || '').startsWith('data:image/') ? dataUrl : null
    } catch { return null }
  }

  /**
   * 云端文件名 → 可展示公开 URL。
   * 先刷新存储列表缓存，避免 resolveStoragePath 冷缓存时误把根目录旧文件
   * 拼进用户目录，生成 404 死链（AI 嵌图 / 同步水化都依赖它）。
   * @param {string} cloudFileName
   * @returns {Promise<string>} 空字符串表示无法解析
   */
  async function getPublicImageURL(cloudFileName) {
    const name = String(cloudFileName || '').trim()
    if (!name) return ''
    const resolvedBackend = activeBackend
    if (!resolvedBackend?.getImagePublicUrl) return ''
    try {
      if (typeof resolvedBackend.getExistingImageCloud === 'function') {
        await resolvedBackend.getExistingImageCloud()
      }
    } catch {
      // 缓存失败仍尝试生成：新上传默认走用户目录，多数场景仍正确
    }
    try {
      return String(resolvedBackend.getImagePublicUrl(name) || '').trim()
    } catch {
      return ''
    }
  }

  // ── Helpers ──

  async function buildPresetsData() {
    const presets = usePresetsStore()
    const favCat = presets.favoriteCategorySet
    const favIp = presets.favoriteIpSet
    const favChr = presets.favoriteCharacterSet
    return {
      categories: presets.categories.map((name) => ({ name, fav: favCat.has(name) })),
      ips: presets.ips.map((name) => ({ name, fav: favIp.has(name) })),
      characters: presets.characters
        .map((item) => ({
          name: normalizeCharacterName(item?.name || ''),
          ip: String(item?.ip || '').trim(),
          fav: favChr.has(normalizeCharacterName(item?.name || ''))
        }))
        .filter((item) => item.name),
      storageLocations: presets.storageLocations.map((item) => ({
        id: String(item?.id || '').trim(), name: String(item?.name || '').trim(), parentId: String(item?.parentId || '').trim()
      })),
      eventTypes: presets.eventTypes.map((item) => ({
        name: String(item?.name || '').trim(),
        showTracks: Boolean(item?.showTracks)
      })).filter((item) => item.name),
      // 键的位置必须与 reader.readPresets 完全一致，且两侧共用 normalizeCustomFieldDefs：
      // syncOrchestrator 用 JSON.stringify(local) !== JSON.stringify(remote) 判预设差异，
      // 键序/默认值只要有一点不对称就会「永远有差异」→ 每次同步都推送。
      customFieldDefs: normalizeCustomFieldDefs(presets.customFieldDefs)
    }
  }

  function getLatestLocalModifiedAt() {
    const goodsStore = useGoodsStore()
    const rechargeStore = useRechargeStore()
    const eventsStore = useEventsStore()
    const goodsGroupStore = useGoodsGroupStore()
    const resolvedLocal = resolveGoodsTrashMaps(goodsStore.list, goodsStore.trashList)
    const recharge = rechargeStore.exportBackup({ includeDeleted: false, stripImage: false })
    const timestamps = [
      ...[...resolvedLocal.goodsMap.values()].map((item) => getItemTimestamp(item)),
      ...[...resolvedLocal.trashMap.values()].map((item) => getItemTimestamp(item)),
      ...recharge.map((item) => getItemTimestamp(item)),
      ...(eventsStore.list || []).map((item) => Number(item?.updatedAt) || 0),
      ...(goodsGroupStore.groupList || []).map((item) => Number(item?.updatedAt) || 0),
      ...(goodsGroupStore.groupItemList || []).map((item) => Number(item?.updatedAt) || 0)
      // batch_drafts 不计入：无 store 快照，避免 getLatestLocalModifiedAt 做异步 IO；
      // 草稿脏域走 dirtyDomains / forcePush，不依赖本水位线
    ]
    let latest = 0
    for (const ts of timestamps) { if (ts > latest) latest = ts }
    return latest > 0 ? new Date(latest).toISOString() : ''
  }

  function getLocalChangesSinceLastSync() {
    const localSyncTime = lastSyncedAt.value ? new Date(lastSyncedAt.value).getTime() : 0
    return conflictService.getLocalChangesSince(localSyncTime)
  }

  function buildSyncContext(runGen = syncGeneration) {
    activeBackend = getCurrentBackend()
    // 代际守卫：本轮同步开始后若发生超时重置 / 新一轮同步，代际号已变化，
    // 旧管道的关键落盘拒绝写入并抛错，尽早终止其后续阶段
    const gen = runGen
    const guarded = (fn) => async (...args) => {
      if (gen !== syncGeneration) throw new Error(STALE_SYNC_MESSAGE)
      return fn(...args)
    }
    return {
      backend: activeBackend,
      deviceId: deviceId.value,
      lastSyncedAt: lastSyncedAt.value, lastServerSyncedAt: lastServerSyncedAt.value, conflictData: conflictData.value,
      // reconcile 删除保护：脏标记中的条目是未推送的本地改动，拉取合并时不得物理删除；
      // 传 getter 让 reconcile 执行时刻读到实时集合（拉取在途期间新增的商品同样受保护）
      getDirtyGoodsIds: () => dirtyGoodsIds,
      saveLastSyncedAt: guarded(saveLastSyncedAt), saveEventLastSyncedAt: guarded(saveEventLastSyncedAt),
      saveLastServerSyncedAt: guarded(saveLastServerSyncedAt),
      pendingPush: pendingPush.value, savePendingPush: guarded(savePendingPush), clearPendingPush: guarded(clearPendingPush),
      saveImageCloudId: async () => {},
      saveMaintenanceMode: guarded((mode) => { maintenanceMode.value = mode }),
      getLatestLocalModifiedAt, buildPresetsData, ensureEventsStoreReady,
      shouldApplyRemoteItem
    }
  }

  // ── Init ──

  async function init() {
    await ensureEventsStoreReady()

    // 先恢复数据面端点偏好（主/备），再建 Supabase client，避免首连走错域名超时
    await loadEndpointPreference()

    const [
      lastSyncedAtVal, eventLastSyncedAtVal, deviceIdVal,
      syncBackendVal, supabaseUrlVal, supabaseAnonKeyVal, syncPausedVal,
      pendingPushVal, lastServerSyncedAtVal, schemaVersionVal
    ] = await Promise.all([
      readSyncKey(LAST_SYNC_KEY),
      readSyncKey(EVENT_LAST_SYNC_KEY), readOrCreateDeviceId(DEVICE_ID_KEY, generateDeviceId),
      readSyncKey(SYNC_BACKEND_KEY), readSyncKey(SUPABASE_URL_KEY), readSyncKey(SUPABASE_ANON_KEY_KEY),
      readSyncKey(SYNC_PAUSED_KEY),
      readSyncKey(PENDING_PUSH_KEY), readSyncKey(LAST_SERVER_SYNC_KEY), readSyncKey(SYNC_SCHEMA_VERSION_KEY)
    ])

    lastSyncedAt.value = lastSyncedAtVal || ''
    eventLastSyncedAt.value = eventLastSyncedAtVal || ''
    lastServerSyncedAt.value = lastServerSyncedAtVal || ''
    // 持久化版本缺失（新装或从无门控的旧版本升级）按 0 处理：一律 < 当前版本，
    // 首次同步做一次全量回填，把可能被旧版本丢弃的字段从云端补回
    schemaResyncPending.value = Number(schemaVersionVal || 0) < SYNC_SCHEMA_VERSION
    if (schemaResyncPending.value) {
      console.warn(`[sync] schema format version ${Number(schemaVersionVal || 0)} < ${SYNC_SCHEMA_VERSION}, will force full re-sync`)
    }
    deviceId.value = deviceIdVal
    syncBackend.value = syncBackendVal || 'supabase'
    supabaseUrl.value = supabaseUrlVal || ''
    supabaseAnonKey.value = supabaseAnonKeyVal || ''
    syncPaused.value = syncPausedVal === '1'
    // 恢复 crash-safe push 标记（上次推送可能在水位线保存前被中断）
    if (pendingPushVal) {
      try { pendingPush.value = JSON.parse(pendingPushVal) } catch { pendingPush.value = null }
    }

    if (syncBackend.value === 'supabase' && isSupabaseConfigured()) {
      try {
        if (supabaseUrl.value && supabaseAnonKey.value) {
          initSupabaseClient(supabaseUrl.value, supabaseAnonKey.value, { custom: true })
        }
      } catch (e) {
        console.warn('[sync] Supabase client init failed:', e.message)
      }
    }

    // Restore persisted dirty state (survives app restart)
    const [savedDirty, savedDirtyIds] = await Promise.all([
      readSyncKey(DIRTY_DOMAINS_KEY),
      readSyncKey(DIRTY_GOODS_IDS_KEY)
    ])
    if (savedDirty) {
      for (const d of savedDirty.split(',')) {
        if (d.trim()) dirtyDomains.add(d.trim())
      }
    }
    if (savedDirtyIds) {
      for (const id of savedDirtyIds.split(',')) {
        if (id.trim()) dirtyGoodsIds.add(id.trim())
      }
    }

    // 一次性清理：加密功能从未实装，删除历史版本双写的明文同步密码
    void removeSyncKey(LEGACY_SYNC_PASSWORD_KEY)
    void removeSyncKey(LEGACY_ENCRYPTION_ENABLED_KEY)

    isInitialized.value = true
  }

  // ── Auto-push (Realtime) ──

  const SYNC_TIMEOUT_MS = 3 * 60 * 1000 // 3 min safety net
  // 自动推送节流。原先 500ms 防抖且同步完成即立刻续跑，连续编辑/批量录入时
  // 同步首尾相接（每轮固定 5~6 次 HTTPS），射频长时间无法降档 → 手机发烫。
  //
  // 两个窗口配合，兼顾「快」和「不烧」：
  //   - 空闲后再改一条 → 1s 内推（跨设备验证时感觉得到）
  //   - 连续编辑       → 窗口内改动合并，稳态 5s 一轮
  // 稳态开销 ≤12 轮/分钟，且每轮经前奏节流后基本只剩 1 次推送请求（改前是 60+ 请求/分钟）。
  // 进后台时由 flushAutoPushNow() 立刻放行，不受这两个窗口约束。
  // 手动同步（设置里的同步按钮、长按拉取、批量流程的云端检查）同样始终全速。
  const AUTO_PUSH_DEBOUNCE_MS = 1 * 1000
  const AUTO_PUSH_MIN_GAP_MS = 5 * 1000
  // 每轮同步固定开销的节流窗口。这些值不需要每轮新鲜：心跳是设备存活上报，
  // 维护模式是兜底开关，设备强制重同步是管理员低频操作。分钟级节流可省掉大部分请求。
  const HEARTBEAT_MIN_INTERVAL_MS = 30 * 60 * 1000
  const MAINTENANCE_CHECK_MIN_INTERVAL_MS = 10 * 60 * 1000
  const DEVICE_RESYNC_CHECK_MIN_INTERVAL_MS = 5 * 60 * 1000
  let syncTimeoutId = null
  let autoPushTimer = null
  let pendingAutoPush = false
  let lastSyncStartedAt = 0
  let lastHeartbeatAt = 0
  let lastMaintenanceCheckAt = 0
  let lastDeviceResyncCheckAt = 0
  const DIRTY_DOMAINS_KEY = 'sync_dirty_domains'
  const DIRTY_GOODS_IDS_KEY = 'sync_dirty_goods_ids'
  const dirtyDomains = new Set()
  const dirtyGoodsIds = new Set()

  /**
   * 心跳上报（节流）。冷启动的 reportHeartbeat() 不受节流影响，保证设备存活可见。
   */
  function maybeHeartbeatDevice() {
    const now = Date.now()
    if (lastHeartbeatAt && now - lastHeartbeatAt < HEARTBEAT_MIN_INTERVAL_MS) return
    lastHeartbeatAt = now
    void heartbeatDevice()
  }

  /**
   * 预读 manifest 里的维护模式（节流）。维护模式是低频开关，
   * 10 分钟内复用上次结果即可，不必每轮同步都打一次 REST。
   */
  async function refreshMaintenanceMode() {
    const now = Date.now()
    if (lastMaintenanceCheckAt && now - lastMaintenanceCheckAt < MAINTENANCE_CHECK_MIN_INTERVAL_MS) return
    lastMaintenanceCheckAt = now
    try {
      const manifest = await activeBackend.readManifest()
      if (manifest?.maintenanceMode) {
        maintenanceMode.value = manifest.maintenanceMode
      }
    } catch (_) { /* 维护模式读取失败不影响同步 */ }
  }

  function markDomainDirty(domain) {
    if (domain) {
      dirtyDomains.add(domain)
      writeSyncKey(DIRTY_DOMAINS_KEY, [...dirtyDomains].join(','))
    }
  }

  function markGoodsIdsDirty(ids) {
    if (!ids) return
    const arr = Array.isArray(ids) ? ids : [ids]
    for (const id of arr) {
      if (id) dirtyGoodsIds.add(String(id))
    }
    writeSyncKey(DIRTY_GOODS_IDS_KEY, [...dirtyGoodsIds].join(','))
  }

  function consumeDirtyDomains() {
    if (dirtyDomains.size === 0) return null
    return new Set(dirtyDomains)
  }

  function clearDirtyDomains(consumed) {
    if (consumed) {
      for (const d of consumed) dirtyDomains.delete(d)
    } else if (dirtyDomains.size === 0) {
      dirtyDomains.clear()
    }
    writeSyncKey(DIRTY_DOMAINS_KEY, dirtyDomains.size > 0 ? [...dirtyDomains].join(',') : '')
  }

  function clearDirtyGoodsIds(consumed) {
    if (consumed) {
      for (const id of consumed) dirtyGoodsIds.delete(id)
    } else if (dirtyGoodsIds.size === 0) {
      dirtyGoodsIds.clear()
    }
    writeSyncKey(DIRTY_GOODS_IDS_KEY, dirtyGoodsIds.size > 0 ? [...dirtyGoodsIds].join(',') : '')
  }

  /**
   * 安排一次自动同步。同时受「防抖窗口」和「两轮自动同步最小间隔」约束：
   * - 已有定时器时不重置：窗口内的所有改动合并成同一轮（窗口内改两三次只推一轮，不丢）
   * - 距上轮同步不足最小间隔时顺延，避免刚推完又立刻开新的一轮
   * 结果：空闲后首次改动 1s 内推送；连续编辑时稳态 5s 一轮。
   */
  function scheduleAutoPush() {
    if (autoPushTimer) return
    const sinceLastSync = Date.now() - lastSyncStartedAt
    const delay = Math.max(AUTO_PUSH_DEBOUNCE_MS, AUTO_PUSH_MIN_GAP_MS - sinceLastSync)
    autoPushTimer = setTimeout(() => {
      autoPushTimer = null
      if (isPulling.value || isSyncing.value) {
        markPendingAutoPush()
        return
      }
      void runAutoSync()
    }, delay)
  }

  /**
   * 标记「有改动等待推送」并确保一定有一个定时器在跑。
   * 不能只置 pendingAutoPush：若某条同步路径的 finally 因代际过期被跳过，
   * 就会出现 pending 为真但没有任何定时器的死状态，改动要等下一次编辑才可能上去。
   */
  function markPendingAutoPush() {
    pendingAutoPush = true
    scheduleAutoPush()
  }

  async function runAutoSync() {
    lastSyncStartedAt = Date.now()
    try {
      await doSync({ source: 'auto' })
    } catch (error) {
      publishSyncNotice({
        source: 'auto',
        level: 'error',
        message: syncSuggestion.value || syncStatus.value || error?.message || i18n.global.t('sync.pullFailed', { error: '' })
      })
    }
  }

  function hasPendingLocalChanges() {
    return !!autoPushTimer || pendingAutoPush || dirtyDomains.size > 0 || dirtyGoodsIds.size > 0
  }

  /**
   * 立刻推送挂起的本地改动，忽略防抖/最小间隔窗口。
   * 用于「马上要进后台」这个最后时机：Android WebView 在后台会挂起定时器，
   * 落在 1~5s 窗口里的改动可能一直推不上去（切到另一台设备看就是「没同步」）。
   * 与 useBatchQueue 在 pagehide/visibilitychange 里 flushBatchDraft 是同一套时机。
   */
  function flushAutoPushNow() {
    if (!isSupabaseMode() || syncPaused.value) return
    if (!hasPendingLocalChanges()) return
    if (isPulling.value || isSyncing.value) {
      // 正在跑同步：交给它的 finally 续排（那里会调 flushPendingAutoPush）
      markPendingAutoPush()
      return
    }
    if (autoPushTimer) {
      clearTimeout(autoPushTimer)
      autoPushTimer = null
    }
    pendingAutoPush = false
    void runAutoSync()
  }

  function flushPendingAutoPush() {
    if (!pendingAutoPush) return
    if (isPulling.value || isSyncing.value) return

    pendingAutoPush = false
    scheduleAutoPush()
  }

  function autoPushGoods(domain) {
    if (!isSupabaseMode()) return
    markDomainDirty(domain)
    if (syncPaused.value) return
    if (isPulling.value || isSyncing.value) {
      markPendingAutoPush()
      return
    }

    scheduleAutoPush()
  }

  // 进后台/关页面前把挂起的推送放出去（应用生命周期内常驻，与 store 同生共死）
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => { flushAutoPushNow() })
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushAutoPushNow()
    })
  }

  async function setSyncPaused(paused) {
    const wasPaused = syncPaused.value
    syncPaused.value = !!paused
    await writeSyncKey(SYNC_PAUSED_KEY, paused ? '1' : '')
    if (wasPaused && !paused) {
      void doSync({ source: 'manual' })
    }
  }

  // ── Public API ──

  const STATUS_MESSAGES = {
    pulled: 'sync.pullComplete',
    pushed: 'sync.uploadComplete',
    no_changes: 'sync.dataUpToDate',
    conflict: 'sync.conflictDetected',
    cancelled: 'sync.pullCancelled'
  }

  function translateStatusMessage(result) {
    if (result?.forceResynced) {
      return i18n.global.t('sync.forceResyncComplete')
    }
    if (result.statusMessage) {
      return result.statusMessage.startsWith('sync.')
        ? i18n.global.t(result.statusMessage)
        : result.statusMessage
    }
    return i18n.global.t(STATUS_MESSAGES[result.action] || 'sync.syncing')
  }

  // 部分图片上传失败时提示用户（本地原图已保留，下次同步自动重试）
  function notifyImageUploadFailure(result, source) {
    if (result?.action !== 'pushed' || !(Number(result?.failedImages) > 0)) return
    publishSyncNotice({
      source,
      level: 'info',
      message: i18n.global.t('sync.imageUploadPartialFailed', { count: result.failedImages })
    })
  }

  // 图片上传失败的条目重新标脏，让下次同步自动重试上传
  function remarkFailedImageItems(result) {
    if (!Array.isArray(result?.failedImageItemIds) || result.failedImageItemIds.length === 0) return
    markGoodsIdsDirty(result.failedImageItemIds)
    markDomainDirty('goods')
  }

  function clearSyncTimeout() {
    if (syncTimeoutId) { clearTimeout(syncTimeoutId); syncTimeoutId = null }
  }

  function resetSyncingState() {
    clearSyncTimeout()
    // 超时/强制重置后旧管道可能仍在后台运行：bump 代际让其关键落盘被守卫拒绝
    syncGeneration++
    isSyncing.value = false
    isPulling.value = false
  }

  // ── 同步格式版本升级回填 ──
  // 旧版本拉取新版本推送的行时，白名单 normalize 会丢弃新字段并把水位线推进到这些行之后，
  // 升级后增量拉取不会重放它们（提示"数据最新"但字段缺失）。检测到格式版本升级时，
  // 先做一次全量重拉 + forceReapply（时间戳相等也应用远端行）回填，成功后固化当前版本；
  // 失败保留 pending，下次同步自动重试。此机制同时覆盖 APK 更新与 capgo OTA 更新：
  // 两者都会更新 JS bundle，SYNC_SCHEMA_VERSION 常量随之变化，而持久化版本存于 Preferences。
  async function runSchemaResync(runGen) {
    console.warn('[sync] schema format upgrade detected, running full re-sync to backfill fields')
    const result = await withRetry(
      () => orchestrator.pull(buildSyncContext(runGen), { silent: true, schemaResync: true }),
      { maxRetries: 1, baseDelay: 1200, onRetry: reconnectOnNetworkError }
    )
    schemaResyncPending.value = false
    await writeSyncKey(SYNC_SCHEMA_VERSION_KEY, String(SYNC_SCHEMA_VERSION))
    return result
  }

  // ── 设备心跳 ──
  // 每次同步上报一次设备存活（fire-and-forget，失败不影响同步）。
  // last_seen_at 由服务端触发器恒取 now()，客户端带 platform / apk_version / bundle_version。
  // 版本解析失败时取不到的值回退空串或 bundle 构建版本，不阻断心跳。
  async function resolveDeviceVersions() {
    let apkVersion = ''
    let bundleVersion = ''
    if (IS_NATIVE) {
      try {
        const info = await CapacitorApp.getInfo()
        apkVersion = normalizeVersionTag(info?.version) || ''
      } catch {}
      try {
        const bundleInfo = await CapacitorUpdater.current()
        bundleVersion = normalizeVersionTag(bundleInfo?.bundle?.version) || ''
      } catch {}
    }
    // web 或取不到 capgo bundle 时回退 JS bundle 构建版本
    if (!bundleVersion) bundleVersion = APP_VERSION
    return { apkVersion, bundleVersion }
  }

  async function heartbeatDevice() {
    try {
      if (!deviceId.value || typeof activeBackend?.writeDeviceHeartbeat !== 'function') return
      const { apkVersion, bundleVersion } = await resolveDeviceVersions()
      const { manufacturer, model } = await getDeviceInfo()
      await activeBackend.writeDeviceHeartbeat({
        platform: IS_NATIVE ? 'native' : 'web',
        apkVersion,
        bundleVersion,
        manufacturer,
        model
      })
    } catch (e) {
      console.warn('[sync] device heartbeat failed (non-fatal):', e?.message)
    }
  }

  // 冷启动心跳：应用启动时上报一次设备存活与当前版本（供 admin 设备管理页）。
  // fire-and-forget；未登录 / 未配置时静默跳过。
  function reportHeartbeat() {
    void heartbeatDevice()
  }

  // ── 管理员触发的设备级强制重同步 ──
  // 读 devices.force_resync_at，若比本地记住的「已处理」值新，走一次整量重拉
  // （复用 orchestrator.pull 的 schemaResync = 全量重拉 + forceReapply + 不弹冲突），
  // 成功后固化本地时间戳；失败保留，下次同步自动重试。
  // 返回拉取结果（执行过）或 false（无需执行）。
  async function maybeForceDeviceResync(runGen) {
    try {
      if (typeof activeBackend?.readDeviceRow !== 'function') return false
      // 管理员的强制重同步是低频人工操作，5 分钟内已查过就不必每轮同步再查一次
      const checkNow = Date.now()
      if (lastDeviceResyncCheckAt && checkNow - lastDeviceResyncCheckAt < DEVICE_RESYNC_CHECK_MIN_INTERVAL_MS) return false
      lastDeviceResyncCheckAt = checkNow
      const row = await activeBackend.readDeviceRow()
      const serverTs = row?.forceResyncAt || ''
      if (!serverTs) return false
      const lastProcessed = (await readSyncKey(DEVICE_FORCE_RESYNC_KEY)) || ''
      if (lastProcessed && new Date(serverTs).getTime() <= new Date(lastProcessed).getTime()) {
        // 本地已消费但服务端标记未清（如上次清理失败）：补清一次，让 admin 不再显示「待重同步」
        void activeBackend.clearDeviceForceResync(serverTs).catch(() => {})
        return false
      }
      console.warn('[sync] admin-triggered device force resync detected, running full re-pull')
      const result = await withRetry(
        () => orchestrator.pull(buildSyncContext(runGen), { silent: true, schemaResync: true }),
        { maxRetries: 1, baseDelay: 1200, onRetry: reconnectOnNetworkError }
      )
      await writeSyncKey(DEVICE_FORCE_RESYNC_KEY, serverTs)
      // 清掉服务端标记（仅清自己消费的那个值，避免误清更新的标记），让 admin「待重同步」随消费消失
      void activeBackend.clearDeviceForceResync(serverTs).catch(() => {})
      // 打标记：UI 据此显示明确的「强制重同步」文案，而不是普通拉取/数据最新
      return { ...result, forceResynced: true }
    } catch (e) {
      console.warn('[sync] device force resync failed (will retry next sync):', e?.message)
      return false
    }
  }

  async function reconnectOnNetworkError(error) {
    if (!isSupabaseMode()) return
    const msg = String(error?.message || '').toLowerCase()
    const isNetwork = msg.includes('network') || msg.includes('网络') || msg.includes('fetch') ||
      msg.includes('连接') || msg.includes('timeout') || msg.includes('超时') ||
      msg.includes('abort') || msg.includes('enotfound') || msg.includes('econnrefused') || msg.includes('econnreset')
    if (!isNetwork) return
    console.warn('[sync]', i18n.global.t('sync.error.networkReconnect'))
    await reconnectSupabase({ force: true })
  }

  async function doSync({ source = 'manual', maxRetries = 1 } = {}) {
    if (syncPaused.value && source !== 'manual') {
      log.info('sync paused, skipping auto sync (source:', source, ')')
      return { action: 'skipped', reason: 'paused' }
    }
    
    if (isSyncing.value) return { action: 'skipped', reason: 'syncing' }
    const authStore = useAuthStore()
    if (!authStore.isLoggedIn) {
      applySyncError(new Error(i18n.global.t('sync.error.loginRequired')), i18n.global.t('sync.error.loginRequiredStatus'))
      return { action: 'skipped', reason: 'not_logged_in' }
    }
    ensureBackendReady()

    // 同步前快探一次（5 分钟节流；网络错误走 force 立即探）：探测成功不会重建 client
    try { await reconnectSupabase() } catch { /* 探测失败交由管道重试处理 */ }

    // 先进入同步状态，让按钮立即给出加载反馈（转圈/禁用），再进行后续网络请求
    const runGen = ++syncGeneration
    lastSyncStartedAt = Date.now()
    syncSource.value = source
    isSyncing.value = true; lastError.value = ''; conflictData.value = null
    syncPhase.value = null; syncCause.value = null; syncSuggestion.value = null
    clearSyncLogs(); syncStatus.value = i18n.global.t('sync.syncing')

    clearSyncTimeout()
    syncTimeoutId = setTimeout(() => {
      console.warn('[sync] sync timeout (3 min), force reset isSyncing')
      resetSyncingState()
      applySyncError(new Error(i18n.global.t('sync.error.syncTimeout')), i18n.global.t('sync.error.syncTimeoutStatus'))
    }, SYNC_TIMEOUT_MS)

    try {
      // 换账号后必须先清掉旧账号的水位线 / pendingPush，再构建同步上下文
      await ensureSyncAccountConsistent()

      // 设备心跳上报（节流，fire-and-forget）
      maybeHeartbeatDevice()

      // 预读 manifest 缓存维护模式（节流；下面已检查过，orchestrator 不再重复拉一次）
      await refreshMaintenanceMode()

      // 检查维护模式
      if (isFeatureBlocked(maintenanceMode.value, FEATURE_KEYS.SYNC_ALL)) {
        const msg = maintenanceMode.value?.message || i18n.global.t('sync.error.maintenanceMode')
        applySyncError(new Error(msg), msg)
        if (source !== 'manual') {
          publishSyncNotice({ source, level: 'warning', message: msg })
        }
        return { action: 'skipped', reason: 'maintenance_mode' }
      }

      // 本地数据读库失败时拒绝推送，避免基于空列表覆盖云端备份
      const goodsStore = useGoodsStore()
      if (goodsStore.loadFailed) {
        const error = new Error(i18n.global.t('sync.error.localDataNotLoaded'))
        applySyncError(error, i18n.global.t('sync.error.localDataNotLoadedStatus'))
        if (source !== 'manual') {
          publishSyncNotice({ source, level: 'error', message: error.message })
        }
        return { action: 'skipped', reason: 'goods_load_failed' }
      }

      // 格式版本升级：先强制全量回填丢失字段，再走正常同步推送本地改动
      if (schemaResyncPending.value) {
        const resyncResult = await runSchemaResync(runGen)
        if (runGen !== syncGeneration) return resyncResult
      }

      // 管理员触发的设备级强制重同步：整量重拉一次，并直接用重拉结果作为本次同步反馈
      // （不再继续走正常同步，否则重拉刚拉到最新、随后的 sync 会报 no_changes「数据最新」，
      //  盖掉重拉的真实结果；未推送的本地改动留在脏标记，下次同步自动推送）
      const forcedResync = await maybeForceDeviceResync(runGen)
      if (runGen !== syncGeneration) return { action: 'skipped', reason: 'stale' }
      if (forcedResync) {
        syncStatus.value = translateStatusMessage(forcedResync)
        return forcedResync
      }

      const domains = consumeDirtyDomains()
      const goodsIds = dirtyGoodsIds.size > 0 ? new Set(dirtyGoodsIds) : null
      const result = await withRetry(
        () => orchestrator.sync(buildSyncContext(runGen), { dirtyDomains: domains, dirtyGoodsIds: goodsIds, maintenanceChecked: true }),
        { maxRetries, baseDelay: 1200, onRetry: reconnectOnNetworkError }
      )
      // 代际过期（超时重置已接管 UI）：跳过状态更新与脏标记清理，避免与新一轮同步互相覆盖
      if (runGen !== syncGeneration) return result
      if (result.conflictData) conflictData.value = result.conflictData
      syncStatus.value = translateStatusMessage(result)
      notifyImageUploadFailure(result, source)
      // 脏标记只在真正推送成功后清理：
      // - conflict / pulled / no_changes：本地改动可能仍未上云，必须保留
      // - pulledFirst：拉取后只补推了草稿，goods 脏标记同样要保留
      const didPush = result?.action === 'pushed' && !result?.pulledFirst
      if (didPush) {
        clearDirtyDomains(domains)
        clearDirtyGoodsIds(goodsIds)
      } else if (result?.pulledFirst && domains?.has('batchDrafts')) {
        clearDirtyDomains(new Set(['batchDrafts']))
      }
      remarkFailedImageItems(result)
      return result
    } catch (error) {
      // 代际过期的旧管道静默退出：超时错误已展示，脏标记未清、下次同步自动重试
      if (error?.message === STALE_SYNC_MESSAGE || runGen !== syncGeneration) {
        return { action: 'skipped', reason: 'stale' }
      }
      applySyncError(error, i18n.global.t('sync.pullFailed', { error: '' }))
      if (source !== 'manual') {
        publishSyncNotice({
          source,
          level: 'error',
          message: syncSuggestion.value || syncStatus.value || error?.message || i18n.global.t('sync.pullFailed', { error: '' })
        })
      }
      throw error
    } finally {
      // 代际过期时超时重置已恢复 UI，且计时器/状态可能已属于新一轮同步，不得触碰
      if (runGen === syncGeneration) {
        clearSyncTimeout()
        isSyncing.value = false
        flushPendingAutoPush()
      }
    }
  }

  async function sync(opts = {}) {
    return doSync(opts)
  }

  async function pull({ tables, since, silent = false, source = 'manual', maxRetries = 1, forceRecharge = false, forceFull = false } = {}) {
    if (syncPaused.value && source !== 'manual') {
      log.info('pull paused, skipping auto pull (source:', source, ')')
      return { action: 'skipped', reason: 'paused' }
    }

    const isIncremental = !!(tables && since > 0)

    if (isIncremental) {
      if (isSyncing.value || isPulling.value) {
        return { action: 'skipped', reason: 'syncing' }
      }
    } else if (isSyncing.value) {
      return { action: 'skipped', reason: 'syncing' }
    }

    const authStore = useAuthStore()
    if (!authStore.isLoggedIn) {
      if (!silent) {
        applySyncError(new Error(i18n.global.t('sync.error.loginRequired')), i18n.global.t('sync.error.loginRequiredStatus'))
      }
      return { action: 'skipped', reason: 'not_logged_in' }
    }
    ensureBackendReady()

    // 拉取前同样快探（共用 10s 节流）：启动自动 pull 不再先撞主站黑洞
    try { await reconnectSupabase() } catch { /* 探测失败交由管道重试处理 */ }

    // 先进入同步状态，让按钮立即给出加载反馈（转圈/禁用），再进行后续网络请求
    const runGen = ++syncGeneration
    lastSyncStartedAt = Date.now()
    syncSource.value = source
    isSyncing.value = true; isPulling.value = true
    lastError.value = ''
    if (!silent) conflictData.value = null
    syncPhase.value = null; syncCause.value = null; syncSuggestion.value = null
    clearSyncLogs(); syncStatus.value = i18n.global.t('sync.syncing')

    clearSyncTimeout()
    syncTimeoutId = setTimeout(() => {
      console.warn('[sync] pull timeout (3 min), force reset')
      resetSyncingState()
      applySyncError(new Error(i18n.global.t('sync.error.pullTimeout')), i18n.global.t('sync.error.pullTimeoutStatus'))
    }, SYNC_TIMEOUT_MS)

    try {
      // 账号切换后调用方传入的 since 属旧账号水位线：跳过本次增量拉取，
      // 水位线已被清空，下一次完整同步会走完整对比 + 冲突确认流程
      const switched = await ensureSyncAccountConsistent()
      if (isIncremental && switched) {
        return { action: 'skipped', reason: 'account_switched' }
      }

      // 设备心跳上报（节流，fire-and-forget）
      maybeHeartbeatDevice()

      // 预读 manifest 缓存维护模式（节流）
      await refreshMaintenanceMode()

      // 检查维护模式
      if (isFeatureBlocked(maintenanceMode.value, FEATURE_KEYS.SYNC_ALL)) {
        const msg = maintenanceMode.value?.message || i18n.global.t('sync.error.maintenanceMode')
        if (!silent) {
          applySyncError(new Error(msg), msg)
          publishSyncNotice({ source, level: 'warning', message: msg })
        }
        return { action: 'skipped', reason: 'maintenance_mode' }
      }

      // 用户主动触发的强制全量同步（长按拉取）：强制对齐云端——
      // 远端行无条件覆盖本地（含本地较新的未推送改动），不弹冲突。本地独有行不会被删除。
      if (forceFull) {
        const result = await withRetry(
          () => orchestrator.pull(buildSyncContext(runGen), { silent: true, forceAlign: true }),
          { maxRetries, baseDelay: 1200, onRetry: reconnectOnNetworkError }
        )
        if (runGen !== syncGeneration) return result
        syncStatus.value = translateStatusMessage(result)
        return result
      }

      // 格式版本升级：全量回填优先于本次增量拉取
      if (schemaResyncPending.value) {
        const resyncResult = await runSchemaResync(runGen)
        if (runGen !== syncGeneration) return resyncResult
        syncStatus.value = translateStatusMessage(resyncResult)
        return resyncResult
      }

      // 管理员触发的设备级强制重同步：整量重拉一次，已覆盖本次拉取请求
      const forcedResync = await maybeForceDeviceResync(runGen)
      if (runGen !== syncGeneration) return { action: 'skipped', reason: 'stale' }
      if (forcedResync) {
        syncStatus.value = translateStatusMessage(forcedResync)
        return forcedResync
      }

      if (isIncremental) {
        try {
          const result = await orchestrator.pull(buildSyncContext(runGen), { tables, since })
          // 代际过期（超时重置已接管 UI）：跳过状态更新
          if (runGen !== syncGeneration) return result
          syncStatus.value = translateStatusMessage(result)
          return result
        } catch (error) {
          if (error?.message === STALE_SYNC_MESSAGE || runGen !== syncGeneration) {
            return { action: 'skipped', reason: 'stale' }
          }
          console.warn('[sync] incremental pull failed, falling back to full pull:', error.message)
          try {
            const result = await withRetry(
              () => orchestrator.pull(buildSyncContext(runGen), { silent: true }),
              { maxRetries, baseDelay: 1200, onRetry: reconnectOnNetworkError }
            )
            syncStatus.value = translateStatusMessage(result)
            return result
          } catch (fallbackError) {
            applySyncError(fallbackError, i18n.global.t('sync.pullFailed', { error: '' }))
            throw fallbackError
          }
        }
      }

      // Full pull
      const result = await withRetry(
        () => orchestrator.pull(buildSyncContext(runGen), { silent, forceRecharge }),
        { maxRetries, baseDelay: 1200, onRetry: reconnectOnNetworkError }
      )
      // 代际过期（超时重置已接管 UI）：跳过状态更新，避免与新一轮同步互相覆盖
      if (runGen !== syncGeneration) return result
      if (!silent && result.conflictData) conflictData.value = result.conflictData
      syncStatus.value = translateStatusMessage(result)
      return result
    } catch (error) {
      // 代际过期的旧管道静默退出：超时错误已展示
      if (error?.message === STALE_SYNC_MESSAGE || runGen !== syncGeneration) {
        return { action: 'skipped', reason: 'stale' }
      }
      applySyncError(error, i18n.global.t('sync.pullFailed', { error: '' }))
      if (source !== 'manual') {
        publishSyncNotice({
          source,
          level: 'error',
          message: syncSuggestion.value || syncStatus.value || error?.message || i18n.global.t('sync.pullFailed', { error: '' })
        })
      }
      throw error
    } finally {
      // 代际过期时计时器/状态可能已属于新一轮同步，不得触碰
      if (runGen === syncGeneration) {
        clearSyncTimeout()
        isPulling.value = false
        isSyncing.value = false
        flushPendingAutoPush()
      }
    }
  }

  async function resolveConflict(useRemote, { source = 'manual', maxRetries = 1 } = {}) {
    if (!conflictData.value) return
    const runGen = ++syncGeneration
    isSyncing.value = true; syncStatus.value = i18n.global.t('sync.syncing')
    syncPhase.value = null; syncCause.value = null; syncSuggestion.value = null
    try {
      // "保留本地"会强制推送，读库失败时同样拒绝，避免覆盖云端备份
      if (!useRemote && useGoodsStore().loadFailed) {
        const error = new Error(i18n.global.t('sync.error.localDataNotLoaded'))
        applySyncError(error, i18n.global.t('sync.error.localDataNotLoadedStatus'))
        return { action: 'skipped', reason: 'goods_load_failed' }
      }
      const ctx = { ...buildSyncContext(runGen), conflictData: conflictData.value }
      const result = await withRetry(
        () => orchestrator.resolveConflict(ctx, useRemote),
        { maxRetries, baseDelay: 1200, onRetry: reconnectOnNetworkError }
      )
      conflictData.value = null
      syncStatus.value = translateStatusMessage(result)
      notifyImageUploadFailure(result, source)
      remarkFailedImageItems(result)
      return result
    } catch (error) {
      applySyncError(error, i18n.global.t('sync.pullFailed', { error: '' }))
      if (source !== 'manual') {
        publishSyncNotice({
          source,
          level: 'error',
          message: syncSuggestion.value || syncStatus.value || error?.message || i18n.global.t('sync.pullFailed', { error: '' })
        })
      }
      throw error
    } finally {
      // bump 代际会让在途增量拉取的 finally 视自己为过期代际而跳过复位，
      // 由本入口统一恢复全部 UI 标志与计时器，避免 isPulling 永久卡死
      if (runGen === syncGeneration) {
        clearSyncTimeout()
        isSyncing.value = false
        isPulling.value = false
        flushPendingAutoPush()
      }
    }
  }

  async function resolvePullConflict(confirm, { source = 'manual', maxRetries = 1 } = {}) {
    if (!conflictData.value?.isPullOnly) return
    const runGen = ++syncGeneration
    isSyncing.value = true; syncStatus.value = i18n.global.t('sync.syncing')
    syncPhase.value = null; syncCause.value = null; syncSuggestion.value = null
    try {
      if (!confirm) { syncStatus.value = i18n.global.t('toast.cancelled'); conflictData.value = null; return { action: 'cancelled' } }
      const ctx = { ...buildSyncContext(runGen), conflictData: conflictData.value }
      const result = await withRetry(
        () => orchestrator.resolvePullConflict(ctx, confirm),
        { maxRetries, baseDelay: 1200, onRetry: reconnectOnNetworkError }
      )
      conflictData.value = null
      syncStatus.value = translateStatusMessage(result)
      return result
    } catch (error) {
      applySyncError(error, i18n.global.t('sync.pullFailed', { error: '' }))
      if (source !== 'manual') {
        publishSyncNotice({
          source,
          level: 'error',
          message: syncSuggestion.value || syncStatus.value || error?.message || i18n.global.t('sync.pullFailed', { error: '' })
        })
      }
      throw error
    } finally {
      // 同 resolveConflict：bump 代际者负责恢复全部 UI 标志
      if (runGen === syncGeneration) {
        clearSyncTimeout()
        isSyncing.value = false
        isPulling.value = false
        flushPendingAutoPush()
      }
    }
  }

  function clearConflict() {
    conflictData.value = null
  }

  async function resetConfig() {
    lastSyncedAt.value = ''; eventLastSyncedAt.value = ''; lastServerSyncedAt.value = ''
    pendingPush.value = null
    await Promise.all([
      writeSyncKey(LAST_SYNC_KEY, ''), writeSyncKey(EVENT_LAST_SYNC_KEY, ''),
      writeSyncKey(LAST_SERVER_SYNC_KEY, ''), writeSyncKey(PENDING_PUSH_KEY, '')
    ])
    lastError.value = ''; syncStatus.value = ''; conflictData.value = null
    syncPhase.value = null; syncCause.value = null; syncSuggestion.value = null
    clearSyncLogs()
  }

  // 手动刷新维护模式状态：直查 sync_manifest（readManifest 内部已带重试），不触发完整同步。
  // 读到 null（管理员已解除维护）时同样清除缓存，避免横幅滞留。
  async function refreshMaintenanceMode() {
    try {
      const backend = getCurrentBackend()
      if (!backend?.readManifest) return { ok: false }
      const manifest = await backend.readManifest()
      maintenanceMode.value = manifest?.maintenanceMode || null
      return { ok: true, enabled: !!maintenanceMode.value?.enabled }
    } catch (error) {
      console.warn('[sync] refresh maintenance mode failed:', error)
      return { ok: false, error }
    }
  }

  return {
    lastSyncedAt, eventLastSyncedAt, deviceId,
    isInitialized, isSyncing, isPulling, syncStatus, syncLogs, lastError, syncPhase, syncCause, syncSuggestion, syncNotice, conflictData, syncSource,
    schemaResyncPending,
    isConfigured, init,
    getLocalChangesSinceLastSync, sync, pull, resolveConflict, resolvePullConflict,
    autoPushGoods, markGoodsIdsDirty,
    clearConflict, resetConfig,
    syncBackend, supabaseUrl, supabaseAnonKey,
    saveSupabaseConfig, setSyncBackend, testSupabaseConnection, isSupabaseMode,
    syncPaused, setSyncPaused, flushAutoPushNow,
    restoreImageFromCloud,
    getPublicImageURL,
    maintenanceMode,
    refreshMaintenanceMode,
    reportHeartbeat
  }
})
