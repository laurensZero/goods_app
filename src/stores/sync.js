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
import { discoverLanDevices } from '@/services/localSync/discovery'
import { executeLocalSyncTransfer } from '@/services/localSync/apply'
import { requestGet } from '@/services/localSync/transport'
import { LOCAL_SYNC_API_PREFIX, LOCAL_SYNC_DEFAULT_PORT } from '@/services/localSync/constants'
import { deleteItems } from '@/utils/db'
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
  buildTimestampRecordMap,
  countComparableRecordDiff,
  countWishlistSplit,
  getItemTimestamp,
  resolveGoodsTrashMaps
} from '@/utils/syncShared'
import { readOrCreateDeviceId, readSyncKey, writeSyncKey } from '@/utils/syncStorage'
import { readLocalImageAsDataUrl } from '@/utils/localImage'
import { compressImageToBlob } from '@/composables/image/useImageExport'
import { parseGistImageUri } from '@/utils/goodsImages'

const TOKEN_KEY = 'sync_github_token'
const GIST_ID_KEY = 'sync_gist_id'
const IMAGE_GIST_ID_KEY = 'sync_image_gist_id'
const RECHARGE_GIST_ID_KEY = 'sync_recharge_gist_id'
const EVENT_GIST_ID_KEY = 'sync_event_gist_id'
const LAST_SYNC_KEY = 'sync_last_synced_at'
const EVENT_LAST_SYNC_KEY = 'sync_event_last_synced_at'
const DEVICE_ID_KEY = Capacitor.isNativePlatform() ? 'sync_native_device_id' : 'sync_web_device_id'

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
  const gistId = ref('')
  const imageGistId = ref('')
  const rechargeGistId = ref('')
  const eventGistId = ref('')
  const lastSyncedAt = ref('')
  const eventLastSyncedAt = ref('')
  const deviceId = ref('')
  const isInitialized = ref(false)
  const isSyncing = ref(false)
  const syncStatus = ref('')
  const lastError = ref('')
  const conflictData = ref(null)
  const lanDiscoveryStatus = ref('idle')
  const lanDevices = ref([])
  const lanManualHost = ref('')
  const lanLastError = ref('')
  const isLanSyncing = ref(false)
  const lanTransferProgress = ref({
    stage: 'prepare',
    message: '',
    totalFiles: 0,
    completedFiles: 0,
    currentFile: ''
  })
  const lanLastSessionId = ref('')
  const lanNeedsManualHost = computed(() => lanDiscoveryStatus.value === 'failed' && lanDevices.value.length === 0)

  const isConfigured = computed(() => !!token.value && !!gistId.value)

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

      return {
        parsed: JSON.parse(content),
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

  async function init() {
    await ensureEventsStoreReady()
    token.value = (await readSyncKey(TOKEN_KEY)) || ''
    gistId.value = (await readSyncKey(GIST_ID_KEY)) || ''
    imageGistId.value = (await readSyncKey(IMAGE_GIST_ID_KEY)) || ''
    rechargeGistId.value = (await readSyncKey(RECHARGE_GIST_ID_KEY)) || ''
    eventGistId.value = (await readSyncKey(EVENT_GIST_ID_KEY)) || ''
    lastSyncedAt.value = (await readSyncKey(LAST_SYNC_KEY)) || ''
    eventLastSyncedAt.value = (await readSyncKey(EVENT_LAST_SYNC_KEY)) || ''
    deviceId.value = await readOrCreateDeviceId(DEVICE_ID_KEY, generateDeviceId)
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

    async function saveToken(newToken) {
    token.value = newToken
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
    eventCoverPrefix: EVENT_COVER_PREFIX
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
    deleteItems,
    constants: {
      DATA_FILENAME,
      RECHARGE_DATA_FILENAME,
      EVENT_DATA_FILENAME,
      MANIFEST_FILENAME
    }
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

  async function discoverLocalDevices({ seedHost = '', preferredPort = LOCAL_SYNC_DEFAULT_PORT } = {}) {
    lanDiscoveryStatus.value = 'searching'
    lanLastError.value = ''

    try {
      const devices = await discoverLanDevices({
        seedHost,
        preferredPort,
        allowSubnetSweep: true
      })
      lanDevices.value = devices
      lanDiscoveryStatus.value = devices.length > 0 ? 'ready' : 'failed'
      if (devices.length === 0) {
        lanLastError.value = '未自动发现设备。你可以手动填写接收端 IP。'
      }
      return devices
    } catch (error) {
      lanDevices.value = []
      lanDiscoveryStatus.value = 'failed'
      lanLastError.value = error.message || '设备发现失败'
      return []
    }
  }

  async function startLanSync({ host = '', port = LOCAL_SYNC_DEFAULT_PORT } = {}) {
    if (isSyncing.value || isLanSyncing.value) {
      return { action: 'skipped', reason: 'syncing' }
    }

    const targetHost = String(host || lanManualHost.value || '').trim()
    if (!targetHost) {
      throw new Error('请先选择设备，或填写接收端 IP 地址')
    }

    isLanSyncing.value = true
    lanLastError.value = ''
    lanTransferProgress.value = {
      stage: 'prepare',
      message: '正在准备本地数据...',
      totalFiles: 0,
      completedFiles: 0,
      currentFile: ''
    }

    try {
      await ensureEventsStoreReady()
      const goodsPayloadBundle = await buildSyncPayload({ incremental: false })
      const goodsPayload = goodsPayloadBundle.syncData
      const rechargePayload = buildRechargeSyncData({ incremental: false })
      const eventPayloadBundle = await buildEventSyncPayload({})
      const eventPayload = eventPayloadBundle.eventData
      const imagesPayload = {
        version: 1,
        updatedAt: new Date().toISOString(),
        deviceId: deviceId.value,
        goodsImageFiles: goodsPayloadBundle.imageFiles || {},
        eventImageFiles: eventPayloadBundle.imageFiles || {}
      }
      const stableSignatures = {
        goods: await buildComparableSyncStateFromData(goodsPayload),
        recharge: buildComparableRechargeStateFromData(rechargePayload),
        events: buildComparableEventStateFromData(eventPayload),
        images: JSON.stringify(imagesPayload)
      }
      const result = await executeLocalSyncTransfer({
        receiverHost: targetHost,
        receiverPort: Number(port) || LOCAL_SYNC_DEFAULT_PORT,
        senderDeviceId: deviceId.value,
        senderDeviceName: Capacitor.getPlatform?.() || 'unknown',
        goodsData: goodsPayload,
        rechargeData: rechargePayload,
        eventData: eventPayload,
        imagesData: imagesPayload,
        updatedAt: new Date().toISOString(),
        stableSignatures,
        options: {
          onProgress: (progress) => {
            lanTransferProgress.value = {
              ...progress,
              currentFile: progress.currentFile || ''
            }
          }
        }
      })
      lanLastSessionId.value = result.sessionId || ''
      lanTransferProgress.value = {
        stage: 'done',
        message: '局域网同步完成',
        totalFiles: Number(result.acceptedFiles || 0) + Number(result.skippedFiles || 0),
        completedFiles: Number(result.acceptedFiles || 0) + Number(result.skippedFiles || 0),
        currentFile: ''
      }
      return {
        action: 'pushed',
        ...result
      }
    } catch (error) {
      lanTransferProgress.value = {
        ...lanTransferProgress.value,
        stage: 'error',
        message: error.message || '局域网同步失败'
      }
      lanLastError.value = error.message || '局域网同步失败'
      throw error
    } finally {
      isLanSyncing.value = false
    }
  }

  function resolveLanReceiverBaseUrl(host, port) {
    const trimmedHost = String(host || '').trim()
    if (!trimmedHost) {
      throw new Error('请先选择接收端设备，或填写接收端 IP 地址')
    }

    if (/^https?:\/\//i.test(trimmedHost)) {
      return trimmedHost
    }

    if (trimmedHost.includes(':')) {
      return `http://${trimmedHost}`
    }

    return `http://${trimmedHost}:${Number(port) || LOCAL_SYNC_DEFAULT_PORT}`
  }

  function buildRechargeComparableMap(items = []) {
    const map = new Map()
    for (const item of items) {
      const key = [
        String(item?.game || '').trim().toLowerCase(),
        String(item?.itemName || '').trim().toLowerCase(),
        String(item?.chargedAt || '').trim(),
        String(item?.note || '').trim(),
        String(Number(item?.amount || 0))
      ].join('|')

      if (!key) continue

      map.set(key, JSON.stringify({
        ...item,
        id: '',
        image: ''
      }))
    }
    return map
  }

  async function previewLanCurrentSnapshot({ host = '', port = LOCAL_SYNC_DEFAULT_PORT } = {}) {
    const targetHost = String(host || lanManualHost.value || '').trim()
    const targetBaseUrl = resolveLanReceiverBaseUrl(targetHost, port)

    await ensureEventsStoreReady()
    const goodsStore = useGoodsStore()
    const rechargeStore = useRechargeStore()
    const eventsStore = useEventsStore()
    if (!goodsStore.isReady) {
      await goodsStore.init()
    }

    const response = await requestGet(targetBaseUrl, `${LOCAL_SYNC_API_PREFIX}/current-content`)
    const payload = response?.payload || response || {}
    const goodsData = payload?.goods || {}
    const rechargeData = payload?.recharge || {}
    const eventData = payload?.events || {}

    const resolvedLocal = resolveGoodsTrashMaps(goodsStore.list, goodsStore.trashList)
    const resolvedRemote = resolveGoodsTrashMaps(
      Array.isArray(goodsData?.goods) ? goodsData.goods : [],
      Array.isArray(goodsData?.trash) ? goodsData.trash : []
    )

    const localGoodsMap = resolvedLocal.goodsMap
    const localTrashMap = resolvedLocal.trashMap
    const remoteGoods = [...resolvedRemote.goodsMap.values()]
    const remoteTrash = [...resolvedRemote.trashMap.values()]
    const remoteGoodsMap = new Map(remoteGoods.map((item) => [item.id, item]))
    const remoteTrashMap = new Map(remoteTrash.map((item) => [item.id, item]))

    let remoteOnlyGoods = 0
    let remoteOnlyCollection = 0
    let remoteOnlyWishlist = 0
    let remoteOnlyTrash = 0
    let localOnlyCollection = 0
    let localOnlyWishlist = 0
    let updatedGoods = 0

    for (const remoteItem of remoteGoods) {
      const localGoodsItem = localGoodsMap.get(remoteItem.id)
      const localTrashItem = localTrashMap.get(remoteItem.id)

      if (!localGoodsItem && !localTrashItem) {
        remoteOnlyGoods += 1
        if (remoteItem?.isWishlist) {
          remoteOnlyWishlist += 1
        } else {
          remoteOnlyCollection += 1
        }
      } else if (localGoodsItem && shouldApplyRemoteItem(localGoodsItem, remoteItem)) {
        updatedGoods += 1
      } else if (localTrashItem && shouldApplyRemoteItem(localTrashItem, remoteItem)) {
        updatedGoods += 1
      }
    }

    for (const remoteItem of remoteTrash) {
      if (!localTrashMap.has(remoteItem.id) && !localGoodsMap.has(remoteItem.id)) {
        remoteOnlyTrash += 1
      }
    }

    const localOnlyGoods = [...localGoodsMap.keys()].filter((id) => !remoteGoodsMap.has(id) && !remoteTrashMap.has(id)).length
    const localOnlyTrash = [...localTrashMap.keys()].filter((id) => !remoteTrashMap.has(id) && !remoteGoodsMap.has(id)).length
    for (const item of localGoodsMap.values()) {
      if (remoteGoodsMap.has(item.id) || remoteTrashMap.has(item.id)) continue
      if (item?.isWishlist) {
        localOnlyWishlist += 1
      } else {
        localOnlyCollection += 1
      }
    }

    const remoteRechargeList = Array.isArray(rechargeData?.recharge)
      ? rechargeData.recharge
      : (Array.isArray(rechargeData?.rechargeRecords) ? rechargeData.rechargeRecords : [])
    const localRechargeList = rechargeStore.exportBackup({ includeDeleted: false, stripImage: true })
    const rechargeDiff = countComparableRecordDiff(
      buildRechargeComparableMap(localRechargeList),
      buildRechargeComparableMap(remoteRechargeList)
    )

    const remoteEvents = Array.isArray(eventData?.events) ? eventData.events : []
    const eventDiff = countComparableRecordDiff(
      buildTimestampRecordMap(eventsStore.list || []),
      buildTimestampRecordMap(remoteEvents)
    )

    const remoteCounts = countWishlistSplit(remoteGoods)
    const remoteTimeCandidates = [
      String(goodsData?.updatedAt || ''),
      String(rechargeData?.updatedAt || ''),
      String(eventData?.updatedAt || ''),
      String(response?.updatedAt || '')
    ].filter(Boolean)

    return {
      remoteTime: remoteTimeCandidates[0] || new Date().toISOString(),
      remoteDevice: `${targetHost}:${Number(port) || LOCAL_SYNC_DEFAULT_PORT}`,
      localTime: lastSyncedAt.value,
      localModifiedTime: getLatestLocalModifiedAt(),
      remoteGoodsCount: remoteGoods.length,
      remoteCollectionCount: remoteCounts.collection,
      remoteWishlistCount: remoteCounts.wishlist,
      remoteTrashCount: remoteTrash.length,
      remoteOnlyGoods,
      remoteOnlyCollection,
      remoteOnlyWishlist,
      remoteOnlyTrash,
      remoteRechargeCount: rechargeDiff.remoteTotal,
      remoteOnlyRecharge: rechargeDiff.remoteOnly,
      updatedRecharge: rechargeDiff.updated,
      localOnlyRecharge: rechargeDiff.localOnly,
      remoteEventCount: eventDiff.remoteTotal,
      remoteOnlyEvents: eventDiff.remoteOnly,
      updatedEvents: eventDiff.updated,
      localOnlyEvents: eventDiff.localOnly,
      remoteImageCount: 0,
      remoteOnlyImages: 0,
      updatedImages: 0,
      localOnlyImages: 0,
      localOnlyGoods,
      localOnlyCollection,
      localOnlyWishlist,
      localOnlyTrash,
      updatedGoods
    }
  }

  async function pullLanCurrentSnapshot({ host = '', port = LOCAL_SYNC_DEFAULT_PORT } = {}) {
    if (isSyncing.value || isLanSyncing.value) {
      return { action: 'skipped', reason: 'syncing' }
    }

    const targetHost = String(host || lanManualHost.value || '').trim()
    const targetBaseUrl = resolveLanReceiverBaseUrl(targetHost, port)

    isLanSyncing.value = true
    lanLastError.value = ''
    lanTransferProgress.value = {
      stage: 'prepare',
      message: '正在读取接收端快照...',
      totalFiles: 3,
      completedFiles: 0,
      currentFile: ''
    }

    try {
      await ensureEventsStoreReady()
      const goodsStore = useGoodsStore()
      const rechargeStore = useRechargeStore()
      const eventsStore = useEventsStore()
      const presetsStore = usePresetsStore()

      if (!goodsStore.isReady) {
        await goodsStore.init()
      }
      if (!rechargeStore.initialized) {
        rechargeStore.init?.()
      }
      if (!presetsStore.isReady) {
        await presetsStore.init()
      }

      lanTransferProgress.value = {
        stage: 'manifest',
        message: '正在从接收端拉取最新内容...',
        totalFiles: 3,
        completedFiles: 0,
        currentFile: 'current-content'
      }

      const response = await requestGet(targetBaseUrl, `${LOCAL_SYNC_API_PREFIX}/current-content`)
      const payload = response?.payload || response || {}
      const goodsData = payload?.goods || null
      const rechargeData = payload?.recharge || null
      const eventData = payload?.events || null
      const imagesData = payload?.images || null

      if (!goodsData && !rechargeData && !eventData) {
        throw new Error('接收端当前没有可导入的同步数据')
      }

      lanTransferProgress.value = {
        stage: 'files',
        message: '正在应用收藏和回收站...',
        totalFiles: 3,
        completedFiles: 0,
        currentFile: 'goods.json'
      }

      const resolvedGoods = resolveGoodsTrashMaps(
        Array.isArray(goodsData?.goods) ? goodsData.goods : [],
        Array.isArray(goodsData?.trash) ? goodsData.trash : []
      )
      const goodsImageFiles = imagesData?.goodsImageFiles && typeof imagesData.goodsImageFiles === 'object'
        ? imagesData.goodsImageFiles
        : {}
      const eventImageFiles = imagesData?.eventImageFiles && typeof imagesData.eventImageFiles === 'object'
        ? imagesData.eventImageFiles
        : {}

      const hydrateGoodsItemImages = (item) => {
        const images = Array.isArray(item?.images) ? item.images : []
        const hydratedImages = images.map((entry) => {
          const gistFileName = String(entry?.gistFileName || parseGistImageUri(entry?.uri) || '').trim()
          const raw = goodsImageFiles[gistFileName]?.content
          if (!gistFileName || typeof raw !== 'string' || !raw.startsWith('data:image/')) {
            return entry
          }

          return {
            ...entry,
            uri: raw,
            storageMode: 'inline-local',
            localPath: '',
            gistFileName: ''
          }
        })

        return {
          ...item,
          images: hydratedImages
        }
      }

      const remoteGoods = [...resolvedGoods.goodsMap.values()].map((item) => hydrateGoodsItemImages(item))
      const remoteTrash = [...resolvedGoods.trashMap.values()].map((item) => hydrateGoodsItemImages(item))
      const importedGoods = await goodsStore.importGoodsBackup(remoteGoods)
      const updatedGoods = await goodsStore.updateGoodsBackup(remoteGoods)
      const importedTrash = await goodsStore.importTrashBackup(remoteTrash)
      const updatedTrash = await goodsStore.updateTrashBackup(remoteTrash)

      if (goodsData?.presets) {
        await presetsStore.replacePresetsSnapshot(goodsData.presets)
      }

      lanTransferProgress.value = {
        stage: 'files',
        message: '正在应用充值记录...',
        totalFiles: 3,
        completedFiles: 1,
        currentFile: 'recharge.json'
      }

      const rechargePayload = Array.isArray(rechargeData?.recharge)
        ? rechargeData.recharge
        : (Array.isArray(rechargeData?.rechargeRecords) ? rechargeData.rechargeRecords : [])
      const rechargeApplyResult = rechargeStore.importBackup(
        rechargePayload.filter((item) => !item?.deleted)
      )

      lanTransferProgress.value = {
        stage: 'files',
        message: '正在应用活动数据...',
        totalFiles: 3,
        completedFiles: 2,
        currentFile: 'events.json'
      }

      const eventApplyResult = await eventsStore.importEventsBackup(
        (Array.isArray(eventData?.events) ? eventData.events : []).map((item) => {
          const gistFileName = String(item?.coverImageData?.gistFileName || parseGistImageUri(item?.coverImage) || '').trim()
          const raw = eventImageFiles[gistFileName]?.content
          if (!gistFileName || typeof raw !== 'string' || !raw.startsWith('data:image/')) {
            return item
          }

          return {
            ...item,
            coverImage: raw,
            coverImageData: {
              ...(item.coverImageData || {}),
              uri: raw,
              storageMode: 'inline-local',
              gistFileName: ''
            }
          }
        }),
        { reconcileMissing: false }
      )

      if (eventData?.updatedAt) {
        await saveEventLastSyncedAt(eventData.updatedAt)
      }

      lanTransferProgress.value = {
        stage: 'done',
        message: '局域网导入完成',
        totalFiles: 3,
        completedFiles: 3,
        currentFile: ''
      }

      return {
        action: 'pulled',
        importedGoods,
        updatedGoods,
        importedTrash,
        updatedTrash,
        importedRecharge: rechargeApplyResult?.added || 0,
        updatedRecharge: rechargeApplyResult?.updated || 0,
        importedEvents: eventApplyResult?.added || 0,
        updatedEvents: eventApplyResult?.updated || 0,
        totalGoods: remoteGoods.length,
        totalTrash: remoteTrash.length,
        totalRecharge: rechargeApplyResult?.total || rechargePayload.length,
        totalEvents: Array.isArray(eventData?.events) ? eventData.events.length : 0
      }
    } catch (error) {
      lanTransferProgress.value = {
        ...lanTransferProgress.value,
        stage: 'error',
        message: error.message || '局域网导入失败'
      }
      lanLastError.value = error.message || '局域网导入失败'
      throw error
    } finally {
      isLanSyncing.value = false
    }
  }

  function setLanManualHost(host) {
    lanManualHost.value = String(host || '').trim()
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
          hydrateGoodsImages: false,
          hydrateTrashImages: false,
          hydrateEventImages: false
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
      const gist = await getGist(token.value, gistId.value)
      if (!gist) throw new Error('未找到 Gist')
      const existingRechargeGist = await getExistingRechargeGist()
      const existingEventGist = await getExistingEventGist()

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
      const isRemoteFromOtherDevice = !!(remoteManifest?.deviceId && remoteManifest.deviceId !== deviceId.value)
      const localSyncTime = lastSyncedAt.value ? new Date(lastSyncedAt.value).getTime() : 0
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
      }) || { recharge: [], rechargeTrash: [] }
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
      const localEventState = buildComparableEventStateFromData(buildEventSyncData())
      const remoteEventState = buildComparableEventStateFromData(remoteEventData)
      const hasEventContentDiff = localEventState !== remoteEventState
      const localRechargeState = buildComparableRechargeStateFromData(buildRechargeSyncData({ incremental: false }))
      const remoteRechargeState = buildComparableRechargeStateFromData(remoteRechargeData)
      const hasRechargeContentDiff = localRechargeState !== remoteRechargeState
      const localChanges = getLocalChangesSince(localSyncTime)

      if (localChanges.hasChanges) {
        const diff = await buildPullConflictData(gist, remoteManifest)
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
    lastError.value = ''
    syncStatus.value = ''
    conflictData.value = null
    lanDiscoveryStatus.value = 'idle'
    lanDevices.value = []
    lanManualHost.value = ''
    lanLastError.value = ''
    lanTransferProgress.value = {
      stage: 'prepare',
      message: '',
      totalFiles: 0,
      completedFiles: 0,
      currentFile: ''
    }
    lanLastSessionId.value = ''
    clearSyncLogs()
  }

  return {
    token,
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
    lanDiscoveryStatus,
    lanDevices,
    lanManualHost,
    lanLastError,
    isLanSyncing,
    lanTransferProgress,
    lanLastSessionId,
    lanNeedsManualHost,
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
    discoverLocalDevices,
    startLanSync,
    previewLanCurrentSnapshot,
    pullLanCurrentSnapshot,
    setLanManualHost
  }
})
