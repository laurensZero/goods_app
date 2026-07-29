import i18n from '@/locales'
import {
  processWithConcurrency,
  buildEventCoverFilename,
  buildEventPhotoFilename,
  buildImageFilename,
  buildRechargeImageFilename,
  buildImageSyncStats,
  getItemTimestamp,
  parseImageDataUrl,
  resolveGoodsTrashMaps,
  asyncSortedStringify,
  normalizeBudgetValue,
  readBudgetSettings
} from '@/utils/sync/shared'
import { buildCloudImageUri, inferGoodsImageStorageMode, normalizeGoodsImageList, parseCloudImageUri, sanitizeGoodsItemForSync } from '@/utils/goods/images'
import {
  SYNC_PAYLOAD_VERSION,
  RECHARGE_PAYLOAD_VERSION,
  EVENT_PAYLOAD_VERSION,
  EVENT_DATA_VERSION,
  MANIFEST_VERSION
} from '@/constants/syncConstants'

export function createSyncPayloadService({
  deviceIdRef,
  imageCloudIdRef,
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
    const coverCloudFileName = String(item?.coverImageData?.cloudFileName || parseCloudImageUri(item?.coverImage) || '').trim()
    const normalizedCoverImage = coverCloudFileName
      ? buildCloudImageUri(coverCloudFileName)
      : String(item?.coverImage || '').trim()

    const normalizedCoverImageData = item?.coverImageData && typeof item.coverImageData === 'object'
      ? {
          storageMode: String(item.coverImageData.storageMode || (coverCloudFileName ? 'cloud-local' : '')).trim(),
          cloudFileName: coverCloudFileName,
          mimeType: String(item.coverImageData.mimeType || '').trim(),
          fileSize: Number(item.coverImageData.fileSize) > 0 ? Number(item.coverImageData.fileSize) : 0
        }
      : (coverCloudFileName
          ? {
              storageMode: 'cloud-local',
              cloudFileName: coverCloudFileName,
              mimeType: '',
              fileSize: 0
            }
          : null)

    return {
      ...item,
      coverImage: normalizedCoverImage,
      coverImageData: normalizedCoverImageData,
      photos: normalizeGoodsImageList(Array.isArray(item?.photos) ? item.photos : []).map((photo) => {
        const photoCloudFileName = String(photo?.cloudFileName || parseCloudImageUri(photo?.uri) || '').trim()
        return {
          ...photo,
          uri: photoCloudFileName ? buildCloudImageUri(photoCloudFileName) : String(photo?.uri || '').trim(),
          storageMode: String(photo?.storageMode || (photoCloudFileName ? 'cloud-local' : inferGoodsImageStorageMode(photo?.uri))).trim(),
          localPath: '',
          cloudFileName: photoCloudFileName
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
        const cloudFileName = String(imageEntry.cloudFileName || '').trim()
        if (cloudFileName) referencedImageFiles.add(cloudFileName)
        preparedImages.push({
          ...imageEntry,
          storageMode: 'remote',
          cloudFileName,
          mimeType: '',
          fileSize: 0
        })
        continue
      }

      if (storageMode === 'cloud-local') {
        const cloudFileName = String(imageEntry.cloudFileName || parseCloudImageUri(imageEntry.uri)).trim()
        // If the file is confirmed to exist in Storage, reuse it — no upload needed.
        if (cloudFileName && existingImageFiles?.has(cloudFileName)) {
          referencedImageFiles.add(cloudFileName)
          preparedImages.push({
            ...imageEntry,
            storageMode: 'cloud-local',
            cloudFileName
          })
          continue
        }
        // File not confirmed in Storage — try to read local file and re-upload.
        // If local file is also gone, return null (image lost, don't crash the sync).
        if (cloudFileName) {
          const localDataUrl = await readLocalImageAsDataUrl(imageEntry.uri, imageEntry.localPath).catch(() => null)
          if (localDataUrl?.startsWith('data:image/')) {
            // Fall through to the upload path below — it will use cloudFileName.
            imageEntry = { ...imageEntry, uri: localDataUrl, cloudFileName }
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

      const cloudFileName = buildImageFilename(item, imageEntry, parsedData.mimeType)
      referencedImageFiles.add(cloudFileName)

      if (existingImageFiles?.has(cloudFileName)) {
        imageStats.reusedImages += 1
      } else if (imageFiles) {
        imageFiles[cloudFileName] = { content: imageDataUrl }
        imageStats.uploadedImages += 1
      }

      imageStats.imageUpdatedAt = new Date().toISOString()

      preparedImages.push({
        ...imageEntry,
        uri: buildCloudImageUri(cloudFileName),
        storageMode: 'cloud-local',
        cloudFileName,
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
      const cloudFileName = String(event.coverImageData?.cloudFileName || '').trim()
      if (cloudFileName) referencedImageFiles.add(cloudFileName)
      return {
        uri: event.coverImage,
        storageMode: 'remote',
        cloudFileName
      }
    }

    if (storageMode === 'cloud-local') {
      const cloudFileName = String(event.coverImageData?.cloudFileName || parseCloudImageUri(event.coverImage)).trim()
      if (cloudFileName) referencedImageFiles.add(cloudFileName)
      return {
        uri: event.coverImage,
        storageMode: 'cloud-local',
        cloudFileName,
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

    const cloudFileName = buildEventCoverFilename(event, parsedData.mimeType)
    referencedImageFiles.add(cloudFileName)

    if (existingImageFiles?.has(cloudFileName)) {
      imageStats.reusedImages += 1
    } else if (imageFiles) {
      imageFiles[cloudFileName] = { content: imageDataUrl }
      imageStats.uploadedImages += 1
    }

    imageStats.imageUpdatedAt = new Date().toISOString()

    return {
      uri: buildCloudImageUri(cloudFileName),
      storageMode: 'cloud-local',
      cloudFileName,
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
        const cloudFileName = String(rawPhoto?.cloudFileName || '').trim()
        if (cloudFileName) referencedImageFiles.add(cloudFileName)
        preparedPhotos.push({
          ...normalizedPhoto,
          uri: photoUri,
          storageMode: 'remote',
          cloudFileName,
          mimeType: '',
          fileSize: 0,
          localPath: ''
        })
        continue
      }

      if (storageMode === 'cloud-local') {
        const cloudFileName = String(rawPhoto?.cloudFileName || parseCloudImageUri(photoUri)).trim()
        if (cloudFileName && existingImageFiles?.has(cloudFileName)) {
          referencedImageFiles.add(cloudFileName)
          preparedPhotos.push({
            ...normalizedPhoto,
            uri: buildCloudImageUri(cloudFileName),
            storageMode: 'cloud-local',
            cloudFileName,
            mimeType: String(rawPhoto?.mimeType || '').trim(),
            fileSize: Number(rawPhoto?.fileSize) > 0 ? Number(rawPhoto.fileSize) : 0,
            localPath: ''
          })
          continue
        }

        if (cloudFileName) {
          const recoveredDataUrl = await readLocalImageAsDataUrl(photoUri, rawPhoto?.localPath).catch(() => null)
          if (!recoveredDataUrl?.startsWith('data:image/')) {
            continue
          }
          const parsedRecovered = parseImageDataUrl(recoveredDataUrl)
          if (!parsedRecovered) {
            continue
          }
          referencedImageFiles.add(cloudFileName)
          if (!existingImageFiles?.has(cloudFileName) && imageFiles) {
            imageFiles[cloudFileName] = { content: recoveredDataUrl }
            imageStats.uploadedImages += 1
          } else {
            imageStats.reusedImages += 1
          }
          imageStats.imageUpdatedAt = new Date().toISOString()
          preparedPhotos.push({
            ...normalizedPhoto,
            uri: buildCloudImageUri(cloudFileName),
            storageMode: 'cloud-local',
            cloudFileName,
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
      const cloudFileName = buildEventPhotoFilename(event, normalizedPhoto, parsedData.mimeType)
      referencedImageFiles.add(cloudFileName)

      if (existingImageFiles?.has(cloudFileName)) {
        imageStats.reusedImages += 1
      } else if (imageFiles) {
        imageFiles[cloudFileName] = { content: imageDataUrl }
        imageStats.uploadedImages += 1
      }

      imageStats.imageUpdatedAt = new Date().toISOString()

      preparedPhotos.push({
        ...normalizedPhoto,
        uri: buildCloudImageUri(cloudFileName),
        storageMode: 'cloud-local',
        cloudFileName,
        mimeType: parsedData.mimeType,
        fileSize: parsedData.fileSize,
        localPath: ''
      })
    }

    return preparedPhotos
  }

  async function buildSyncPayload({ incremental = false, existingImageCloud = null, dirtyIds = null } = {}) {
    const goodsStore = useGoodsStore()
    const lastSyncTime = lastSyncedAtRef.value ? new Date(lastSyncedAtRef.value).getTime() : 0
    const resolvedLocal = resolveGoodsTrashMaps(goodsStore.list, goodsStore.trashList)
    const sourceGoods = [...resolvedLocal.goodsMap.values()]
    const sourceTrash = [...resolvedLocal.trashMap.values()]
    const imageStats = buildImageSyncStats()
    const referencedImageFiles = new Set()
    const imageFiles = {}
    const existingImageFiles = new Map(Object.entries(existingImageCloud?.files || {}))

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

    // Include goods groups (split by deleted for tombstone model)
    const goodsGroupStore = useGoodsGroupStore()
    const allGroups = goodsGroupStore.groupList || []
    const allGroupItems = goodsGroupStore.groupItemList || []

    return {
      syncData: {
        version: SYNC_PAYLOAD_VERSION,
        updatedAt: new Date().toISOString(),
        deviceId: deviceIdRef.value,
        goods,
        trash,
        presets: await buildPresetsData(),
        budgetSettings,
        goodsGroups: allGroups.filter(g => !g.deleted),
        goodsGroupsTrash: allGroups.filter(g => g.deleted),
        goodsGroupItems: allGroupItems.filter(gi => !gi.deleted),
        goodsGroupItemsTrash: allGroupItems.filter(gi => gi.deleted)
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

  async function buildRechargeSyncData({ incremental = false, imageFiles = null, imageStats = null, referencedImageFiles = null, existingImageFiles = null } = {}) {
    const rechargeStore = useRechargeStore()
    const lastSyncTime = lastSyncedAtRef.value ? new Date(lastSyncedAtRef.value).getTime() : 0
    const allRecords = rechargeStore.exportBackup({ includeDeleted: true, stripImage: false })
    const allRecharge = allRecords.filter((item) => !item.deleted)
    const allTrash = allRecords.filter((item) => item.deleted)

    const baseRecords = incremental
      ? allRecharge.filter((item) => !lastSyncTime || getItemTimestamp(item) > lastSyncTime)
      : allRecharge
    const baseTrash = incremental
      ? allTrash.filter((item) => !lastSyncTime || getItemTimestamp(item) > lastSyncTime)
      : allTrash

    async function processRecordImage(record) {
      const imageUri = String(record.image || '').trim()
      if (!imageUri) return record

      const storageMode = inferGoodsImageStorageMode(imageUri)
      if (storageMode === 'remote') {
        // Already a remote URL — track cloud filename if it's a Storage URL
        const cloudFileName = parseCloudImageUri(imageUri)
        if (cloudFileName && referencedImageFiles) referencedImageFiles.add(cloudFileName)
        return record
      }

      if (storageMode === 'cloud-local') {
        const cloudFileName = parseCloudImageUri(imageUri)
        if (cloudFileName && existingImageFiles?.has(cloudFileName)) {
          if (referencedImageFiles) referencedImageFiles.add(cloudFileName)
          if (imageStats) imageStats.reusedImages += 1
          return record
        }
        // File not confirmed in Storage — try to read local and re-upload
        if (cloudFileName) {
          const localDataUrl = await readLocalImageAsDataUrl(imageUri, '').catch(() => null)
          if (localDataUrl?.startsWith('data:image/')) {
            return processLocalImageData(record, cloudFileName, localDataUrl)
          }
        }
        // Local file gone — keep cloud-image ref as-is, it may be recoverable
        return record
      }

      // linked-local or inline-local — new local image to upload
      let imageDataUrl = await readLocalImageAsDataUrl(imageUri, '')
      if (!imageDataUrl?.startsWith('data:image/')) {
        // Can't read the local image — skip, keep original URI
        return record
      }

      return processLocalImageData(record, null, imageDataUrl)
    }

    async function processLocalImageData(record, existingCloudFileName, imageDataUrl) {
      let parsedData = parseImageDataUrl(imageDataUrl)
      if (!parsedData) return record

      // Compress if oversized
      if (parsedData.fileSize > imageFileSizeLimit) {
        try {
          const compressedBlob = await compressImageToBlob(imageDataUrl, {
            maxBytes: imageFileSizeLimit - 1024,
            maxEdge: 2048,
            format: 'image/jpeg'
          })
          if (compressedBlob) {
            const reader = new FileReader()
            const compressedDataUrl = await new Promise((resolve, reject) => {
              reader.onload = () => resolve(reader.result)
              reader.onerror = reject
              reader.readAsDataURL(compressedBlob)
            })
            const compressedParsed = parseImageDataUrl(compressedDataUrl)
            if (compressedParsed) {
              parsedData = compressedParsed
              imageDataUrl = compressedDataUrl
            }
          }
        } catch {
          // Compression failed — use original
        }
      }

      const cloudFileName = existingCloudFileName || buildRechargeImageFilename(record, parsedData.mimeType)
      if (!cloudFileName) return record

      if (referencedImageFiles) referencedImageFiles.add(cloudFileName)

      if (existingImageFiles?.has(cloudFileName)) {
        if (imageStats) imageStats.reusedImages += 1
      } else if (imageFiles) {
        imageFiles[cloudFileName] = { content: imageDataUrl }
        if (imageStats) imageStats.uploadedImages += 1
      }

      return {
        ...record,
        image: buildCloudImageUri(cloudFileName),
        cloudFileName
      }
    }

    const records = await processWithConcurrency(baseRecords, processRecordImage, 6)
    const trash = await processWithConcurrency(baseTrash, processRecordImage, 6)

    return {
      version: RECHARGE_PAYLOAD_VERSION,
      updatedAt: new Date().toISOString(),
      deviceId: deviceIdRef.value,
      recharge: records,
      rechargeTrash: trash
    }
  }

  async function buildEventSyncPayload({ existingImageCloud = null } = {}) {
    const eventsStore = await ensureEventsStoreReady()
    const imageStats = buildImageSyncStats()
    const imageFiles = {}
    const referencedImageFiles = new Set()
    const existingImageFiles = new Map(Object.entries(existingImageCloud?.files || {}))

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

    const activeEvents = events.filter(e => !e.deleted)
    const trashEvents = events.filter(e => e.deleted)

    return {
      eventData: {
        version: EVENT_PAYLOAD_VERSION,
        updatedAt: new Date().toISOString(),
        deviceId: deviceIdRef.value,
        events: activeEvents,
        eventsTrash: trashEvents
      },
      imageStats,
      imageFiles,
      referencedImageFiles
    }
  }

  function buildEventSyncData() {
    const eventsStore = useEventsStore()
    const allEvents = eventsStore.list.map((item) => ({
      ...item,
      photos: Array.isArray(item.photos) ? item.photos : [],
      ticketType: String(item.ticketType || '').trim(),
      seatInfo: String(item.seatInfo || '').trim(),
      otherExpenses: Array.isArray(item.otherExpenses) ? item.otherExpenses : [],
      linkedGoodsIds: Array.isArray(item.linkedGoodsIds) ? item.linkedGoodsIds : [],
      tags: Array.isArray(item.tags) ? item.tags : []
    }))
    return {
      version: EVENT_DATA_VERSION,
      updatedAt: new Date().toISOString(),
      deviceId: deviceIdRef.value,
      events: allEvents.filter(e => !e.deleted),
      eventsTrash: allEvents.filter(e => e.deleted)
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
      imageCloudId: imageCloudIdRef.value || '',
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
