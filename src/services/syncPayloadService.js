import {
  buildComparableRecordMap,
  buildEventCoverFilename,
  buildImageFilename,
  buildImageSyncStats,
  getItemTimestamp,
  parseImageDataUrl,
  resolveGoodsTrashMaps,
  sortObjectKeys
} from '@/utils/sync/shared'
import { buildGistImageUri, inferGoodsImageStorageMode, normalizeGoodsImageList, parseGistImageUri, sanitizeGoodsItemForSync } from '@/utils/goods/images'
import {
  SYNC_PAYLOAD_VERSION,
  RECHARGE_PAYLOAD_VERSION,
  EVENT_PAYLOAD_VERSION,
  EVENT_DATA_VERSION,
  MANIFEST_VERSION
} from '@/constants/syncConstants'
import { readPersisted } from '@/utils/platform/storage'
import { MONTHLY_BUDGET_STORAGE_KEY, YEARLY_BUDGET_STORAGE_KEY } from '@/constants/budgetConstants'

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
  function normalizeBudgetValue(value) {
    const num = Number(value)
    if (!Number.isFinite(num) || num <= 0) return 0
    return num
  }

  async function readBudgetSettingsFromStorage() {
    const [monthlyRaw, yearlyRaw] = await Promise.all([
      readPersisted(MONTHLY_BUDGET_STORAGE_KEY, ''),
      readPersisted(YEARLY_BUDGET_STORAGE_KEY, '')
    ])

    return {
      monthly: normalizeBudgetValue(monthlyRaw),
      yearly: normalizeBudgetValue(yearlyRaw)
    }
  }

  function normalizeBudgetSettings(input) {
    return {
      monthly: normalizeBudgetValue(input?.monthly),
      yearly: normalizeBudgetValue(input?.yearly)
    }
  }

  function normalizeEventForComparison(item) {
    const coverGistFileName = String(item?.coverImageData?.gistFileName || parseGistImageUri(item?.coverImage) || '').trim()
    const normalizedCoverImage = coverGistFileName
      ? buildGistImageUri(coverGistFileName)
      : String(item?.coverImage || '').trim()

    const normalizedCoverImageData = item?.coverImageData && typeof item.coverImageData === 'object'
      ? {
          storageMode: String(item.coverImageData.storageMode || (coverGistFileName ? 'gist-local' : '')).trim(),
          gistFileName: coverGistFileName,
          mimeType: String(item.coverImageData.mimeType || '').trim(),
          fileSize: Number(item.coverImageData.fileSize) > 0 ? Number(item.coverImageData.fileSize) : 0
        }
      : (coverGistFileName
          ? {
              storageMode: 'gist-local',
              gistFileName: coverGistFileName,
              mimeType: '',
              fileSize: 0
            }
          : null)

    return {
      ...item,
      coverImage: normalizedCoverImage,
      coverImageData: normalizedCoverImageData,
      photos: normalizeGoodsImageList(Array.isArray(item?.photos) ? item.photos : []).map((photo) => {
        const photoGistFileName = String(photo?.gistFileName || parseGistImageUri(photo?.uri) || '').trim()
        return {
          ...photo,
          uri: photoGistFileName ? buildGistImageUri(photoGistFileName) : String(photo?.uri || '').trim(),
          storageMode: String(photo?.storageMode || (photoGistFileName ? 'gist-local' : inferGoodsImageStorageMode(photo?.uri))).trim(),
          localPath: '',
          gistFileName: photoGistFileName
        }
      }),
      ticketType: String(item?.ticketType || '').trim(),
      seatInfo: String(item?.seatInfo || '').trim(),
      linkedGoodsIds: Array.isArray(item?.linkedGoodsIds) ? item.linkedGoodsIds : [],
      tags: Array.isArray(item?.tags) ? item.tags : []
    }
  }

  async function prepareImagesForSync(item, imageFiles, imageStats, referencedImageFiles, existingImageFiles) {
    // Include legacy single-image fields so old records can still upload local images.
    const normalizedImages = normalizeGoodsImageList(item?.images, item?.coverImage || item?.image || '')
    if (normalizedImages.length === 0) return []

    const preparedImages = []

    for (let imageEntry of normalizedImages) {
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

      if (storageMode === 'gist-local') {
        const gistFileName = String(imageEntry.gistFileName || parseGistImageUri(imageEntry.uri)).trim()
        // If the file is confirmed to exist in Storage, reuse it — no upload needed.
        if (gistFileName && existingImageFiles?.has(gistFileName)) {
          referencedImageFiles.add(gistFileName)
          preparedImages.push({
            ...imageEntry,
            storageMode: 'gist-local',
            gistFileName
          })
          continue
        }
        // File not confirmed in Storage — try to read local file and re-upload.
        // If local file is also gone, return null (image lost, don't crash the sync).
        if (gistFileName) {
          const localDataUrl = await readLocalImageAsDataUrl(imageEntry.uri, imageEntry.localPath).catch(() => null)
          if (localDataUrl?.startsWith('data:image/')) {
            // Fall through to the upload path below — it will use gistFileName.
            imageEntry = { ...imageEntry, uri: localDataUrl, gistFileName }
          } else {
            // Local file gone — skip this image, don't include in sync.
            continue
          }
        }
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

    if (storageMode === 'gist-local') {
      const gistFileName = String(event.coverImageData?.gistFileName || parseGistImageUri(event.coverImage)).trim()
      if (gistFileName) referencedImageFiles.add(gistFileName)
      return {
        uri: event.coverImage,
        storageMode: 'gist-local',
        gistFileName,
        mimeType: event.coverImageData?.mimeType || '',
        fileSize: event.coverImageData?.fileSize || 0
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

    const budgetSettings = await readBudgetSettingsFromStorage()

    return {
      syncData: {
        version: SYNC_PAYLOAD_VERSION,
        updatedAt: new Date().toISOString(),
        deviceId: deviceIdRef.value,
        goods,
        trash,
        presets: await buildPresetsData(),
        budgetSettings
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
      version: RECHARGE_PAYLOAD_VERSION,
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
        version: EVENT_PAYLOAD_VERSION,
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
      version: EVENT_DATA_VERSION,
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

  async function buildComparableSyncStateFromData(data, { budgetSettings = null } = {}) {
    const resolved = resolveGoodsTrashMaps(data?.goods || [], data?.trash || [])
    const goods = [...resolved.goodsMap.values()]
      .map((item) => sortObjectKeys(item))
      .sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')))
    const trash = [...resolved.trashMap.values()]
      .map((item) => sortObjectKeys(item))
      .sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')))
    const presetsData = data?.presets || await buildPresetsData()
    const resolvedBudgetSettings = budgetSettings || data?.budgetSettings
      ? normalizeBudgetSettings(budgetSettings || data.budgetSettings)
      : await readBudgetSettingsFromStorage()

    return JSON.stringify(sortObjectKeys({
      goods,
      trash,
      presets: presetsData,
      budgetSettings: resolvedBudgetSettings
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
      .map((item) => sortObjectKeys(normalizeEventForComparison(item)))
      .sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')))

    return JSON.stringify(sortObjectKeys({ events }))
  }

  function buildManifest(imageStats = {}, timestamp = new Date().toISOString(), counts = {}) {
    return {
      version: MANIFEST_VERSION,
      deviceId: deviceIdRef.value,
      lastSyncAt: timestamp,
      imageGistId: imageGistIdRef.value || '',
      imageFileCount: Number(imageStats.imageFileCount) || 0,
      // backward-compatible fields for Supabase adapter
      imageCount: Number(imageStats.imageFileCount) || 0,
      imageUpdatedAt: imageStats.imageUpdatedAt || '',
      collectionCount: Number(counts.collectionCount) || 0,
      wishlistCount: Number(counts.wishlistCount) || 0,
      // total goods count (collection + wishlist) for Supabase compatibility
      goodsCount: Number(counts.collectionCount || 0) + Number(counts.wishlistCount || 0),
      trashCount: Number(counts.trashCount) || 0,
      rechargeCount: Number(counts.rechargeCount) || 0,
      eventCount: Number(counts.eventCount) || 0,
      rechargeUpdatedAt: counts.rechargeUpdatedAt || '',
      eventUpdatedAt: counts.eventUpdatedAt || '',
      budgetMonthly: normalizeBudgetValue(counts.budgetMonthly),
      budgetYearly: normalizeBudgetValue(counts.budgetYearly)
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
