import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { Capacitor } from '@capacitor/core'
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
import { readOrCreateDeviceId, readSyncKey, writeSyncKey } from '@/utils/sync/storage'
import { SyncError, buildSyncErrorStatus } from '@/services/syncError'
import { initSupabaseClient, testSupabaseConnection, clearSupabaseClient, reconnectSupabase, isSupabaseConfigured } from '@/utils/sync/supabaseClient'
import { deriveKey, isWebCryptoAvailable } from '@/utils/sync/cryptoManager'
import { readLocalImageAsDataUrl } from '@/utils/image/localImage'
import { compressImageToBlob } from '@/composables/image/useImageExport'
import i18n from '@/locales'
import {
  DATA_FILENAME,
  RECHARGE_DATA_FILENAME,
  EVENT_DATA_FILENAME,
  MANIFEST_FILENAME,
  IMAGE_FILE_PREFIX,
  EVENT_COVER_PREFIX,
  EVENT_PHOTO_PREFIX,
  IMAGE_FILE_SIZE_LIMIT
} from '@/constants/syncConstants'

const LAST_SYNC_KEY = 'sync_last_synced_at'
const EVENT_LAST_SYNC_KEY = 'sync_event_last_synced_at'
const SYNC_PASSWORD_KEY = 'sync_password'
const DEVICE_ID_KEY = Capacitor.isNativePlatform() ? 'sync_native_device_id' : 'sync_web_device_id'
const ENCRYPTION_ENABLED_KEY = 'sync_encryption_enabled'
const SUPABASE_URL_KEY = 'sync_supabase_url'
const SUPABASE_ANON_KEY_KEY = 'sync_supabase_anon_key'
const SYNC_BACKEND_KEY = 'sync_backend'
const SYNC_PAUSED_KEY = 'sync_paused'

const IS_NATIVE = Capacitor.isNativePlatform()

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

  // ── Device & Encryption ──
  const deviceId = ref('')
  const encryptionEnabled = ref(false)
  const encryptionKey = ref(null)
  const syncPassword = ref('')

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

  async function setEncryptionEnabled(enabled) {
    encryptionEnabled.value = !!enabled
    await writeSyncKey(ENCRYPTION_ENABLED_KEY, enabled ? '1' : '')
    if (!enabled) encryptionKey.value = null
  }

  async function setSyncPassword(password) {
    syncPassword.value = password
    await writeSyncKey(SYNC_PASSWORD_KEY, password)
    encryptionKey.value = null
  }

  async function ensureEncryptionKey() {
    if (encryptionKey.value) return encryptionKey.value
    const authStore = useAuthStore()
    const userId = authStore.user?.id || ''
    if (!syncPassword.value || !userId) return null
    if (!isWebCryptoAvailable()) return null
    encryptionKey.value = await deriveKey(syncPassword.value, userId)
    return encryptionKey.value
  }

  function clearEncryptionKey() {
    encryptionKey.value = null
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
    deviceIdRef: deviceId, imageGistIdRef: ref(''), lastSyncedAtRef: lastSyncedAt,
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
    eventPhotoPrefix: EVENT_PHOTO_PREFIX
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
    getExistingRechargeGist: () => activeBackend.getExistingRechargeGist(),
    getExistingEventGist: () => activeBackend.getExistingEventGist(),
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
    constants: { DATA_FILENAME, RECHARGE_DATA_FILENAME, EVENT_DATA_FILENAME, MANIFEST_FILENAME },
    userIdRef: () => { const authStore = useAuthStore(); return authStore.user?.id || '' }
  })

  async function restoreImageFromCloud(gistFileName) {
    const name = String(gistFileName || '').trim()
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
    const recharge = rechargeStore.exportBackup({ includeDeleted: false, stripImage: true })
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

  function buildSyncContext() {
    activeBackend = getCurrentBackend()
    return {
      backend: activeBackend,
      deviceId: deviceId.value,
      lastSyncedAt: lastSyncedAt.value, conflictData: conflictData.value,
      saveLastSyncedAt, saveEventLastSyncedAt,
      saveImageGistId: async () => {},
      saveRechargeGistId: async () => {},
      saveEventGistId: async () => {},
      rechargeGistId: '', eventGistId: '',
      getLatestLocalModifiedAt, buildPresetsData, ensureEventsStoreReady,
      shouldApplyRemoteItem
    }
  }

  // ── Init ──

  async function init() {
    await ensureEventsStoreReady()

    const [passwordVal,
      lastSyncedAtVal, eventLastSyncedAtVal, deviceIdVal, encryptionEnabledVal,
      syncBackendVal, supabaseUrlVal, supabaseAnonKeyVal, syncPausedVal
    ] = await Promise.all([
      readSyncKey(SYNC_PASSWORD_KEY), readSyncKey(LAST_SYNC_KEY),
      readSyncKey(EVENT_LAST_SYNC_KEY), readOrCreateDeviceId(DEVICE_ID_KEY, generateDeviceId),
      readSyncKey(ENCRYPTION_ENABLED_KEY),
      readSyncKey(SYNC_BACKEND_KEY), readSyncKey(SUPABASE_URL_KEY), readSyncKey(SUPABASE_ANON_KEY_KEY),
      readSyncKey(SYNC_PAUSED_KEY)
    ])

    syncPassword.value = passwordVal || ''
    lastSyncedAt.value = lastSyncedAtVal || ''
    eventLastSyncedAt.value = eventLastSyncedAtVal || ''
    deviceId.value = deviceIdVal
    encryptionEnabled.value = encryptionEnabledVal === '1'
    syncBackend.value = syncBackendVal || 'supabase'
    supabaseUrl.value = supabaseUrlVal || ''
    supabaseAnonKey.value = supabaseAnonKeyVal || ''
    syncPaused.value = syncPausedVal === '1'

    if (syncBackend.value === 'supabase' && isSupabaseConfigured()) {
      try {
        if (supabaseUrl.value && supabaseAnonKey.value) {
          initSupabaseClient(supabaseUrl.value, supabaseAnonKey.value)
        }
      } catch (e) {
        console.warn('[sync] Supabase client init failed:', e.message)
      }
    }

    if (encryptionEnabled.value && syncPassword.value) {
      try { await ensureEncryptionKey() } catch { encryptionEnabled.value = false }
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
    if (result.statusMessage) {
      return result.statusMessage.startsWith('sync.')
        ? i18n.global.t(result.statusMessage)
        : result.statusMessage
    }
    return i18n.global.t(STATUS_MESSAGES[result.action] || 'sync.syncing')
  }

  function clearSyncTimeout() {
    if (syncTimeoutId) { clearTimeout(syncTimeoutId); syncTimeoutId = null }
  }

  function resetSyncingState() {
    clearSyncTimeout()
    isSyncing.value = false
    isPulling.value = false
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
      const domains = consumeDirtyDomains()
      const goodsIds = dirtyGoodsIds.size > 0 ? new Set(dirtyGoodsIds) : null
      const result = await withRetry(
        () => orchestrator.sync(buildSyncContext(), { dirtyDomains: domains, dirtyGoodsIds: goodsIds }),
        { maxRetries, baseDelay: 1200, onRetry: reconnectOnNetworkError }
      )
      if (result.conflictData) conflictData.value = result.conflictData
      syncStatus.value = translateStatusMessage(result)
      clearDirtyDomains(domains)
      clearDirtyGoodsIds(goodsIds)
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
      clearSyncTimeout()
      isSyncing.value = false
      flushPendingAutoPush()
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
      const authStore = useAuthStore()
      if (!authStore.isLoggedIn) return { action: 'skipped', reason: 'not_logged_in' }
      ensureBackendReady()
      isSyncing.value = true; isPulling.value = true
      syncSource.value = source

      try {
        const result = await orchestrator.pull(buildSyncContext(), { tables, since })
        return result
      } catch (error) {
        console.warn('[sync] incremental pull failed, falling back to full pull:', error.message)
        try {
          const result = await withRetry(
            () => orchestrator.pull(buildSyncContext(), { silent: true }),
            { maxRetries, baseDelay: 1200, onRetry: reconnectOnNetworkError }
          )
          syncStatus.value = translateStatusMessage(result)
          return result
        } catch (fallbackError) {
          applySyncError(fallbackError, i18n.global.t('sync.pullFailed', { error: '' }))
          throw fallbackError
        }
      } finally {
        isPulling.value = false; isSyncing.value = false
      }
    }

    // Full pull
    if (isSyncing.value) return
    const authStore = useAuthStore()
    if (!authStore.isLoggedIn) {
      if (!silent) applySyncError(new Error(i18n.global.t('sync.error.loginRequired')), i18n.global.t('sync.error.loginRequiredStatus'))
      return { action: 'skipped', reason: 'not_logged_in' }
    }
    ensureBackendReady()
    syncSource.value = source
    isSyncing.value = true; isPulling.value = true; lastError.value = ''
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
      const result = await withRetry(
        () => orchestrator.pull(buildSyncContext(), { silent, forceRecharge }),
        { maxRetries, baseDelay: 1200, onRetry: reconnectOnNetworkError }
      )
      if (!silent && result.conflictData) conflictData.value = result.conflictData
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
      clearSyncTimeout()
      isPulling.value = false
      isSyncing.value = false
      flushPendingAutoPush()
    }
  }

  async function resolveConflict(useRemote, { source = 'manual', maxRetries = 1 } = {}) {
    if (!conflictData.value) return
    isSyncing.value = true; syncStatus.value = i18n.global.t('sync.syncing')
    syncPhase.value = null; syncCause.value = null; syncSuggestion.value = null
    try {
      const ctx = { ...buildSyncContext(), conflictData: conflictData.value }
      const result = await withRetry(
        () => orchestrator.resolveConflict(ctx, useRemote),
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
      isSyncing.value = false
      flushPendingAutoPush()
    }
  }

  async function resolvePullConflict(confirm, { source = 'manual', maxRetries = 1 } = {}) {
    if (!conflictData.value?.isPullOnly) return
    isSyncing.value = true; syncStatus.value = i18n.global.t('sync.syncing')
    syncPhase.value = null; syncCause.value = null; syncSuggestion.value = null
    try {
      if (!confirm) { syncStatus.value = i18n.global.t('toast.cancelled'); conflictData.value = null; return { action: 'cancelled' } }
      const ctx = { ...buildSyncContext(), conflictData: conflictData.value }
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
      isSyncing.value = false
      flushPendingAutoPush()
    }
  }

  function clearConflict() {
    conflictData.value = null
  }

  async function resetConfig() {
    lastSyncedAt.value = ''; eventLastSyncedAt.value = ''
    await Promise.all([
      writeSyncKey(LAST_SYNC_KEY, ''), writeSyncKey(EVENT_LAST_SYNC_KEY, '')
    ])
    lastError.value = ''; syncStatus.value = ''; conflictData.value = null
    syncPhase.value = null; syncCause.value = null; syncSuggestion.value = null
    clearSyncLogs()
  }

  return {
    lastSyncedAt, eventLastSyncedAt, deviceId,
    isInitialized, isSyncing, isPulling, syncStatus, syncLogs, lastError, syncPhase, syncCause, syncSuggestion, syncNotice, conflictData, syncSource,
    isConfigured, init,
    getLocalChangesSinceLastSync, sync, pull, resolveConflict, resolvePullConflict,
    autoPushGoods, markGoodsIdsDirty,
    clearConflict, resetConfig,
    encryptionEnabled, setEncryptionEnabled, ensureEncryptionKey, syncPassword, setSyncPassword,
    syncBackend, supabaseUrl, supabaseAnonKey,
    saveSupabaseConfig, setSyncBackend, testSupabaseConnection, isSupabaseMode,
    syncPaused, setSyncPaused,
    restoreImageFromCloud
  }
})
