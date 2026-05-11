import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { Capacitor } from '@capacitor/core'
import { useGoodsStore } from './goods'
import { useEventsStore } from './events'
import { usePresetsStore, normalizeCharacterName } from './presets'
import { useRechargeStore } from '@/stores/recharge'
import { useSyncLogger } from '@/composables/sync/useSyncLogger'
import { createSyncConflictService } from '@/services/syncConflictService'
import { createSyncOrchestrator } from '@/services/syncOrchestrator'
import { createGistBackendAdapter } from '@/services/gistBackendAdapter'
import { createSupabaseBackendAdapter } from '@/services/supabaseBackendAdapter'
import { createSyncImageService } from '@/services/syncImageService'
import { createSyncPayloadService } from '@/services/syncPayloadService'
import { validateToken, getGist, listGists } from '@/utils/githubGist'
import { getItemTimestamp, resolveGoodsTrashMaps } from '@/utils/syncShared'
import { readOrCreateDeviceId, readSyncKey, writeSyncKey } from '@/utils/syncStorage'
import { SyncError, buildSyncErrorStatus } from '@/services/syncError'
import { initSupabaseClient, testSupabaseConnection } from '@/utils/supabaseClient'
import { deriveKey, isWebCryptoAvailable } from '@/utils/cryptoManager'
import { readLocalImageAsDataUrl } from '@/utils/localImage'
import { compressImageToBlob } from '@/composables/image/useImageExport'

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

const DATA_FILENAME = 'data.json'
const RECHARGE_DATA_FILENAME = 'recharge-data.json'
const EVENT_DATA_FILENAME = 'events-data.json'
const MANIFEST_FILENAME = 'manifest.json'
const IS_NATIVE = Capacitor.isNativePlatform()
const IMAGE_FILE_PREFIX = 'goods-image__'
const EVENT_COVER_PREFIX = 'event-cover__'
const IMAGE_FILE_SIZE_LIMIT = 1024 * 1024

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
  const token = ref('')
  const githubLogin = ref('')
  const githubUserId = ref('')
  const githubAvatarUrl = ref('')
  const githubScopes = ref('')
  const githubAuthMethod = ref('')
  const gistId = ref('')
  const imageGistId = ref('')
  const rechargeGistId = ref('')
  const eventGistId = ref('')
  const lastSyncedAt = ref('')
  const eventLastSyncedAt = ref('')
  const deviceId = ref('')
  const encryptionEnabled = ref(false)
  const encryptionKey = ref(null)
  const syncPassword = ref('')
  const syncBackend = ref('gist')
  const supabaseUrl = ref('')
  const supabaseAnonKey = ref('')
  const isInitialized = ref(false)
  const isSyncing = ref(false)
  const syncStatus = ref('')
  const lastError = ref('')
  const syncPhase = ref(null)
  const syncCause = ref(null)
  const syncSuggestion = ref(null)
  const conflictData = ref(null)

  const isConfigured = computed(() => !!token.value && !!gistId.value)

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

    await writeSyncKey(GITHUB_LOGIN_KEY, nextLogin)
    await writeSyncKey(GITHUB_USER_ID_KEY, nextUserId)
    await writeSyncKey(GITHUB_AVATAR_URL_KEY, nextAvatarUrl)
    await writeSyncKey(GITHUB_SCOPES_KEY, nextScopes)
    await writeSyncKey(GITHUB_AUTH_METHOD_KEY, nextAuthMethod)
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
    syncBackend.value = backend
    await writeSyncKey(SYNC_BACKEND_KEY, backend)
  }

  function getCurrentBackend() {
    if (syncBackend.value === 'supabase' && supabaseUrl.value && supabaseAnonKey.value) {
      return createSupabaseBackendAdapter({ trackSyncStep })
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
    buildPresetsData, ensureEventsStoreReady, useGoodsStore, useRechargeStore, useEventsStore,
    readLocalImageAsDataUrl, compressImageToBlob, imageFileSizeLimit: IMAGE_FILE_SIZE_LIMIT
  })

  const backend = createGistBackendAdapter({
    tokenRef: token, gistIdRef: gistId, imageGistIdRef: imageGistId,
    rechargeGistIdRef: rechargeGistId, eventGistIdRef: eventGistId,
    deviceIdRef: deviceId, encryptionEnabledRef: encryptionEnabled, ensureEncryptionKey,
    constants: { GIST_ID_KEY, IMAGE_GIST_ID_KEY, RECHARGE_GIST_ID_KEY, EVENT_GIST_ID_KEY, DATA_FILENAME, RECHARGE_DATA_FILENAME, EVENT_DATA_FILENAME, MANIFEST_FILENAME },
    trackSyncStep
  })

  const imageService = createSyncImageService({
    backend, trackSyncStep, imageFilePrefix: IMAGE_FILE_PREFIX, eventCoverPrefix: EVENT_COVER_PREFIX
  })

  const conflictService = createSyncConflictService({
    backend, lastSyncedAtRef: lastSyncedAt, useGoodsStore, useRechargeStore, useEventsStore,
    shouldApplyRemoteItem, getExistingRechargeGist: () => backend.getExistingRechargeGist(),
    getExistingEventGist: () => backend.getExistingEventGist(),
    buildRechargeSyncData, buildEventSyncData, getLatestLocalModifiedAt
  })

  const payloadService = {
    buildSyncPayload, buildRechargeSyncData, buildEventSyncPayload, buildManifest,
    buildSyncData, buildEventSyncData,
    buildComparableSyncStateFromData, buildComparableRechargeStateFromData, buildComparableEventStateFromData
  }

  const orchestrator = createSyncOrchestrator({
    backend, payload: payloadService, image: imageService, conflict: conflictService,
    useGoodsStore, useRechargeStore, useEventsStore, usePresetsStore, trackSyncStep,
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
    const resolvedLocal = resolveGoodsTrashMaps(goodsStore.list, goodsStore.trashList)
    const recharge = rechargeStore.exportBackup({ includeDeleted: false, stripImage: true })
    const timestamps = [
      ...[...resolvedLocal.goodsMap.values()].map((item) => getItemTimestamp(item)),
      ...[...resolvedLocal.trashMap.values()].map((item) => getItemTimestamp(item)),
      ...recharge.map((item) => getItemTimestamp(item)),
      ...(eventsStore.list || []).map((item) => Number(item?.updatedAt) || 0)
    ]
    const latest = Math.max(0, ...timestamps)
    return latest > 0 ? new Date(latest).toISOString() : ''
  }

  function getLocalChangesSinceLastSync() {
    const localSyncTime = lastSyncedAt.value ? new Date(lastSyncedAt.value).getTime() : 0
    return conflictService.getLocalChangesSince(localSyncTime)
  }

  function buildSyncContext() {
    return {
      backend: getCurrentBackend(),
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

  // ── Public API ──

  async function saveToken(newToken, meta = {}) {
    token.value = newToken
    clearEncryptionKey()
    await writeSyncKey(TOKEN_KEY, newToken)
    gistId.value = ''; imageGistId.value = ''; rechargeGistId.value = ''; eventGistId.value = ''
    lastSyncedAt.value = ''; eventLastSyncedAt.value = ''
    await writeSyncKey(GIST_ID_KEY, ''); await writeSyncKey(IMAGE_GIST_ID_KEY, '')
    await writeSyncKey(RECHARGE_GIST_ID_KEY, ''); await writeSyncKey(EVENT_GIST_ID_KEY, '')
    await writeSyncKey(LAST_SYNC_KEY, ''); await writeSyncKey(EVENT_LAST_SYNC_KEY, '')
    lastError.value = ''; syncStatus.value = ''; conflictData.value = null
    syncPhase.value = null; syncCause.value = null; syncSuggestion.value = null
    await persistGitHubMeta(meta)
    clearSyncLogs()
  }

  async function checkTokenValidity() {
    if (!token.value) return { valid: false, login: '' }
    return validateToken(token.value)
  }

  async function fullSync() {
    if (isSyncing.value) return { action: 'skipped', reason: 'syncing' }
    if (!token.value) throw new Error('未配置 Token')
    isSyncing.value = true; lastError.value = ''; conflictData.value = null
    syncPhase.value = null; syncCause.value = null; syncSuggestion.value = null
    clearSyncLogs(); syncStatus.value = '正在同步...'
    try {
      const result = await orchestrator.fullSync(buildSyncContext())
      if (result.conflictData) conflictData.value = result.conflictData
      syncStatus.value = result.statusMessage || '同步完成'
      return result
    } catch (error) {
      if (error instanceof SyncError) {
        lastError.value = error.message
        syncStatus.value = buildSyncErrorStatus(error)
        syncPhase.value = error.phase
        syncCause.value = error.cause
        syncSuggestion.value = error.suggestion
      } else {
        lastError.value = error.message; syncStatus.value = '同步失败'
      }
      throw error
    } finally { isSyncing.value = false }
  }

  async function pullOnly() {
    if (isSyncing.value) return
    if (!token.value) throw new Error('未配置 Token')
    if (!gistId.value) throw new Error('未找到 Gist')
    isSyncing.value = true; lastError.value = ''; conflictData.value = null
    syncPhase.value = null; syncCause.value = null; syncSuggestion.value = null
    clearSyncLogs(); syncStatus.value = '正在拉取...'
    try {
      const result = await orchestrator.pullOnly(buildSyncContext())
      if (result.conflictData) conflictData.value = result.conflictData
      syncStatus.value = result.statusMessage || '拉取完成'
      return result
    } catch (error) {
      if (error instanceof SyncError) {
        lastError.value = error.message
        syncStatus.value = buildSyncErrorStatus(error)
        syncPhase.value = error.phase
        syncCause.value = error.cause
        syncSuggestion.value = error.suggestion
      } else {
        lastError.value = error.message; syncStatus.value = '拉取失败'
      }
      throw error
    } finally { isSyncing.value = false }
  }

  async function resolveConflict(useRemote) {
    if (!conflictData.value) return
    isSyncing.value = true; syncStatus.value = '正在解决冲突...'
    syncPhase.value = null; syncCause.value = null; syncSuggestion.value = null
    try {
      const ctx = { ...buildSyncContext(), conflictData: conflictData.value }
      const result = await orchestrator.resolveConflict(ctx, useRemote)
      conflictData.value = null
      syncStatus.value = result.statusMessage || '冲突已解决'
      return result
    } catch (error) {
      if (error instanceof SyncError) {
        lastError.value = error.message
        syncStatus.value = buildSyncErrorStatus(error)
        syncPhase.value = error.phase
        syncCause.value = error.cause
        syncSuggestion.value = error.suggestion
      } else {
        lastError.value = error.message; syncStatus.value = '同步失败'
      }
      throw error
    } finally { isSyncing.value = false }
  }

  async function resolvePullConflict(confirm) {
    if (!conflictData.value?.isPullOnly) return
    isSyncing.value = true; syncStatus.value = '正在拉取...'
    syncPhase.value = null; syncCause.value = null; syncSuggestion.value = null
    try {
      if (!confirm) { syncStatus.value = '已取消'; conflictData.value = null; return { action: 'cancelled' } }
      const ctx = { ...buildSyncContext(), conflictData: conflictData.value }
      const result = await orchestrator.resolvePullConflict(ctx, confirm)
      conflictData.value = null
      syncStatus.value = result.statusMessage || '拉取完成'
      return result
    } catch (error) {
      if (error instanceof SyncError) {
        lastError.value = error.message
        syncStatus.value = buildSyncErrorStatus(error)
        syncPhase.value = error.phase
        syncCause.value = error.cause
        syncSuggestion.value = error.suggestion
      } else {
        lastError.value = error.message; syncStatus.value = '拉取失败'
      }
      throw error
    } finally { isSyncing.value = false }
  }

  function clearConflict() {
    conflictData.value = null
  }

  async function resetConfig() {
    token.value = ''; githubLogin.value = ''; githubAvatarUrl.value = ''; githubScopes.value = ''; githubAuthMethod.value = ''
    gistId.value = ''; imageGistId.value = ''; rechargeGistId.value = ''; eventGistId.value = ''
    lastSyncedAt.value = ''; eventLastSyncedAt.value = ''
    await writeSyncKey(TOKEN_KEY, ''); await writeSyncKey(GIST_ID_KEY, ''); await writeSyncKey(IMAGE_GIST_ID_KEY, '')
    await writeSyncKey(RECHARGE_GIST_ID_KEY, ''); await writeSyncKey(EVENT_GIST_ID_KEY, '')
    await writeSyncKey(LAST_SYNC_KEY, ''); await writeSyncKey(EVENT_LAST_SYNC_KEY, '')
    await clearGitHubMeta()
    lastError.value = ''; syncStatus.value = ''; conflictData.value = null
    syncPhase.value = null; syncCause.value = null; syncSuggestion.value = null
    clearSyncLogs()
  }

  return {
    token, githubLogin, githubAvatarUrl, githubScopes, githubAuthMethod,
    gistId, imageGistId, rechargeGistId, eventGistId,
    lastSyncedAt, eventLastSyncedAt, deviceId,
    isInitialized, isSyncing, syncStatus, syncLogs, lastError, syncPhase, syncCause, syncSuggestion, conflictData,
    isConfigured, init, saveToken, checkTokenValidity,
    getLocalChangesSinceLastSync, fullSync, pullOnly, resolveConflict, resolvePullConflict,
    clearConflict, resetConfig,
    encryptionEnabled, setEncryptionEnabled, ensureEncryptionKey, syncPassword, setSyncPassword, githubUserId,
    syncBackend, supabaseUrl, supabaseAnonKey,
    saveSupabaseConfig, setSyncBackend, testSupabaseConnection
  }
})
