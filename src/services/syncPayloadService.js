import i18n from '@/locales'
import {
  processWithConcurrency,
  buildEventCoverFilename,
  buildEventPhotoFilename,
  buildImageFilename,
  buildImageSyncStats,
  getItemTimestamp,
  parseImageDataUrl,
  resolveGoodsTrashMaps,
  asyncSortedStringify,
  normalizeBudgetValue,
  readBudgetSettings
} from '@/utils/sync/shared'
import { buildGistImageUri, inferGoodsImageStorageMode, normalizeGoodsImageList, parseGistImageUri, sanitizeGoodsItemForSync } from '@/utils/goods/images'
import {
  SYNC_PAYLOAD_VERSION,
  RECHARGE_PAYLOAD_VERSION,
  EVENT_PAYLOAD_VERSION,
  EVENT_DATA_VERSION,
  MANIFEST_VERSION
} from '@/constants/syncConstants'

export function createSyncPayloadService({
  deviceIdRef,
  imageGistIdRef,
  lastSyncedAtRef,
  buildPresetsData,
  ensureEventsStoreReady,
  useGoodsStore,
  useRechargeStore,
  useEventsStore,
  useGoodsGroupStore,
  readLocalImageAsDataUrl,
  compressImageToBlob,
  imageFileSizeLimit
}) {
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
      otherExpenses: Array.isArray(item?.otherExpenses)
        ? item.otherExpenses.map((expense, index) => ({
            id: String(expense?.id || `expense_${index}`),
            name: String(expense?.name || '').trim(),
            amount: String(expense?.amount || '').trim()
          })).filter((expense) => expense.name || expense.amount)
        : [],
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
        const gistFileName = String(imageEntry.gistFileName || '').trim()
        if (gistFileName) referencedImageFiles.add(gistFileName)
        preparedImages.push({
          ...imageEntry,
          storageMode: 'remote',
          gistFileName,
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
        throw new Error(i18n.global.t('sync.error.imageReadFailed', { name: item?.name || item?.id || i18n.global.t('sync.error.unnamedItem') }))
      }

      let parsedData = parseImageDataUrl(imageDataUrl)
      if (!parsedData) {
        throw new Error(i18n.global.t('sync.error.imageFormatUnsupported', { name: item?.name || item?.id || i18n.global.t('sync.error.unnamedItem') }))
      }

      if (parsedData.fileSize > imageFileSizeLimit) {
        const compressedBlob = await compressImageToBlob(imageDataUrl, {
          maxBytes: imageFileSizeLimit - 1024,
          maxEdge: 2048,
          format: 'image/jpeg'
        })
        if (!compressedBlob) {
          throw new Error(i18n.global.t('sync.error.imageCompressFailed', { name: item?.name || item?.id || i18n.global.t('sync.error.unnamedItem') }))
        }
        const reader = new FileReader()
        const compressedDataUrl = await new Promise((resolve, reject) => {
          reader.onload = () => resolve(reader.result)
          reader.onerror = reject
          reader.readAsDataURL(compressedBlob)
        })
        const compressedParsed = parseImageDataUrl(compressedDataUrl)
        if (!compressedParsed) {
          throw new Error(i18n.global.t('sync.error.imageFormatInvalid', { name: item?.name || item?.id || i18n.global.t('sync.error.unnamedItem') }))
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
      const gistFileName = String(event.coverImageData?.gistFileName || '').trim()
      if (gistFileName) referencedImageFiles.add(gistFileName)
      return {
        uri: event.coverImage,
        storageMode: 'remote',
        gistFileName
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

  async function prepareEventPhotosForSync(event, imageFiles, imageStats, referencedImageFiles, existingImageFiles) {
    const sourcePhotos = Array.isArray(event?.photos) ? event.photos : []
    if (sourcePhotos.length === 0) return []

    const preparedPhotos = []

    for (let index = 0; index < sourcePhotos.length; index += 1) {
      const rawPhoto = sourcePhotos[index]
      const photoUri = String(rawPhoto?.uri || '').trim()
      if (!photoUri) continue

      const normalizedPhoto = {
        ...rawPhoto,
        id: String(rawPhoto?.id || `event_photo_${index}`),
        caption: String(rawPhoto?.caption || '').trim()
      }
      const storageMode = inferGoodsImageStorageMode(photoUri, rawPhoto?.storageMode)

      if (storageMode === 'remote') {
        const gistFileName = String(rawPhoto?.gistFileName || '').trim()
        if (gistFileName) referencedImageFiles.add(gistFileName)
        preparedPhotos.push({
          ...normalizedPhoto,
          uri: photoUri,
          storageMode: 'remote',
          gistFileName,
          mimeType: '',
          fileSize: 0,
          localPath: ''
        })
        continue
      }

      if (storageMode === 'gist-local') {
        const gistFileName = String(rawPhoto?.gistFileName || parseGistImageUri(photoUri)).trim()
        if (gistFileName && existingImageFiles?.has(gistFileName)) {
          referencedImageFiles.add(gistFileName)
          preparedPhotos.push({
            ...normalizedPhoto,
            uri: buildGistImageUri(gistFileName),
            storageMode: 'gist-local',
            gistFileName,
            mimeType: String(rawPhoto?.mimeType || '').trim(),
            fileSize: Number(rawPhoto?.fileSize) > 0 ? Number(rawPhoto.fileSize) : 0,
            localPath: ''
          })
          continue
        }

        if (gistFileName) {
          const recoveredDataUrl = await readLocalImageAsDataUrl(photoUri, rawPhoto?.localPath).catch(() => null)
          if (!recoveredDataUrl?.startsWith('data:image/')) {
            continue
          }
          const parsedRecovered = parseImageDataUrl(recoveredDataUrl)
          if (!parsedRecovered) {
            continue
          }
          referencedImageFiles.add(gistFileName)
          if (!existingImageFiles?.has(gistFileName) && imageFiles) {
            imageFiles[gistFileName] = { content: recoveredDataUrl }
            imageStats.uploadedImages += 1
          } else {
            imageStats.reusedImages += 1
          }
          imageStats.imageUpdatedAt = new Date().toISOString()
          preparedPhotos.push({
            ...normalizedPhoto,
            uri: buildGistImageUri(gistFileName),
            storageMode: 'gist-local',
            gistFileName,
            mimeType: parsedRecovered.mimeType,
            fileSize: parsedRecovered.fileSize,
            localPath: ''
          })
          continue
        }
      }

      const imageDataUrl = await readLocalImageAsDataUrl(photoUri, rawPhoto?.localPath).catch(() => null)
      if (!imageDataUrl?.startsWith('data:image/')) {
        continue
      }

      const parsedData = parseImageDataUrl(imageDataUrl)
      if (!parsedData) {
        continue
      }

      // Keep original quality for event gallery photos.
      const gistFileName = buildEventPhotoFilename(event, normalizedPhoto, parsedData.mimeType)
      referencedImageFiles.add(gistFileName)

      if (existingImageFiles?.has(gistFileName)) {
        imageStats.reusedImages += 1
      } else if (imageFiles) {
        imageFiles[gistFileName] = { content: imageDataUrl }
        imageStats.uploadedImages += 1
      }

      imageStats.imageUpdatedAt = new Date().toISOString()

      preparedPhotos.push({
        ...normalizedPhoto,
        uri: buildGistImageUri(gistFileName),
        storageMode: 'gist-local',
        gistFileName,
        mimeType: parsedData.mimeType,
        fileSize: parsedData.fileSize,
        localPath: ''
      })
    }

    return preparedPhotos
  }

  async function buildSyncPayload({ incremental = false, existingImageGist = null, dirtyIds = null } = {}) {
    const goodsStore = useGoodsStore()
    const lastSyncTime = lastSyncedAtRef.value ? new Date(lastSyncedAtRef.value).getTime() : 0
    const resolvedLocal = resolveGoodsTrashMaps(goodsStore.list, goodsStore.trashList)
    const sourceGoods = [...resolvedLocal.goodsMap.values()]
    const sourceTrash = [...resolvedLocal.trashMap.values()]
    const imageStats = buildImageSyncStats()
    const referencedImageFiles = new Set()
    const imageFiles = {}
    const existingImageFiles = new Map(Object.entries(existingImageGist?.files || {}))

    let filteredGoods = sourceGoods.filter((item) => !incremental || lastSyncTime <= 0 || getItemTimestamp(item) > lastSyncTime)
    // Fast path: only process specific dirty items
    if (dirtyIds && dirtyIds.size > 0) {
      filteredGoods = filteredGoods.filter((item) => dirtyIds.has(item.id))
    }
    const goods = await processWithConcurrency(filteredGoods, async (item) => {
      const preparedImages = await prepareImagesForSync(item, imageFiles, imageStats, referencedImageFiles, existingImageFiles)
      return sanitizeGoodsItemForSync(item, preparedImages)
    }, 8)

    let filteredTrash = sourceTrash.filter((item) => !incremental || lastSyncTime <= 0 || getItemTimestamp(item) > lastSyncTime)
    if (dirtyIds && dirtyIds.size > 0) {
      filteredTrash = filteredTrash.filter((item) => dirtyIds.has(item.id))
    }
    const trash = await processWithConcurrency(filteredTrash, async (item) => {
      const preparedImages = await prepareImagesForSync(item, imageFiles, imageStats, referencedImageFiles, existingImageFiles)
      return sanitizeGoodsItemForSync(item, preparedImages)
    }, 8)

    imageStats.imageFileCount = referencedImageFiles.size

    const budgetSettings = await readBudgetSettings()

    // Include goods groups
    const goodsGroupStore = useGoodsGroupStore()
    const goodsGroups = goodsGroupStore.groupList || []
    const goodsGroupItems = goodsGroupStore.groupItemList || []

    return {
      syncData: {
        version: SYNC_PAYLOAD_VERSION,
        updatedAt: new Date().toISOString(),
        deviceId: deviceIdRef.value,
        goods,
        trash,
        presets: await buildPresetsData(),
        budgetSettings,
        goodsGroups,
        goodsGroupItems
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

    const events = await processWithConcurrency(eventsStore.list, async (item) => {
      let processedCoverImage = null
      if (item.coverImage) {
        processedCoverImage = await prepareEventCoverForSync(item, imageFiles, imageStats, referencedImageFiles, existingImageFiles)
      }
      const processedPhotos = await prepareEventPhotosForSync(item, imageFiles, imageStats, referencedImageFiles, existingImageFiles)

      return {
        ...item,
        coverImage: processedCoverImage?.uri || item.coverImage,
        coverImageData: processedCoverImage,
        photos: processedPhotos,
        ticketType: String(item.ticketType || '').trim(),
        seatInfo: String(item.seatInfo || '').trim(),
        otherExpenses: Array.isArray(item.otherExpenses) ? item.otherExpenses : [],
        linkedGoodsIds: Array.isArray(item.linkedGoodsIds) ? item.linkedGoodsIds : [],
        tags: Array.isArray(item.tags) ? item.tags : []
      }
    }, 6)

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
        otherExpenses: Array.isArray(item.otherExpenses) ? item.otherExpenses : [],
        linkedGoodsIds: Array.isArray(item.linkedGoodsIds) ? item.linkedGoodsIds : [],
        tags: Array.isArray(item.tags) ? item.tags : []
      }))
    }
  }

  async function buildComparableSyncStateFromData(data, { budgetSettings = null } = {}) {
    const resolved = resolveGoodsTrashMaps(data?.goods || [], data?.trash || [])
    const goods = [...resolved.goodsMap.values()]
      .sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')))
    const trash = [...resolved.trashMap.values()]
      .sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')))
    const presetsData = data?.presets || await buildPresetsData()
    const resolvedBudgetSettings = budgetSettings || data?.budgetSettings
      ? normalizeBudgetSettings(budgetSettings || data.budgetSettings)
      : await readBudgetSettings()

    const goodsGroups = (data?.goodsGroups || [])
      .sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')))
    const goodsGroupItems = (data?.goodsGroupItems || [])
      .sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')))

    return asyncSortedStringify({
      goods,
      trash,
      presets: presetsData,
      budgetSettings: resolvedBudgetSettings,
      goodsGroups,
      goodsGroupItems
    })
  }

  async function buildComparableRechargeStateFromData(data) {
    const recharge = (Array.isArray(data?.recharge) ? data.recharge : [])
      .sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')))
    const rechargeTrash = (Array.isArray(data?.rechargeTrash) ? data.rechargeTrash : [])
      .sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')))

    return asyncSortedStringify({ recharge, rechargeTrash })
  }

  async function buildComparableEventStateFromData(data) {
    const events = (Array.isArray(data?.events) ? data.events : [])
      .map((item) => normalizeEventForComparison(item))
      .sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')))

    return asyncSortedStringify({ events })
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
    buildManifest,
    readBudgetSettings
  }
}
