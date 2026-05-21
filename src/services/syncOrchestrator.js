import { buildComparableRecordMap, buildImageSyncStats, countComparableRecordDiff, countWishlistSplit, getItemTimestamp, resolveGoodsTrashMaps } from '@/utils/sync/shared'
import { parseGistImageUri } from '@/utils/goods/images'
import { writePersisted } from '@/utils/platform/storage'
import { MONTHLY_BUDGET_STORAGE_KEY, YEARLY_BUDGET_STORAGE_KEY } from '@/constants/budgetConstants'
import { wrapSyncError, PHASE_ENSURE_GIST, PHASE_READ_MANIFEST, PHASE_READ_REMOTE, PHASE_PULL, PHASE_PUSH, PHASE_UPLOAD_IMAGES, PHASE_WRITE_DATA } from './syncError'

/**
 * Stateless sync orchestrator. All sync logic lives here.
 * The store only manages state/persistence and delegates to this.
 *
 * @param {object} deps - Service dependencies (injected once at store init)
 * @param {object} ctx  - Runtime context (passed per call from the store)
 */
export function createSyncOrchestrator({
  backend,
  payload,
  image,
  conflict,
  useGoodsStore,
  useRechargeStore,
  useEventsStore,
  usePresetsStore,
  trackSyncStep,
  constants
}) {
  const {
    DATA_FILENAME,
    RECHARGE_DATA_FILENAME,
    EVENT_DATA_FILENAME,
    MANIFEST_FILENAME
  } = constants

  // ── Dynamic backend selection ──
  // Set by public entry points (fullSync/pullOnly/resolveConflict/resolvePullConflict)
  // to allow ctx.backend to override the closure-injected backend.
  let activeBackend = backend

  // ── Internal: read JSON from Gist with logging + decryption ──

  async function readJson(opts) {
    return activeBackend.readJson(opts)
  }

  function toTimestampMs(value) {
    if (!value) return 0
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0
    const ms = new Date(value).getTime()
    return Number.isFinite(ms) ? ms : 0
  }

  function normalizeBudgetValue(value) {
    const num = Number(value)
    if (!Number.isFinite(num) || num <= 0) return 0
    return num
  }

  async function applyRemoteBudgetSettings(settings) {
    if (!settings || typeof settings !== 'object') return false

    const monthly = normalizeBudgetValue(settings.monthly)
    const yearly = normalizeBudgetValue(settings.yearly)

    await Promise.all([
      writePersisted(MONTHLY_BUDGET_STORAGE_KEY, monthly > 0 ? String(monthly) : ''),
      writePersisted(YEARLY_BUDGET_STORAGE_KEY, yearly > 0 ? String(yearly) : '')
    ])

    return true
  }

  function getLatestRechargeTimestamp(records = []) {
    let latest = 0
    for (const item of records || []) {
      latest = Math.max(latest, getItemTimestamp(item))
    }
    return latest
  }

  function shouldPullRechargeByManifest(remoteManifest, rechargeStore) {
    const remoteRechargeTs = toTimestampMs(remoteManifest?.rechargeUpdatedAt)
    if (!remoteRechargeTs) return true
    const localRecharge = rechargeStore.exportBackup({ includeDeleted: false, stripImage: true })
    const localRechargeTs = getLatestRechargeTimestamp(localRecharge)
    return remoteRechargeTs > localRechargeTs
  }

  // ── Internal: pull from remote ──

  function resolveCoverGistFileName(event) {
    return String(event?.coverImageData?.gistFileName || parseGistImageUri(event?.coverImage) || '').trim()
  }

  function collectChangedGoodsIds(localResolved, remoteResolved, shouldApplyRemoteItem) {
    const targetGoodsIds = new Set()
    for (const remoteItem of remoteResolved.goodsMap.values()) {
      const localItem = localResolved.goodsMap.get(remoteItem.id)
      const localTrashItem = localResolved.trashMap.get(remoteItem.id)
      if (!localItem && !localTrashItem) {
        targetGoodsIds.add(remoteItem.id)
        continue
      }
      if (localTrashItem) {
        if (getItemTimestamp(remoteItem) > getItemTimestamp(localTrashItem)) {
          targetGoodsIds.add(remoteItem.id)
        }
        continue
      }
      if (shouldApplyRemoteItem(localItem, remoteItem)) {
        targetGoodsIds.add(remoteItem.id)
      }
    }
    return targetGoodsIds
  }

  function collectChangedTrashIds(localResolved, remoteResolved, shouldApplyRemoteItem) {
    const targetTrashIds = new Set()
    for (const remoteItem of remoteResolved.trashMap.values()) {
      const localGoodsItem = localResolved.goodsMap.get(remoteItem.id)
      const localTrashItem = localResolved.trashMap.get(remoteItem.id)
      if (localGoodsItem) {
        if (getItemTimestamp(remoteItem) >= getItemTimestamp(localGoodsItem)) {
          targetTrashIds.add(remoteItem.id)
        }
        continue
      }
      if (!localTrashItem) {
        targetTrashIds.add(remoteItem.id)
        continue
      }
      if (shouldApplyRemoteItem(localTrashItem, remoteItem)) {
        targetTrashIds.add(remoteItem.id)
      }
    }
    return targetTrashIds
  }

  function collectChangedEventIds(localEvents, remoteEvents) {
    const targetEventIds = new Set()
    const localEventMap = new Map((localEvents || []).map((item) => [item.id, item]))
    for (const remoteEvent of remoteEvents || []) {
      const remoteEventId = String(remoteEvent?.id || '').trim()
      if (!remoteEventId) continue
      const localEvent = localEventMap.get(remoteEventId)
      if (!localEvent) {
        targetEventIds.add(remoteEventId)
        continue
      }
      const remoteUpdatedAt = Number(remoteEvent?.updatedAt) || 0
      const localUpdatedAt = Number(localEvent?.updatedAt) || 0
      const remoteCoverFileName = resolveCoverGistFileName(remoteEvent)
      const localCoverFileName = resolveCoverGistFileName(localEvent)
      const shouldBackfillCoverImageData = !!remoteCoverFileName && !localCoverFileName
      const hasCoverChanged = !!remoteCoverFileName && remoteCoverFileName !== localCoverFileName
      if (remoteUpdatedAt > localUpdatedAt || shouldBackfillCoverImageData || hasCoverChanged) {
        targetEventIds.add(remoteEventId)
      }
    }
    return targetEventIds
  }

  function getRemoteWatermark(remoteManifest, remoteData, rechargeData, eventData) {
    const timestamps = []
    const manifestTs = remoteManifest?.lastSyncAt ? new Date(remoteManifest.lastSyncAt).getTime() : 0
    if (manifestTs > 0) timestamps.push(manifestTs)
    for (const item of remoteData?.goods || []) timestamps.push(getItemTimestamp(item))
    for (const item of remoteData?.trash || []) timestamps.push(getItemTimestamp(item))
    for (const item of rechargeData?.recharge || []) timestamps.push(getItemTimestamp(item))
    for (const item of rechargeData?.rechargeTrash || []) timestamps.push(getItemTimestamp(item))
    for (const item of eventData?.events || []) timestamps.push(Number(item?.updatedAt) || 0)
    return Math.max(0, ...timestamps)
  }

  async function pullFromRemote(gist, remoteManifest, rechargeGist, eventGist, options, ctx) {
    const shouldHydrateGoodsImages = options.hydrateGoodsImages !== false
    const shouldHydrateTrashImages = options.hydrateTrashImages !== false
    const shouldHydrateEventImages = options.hydrateEventImages !== false
    const shouldPullRecharge = options.pullRecharge !== false

    const goodsStore = useGoodsStore()
    const rechargeStore = useRechargeStore()
    const presets = usePresetsStore()
    const eventsStore = useEventsStore()

    const remoteData = await readJson({
      title: '读取 Data',
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

    const localRechargeSnapshot = rechargeStore.exportBackup({ includeDeleted: false, stripImage: true })
    const rechargeData = shouldPullRecharge
      ? await readJson({
          title: '正式拉取 RechargeData',
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
      : { recharge: localRechargeSnapshot, rechargeTrash: [] }

    const eventData = await readJson({
      title: '正式拉取 EventsData',
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

    await applyRemoteBudgetSettings({
      monthly: remoteManifest?.budgetMonthly ?? remoteData?.budgetSettings?.monthly,
      yearly: remoteManifest?.budgetYearly ?? remoteData?.budgetSettings?.yearly
    })

    const localSyncTime = ctx.lastSyncedAt ? new Date(ctx.lastSyncedAt).getTime() : 0
    const remoteWatermark = getRemoteWatermark(remoteManifest, remoteData, rechargeData, eventData)
    const localResolved = resolveGoodsTrashMaps(goodsStore.list, goodsStore.trashList)
    const remoteResolved = resolveGoodsTrashMaps(remoteData.goods || [], remoteData.trash || [])
    const changedGoodsIds = collectChangedGoodsIds(localResolved, remoteResolved, ctx.shouldApplyRemoteItem)
    const changedTrashIds = collectChangedTrashIds(localResolved, remoteResolved, ctx.shouldApplyRemoteItem)
    const changedEventIds = collectChangedEventIds(eventsStore.list || [], Array.isArray(eventData?.events) ? eventData.events : [])
    const goodsTrashCompare = countComparableRecordDiff(
      buildComparableRecordMap([...localResolved.goodsMap.values(), ...localResolved.trashMap.values()]),
      buildComparableRecordMap([...remoteResolved.goodsMap.values(), ...remoteResolved.trashMap.values()])
    )
    const rechargeCompare = countComparableRecordDiff(
      buildComparableRecordMap(rechargeStore.exportBackup({ includeDeleted: false, stripImage: true })),
      buildComparableRecordMap(Array.isArray(rechargeData?.recharge) ? rechargeData.recharge : [])
    )
    const eventCompare = countComparableRecordDiff(
      buildComparableRecordMap(eventsStore.list || []),
      buildComparableRecordMap(Array.isArray(eventData?.events) ? eventData.events : [])
    )

    const hasDataChangesBeforeImages = (
      goodsTrashCompare.remoteOnly > 0 || goodsTrashCompare.localOnly > 0 || goodsTrashCompare.updated > 0
      || rechargeCompare.remoteOnly > 0 || rechargeCompare.localOnly > 0 || rechargeCompare.updated > 0
      || eventCompare.remoteOnly > 0 || eventCompare.localOnly > 0 || eventCompare.updated > 0
    )

    if (!hasDataChangesBeforeImages) {
      if (remoteManifest?.lastSyncAt) await ctx.saveLastSyncedAt(remoteManifest.lastSyncAt)
      if (eventData?.updatedAt || remoteManifest?.lastSyncAt) {
        await ctx.saveEventLastSyncedAt(eventData?.updatedAt || remoteManifest.lastSyncAt)
      }
      return {
        importedGoods: 0, updatedGoods: 0, importedTrash: 0, updatedTrash: 0,
        importedRecharge: 0, updatedRecharge: 0, importedEvents: 0, updatedEvents: 0,
        restoredImages: 0, totalGoods: remoteResolved.goodsMap.size, totalTrash: remoteResolved.trashMap.size,
        totalRecharge: Array.isArray(rechargeData?.recharge) ? rechargeData.recharge.length : 0,
        totalEvents: Array.isArray(eventData?.events) ? eventData.events.length : 0, noChanges: true
      }
    }

    const imageStats = buildImageSyncStats()
    const imageGist = await image.resolveRemoteImageGist(remoteManifest)

    if (shouldHydrateGoodsImages) {
      const before = imageStats.restoredImages
      remoteData.goods = await trackSyncStep('恢复收藏图片', () =>
        image.hydrateRemoteItemsWithImages(remoteData.goods || [], imageGist, imageStats, { targetItemIds: changedGoodsIds }),
        { startDetail: '正在恢复收藏条目图片', category: 'image', successDetail: () => `恢复 ${imageStats.restoredImages - before} 张收藏图片` }
      )
    }
    if (shouldHydrateTrashImages) {
      const before = imageStats.restoredImages
      remoteData.trash = await trackSyncStep('恢复回收站图片', () =>
        image.hydrateRemoteItemsWithImages(remoteData.trash || [], imageGist, imageStats, { targetItemIds: changedTrashIds }),
        { startDetail: '正在恢复回收站条目图片', category: 'image', successDetail: () => `恢复 ${imageStats.restoredImages - before} 张回收站图片` }
      )
    }
    if (shouldHydrateEventImages && eventData && Array.isArray(eventData.events)) {
      const before = imageStats.restoredImages
      eventData.events = await trackSyncStep('恢复活动封面', () =>
        image.hydrateEventCoversWithImages(eventData.events, imageGist, imageStats, { targetEventIds: changedEventIds }),
        { startDetail: '正在恢复活动封面图片', category: 'image', successDetail: () => `恢复 ${imageStats.restoredImages - before} 张活动封面` }
      )
    }

    if (remoteData.presets) await presets.replacePresetsSnapshot(remoteData.presets)

    const resolvedRemote = resolveGoodsTrashMaps(remoteData.goods || [], remoteData.trash || [])
    const remoteGoods = [...resolvedRemote.goodsMap.values()]
    const remoteTrash = [...resolvedRemote.trashMap.values()]

    const goodsToImport = [], goodsToUpdate = []
    const trashIdsToRemove = new Set()
    const localGoodsMap = new Map(goodsStore.list.map((item) => [item.id, item]))
    const localTrashMap = new Map(goodsStore.trashList.map((item) => [item.id, item]))

    for (const remoteItem of remoteGoods) {
      const localItem = localGoodsMap.get(remoteItem.id)
      const localTrashItem = localTrashMap.get(remoteItem.id)
      if (localTrashItem) {
        if (getItemTimestamp(remoteItem) > getItemTimestamp(localTrashItem)) trashIdsToRemove.add(remoteItem.id)
        continue
      }
      if (!localItem) goodsToImport.push(remoteItem)
      else if (ctx.shouldApplyRemoteItem(localItem, remoteItem)) goodsToUpdate.push(remoteItem)
    }

    if (trashIdsToRemove.size > 0) {
      for (const id of trashIdsToRemove) await goodsStore.deleteTrashItem(id)
    }
    if (goodsToImport.length > 0) {
      await goodsStore.importGoodsBackup(goodsToImport)
      await presets.syncCharactersFromGoods(goodsToImport)
      await presets.syncStorageLocationsFromPaths(goodsToImport.map((item) => item.storageLocation).filter(Boolean))
    }
    await goodsStore.updateGoodsBackup(goodsToUpdate)

    const currentGoodsMap = new Map(goodsStore.list.map((item) => [item.id, item]))
    const currentTrashMap = new Map(goodsStore.trashList.map((item) => [item.id, item]))
    const goodsIdsToDelete = new Set(), trashToImport = [], trashToUpdate = []

    for (const remoteItem of remoteTrash) {
      const localGoodsItem = currentGoodsMap.get(remoteItem.id)
      const localTrashItem = currentTrashMap.get(remoteItem.id)
      if (localGoodsItem) {
        if (getItemTimestamp(remoteItem) >= getItemTimestamp(localGoodsItem)) goodsIdsToDelete.add(remoteItem.id)
        continue
      }
      if (!localTrashItem) trashToImport.push(remoteItem)
      else if (ctx.shouldApplyRemoteItem(localTrashItem, remoteItem)) trashToUpdate.push(remoteItem)
    }

    if (goodsIdsToDelete.size > 0) await goodsStore.deleteGoodsPermanently(goodsIdsToDelete)
    if (trashToImport.length > 0) await goodsStore.importTrashBackup(trashToImport)
    if (trashToUpdate.length > 0) await goodsStore.updateTrashBackup(trashToUpdate)

    const remoteGoodsIds = new Set(remoteGoods.map((item) => item.id))
    const remoteTrashIds = new Set(remoteTrash.map((item) => item.id))
    // Safety: don't delete local items if remote is completely empty (prevents data loss on first sync or read errors)
    const hasAnyRemoteData = remoteGoodsIds.size > 0 || remoteTrashIds.size > 0
    if (hasAnyRemoteData) {
      const localOnlyGoodsIds = goodsStore.list
        .filter((item) => !remoteGoodsIds.has(item.id) && !remoteTrashIds.has(item.id))
        .filter((item) => getItemTimestamp(item) <= remoteWatermark)
        .map((item) => item.id)
      const localOnlyTrashIds = goodsStore.trashList
        .filter((item) => !remoteTrashIds.has(item.id) && !remoteGoodsIds.has(item.id))
        .filter((item) => getItemTimestamp(item) <= remoteWatermark)
        .map((item) => item.id)
      if (localOnlyGoodsIds.length > 0) await goodsStore.deleteGoodsPermanently(localOnlyGoodsIds)
      if (localOnlyTrashIds.length > 0) { for (const id of localOnlyTrashIds) await goodsStore.deleteTrashItem(id) }
    }

    const remoteRecharge = Array.isArray(rechargeData?.recharge) ? rechargeData.recharge : []
    const remoteRechargeLegacy = Array.isArray(remoteData.rechargeRecords) ? remoteData.rechargeRecords : []
    const rechargeApplyResult = shouldPullRecharge
      ? await rechargeStore.importBackup([...remoteRecharge, ...remoteRechargeLegacy], {
          reconcileMissing: true,
          preserveLocalNewerThan: remoteWatermark
        })
      : { added: 0, updated: 0, removed: 0, skipped: 0, total: localRechargeSnapshot.length }

    let eventApplyResult = { added: 0, updated: 0, removed: 0, total: 0 }
    if (eventData && Array.isArray(eventData.events)) {
      const eventsStore = useEventsStore()
      eventApplyResult = {
        ...(await eventsStore.importEventsBackup(eventData.events, {
          reconcileMissing: true,
          preserveLocalNewerThan: remoteWatermark
        })),
        total: eventData.events.length
      }
      await ctx.saveEventLastSyncedAt(eventData.updatedAt || remoteManifest?.lastSyncAt || new Date().toISOString())
    }

    return {
      importedGoods: goodsToImport.length, updatedGoods: goodsToUpdate.length,
      importedTrash: trashToImport.length, updatedTrash: trashToUpdate.length,
      importedRecharge: rechargeApplyResult.added, updatedRecharge: rechargeApplyResult.updated,
      importedEvents: eventApplyResult.added, updatedEvents: eventApplyResult.updated,
      removedEvents: eventApplyResult.removed, restoredImages: imageStats.restoredImages,
      totalGoods: remoteGoods.length, totalTrash: remoteTrash.length,
      totalRecharge: rechargeApplyResult.total, totalEvents: eventApplyResult.total
    }
  }

  // ── Internal: push to remote ──

  async function pushToRemote(existingGist, existingImageGist, existingRechargeGist, existingEventGist, ctx) {
    let imageGist = existingImageGist || await activeBackend.ensureImageGist()

    if (imageGist?.files) {
      const firstFileName = Object.keys(imageGist.files).find(f => f !== 'README.md')
      if (firstFileName) {
        await trackSyncStep('检查图片加密状态', async () => {
          const cloudContent = imageGist.files[firstFileName]?.content || ''
          const cloudIsPlaintext = cloudContent.startsWith('data:image/')
          const cloudIsEncrypted = !cloudIsPlaintext && cloudContent.length > 0
          if (cloudIsEncrypted !== activeBackend.isEncryptionEnabled()) {
            imageGist = null
            return `状态不一致（本地${activeBackend.isEncryptionEnabled() ? '加密' : '明文'}，云端${cloudIsEncrypted ? '加密' : '明文'}），触发重传`
          }
          return `状态一致（${activeBackend.isEncryptionEnabled() ? '加密' : '明文'}），无需重传`
        }, { startDetail: '对比本地和云端加密状态', category: 'image', successDetail: (msg) => msg })
      }
    }

    const { syncData, imageStats, imageFiles, referencedImageFiles } = await trackSyncStep('整理收藏/回收站同步数据',
      () => payload.buildSyncPayload({ existingImageGist: imageGist }),
      { startDetail: '读取本地收藏、回收站和图片', category: 'local', successDetail: (p) => `收藏 ${p.syncData.goods.length}，回收站 ${p.syncData.trash.length}，图片 ${p.imageStats.imageFileCount} 个` }
    )
    const rechargeSyncData = await trackSyncStep('整理充值同步数据',
      () => payload.buildRechargeSyncData({ incremental: false }),
      { startDetail: '读取本地充值记录', category: 'local', successDetail: (p) => `充值 ${p.recharge.length} 条` }
    )
    const { eventData: eventSyncData, imageStats: eventImageStats, imageFiles: eventImageFiles, referencedImageFiles: eventReferencedImageFiles } = await trackSyncStep('整理活动同步数据',
      () => payload.buildEventSyncPayload({ existingImageGist: imageGist }),
      { startDetail: '读取活动和封面图片', category: 'local', successDetail: (p) => `活动 ${p.eventData.events.length} 场，图片 ${p.imageStats.imageFileCount} 个` }
    )

    const allReferencedImageFiles = new Set([...referencedImageFiles, ...eventReferencedImageFiles])
    const imageCleanupFiles = image.buildImageCleanupFiles(imageGist, allReferencedImageFiles)
    const imageUpdates = { ...imageFiles, ...eventImageFiles, ...imageCleanupFiles }

    if (Object.keys(imageUpdates).length > 0) {
      if (!imageGist) imageGist = await activeBackend.ensureImageGist()
      try { await activeBackend.writeImages(imageGist.id, imageUpdates) }
      catch (e) { wrapSyncError(e, PHASE_UPLOAD_IMAGES) }
    }

    // Replace gist-image:// URIs in syncData with actual public URLs before writing to database.
    // This ensures the database always has valid URLs, not placeholder gist-image:// references.
    if (activeBackend.getImagePublicUrl) {
      for (const item of [...syncData.goods, ...syncData.trash]) {
        if (!Array.isArray(item.images)) continue
        for (const img of item.images) {
          if (img.gistFileName && allReferencedImageFiles.has(img.gistFileName)) {
            img.uri = activeBackend.getImagePublicUrl(img.gistFileName)
          }
        }
      }
      for (const event of (eventSyncData?.events || [])) {
        const coverFileName = event.coverImageData?.gistFileName
        if (coverFileName && allReferencedImageFiles.has(coverFileName)) {
          event.coverImage = activeBackend.getImagePublicUrl(coverFileName)
        }
      }
    }

    const syncTimestamp = new Date().toISOString()
    const mergedImageStats = {
      uploadedImages: (Number(imageStats.uploadedImages) || 0) + (Number(eventImageStats.uploadedImages) || 0),
      reusedImages: (Number(imageStats.reusedImages) || 0) + (Number(eventImageStats.reusedImages) || 0),
      restoredImages: (Number(imageStats.restoredImages) || 0) + (Number(eventImageStats.restoredImages) || 0),
      imageFileCount: allReferencedImageFiles.size,
      imageUpdatedAt: Object.keys(imageUpdates).length > 0 ? syncTimestamp : ''
    }
    const counts = {
      collectionCount: syncData.goods.filter(g => !g.isWishlist).length,
      wishlistCount: syncData.goods.filter(g => g.isWishlist).length,
      trashCount: syncData.trash.length,
      rechargeCount: rechargeSyncData.recharge.length,
      eventCount: eventSyncData.events.length,
      budgetMonthly: normalizeBudgetValue(syncData?.budgetSettings?.monthly),
      budgetYearly: normalizeBudgetValue(syncData?.budgetSettings?.yearly),
      rechargeUpdatedAt: (() => {
        const ts = getLatestRechargeTimestamp(rechargeSyncData.recharge)
        return ts > 0 ? new Date(ts).toISOString() : ''
      })(),
      eventUpdatedAt: (() => {
        const timestamps = (eventSyncData.events || []).map((item) => Number(item?.updatedAt) || 0)
        const ts = Math.max(0, ...timestamps)
        return ts > 0 ? new Date(ts).toISOString() : ''
      })()
    }
    const manifest = payload.buildManifest(mergedImageStats, syncTimestamp, counts)

    try {
      await trackSyncStep('更新远端数据', () =>
        activeBackend.writeData(existingGist?.id || activeBackend.getDataGistId(), {
          [DATA_FILENAME]: { content: syncData },
          [RECHARGE_DATA_FILENAME]: { content: rechargeSyncData },
          [EVENT_DATA_FILENAME]: { content: eventSyncData },
          [MANIFEST_FILENAME]: { content: manifest }
        }),
        { startDetail: '上传 data / recharge-data / events-data / manifest', category: 'sync', successDetail: () => '远端数据已更新' }
      )
    } catch (e) { wrapSyncError(e, PHASE_WRITE_DATA) }

    // Update local image entries so future syncs can dedup
    const goodsStore = useGoodsStore()
    const preparedImagesByItemId = new Map()
    for (const item of [...syncData.goods, ...syncData.trash]) {
      const images = item.images
      if (!Array.isArray(images)) continue
      const imageMap = new Map()
      for (let i = 0; i < images.length; i++) {
        if (images[i]?.gistFileName) {
          const entry = { ...images[i] }
          // Use public URL for Supabase, fallback to gist-image:// for Gist
          if (activeBackend.getImagePublicUrl) {
            entry.uri = activeBackend.getImagePublicUrl(entry.gistFileName)
          }
          imageMap.set(i, entry)
        }
      }
      if (imageMap.size > 0) preparedImagesByItemId.set(item.id, imageMap)
    }
    await goodsStore.markImagesAsRemote(preparedImagesByItemId)

    await ctx.saveLastSyncedAt(manifest.lastSyncAt)
    await ctx.saveEventLastSyncedAt(eventSyncData.updatedAt || manifest.lastSyncAt)

    const dataGistId = activeBackend.getDataGistId()
    if (ctx.rechargeGistId && ctx.rechargeGistId !== dataGistId) await ctx.saveRechargeGistId('')
    if (ctx.eventGistId && ctx.eventGistId !== dataGistId) await ctx.saveEventGistId('')

    return { ...mergedImageStats }
  }

  // ── Public: fullSync ──

  async function fullSync(ctx) {
    activeBackend = ctx.backend || backend
    await ctx.ensureEventsStoreReady()

    let gist
    try {
      gist = await activeBackend.ensureDataGist({
        buildSyncPayload: payload.buildSyncPayload,
        buildRechargeSyncData: payload.buildRechargeSyncData,
        buildEventSyncPayload: payload.buildEventSyncPayload,
        buildManifest: payload.buildManifest
      })
    } catch (e) { wrapSyncError(e, PHASE_ENSURE_GIST) }

    let remoteManifest
    try {
      remoteManifest = await readJson({
        title: '读取 manifest', gist, fileName: MANIFEST_FILENAME,
        startDetail: '检查远端同步摘要', category: 'pull',
        successDetail: (parsed) => parsed ? `图片存储 ${parsed.imageGistId || '未配置'}` : '未找到 manifest'
      })
    } catch (e) { wrapSyncError(e, PHASE_READ_MANIFEST) }
    if (remoteManifest?.imageGistId) await ctx.saveImageGistId(remoteManifest.imageGistId)

    const existingRechargeGist = await activeBackend.getExistingRechargeGist()
    const existingEventGist = await activeBackend.getExistingEventGist()
    const existingImageGist = await activeBackend.getExistingImageGist(remoteManifest)

    let remoteData, remoteRechargeData, remoteEventData
    try {
      remoteData = await readJson({
        title: '读取 Data', gist, fileName: DATA_FILENAME,
        startDetail: '读取收藏、心愿单和回收站', category: 'pull', required: true, missingMessage: '远端数据为空',
        successDetail: (parsed) => {
          if (!parsed) return '未找到远端主数据'
          const counts = countWishlistSplit(Array.isArray(parsed.goods) ? parsed.goods : [])
          return `收藏 ${counts.collection}，心愿单 ${counts.wishlist}，回收站 ${(parsed.trash || []).length}`
        }
      }) || { goods: [], trash: [], presets: {} }

      const rechargeStore = useRechargeStore()
      const shouldReadRechargePrecheck = shouldPullRechargeByManifest(remoteManifest, rechargeStore)
      remoteRechargeData = shouldReadRechargePrecheck
        ? (await readJson({
            title: '预检读取 RechargeData', gist, fileName: RECHARGE_DATA_FILENAME,
            startDetail: '读取充值记录', category: 'pull', fallbackGist: existingRechargeGist, fallbackFileName: RECHARGE_DATA_FILENAME,
            successDetail: (parsed, source) => parsed ? `${source}，充值 ${(parsed.recharge || []).length} 条` : '未找到充值数据'
          }) || { recharge: Array.isArray(remoteData.recharge) ? remoteData.recharge : [], rechargeTrash: Array.isArray(remoteData.rechargeTrash) ? remoteData.rechargeTrash : [] })
        : { recharge: rechargeStore.exportBackup({ includeDeleted: false, stripImage: true }), rechargeTrash: [] }

      remoteEventData = await readJson({
        title: '预检读取 EventsData', gist, fileName: EVENT_DATA_FILENAME,
        startDetail: '读取活动数据', category: 'pull', fallbackGist: existingEventGist, fallbackFileName: EVENT_DATA_FILENAME,
        successDetail: (parsed, source) => parsed ? `${source}，活动 ${(parsed.events || []).length} 场` : '未找到活动数据'
      }) || { events: [] }
    } catch (e) { wrapSyncError(e, PHASE_READ_REMOTE) }

    const remoteTime = remoteManifest?.lastSyncAt ? new Date(remoteManifest.lastSyncAt).getTime() : 0
    const localSyncTime = ctx.lastSyncedAt ? new Date(ctx.lastSyncedAt).getTime() : 0
    const isRemoteFromOtherDevice = !!(remoteManifest?.deviceId && remoteManifest.deviceId !== ctx.deviceId)
    const localChanges = conflict.getLocalChangesSince(localSyncTime)

    const goodsStore = useGoodsStore()
    const localComparableState = await payload.buildComparableSyncStateFromData({ goods: goodsStore.list, trash: goodsStore.trashList, presets: await ctx.buildPresetsData() })
    const remoteComparableState = await payload.buildComparableSyncStateFromData(remoteData, {
      budgetSettings: {
        monthly: remoteManifest?.budgetMonthly ?? remoteData?.budgetSettings?.monthly,
        yearly: remoteManifest?.budgetYearly ?? remoteData?.budgetSettings?.yearly
      }
    })
    const localRechargeComparableState = payload.buildComparableRechargeStateFromData(payload.buildRechargeSyncData({ incremental: false }))
    const remoteRechargeComparableState = payload.buildComparableRechargeStateFromData(remoteRechargeData)
    const localEventComparableState = payload.buildComparableEventStateFromData(payload.buildEventSyncData())
    const remoteEventComparableState = payload.buildComparableEventStateFromData(remoteEventData)

    const hasDataDiff = localComparableState !== remoteComparableState
    const hasRechargeDataDiff = localRechargeComparableState !== remoteRechargeComparableState
    const hasEventDataDiff = localEventComparableState !== remoteEventComparableState
    const hasEffectiveDiff = hasDataDiff || hasRechargeDataDiff || hasEventDataDiff

    if (!hasEffectiveDiff) {
      if (localChanges.hasChanges && !isRemoteFromOtherDevice) {
        let imageStats
        try { imageStats = await pushToRemote(gist, existingImageGist, existingRechargeGist, existingEventGist, ctx) }
        catch (e) { wrapSyncError(e, PHASE_PUSH) }
        return { action: 'pushed', statusMessage: '上传完成', ...localChanges, ...imageStats }
      }
      if (remoteManifest?.lastSyncAt) await ctx.saveLastSyncedAt(remoteManifest.lastSyncAt)
      if (remoteEventData?.updatedAt || remoteManifest?.lastSyncAt) {
        await ctx.saveEventLastSyncedAt(remoteEventData?.updatedAt || remoteManifest.lastSyncAt)
      }
      return { action: 'no_changes', statusMessage: '数据已经是最新', ...conflict.getLocalChangesSince(remoteTime || localSyncTime) }
    }

    const localPayload = await trackSyncStep('整理本地收藏/回收站数据', () => payload.buildSyncPayload({ existingImageGist }), {
      startDetail: '读取本地收藏、回收站和图片', category: 'local',
      successDetail: (p) => `收藏 ${p.syncData.goods.length}，回收站 ${p.syncData.trash.length}，图片 ${p.imageStats.imageFileCount} 个`
    })
    const localEventPayload = await trackSyncStep('整理本地活动数据', () => payload.buildEventSyncPayload({ existingImageGist }), {
      startDetail: '读取活动和封面图片', category: 'local',
      successDetail: (p) => `活动 ${p.eventData.events.length} 场，图片 ${p.imageStats.imageFileCount} 个`
    })
    const allReferencedImageFiles = new Set([...localPayload.referencedImageFiles, ...localEventPayload.referencedImageFiles])
    const pendingAllImageCleanup = image.buildImageCleanupFiles(existingImageGist, allReferencedImageFiles)
    const hasPendingImageChanges = (
      Object.keys(localPayload.imageFiles).length > 0
      || Object.keys(localEventPayload.imageFiles).length > 0
      || Object.keys(pendingAllImageCleanup).length > 0
    )

    if (!hasDataDiff && !hasRechargeDataDiff && !hasEventDataDiff && hasPendingImageChanges) {
      let imageStats
      try { imageStats = await pushToRemote(gist, existingImageGist, existingRechargeGist, existingEventGist, ctx) }
      catch (e) { wrapSyncError(e, PHASE_PUSH) }
      return { action: 'pushed', statusMessage: '上传完成', ...conflict.getLocalChangesSince(remoteTime || localSyncTime), ...imageStats }
    }

    if (remoteTime > localSyncTime || !remoteManifest) {
      // No manifest on remote = first sync, push local data instead of pulling empty remote
      if (!remoteManifest) {
        let imageStats
        try { imageStats = await pushToRemote(gist, existingImageGist, existingRechargeGist, existingEventGist, ctx) }
        catch (e) { wrapSyncError(e, PHASE_PUSH) }
        return { action: 'pushed', statusMessage: '首次上传到 Supabase', ...conflict.getLocalChangesSince(localSyncTime), ...imageStats }
      }
      if (localChanges.hasChanges) {
        return {
          action: 'conflict', statusMessage: '检测到冲突',
          conflictData: {
            remoteTime: remoteManifest.lastSyncAt, remoteDevice: remoteManifest.deviceId,
            localTime: ctx.lastSyncedAt, localModifiedTime: ctx.getLatestLocalModifiedAt(),
            gist, rechargeGist: existingRechargeGist, eventGist: existingEventGist
          }
        }
      }
      let result
      try {
        result = await pullFromRemote(gist, remoteManifest, existingRechargeGist, existingEventGist, {
          hydrateGoodsImages: hasDataDiff,
          hydrateTrashImages: hasDataDiff,
          hydrateEventImages: hasEventDataDiff,
          pullRecharge: hasRechargeDataDiff
        }, ctx)
      } catch (e) { wrapSyncError(e, PHASE_PULL) }
      await ctx.saveLastSyncedAt(remoteManifest.lastSyncAt)
      return { action: 'pulled', statusMessage: '拉取完成', ...result }
    }

    let imageStats
    try { imageStats = await pushToRemote(gist, existingImageGist, existingRechargeGist, existingEventGist, ctx) }
    catch (e) { wrapSyncError(e, PHASE_PUSH) }
    return { action: 'pushed', statusMessage: '上传完成', ...conflict.getLocalChangesSince(remoteTime || localSyncTime), ...imageStats }
  }

  // ── Public: pullOnly ──

  async function pullOnly(ctx, { silent = false } = {}) {
    activeBackend = ctx.backend || backend
    await ctx.ensureEventsStoreReady()
    let gist, existingRechargeGist, existingEventGist
    try {
      [gist, existingRechargeGist, existingEventGist] = await Promise.all([
        activeBackend.getDataGist(),
        activeBackend.getExistingRechargeGist(),
        activeBackend.getExistingEventGist()
      ])
    } catch (e) { wrapSyncError(e, PHASE_ENSURE_GIST) }
    if (!gist) throw new Error('未找到远端数据')

    let remoteManifest, remoteRechargeData, remoteEventData
    try {
      remoteManifest = await readJson({ title: '读取 manifest', gist, fileName: MANIFEST_FILENAME, startDetail: '检查远端同步摘要', category: 'pull',
        successDetail: (parsed) => parsed ? `图片存储 ${parsed.imageGistId || '未配置'}` : '未找到 manifest' })

      const rechargeStore = useRechargeStore()
      const shouldReadRechargePrecheck = shouldPullRechargeByManifest(remoteManifest, rechargeStore)
      const localRechargeSnapshot = rechargeStore.exportBackup({ includeDeleted: false, stripImage: true })

      ;[remoteRechargeData, remoteEventData] = await Promise.all([
        shouldReadRechargePrecheck
          ? readJson({ title: '预检读取 RechargeData', gist, fileName: RECHARGE_DATA_FILENAME, startDetail: '读取充值记录', category: 'pull',
              fallbackGist: existingRechargeGist, fallbackFileName: RECHARGE_DATA_FILENAME,
              successDetail: (parsed, source) => parsed ? `${source}，充值 ${(parsed.recharge || []).length} 条` : '未找到充值数据'
            }).then((result) => result || { recharge: [], rechargeTrash: [] })
          : Promise.resolve({ recharge: localRechargeSnapshot, rechargeTrash: [] }),
        readJson({ title: '预检读取 EventsData', gist, fileName: EVENT_DATA_FILENAME, startDetail: '读取活动数据', category: 'pull',
          fallbackGist: existingEventGist, fallbackFileName: EVENT_DATA_FILENAME,
          successDetail: (parsed, source) => parsed ? `${source}，活动 ${(parsed.events || []).length} 场` : '未找到活动数据'
        }).then((result) => result || { events: [] })
      ])
    } catch (e) { wrapSyncError(e, PHASE_READ_REMOTE) }

    if (remoteManifest?.imageGistId) await ctx.saveImageGistId(remoteManifest.imageGistId)

    const localSyncTime = ctx.lastSyncedAt ? new Date(ctx.lastSyncedAt).getTime() : 0
    const localEventState = payload.buildComparableEventStateFromData(payload.buildEventSyncData())
    const remoteEventState = payload.buildComparableEventStateFromData(remoteEventData)
    const hasEventContentDiff = localEventState !== remoteEventState
    const localRechargeState = payload.buildComparableRechargeStateFromData(payload.buildRechargeSyncData({ incremental: false }))
    const remoteRechargeState = payload.buildComparableRechargeStateFromData(remoteRechargeData)
    const hasRechargeContentDiff = localRechargeState !== remoteRechargeState
    const localChanges = conflict.getLocalChangesSince(localSyncTime)

    // No manifest on remote = nothing to pull, don't delete local data
    if (!remoteManifest) {
      return { action: 'no_changes', statusMessage: '远端无数据，跳过拉取' }
    }

    // Silent 模式（Realtime/visibilitychange 触发）：跳过冲突弹窗，直接拉取
    if (silent) {
      const diff = await conflict.buildPullConflictData(gist, remoteManifest)
      const hasAnyDiff = !!(
        diff.remoteOnlyGoods > 0 || diff.updatedGoods > 0 || diff.localOnlyGoods > 0
        || diff.remoteOnlyRecharge > 0 || diff.updatedRecharge > 0
        || diff.remoteOnlyEvents > 0 || diff.updatedEvents > 0
        || diff.hasBudgetDiff
      )
      if (!hasAnyDiff) {
        if (remoteManifest.lastSyncAt) await ctx.saveLastSyncedAt(remoteManifest.lastSyncAt)
        return { action: 'no_changes', statusMessage: '数据已是最新' }
      }
      let result
      try {
        result = await pullFromRemote(gist, remoteManifest, existingRechargeGist, existingEventGist, {
          hydrateGoodsImages: true,
          hydrateTrashImages: true,
          hydrateEventImages: true,
          pullRecharge: hasRechargeContentDiff
        }, ctx)
      } catch (e) { wrapSyncError(e, PHASE_PULL) }
      await ctx.saveLastSyncedAt(remoteManifest.lastSyncAt)
      return { action: 'pulled', statusMessage: '同步完成', ...result }
    }

    if (localChanges.hasChanges) {
      const diff = await conflict.buildPullConflictData(gist, remoteManifest)
      const hasPullConflict = !!(
        diff.remoteOnlyGoods > 0 || diff.remoteOnlyCollection > 0 || diff.remoteOnlyWishlist > 0 || diff.remoteOnlyTrash > 0
        || diff.updatedGoods > 0 || diff.localOnlyGoods > 0 || diff.localOnlyCollection > 0 || diff.localOnlyWishlist > 0 || diff.localOnlyTrash > 0
        || hasRechargeContentDiff || hasEventContentDiff || diff.hasBudgetDiff
      )
      if (!hasPullConflict) {
        if (remoteManifest.lastSyncAt) await ctx.saveLastSyncedAt(remoteManifest.lastSyncAt)
        return { action: 'no_changes', statusMessage: '数据已是最新' }
      }
      return {
        action: 'conflict', statusMessage: '检测到远端数据',
        conflictData: { ...diff, rechargeGist: existingRechargeGist, eventGist: existingEventGist, isPullOnly: true }
      }
    }

    const diff = await conflict.buildPullConflictData(gist, remoteManifest)
    const pullGoodsContentDiff = !!(
      diff.remoteOnlyGoods > 0 || diff.remoteOnlyCollection > 0 || diff.remoteOnlyWishlist > 0 || diff.remoteOnlyTrash > 0
      || diff.updatedGoods > 0 || diff.localOnlyGoods > 0 || diff.localOnlyCollection > 0 || diff.localOnlyWishlist > 0 || diff.localOnlyTrash > 0
    )
    const pullRechargeContentDiff = hasRechargeContentDiff
    const pullEventContentDiff = hasEventContentDiff
    const pullBudgetContentDiff = diff.hasBudgetDiff

    if (!pullGoodsContentDiff && !pullRechargeContentDiff && !pullEventContentDiff && !pullBudgetContentDiff) {
      if (remoteManifest.lastSyncAt) await ctx.saveLastSyncedAt(remoteManifest.lastSyncAt)
      return { action: 'no_changes', statusMessage: '数据已是最新' }
    }

    let result
    try {
      result = await pullFromRemote(gist, remoteManifest, existingRechargeGist, existingEventGist, {
        hydrateGoodsImages: pullGoodsContentDiff,
        hydrateTrashImages: pullGoodsContentDiff,
        hydrateEventImages: pullEventContentDiff,
        pullRecharge: pullRechargeContentDiff
      }, ctx)
    } catch (e) { wrapSyncError(e, PHASE_PULL) }
    await ctx.saveLastSyncedAt(remoteManifest.lastSyncAt)
    return { action: 'pulled', statusMessage: '拉取完成', ...result }
  }

  // ── Public: resolveConflict ──

  async function resolveConflict(ctx, useRemote) {
    activeBackend = ctx.backend || backend
    if (useRemote) {
      let remoteManifest
      try {
        remoteManifest = await readJson({
          title: '读取 manifest', gist: ctx.conflictData.gist, fileName: MANIFEST_FILENAME,
          startDetail: '读取冲突远端摘要', category: 'pull',
          successDetail: (parsed) => parsed ? `图片存储 ${parsed.imageGistId || '未配置'}` : '未找到 manifest'
        })
      } catch (e) { wrapSyncError(e, PHASE_READ_MANIFEST) }
      const hasGoodsContentDiff = !!(
        ctx.conflictData.remoteOnlyGoods > 0 || ctx.conflictData.remoteOnlyCollection > 0 || ctx.conflictData.remoteOnlyWishlist > 0
        || ctx.conflictData.remoteOnlyTrash > 0 || ctx.conflictData.updatedGoods > 0 || ctx.conflictData.localOnlyGoods > 0
        || ctx.conflictData.localOnlyCollection > 0 || ctx.conflictData.localOnlyWishlist > 0 || ctx.conflictData.localOnlyTrash > 0
      )
      const hasEventContentDiff = !!(ctx.conflictData.remoteOnlyEvents > 0 || ctx.conflictData.updatedEvents > 0 || ctx.conflictData.localOnlyEvents > 0)
      let result
      try {
        result = await pullFromRemote(ctx.conflictData.gist, remoteManifest, ctx.conflictData.rechargeGist || null, ctx.conflictData.eventGist || null, {
          hydrateGoodsImages: hasGoodsContentDiff, hydrateTrashImages: hasGoodsContentDiff, hydrateEventImages: hasEventContentDiff
        }, ctx)
      } catch (e) { wrapSyncError(e, PHASE_PULL) }
      await ctx.saveLastSyncedAt(remoteManifest?.lastSyncAt || new Date().toISOString())
      return { action: 'pulled', statusMessage: '拉取完成', ...result }
    }

    let imageStats
    try { imageStats = await pushToRemote(ctx.conflictData.gist, null, ctx.conflictData.rechargeGist || null, ctx.conflictData.eventGist || null, ctx) }
    catch (e) { wrapSyncError(e, PHASE_PUSH) }
    return { action: 'pushed', statusMessage: '上传完成', ...imageStats }
  }

  // ── Public: resolvePullConflict ──

  async function resolvePullConflict(ctx, confirm) {
    activeBackend = ctx.backend || backend
    if (!confirm) return { action: 'cancelled', statusMessage: '已取消' }

    let remoteManifest
    try { remoteManifest = await activeBackend.getManifest(ctx.conflictData.gist) }
    catch (e) { wrapSyncError(e, PHASE_READ_MANIFEST) }
    const hasGoodsContentDiff = !!(
      ctx.conflictData.remoteOnlyGoods > 0 || ctx.conflictData.remoteOnlyCollection > 0 || ctx.conflictData.remoteOnlyWishlist > 0
      || ctx.conflictData.remoteOnlyTrash > 0 || ctx.conflictData.updatedGoods > 0 || ctx.conflictData.localOnlyGoods > 0
      || ctx.conflictData.localOnlyCollection > 0 || ctx.conflictData.localOnlyWishlist > 0 || ctx.conflictData.localOnlyTrash > 0
    )
    const hasEventContentDiff = !!(ctx.conflictData.remoteOnlyEvents > 0 || ctx.conflictData.updatedEvents > 0 || ctx.conflictData.localOnlyEvents > 0)
    let result
    try {
      result = await pullFromRemote(ctx.conflictData.gist, remoteManifest, ctx.conflictData.rechargeGist || null, ctx.conflictData.eventGist || null, {
        hydrateGoodsImages: hasGoodsContentDiff, hydrateTrashImages: hasGoodsContentDiff, hydrateEventImages: hasEventContentDiff
      }, ctx)
    } catch (e) { wrapSyncError(e, PHASE_PULL) }
    return { action: 'pulled', statusMessage: '拉取完成', ...result }
  }

  return { fullSync, pullOnly, resolveConflict, resolvePullConflict }
}
