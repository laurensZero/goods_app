// src/services/syncPushPipeline.js
// Push pipeline: build payload → write remote → upload images → update local refs

import { normalizeBudgetValue } from '@/utils/sync/shared'
import { computeDiffRows, computeDeleteIds } from './supabaseAdapter/helpers'
import { createLogger } from '@/utils/logger'
import i18n from '@/locales'

const log = createLogger('sync:pushPipeline')

/**
 * Build sync payloads (image upload is deferred to doPush).
 * Returns { syncData, rechargeSyncData, eventSyncData, imageStats, allReferencedImageFiles, imageUpdates }.
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

  // NOTE: Image upload is deferred to doPush().
  // Data is written to remote FIRST, then images are uploaded.
  // This prevents orphaned images in Storage when the data write fails.

  // Replace gist-image:// URIs with public URLs (Supabase only).
  // Public URLs are deterministic — they don't require the file to exist yet.
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

  return { syncData, rechargeSyncData, eventSyncData, imageStats: mergedImageStats, allReferencedImageFiles, imageUpdates }
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
export async function writeRemoteData(be, { syncData, rechargeSyncData, eventSyncData, manifest, existingGist, uploadPlan, remoteData, shouldWriteData = true, shouldWriteRecharge = true, shouldWriteEvent = true, fullGoodsList = null, fullTrashList = null }) {
  if (be.pushAll) {
    // Supabase path — compute incremental diff when remoteData is available
    const localGoods = shouldWriteData ? (syncData.goods || []) : []
    const localTrash = shouldWriteData ? (syncData.trash || []) : []
    const localGroups = shouldWriteData ? (syncData.goodsGroups || []) : []
    const localGroupItems = shouldWriteData ? (syncData.goodsGroupItems || []) : []
    const localRecharge = shouldWriteRecharge ? (rechargeSyncData.recharge || []) : []
    const localRechargeTrash = shouldWriteRecharge ? (rechargeSyncData.rechargeTrash || []) : []
    const localEvents = shouldWriteEvent ? (eventSyncData.events || []) : []

    // When dirty-filtered, localGoods/localTrash are only subsets of the full local data.
    // computeDeleteIds must use the FULL local lists — otherwise items that exist on remote
    // but aren't in the dirty subset would be incorrectly flagged for deletion.
    const deleteGoodsLocal = fullGoodsList || localGoods
    const deleteTrashLocal = fullTrashList || localTrash

    let goods = localGoods, goodsTrash = localTrash
    let groups = localGroups, groupItems = localGroupItems
    let recharge = localRecharge, rechargeTrash = localRechargeTrash
    let events = localEvents
    let deleteGoods = shouldWriteData ? (uploadPlan?.deleteIdsByFile?.['data.json'] || []) : []
    let deleteGroups = shouldWriteData ? (uploadPlan?.deleteIdsByFile?.goodsGroups || []) : []
    let deleteGroupItems = shouldWriteData ? (uploadPlan?.deleteIdsByFile?.goodsGroupItems || []) : []
    let deleteRecharge = shouldWriteRecharge ? (uploadPlan?.deleteIdsByFile?.['recharge-data.json'] || []) : []
    let deleteEvents = shouldWriteEvent ? (uploadPlan?.deleteIdsByFile?.['events-data.json'] || []) : []

    if (remoteData) {
      // Incremental: only send changed items
      if (shouldWriteData) {
        goods = await computeDiffRows(localGoods, remoteData.goods || [])
        goodsTrash = await computeDiffRows(localTrash, remoteData.trash || [])
        groups = await computeDiffRows(localGroups, remoteData.groups || [])
        groupItems = await computeDiffRows(localGroupItems, remoteData.groupItems || [])
        // Use full local lists for delete computation to avoid dirty-filter false positives.
        // Combine goods + trash: an item moved to trash locally must not be flagged as deleted.
        deleteGoods = computeDeleteIds(
          [...deleteGoodsLocal, ...deleteTrashLocal],
          [...(remoteData.goods || []), ...(remoteData.trash || [])]
        )
        deleteGroups = computeDeleteIds(localGroups, remoteData.groups || [])
        deleteGroupItems = computeDeleteIds(localGroupItems, remoteData.groupItems || [])
      }
      if (shouldWriteRecharge) {
        recharge = await computeDiffRows(localRecharge, remoteData.recharge || [])
        rechargeTrash = await computeDiffRows(localRechargeTrash, remoteData.rechargeTrash || [])
        deleteRecharge = computeDeleteIds(localRecharge, remoteData.recharge || [])
      }
      if (shouldWriteEvent) {
        events = await computeDiffRows(localEvents, remoteData.events || [])
        deleteEvents = computeDeleteIds(localEvents, remoteData.events || [])
      }
    }

    await be.pushAll({
      goods, goodsTrash, groups, groupItems,
      recharge, rechargeTrash, events,
      presets: shouldWriteData ? syncData.presets : null,
      deleteGoods, deleteGroups, deleteGroupItems,
      deleteRecharge, deleteEvents,
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
