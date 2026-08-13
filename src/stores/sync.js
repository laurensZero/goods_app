import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import { useGoodsStore } from './goods'
import { useEventsStore } from './events'
import { usePresetsStore, normalizeCharacterName } from './presets'
import { useRechargeStore } from '@/stores/recharge'
import { useGoodsGroupStore } from '@/stores/goodsGroup'
import { useAuthStore } from '@/stores/auth'
import { useSyncLogger } from '@/composables/sync/useSyncLogger'
import { createSyncConflictService } from '@/services/syncConflictService'
import { createSyncOrchestrator } from '@/services/syncOrchestrator'
import { createSupabaseBackendAdapter } from '@/services/supabaseAdapter/index'
import { createSyncImageService } from '@/services/syncImageService'
import { createSyncPayloadService } from '@/services/syncPayloadService'
import { withRetry } from '@/services/syncRetry'
import { getItemTimestamp, resolveGoodsTrashMaps } from '@/utils/sync/shared'
import { readOrCreateDeviceId, readSyncKey, writeSyncKey, removeSyncKey } from '@/utils/sync/storage'
import { SyncError, buildSyncErrorStatus } from '@/services/syncError'
import { initSupabaseClient, testSupabaseConnection, reconnectSupabase, isSupabaseConfigured } from '@/utils/sync/supabaseClient'
import { readLocalImageAsDataUrl } from '@/utils/image/localImage'
import { compressImageToBlob } from '@/composables/image/useImageExport'
import { isFeatureBlocked, FEATURE_KEYS } from '@/services/maintenanceModeService'
import i18n from '@/locales'
import {
  IMAGE_FILE_PREFIX,
  EVENT_COVER_PREFIX,
  EVENT_PHOTO_PREFIX,
  RECHARGE_IMAGE_PREFIX,
  IMAGE_FILE_SIZE_LIMIT,
  SYNC_SCHEMA_VERSION
} from '@/constants/syncConstants'
import packageJson from '../../package.json'
import { normalizeVersionTag } from '@/utils/github/release'

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
      initSupabaseClient(url, anonKey)
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
          try { initSupabaseClient(supabaseUrl.value, supabaseAnonKey.value) } catch (e) { console.warn('[sync] initSupabaseClient failed on setSyncBackend:', e.message) }
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
        initSupabaseClient(supabaseUrl.value, supabaseAnonKey.value)
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

  const {
    buildSyncPayload, buildSyncData, buildRechargeSyncData,
    buildEventSyncPayload, buildEventSyncData,
    buildComparableSyncStateFromData, buildComparableRechargeStateFromData,
    buildComparableEventStateFromData, buildManifest
  } = createSyncPayloadService({
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
    rechargeImagePrefix: RECHARGE_IMAGE_PREFIX
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
    buildRechargeSyncData, buildEventSyncData, getLatestLocalModifiedAt
  })

  const payloadService = {
    buildSyncPayload, buildRechargeSyncData, buildEventSyncPayload, buildManifest,
    buildSyncData, buildEventSyncData,
    buildComparableSyncStateFromData, buildComparableRechargeStateFromData, buildComparableEventStateFromData
  }

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
      }))
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
          initSupabaseClient(supabaseUrl.value, supabaseAnonKey.value)
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
  let syncTimeoutId = null
  let autoPushTimer = null
  let pendingAutoPush = false
  const DIRTY_DOMAINS_KEY = 'sync_dirty_domains'
  const DIRTY_GOODS_IDS_KEY = 'sync_dirty_goods_ids'
  const dirtyDomains = new Set()
  const dirtyGoodsIds = new Set()

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

  function flushPendingAutoPush() {
    if (!pendingAutoPush) return
    if (isPulling.value || isSyncing.value) return

    pendingAutoPush = false
    if (autoPushTimer) {
      clearTimeout(autoPushTimer)
      autoPushTimer = null
    }

    autoPushTimer = setTimeout(() => {
      autoPushTimer = null
      if (!isPulling.value && !isSyncing.value) {
        void doSync({ source: 'auto' })
      }
    }, 0)
  }

  function autoPushGoods(domain) {
    if (!isSupabaseMode()) return
    markDomainDirty(domain)
    if (syncPaused.value) return
    if (isPulling.value || isSyncing.value) {
      pendingAutoPush = true
      return
    }

    const debounceMs = 500

    if (autoPushTimer) clearTimeout(autoPushTimer)
    autoPushTimer = setTimeout(async () => {
      autoPushTimer = null
      try {
        await doSync({ source: 'auto' })
      } catch (error) {
        publishSyncNotice({
          source: 'auto',
          level: 'error',
          message: syncSuggestion.value || syncStatus.value || error?.message || i18n.global.t('sync.pullFailed', { error: '' })
        })
      }
    }, debounceMs)
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
      await activeBackend.writeDeviceHeartbeat({
        platform: IS_NATIVE ? 'native' : 'web',
        apkVersion,
        bundleVersion
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
      msg.includes('连接') || msg.includes('enotfound') || msg.includes('econnrefused') || msg.includes('econnreset')
    if (!isNetwork) return
    console.warn('[sync]', i18n.global.t('sync.error.networkReconnect'))
    await reconnectSupabase()
  }

  async function doSync({ source = 'manual', maxRetries = 1 } = {}) {
    if (syncPaused.value && source !== 'manual') {
      console.log('[sync] sync paused, skipping auto sync (source:', source, ')')
      return { action: 'skipped', reason: 'paused' }
    }
    
    if (isSyncing.value) return { action: 'skipped', reason: 'syncing' }
    const authStore = useAuthStore()
    if (!authStore.isLoggedIn) {
      applySyncError(new Error(i18n.global.t('sync.error.loginRequired')), i18n.global.t('sync.error.loginRequiredStatus'))
      return { action: 'skipped', reason: 'not_logged_in' }
    }
    ensureBackendReady()

    // 先进入同步状态，让按钮立即给出加载反馈（转圈/禁用），再进行后续网络请求
    const runGen = ++syncGeneration
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

      // 设备心跳上报（fire-and-forget）
      void heartbeatDevice()

      // 预读 manifest 缓存维护模式，确保后续检查有效（覆盖首次同步缓存为空的情况）
      try {
        const manifest = await activeBackend.readManifest()
        if (manifest?.maintenanceMode) {
          maintenanceMode.value = manifest.maintenanceMode
        }
      } catch (_) {}

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
        () => orchestrator.sync(buildSyncContext(runGen), { dirtyDomains: domains, dirtyGoodsIds: goodsIds }),
        { maxRetries, baseDelay: 1200, onRetry: reconnectOnNetworkError }
      )
      // 代际过期（超时重置已接管 UI）：跳过状态更新与脏标记清理，避免与新一轮同步互相覆盖
      if (runGen !== syncGeneration) return result
      if (result.conflictData) conflictData.value = result.conflictData
      syncStatus.value = translateStatusMessage(result)
      notifyImageUploadFailure(result, source)
      clearDirtyDomains(domains)
      clearDirtyGoodsIds(goodsIds)
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

  async function pull({ tables, since, silent = false, source = 'manual', maxRetries = 1, forceRecharge = false } = {}) {
    if (syncPaused.value && source !== 'manual') {
      console.log('[sync] pull paused, skipping auto pull (source:', source, ')')
      return { action: 'skipped', reason: 'paused' }
    }

    const isIncremental = tables && since > 0

    if (isIncremental) {
      if (isSyncing.value || isPulling.value) return
    } else if (isSyncing.value) {
      return
    }

    const authStore = useAuthStore()
    if (!authStore.isLoggedIn) {
      if (!silent) {
        applySyncError(new Error(i18n.global.t('sync.error.loginRequired')), i18n.global.t('sync.error.loginRequiredStatus'))
      }
      return { action: 'skipped', reason: 'not_logged_in' }
    }
    ensureBackendReady()

    // 先进入同步状态，让按钮立即给出加载反馈（转圈/禁用），再进行后续网络请求
    const runGen = ++syncGeneration
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

      // 设备心跳上报（fire-and-forget）
      void heartbeatDevice()

      // 预读 manifest 缓存维护模式
      try {
        const manifest = await activeBackend.readManifest()
        if (manifest?.maintenanceMode) {
          maintenanceMode.value = manifest.maintenanceMode
        }
      } catch (_) {}

      // 检查维护模式
      if (isFeatureBlocked(maintenanceMode.value, FEATURE_KEYS.SYNC_ALL)) {
        const msg = maintenanceMode.value?.message || i18n.global.t('sync.error.maintenanceMode')
        if (!silent) {
          applySyncError(new Error(msg), msg)
          publishSyncNotice({ source, level: 'warning', message: msg })
        }
        return { action: 'skipped', reason: 'maintenance_mode' }
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
    syncPaused, setSyncPaused,
    restoreImageFromCloud,
    maintenanceMode,
    reportHeartbeat
  }
})
