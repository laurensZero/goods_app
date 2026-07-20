// src/services/syncOrchestrator.js
// Stateless sync orchestrator — coordinates pull/push via pipeline functions.
// The store only manages state/persistence and delegates to this.

import { buildImageSyncStats, countWishlistSplit, getItemTimestamp, normalizeBudgetValue, getLatestRechargeTimestamp, shouldPullRechargeByManifest, readBudgetSettings } from '@/utils/sync/shared'
import { parseGistImageUri, normalizeGoodsImageList } from '@/utils/goods/images'
import { compareStateSync } from '@/utils/sync/stateCompare'
import { wrapSyncError, PHASE_ENSURE_GIST, PHASE_READ_MANIFEST, PHASE_READ_REMOTE, PHASE_PULL, PHASE_PUSH, PHASE_WRITE_DATA } from './syncError'
import { readRemoteData, diffLocalRemote, hydrateRemoteImages, mergeToLocal } from './syncPullPipeline'
import { buildPayloadAndUploadImages, buildManifest, writeRemoteData, updateLocalRefs } from './syncPushPipeline'
import { createLogger } from '@/utils/logger'
import i18n from '@/locales'

const log = createLogger('sync:orchestrator')

export function createSyncOrchestrator({
  backend,
  payload,
  image,
  conflict,
  useGoodsStore,
  useRechargeStore,
  useEventsStore,
  usePresetsStore,
  useGoodsGroupStore,
  trackSyncStep,
  constants
}) {
  const { DATA_FILENAME, RECHARGE_DATA_FILENAME, EVENT_DATA_FILENAME, MANIFEST_FILENAME } = constants

  // ── Helpers ──

  function getLocalStores() {
    return {
      goodsStore: useGoodsStore(),
      rechargeStore: useRechargeStore(),
      eventsStore: useEventsStore(),
      goodsGroupStore: useGoodsGroupStore(),
      presetsStore: usePresetsStore()
    }
  }

  function canQuickPush(be, dirtyGoodsIds, dirtyDomains) {
    return (be.pushAll || be.pushDomainRows)
      && dirtyGoodsIds && dirtyGoodsIds.size > 0
      && dirtyDomains.size <= 1 && dirtyDomains.has('goods')
  }

  // ── pull() — unified pull entry point ──

  async function pull(ctx, opts = {}) {
    const { tables, since = 0, silent = false, forceRecharge = false } = opts
    const be = ctx.backend || backend
    const stores = getLocalStores()
    const isIncremental = since > 0 && (!!be.readDomainRows || !!be.pullAll)

    try {
      // 1. Read remote data
      const gist = isIncremental ? null : await be.getDataGist()
      const [rechargeGist, eventGist] = await Promise.all([
        be.getExistingRechargeGist(),
        be.getExistingEventGist()
      ])
      const remoteData = await readRemoteData(be, {
        tables, since,
        readManifest: !isIncremental,
        readPresets: !isIncremental,
        gist,
        fallbackGists: { rechargeGist, eventGist },
        trackSyncStep
      })

      if (remoteData.manifest?.imageGistId) {
        await ctx.saveImageGistId(remoteData.manifest.imageGistId)
      }

      // 2. Incremental mode: direct merge, skip diff/conflict
      if (isIncremental) {
        await trackSyncStep(
          i18n.global.t('sync.phase.pull'),
          () => mergeToLocal(stores, remoteData, { reconcileMissing: false }),
          {
            startDetail: i18n.global.t('sync.step.readData.startIncremental'),
            category: 'pull',
            successDetail: () => {
              const counts = countPullChanges(remoteData)
              return `✓ ${counts.importedGoods + counts.importedEvents} items merged`
            }
          }
        )
        const ts = new Date().toISOString()
        await ctx.saveLastSyncedAt(ts)
        if (remoteData.events.length > 0) await ctx.saveEventLastSyncedAt(ts)
        const pullCounts = countPullChanges(remoteData)
        const totalPulled = pullCounts.importedGoods + pullCounts.importedEvents + pullCounts.importedRecharge + (pullCounts.importedGroups || 0)
        if (totalPulled === 0) return { action: 'no_changes' }
        return { action: 'pulled', ...pullCounts }
      }

      // 3. Full mode: diff
      const diff = diffLocalRemote(stores, remoteData)
      if (!diff.hasChanges) {
        if (remoteData.manifest?.lastSyncAt) await ctx.saveLastSyncedAt(remoteData.manifest.lastSyncAt)
        return { action: 'no_changes', ...conflict.getLocalChangesSince(remoteData.manifest?.lastSyncAt ? new Date(remoteData.manifest.lastSyncAt).getTime() : 0) }
      }

      // 4. Conflict detection (non-silent only)
      const localSyncTime = ctx.lastSyncedAt ? new Date(ctx.lastSyncedAt).getTime() : 0
      const localChanges = conflict.getLocalChangesSince(localSyncTime)
      if (!silent && localChanges.hasChanges) {
        const remoteTime = remoteData.manifest?.lastSyncAt ? new Date(remoteData.manifest.lastSyncAt).getTime() : 0
        return {
          action: 'conflict', statusMessage: 'sync.remoteDataDetected',
          conflictData: {
            remoteTime: remoteData.manifest?.lastSyncAt, remoteDevice: remoteData.manifest?.deviceId,
            localTime: ctx.lastSyncedAt, localModifiedTime: ctx.getLatestLocalModifiedAt(),
            gist, rechargeGist: await be.getExistingRechargeGist(), eventGist: await be.getExistingEventGist(),
            ...buildConflictCounts(stores, remoteData, diff), isPullOnly: true
          }
        }
      }

      // 5. Hydrate images + merge
      let restoredCount = 0
      await trackSyncStep(
        i18n.global.t('sync.step.restoreCollectionImages'),
        async () => {
          const imgStats = await hydrateRemoteImages(image, be, remoteData, diff)
          restoredCount = imgStats?.restoredImages || 0
          await mergeToLocal(stores, remoteData, {
            reconcileMissing: !remoteData.isIncremental, diff,
            shouldApplyRemoteItem: ctx.shouldApplyRemoteItem,
            localSyncTime
          })
          if (be.getImagePublicUrl) {
            const { cleanupBase64Images } = await import('@/stores/goodsSync')
            await cleanupBase64Images(stores.goodsStore.list, stores.goodsStore.trashList, be).catch(() => {})
          }
        },
        {
          startDetail: i18n.global.t('sync.step.restoreCollectionImages.start'),
          category: 'image',
          successDetail: () => i18n.global.t('sync.step.restoreCollectionImages.success', { count: restoredCount })
        }
      )
      if (remoteData.manifest?.lastSyncAt) await ctx.saveLastSyncedAt(remoteData.manifest.lastSyncAt)
      return { action: 'pulled', ...countPullChanges(remoteData) }
    } catch (e) {
      wrapSyncError(e, PHASE_PULL)
    }
  }

  // ── sync() — unified sync entry point ──

  async function sync(ctx, opts = {}) {
    const { dirtyDomains, dirtyGoodsIds, source } = opts
    const be = ctx.backend || backend
    const stores = getLocalStores()
    await ctx.ensureEventsStoreReady()

    try {
      // Quick push path: single goods edit, no remote read needed
      if (canQuickPush(be, dirtyGoodsIds, dirtyDomains)) {
        try {
          return await quickPush(ctx, dirtyGoodsIds)
        } catch (e) {
          log.warn('quickPush failed, falling back to full sync', e.message)
          // Fall through to full sync
        }
      }

      // Full sync path
      return await fullSync(ctx, stores, be, opts)
    } catch (e) {
      wrapSyncError(e, PHASE_PUSH)
    }
  }

  // ── Quick push: direct upsert of specific dirty goods ──

  async function quickPush(ctx, dirtyIds) {
    const be = ctx.backend || backend
    const goodsStore = useGoodsStore()

    const itemsToPush = []
    const trashToPush = []
    for (const id of dirtyIds) {
      const item = goodsStore.list.find(g => g.id === id)
      if (item) { itemsToPush.push(item); continue }
      const trashItem = goodsStore.trashList.find(g => g.id === id)
      if (trashItem) trashToPush.push(trashItem)
    }

    if (itemsToPush.length === 0 && trashToPush.length === 0) {
      throw new Error('QUICK_PUSH_ITEMS_NOT_FOUND')
    }

    // Check for local-only images
    for (const item of [...itemsToPush, ...trashToPush]) {
      if (!Array.isArray(item.images)) continue
      for (const img of item.images) {
        const uri = String(img?.uri || '')
        const mode = String(img?.storageMode || '')
        if (mode === 'linked-local' || mode === 'inline-local' || mode === 'gist-local'
          || uri.startsWith('data:image/') || uri.startsWith('blob:') || uri.startsWith('file:')
          || uri.includes('localhost')) {
          throw new Error('QUICK_PUSH_HAS_LOCAL_IMAGES')
        }
      }
    }

    const db = be.getDb()
    const currentDeviceId = ctx.deviceId || ''

    // Read existing manifest for non-count fields (image_bucket, timestamps, budget)
    let existingManifest = null
    try {
      const { data } = await db.from('sync_manifest').select('*').eq('id', 'default').limit(1)
      if (data && data.length > 0) existingManifest = data[0]
    } catch { /* will skip manifest update below */ }

    // Single RPC: push items + presets + manifest
    const syncTimestamp = new Date().toISOString()
    let presetsData = null
    try { presetsData = await ctx.buildPresetsData() } catch { /* non-fatal */ }

    await be.pushAll({
      goods: itemsToPush,
      goodsTrash: trashToPush,
      presets: presetsData,
      deviceId: currentDeviceId,
      syncedAt: syncTimestamp,
      imageBucket: existingManifest?.image_bucket ?? 'goods-images',
      rechargeUpdatedAt: existingManifest?.recharge_updated_at ?? null,
      eventUpdatedAt: existingManifest?.event_updated_at ?? null,
      budgetMonthly: existingManifest?.budget_monthly ?? 0,
      budgetYearly: existingManifest?.budget_yearly ?? 0
    })

    await ctx.saveLastSyncedAt(syncTimestamp)

    return { action: 'pushed', pushedItems: itemsToPush.length, pushedTrash: trashToPush.length }
  }

  // ── Full sync: read remote → compare → push or pull ──

  async function fullSync(ctx, stores, be, opts = {}) {
    const { dirtyDomains, dirtyGoodsIds } = opts
    const dirty = dirtyDomains
    const isRechargeDirty = !dirty || dirty.has('recharge')
    const isEventsDirty = !dirty || dirty.has('events')
    const isGoodsDirty = !dirty || dirty.has('goods') || dirty.has('presets') || dirty.has('group')
    const isPresetsDirty = !dirty || dirty.has('presets')
    const isBudgetDirty = !dirty || dirty.has('budget')
    const hasDirtyGoodsIds = dirtyGoodsIds && dirtyGoodsIds.size > 0

    // 1. Read manifest
    let remoteManifest
    try {
      const manifestData = await readRemoteData(be, { readManifest: true, readPresets: false, tables: [], trackSyncStep })
      remoteManifest = manifestData.manifest
    } catch (e) { wrapSyncError(e, PHASE_READ_MANIFEST) }
    if (remoteManifest?.imageGistId) await ctx.saveImageGistId(remoteManifest.imageGistId)

    // 2. Read remote data (incremental — only changed since last sync)
    const localSyncTime = ctx.lastSyncedAt ? new Date(ctx.lastSyncedAt).getTime() : 0

    let remoteData
    try {
      remoteData = await readRemoteData(be, {
        since: localSyncTime,
        readManifest: false, readPresets: isGoodsDirty,
        trackSyncStep
      })
    } catch (e) { wrapSyncError(e, PHASE_READ_REMOTE) }
    remoteData.manifest = remoteManifest

    // 3. Compare
    const remoteTime = remoteManifest?.lastSyncAt ? new Date(remoteManifest.lastSyncAt).getTime() : 0
    const isRemoteFromOtherDevice = !!(remoteManifest?.deviceId && remoteManifest.deviceId !== ctx.deviceId)
    const localChanges = conflict.getLocalChangesSince(localSyncTime)

    let hasDataDiff = hasDirtyGoodsIds
    let goodsDiff = null
    if (isGoodsDirty && !hasDirtyGoodsIds) {
      goodsDiff = diffLocalRemote(stores, remoteData, { incremental: remoteData.isIncremental })
      hasDataDiff = goodsDiff.hasChanges
    }
    const hasRechargeDataDiff = isRechargeDirty
      ? compareStateSync(stores.rechargeStore.exportBackup({ includeDeleted: false, stripImage: true }) || [], remoteData.recharge || [], { incremental: false }).hasChanges
      : false
    const hasEventDataDiff = isEventsDirty
      ? compareStateSync(stores.eventsStore.list || [], remoteData.events || [], { incremental: false }).hasChanges
      : false
    const localBudgetSettings = isBudgetDirty ? await readBudgetSettings() : null
    const hasBudgetDiff = isBudgetDirty && localBudgetSettings && (
      normalizeBudgetValue(localBudgetSettings.monthly) !== normalizeBudgetValue(remoteManifest?.budgetMonthly)
      || normalizeBudgetValue(localBudgetSettings.yearly) !== normalizeBudgetValue(remoteManifest?.budgetYearly)
    )
    let hasPresetsDiff = false
    if (isPresetsDirty && remoteData.presets) {
      try {
        const localPresets = await ctx.buildPresetsData()
        hasPresetsDiff = JSON.stringify(localPresets) !== JSON.stringify(remoteData.presets)
      } catch { hasPresetsDiff = true }
    }
    const hasEffectiveDiff = hasDataDiff || hasRechargeDataDiff || hasEventDataDiff || hasBudgetDiff || hasPresetsDiff

    if (!hasEffectiveDiff) {
      if (remoteManifest?.lastSyncAt) await ctx.saveLastSyncedAt(remoteManifest.lastSyncAt)
      return { action: 'no_changes', ...conflict.getLocalChangesSince(remoteTime || localSyncTime) }
    }

    // 4. Pull or push
    if (remoteTime > localSyncTime) {
      if (!remoteManifest) {
        // First sync — push local data
        return doPush(ctx, stores, be, { hasDataDiff: true, hasRechargeDataDiff: true, hasEventDataDiff: true, hasPresetsDiff: true })
      }
      if (localChanges.hasChanges) {
        return {
          action: 'conflict', statusMessage: 'sync.conflictDetected',
          conflictData: {
            remoteTime: remoteManifest.lastSyncAt, remoteDevice: remoteManifest.deviceId,
            localTime: ctx.lastSyncedAt, localModifiedTime: ctx.getLatestLocalModifiedAt(),
            ...buildConflictCounts(stores, remoteData)
          }
        }
      }
      // Pull — reuse diff from earlier if available, otherwise compute now
      const diff = goodsDiff || diffLocalRemote(stores, remoteData, { incremental: remoteData.isIncremental })
      let restoredCount = 0
      await trackSyncStep(
        i18n.global.t('sync.phase.pull'),
        async () => {
          const imgStats = await hydrateRemoteImages(image, be, remoteData, diff)
          restoredCount = imgStats?.restoredImages || 0
          await mergeToLocal(stores, remoteData, {
            reconcileMissing: !remoteData.isIncremental, diff,
            shouldApplyRemoteItem: ctx.shouldApplyRemoteItem,
            localSyncTime
          })
          if (be.getImagePublicUrl) {
            const { cleanupBase64Images } = await import('@/stores/goodsSync')
            await cleanupBase64Images(stores.goodsStore.list, stores.goodsStore.trashList, be).catch(() => {})
          }
        },
        {
          startDetail: i18n.global.t('sync.step.restoreCollectionImages.start'),
          category: 'pull',
          successDetail: () => i18n.global.t('sync.step.restoreCollectionImages.success', { count: restoredCount })
        }
      )
      if (remoteManifest?.lastSyncAt) await ctx.saveLastSyncedAt(remoteManifest.lastSyncAt)
      return { action: 'pulled', ...countPullChanges(remoteData) }
    }

    // Push (incremental — only send changed items)
    return doPush(ctx, stores, be, { hasDataDiff, hasRechargeDataDiff, hasEventDataDiff, hasBudgetDiff, hasPresetsDiff, hasDirtyGoodsIds, dirtyGoodsIds, remoteData })
  }

  // ── Push implementation ──

  /**
   * Count all unique gist-referenced image files across all goods + events.
   * Used to get the true total when dirty-goods filtering only processes a subset.
   */
  function countAllReferencedImageFiles(goodsStore, eventsStore) {
    const files = new Set()
    const collect = (item) => {
      for (const img of normalizeGoodsImageList(item?.images, item?.coverImage || item?.image || '')) {
        const name = img?.gistFileName || parseGistImageUri(img?.uri)
        if (name) files.add(name)
      }
    }
    for (const g of goodsStore.list) collect(g)
    for (const t of goodsStore.trashList) collect(t)
    for (const ev of (eventsStore.list || [])) {
      const cover = String(ev?.coverImageData?.gistFileName || parseGistImageUri(ev?.coverImage)).trim()
      if (cover) files.add(cover)
      for (const p of (Array.isArray(ev?.photos) ? ev.photos : [])) {
        const name = String(p?.gistFileName || parseGistImageUri(p?.uri)).trim()
        if (name) files.add(name)
      }
    }
    return files.size
  }

  async function doPush(ctx, stores, be, opts = {}) {
    const { hasDataDiff, hasRechargeDataDiff, hasEventDataDiff, hasBudgetDiff, hasPresetsDiff, hasDirtyGoodsIds, dirtyGoodsIds, remoteData } = opts

    // Build payload (without uploading images yet)
    const existingImageGist = await be.getExistingImageGist()
    const { syncData, rechargeSyncData, eventSyncData, imageStats, allReferencedImageFiles, imageUpdates } = await trackSyncStep(
      i18n.global.t('sync.step.buildGoodsPayload'),
      () => buildPayloadAndUploadImages(
        payload, image, be, {
          existingImageGist,
          dirtyIds: hasDirtyGoodsIds ? dirtyGoodsIds : null,
          shouldWriteRecharge: hasRechargeDataDiff,
          shouldWriteEvent: hasEventDataDiff
        }
      ),
      {
        startDetail: i18n.global.t('sync.step.buildGoodsPayload.start'),
        category: 'local',
        successDetail: (result) => {
          const syncData = result.syncData
          return i18n.global.t('sync.step.buildGoodsPayload.success', {
            collection: (syncData.goods || []).length,
            trash: (syncData.trash || []).length,
            images: result.imageStats.imageFileCount
          })
        }
      }
    )

    // When only dirty items were processed, imageStats only counts their images.
    // The manifest needs the TOTAL image count across all items.
    if (hasDirtyGoodsIds) {
      imageStats.imageFileCount = countAllReferencedImageFiles(stores.goodsStore, stores.eventsStore)
    }

    // Build manifest
    const syncTimestamp = new Date().toISOString()
    const manifest = buildManifest(payload, imageStats, syncTimestamp, {
      syncData, rechargeSyncData, eventSyncData,
      goodsStore: stores.goodsStore, rechargeStore: stores.rechargeStore, eventsStore: stores.eventsStore,
      hasDirtyGoodsIds, shouldWriteRecharge: hasRechargeDataDiff, shouldWriteEvent: hasEventDataDiff,
      backend: be
    })

    // Write data to remote FIRST — before uploading images.
    // This ensures data is safely persisted before images are uploaded,
    // preventing orphaned images in Storage when the data write fails.
    try {
      await trackSyncStep(
        i18n.global.t('sync.step.pushData'),
        () => writeRemoteData(be, {
          syncData, rechargeSyncData, eventSyncData, manifest,
          existingGist: existingImageGist,
          remoteData,
          shouldWriteData: hasDataDiff,
          shouldWriteRecharge: hasRechargeDataDiff,
          shouldWriteEvent: hasEventDataDiff,
          shouldWritePresets: hasPresetsDiff,
          // When dirty-filtered, syncData.goods is only a subset.
          // Pass full local lists so computeDeleteIds doesn't falsely flag
          // non-dirty remote items for deletion.
          fullGoodsList: hasDirtyGoodsIds ? stores.goodsStore.list : null,
          fullTrashList: hasDirtyGoodsIds ? stores.goodsStore.trashList : null
        }),
        {
          startDetail: i18n.global.t('sync.step.pushData.start'),
          category: 'sync',
          successDetail: () => i18n.global.t('sync.step.pushData.success')
        }
      )
    } catch (e) { wrapSyncError(e, PHASE_WRITE_DATA) }

    // Upload images AFTER data is safely written.
    // If image upload fails, data is already in the remote DB — next sync will retry.
    if (Object.keys(imageUpdates).length > 0) {
      if (!existingImageGist) existingImageGist = await be.ensureImageGist()
      try {
        const imgResult = await be.writeImages(existingImageGist.id, imageUpdates)
        if (imgResult?.failed > 0) {
          log.warn(`image upload: ${imgResult.failed} failed, ${imgResult.uploaded} succeeded`)
        }
      }
      catch (e) { log.warn('image upload failed (data already saved):', e) }
    } else {
      log.debug('no image updates to upload')
    }

    // Update local refs
    await updateLocalRefs(stores.goodsStore, stores.eventsStore, syncData, eventSyncData, be)

    // Clean up any remaining base64 images in SQLite (Supabase only)
    if (be.getImagePublicUrl) {
      const { cleanupBase64Images } = await import('@/stores/goodsSync')
      await cleanupBase64Images(stores.goodsStore.list, stores.goodsStore.trashList, be).catch(() => {})
    }

    // Save timestamps
    await ctx.saveLastSyncedAt(manifest.lastSyncAt)
    await ctx.saveEventLastSyncedAt(eventSyncData.updatedAt || manifest.lastSyncAt)

    const dataGistId = be.getDataGistId()
    if (ctx.rechargeGistId && ctx.rechargeGistId !== dataGistId) await ctx.saveRechargeGistId('')
    if (ctx.eventGistId && ctx.eventGistId !== dataGistId) await ctx.saveEventGistId('')

    return {
      action: 'pushed',
      ...imageStats,
      totalGoods: (syncData.goods || []).length,
      totalTrash: (syncData.trash || []).length,
      totalRecharge: (rechargeSyncData.recharge || []).length,
      totalEvents: (eventSyncData.events || []).length
    }
  }

  // ── Conflict resolution ──

  async function resolveConflict(ctx, useRemote) {
    if (useRemote) {
      return pull(ctx, { silent: true })
    }
    return sync(ctx)
  }

  async function resolvePullConflict(ctx, confirm) {
    if (!confirm) return { action: 'cancelled', statusMessage: 'sync.pullCancelled' }
    return pull(ctx, { silent: true })
  }

  // ── Count helpers ──

  function countPullChanges(remoteData) {
    return {
      importedGoods: (remoteData.goods || []).length,
      importedTrash: (remoteData.trash || []).length,
      importedRecharge: (remoteData.recharge || []).length,
      importedEvents: (remoteData.events || []).length
    }
  }

  function buildConflictCounts(stores, remoteData, diff) {
    const remoteGoods = remoteData.goods || []
    const remoteTrash = remoteData.trash || []
    const remoteCounts = countWishlistSplit(remoteGoods)
    return {
      remoteGoodsCount: remoteGoods.length,
      remoteCollectionCount: remoteCounts.collection,
      remoteWishlistCount: remoteCounts.wishlist,
      remoteTrashCount: remoteTrash.length,
      remoteRechargeCount: (remoteData.recharge || []).length,
      remoteEventCount: (remoteData.events || []).length,
      remoteGroupCount: (remoteData.groups || []).length,
      remoteGroupItemCount: (remoteData.groupItems || []).length,
      rechargeGist: null, eventGist: null
    }
  }

  return { pull, sync, resolveConflict, resolvePullConflict }
}
