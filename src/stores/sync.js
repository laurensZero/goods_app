import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { useGoodsStore } from './goods'
import { useEventsStore } from './events'
import { usePresetsStore, normalizeCharacterName } from './presets'
import { useRechargeStore } from '@/composables/recharge/useRechargeStore'
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
  buildGistImageUri,
  inferGoodsImageStorageMode,
  normalizeGoodsImageList,
  parseGistImageUri,
  sanitizeGoodsItemForSync
} from '@/utils/goodsImages'
import { readLocalImageAsDataUrl } from '@/utils/localImage'
import { compressImageToBlob } from '@/composables/image/useImageExport'

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
const MAX_SYNC_LOGS = 160

const MIME_EXTENSION_MAP = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/svg+xml': 'svg'
}

function generateDeviceId() {
  const platform = IS_NATIVE ? 'native' : 'web'
  return `device_${platform}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function getItemTimestamp(item) {
  return Number(item?.updatedAt) || 0
}

function shouldApplyRemoteItem(localItem, remoteItem) {
  if (!localItem) return true
  return getItemTimestamp(remoteItem) > getItemTimestamp(localItem)
}

function hasRemoteImageChangesSince(localSyncTime, remoteManifest, currentImageGistId = '') {
  const remoteImageGistId = String(remoteManifest?.imageGistId || '').trim()
  if (remoteImageGistId && remoteImageGistId !== String(currentImageGistId || '').trim()) {
    return true
  }

  const remoteImageUpdatedAt = remoteManifest?.imageUpdatedAt
    ? new Date(remoteManifest.imageUpdatedAt).getTime()
    : 0

  return remoteImageUpdatedAt > localSyncTime
}

function countWishlistSplit(items = []) {
  let collection = 0
  let wishlist = 0

  for (const item of items) {
    if (item?.isWishlist) {
      wishlist += 1
    } else {
      collection += 1
    }
  }

  return { collection, wishlist }
}

function buildComparableRecordMap(items = []) {
  const map = new Map()
  for (const item of items) {
    const id = String(item?.id || '').trim()
    if (!id) continue
    map.set(id, JSON.stringify(sortObjectKeys(item)))
  }
  return map
}

function buildTimestampRecordMap(items = []) {
  const map = new Map()
  for (const item of items) {
    const id = String(item?.id || '').trim()
    if (!id) continue
    map.set(id, Number(item?.updatedAt) || 0)
  }
  return map
}

function countComparableRecordDiff(localMap, remoteMap) {
  let remoteOnly = 0
  let localOnly = 0
  let updated = 0

  for (const [id, remoteValue] of remoteMap.entries()) {
    if (!localMap.has(id)) {
      remoteOnly += 1
      continue
    }
    if (localMap.get(id) !== remoteValue) {
      updated += 1
    }
  }

  for (const id of localMap.keys()) {
    if (!remoteMap.has(id)) {
      localOnly += 1
    }
  }

  return {
    remoteTotal: remoteMap.size,
    remoteOnly,
    localOnly,
    updated
  }
}

function buildGoodsImageReferenceMap(items = []) {
  const map = new Map()

  for (const item of items) {
    const itemId = String(item?.id || '').trim()
    if (!itemId) continue

    for (const imageEntry of normalizeGoodsImageList(item?.images)) {
      const imageId = String(imageEntry?.id || '').trim()
      const uri = String(imageEntry?.uri || '').trim()
      if (!imageId || !uri) continue

      const storageMode = inferGoodsImageStorageMode(uri, imageEntry?.storageMode)
      if (!['gist-local', 'linked-local', 'inline-local'].includes(storageMode)) continue

      const gistFileName = String(imageEntry?.gistFileName || parseGistImageUri(uri) || '').trim()
      const version = gistFileName || `${getItemTimestamp(item)}::${imageId}`
      map.set(`goods:${itemId}:${imageId}`, version)
    }
  }

  return map
}

function buildEventImageReferenceMap(events = []) {
  const map = new Map()

  for (const event of events) {
    const eventId = String(event?.id || '').trim()
    const coverImage = String(event?.coverImage || '').trim()
    if (!eventId || !coverImage) continue

    const storageMode = inferGoodsImageStorageMode(coverImage, event?.coverImageData?.storageMode)
    if (!['gist-local', 'linked-local', 'inline-local'].includes(storageMode)) continue

    const gistFileName = String(event?.coverImageData?.gistFileName || parseGistImageUri(coverImage) || '').trim()
    const version = gistFileName || `${Number(event?.updatedAt) || 0}::cover`
    map.set(`event:${eventId}`, version)
  }

  return map
}

function buildImageReferenceMap({ goods = [], trash = [], events = [] } = {}) {
  return new Map([
    ...buildGoodsImageReferenceMap(goods).entries(),
    ...buildGoodsImageReferenceMap(trash).entries(),
    ...buildEventImageReferenceMap(events).entries()
  ])
}

function resolveGoodsTrashMaps(goodsList = [], trashList = []) {
  const goodsMap = new Map(goodsList.map((item) => [item.id, item]))
  const trashMap = new Map(trashList.map((item) => [item.id, item]))

  for (const [id, trashItem] of trashMap) {
    const goodsItem = goodsMap.get(id)
    if (!goodsItem) continue

    if (getItemTimestamp(trashItem) >= getItemTimestamp(goodsItem)) {
      goodsMap.delete(id)
    } else {
      trashMap.delete(id)
    }
  }

  return { goodsMap, trashMap }
}

function sortObjectKeys(value) {
  if (Array.isArray(value)) {
    return value.map(sortObjectKeys)
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  return Object.keys(value)
    .sort()
    .reduce((result, key) => {
      result[key] = sortObjectKeys(value[key])
      return result
    }, {})
}

async function readKey(key) {
  if (IS_NATIVE) {
    try {
      const { value } = await Preferences.get({ key })
      if (value !== null) return value
    } catch {
      // fall through
    }
  }

  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

async function writeKey(key, value) {
  try {
    localStorage.setItem(key, value ?? '')
  } catch {
    // ignore
  }

  if (!IS_NATIVE) return

  try {
    await Preferences.set({ key, value: value ?? '' })
  } catch {
    // ignore
  }
}

async function readDeviceId() {
  if (IS_NATIVE) {
    try {
      const { value } = await Preferences.get({ key: DEVICE_ID_KEY })
      if (value) return value
    } catch {
      // fall through
    }
  }

  let id = ''
  try {
    id = localStorage.getItem(DEVICE_ID_KEY) || ''
  } catch {
    id = ''
  }

  if (id) return id

  id = generateDeviceId()

  try {
    localStorage.setItem(DEVICE_ID_KEY, id)
  } catch {
    // ignore
  }

  if (IS_NATIVE) {
    try {
      await Preferences.set({ key: DEVICE_ID_KEY, value: id })
    } catch {
      // ignore
    }
  }

  return id
}

function sanitizeFilenamePart(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    || 'unknown'
}

function getBase64ByteSize(base64Data) {
  const normalized = String(base64Data || '').trim()
  if (!normalized) return 0
  const padding = normalized.endsWith('==') ? 2 : (normalized.endsWith('=') ? 1 : 0)
  return Math.floor((normalized.length * 3) / 4) - padding
}

function parseImageDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
  if (!match) return null

  const mimeType = match[1].toLowerCase()
  const base64Data = match[2]

  return {
    mimeType,
    base64Data,
    fileSize: getBase64ByteSize(base64Data)
  }
}

function resolveImageExtension(mimeType, fallbackName = '') {
  const normalizedMimeType = String(mimeType || '').trim().toLowerCase()
  if (MIME_EXTENSION_MAP[normalizedMimeType]) return MIME_EXTENSION_MAP[normalizedMimeType]

  const nameExt = String(fallbackName || '').split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '')
  return nameExt || 'jpg'
}

function buildImageFilename(item, imageEntry, mimeType) {
  const itemId = sanitizeFilenamePart(item?.id)
  const imageId = sanitizeFilenamePart(imageEntry?.id)
  const updatedAt = String(getItemTimestamp(item) || 0)
  const extension = resolveImageExtension(mimeType, imageEntry?.uri || imageEntry?.gistFileName || '')
  return `${IMAGE_FILE_PREFIX}${itemId}__${imageId}__${updatedAt}.${extension}.txt`
}

function buildEventCoverFilename(event, mimeType) {
  const eventId = sanitizeFilenamePart(event?.id)
  const updatedAt = String(event?.updatedAt || 0)
  const extension = resolveImageExtension(mimeType, event?.coverImage || '')
  return `${EVENT_COVER_PREFIX}${eventId}__${updatedAt}.${extension}.txt`
}

function buildImageSyncStats() {
  return {
    uploadedImages: 0,
    reusedImages: 0,
    restoredImages: 0,
    imageFileCount: 0,
    imageUpdatedAt: ''
  }
}

function createSyncLogId() {
  return `sync-log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function getSyncNow() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }

  return Date.now()
}

function normalizeSyncLogText(value) {
  return String(value ?? '').trim()
}

export const useSyncStore = defineStore('sync', () => {

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
  const syncLogs = ref([])
  const lastError = ref('')
  const conflictData = ref(null)

  const isConfigured = computed(() => !!token.value && !!gistId.value)

  function clearSyncLogs() {
    syncLogs.value = []
  }

  function appendSyncLog(entry) {
    const nextEntry = {
      id: createSyncLogId(),
      timestamp: new Date().toISOString(),
      status: normalizeSyncLogText(entry?.status) || 'success',
      level: normalizeSyncLogText(entry?.level) || 'info',
      title: normalizeSyncLogText(entry?.title),
      detail: normalizeSyncLogText(entry?.detail),
      durationMs: Number.isFinite(Number(entry?.durationMs)) ? Math.max(0, Math.round(Number(entry.durationMs))) : null,
      category: normalizeSyncLogText(entry?.category),
      finishedAt: normalizeSyncLogText(entry?.finishedAt)
    }

    syncLogs.value = [...syncLogs.value, nextEntry].slice(-MAX_SYNC_LOGS)
    return nextEntry.id
  }

  function updateSyncLog(logId, patch = {}) {
    if (!logId) return

    syncLogs.value = syncLogs.value.map((entry) => {
      if (entry.id !== logId) return entry

      const nextEntry = { ...entry }
      if (patch.title !== undefined) nextEntry.title = normalizeSyncLogText(patch.title)
      if (patch.detail !== undefined) nextEntry.detail = normalizeSyncLogText(patch.detail)
      if (patch.status !== undefined) nextEntry.status = normalizeSyncLogText(patch.status) || nextEntry.status
      if (patch.level !== undefined) nextEntry.level = normalizeSyncLogText(patch.level) || nextEntry.level
      if (patch.category !== undefined) nextEntry.category = normalizeSyncLogText(patch.category)
      if (patch.durationMs !== undefined) {
        const numericDuration = Number(patch.durationMs)
        nextEntry.durationMs = Number.isFinite(numericDuration) ? Math.max(0, Math.round(numericDuration)) : null
      }
      if (patch.timestamp !== undefined) nextEntry.timestamp = normalizeSyncLogText(patch.timestamp)
      if (patch.finishedAt !== undefined) nextEntry.finishedAt = normalizeSyncLogText(patch.finishedAt)

      return nextEntry
    })
  }

  async function trackSyncStep(title, task, options = {}) {
    const startedAt = getSyncNow()
    const logId = appendSyncLog({
      status: 'running',
      level: options.startLevel || 'info',
      title,
      detail: options.startDetail || '处理中...',
      category: options.category || ''
    })

    try {
      const result = await task()
      const durationMs = Math.max(0, Math.round(getSyncNow() - startedAt))
      const detail = typeof options.successDetail === 'function'
        ? options.successDetail(result, durationMs)
        : options.successDetail

      updateSyncLog(logId, {
        status: 'success',
        level: options.successLevel || 'success',
        detail: detail !== undefined ? detail : '',
        durationMs,
        finishedAt: new Date().toISOString()
      })
      return result
    } catch (error) {
      const durationMs = Math.max(0, Math.round(getSyncNow() - startedAt))
      const detail = typeof options.errorDetail === 'function'
        ? options.errorDetail(error, durationMs)
        : options.errorDetail

      updateSyncLog(logId, {
        status: 'error',
        level: options.errorLevel || 'error',
        detail: detail !== undefined ? detail : (error?.message || '同步失败'),
        durationMs,
        finishedAt: new Date().toISOString()
      })
      throw error
    }
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
    token.value = (await readKey(TOKEN_KEY)) || ''
    gistId.value = (await readKey(GIST_ID_KEY)) || ''
    imageGistId.value = (await readKey(IMAGE_GIST_ID_KEY)) || ''
    rechargeGistId.value = (await readKey(RECHARGE_GIST_ID_KEY)) || ''
    eventGistId.value = (await readKey(EVENT_GIST_ID_KEY)) || ''
    lastSyncedAt.value = (await readKey(LAST_SYNC_KEY)) || ''
    eventLastSyncedAt.value = (await readKey(EVENT_LAST_SYNC_KEY)) || ''
    deviceId.value = await readDeviceId()
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
    await writeKey(TOKEN_KEY, newToken)
    gistId.value = ''
    imageGistId.value = ''
    rechargeGistId.value = ''
    eventGistId.value = ''
    lastSyncedAt.value = ''
    eventLastSyncedAt.value = ''
    await writeKey(GIST_ID_KEY, '')
    await writeKey(IMAGE_GIST_ID_KEY, '')
    await writeKey(RECHARGE_GIST_ID_KEY, '')
    await writeKey(EVENT_GIST_ID_KEY, '')
    await writeKey(LAST_SYNC_KEY, '')
    await writeKey(EVENT_LAST_SYNC_KEY, '')
    lastError.value = ''
    syncStatus.value = ''
    conflictData.value = null
    clearSyncLogs()
  }

  async function saveGistId(newGistId) {
    gistId.value = newGistId
    await writeKey(GIST_ID_KEY, newGistId)
  }

  async function saveImageGistId(newImageGistId) {
    imageGistId.value = newImageGistId
    await writeKey(IMAGE_GIST_ID_KEY, newImageGistId)
  }

  async function saveRechargeGistId(newRechargeGistId) {
    rechargeGistId.value = newRechargeGistId
    await writeKey(RECHARGE_GIST_ID_KEY, newRechargeGistId)
  }

  async function saveEventGistId(newEventGistId) {
    eventGistId.value = newEventGistId
    await writeKey(EVENT_GIST_ID_KEY, newEventGistId)
  }

  async function saveLastSyncedAt(timestamp) {
    lastSyncedAt.value = timestamp
    await writeKey(LAST_SYNC_KEY, timestamp)
  }

  async function saveEventLastSyncedAt(timestamp) {
    eventLastSyncedAt.value = timestamp
    await writeKey(EVENT_LAST_SYNC_KEY, timestamp)
  }

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

  async function prepareImagesForSync(item, imageFiles, imageStats, referencedImageFiles, existingImageFiles) {
    const normalizedImages = normalizeGoodsImageList(item?.images)
    if (normalizedImages.length === 0) return []

    const preparedImages = []

    for (const imageEntry of normalizedImages) {
      const storageMode = inferGoodsImageStorageMode(imageEntry.uri, imageEntry.storageMode)

      if (storageMode === 'remote') {
        preparedImages.push({
          ...imageEntry,
          storageMode: 'remote',
          gistFileName: '',
          mimeType: '',
          fileSize: 0
        })
        continue
      }

      let imageDataUrl = await readLocalImageAsDataUrl(imageEntry.uri, imageEntry.localPath)
      if (!imageDataUrl?.startsWith('data:image/')) {
        throw new Error(`图片读取失败：${item?.name || item?.id || '未命名条目'}`)
      }

      let parsedData = parseImageDataUrl(imageDataUrl)
      if (!parsedData) {
        throw new Error(`图片格式不支持：${item?.name || item?.id || '未命名条目'}`)
      }

      if (parsedData.fileSize > IMAGE_FILE_SIZE_LIMIT) {
        const compressedBlob = await compressImageToBlob(imageDataUrl, {
          maxBytes: IMAGE_FILE_SIZE_LIMIT - 1024,
          maxEdge: 2048,
          format: 'image/jpeg'
        })
        if (!compressedBlob) {
          throw new Error(`图片压缩失败：${item?.name || item?.id || '未命名条目'}`)
        }
        const reader = new FileReader()
        const compressedDataUrl = await new Promise((resolve, reject) => {
          reader.onload = () => resolve(reader.result)
          reader.onerror = reject
          reader.readAsDataURL(compressedBlob)
        })
        const compressedParsed = parseImageDataUrl(compressedDataUrl)
        if (!compressedParsed) {
          throw new Error(`图片压缩后格式无效：${item?.name || item?.id || '未命名条目'}`)
        }
        parsedData = compressedParsed
        imageDataUrl = compressedDataUrl
      }

      const gistFileName = buildImageFilename(item, imageEntry, parsedData.mimeType)
      referencedImageFiles.add(gistFileName)

      if (existingImageFiles?.has(gistFileName)) {
        imageStats.reusedImages += 1
      } else if (imageFiles) {
        imageFiles[gistFileName] = { content: imageDataUrl }
        imageStats.uploadedImages += 1
      }

      imageStats.imageUpdatedAt = new Date().toISOString()

      preparedImages.push({
        ...imageEntry,
        uri: buildGistImageUri(gistFileName),
        storageMode: 'gist-local',
        gistFileName,
        mimeType: parsedData.mimeType,
        fileSize: parsedData.fileSize
      })
    }

    return preparedImages
  }

  async function prepareEventCoverForSync(event, imageFiles, imageStats, referencedImageFiles, existingImageFiles) {
    if (!event?.coverImage) return null

    const storageMode = inferGoodsImageStorageMode(event.coverImage)
    if (storageMode === 'remote') {
      return {
        uri: event.coverImage,
        storageMode: 'remote'
      }
    }

    let imageDataUrl = await readLocalImageAsDataUrl(event.coverImage)
    if (!imageDataUrl?.startsWith('data:image/')) {
      return null
    }

    let parsedData = parseImageDataUrl(imageDataUrl)
    if (!parsedData) {
      return null
    }

    if (parsedData.fileSize > IMAGE_FILE_SIZE_LIMIT) {
      const compressedBlob = await compressImageToBlob(imageDataUrl, {
        maxBytes: IMAGE_FILE_SIZE_LIMIT - 1024,
        maxEdge: 2048,
        format: 'image/jpeg'
      })
      if (!compressedBlob) {
        return null
      }
      const reader = new FileReader()
      const compressedDataUrl = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result)
        reader.onerror = reject
        reader.readAsDataURL(compressedBlob)
      })
      const compressedParsed = parseImageDataUrl(compressedDataUrl)
      if (!compressedParsed) {
        return null
      }
      parsedData = compressedParsed
      imageDataUrl = compressedDataUrl
    }

    const gistFileName = buildEventCoverFilename(event, parsedData.mimeType)
    referencedImageFiles.add(gistFileName)

    if (existingImageFiles?.has(gistFileName)) {
      imageStats.reusedImages += 1
    } else if (imageFiles) {
      imageFiles[gistFileName] = { content: imageDataUrl }
      imageStats.uploadedImages += 1
    }

    imageStats.imageUpdatedAt = new Date().toISOString()

    return {
      uri: buildGistImageUri(gistFileName),
      storageMode: 'gist-local',
      gistFileName,
      mimeType: parsedData.mimeType,
      fileSize: parsedData.fileSize
    }
  }

  async function buildSyncPayload({ incremental = false, existingImageGist = null } = {}) {
    const goodsStore = useGoodsStore()
    const lastSyncTime = lastSyncedAt.value ? new Date(lastSyncedAt.value).getTime() : 0
    const resolvedLocal = resolveGoodsTrashMaps(goodsStore.list, goodsStore.trashList)
    const sourceGoods = [...resolvedLocal.goodsMap.values()]
    const sourceTrash = [...resolvedLocal.trashMap.values()]
    const imageStats = buildImageSyncStats()
    const referencedImageFiles = new Set()
    const imageFiles = {}
    const existingImageFiles = new Map(Object.entries(existingImageGist?.files || {}))

    const goods = await Promise.all(
      sourceGoods
        .filter((item) => !incremental || lastSyncTime <= 0 || getItemTimestamp(item) > lastSyncTime)
        .map(async (item) => {
          const preparedImages = await prepareImagesForSync(item, imageFiles, imageStats, referencedImageFiles, existingImageFiles)
          return sanitizeGoodsItemForSync(item, preparedImages)
        })
    )

    const trash = await Promise.all(
      sourceTrash
        .filter((item) => !incremental || lastSyncTime <= 0 || getItemTimestamp(item) > lastSyncTime)
        .map(async (item) => {
          const preparedImages = await prepareImagesForSync(item, imageFiles, imageStats, referencedImageFiles, existingImageFiles)
          return sanitizeGoodsItemForSync(item, preparedImages)
        })
    )

    imageStats.imageFileCount = referencedImageFiles.size

    return {
      syncData: {
        version: 6,
        updatedAt: new Date().toISOString(),
        deviceId: deviceId.value,
        goods,
        trash,
        presets: await buildPresetsData()
      },
      imageStats,
      imageFiles,
      referencedImageFiles
    }
  }

  async function buildSyncData(incremental = false) {
    const { syncData } = await buildSyncPayload({ incremental })
    return syncData
  }

  function buildRechargeSyncData({ incremental = false } = {}) {
    const rechargeStore = useRechargeStore()
    const lastSyncTime = lastSyncedAt.value ? new Date(lastSyncedAt.value).getTime() : 0
    const allRecords = rechargeStore.exportBackup({ includeDeleted: false, stripImage: true })
    const records = incremental
      ? allRecords.filter((item) => !lastSyncTime || getItemTimestamp(item) > lastSyncTime)
      : allRecords

    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      deviceId: deviceId.value,
      recharge: records,
      rechargeTrash: []
    }
  }

  async function buildEventSyncPayload({ existingImageGist = null } = {}) {
    const eventsStore = await ensureEventsStoreReady()
    const imageStats = buildImageSyncStats()
    const imageFiles = {}
    const referencedImageFiles = new Set()
    const existingImageFiles = new Map(Object.entries(existingImageGist?.files || {}))

    const events = await Promise.all(
      eventsStore.list.map(async (item) => {
        let processedCoverImage = null
        if (item.coverImage) {
          processedCoverImage = await prepareEventCoverForSync(item, imageFiles, imageStats, referencedImageFiles, existingImageFiles)
        }

        return {
          ...item,
          coverImage: processedCoverImage?.uri || item.coverImage,
          coverImageData: processedCoverImage,
          photos: Array.isArray(item.photos) ? item.photos : [],
          ticketType: String(item.ticketType || '').trim(),
          seatInfo: String(item.seatInfo || '').trim(),
          linkedGoodsIds: Array.isArray(item.linkedGoodsIds) ? item.linkedGoodsIds : [],
          tags: Array.isArray(item.tags) ? item.tags : []
        }
      })
    )

    imageStats.imageFileCount = referencedImageFiles.size

    return {
      eventData: {
        version: 2,
        updatedAt: new Date().toISOString(),
        deviceId: deviceId.value,
        events
      },
      imageStats,
      imageFiles,
      referencedImageFiles
    }
  }

  function buildEventSyncData() {
    const eventsStore = useEventsStore()
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      deviceId: deviceId.value,
      events: eventsStore.list.map((item) => ({
        ...item,
        photos: Array.isArray(item.photos) ? item.photos : [],
        ticketType: String(item.ticketType || '').trim(),
        seatInfo: String(item.seatInfo || '').trim(),
        linkedGoodsIds: Array.isArray(item.linkedGoodsIds) ? item.linkedGoodsIds : [],
        tags: Array.isArray(item.tags) ? item.tags : []
      }))
    }
  }

  async function buildComparableSyncStateFromData(data) {
    const resolved = resolveGoodsTrashMaps(data?.goods || [], data?.trash || [])
    const goods = [...resolved.goodsMap.values()]
      .map((item) => sortObjectKeys(item))
      .sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')))
    const trash = [...resolved.trashMap.values()]
      .map((item) => sortObjectKeys(item))
      .sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')))
    const presetsData = data?.presets || await buildPresetsData()

    return JSON.stringify(sortObjectKeys({
      goods,
      trash,
      presets: presetsData
    }))
  }

  function buildComparableRechargeStateFromData(data) {
    const recharge = (Array.isArray(data?.recharge) ? data.recharge : [])
      .map((item) => sortObjectKeys(item))
      .sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')))
    const rechargeTrash = (Array.isArray(data?.rechargeTrash) ? data.rechargeTrash : [])
      .map((item) => sortObjectKeys(item))
      .sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')))

    return JSON.stringify(sortObjectKeys({ recharge, rechargeTrash }))
  }

  function buildComparableEventStateFromData(data) {
    const events = (Array.isArray(data?.events) ? data.events : [])
      .map((item) => sortObjectKeys(item))
      .sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')))

    return JSON.stringify(sortObjectKeys({ events }))
  }

  function buildManifest(imageStats = {}) {
    return {
      version: 1,
      deviceId: deviceId.value,
      lastSyncAt: new Date().toISOString(),
      imageGistId: imageGistId.value || '',
      imageFileCount: Number(imageStats.imageFileCount) || 0,
      imageUpdatedAt: imageStats.imageUpdatedAt || ''
    }
  }

  function getLocalChangesSince(timestamp) {
    const goodsStore = useGoodsStore()
    const rechargeStore = useRechargeStore()
    const eventsStore = useEventsStore()
    const resolvedLocal = resolveGoodsTrashMaps(goodsStore.list, goodsStore.trashList)
    const goods = [...resolvedLocal.goodsMap.values()]
    const trash = [...resolvedLocal.trashMap.values()]
    const recharge = rechargeStore.exportBackup({ includeDeleted: false, stripImage: true })
    const events = eventsStore.list || []

    const updatedGoods = goods.filter((item) => getItemTimestamp(item) > timestamp).length
    const updatedTrash = trash.filter((item) => getItemTimestamp(item) > timestamp).length
    const updatedRecharge = recharge.filter((item) => getItemTimestamp(item) > timestamp).length
    const updatedEvents = events.filter((item) => (Number(item.updatedAt) || 0) > timestamp).length

    return {
      updatedGoods,
      updatedTrash,
      updatedRecharge,
      totalGoods: goods.length,
      totalTrash: trash.length,
      totalRecharge: recharge.length,
      totalEvents: events.length,
      updatedEvents,
      hasChanges: updatedGoods > 0 || updatedTrash > 0 || updatedRecharge > 0 || updatedEvents > 0
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

  async function ensureImageGist() {
    if (imageGistId.value) {
      try {
        const existing = await getGist(token.value, imageGistId.value)
        if (existing) return existing
        imageGistId.value = ''
        await writeKey(IMAGE_GIST_ID_KEY, '')
      } catch (error) {
        if (error.message.includes('401')) {
          throw new Error('Token 无效或已过期，请重新配置')
        }
      }
    }

    const desc = buildSyncDescription(deviceId.value, 'image')
    const matched = await listGists(token.value, 'goods-app-images')
    if (matched.length > 0) {
      await saveImageGistId(matched[0].id)
      return getGist(token.value, matched[0].id)
    }

    const created = await createGist(token.value, desc, {
      'README.md': { content: '# goods-app image store\n\nThis gist stores synced local images.' }
    })

    await saveImageGistId(created.id)
    return created
  }

  async function ensureRechargeGist() {
    if (rechargeGistId.value) {
      try {
        const existing = await getGist(token.value, rechargeGistId.value)
        if (existing) return existing
        rechargeGistId.value = ''
        await writeKey(RECHARGE_GIST_ID_KEY, '')
      } catch (error) {
        if (error.message.includes('401')) {
          throw new Error('Token 无效或已过期，请重新配置')
        }
      }
    }

    const desc = buildSyncDescription(deviceId.value, 'recharge')
    const matched = await listGists(token.value, 'goods-app-recharge-sync')
    if (matched.length > 0) {
      await saveRechargeGistId(matched[0].id)
      return getGist(token.value, matched[0].id)
    }

    const legacyCandidates = await listGists(token.value, 'goods-app-sync')
    const legacyMatch = legacyCandidates.find((gist) => gist?.files?.[RECHARGE_DATA_FILENAME])
    if (legacyMatch) {
      await saveRechargeGistId(legacyMatch.id)
      return getGist(token.value, legacyMatch.id)
    }

    const rechargeData = buildRechargeSyncData({ incremental: false })
    const created = await createGist(token.value, desc, {
      [RECHARGE_DATA_FILENAME]: { content: JSON.stringify(rechargeData) }
    })

    await saveRechargeGistId(created.id)
    return created
  }

  async function ensureEventGist() {
    if (eventGistId.value) {
      try {
        const existing = await getGist(token.value, eventGistId.value)
        if (existing) return existing
        eventGistId.value = ''
        await writeKey(EVENT_GIST_ID_KEY, '')
      } catch (error) {
        if (error.message.includes('401')) {
          throw new Error('Token 无效或已过期，请重新配置')
        }
      }
    }

    const desc = buildSyncDescription(deviceId.value, 'events')
    const matched = await listGists(token.value, 'goods-app-events-sync')
    if (matched.length > 0) {
      await saveEventGistId(matched[0].id)
      return getGist(token.value, matched[0].id)
    }

    const existingImageGist = await ensureImageGist()
    const { eventData, imageStats, imageFiles } = await buildEventSyncPayload({ existingImageGist })
    
    if (Object.keys(imageFiles).length > 0) {
      await updateGist(token.value, existingImageGist.id, imageFiles)
    }

    const created = await createGist(token.value, desc, {
      [EVENT_DATA_FILENAME]: { content: JSON.stringify(eventData) }
    })

    await saveEventGistId(created.id)
    return created
  }

  async function ensureGist() {
    if (gistId.value) {
      try {
        const existing = await getGist(token.value, gistId.value)
        if (existing) return existing
        gistId.value = ''
        await writeKey(GIST_ID_KEY, '')
      } catch (error) {
        if (error.message.includes('401')) {
          throw new Error('Token 无效或已过期，请重新配置')
        }
      }
    }

    const desc = buildSyncDescription(deviceId.value)
    const matched = await listGists(token.value, 'goods-app-sync')
    if (matched.length > 0) {
      await saveGistId(matched[0].id)
      const existing = await getGist(token.value, matched[0].id)
      try {
        const manifestContent = existing ? await getGistFileContent(token.value, existing, MANIFEST_FILENAME) : null
        const manifest = manifestContent ? JSON.parse(manifestContent) : null
        if (manifest?.imageGistId) {
          await saveImageGistId(manifest.imageGistId)
        }
      } catch {
        // ignore
      }
      return existing
    }

    const existingImageGist = await ensureImageGist()
    const { syncData, imageStats, imageFiles } = await buildSyncPayload({ existingImageGist })
    const rechargeSyncData = buildRechargeSyncData({ incremental: false })
    const { eventData } = await buildEventSyncPayload({ existingImageGist })
    if (Object.keys(imageFiles).length > 0) {
      await updateGist(token.value, existingImageGist.id, imageFiles)
    }

    const manifest = buildManifest(imageStats)
    const created = await createGist(token.value, desc, {
      [DATA_FILENAME]: { content: JSON.stringify(syncData) },
      [RECHARGE_DATA_FILENAME]: { content: JSON.stringify(rechargeSyncData) },
      [EVENT_DATA_FILENAME]: { content: JSON.stringify(eventData) },
      [MANIFEST_FILENAME]: { content: JSON.stringify(manifest) }
    })

    await saveGistId(created.id)
    await saveLastSyncedAt(manifest.lastSyncAt)
    return created
  }

  async function resolveRemoteImageGist(remoteManifest) {
    const remoteImageGistId = String(remoteManifest?.imageGistId || imageGistId.value || '').trim()
    if (!remoteImageGistId) return null
    if (remoteImageGistId !== imageGistId.value) {
      await saveImageGistId(remoteImageGistId)
    }

    const gist = await trackSyncStep('读取图片 Gist', async () => {
      const fetched = await getGist(token.value, remoteImageGistId)
      if (!fetched) {
        throw new Error('未找到图片 Gist')
      }
      return fetched
    }, {
      startDetail: `Gist ${remoteImageGistId}`,
      category: 'image',
      successDetail: () => `已连接 ${remoteImageGistId}`
    })

    return gist
  }

  async function hydrateRemoteItemsWithImages(items, imageGist, imageStats) {
    const fileCache = new Map()

    return Promise.all((items || []).map(async (item) => {
      const normalizedImages = normalizeGoodsImageList(item?.images)
      if (normalizedImages.length === 0) return item

      const hydratedImages = await Promise.all(normalizedImages.map(async (imageEntry) => {
        const storageMode = inferGoodsImageStorageMode(imageEntry.uri, imageEntry.storageMode)
        if (storageMode !== 'gist-local') return imageEntry

        const gistFileName = String(imageEntry.gistFileName || parseGistImageUri(imageEntry.uri)).trim()
        if (!gistFileName) {
          throw new Error(`图片引用无效：${item?.name || item?.id || '未命名条目'}`)
        }
        if (!imageGist) {
          throw new Error('远端数据包含图片引用，但未找到图片 Gist')
        }

        if (!fileCache.has(gistFileName)) {
          const imageDataUrl = await trackSyncStep(`读取图片文件 ${gistFileName}`, async () => {
            const fetched = await getGistFileContent(token.value, imageGist, gistFileName)
            if (!String(fetched || '').startsWith('data:image/')) {
              throw new Error(`远端图片缺失：${gistFileName}`)
            }
            return fetched
          }, {
            startDetail: item?.name ? `条目：${item.name}` : '正在恢复图片',
            category: 'image',
            successDetail: () => `已恢复条目 ${item?.name || item?.id || gistFileName} 的图片`
          })
          fileCache.set(gistFileName, imageDataUrl)
        }

        const imageDataUrl = fileCache.get(gistFileName)

        imageStats.restoredImages += 1

        return {
          ...imageEntry,
          uri: imageDataUrl,
          storageMode: 'gist-local',
          gistFileName
        }
      }))

      const primaryImage = hydratedImages.find((entry) => entry.isPrimary) || hydratedImages[0] || null
      const coverImage = primaryImage?.uri || String(item?.coverImage || item?.image || '').trim()

      return {
        ...item,
        image: coverImage,
        coverImage,
        images: hydratedImages
      }
    }))
  }

  async function hydrateEventCoversWithImages(events, imageGist, imageStats) {
    const fileCache = new Map()

    return Promise.all((events || []).map(async (event) => {
      if (!event.coverImage) return event

      const storageMode = inferGoodsImageStorageMode(event.coverImage)
      if (storageMode !== 'gist-local') return event

      const gistFileName = String(event.coverImageData?.gistFileName || parseGistImageUri(event.coverImage)).trim()
      if (!gistFileName) return event
      
      if (!imageGist) return event

      try {
        if (!fileCache.has(gistFileName)) {
          const imageDataUrl = await trackSyncStep(`读取活动封面文件 ${gistFileName}`, async () => {
            const fetched = await getGistFileContent(token.value, imageGist, gistFileName)
            if (!String(fetched || '').startsWith('data:image/')) {
              throw new Error(`远端活动封面缺失：${gistFileName}`)
            }
            return fetched
          }, {
            startDetail: event?.name ? `活动：${event.name}` : '正在恢复封面',
            category: 'image',
            successDetail: () => `已恢复活动 ${event?.name || event?.id || gistFileName} 的封面`
          })
          fileCache.set(gistFileName, imageDataUrl)
        }

        const imageDataUrl = fileCache.get(gistFileName)

        imageStats.restoredImages += 1

        return {
          ...event,
          coverImage: imageDataUrl,
          coverImageData: {
            ...event.coverImageData,
            uri: imageDataUrl
          }
        }
      } catch {
        return event
      }
    }))
  }

  async function pullFromRemote(gist, remoteManifest = null, rechargeGist = null, eventGist = null) {
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
    const rechargeData = await readJsonFromGistWithTrace({
      title: '正式拉取 recharge-data.json',
      gist,
      fileName: RECHARGE_DATA_FILENAME,
      startDetail: '读取充值记录',
      category: 'pull',
      fallbackGist: rechargeGist,
      fallbackFileName: RECHARGE_DATA_FILENAME,
      successDetail: (parsed, source) => {
        if (!parsed) return '未找到充值数据'
        const recharge = Array.isArray(parsed.recharge) ? parsed.recharge : []
        const rechargeTrash = Array.isArray(parsed.rechargeTrash) ? parsed.rechargeTrash : []
        return `${source}，充值 ${recharge.length} 条，回收站 ${rechargeTrash.length} 条`
      }
    })
    const eventData = await readJsonFromGistWithTrace({
      title: '正式拉取 events-data.json',
      gist,
      fileName: EVENT_DATA_FILENAME,
      startDetail: '读取活动数据',
      category: 'pull',
      fallbackGist: eventGist,
      fallbackFileName: EVENT_DATA_FILENAME,
      successDetail: (parsed, source) => {
        if (!parsed) return '未找到活动数据'
        const events = Array.isArray(parsed.events) ? parsed.events : []
        return `${source}，活动 ${events.length} 场`
      }
    })
    const imageStats = buildImageSyncStats()
    const imageGist = await resolveRemoteImageGist(remoteManifest)
    const goodsImageCountBefore = imageStats.restoredImages
    remoteData.goods = await trackSyncStep('恢复收藏图片', async () => hydrateRemoteItemsWithImages(remoteData.goods || [], imageGist, imageStats), {
      startDetail: '正在恢复收藏条目图片',
      category: 'image',
      successDetail: () => `恢复 ${imageStats.restoredImages - goodsImageCountBefore} 张收藏图片`
    })
    const trashImageCountBefore = imageStats.restoredImages
    remoteData.trash = await trackSyncStep('恢复回收站图片', async () => hydrateRemoteItemsWithImages(remoteData.trash || [], imageGist, imageStats), {
      startDetail: '正在恢复回收站条目图片',
      category: 'image',
      successDetail: () => `恢复 ${imageStats.restoredImages - trashImageCountBefore} 张回收站图片`
    })
    
    if (eventData && Array.isArray(eventData.events)) {
      const eventImageCountBefore = imageStats.restoredImages
      eventData.events = await trackSyncStep('恢复活动封面', async () => hydrateEventCoversWithImages(eventData.events, imageGist, imageStats), {
        startDetail: '正在恢复活动封面图片',
        category: 'image',
        successDetail: () => `恢复 ${imageStats.restoredImages - eventImageCountBefore} 张活动封面`
      })
    }
    
    const goodsStore = useGoodsStore()
    const rechargeStore = useRechargeStore()
    const presets = usePresetsStore()

    if (remoteData.presets) {
      await presets.replacePresetsSnapshot(remoteData.presets)
    }

    const resolvedRemote = resolveGoodsTrashMaps(remoteData.goods || [], remoteData.trash || [])
    const remoteGoods = [...resolvedRemote.goodsMap.values()]
    const remoteTrash = [...resolvedRemote.trashMap.values()]

    const goodsToImport = []
    const goodsToUpdate = []
    const trashIdsToRemove = new Set()
    const localGoodsMap = new Map(goodsStore.list.map((item) => [item.id, item]))
    const localTrashMap = new Map(goodsStore.trashList.map((item) => [item.id, item]))

    for (const remoteItem of remoteGoods) {
      const localItem = localGoodsMap.get(remoteItem.id)
      const localTrashItem = localTrashMap.get(remoteItem.id)

      if (localTrashItem) {
        if (getItemTimestamp(remoteItem) > getItemTimestamp(localTrashItem)) {
          trashIdsToRemove.add(remoteItem.id)
        } else {
          continue
        }
      }

      if (!localItem) {
        goodsToImport.push(remoteItem)
      } else if (shouldApplyRemoteItem(localItem, remoteItem)) {
        goodsToUpdate.push(remoteItem)
      }
    }

    if (trashIdsToRemove.size > 0) {
      for (const id of trashIdsToRemove) {
        await goodsStore.deleteTrashItem(id)
      }
    }

    if (goodsToImport.length > 0) {
      await goodsStore.importGoodsBackup(goodsToImport)
      await presets.syncCharactersFromGoods(goodsToImport)
      await presets.syncStorageLocationsFromPaths(
        goodsToImport.map((item) => item.storageLocation).filter(Boolean)
      )
    }

    await goodsStore.updateGoodsBackup(goodsToUpdate)

    const currentGoodsMap = new Map(goodsStore.list.map((item) => [item.id, item]))
    const currentTrashMap = new Map(goodsStore.trashList.map((item) => [item.id, item]))
    const goodsIdsToDelete = new Set()
    const trashToImport = []
    const trashToUpdate = []

    for (const remoteItem of remoteTrash) {
      const localGoodsItem = currentGoodsMap.get(remoteItem.id)
      const localTrashItem = currentTrashMap.get(remoteItem.id)

      if (localGoodsItem) {
        if (getItemTimestamp(remoteItem) >= getItemTimestamp(localGoodsItem)) {
          goodsIdsToDelete.add(remoteItem.id)
        } else {
          continue
        }
      }

      if (!localTrashItem) {
        trashToImport.push(remoteItem)
      } else if (shouldApplyRemoteItem(localTrashItem, remoteItem)) {
        trashToUpdate.push(remoteItem)
      }
    }

    if (goodsIdsToDelete.size > 0) {
      goodsStore.list = goodsStore.list.filter((item) => !goodsIdsToDelete.has(item.id))
      await deleteItems([...goodsIdsToDelete])
    }

    if (trashToImport.length > 0) {
      await goodsStore.importTrashBackup(trashToImport)
    }

    if (trashToUpdate.length > 0) {
      await goodsStore.updateTrashBackup(trashToUpdate)
    }

    const remoteGoodsIds = new Set(remoteGoods.map((item) => item.id))
    const remoteTrashIds = new Set(remoteTrash.map((item) => item.id))
    const localOnlyGoodsIds = goodsStore.list
      .filter((item) => !remoteGoodsIds.has(item.id) && !remoteTrashIds.has(item.id))
      .map((item) => item.id)
    const localOnlyTrashIds = goodsStore.trashList
      .filter((item) => !remoteTrashIds.has(item.id) && !remoteGoodsIds.has(item.id))
      .map((item) => item.id)

    if (localOnlyGoodsIds.length > 0) {
      const localOnlyGoodsSet = new Set(localOnlyGoodsIds)
      goodsStore.list = goodsStore.list.filter((item) => !localOnlyGoodsSet.has(item.id))
      await deleteItems(localOnlyGoodsIds)
    }

    if (localOnlyTrashIds.length > 0) {
      for (const id of localOnlyTrashIds) {
        await goodsStore.deleteTrashItem(id)
      }
    }

    const remoteRecharge = Array.isArray(rechargeData?.recharge)
      ? rechargeData.recharge
      : (Array.isArray(remoteData.recharge) ? remoteData.recharge : [])
    const remoteRechargeLegacy = Array.isArray(remoteData.rechargeRecords) ? remoteData.rechargeRecords : []
    const rechargeApplyResult = rechargeStore.replaceBackup([
      ...remoteRecharge,
      ...remoteRechargeLegacy
    ].filter((item) => !item?.deleted))

    let eventApplyResult = { added: 0, updated: 0, total: 0 }
    if (eventData && Array.isArray(eventData.events)) {
      const eventsStore = useEventsStore()
      eventApplyResult = {
        ...(await eventsStore.importEventsBackup(eventData.events)),
        total: eventData.events.length
      }
      await saveEventLastSyncedAt(eventData.updatedAt || remoteManifest?.lastSyncAt || new Date().toISOString())
    }

    return {
      importedGoods: goodsToImport.length,
      updatedGoods: goodsToUpdate.length,
      importedTrash: trashToImport.length,
      updatedTrash: trashToUpdate.length,
      importedRecharge: rechargeApplyResult.added,
      updatedRecharge: rechargeApplyResult.updated,
      importedEvents: eventApplyResult.added,
      updatedEvents: eventApplyResult.updated,
      restoredImages: imageStats.restoredImages,
      totalGoods: remoteGoods.length,
      totalTrash: remoteTrash.length,
      totalRecharge: rechargeApplyResult.total,
      totalEvents: eventApplyResult.total
    }
  }

  function buildImageCleanupFiles(existingImageGist, referencedImageFiles) {
    const files = {}
    for (const filename of Object.keys(existingImageGist?.files || {})) {
      if (!filename.startsWith(IMAGE_FILE_PREFIX) && !filename.startsWith(EVENT_COVER_PREFIX)) continue
      if (referencedImageFiles.has(filename)) continue
      files[filename] = null
    }
    return files
  }

  async function getExistingImageGist(remoteManifest = null) {
    const remoteImageGistId = String(remoteManifest?.imageGistId || imageGistId.value || '').trim()
    if (!remoteImageGistId) return null

    try {
      const gist = await trackSyncStep('检查图片 Gist', async () => {
        const fetched = await getGist(token.value, remoteImageGistId)
        if (fetched && remoteImageGistId !== imageGistId.value) {
          await saveImageGistId(remoteImageGistId)
        }
        return fetched || null
      }, {
        startDetail: `Gist ${remoteImageGistId}`,
        category: 'image',
        successDetail: (result) => (result ? `已连接 ${remoteImageGistId}` : '未找到图片 Gist')
      })
      return gist || null
    } catch (error) {
      if (String(error?.message || '').includes('401')) {
        throw new Error('Token 无效或已过期，请重新配置')
      }
      return null
    }
  }

  async function getExistingRechargeGist() {
    const targetRechargeGistId = String(rechargeGistId.value || '').trim()
    if (!targetRechargeGistId) return null

    try {
      const gist = await trackSyncStep('检查充值 Gist', async () => {
        const fetched = await getGist(token.value, targetRechargeGistId)
        return fetched || null
      }, {
        startDetail: `Gist ${targetRechargeGistId}`,
        category: 'recharge',
        successDetail: (result) => (result ? `已连接 ${targetRechargeGistId}` : '未找到充值 Gist')
      })
      return gist || null
    } catch (error) {
      if (String(error?.message || '').includes('401')) {
        throw new Error('Token 无效或已过期，请重新配置')
      }
      return null
    }
  }

  async function getExistingEventGist() {
    const targetEventGistId = String(eventGistId.value || '').trim()
    if (!targetEventGistId) return null

    try {
      const gist = await trackSyncStep('检查活动 Gist', async () => {
        const fetched = await getGist(token.value, targetEventGistId)
        return fetched || null
      }, {
        startDetail: `Gist ${targetEventGistId}`,
        category: 'event',
        successDetail: (result) => (result ? `已连接 ${targetEventGistId}` : '未找到活动 Gist')
      })
      return gist || null
    } catch (error) {
      if (String(error?.message || '').includes('401')) {
        throw new Error('Token 无效或已过期，请重新配置')
      }
      return null
    }
  }

  async function pushToRemote(existingGist = null, existingImageGist = null, existingRechargeGist = null, existingEventGist = null) {
    if (!existingGist && gistId.value) {
      await getGist(token.value, gistId.value)
    }

    const imageGist = existingImageGist || await ensureImageGist()
    
    const { syncData, imageStats, imageFiles, referencedImageFiles } = await trackSyncStep('整理收藏/回收站同步数据', async () => buildSyncPayload({ existingImageGist: imageGist }), {
      startDetail: '读取本地收藏、回收站和图片',
      category: 'local',
      successDetail: (payload) => {
        const goodsCount = Array.isArray(payload?.syncData?.goods) ? payload.syncData.goods.length : 0
        const trashCount = Array.isArray(payload?.syncData?.trash) ? payload.syncData.trash.length : 0
        return `收藏 ${goodsCount}，回收站 ${trashCount}，图片 ${payload?.imageStats?.imageFileCount || 0} 个`
      }
    })
    const rechargeSyncData = await trackSyncStep('整理充值同步数据', async () => buildRechargeSyncData({ incremental: false }), {
      startDetail: '读取本地充值记录',
      category: 'local',
      successDetail: (payload) => {
        const rechargeCount = Array.isArray(payload?.recharge) ? payload.recharge.length : 0
        return `充值 ${rechargeCount} 条`
      }
    })
    const { eventData: eventSyncData, imageStats: eventImageStats, imageFiles: eventImageFiles, referencedImageFiles: eventReferencedImageFiles } = await trackSyncStep('整理活动同步数据', async () => buildEventSyncPayload({ existingImageGist: imageGist }), {
      startDetail: '读取活动和封面图片',
      category: 'local',
      successDetail: (payload) => {
        const eventCount = Array.isArray(payload?.eventData?.events) ? payload.eventData.events.length : 0
        return `活动 ${eventCount} 场，图片 ${payload?.imageStats?.imageFileCount || 0} 个`
      }
    })
    
    const allReferencedImageFiles = new Set([...referencedImageFiles, ...eventReferencedImageFiles])
    const imageCleanupFiles = buildImageCleanupFiles(imageGist, allReferencedImageFiles)
    const imageUpdates = {
      ...imageFiles,
      ...eventImageFiles,
      ...imageCleanupFiles
    }

    if (Object.keys(imageUpdates).length > 0) {
      await trackSyncStep('更新图片 Gist', async () => updateGist(token.value, imageGist.id, imageUpdates), {
        startDetail: `上传 ${Object.keys(imageUpdates).length} 个图片变更`,
        category: 'image',
        successDetail: () => '图片 Gist 已更新'
      })
    }

    const mergedImageStats = {
      uploadedImages: (Number(imageStats.uploadedImages) || 0) + (Number(eventImageStats.uploadedImages) || 0),
      reusedImages: (Number(imageStats.reusedImages) || 0) + (Number(eventImageStats.reusedImages) || 0),
      restoredImages: (Number(imageStats.restoredImages) || 0) + (Number(eventImageStats.restoredImages) || 0),
      imageFileCount: allReferencedImageFiles.size,
      imageUpdatedAt: eventImageStats.imageUpdatedAt || imageStats.imageUpdatedAt || ''
    }
    const manifest = buildManifest(mergedImageStats)

    await trackSyncStep('更新主同步 Gist', async () => updateGist(token.value, gistId.value, {
      [DATA_FILENAME]: { content: JSON.stringify(syncData) },
      [RECHARGE_DATA_FILENAME]: { content: JSON.stringify(rechargeSyncData) },
      [EVENT_DATA_FILENAME]: { content: JSON.stringify(eventSyncData) },
      [MANIFEST_FILENAME]: { content: JSON.stringify(manifest) }
    }), {
      startDetail: '上传 data.json / recharge-data.json / events-data.json / manifest.json',
      category: 'sync',
      successDetail: () => '主同步 Gist 已更新'
    })

    await saveLastSyncedAt(manifest.lastSyncAt)
    await saveEventLastSyncedAt(eventSyncData.updatedAt || manifest.lastSyncAt)

    // Migration complete: recharge/events now live as separate files in the main gist.
    if (rechargeGistId.value && rechargeGistId.value !== gistId.value) {
      await saveRechargeGistId('')
    }
    if (eventGistId.value && eventGistId.value !== gistId.value) {
      await saveEventGistId('')
    }

    return { ...mergedImageStats }
  }

  async function buildPullConflictData(gist, remoteManifest) {
    const goodsStore = useGoodsStore()
    const localRechargeData = buildRechargeSyncData({ incremental: false })
    const localEventData = buildEventSyncData()
    const remoteData = await readJsonFromGistWithTrace({
      title: '读取 data.json',
      gist,
      fileName: DATA_FILENAME,
      startDetail: '用于计算拉取冲突差异',
      category: 'pull',
      successDetail: (parsed) => {
        if (!parsed) return '未找到远端主数据'
        const goods = Array.isArray(parsed.goods) ? parsed.goods : []
        const trash = Array.isArray(parsed.trash) ? parsed.trash : []
        const counts = countWishlistSplit(goods)
        return `收藏 ${counts.collection}，心愿单 ${counts.wishlist}，回收站 ${trash.length}`
      }
    })
    const existingRechargeGist = await getExistingRechargeGist()
    const existingEventGist = await getExistingEventGist()
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
    const resolvedLocal = resolveGoodsTrashMaps(goodsStore.list, goodsStore.trashList)

    let remoteGoods = []
    let remoteTrash = []

    if (remoteData) {
      const resolvedRemote = resolveGoodsTrashMaps(remoteData.goods || [], remoteData.trash || [])
      remoteGoods = [...resolvedRemote.goodsMap.values()]
      remoteTrash = [...resolvedRemote.trashMap.values()]
    }

    const localGoodsMap = resolvedLocal.goodsMap
    const localTrashMap = resolvedLocal.trashMap
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
        remoteOnlyGoods++
        if (remoteItem?.isWishlist) {
          remoteOnlyWishlist++
        } else {
          remoteOnlyCollection++
        }
      } else if (localGoodsItem && shouldApplyRemoteItem(localGoodsItem, remoteItem)) {
        updatedGoods++
      } else if (localTrashItem && shouldApplyRemoteItem(localTrashItem, remoteItem)) {
        updatedGoods++
      }
    }

    for (const remoteItem of remoteTrash) {
      if (!localTrashMap.has(remoteItem.id) && !localGoodsMap.has(remoteItem.id)) {
        remoteOnlyTrash++
      }
    }

    const localOnlyGoods = [...localGoodsMap.keys()].filter((id) => !remoteGoodsMap.has(id) && !remoteTrashMap.has(id)).length
    const localOnlyTrash = [...localTrashMap.keys()].filter((id) => !remoteTrashMap.has(id) && !remoteGoodsMap.has(id)).length
    for (const item of localGoodsMap.values()) {
      if (remoteGoodsMap.has(item.id) || remoteTrashMap.has(item.id)) continue
      if (item?.isWishlist) {
        localOnlyWishlist++
      } else {
        localOnlyCollection++
      }
    }

    const remoteCounts = countWishlistSplit(remoteGoods)
    const rechargeDiff = countComparableRecordDiff(
      buildComparableRecordMap(localRechargeData.recharge || []),
      buildComparableRecordMap(remoteRechargeData.recharge || [])
    )
    const eventDiff = countComparableRecordDiff(
      buildTimestampRecordMap(localEventData.events || []),
      buildTimestampRecordMap(remoteEventData.events || [])
    )
    const imageDiff = countComparableRecordDiff(
      buildImageReferenceMap({
        goods: [...resolvedLocal.goodsMap.values()],
        trash: [...resolvedLocal.trashMap.values()],
        events: localEventData.events || []
      }),
      buildImageReferenceMap({
        goods: remoteGoods,
        trash: remoteTrash,
        events: remoteEventData.events || []
      })
    )

    return {
      remoteTime: remoteManifest?.lastSyncAt || '',
      remoteDevice: remoteManifest?.deviceId || '',
      localTime: lastSyncedAt.value,
      localModifiedTime: getLatestLocalModifiedAt(),
      gist,
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
      remoteImageCount: imageDiff.remoteTotal,
      remoteOnlyImages: imageDiff.remoteOnly,
      updatedImages: imageDiff.updated,
      localOnlyImages: imageDiff.localOnly,
      localOnlyGoods,
      localOnlyCollection,
      localOnlyWishlist,
      localOnlyTrash,
      updatedGoods
    }
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
      const hasRemoteImageChanges = hasRemoteImageChangesSince(localSyncTime, remoteManifest, imageGistId.value)
      const localChanges = getLocalChangesSince(localSyncTime)
      const existingImageGist = await getExistingImageGist(remoteManifest)
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
      const localComparableState = await buildComparableSyncStateFromData(localPayload.syncData)
      const remoteComparableState = await buildComparableSyncStateFromData(remoteData)
      const localRechargeComparableState = buildComparableRechargeStateFromData(localRechargePayload)
      const remoteRechargeComparableState = buildComparableRechargeStateFromData(remoteRechargeData)
      const localEventComparableState = buildComparableEventStateFromData(localEventPayload.eventData)
      const remoteEventComparableState = buildComparableEventStateFromData(remoteEventData)
      const hasDataDiff = localComparableState !== remoteComparableState
      const hasRechargeDataDiff = localRechargeComparableState !== remoteRechargeComparableState
      const hasEventDataDiff = localEventComparableState !== remoteEventComparableState
      const allReferencedImageFiles = new Set([...localPayload.referencedImageFiles, ...localEventPayload.referencedImageFiles])
      const pendingAllImageCleanup = buildImageCleanupFiles(existingImageGist, allReferencedImageFiles)
      const hasPendingImageChanges = (
        Object.keys(localPayload.imageFiles).length > 0
        || Object.keys(localEventPayload.imageFiles).length > 0
        || Object.keys(pendingAllImageCleanup).length > 0
      )
      const hasEffectiveDiff = hasDataDiff || hasRechargeDataDiff || hasEventDataDiff || hasPendingImageChanges || hasRemoteImageChanges

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
        const result = await pullFromRemote(gist, remoteManifest, existingRechargeGist, existingEventGist)
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
        const result = await pullFromRemote(conflictData.value.gist, remoteManifest, conflictData.value.rechargeGist || null, conflictData.value.eventGist || null)
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
      const hasRemoteImageChanges = hasRemoteImageChangesSince(localSyncTime, remoteManifest, imageGistId.value)
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
        syncStatus.value = '检测到远端数据'
        return { action: 'conflict' }
      }

      if (isRemoteFromOtherDevice) {
        const diff = await buildPullConflictData(gist, remoteManifest)
        const hasContentDiff = (
          diff.remoteOnlyGoods > 0
          || diff.remoteOnlyTrash > 0
          || diff.localOnlyGoods > 0
          || diff.localOnlyTrash > 0
          || diff.updatedGoods > 0
        )
        if (!hasContentDiff && !hasRemoteImageChanges && !hasRechargeContentDiff && !hasEventContentDiff) {
          syncStatus.value = '数据已是最新'
          return { action: 'no_changes' }
        }

        if (!hasContentDiff && (hasRemoteImageChanges || hasRechargeContentDiff || hasEventContentDiff)) {
          syncStatus.value = '正在拉取远端数据...'
          const result = await pullFromRemote(gist, remoteManifest, existingRechargeGist, existingEventGist)
          await saveLastSyncedAt(remoteManifest?.lastSyncAt || new Date().toISOString())
          syncStatus.value = '拉取完成'
          return { action: 'pulled', ...result }
        }

        conflictData.value = {
          ...diff,
          rechargeGist: existingRechargeGist,
          eventGist: existingEventGist,
          isPullOnly: true
        }
        syncStatus.value = '检测到远端数据'
        return { action: 'conflict' }
      }

      syncStatus.value = '正在拉取远端数据...'
      const result = await pullFromRemote(gist, remoteManifest, existingRechargeGist, existingEventGist)
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
      const result = await pullFromRemote(conflictData.value.gist, remoteManifest, conflictData.value.rechargeGist || null, conflictData.value.eventGist || null)
      await saveLastSyncedAt(remoteManifest?.lastSyncAt || new Date().toISOString())
      syncStatus.value = '拉取完成'
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
    await writeKey(TOKEN_KEY, '')
    await writeKey(GIST_ID_KEY, '')
    await writeKey(IMAGE_GIST_ID_KEY, '')
    await writeKey(RECHARGE_GIST_ID_KEY, '')
    await writeKey(EVENT_GIST_ID_KEY, '')
    await writeKey(LAST_SYNC_KEY, '')
    await writeKey(EVENT_LAST_SYNC_KEY, '')
    lastError.value = ''
    syncStatus.value = ''
    conflictData.value = null
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
    resetConfig
  }
})
