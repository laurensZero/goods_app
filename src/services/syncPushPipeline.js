// src/services/syncPushPipeline.js
// Push pipeline: build payload → upload images → write remote → update local refs

import { normalizeBudgetValue } from '@/utils/sync/shared'
import { createLogger } from '@/utils/logger'
import i18n from '@/locales'

const log = createLogger('sync:pushPipeline')

/**
 * Build sync payloads and upload images.
 * Returns { syncData, rechargeSyncData, eventSyncData, imageStats, allReferencedImageFiles }.
 */
export async function buildPayloadAndUploadImages(payload, imageService, be, { existingImageGist = null, dirtyIds = null, shouldWriteRecharge = true, shouldWriteEvent = true } = {}) {
  // Build goods payload (includes image collection)
  const goodsResult = await payload.buildSyncPayload({ existingImageGist, dirtyIds })
  const { syncData, imageStats, imageFiles, referencedImageFiles } = goodsResult

  // Build recharge payload
  let rechargeSyncData = { recharge: [], rechargeTrash: [] }
  if (shouldWriteRecharge) {
    rechargeSyncData = payload.buildRechargeSyncData({ incremental: false })
  }

  // Build event payload (heavy due to images)
  let eventSyncData = { events: [] }
  let eventImageStats = { imageFileCount: 0 }
  let eventImageFiles = {}
  let eventReferencedImageFiles = []
  if (shouldWriteEvent) {
    const eventResult = await payload.buildEventSyncPayload({ existingImageGist })
    eventSyncData = eventResult.eventData || { events: [] }
    eventImageStats = eventResult.imageStats || { imageFileCount: 0 }
    eventImageFiles = eventResult.imageFiles || {}
    eventReferencedImageFiles = eventResult.referencedImageFiles || []
  }

  // Merge image files and compute cleanup
  const allReferencedImageFiles = new Set([...referencedImageFiles, ...eventReferencedImageFiles])
  const imageCleanupFiles = imageService.buildImageCleanupFiles(existingImageGist, allReferencedImageFiles)
  const imageUpdates = { ...imageFiles, ...eventImageFiles, ...imageCleanupFiles }

  // Upload images
  if (Object.keys(imageUpdates).length > 0) {
    if (!existingImageGist) existingImageGist = await be.ensureImageGist()
    try { await be.writeImages(existingImageGist.id, imageUpdates) }
    catch (e) { log.warn('image upload failed', e) }
  }

  // Replace gist-image:// URIs with public URLs (Supabase only)
  if (be.getImagePublicUrl) {
    for (const item of [...syncData.goods, ...syncData.trash]) {
      if (!Array.isArray(item.images)) continue
      for (const img of item.images) {
        if (img.gistFileName && allReferencedImageFiles.has(img.gistFileName)) {
          img.uri = be.getImagePublicUrl(img.gistFileName)
        }
      }
    }
    for (const event of (eventSyncData.events || [])) {
      const coverFileName = event.coverImageData?.gistFileName
      if (coverFileName && allReferencedImageFiles.has(coverFileName)) {
        event.coverImage = be.getImagePublicUrl(coverFileName)
      }
      if (Array.isArray(event.photos)) {
        for (const photo of event.photos) {
          const photoFileName = String(photo?.gistFileName || '').trim()
          if (photoFileName && allReferencedImageFiles.has(photoFileName)) {
            photo.uri = be.getImagePublicUrl(photoFileName)
          }
        }
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

  return { syncData, rechargeSyncData, eventSyncData, imageStats: mergedImageStats, allReferencedImageFiles }
}

/**
 * Build manifest from current state.
 */
export function buildManifest(payload, imageStats, syncTimestamp, { syncData, rechargeSyncData, eventSyncData, goodsStore, rechargeStore, eventsStore, hasDirtyGoodsIds, shouldWriteRecharge = true, shouldWriteEvent = true, backend }) {
  const isSupabase = !!backend?.pushDomainRows

  const rechargeForCount = shouldWriteRecharge
    ? rechargeSyncData.recharge
    : rechargeStore.exportBackup({ includeDeleted: false, stripImage: true })
  const eventsForCount = shouldWriteEvent
    ? (eventSyncData.events || [])
    : (eventsStore.list || [])
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
 * Write data to remote backend.
 * Uses writeDomainRows when available (Supabase), falls back to writeData (Gist).
 */
export async function writeRemoteData(be, { syncData, rechargeSyncData, eventSyncData, manifest, existingGist, uploadPlan, shouldWriteData = true, shouldWriteRecharge = true, shouldWriteEvent = true }) {
  if (be.pushAll) {
    // Supabase path — single RPC
    await be.pushAll({
      goods: shouldWriteData ? (syncData.goods || []) : [],
      goodsTrash: shouldWriteData ? (syncData.trash || []) : [],
      groups: shouldWriteData ? (syncData.goodsGroups || []) : [],
      groupItems: shouldWriteData ? (syncData.goodsGroupItems || []) : [],
      recharge: shouldWriteRecharge ? (rechargeSyncData.recharge || []) : [],
      rechargeTrash: shouldWriteRecharge ? (rechargeSyncData.rechargeTrash || []) : [],
      events: shouldWriteEvent ? (eventSyncData.events || []) : [],
      presets: shouldWriteData ? syncData.presets : null,
      deleteGoods: shouldWriteData ? (uploadPlan?.deleteIdsByFile?.['data.json'] || []) : [],
      deleteGroups: shouldWriteData ? (uploadPlan?.deleteIdsByFile?.goodsGroups || []) : [],
      deleteGroupItems: shouldWriteData ? (uploadPlan?.deleteIdsByFile?.goodsGroupItems || []) : [],
      deleteRecharge: shouldWriteRecharge ? (uploadPlan?.deleteIdsByFile?.['recharge-data.json'] || []) : [],
      deleteEvents: shouldWriteEvent ? (uploadPlan?.deleteIdsByFile?.['events-data.json'] || []) : [],
      deviceId: manifest?.deviceId || '',
      syncedAt: manifest?.lastSyncAt || new Date().toISOString(),
      imageBucket: manifest?.imageGistId || 'goods-images',
      budgetMonthly: manifest?.budgetMonthly || 0,
      budgetYearly: manifest?.budgetYearly || 0,
      rechargeUpdatedAt: manifest?.rechargeUpdatedAt || null,
      eventUpdatedAt: manifest?.eventUpdatedAt || null
    })
  } else {
    // Gist path — build dataMap and call writeData
    const dataMap = {}

    if (shouldWriteData) {
      dataMap['data.json'] = { content: syncData }
    }
    if (shouldWriteRecharge) {
      dataMap['recharge-data.json'] = { content: rechargeSyncData }
    }
    if (shouldWriteEvent) {
      dataMap['events-data.json'] = { content: eventSyncData }
    }
    if (manifest) {
      dataMap['manifest.json'] = { content: manifest }
    }

    if (Object.keys(dataMap).length > 0) {
      await be.writeData(existingGist?.id || be.getDataGistId(), dataMap)
    }
  }
}

/**
 * Update local image references after push.
 * Marks images as remote so future syncs can dedup.
 */
export async function updateLocalRefs(goodsStore, eventsStore, syncData, eventSyncData, be) {
  // Update goods image refs
  const preparedImagesByItemId = new Map()
  for (const item of [...(syncData.goods || []), ...(syncData.trash || [])]) {
    const images = item.images
    if (!Array.isArray(images)) continue
    const imageMap = new Map()
    for (let i = 0; i < images.length; i++) {
      if (images[i]?.gistFileName) {
        const entry = { ...images[i] }
        if (be.getImagePublicUrl) {
          entry.uri = be.getImagePublicUrl(entry.gistFileName)
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
      const coverFileName = String(event?.coverImageData?.gistFileName || '').trim()
      const hasCover = !!coverFileName
      const hasPhotos = Array.isArray(event?.photos) && event.photos.some(photo => String(photo?.gistFileName || '').trim())
      if (!hasCover && !hasPhotos) continue
      preparedMediaByEventId.set(eventId, {
        coverImage: event.coverImage,
        coverImageData: event.coverImageData ? { ...event.coverImageData } : null,
        photos: Array.isArray(event.photos) ? event.photos.map(photo => ({ ...photo })) : []
      })
    }
    await eventsStore.markMediaAsRemote(preparedMediaByEventId)
  }
}
