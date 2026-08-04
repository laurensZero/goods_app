// src/services/syncPushPipeline.js
// Push pipeline: build payload → write remote → upload images → update local refs

import { normalizeBudgetValue } from '@/utils/sync/shared'
import { parseCloudImageUri } from '@/utils/goods/images'
import { computeDiffRows } from './supabaseAdapter/helpers'

/**
 * Build sync payloads (image upload is deferred to doPush).
 * Returns { syncData, rechargeSyncData, eventSyncData, imageStats, allReferencedImageFiles, imageUpdates }.
 */
export async function buildPayloadAndUploadImages(payload, imageService, be, { existingImageCloud = null, dirtyIds = null, shouldWriteRecharge = true, shouldWriteEvent = true } = {}) {
  // Build goods payload (includes image collection)
  const goodsResult = await payload.buildSyncPayload({ existingImageCloud, dirtyIds })
  const { syncData, imageStats, imageFiles, referencedImageFiles } = goodsResult

  // Build recharge payload
  let rechargeSyncData = { recharge: [], rechargeTrash: [] }
  if (shouldWriteRecharge) {
    const existingImageFileSet = new Map(Object.entries(existingImageCloud?.files || {}))
    rechargeSyncData = await payload.buildRechargeSyncData({
      incremental: false,
      imageFiles,
      imageStats,
      referencedImageFiles,
      existingImageFiles: existingImageFileSet
    })
  }

  // Build event payload (heavy due to images)
  let eventSyncData = { events: [], eventsTrash: [] }
  let eventImageStats = { imageFileCount: 0 }
  let eventImageFiles = {}
  let eventReferencedImageFiles = []
  if (shouldWriteEvent) {
    const eventResult = await payload.buildEventSyncPayload({ existingImageCloud })
    eventSyncData = eventResult.eventData || { events: [], eventsTrash: [] }
    eventImageStats = eventResult.imageStats || { imageFileCount: 0 }
    eventImageFiles = eventResult.imageFiles || {}
    eventReferencedImageFiles = eventResult.referencedImageFiles || []
  }

  // Merge image files and compute cleanup
  const allReferencedImageFiles = new Set([...referencedImageFiles, ...eventReferencedImageFiles])
  const imageCleanupFiles = imageService.buildImageCleanupFiles(existingImageCloud, allReferencedImageFiles)
  const imageUpdates = { ...imageFiles, ...eventImageFiles, ...imageCleanupFiles }

  // NOTE: Image upload is deferred to doPush().
  // Data is written to remote FIRST, then images are uploaded.
  // This prevents orphaned images in Storage when the data write fails.

  // Replace cloud-image:// URIs with public URLs (Supabase only).
  // Public URLs are deterministic — they don't require the file to exist yet.
  if (be.getImagePublicUrl) {
    for (const item of [...syncData.goods, ...syncData.trash]) {
      if (!Array.isArray(item.images)) continue
      for (const img of item.images) {
        if (img.cloudFileName && allReferencedImageFiles.has(img.cloudFileName)) {
          img.uri = be.getImagePublicUrl(img.cloudFileName)
        }
      }
    }
    for (const event of (eventSyncData.events || [])) {
      const coverFileName = event.coverImageData?.cloudFileName
      if (coverFileName && allReferencedImageFiles.has(coverFileName)) {
        event.coverImage = be.getImagePublicUrl(coverFileName)
      }
      if (Array.isArray(event.photos)) {
        for (const photo of event.photos) {
          const photoFileName = String(photo?.cloudFileName || '').trim()
          if (photoFileName && allReferencedImageFiles.has(photoFileName)) {
            photo.uri = be.getImagePublicUrl(photoFileName)
          }
        }
      }
    }
    // Replace recharge cloud-image:// URIs with public URLs
    for (const record of [...(rechargeSyncData.recharge || []), ...(rechargeSyncData.rechargeTrash || [])]) {
      const cloudFileName = parseCloudImageUri(record.image)
      if (cloudFileName && allReferencedImageFiles.has(cloudFileName)) {
        record.image = be.getImagePublicUrl(cloudFileName)
      }
    }
  }

  const mergedImageStats = {
    uploadedImages: (Number(imageStats.uploadedImages) || 0) + (Number(eventImageStats.uploadedImages) || 0),
    reusedImages: (Number(imageStats.reusedImages) || 0) + (Number(eventImageStats.reusedImages) || 0),
    restoredImages: (Number(imageStats.restoredImages) || 0) + (Number(eventImageStats.restoredImages) || 0),
    imageFileCount: allReferencedImageFiles.size,
    imageUpdatedAt: Object.keys(imageUpdates).length > 0 ? new Date().toISOString() : ''
  }

  return { syncData, rechargeSyncData, eventSyncData, imageStats: mergedImageStats, allReferencedImageFiles, imageUpdates }
}

/**
 * Build manifest from current state.
 */
export function buildManifest(payload, imageStats, syncTimestamp, { syncData, rechargeSyncData, eventSyncData, goodsStore, rechargeStore, eventsStore, hasDirtyGoodsIds, shouldWriteRecharge = true, shouldWriteEvent = true, backend }) {
  const isSupabase = !!backend?.pushAll

  const rechargeForCount = shouldWriteRecharge
    ? rechargeSyncData.recharge
    : rechargeStore.exportBackup({ includeDeleted: false, stripImage: true })
  const eventsForCount = shouldWriteEvent
    ? (eventSyncData.events || [])
    : ((eventsStore.list || []).filter(e => !e.deleted))
  const fullGoodsList = hasDirtyGoodsIds ? goodsStore.list : syncData.goods
  const fullTrashList = hasDirtyGoodsIds ? goodsStore.trashList : syncData.trash

  const counts = {
    // Supabase 路径跳过 count 计算（由 writeManifest 内部 RPC 补充）
    collectionCount: isSupabase ? 0 : fullGoodsList.filter(g => !g.isWishlist).length,
    wishlistCount: isSupabase ? 0 : fullGoodsList.filter(g => g.isWishlist).length,
    trashCount: isSupabase ? 0 : fullTrashList.length,
    rechargeCount: isSupabase ? 0 : rechargeForCount.length,
    eventCount: isSupabase ? 0 : eventsForCount.length,
    budgetMonthly: normalizeBudgetValue(syncData?.budgetSettings?.monthly),
    budgetYearly: normalizeBudgetValue(syncData?.budgetSettings?.yearly),
    rechargeUpdatedAt: (() => {
      let max = 0
      for (const item of rechargeForCount) { const ts = Number(item?.updatedAt) || 0; if (ts > max) max = ts }
      return max > 0 ? new Date(max).toISOString() : ''
    })(),
    eventUpdatedAt: (() => {
      let max = 0
      for (const item of eventsForCount) { const ts = Number(item?.updatedAt) || 0; if (ts > max) max = ts }
      return max > 0 ? new Date(max).toISOString() : ''
    })()
  }

  return payload.buildManifest(imageStats, syncTimestamp, counts)
}

/**
 * Write data to remote backend via pushAll RPC.
 */
export async function writeRemoteData(be, { syncData, rechargeSyncData, eventSyncData, manifest, remoteData, shouldWriteData = true, shouldWriteRecharge = true, shouldWriteEvent = true, shouldWritePresets = false, fullGoodsList = null, fullTrashList = null }) {
  // Compute incremental diff when remoteData is available
  const localGoods = shouldWriteData ? (syncData.goods || []) : []
  const localTrash = shouldWriteData ? (syncData.trash || []) : []
  const localGroups = shouldWriteData ? (syncData.goodsGroups || []) : []
  const localGroupsTrash = shouldWriteData ? (syncData.goodsGroupsTrash || []) : []
  const localGroupItems = shouldWriteData ? (syncData.goodsGroupItems || []) : []
  const localGroupItemsTrash = shouldWriteData ? (syncData.goodsGroupItemsTrash || []) : []
  const localRecharge = shouldWriteRecharge ? (rechargeSyncData.recharge || []) : []
  const localRechargeTrash = shouldWriteRecharge ? (rechargeSyncData.rechargeTrash || []) : []
  const localEvents = shouldWriteEvent ? (eventSyncData.events || []) : []
  const localEventsTrash = shouldWriteEvent ? (eventSyncData.eventsTrash || []) : []

  let goods = localGoods, goodsTrash = localTrash
  let groups = localGroups, groupsTrash = localGroupsTrash
  let groupItems = localGroupItems, groupItemsTrash = localGroupItemsTrash
  let recharge = localRecharge, rechargeTrash = localRechargeTrash
  let events = localEvents, eventsTrash = localEventsTrash

  if (remoteData) {
    // Incremental: only send changed items (diffs for upsert, never delete cloud rows)
    if (shouldWriteData) {
      goods = await computeDiffRows(localGoods, remoteData.goods || [])
      goodsTrash = await computeDiffRows(localTrash, remoteData.trash || [])
      groups = await computeDiffRows(localGroups, remoteData.groups || [])
      groupsTrash = await computeDiffRows(localGroupsTrash, remoteData.groupsTrash || [])
      groupItems = await computeDiffRows(localGroupItems, remoteData.groupItems || [])
      groupItemsTrash = await computeDiffRows(localGroupItemsTrash, remoteData.groupItemsTrash || [])
      // Cloud tombstone model: never physically delete rows from cloud.
      // Trashed items stay as trashed=1 tombstones forever.
    }
    if (shouldWriteRecharge) {
      recharge = await computeDiffRows(localRecharge, remoteData.recharge || [])
      rechargeTrash = await computeDiffRows(localRechargeTrash, remoteData.rechargeTrash || [])
    }
    if (shouldWriteEvent) {
      events = await computeDiffRows(localEvents, remoteData.events || [])
      eventsTrash = await computeDiffRows(localEventsTrash, remoteData.eventsTrash || [])
    }
  }

  const pushResult = await be.pushAll({
    goods, goodsTrash, groups, groupsTrash, groupItems, groupItemsTrash,
    recharge, rechargeTrash, events, eventsTrash,
    presets: (shouldWriteData || shouldWritePresets) ? syncData.presets : null,
    deleteGoods: [], deleteGroups: [], deleteGroupItems: [],
    deleteRecharge: [], deleteEvents: [],
    deviceId: manifest?.deviceId || '',
    syncedAt: manifest?.lastSyncAt || new Date().toISOString(),
    imageBucket: manifest?.imageCloudId || 'goods-images',
    budgetMonthly: manifest?.budgetMonthly || 0,
    budgetYearly: manifest?.budgetYearly || 0,
    rechargeUpdatedAt: manifest?.rechargeUpdatedAt || null,
    eventUpdatedAt: manifest?.eventUpdatedAt || null
  })

  // 服务器侧 synced_at（新版 RPC 返回），作为本地水位线消除时钟偏移；旧版 RPC 为 null
  return { serverSyncedAt: pushResult?.syncedAt || null }
}

/**
 * Update local image references after push.
 * Marks images as remote so future syncs can dedup.
 * Files listed in failedImageFiles keep their local refs so the next sync retries the upload.
 */
export async function updateLocalRefs(goodsStore, eventsStore, rechargeStore, syncData, eventSyncData, rechargeSyncData, be, failedImageFiles = null) {
  const isUploadFailed = (name) => {
    const key = String(name || '').trim()
    return !!key && !!failedImageFiles && failedImageFiles.has(key)
  }

  // Update goods image refs
  const preparedImagesByItemId = new Map()
  for (const item of [...(syncData.goods || []), ...(syncData.trash || [])]) {
    const images = item.images
    if (!Array.isArray(images)) continue
    const imageMap = new Map()
    for (let i = 0; i < images.length; i++) {
      if (images[i]?.cloudFileName && !isUploadFailed(images[i].cloudFileName)) {
        const entry = { ...images[i] }
        if (be.getImagePublicUrl) {
          entry.uri = be.getImagePublicUrl(entry.cloudFileName)
        }
        imageMap.set(i, entry)
      }
    }
    if (imageMap.size > 0) preparedImagesByItemId.set(item.id, imageMap)
  }
  await goodsStore.markImagesAsRemote(preparedImagesByItemId)

  // Update event image refs
  if (be.getImagePublicUrl && eventSyncData?.events) {
    const preparedMediaByEventId = new Map()
    for (const event of eventSyncData.events) {
      const eventId = String(event?.id || '').trim()
      if (!eventId) continue
      const coverFileName = String(event?.coverImageData?.cloudFileName || '').trim()
      const hasCover = !!coverFileName
      const hasPhotos = Array.isArray(event?.photos) && event.photos.some(photo => String(photo?.cloudFileName || '').trim())
      if (!hasCover && !hasPhotos) continue
      // Any failed upload in this event — keep all its local refs, retry next sync
      const photoList = Array.isArray(event?.photos) ? event.photos : []
      if (isUploadFailed(coverFileName) || photoList.some(photo => isUploadFailed(photo?.cloudFileName))) continue
      preparedMediaByEventId.set(eventId, {
        coverImage: event.coverImage,
        coverImageData: event.coverImageData ? { ...event.coverImageData } : null,
        photos: Array.isArray(event.photos) ? event.photos.map(photo => ({ ...photo })) : []
      })
    }
    await eventsStore.markMediaAsRemote(preparedMediaByEventId)
  }

  // Update recharge image refs
  if (be.getImagePublicUrl && rechargeSyncData?.recharge && rechargeStore?.markImageAsRemote) {
    const rechargeImageMap = new Map()
    for (const record of [...(rechargeSyncData.recharge || []), ...(rechargeSyncData.rechargeTrash || [])]) {
      const cloudFileName = parseCloudImageUri(record.image)
      if (cloudFileName && !isUploadFailed(cloudFileName)) {
        rechargeImageMap.set(record.id, be.getImagePublicUrl(cloudFileName))
      }
    }
    if (rechargeImageMap.size > 0) {
      await rechargeStore.markImageAsRemote(rechargeImageMap)
    }
  }
}
