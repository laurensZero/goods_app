import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { Capacitor } from '@capacitor/core'
import { useGoodsStore } from './goods'
import { useEventsStore } from './events'
import { usePresetsStore, normalizeCharacterName } from './presets'
import { useRechargeStore } from '@/stores/recharge'
import { useGoodsGroupStore } from '@/stores/goodsGroup'
import { useSyncLogger } from '@/composables/sync/useSyncLogger'
import { createSyncConflictService } from '@/services/syncConflictService'
import { createSyncOrchestrator } from '@/services/syncOrchestrator'
import { createGistBackendAdapter } from '@/services/gistBackendAdapter'
import { createSupabaseBackendAdapter } from '@/services/supabaseBackendAdapter'
import { createSyncImageService } from '@/services/syncImageService'
import { createSyncPayloadService } from '@/services/syncPayloadService'
import { withRetry } from '@/services/syncRetry'
import { validateToken, getGist, listGists } from '@/utils/github/gist'
import { getItemTimestamp, resolveGoodsTrashMaps } from '@/utils/sync/shared'
import { readOrCreateDeviceId, readSyncKey, writeSyncKey } from '@/utils/sync/storage'
import { SyncError, buildSyncErrorStatus } from '@/services/syncError'
import { initSupabaseClient, testSupabaseConnection, clearSupabaseClient } from '@/utils/sync/supabaseClient'
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

const TOKEN_KEY = 'sync_github_token'
const GIST_ID_KEY = 'sync_gist_id'
const IMAGE_GIST_ID_KEY = 'sync_image_gist_id'
const RECHARGE_GIST_ID_KEY = 'sync_recharge_gist_id'
const EVENT_GIST_ID_KEY = 'sync_event_gist_id'
const LAST_SYNC_KEY = 'sync_last_synced_at'
const EVENT_LAST_SYNC_KEY = 'sync_event_last_synced_at'
const GITHUB_LOGIN_KEY = 'sync_github_login'
const GITHUB_USER_ID_KEY = 'sync_github_user_id'
const GITHUB_AVATAR_URL_KEY = 'sync_github_avatar_url'
const SYNC_PASSWORD_KEY = 'sync_password'
const GITHUB_SCOPES_KEY = 'sync_github_scopes'
const GITHUB_AUTH_METHOD_KEY = 'sync_github_auth_method'
const DEVICE_ID_KEY = Capacitor.isNativePlatform() ? 'sync_native_device_id' : 'sync_web_device_id'
const ENCRYPTION_ENABLED_KEY = 'sync_encryption_enabled'
const SUPABASE_URL_KEY = 'sync_supabase_url'
const SUPABASE_ANON_KEY_KEY = 'sync_supabase_anon_key'
const SYNC_BACKEND_KEY = 'sync_backend'

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

  // ── GitHub Auth ──
  const token = ref('')
  const githubLogin = ref('')
  const githubUserId = ref('')
  const githubAvatarUrl = ref('')
  const githubScopes = ref('')
  const githubAuthMethod = ref('')

  // ── Gist IDs ──
  const gistId = ref('')
  const imageGistId = ref('')
  const rechargeGistId = ref('')
  const eventGistId = ref('')

  // ── Sync Timestamps ──
  const lastSyncedAt = ref('')
  const eventLastSyncedAt = ref('')

  // ── Device & Encryption ──
  const deviceId = ref('')
  const encryptionEnabled = ref(false)
  const encryptionKey = ref(null)
  const syncPassword = ref('')

  // ── Backend Selection ──
  const syncBackend = ref('gist')
  const supabaseUrl = ref('')
  const supabaseAnonKey = ref('')

  // ── Sync Lifecycle / UI State ──
  const isInitialized = ref(false)
  const isSyncing = ref(false)
  const isPulling = ref(false)
  const syncStatus = ref('')
  const lastError = ref('')
  const syncPhase = ref(null)
  const syncCause = ref(null)
  const syncSuggestion = ref(null)
  const syncNotice = ref(null)
  const conflictData = ref(null)

  const isConfigured = computed(() => {
    if (syncBackend.value === 'supabase') {
      return !!supabaseUrl.value && !!supabaseAnonKey.value
    }
    return !!token.value && !!gistId.value
  })

  function normalizeGitHubAuthMethod(value) {
    const normalized = String(value || '').trim().toLowerCase()
    if (normalized === 'device-flow' || normalized === 'token') return normalized
    return ''
  }

  async function persistGitHubMeta(meta = {}) {
    const nextLogin = String(meta.login ?? meta.githubLogin ?? '').trim()
    const nextUserId = String(meta.userId ?? meta.githubUserId ?? '').trim()
    const nextAvatarUrl = String(meta.avatarUrl ?? meta.githubAvatarUrl ?? '').trim()
    const nextScopes = String(meta.scopes ?? meta.githubScopes ?? '').trim()
    const nextAuthMethod = normalizeGitHubAuthMethod(meta.authMethod ?? meta.githubAuthMethod ?? '')

    githubLogin.value = nextLogin
    githubUserId.value = nextUserId
    githubAvatarUrl.value = nextAvatarUrl
    githubScopes.value = nextScopes
    githubAuthMethod.value = nextAuthMethod

    await Promise.all([
      writeSyncKey(GITHUB_LOGIN_KEY, nextLogin),
      writeSyncKey(GITHUB_USER_ID_KEY, nextUserId),
      writeSyncKey(GITHUB_AVATAR_URL_KEY, nextAvatarUrl),
      writeSyncKey(GITHUB_SCOPES_KEY, nextScopes),
      writeSyncKey(GITHUB_AUTH_METHOD_KEY, nextAuthMethod)
    ])
  }

  async function clearGitHubMeta() {
    await persistGitHubMeta({})
  }

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
    if (!syncPassword.value || !githubUserId.value) return null
    if (!isWebCryptoAvailable()) return null
    encryptionKey.value = await deriveKey(syncPassword.value, githubUserId.value)
    return encryptionKey.value
  }

  function clearEncryptionKey() {
    encryptionKey.value = null
  }

  // ── Persistence helpers ──

  async function saveGistId(newGistId) {
    gistId.value = newGistId
    await writeSyncKey(GIST_ID_KEY, newGistId)
  }

  async function saveImageGistId(newImageGistId) {
    imageGistId.value = newImageGistId
    await writeSyncKey(IMAGE_GIST_ID_KEY, newImageGistId)
  }

  async function saveRechargeGistId(newRechargeGistId) {
    rechargeGistId.value = newRechargeGistId
    await writeSyncKey(RECHARGE_GIST_ID_KEY, newRechargeGistId)
  }

  async function saveEventGistId(newEventGistId) {
    eventGistId.value = newEventGistId
    await writeSyncKey(EVENT_GIST_ID_KEY, newEventGistId)
  }

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
    // Force-reset syncing state so a stuck sync on the old backend doesn't block the new one
    if (isSyncing.value) {
      console.warn('[sync] 切换后端时强制重置 isSyncing')
      resetSyncingState()
    }

    // initialize or clear supabase client on backend switch
    if (backend === 'supabase') {
      if (supabaseUrl.value && supabaseAnonKey.value) {
        try { initSupabaseClient(supabaseUrl.value, supabaseAnonKey.value) } catch (e) { console.warn('[sync] initSupabaseClient failed on setSyncBackend:', e.message) }
      }
    } else {
      try { clearSupabaseClient() } catch (e) { /* ignore */ }
    }

    syncBackend.value = backend
    await writeSyncKey(SYNC_BACKEND_KEY, backend)
  }

  function isSupabaseMode() {
    return syncBackend.value === 'supabase'
  }

  function ensureBackendReady() {
    if (isSupabaseMode()) {
      if (!supabaseUrl.value || !supabaseAnonKey.value) {
        throw new Error(i18n.global.t('sync.notConfigured'))
      }
      return
    }
    if (!token.value) {
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
    if (syncBackend.value === 'supabase' && supabaseUrl.value && supabaseAnonKey.value) {
      initSupabaseClient(supabaseUrl.value, supabaseAnonKey.value)
      return createSupabaseBackendAdapter({ trackSyncStep, deviceIdRef: () => deviceId.value })
    }
    return backend
  }

  // ── Service wiring ──

  const {
    buildSyncPayload, buildSyncData, buildRechargeSyncData,
    buildEventSyncPayload, buildEventSyncData,
    buildComparableSyncStateFromData, buildComparableRechargeStateFromData,
    buildComparableEventStateFromData, buildManifest
  } = createSyncPayloadService({
    deviceIdRef: deviceId, imageGistIdRef: imageGistId, lastSyncedAtRef: lastSyncedAt,
    buildPresetsData, ensureEventsStoreReady, useGoodsStore, useRechargeStore, useEventsStore, useGoodsGroupStore,
    readLocalImageAsDataUrl, compressImageToBlob, imageFileSizeLimit: IMAGE_FILE_SIZE_LIMIT
  })

  const backend = createGistBackendAdapter({
    tokenRef: token, gistIdRef: gistId, imageGistIdRef: imageGistId,
    rechargeGistIdRef: rechargeGistId, eventGistIdRef: eventGistId,
    deviceIdRef: deviceId, encryptionEnabledRef: encryptionEnabled, ensureEncryptionKey,
    constants: { GIST_ID_KEY, IMAGE_GIST_ID_KEY, RECHARGE_GIST_ID_KEY, EVENT_GIST_ID_KEY, DATA_FILENAME, RECHARGE_DATA_FILENAME, EVENT_DATA_FILENAME, MANIFEST_FILENAME },
    trackSyncStep
  })

  let activeBackend = backend

  const imageService = createSyncImageService({
    backend,
    getBackend: () => activeBackend,
    trackSyncStep,
    imageFilePrefix: IMAGE_FILE_PREFIX,
    eventCoverPrefix: EVENT_COVER_PREFIX,
    eventPhotoPrefix: EVENT_PHOTO_PREFIX
  })

  const conflictService = createSyncConflictService({
    backend,
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
    backend, payload: payloadService, image: imageService, conflict: conflictService,
    useGoodsStore, useRechargeStore, useEventsStore, usePresetsStore, useGoodsGroupStore, trackSyncStep,
    constants: { DATA_FILENAME, RECHARGE_DATA_FILENAME, EVENT_DATA_FILENAME, MANIFEST_FILENAME }
  })

  // ── Helpers ──

  async function buildPresetsData() {
    const presets = usePresetsStore()
    return {
      categories: [...presets.categories],
      ips: [...presets.ips],
      characters: presets.characters
        .map((item) => ({ ...item, name: normalizeCharacterName(item?.name || ''), ip: String(item?.ip || '').trim() }))
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
      token: token.value, gistId: gistId.value, deviceId: deviceId.value,
      lastSyncedAt: lastSyncedAt.value, conflictData: conflictData.value,
      rechargeGistId: rechargeGistId.value, eventGistId: eventGistId.value,
      saveLastSyncedAt, saveEventLastSyncedAt, saveImageGistId,
      saveRechargeGistId, saveEventGistId,
      getLatestLocalModifiedAt, buildPresetsData, ensureEventsStoreReady,
      shouldApplyRemoteItem
    }
  }

  // ── Init ──

  async function init() {
    await ensureEventsStoreReady()

    const [tokenVal, loginVal, userIdVal, avatarVal, passwordVal, scopesVal, authMethodVal,
      gistIdVal, imageGistIdVal, rechargeGistIdVal, eventGistIdVal,
      lastSyncedAtVal, eventLastSyncedAtVal, deviceIdVal, encryptionEnabledVal,
      syncBackendVal, supabaseUrlVal, supabaseAnonKeyVal
    ] = await Promise.all([
      readSyncKey(TOKEN_KEY), readSyncKey(GITHUB_LOGIN_KEY), readSyncKey(GITHUB_USER_ID_KEY),
      readSyncKey(GITHUB_AVATAR_URL_KEY), readSyncKey(SYNC_PASSWORD_KEY), readSyncKey(GITHUB_SCOPES_KEY),
      readSyncKey(GITHUB_AUTH_METHOD_KEY), readSyncKey(GIST_ID_KEY), readSyncKey(IMAGE_GIST_ID_KEY),
      readSyncKey(RECHARGE_GIST_ID_KEY), readSyncKey(EVENT_GIST_ID_KEY), readSyncKey(LAST_SYNC_KEY),
      readSyncKey(EVENT_LAST_SYNC_KEY), readOrCreateDeviceId(DEVICE_ID_KEY, generateDeviceId),
      readSyncKey(ENCRYPTION_ENABLED_KEY),
      readSyncKey(SYNC_BACKEND_KEY), readSyncKey(SUPABASE_URL_KEY), readSyncKey(SUPABASE_ANON_KEY_KEY)
    ])

    token.value = tokenVal || ''
    githubLogin.value = loginVal || ''
    githubUserId.value = userIdVal || ''
    githubAvatarUrl.value = avatarVal || ''
    syncPassword.value = passwordVal || ''
    githubScopes.value = scopesVal || ''
    githubAuthMethod.value = normalizeGitHubAuthMethod(authMethodVal || '')
    gistId.value = gistIdVal || ''
    imageGistId.value = imageGistIdVal || ''
    rechargeGistId.value = rechargeGistIdVal || ''
    eventGistId.value = eventGistIdVal || ''
    lastSyncedAt.value = lastSyncedAtVal || ''
    eventLastSyncedAt.value = eventLastSyncedAtVal || ''
    deviceId.value = deviceIdVal
    encryptionEnabled.value = encryptionEnabledVal === '1'
    syncBackend.value = syncBackendVal || 'gist'
    supabaseUrl.value = supabaseUrlVal || ''
    supabaseAnonKey.value = supabaseAnonKeyVal || ''

    if (syncBackend.value === 'supabase' && supabaseUrl.value && supabaseAnonKey.value) {
      try {
        initSupabaseClient(supabaseUrl.value, supabaseAnonKey.value)
      } catch (e) {
        console.warn('[sync] Supabase client init failed:', e.message)
      }
    }

    if (encryptionEnabled.value && syncPassword.value && githubUserId.value) {
      try { await ensureEncryptionKey() } catch { encryptionEnabled.value = false }
    }
    isInitialized.value = true

    if (token.value && !gistId.value) {
      try {
        const matched = await listGists(token.value, 'goods-app-sync')
        if (matched.length > 0) await saveGistId(matched[0].id)
      } catch { /* ignore */ }
    }
    if (token.value && !githubLogin.value) {
      try {
        const check = await validateToken(token.value)
        if (check.valid && check.login) await persistGitHubMeta({ login: check.login, userId: check.userId, authMethod: githubAuthMethod.value || 'token' })
      } catch { /* ignore */ }
    }
    if (token.value && githubLogin.value && !githubUserId.value) {
      try {
        const check = await validateToken(token.value)
        if (check.valid && check.userId) { githubUserId.value = check.userId; await writeSyncKey(GITHUB_USER_ID_KEY, check.userId) }
      } catch { /* ignore */ }
    }
    if (token.value && gistId.value && !imageGistId.value) {
      try {
        const gist = await getGist(token.value, gistId.value)
        const manifest = gist ? await backend.getManifest(gist) : null
        if (manifest?.imageGistId) await saveImageGistId(manifest.imageGistId)
      } catch { /* ignore */ }
    }
    if (token.value && !imageGistId.value) {
      try {
        const matched = await listGists(token.value, 'goods-app-images')
        if (matched.length > 0) await saveImageGistId(matched[0].id)
      } catch { /* ignore */ }
    }
  }

  // ── Auto-push (Realtime) ──

  const SYNC_TIMEOUT_MS = 3 * 60 * 1000 // 3 min safety net
  let syncTimeoutId = null
  let autoPushTimer = null
  let pendingAutoPush = false

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
        void fullSync({ source: 'auto' })
      }
    }, 0)
  }

  function autoPushGoods() {
    if (!isSupabaseMode()) return
     if (isPulling.value || isSyncing.value) {
      pendingAutoPush = true
      return
    }
    if (autoPushTimer) clearTimeout(autoPushTimer)
    autoPushTimer = setTimeout(async () => {
      autoPushTimer = null
      try {
        await fullSync({ source: 'auto' })
      } catch (error) {
        publishSyncNotice({
          source: 'auto',
          level: 'error',
          message: syncSuggestion.value || syncStatus.value || error?.message || i18n.global.t('sync.pullFailed', { error: '' })
        })
      }
    }, 8000)
  }

  // ── Public API ──

  async function saveToken(newToken, meta = {}) {
    token.value = newToken
    clearEncryptionKey()
    await writeSyncKey(TOKEN_KEY, newToken)
    gistId.value = ''; imageGistId.value = ''; rechargeGistId.value = ''; eventGistId.value = ''
    lastSyncedAt.value = ''; eventLastSyncedAt.value = ''
    await Promise.all([
      writeSyncKey(GIST_ID_KEY, ''),
      writeSyncKey(IMAGE_GIST_ID_KEY, ''),
      writeSyncKey(RECHARGE_GIST_ID_KEY, ''),
      writeSyncKey(EVENT_GIST_ID_KEY, ''),
      writeSyncKey(LAST_SYNC_KEY, ''),
      writeSyncKey(EVENT_LAST_SYNC_KEY, '')
    ])
    lastError.value = ''; syncStatus.value = ''; conflictData.value = null
    syncPhase.value = null; syncCause.value = null; syncSuggestion.value = null
    await persistGitHubMeta(meta)
    clearSyncLogs()
  }

  async function checkTokenValidity() {
    if (!token.value) return { valid: false, login: '' }
    return validateToken(token.value)
  }

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

  async function fullSync({ source = 'manual', maxRetries = 1 } = {}) {
    if (isSyncing.value) return { action: 'skipped', reason: 'syncing' }
    ensureBackendReady()
    isSyncing.value = true; lastError.value = ''; conflictData.value = null
    syncPhase.value = null; syncCause.value = null; syncSuggestion.value = null
    clearSyncLogs(); syncStatus.value = i18n.global.t('sync.syncing')

    // Safety net: force-reset isSyncing if the entire sync hangs
    clearSyncTimeout()
    syncTimeoutId = setTimeout(() => {
      console.warn('[sync] 同步超时（3 分钟），强制重置 isSyncing')
      resetSyncingState()
      applySyncError(new Error('同步操作超时'), '同步超时')
    }, SYNC_TIMEOUT_MS)

    try {
      const result = await withRetry(
        () => orchestrator.fullSync(buildSyncContext()),
        { maxRetries, baseDelay: 1200 }
      )
      if (result.conflictData) conflictData.value = result.conflictData
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
      isSyncing.value = false
      flushPendingAutoPush()
    }
  }

  async function pullOnly({ silent = false, source = 'manual', maxRetries = 1, forceRecharge = false } = {}) {
    if (isSyncing.value) return
    ensureBackendReady()
    if (!isSupabaseMode() && !gistId.value) throw new Error(i18n.global.t('sync.notConfigured'))
    isSyncing.value = true; isPulling.value = true; lastError.value = ''
    if (!silent) conflictData.value = null
    syncPhase.value = null; syncCause.value = null; syncSuggestion.value = null
    clearSyncLogs(); syncStatus.value = i18n.global.t('sync.syncing')

    clearSyncTimeout()
    syncTimeoutId = setTimeout(() => {
      console.warn('[sync] 拉取超时（3 分钟），强制重置')
      resetSyncingState()
      applySyncError(new Error('拉取操作超时'), '拉取超时')
    }, SYNC_TIMEOUT_MS)

    try {
      const result = await withRetry(
        () => orchestrator.pullOnly(buildSyncContext(), { silent, forceRecharge, sourceTable: source }),
        { maxRetries, baseDelay: 1200 }
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
        { maxRetries, baseDelay: 1200 }
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
        { maxRetries, baseDelay: 1200 }
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
    token.value = ''; githubLogin.value = ''; githubAvatarUrl.value = ''; githubScopes.value = ''; githubAuthMethod.value = ''
    gistId.value = ''; imageGistId.value = ''; rechargeGistId.value = ''; eventGistId.value = ''
    lastSyncedAt.value = ''; eventLastSyncedAt.value = ''
    await Promise.all([
      writeSyncKey(TOKEN_KEY, ''), writeSyncKey(GIST_ID_KEY, ''), writeSyncKey(IMAGE_GIST_ID_KEY, ''),
      writeSyncKey(RECHARGE_GIST_ID_KEY, ''), writeSyncKey(EVENT_GIST_ID_KEY, ''),
      writeSyncKey(LAST_SYNC_KEY, ''), writeSyncKey(EVENT_LAST_SYNC_KEY, '')
    ])
    await clearGitHubMeta()
    lastError.value = ''; syncStatus.value = ''; conflictData.value = null
    syncPhase.value = null; syncCause.value = null; syncSuggestion.value = null
    clearSyncLogs()
  }

  return {
    token, githubLogin, githubAvatarUrl, githubScopes, githubAuthMethod,
    gistId, imageGistId, rechargeGistId, eventGistId,
    lastSyncedAt, eventLastSyncedAt, deviceId,
    isInitialized, isSyncing, isPulling, syncStatus, syncLogs, lastError, syncPhase, syncCause, syncSuggestion, syncNotice, conflictData,
    isConfigured, init, saveToken, checkTokenValidity,
    getLocalChangesSinceLastSync, fullSync, pullOnly, resolveConflict, resolvePullConflict,
    autoPushGoods,
    clearConflict, resetConfig,
    encryptionEnabled, setEncryptionEnabled, ensureEncryptionKey, syncPassword, setSyncPassword, githubUserId,
    syncBackend, supabaseUrl, supabaseAnonKey,
    saveSupabaseConfig, setSyncBackend, testSupabaseConnection, isSupabaseMode
  }
})
