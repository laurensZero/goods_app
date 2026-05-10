import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { Capacitor } from '@capacitor/core'
import { useGoodsStore } from './goods'
import { useEventsStore } from './events'
import { usePresetsStore, normalizeCharacterName } from './presets'
import { useRechargeStore } from '@/composables/recharge/useRechargeStore'
import { useSyncLogger } from '@/composables/sync/useSyncLogger'
import { createSyncConflictService } from '@/services/syncConflictService'
import { createSyncExecutionService } from '@/services/syncExecutionService'
import { createSyncGistService } from '@/services/syncGistService'
import { createSyncImageService } from '@/services/syncImageService'
import { createSyncPayloadService } from '@/services/syncPayloadService'
import {
  validateToken,
  createGist,
  getGist,
  updateGist,
  listGists,
  getGistFileContent,
  buildSyncDescription
} from '@/utils/githubGist'
import {
  countWishlistSplit,
  getItemTimestamp,
  resolveGoodsTrashMaps
} from '@/utils/syncShared'
import { readOrCreateDeviceId, readSyncKey, writeSyncKey } from '@/utils/syncStorage'
import { deriveKey, isEncrypted, decrypt, isWebCryptoAvailable } from '@/utils/cryptoManager'
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
  const isInitialized = ref(false)
  const isSyncing = ref(false)
  const syncStatus = ref('')
  const lastError = ref('')
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

  async function readJsonFromGistWithTrace({
    title,
    gist,
    fileName,
    startDetail = '',
    category = '',
    required = false,
    missingMessage = '',
    fallbackGist = null,
    fallbackFileName = fileName,
    successDetail = null
  }) {
    const result = await trackSyncStep(title, async () => {
      let content = await getGistFileContent(token.value, gist, fileName)
      let source = '主 Gist'

      if (!content && fallbackGist) {
        content = await getGistFileContent(token.value, fallbackGist, fallbackFileName)
        source = '备用 Gist'
      }

      if (!content) {
        if (required) {
          throw new Error(missingMessage || `未找到 ${fileName}`)
        }
        return null
      }

      let parsed
      if (isEncrypted(content)) {
        console.log(`[解密] ${fileName} 检测到加密数据`)
        const key = await ensureEncryptionKey()
        if (!key) {
          throw new Error('检测到加密数据，但加密密钥未初始化。请重新登录 GitHub 或禁用加密。')
        }
        const decrypted = await decrypt(content, key)
        try {
          parsed = JSON.parse(decrypted)
        } catch (e) {
          throw new Error(`${fileName} 解密后 JSON 解析失败: ${e.message}`)
        }
        console.log(`[解密] ${fileName} 解密成功`)
      } else {
        try {
          parsed = JSON.parse(content)
        } catch (e) {
          throw new Error(`${fileName} JSON 解析失败: ${e.message}`)
        }
      }

      return {
        parsed,
        source
      }
    }, {
      startDetail,
      category,
      successDetail: (value) => {
        if (!successDetail) return ''
        return successDetail(value?.parsed ?? null, value?.source || '主 Gist')
      }
    })

    return result?.parsed ?? null
  }

  async function ensureEventsStoreReady() {
    const eventsStore = useEventsStore()
    if (!eventsStore.isReady) {
      await eventsStore.init()
    }
    return eventsStore
  }

  async function setEncryptionEnabled(enabled) {
    console.log('[setEncryptionEnabled] enabled:', enabled, 'password:', syncPassword.value ? '已设置' : '空', 'userId:', githubUserId.value || '空')
    encryptionEnabled.value = !!enabled
    await writeSyncKey(ENCRYPTION_ENABLED_KEY, enabled ? '1' : '')
    if (!enabled) {
      encryptionKey.value = null
    }
  }

  async function setSyncPassword(password) {
    console.log('[setSyncPassword] 设置密码:', password ? '已设置' : '空')
    syncPassword.value = password
    await writeSyncKey(SYNC_PASSWORD_KEY, password)
    encryptionKey.value = null
  }

  async function ensureEncryptionKey() {
    console.log('[ensureEncryptionKey] password:', syncPassword.value ? '已设置' : '空', 'userId:', githubUserId.value || '空')
    if (encryptionKey.value) return encryptionKey.value
    if (!syncPassword.value || !githubUserId.value) return null
    if (!isWebCryptoAvailable()) return null
    encryptionKey.value = await deriveKey(syncPassword.value, githubUserId.value)
    console.log('[ensureEncryptionKey] 密钥已生成')
    return encryptionKey.value
  }

  function clearEncryptionKey() {
    encryptionKey.value = null
  }

  async function init() {
    await ensureEventsStoreReady()

    const [
      tokenVal,
      loginVal,
      userIdVal,
      avatarVal,
      passwordVal,
      scopesVal,
      authMethodVal,
      gistIdVal,
      imageGistIdVal,
      rechargeGistIdVal,
      eventGistIdVal,
      lastSyncedAtVal,
      eventLastSyncedAtVal,
      deviceIdVal,
      encryptionEnabledVal
    ] = await Promise.all([
      readSyncKey(TOKEN_KEY),
      readSyncKey(GITHUB_LOGIN_KEY),
      readSyncKey(GITHUB_USER_ID_KEY),
      readSyncKey(GITHUB_AVATAR_URL_KEY),
      readSyncKey(SYNC_PASSWORD_KEY),
      readSyncKey(GITHUB_SCOPES_KEY),
      readSyncKey(GITHUB_AUTH_METHOD_KEY),
      readSyncKey(GIST_ID_KEY),
      readSyncKey(IMAGE_GIST_ID_KEY),
      readSyncKey(RECHARGE_GIST_ID_KEY),
      readSyncKey(EVENT_GIST_ID_KEY),
      readSyncKey(LAST_SYNC_KEY),
      readSyncKey(EVENT_LAST_SYNC_KEY),
      readOrCreateDeviceId(DEVICE_ID_KEY, generateDeviceId),
      readSyncKey(ENCRYPTION_ENABLED_KEY)
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
    if (encryptionEnabled.value && syncPassword.value && githubUserId.value) {
      try {
        await ensureEncryptionKey()
      } catch (e) {
        console.warn('加密密钥初始化失败:', e)
        encryptionEnabled.value = false
      }
    }
    isInitialized.value = true

    if (token.value && !gistId.value) {
      try {
        const matched = await listGists(token.value, 'goods-app-sync')
        if (matched.length > 0) {
          await saveGistId(matched[0].id)
        }
      } catch {
        // ignore
      }
    }

    if (token.value && !githubLogin.value) {
      try {
        const check = await validateToken(token.value)
        if (check.valid && check.login) {
          await persistGitHubMeta({
            login: check.login,
            userId: check.userId,
            authMethod: githubAuthMethod.value || 'token'
          })
        }
      } catch {
        // ignore
      }
    }

    // 如果已有登录信息但没有用户 ID，补充获取
    if (token.value && githubLogin.value && !githubUserId.value) {
      try {
        const check = await validateToken(token.value)
        if (check.valid && check.userId) {
          githubUserId.value = check.userId
          await writeSyncKey(GITHUB_USER_ID_KEY, check.userId)
        }
      } catch {
        // ignore
      }
    }

    if (token.value && gistId.value && !imageGistId.value) {
      try {
        const gist = await getGist(token.value, gistId.value)
        const manifestContent = gist ? await getGistFileContent(token.value, gist, MANIFEST_FILENAME) : null
        const manifest = manifestContent ? JSON.parse(manifestContent) : null
        if (manifest?.imageGistId) {
          await saveImageGistId(manifest.imageGistId)
        }
      } catch {
        // ignore
      }
    }

    if (token.value && !imageGistId.value) {
      try {
        const matched = await listGists(token.value, 'goods-app-images')
        if (matched.length > 0) {
          await saveImageGistId(matched[0].id)
        }
      } catch {
        // ignore
      }
    }

  }

  async function saveToken(newToken, meta = {}) {
    token.value = newToken
    clearEncryptionKey()
    await writeSyncKey(TOKEN_KEY, newToken)
    gistId.value = ''
    imageGistId.value = ''
    rechargeGistId.value = ''
    eventGistId.value = ''
    lastSyncedAt.value = ''
    eventLastSyncedAt.value = ''
    await writeSyncKey(GIST_ID_KEY, '')
    await writeSyncKey(IMAGE_GIST_ID_KEY, '')
    await writeSyncKey(RECHARGE_GIST_ID_KEY, '')
    await writeSyncKey(EVENT_GIST_ID_KEY, '')
    await writeSyncKey(LAST_SYNC_KEY, '')
    await writeSyncKey(EVENT_LAST_SYNC_KEY, '')
    lastError.value = ''
    syncStatus.value = ''
    conflictData.value = null
    await persistGitHubMeta(meta)
    clearSyncLogs()
  }

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

  const {
    buildSyncPayload,
    buildSyncData,
    buildRechargeSyncData,
    buildEventSyncPayload,
    buildEventSyncData,
    buildComparableSyncStateFromData,
    buildComparableRechargeStateFromData,
    buildComparableEventStateFromData,
    buildManifest
  } = createSyncPayloadService({
    deviceIdRef: deviceId,
    imageGistIdRef: imageGistId,
    lastSyncedAtRef: lastSyncedAt,
    buildPresetsData,
    ensureEventsStoreReady,
    useGoodsStore,
    useRechargeStore,
    useEventsStore,
    readLocalImageAsDataUrl,
    compressImageToBlob,
    imageFileSizeLimit: IMAGE_FILE_SIZE_LIMIT
  })

  const {
    ensureImageGist,
    ensureRechargeGist,
    ensureEventGist,
    ensureGist,
    getExistingImageGist,
    getExistingRechargeGist,
    getExistingEventGist
  } = createSyncGistService({
    tokenRef: token,
    gistIdRef: gistId,
    imageGistIdRef: imageGistId,
    rechargeGistIdRef: rechargeGistId,
    eventGistIdRef: eventGistId,
    deviceIdRef: deviceId,
    constants: {
      GIST_ID_KEY,
      IMAGE_GIST_ID_KEY,
      RECHARGE_GIST_ID_KEY,
      EVENT_GIST_ID_KEY,
      DATA_FILENAME,
      RECHARGE_DATA_FILENAME,
      EVENT_DATA_FILENAME,
      MANIFEST_FILENAME
    },
    trackSyncStep,
    createGist,
    getGist,
    updateGist,
    listGists,
    getGistFileContent,
    buildSyncDescription,
    writeSyncKey,
    saveGistId,
    saveImageGistId,
    saveRechargeGistId,
    saveEventGistId,
    saveLastSyncedAt,
    buildSyncPayload,
    buildRechargeSyncData,
    buildEventSyncPayload,
    buildManifest
  })

  const {
    resolveRemoteImageGist,
    hydrateRemoteItemsWithImages,
    hydrateEventCoversWithImages,
    buildImageCleanupFiles
  } = createSyncImageService({
    tokenRef: token,
    imageGistIdRef: imageGistId,
    saveImageGistId,
    trackSyncStep,
    getGist,
    getGistFileContent,
    imageFilePrefix: IMAGE_FILE_PREFIX,
    eventCoverPrefix: EVENT_COVER_PREFIX,
    encryptionEnabledRef: encryptionEnabled,
    ensureEncryptionKey
  })

  const {
    getLocalChangesSince,
    buildPullConflictData
  } = createSyncConflictService({
    lastSyncedAtRef: lastSyncedAt,
    useGoodsStore,
    useRechargeStore,
    useEventsStore,
    shouldApplyRemoteItem,
    getExistingRechargeGist,
    getExistingEventGist,
    readJsonFromGistWithTrace,
    buildRechargeSyncData,
    buildEventSyncData,
    getLatestLocalModifiedAt
  })

  const {
    pullFromRemote,
    pushToRemote
  } = createSyncExecutionService({
    tokenRef: token,
    gistIdRef: gistId,
    lastSyncedAtRef: lastSyncedAt,
    rechargeGistIdRef: rechargeGistId,
    eventGistIdRef: eventGistId,
    ensureImageGist,
    resolveRemoteImageGist,
    hydrateRemoteItemsWithImages,
    hydrateEventCoversWithImages,
    buildImageCleanupFiles,
    buildSyncPayload,
    buildRechargeSyncData,
    buildEventSyncPayload,
    buildManifest,
    readJsonFromGistWithTrace,
    trackSyncStep,
    getGist,
    updateGist,
    getExistingRechargeGist,
    getExistingEventGist,
    saveLastSyncedAt,
    saveEventLastSyncedAt,
    saveRechargeGistId,
    saveEventGistId,
    useGoodsStore,
    useRechargeStore,
    useEventsStore,
    usePresetsStore,
    shouldApplyRemoteItem,
    constants: {
      DATA_FILENAME,
      RECHARGE_DATA_FILENAME,
      EVENT_DATA_FILENAME,
      MANIFEST_FILENAME
    },
    encryptionEnabledRef: encryptionEnabled,
    ensureEncryptionKey
  })

  async function checkTokenValidity() {
    if (!token.value) return { valid: false, login: '' }
    return validateToken(token.value)
  }

  async function buildPresetsData() {
    const presets = usePresetsStore()
    return {
      categories: [...presets.categories],
      ips: [...presets.ips],
      characters: presets.characters
        .map((item) => ({
          ...item,
          name: normalizeCharacterName(item?.name || ''),
          ip: String(item?.ip || '').trim()
        }))
        .filter((item) => item.name),
      storageLocations: presets.storageLocations.map((item) => ({
        id: String(item?.id || '').trim(),
        name: String(item?.name || '').trim(),
        parentId: String(item?.parentId || '').trim()
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
    return getLocalChangesSince(localSyncTime)
  }

  async function fullSync() {
    if (isSyncing.value) return { action: 'skipped', reason: 'syncing' }
    if (!token.value) throw new Error('未配置 Token')

    isSyncing.value = true
    lastError.value = ''
    conflictData.value = null
    clearSyncLogs()
    syncStatus.value = '正在同步...'

    try {
      await ensureEventsStoreReady()
      const gist = await ensureGist()
      const goodsStore = useGoodsStore()
      syncStatus.value = '正在检查远端数据...'

      const remoteManifest = await readJsonFromGistWithTrace({
        title: '读取 manifest.json',
        gist,
        fileName: MANIFEST_FILENAME,
        startDetail: '检查远端同步摘要',
        category: 'pull',
        successDetail: (parsed) => {
          if (!parsed) return '未找到 manifest'
          return `图片 Gist ${parsed.imageGistId || '未配置'}`
        }
      })
      if (remoteManifest?.imageGistId) {
        await saveImageGistId(remoteManifest.imageGistId)
      }
      const existingRechargeGist = await getExistingRechargeGist()
      const existingEventGist = await getExistingEventGist()
      const existingImageGist = await getExistingImageGist(remoteManifest)
      const remoteData = await readJsonFromGistWithTrace({
        title: '读取 data.json',
        gist,
        fileName: DATA_FILENAME,
        startDetail: '读取收藏、心愿单和回收站',
        category: 'pull',
        required: true,
        missingMessage: '远端数据为空',
        successDetail: (parsed) => {
          if (!parsed) return '未找到远端主数据'
          const goods = Array.isArray(parsed.goods) ? parsed.goods : []
          const trash = Array.isArray(parsed.trash) ? parsed.trash : []
          const counts = countWishlistSplit(goods)
          return `收藏 ${counts.collection}，心愿单 ${counts.wishlist}，回收站 ${trash.length}`
        }
      }) || { goods: [], trash: [], presets: {} }
      const remoteRechargeData = await readJsonFromGistWithTrace({
        title: '预检读取 recharge-data.json',
        gist,
        fileName: RECHARGE_DATA_FILENAME,
        startDetail: '读取充值记录',
        category: 'pull',
        fallbackGist: existingRechargeGist,
        fallbackFileName: RECHARGE_DATA_FILENAME,
        successDetail: (parsed, source) => {
          if (!parsed) return '未找到充值数据'
          const recharge = Array.isArray(parsed.recharge) ? parsed.recharge : []
          const rechargeTrash = Array.isArray(parsed.rechargeTrash) ? parsed.rechargeTrash : []
          return `${source}，充值 ${recharge.length} 条，回收站 ${rechargeTrash.length} 条`
        }
      }) || {
        recharge: Array.isArray(remoteData.recharge) ? remoteData.recharge : [],
        rechargeTrash: Array.isArray(remoteData.rechargeTrash) ? remoteData.rechargeTrash : []
      }
      const remoteEventData = await readJsonFromGistWithTrace({
        title: '预检读取 events-data.json',
        gist,
        fileName: EVENT_DATA_FILENAME,
        startDetail: '读取活动数据',
        category: 'pull',
        fallbackGist: existingEventGist,
        fallbackFileName: EVENT_DATA_FILENAME,
        successDetail: (parsed, source) => {
          if (!parsed) return '未找到活动数据'
          const events = Array.isArray(parsed.events) ? parsed.events : []
          return `${source}，活动 ${events.length} 场`
        }
      }) || { events: [] }
      const remoteTime = remoteManifest?.lastSyncAt ? new Date(remoteManifest.lastSyncAt).getTime() : 0
      const localSyncTime = lastSyncedAt.value ? new Date(lastSyncedAt.value).getTime() : 0
      const isRemoteFromOtherDevice = !!(remoteManifest?.deviceId && remoteManifest.deviceId !== deviceId.value)
      const localChanges = getLocalChangesSince(localSyncTime)
      const localComparableState = await buildComparableSyncStateFromData({
        goods: goodsStore.list,
        trash: goodsStore.trashList,
        presets: await buildPresetsData()
      })
      const remoteComparableState = await buildComparableSyncStateFromData(remoteData)
      const localRechargeComparableState = buildComparableRechargeStateFromData(buildRechargeSyncData({ incremental: false }))
      const remoteRechargeComparableState = buildComparableRechargeStateFromData(remoteRechargeData)
      const localEventComparableState = buildComparableEventStateFromData(buildEventSyncData())
      const remoteEventComparableState = buildComparableEventStateFromData(remoteEventData)
      const hasDataDiff = localComparableState !== remoteComparableState
      const hasRechargeDataDiff = localRechargeComparableState !== remoteRechargeComparableState
      const hasEventDataDiff = localEventComparableState !== remoteEventComparableState
      const hasEffectiveDiff = hasDataDiff || hasRechargeDataDiff || hasEventDataDiff

      if (!hasEffectiveDiff) {
        if (localChanges.hasChanges && !isRemoteFromOtherDevice) {
          syncStatus.value = '正在上传本地数据...'
          const imageStats = await pushToRemote(gist, existingImageGist, existingRechargeGist, existingEventGist)
          syncStatus.value = '上传完成'
          return {
            action: 'pushed',
            ...localChanges,
            ...imageStats
          }
        }

        if (remoteManifest?.lastSyncAt) {
          await saveLastSyncedAt(remoteManifest.lastSyncAt)
        }
        if (remoteEventData?.updatedAt || remoteManifest?.lastSyncAt) {
          await saveEventLastSyncedAt(remoteEventData?.updatedAt || remoteManifest.lastSyncAt)
        }
        syncStatus.value = '数据已经是最新'
        return {
          action: 'no_changes',
          ...getLocalChangesSince(remoteTime || localSyncTime)
        }
      }

      const localPayload = await trackSyncStep('整理本地收藏/回收站数据', async () => buildSyncPayload({ existingImageGist }), {
        startDetail: '读取本地收藏、回收站和图片',
        category: 'local',
        successDetail: (payload) => {
          const goodsCount = Array.isArray(payload?.syncData?.goods) ? payload.syncData.goods.length : 0
          const trashCount = Array.isArray(payload?.syncData?.trash) ? payload.syncData.trash.length : 0
          return `收藏 ${goodsCount}，回收站 ${trashCount}，图片 ${payload?.imageStats?.imageFileCount || 0} 个`
        }
      })
      const localRechargePayload = await trackSyncStep('整理本地充值数据', async () => buildRechargeSyncData({ incremental: false }), {
        startDetail: '读取本地充值记录',
        category: 'local',
        successDetail: (payload) => {
          const rechargeCount = Array.isArray(payload?.recharge) ? payload.recharge.length : 0
          return `充值 ${rechargeCount} 条`
        }
      })
      const localEventPayload = await trackSyncStep('整理本地活动数据', async () => buildEventSyncPayload({ existingImageGist }), {
        startDetail: '读取本地活动和封面图片',
        category: 'local',
        successDetail: (payload) => {
          const eventCount = Array.isArray(payload?.eventData?.events) ? payload.eventData.events.length : 0
          return `活动 ${eventCount} 场，图片 ${payload?.imageStats?.imageFileCount || 0} 个`
        }
      })
      const allReferencedImageFiles = new Set([...localPayload.referencedImageFiles, ...localEventPayload.referencedImageFiles])
      const pendingAllImageCleanup = buildImageCleanupFiles(existingImageGist, allReferencedImageFiles)
      const hasPendingImageChanges = (
        Object.keys(localPayload.imageFiles).length > 0
        || Object.keys(localEventPayload.imageFiles).length > 0
        || Object.keys(pendingAllImageCleanup).length > 0
      )

      if (!hasDataDiff && !hasRechargeDataDiff && !hasEventDataDiff && hasPendingImageChanges) {
        syncStatus.value = '正在上传本地数据...'
        const imageStats = await pushToRemote(gist, existingImageGist, existingRechargeGist, existingEventGist)
        syncStatus.value = '上传完成'
        return { action: 'pushed', ...getLocalChangesSince(remoteTime || localSyncTime), ...imageStats }
      }

      if (remoteTime > localSyncTime || !remoteManifest) {
        if (remoteManifest && localChanges.hasChanges) {
          conflictData.value = {
            remoteTime: remoteManifest.lastSyncAt,
            remoteDevice: remoteManifest.deviceId,
            localTime: lastSyncedAt.value,
            localModifiedTime: getLatestLocalModifiedAt(),
            gist,
            rechargeGist: existingRechargeGist,
            eventGist: existingEventGist
          }
          syncStatus.value = '检测到冲突'
          return { action: 'conflict' }
        }

        syncStatus.value = '正在拉取远端数据...'
        const result = await pullFromRemote(gist, remoteManifest, existingRechargeGist, existingEventGist, {
          hydrateGoodsImages: hasDataDiff,
          hydrateTrashImages: hasDataDiff,
          hydrateEventImages: hasEventDataDiff
        })
        await saveLastSyncedAt(remoteManifest?.lastSyncAt || new Date().toISOString())
        syncStatus.value = '拉取完成'
        return { action: 'pulled', ...result }
      }

      syncStatus.value = '正在上传本地数据...'
      const imageStats = await pushToRemote(gist, existingImageGist, existingRechargeGist, existingEventGist)
      syncStatus.value = '上传完成'
      return { action: 'pushed', ...getLocalChangesSince(remoteTime || localSyncTime), ...imageStats }
    } catch (error) {
      lastError.value = error.message
      syncStatus.value = '同步失败'
      throw error
    } finally {
      isSyncing.value = false
    }
  }

  async function resolveConflict(useRemote) {
    if (!conflictData.value) return

    isSyncing.value = true
    syncStatus.value = '正在解决冲突...'

    try {
      if (useRemote) {
        syncStatus.value = '正在拉取远端数据...'
        const remoteManifest = await readJsonFromGistWithTrace({
          title: '读取 manifest.json',
          gist: conflictData.value.gist,
          fileName: MANIFEST_FILENAME,
          startDetail: '读取冲突远端摘要',
          category: 'pull',
          successDetail: (parsed) => {
            if (!parsed) return '未找到 manifest'
            return `图片 Gist ${parsed.imageGistId || '未配置'}`
          }
        })
        const hasGoodsContentDiff = !!(
          conflictData.value.remoteOnlyGoods > 0
          || conflictData.value.remoteOnlyCollection > 0
          || conflictData.value.remoteOnlyWishlist > 0
          || conflictData.value.remoteOnlyTrash > 0
          || conflictData.value.updatedGoods > 0
          || conflictData.value.localOnlyGoods > 0
          || conflictData.value.localOnlyCollection > 0
          || conflictData.value.localOnlyWishlist > 0
          || conflictData.value.localOnlyTrash > 0
        )
        const hasEventContentDiff = !!(conflictData.value.remoteOnlyEvents > 0 || conflictData.value.updatedEvents > 0 || conflictData.value.localOnlyEvents > 0)
        const result = await pullFromRemote(conflictData.value.gist, remoteManifest, conflictData.value.rechargeGist || null, conflictData.value.eventGist || null, {
          hydrateGoodsImages: hasGoodsContentDiff,
          hydrateTrashImages: hasGoodsContentDiff,
          hydrateEventImages: hasEventContentDiff
        })
        await saveLastSyncedAt(remoteManifest?.lastSyncAt || new Date().toISOString())
        conflictData.value = null
        syncStatus.value = '拉取完成'
        return { action: 'pulled', ...result }
      }

      syncStatus.value = '正在上传本地数据...'
      const imageStats = await pushToRemote(
        conflictData.value.gist,
        null,
        conflictData.value.rechargeGist || null,
        conflictData.value.eventGist || null
      )
      conflictData.value = null
      syncStatus.value = '上传完成'
      return { action: 'pushed', ...imageStats }
    } catch (error) {
      lastError.value = error.message
      syncStatus.value = '同步失败'
      throw error
    } finally {
      isSyncing.value = false
    }
  }

  function clearConflict() {
    conflictData.value = null
  }

  async function pullOnly() {
    if (isSyncing.value) return
    if (!token.value) throw new Error('未配置 Token')
    if (!gistId.value) throw new Error('未找到 Gist')

    isSyncing.value = true
    lastError.value = ''
    conflictData.value = null
    clearSyncLogs()
    syncStatus.value = '正在拉取...'

    try {
      await ensureEventsStoreReady()
      const [gist, existingRechargeGist, existingEventGist] = await Promise.all([
        getGist(token.value, gistId.value),
        getExistingRechargeGist(),
        getExistingEventGist()
      ])
      if (!gist) throw new Error('未找到 Gist')

      const [remoteManifest, remoteRechargeData, remoteEventData] = await Promise.all([
        readJsonFromGistWithTrace({
          title: '读取 manifest.json',
          gist,
          fileName: MANIFEST_FILENAME,
          startDetail: '检查远端同步摘要',
          category: 'pull',
          successDetail: (parsed) => {
            if (!parsed) return '未找到 manifest'
            return `图片 Gist ${parsed.imageGistId || '未配置'}`
          }
        }),
        readJsonFromGistWithTrace({
          title: '预检读取 recharge-data.json',
          gist,
          fileName: RECHARGE_DATA_FILENAME,
          startDetail: '读取充值记录',
          category: 'pull',
          fallbackGist: existingRechargeGist,
          fallbackFileName: RECHARGE_DATA_FILENAME,
          successDetail: (parsed, source) => {
            if (!parsed) return '未找到充值数据'
            const recharge = Array.isArray(parsed.recharge) ? parsed.recharge : []
            const rechargeTrash = Array.isArray(parsed.rechargeTrash) ? parsed.rechargeTrash : []
            return `${source}，充值 ${recharge.length} 条，回收站 ${rechargeTrash.length} 条`
          }
        }).then((result) => result || { recharge: [], rechargeTrash: [] }),
        readJsonFromGistWithTrace({
          title: '预检读取 events-data.json',
          gist,
          fileName: EVENT_DATA_FILENAME,
          startDetail: '读取活动数据',
          category: 'pull',
          fallbackGist: existingEventGist,
          fallbackFileName: EVENT_DATA_FILENAME,
          successDetail: (parsed, source) => {
            if (!parsed) return '未找到活动数据'
            const events = Array.isArray(parsed.events) ? parsed.events : []
            return `${source}，活动 ${events.length} 场`
          }
        }).then((result) => result || { events: [] })
      ])

      if (remoteManifest?.imageGistId) {
        await saveImageGistId(remoteManifest.imageGistId)
      }
      const isRemoteFromOtherDevice = !!(remoteManifest?.deviceId && remoteManifest.deviceId !== deviceId.value)
      const localSyncTime = lastSyncedAt.value ? new Date(lastSyncedAt.value).getTime() : 0
      const localEventState = buildComparableEventStateFromData(buildEventSyncData())
      const remoteEventState = buildComparableEventStateFromData(remoteEventData)
      const hasEventContentDiff = localEventState !== remoteEventState
      const localRechargeState = buildComparableRechargeStateFromData(buildRechargeSyncData({ incremental: false }))
      const remoteRechargeState = buildComparableRechargeStateFromData(remoteRechargeData)
      const hasRechargeContentDiff = localRechargeState !== remoteRechargeState
      const localChanges = getLocalChangesSince(localSyncTime)

      if (localChanges.hasChanges) {
        const diff = await buildPullConflictData(gist, remoteManifest)
        const hasPullConflict = !!(
          diff.remoteOnlyGoods > 0
          || diff.remoteOnlyCollection > 0
          || diff.remoteOnlyWishlist > 0
          || diff.remoteOnlyTrash > 0
          || diff.updatedGoods > 0
          || diff.localOnlyGoods > 0
          || diff.localOnlyCollection > 0
          || diff.localOnlyWishlist > 0
          || diff.localOnlyTrash > 0
          || diff.remoteRechargeCount > 0
          || diff.remoteOnlyRecharge > 0
          || diff.updatedRecharge > 0
          || diff.localOnlyRecharge > 0
          || diff.remoteEventCount > 0
          || diff.remoteOnlyEvents > 0
          || diff.updatedEvents > 0
          || diff.localOnlyEvents > 0
        )

        if (!hasPullConflict) {
          if (remoteManifest?.lastSyncAt) {
            await saveLastSyncedAt(remoteManifest.lastSyncAt)
          }
          syncStatus.value = '数据已是最新'
          return { action: 'no_changes' }
        }

        conflictData.value = {
          ...diff,
          rechargeGist: existingRechargeGist,
          eventGist: existingEventGist,
          isPullOnly: true
        }
        syncStatus.value = '正在拉取远端数据...'
        syncStatus.value = '检测到远端数据'
        return { action: 'conflict' }
      }

      syncStatus.value = '正在拉取远端数据...'
      const diff = await buildPullConflictData(gist, remoteManifest)
      const pullGoodsContentDiff = !!(
        diff.remoteOnlyGoods > 0
        || diff.remoteOnlyCollection > 0
        || diff.remoteOnlyWishlist > 0
        || diff.remoteOnlyTrash > 0
        || diff.updatedGoods > 0
        || diff.localOnlyGoods > 0
        || diff.localOnlyCollection > 0
        || diff.localOnlyWishlist > 0
        || diff.localOnlyTrash > 0
      )
      const pullRechargeContentDiff = !!(diff.remoteRechargeCount > 0 || diff.remoteOnlyRecharge > 0 || diff.updatedRecharge > 0 || diff.localOnlyRecharge > 0)
      const pullEventContentDiff = !!(diff.remoteEventCount > 0 || diff.remoteOnlyEvents > 0 || diff.updatedEvents > 0 || diff.localOnlyEvents > 0)

      if (!pullGoodsContentDiff && !pullRechargeContentDiff && !pullEventContentDiff) {
        if (remoteManifest?.lastSyncAt) {
          await saveLastSyncedAt(remoteManifest.lastSyncAt)
        }
        syncStatus.value = '数据已是最新'
        return { action: 'no_changes' }
      }

      const result = await pullFromRemote(gist, remoteManifest, existingRechargeGist, existingEventGist, {
        hydrateGoodsImages: pullGoodsContentDiff,
        hydrateTrashImages: pullGoodsContentDiff,
        hydrateEventImages: pullEventContentDiff
      })
      await saveLastSyncedAt(remoteManifest?.lastSyncAt || new Date().toISOString())
      syncStatus.value = '拉取完成'
      return { action: 'pulled', ...result }
    } catch (error) {
      lastError.value = error.message
      syncStatus.value = '拉取失败'
      throw error
    } finally {
      isSyncing.value = false
    }
  }

  async function resolvePullConflict(confirm) {
    if (!conflictData.value?.isPullOnly) return

    isSyncing.value = true
    syncStatus.value = '正在拉取...'

    try {
      if (!confirm) {
        syncStatus.value = '已取消'
        conflictData.value = null
        return { action: 'cancelled' }
      }

      syncStatus.value = '正在拉取远端数据...'
      const manifestContent = await getGistFileContent(token.value, conflictData.value.gist, MANIFEST_FILENAME)
      const remoteManifest = manifestContent ? JSON.parse(manifestContent) : null
      const hasGoodsContentDiff = !!(
        conflictData.value.remoteOnlyGoods > 0
        || conflictData.value.remoteOnlyCollection > 0
        || conflictData.value.remoteOnlyWishlist > 0
        || conflictData.value.remoteOnlyTrash > 0
        || conflictData.value.updatedGoods > 0
        || conflictData.value.localOnlyGoods > 0
        || conflictData.value.localOnlyCollection > 0
        || conflictData.value.localOnlyWishlist > 0
        || conflictData.value.localOnlyTrash > 0
      )
      const hasEventContentDiff = !!(conflictData.value.remoteOnlyEvents > 0 || conflictData.value.updatedEvents > 0 || conflictData.value.localOnlyEvents > 0)
      const result = await pullFromRemote(conflictData.value.gist, remoteManifest, conflictData.value.rechargeGist || null, conflictData.value.eventGist || null, {
        hydrateGoodsImages: hasGoodsContentDiff,
        hydrateTrashImages: hasGoodsContentDiff,
        hydrateEventImages: hasEventContentDiff
      })
      conflictData.value = null
      return { action: 'pulled', ...result }
    } catch (error) {
      lastError.value = error.message
      syncStatus.value = '拉取失败'
      throw error
    } finally {
      isSyncing.value = false
    }
  }

  async function resetConfig() {
    token.value = ''
    githubLogin.value = ''
    githubAvatarUrl.value = ''
    githubScopes.value = ''
    githubAuthMethod.value = ''
    gistId.value = ''
    imageGistId.value = ''
    rechargeGistId.value = ''
    eventGistId.value = ''
    lastSyncedAt.value = ''
    eventLastSyncedAt.value = ''
    await writeSyncKey(TOKEN_KEY, '')
    await writeSyncKey(GIST_ID_KEY, '')
    await writeSyncKey(IMAGE_GIST_ID_KEY, '')
    await writeSyncKey(RECHARGE_GIST_ID_KEY, '')
    await writeSyncKey(EVENT_GIST_ID_KEY, '')
    await writeSyncKey(LAST_SYNC_KEY, '')
    await writeSyncKey(EVENT_LAST_SYNC_KEY, '')
    await clearGitHubMeta()
    lastError.value = ''
    syncStatus.value = ''
    conflictData.value = null
    clearSyncLogs()
  }

  return {
    token,
    githubLogin,
    githubAvatarUrl,
    githubScopes,
    githubAuthMethod,
    gistId,
    imageGistId,
    rechargeGistId,
    eventGistId,
    lastSyncedAt,
    eventLastSyncedAt,
    deviceId,
    isInitialized,
    isSyncing,
    syncStatus,
    syncLogs,
    lastError,
    conflictData,
    isConfigured,
    init,
    saveToken,
    checkTokenValidity,
    getLocalChangesSinceLastSync,
    fullSync,
    pullOnly,
    resolveConflict,
    resolvePullConflict,
    clearConflict,
    resetConfig,
    encryptionEnabled,
    setEncryptionEnabled,
    ensureEncryptionKey,
    syncPassword,
    setSyncPassword,
    githubUserId
  }
})
