import {
  buildComparableRecordMap,
  buildEventCoverFilename,
  buildImageFilename,
  buildImageSyncStats,
  getItemTimestamp,
  parseImageDataUrl,
  resolveGoodsTrashMaps,
  sortObjectKeys
} from '@/utils/syncShared'
import { buildGistImageUri, inferGoodsImageStorageMode, normalizeGoodsImageList, sanitizeGoodsItemForSync } from '@/utils/goodsImages'

export function createSyncPayloadService({
  deviceIdRef,
  imageGistIdRef,
  lastSyncedAtRef,
  buildPresetsData,
  ensureEventsStoreReady,
  useGoodsStore,
  useRechargeStore,
  useEventsStore,
  readLocalImageAsDataUrl,
  compressImageToBlob,
  imageFileSizeLimit
}) {
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

      if (parsedData.fileSize > imageFileSizeLimit) {
        const compressedBlob = await compressImageToBlob(imageDataUrl, {
          maxBytes: imageFileSizeLimit - 1024,
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

    if (parsedData.fileSize > imageFileSizeLimit) {
      const compressedBlob = await compressImageToBlob(imageDataUrl, {
        maxBytes: imageFileSizeLimit - 1024,
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
    const lastSyncTime = lastSyncedAtRef.value ? new Date(lastSyncedAtRef.value).getTime() : 0
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
        deviceId: deviceIdRef.value,
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
    const lastSyncTime = lastSyncedAtRef.value ? new Date(lastSyncedAtRef.value).getTime() : 0
    const allRecords = rechargeStore.exportBackup({ includeDeleted: false, stripImage: true })
    const records = incremental
      ? allRecords.filter((item) => !lastSyncTime || getItemTimestamp(item) > lastSyncTime)
      : allRecords

    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      deviceId: deviceIdRef.value,
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
        deviceId: deviceIdRef.value,
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
      deviceId: deviceIdRef.value,
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
      deviceId: deviceIdRef.value,
      lastSyncAt: new Date().toISOString(),
      imageGistId: imageGistIdRef.value || '',
      imageFileCount: Number(imageStats.imageFileCount) || 0,
      imageUpdatedAt: imageStats.imageUpdatedAt || ''
    }
  }

  return {
    buildSyncPayload,
    buildSyncData,
    buildRechargeSyncData,
    buildEventSyncPayload,
    buildEventSyncData,
    buildComparableSyncStateFromData,
    buildComparableRechargeStateFromData,
    buildComparableEventStateFromData,
    buildManifest
  }
}
