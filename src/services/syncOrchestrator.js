import { asyncBuildComparableRecordMap, buildImageSyncStats, buildTimestampRecordMap, countComparableRecordDiff, countWishlistSplit, getItemTimestamp, resolveGoodsTrashMaps, toTimestampMs, normalizeBudgetValue, getLatestRechargeTimestamp, shouldPullRechargeByManifest, readBudgetSettings } from '@/utils/sync/shared'
import { parseGistImageUri } from '@/utils/goods/images'
import { writePersisted } from '@/utils/platform/storage'
import { MONTHLY_BUDGET_STORAGE_KEY, YEARLY_BUDGET_STORAGE_KEY } from '@/constants/budgetConstants'
import { wrapSyncError, PHASE_ENSURE_GIST, PHASE_READ_MANIFEST, PHASE_READ_REMOTE, PHASE_PULL, PHASE_PUSH, PHASE_UPLOAD_IMAGES, PHASE_WRITE_DATA } from './syncError'
import { createLogger } from '@/utils/logger'
import i18n from '@/locales'

const log = createLogger('sync:orchestrator')

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
  useGoodsGroupStore,
  trackSyncStep,
  constants
}) {
  const {
    DATA_FILENAME,
    RECHARGE_DATA_FILENAME,
    EVENT_DATA_FILENAME,
    MANIFEST_FILENAME
  } = constants

  // ── Internal: read JSON from Gist with logging + decryption ──

  async function readJson(be, opts) {
    return be.readJson(opts)
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

  function getLatestGoodsTrashTimestamp(goods = [], trash = []) {
    let latest = 0
    for (const item of goods || []) latest = Math.max(latest, getItemTimestamp(item))
    for (const item of trash || []) latest = Math.max(latest, getItemTimestamp(item))
    return latest
  }

  function getLatestEventTimestamp(events = []) {
    let latest = 0
    for (const item of events || []) {
      latest = Math.max(latest, Number(item?.updatedAt) || 0)
    }
    return latest
  }

  function countIncrementalComparableDiff(localMap, remoteMap) {
    let remoteOnly = 0
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
    return {
      remoteTotal: remoteMap.size,
      remoteOnly,
      localOnly: 0,
      updated
    }
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
    let max = remoteManifest?.lastSyncAt ? new Date(remoteManifest.lastSyncAt).getTime() : 0
    for (const item of remoteData?.goods || []) { const ts = getItemTimestamp(item); if (ts > max) max = ts }
    for (const item of remoteData?.trash || []) { const ts = getItemTimestamp(item); if (ts > max) max = ts }
    for (const item of rechargeData?.recharge || []) { const ts = getItemTimestamp(item); if (ts > max) max = ts }
    for (const item of rechargeData?.rechargeTrash || []) { const ts = getItemTimestamp(item); if (ts > max) max = ts }
    for (const item of eventData?.events || []) { const ts = Number(item?.updatedAt) || 0; if (ts > max) max = ts }
    for (const item of remoteData?.goodsGroups || []) { const ts = Number(item?.updatedAt) || 0; if (ts > max) max = ts }
    for (const item of remoteData?.goodsGroupItems || []) { const ts = Number(item?.updatedAt) || 0; if (ts > max) max = ts }
    return max
  }

  async function pullFromRemote(gist, remoteManifest, rechargeGist, eventGist, options, ctx) {
    const be = ctx.backend || backend
    const shouldHydrateGoodsImages = options.hydrateGoodsImages !== false
    const shouldHydrateTrashImages = options.hydrateTrashImages !== false
    const shouldHydrateEventImages = options.hydrateEventImages !== false
    const shouldPullRecharge = options.pullRecharge !== false
    const enableIncrementalGoods = options.incrementalGoods === true
    const enableIncrementalEvents = options.incrementalEvents === true
    const enableIncrementalRecharge = options.incrementalRecharge === true
    const isSupabaseBackend = typeof be.getImagePublicUrl === 'function'

    const goodsStore = useGoodsStore()
    const rechargeStore = useRechargeStore()
    const presets = usePresetsStore()
    const eventsStore = useEventsStore()

    const localSyncTime = ctx.lastSyncedAt ? new Date(ctx.lastSyncedAt).getTime() : 0
    const useIncrementalGoodsPull = enableIncrementalGoods && isSupabaseBackend && localSyncTime > 0
    const localEventLatestTs = getLatestEventTimestamp(eventsStore.list || [])
    const useIncrementalEventPull = enableIncrementalEvents && isSupabaseBackend && localEventLatestTs > 0

    const cachedRemoteData = options.cachedRemoteData
    const canUseCachedData = !!cachedRemoteData

    log.debug('pull:start', {
      useIncrementalGoodsPull,
      useIncrementalEventPull,
      shouldPullRecharge,
      cachedRemoteData: canUseCachedData,
      localSyncTime,
      localEventLatestTs
    })

    const localRechargeSnapshot = rechargeStore.exportBackup({ includeDeleted: false, stripImage: true })
    const localRechargeLatestTs = getLatestRechargeTimestamp(localRechargeSnapshot)
    const useIncrementalRechargePull = shouldPullRecharge && enableIncrementalRecharge && isSupabaseBackend && localRechargeLatestTs > 0

    const [rawRemoteData, rawRechargeData, rawEventData] = await Promise.all([
      canUseCachedData
        ? Promise.resolve(cachedRemoteData)
        : readJson(be, {
            title: i18n.global.t('sync.step.readData'),
            gist,
            fileName: DATA_FILENAME,
            startDetail: i18n.global.t(useIncrementalGoodsPull ? 'sync.step.readData.startIncremental' : 'sync.step.readData.start'),
            category: 'pull',
            required: true,
            missingMessage: i18n.global.t('sync.step.readData.empty'),
            incrementalSince: useIncrementalGoodsPull ? localSyncTime : 0,
            successDetail: (parsed) => {
              if (!parsed) return i18n.global.t('sync.step.readData.notFound')
              const goods = Array.isArray(parsed.goods) ? parsed.goods : []
              const trash = Array.isArray(parsed.trash) ? parsed.trash : []
              const counts = countWishlistSplit(goods)
              return i18n.global.t(useIncrementalGoodsPull ? 'sync.step.readData.successIncremental' : 'sync.step.readData.success', { collection: counts.collection, wishlist: counts.wishlist, trash: trash.length })
            }
          }),
      shouldPullRecharge
        ? readJson(be, {
            title: i18n.global.t('sync.step.readRecharge'),
            gist,
            fileName: RECHARGE_DATA_FILENAME,
            startDetail: i18n.global.t(useIncrementalRechargePull ? 'sync.step.readRecharge.startIncremental' : 'sync.step.readRecharge.start'),
            category: 'pull',
            fallbackGist: rechargeGist,
            fallbackFileName: RECHARGE_DATA_FILENAME,
            incrementalSince: useIncrementalRechargePull ? localRechargeLatestTs : 0,
            successDetail: (parsed, source) => {
              if (!parsed) return i18n.global.t('sync.step.readRecharge.notFound')
              const recharge = Array.isArray(parsed.recharge) ? parsed.recharge : []
              const rechargeTrash = Array.isArray(parsed.rechargeTrash) ? parsed.rechargeTrash : []
              return i18n.global.t(useIncrementalRechargePull ? 'sync.step.readRecharge.successWithTrashIncremental' : 'sync.step.readRecharge.successWithTrash', { source, count: recharge.length, trash: rechargeTrash.length })
            }
          })
        : Promise.resolve(null),
      readJson(be, {
        title: i18n.global.t('sync.step.readEvents'),
        gist,
        fileName: EVENT_DATA_FILENAME,
        startDetail: i18n.global.t(useIncrementalEventPull ? 'sync.step.readEvents.startIncremental' : 'sync.step.readEvents.start'),
        category: 'pull',
        fallbackGist: eventGist,
        fallbackFileName: EVENT_DATA_FILENAME,
        incrementalSince: useIncrementalEventPull ? localEventLatestTs : 0,
        successDetail: (parsed, source) => {
          if (!parsed) return i18n.global.t('sync.step.readEvents.notFound')
          const events = Array.isArray(parsed.events) ? parsed.events : []
          return i18n.global.t(useIncrementalEventPull ? 'sync.step.readEvents.successIncremental' : 'sync.step.readEvents.success', { source, count: events.length })
        }
      })
    ])

    const remoteData = rawRemoteData || { goods: [], trash: [], presets: {} }
    const rechargeData = rawRechargeData || (shouldPullRecharge ? { recharge: localRechargeSnapshot, rechargeTrash: [] } : { recharge: localRechargeSnapshot, rechargeTrash: [] })
    const eventData = rawEventData

    await applyRemoteBudgetSettings({
      monthly: remoteManifest?.budgetMonthly ?? remoteData?.budgetSettings?.monthly,
      yearly: remoteManifest?.budgetYearly ?? remoteData?.budgetSettings?.yearly
    })

    const remoteWatermark = getRemoteWatermark(remoteManifest, remoteData, rechargeData, eventData)
    const localResolved = resolveGoodsTrashMaps(goodsStore.list, goodsStore.trashList)
    const remoteResolved = resolveGoodsTrashMaps(remoteData.goods || [], remoteData.trash || [])
    const changedGoodsIds = collectChangedGoodsIds(localResolved, remoteResolved, ctx.shouldApplyRemoteItem)
    const changedTrashIds = collectChangedTrashIds(localResolved, remoteResolved, ctx.shouldApplyRemoteItem)
    const changedEventIds = collectChangedEventIds(eventsStore.list || [], Array.isArray(eventData?.events) ? eventData.events : [])
    const [localGoodsTrashMap, remoteGoodsTrashMap, localRechargeMap, remoteRechargeMap, localEventMap, remoteEventMap] = await Promise.all([
      asyncBuildComparableRecordMap([...localResolved.goodsMap.values(), ...localResolved.trashMap.values()]),
      asyncBuildComparableRecordMap([...remoteResolved.goodsMap.values(), ...remoteResolved.trashMap.values()]),
      asyncBuildComparableRecordMap(localRechargeSnapshot),
      asyncBuildComparableRecordMap(Array.isArray(rechargeData?.recharge) ? rechargeData.recharge : []),
      asyncBuildComparableRecordMap(eventsStore.list || []),
      asyncBuildComparableRecordMap(Array.isArray(eventData?.events) ? eventData.events : [])
    ])
    const goodsTrashCompare = countComparableRecordDiff(localGoodsTrashMap, remoteGoodsTrashMap)
    const goodsTrashIncrementalCompare = useIncrementalGoodsPull
      ? countIncrementalComparableDiff(localGoodsTrashMap, remoteGoodsTrashMap)
      : goodsTrashCompare
    const goodsGroupStore = useGoodsGroupStore()
    const localGroupMap = buildTimestampRecordMap(goodsGroupStore.groupList || [])
    const remoteGroupMap = buildTimestampRecordMap(Array.isArray(remoteData?.goodsGroups) ? remoteData.goodsGroups : [])
    const localGroupItemMap = buildTimestampRecordMap(goodsGroupStore.groupItemList || [])
    const remoteGroupItemMap = buildTimestampRecordMap(Array.isArray(remoteData?.goodsGroupItems) ? remoteData.goodsGroupItems : [])
    const groupCompare = useIncrementalGoodsPull
      ? countIncrementalComparableDiff(localGroupMap, remoteGroupMap)
      : countComparableRecordDiff(localGroupMap, remoteGroupMap)
    const groupItemCompare = useIncrementalGoodsPull
      ? countIncrementalComparableDiff(localGroupItemMap, remoteGroupItemMap)
      : countComparableRecordDiff(localGroupItemMap, remoteGroupItemMap)
    const rechargeCompare = !shouldPullRecharge
      ? { remoteTotal: localRechargeMap.size, remoteOnly: 0, localOnly: 0, updated: 0 }
      : (useIncrementalRechargePull
          ? countIncrementalComparableDiff(localRechargeMap, remoteRechargeMap)
          : countComparableRecordDiff(localRechargeMap, remoteRechargeMap))
    const eventCompareBase = countComparableRecordDiff(localEventMap, remoteEventMap)
    const eventCompare = useIncrementalEventPull
      ? countIncrementalComparableDiff(localEventMap, remoteEventMap)
      : eventCompareBase

    const hasDataChangesBeforeImages = (
      goodsTrashIncrementalCompare.remoteOnly > 0 || goodsTrashIncrementalCompare.localOnly > 0 || goodsTrashIncrementalCompare.updated > 0
      || groupCompare.remoteOnly > 0 || groupCompare.localOnly > 0 || groupCompare.updated > 0
      || groupItemCompare.remoteOnly > 0 || groupItemCompare.localOnly > 0 || groupItemCompare.updated > 0
      || rechargeCompare.remoteOnly > 0 || rechargeCompare.localOnly > 0 || rechargeCompare.updated > 0
      || eventCompare.remoteOnly > 0 || eventCompare.localOnly > 0 || eventCompare.updated > 0
    )

    log.debug('pull:compare', {
      goodsTrash: goodsTrashIncrementalCompare,
      groups: groupCompare,
      groupItems: groupItemCompare,
      recharge: rechargeCompare,
      events: eventCompare,
      changedGoods: changedGoodsIds.size,
      changedTrash: changedTrashIds.size,
      changedEvents: changedEventIds.size,
      hasDataChangesBeforeImages
    })

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

    // 图片水合：三个数据集互不依赖，并行执行
    const hydrationPromises = []
    if (shouldHydrateGoodsImages) {
      hydrationPromises.push(
        trackSyncStep(i18n.global.t('sync.step.restoreCollectionImages'), async () => {
          const before = imageStats.restoredImages
          remoteData.goods = await image.hydrateRemoteItemsWithImages(remoteData.goods || [], imageGist, imageStats, { targetItemIds: changedGoodsIds })
          return imageStats.restoredImages - before
        }, { startDetail: i18n.global.t('sync.step.restoreCollectionImages.start'), category: 'image', successDetail: (count) => i18n.global.t('sync.step.restoreCollectionImages.success', { count }) })
      )
    }
    if (shouldHydrateTrashImages) {
      hydrationPromises.push(
        trackSyncStep(i18n.global.t('sync.step.restoreTrashImages'), async () => {
          const before = imageStats.restoredImages
          remoteData.trash = await image.hydrateRemoteItemsWithImages(remoteData.trash || [], imageGist, imageStats, { targetItemIds: changedTrashIds })
          return imageStats.restoredImages - before
        }, { startDetail: i18n.global.t('sync.step.restoreTrashImages.start'), category: 'image', successDetail: (count) => i18n.global.t('sync.step.restoreTrashImages.success', { count }) })
      )
    }
    if (shouldHydrateEventImages && eventData && Array.isArray(eventData.events)) {
      hydrationPromises.push(
        trackSyncStep(i18n.global.t('sync.step.restoreEventImages'), async () => {
          const before = imageStats.restoredImages
          eventData.events = await image.hydrateEventCoversWithImages(eventData.events, imageGist, imageStats, { targetEventIds: changedEventIds })
          return imageStats.restoredImages - before
        }, { startDetail: i18n.global.t('sync.step.restoreEventImages.start'), category: 'image', successDetail: (count) => i18n.global.t('sync.step.restoreEventImages.success', { count }) })
      )
    }
    if (hydrationPromises.length > 0) {
      await Promise.all(hydrationPromises)
    }

    if (remoteData.presets) await presets.replacePresetsSnapshot(remoteData.presets)

    const remoteGoods = [...remoteResolved.goodsMap.values()]
    const remoteTrash = [...remoteResolved.trashMap.values()]

    const goodsToImport = [], goodsToUpdate = []
    const trashIdsToRemove = new Set()
    // Reuse localResolved maps from earlier (data hasn't changed yet)
    const localGoodsMap = localResolved.goodsMap
    const localTrashMap = localResolved.trashMap

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
      await Promise.all([...trashIdsToRemove].map((id) => goodsStore.deleteTrashItem(id)))
    }
    if (goodsToImport.length > 0) {
      await goodsStore.importGoodsBackup(goodsToImport)
      await Promise.all([
        presets.syncCharactersFromGoods(goodsToImport),
        presets.syncStorageLocationsFromPaths(goodsToImport.map((item) => item.storageLocation).filter(Boolean))
      ])
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
    if (hasAnyRemoteData && !useIncrementalGoodsPull) {
      const localOnlyGoodsIds = goodsStore.list
        .filter((item) => !remoteGoodsIds.has(item.id) && !remoteTrashIds.has(item.id))
        .filter((item) => getItemTimestamp(item) <= remoteWatermark)
        .map((item) => item.id)
      const localOnlyTrashIds = goodsStore.trashList
        .filter((item) => !remoteTrashIds.has(item.id) && !remoteGoodsIds.has(item.id))
        .filter((item) => getItemTimestamp(item) <= remoteWatermark)
        .map((item) => item.id)
      if (localOnlyGoodsIds.length > 0) await goodsStore.deleteGoodsPermanently(localOnlyGoodsIds)
      if (localOnlyTrashIds.length > 0) { await Promise.all(localOnlyTrashIds.map((id) => goodsStore.deleteTrashItem(id))) }
    }

    // 充值、活动、分组三个 store 互不依赖，并行写入
    const remoteRecharge = Array.isArray(rechargeData?.recharge) ? rechargeData.recharge : []
    const remoteRechargeLegacy = Array.isArray(remoteData.rechargeRecords) ? remoteData.rechargeRecords : []

    const [rechargeApplyResult, eventApplyResult] = await Promise.all([
      shouldPullRecharge
        ? rechargeStore.importBackup([...remoteRecharge, ...remoteRechargeLegacy], {
            reconcileMissing: !useIncrementalRechargePull,
            preserveLocalNewerThan: remoteWatermark
          })
        : Promise.resolve({ added: 0, updated: 0, removed: 0, skipped: 0, total: localRechargeSnapshot.length }),
      (eventData && Array.isArray(eventData.events))
        ? eventsStore.importEventsBackup(eventData.events, {
            reconcileMissing: !useIncrementalEventPull,
            preserveLocalNewerThan: remoteWatermark
          }).then((result) => ({ ...result, total: eventData.events.length }))
        : Promise.resolve({ added: 0, updated: 0, removed: 0, total: 0 }),
      (goodsGroupStore && Array.isArray(remoteData.goodsGroups) && (remoteData.goodsGroups.length > 0 || (Array.isArray(remoteData.goodsGroupItems) && remoteData.goodsGroupItems.length > 0)))
        ? goodsGroupStore.updateGroupsBackup(remoteData.goodsGroups || [], remoteData.goodsGroupItems || [])
        : Promise.resolve()
    ])

    if (eventApplyResult.total > 0) {
      await ctx.saveEventLastSyncedAt(eventData.updatedAt || remoteManifest?.lastSyncAt || new Date().toISOString())
    }

    log.debug('pull:done', {
      importedGoods: goodsToImport.length,
      updatedGoods: goodsToUpdate.length,
      importedTrash: trashToImport.length,
      updatedTrash: trashToUpdate.length,
      importedRecharge: rechargeApplyResult.added,
      updatedRecharge: rechargeApplyResult.updated,
      importedEvents: eventApplyResult.added,
      updatedEvents: eventApplyResult.updated,
      restoredImages: imageStats.restoredImages
    })

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

  async function pushToRemote(existingGist, existingImageGist, existingRechargeGist, existingEventGist, ctx, uploadPlan = null) {
    const be = ctx.backend || backend
    const shouldWriteData = uploadPlan ? uploadPlan.hasDataDiff !== false : true
    const shouldWriteRecharge = uploadPlan ? uploadPlan.hasRechargeDataDiff !== false : true
    const shouldWriteEvent = uploadPlan ? uploadPlan.hasEventDataDiff !== false : true
    const hasBudgetDiff = uploadPlan?.hasBudgetDiff === true
    const isSupabaseIncrementalUpload = uploadPlan?.incremental === true && typeof be.getImagePublicUrl === 'function'
    let imageGist = existingImageGist || await be.ensureImageGist()

    log.debug('push:start', {
      shouldWriteData,
      shouldWriteRecharge,
      shouldWriteEvent,
      isSupabaseIncrementalUpload: Boolean(isSupabaseIncrementalUpload),
      uploadPlanKeys: uploadPlan ? Object.keys(uploadPlan) : [],
      hasRemoteData: Boolean(uploadPlan?.remoteData),
      hasRemoteRechargeData: Boolean(uploadPlan?.remoteRechargeData),
      hasRemoteEventData: Boolean(uploadPlan?.remoteEventData)
    })

    if (imageGist?.files) {
      const firstFileName = Object.keys(imageGist.files).find(f => f !== 'README.md')
      if (firstFileName) {
        await trackSyncStep(i18n.global.t('sync.step.checkEncryption'), async () => {
          const cloudContent = imageGist.files[firstFileName]?.content || ''
          const cloudIsPlaintext = cloudContent.startsWith('data:image/')
          const cloudIsEncrypted = !cloudIsPlaintext && cloudContent.length > 0
          if (cloudIsEncrypted !== be.isEncryptionEnabled()) {
            imageGist = null
            return i18n.global.t('sync.step.checkEncryption.mismatch', { local: be.isEncryptionEnabled() ? i18n.global.t('sync.step.encryption.encrypted') : i18n.global.t('sync.step.encryption.plaintext'), cloud: cloudIsEncrypted ? i18n.global.t('sync.step.encryption.encrypted') : i18n.global.t('sync.step.encryption.plaintext') })
          }
          return i18n.global.t('sync.step.checkEncryption.match', { state: be.isEncryptionEnabled() ? i18n.global.t('sync.step.encryption.encrypted') : i18n.global.t('sync.step.encryption.plaintext') })
        }, { startDetail: i18n.global.t('sync.step.checkEncryption.start'), category: 'image', successDetail: (msg) => msg })
      }
    }

    // Build goods, recharge and event payloads in parallel where possible
    const [goodsResult, rechargeResult, eventResult] = await Promise.all([
      trackSyncStep(i18n.global.t('sync.step.buildGoodsPayload'),
        () => payload.buildSyncPayload({ existingImageGist: imageGist }),
        { startDetail: i18n.global.t('sync.step.buildGoodsPayload.start'), category: 'local', successDetail: (p) => i18n.global.t('sync.step.buildGoodsPayload.success', { collection: p.syncData.goods.length, trash: p.syncData.trash.length, images: p.imageStats.imageFileCount }) }
      ),
      shouldWriteRecharge
        ? trackSyncStep(i18n.global.t('sync.step.buildRechargePayload'),
            () => payload.buildRechargeSyncData({ incremental: false }),
            { startDetail: i18n.global.t('sync.step.buildRechargePayload.start'), category: 'local', successDetail: (p) => i18n.global.t('sync.step.buildRechargePayload.success', { count: p.recharge.length }) }
          )
        : Promise.resolve({ recharge: [], rechargeTrash: [] }),
      shouldWriteEvent
        ? trackSyncStep(i18n.global.t('sync.step.buildEventPayload'),
            () => payload.buildEventSyncPayload({ existingImageGist: imageGist }),
            { startDetail: i18n.global.t('sync.step.buildEventPayload.start'), category: 'local', successDetail: (p) => i18n.global.t('sync.step.buildEventPayload.success', { count: p.eventData.events.length, images: p.imageStats.imageFileCount }) }
          )
        : Promise.resolve(null)
    ])

    const { syncData, imageStats, imageFiles, referencedImageFiles } = goodsResult
    const rechargeSyncData = rechargeResult
    const eventSyncData = eventResult?.eventData || { events: [] }
    const eventImageStats = eventResult?.imageStats || { imageFileCount: 0 }
    const eventImageFiles = eventResult?.imageFiles || {}
    const eventReferencedImageFiles = eventResult?.referencedImageFiles || []

    const allReferencedImageFiles = new Set([...referencedImageFiles, ...eventReferencedImageFiles])
    const imageCleanupFiles = image.buildImageCleanupFiles(imageGist, allReferencedImageFiles)
    const imageUpdates = { ...imageFiles, ...eventImageFiles, ...imageCleanupFiles }

    if (Object.keys(imageUpdates).length > 0) {
      if (!imageGist) imageGist = await be.ensureImageGist()
      try { await be.writeImages(imageGist.id, imageUpdates) }
      catch (e) { wrapSyncError(e, PHASE_UPLOAD_IMAGES) }
    }

    // Replace gist-image:// URIs in syncData with actual public URLs before writing to database.
    // This ensures the database always has valid URLs, not placeholder gist-image:// references.
    if (be.getImagePublicUrl) {
      for (const item of [...syncData.goods, ...syncData.trash]) {
        if (!Array.isArray(item.images)) continue
        for (const img of item.images) {
          if (img.gistFileName && allReferencedImageFiles.has(img.gistFileName)) {
            img.uri = be.getImagePublicUrl(img.gistFileName)
          }
        }
      }
      for (const event of (eventSyncData?.events || [])) {
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

    const syncTimestamp = new Date().toISOString()
    const mergedImageStats = {
      uploadedImages: (Number(imageStats.uploadedImages) || 0) + (Number(eventImageStats.uploadedImages) || 0),
      reusedImages: (Number(imageStats.reusedImages) || 0) + (Number(eventImageStats.reusedImages) || 0),
      restoredImages: (Number(imageStats.restoredImages) || 0) + (Number(eventImageStats.restoredImages) || 0),
      imageFileCount: allReferencedImageFiles.size,
      imageUpdatedAt: Object.keys(imageUpdates).length > 0 ? syncTimestamp : ''
    }
    // When skipping full payload build (image-only sync), still compute accurate counts from local stores
    const rechargeForCount = shouldWriteRecharge
      ? rechargeSyncData.recharge
      : useRechargeStore().exportBackup({ includeDeleted: false, stripImage: true })
    const eventsForCount = shouldWriteEvent
      ? (eventSyncData.events || [])
      : (useEventsStore().list || [])
    const counts = {
      collectionCount: syncData.goods.filter(g => !g.isWishlist).length,
      wishlistCount: syncData.goods.filter(g => g.isWishlist).length,
      trashCount: syncData.trash.length,
      rechargeCount: rechargeForCount.length,
      eventCount: eventsForCount.length,
      budgetMonthly: normalizeBudgetValue(syncData?.budgetSettings?.monthly),
      budgetYearly: normalizeBudgetValue(syncData?.budgetSettings?.yearly),
      rechargeUpdatedAt: (() => {
        const ts = getLatestRechargeTimestamp(rechargeForCount)
        return ts > 0 ? new Date(ts).toISOString() : ''
      })(),
      eventUpdatedAt: (() => {
        const timestamps = eventsForCount.map((item) => Number(item?.updatedAt) || 0)
        const ts = Math.max(0, ...timestamps)
        return ts > 0 ? new Date(ts).toISOString() : ''
      })()
    }
    const manifest = payload.buildManifest(mergedImageStats, syncTimestamp, counts)

    const dataMap = {}
    const writeOptions = isSupabaseIncrementalUpload ? { incremental: true, deleteIdsByFile: {} } : null

    async function buildRowsDiff(localRows = [], remoteRows = []) {
      const stripMeta = (r) => {
        if (!r || typeof r !== 'object') return r
        const copy = { ...r }
        delete copy.syncedBy
        delete copy.synced_by
        return copy
      }
      function normalizeForDiff(item) {
        if (!item || typeof item !== 'object') return item
        const out = { ...item }
        if (Array.isArray(out.images)) {
          out.images = out.images.map((img) => {
            if (!img || typeof img !== 'object') return { id: img?.id || '', gistFileName: '' }
            const gistFileName = String(img.gistFileName || '').trim() || (typeof img.uri === 'string' && img.uri.startsWith('gist-image://') ? img.uri.slice('gist-image://'.length) : '')
            return { id: String(img.id || '').trim(), gistFileName }
          })
          out.images.sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')))
        }
        if (out.image !== undefined) delete out.image
        if (out.coverImageData && typeof out.coverImageData === 'object') {
          out.coverImageData = { gistFileName: String(out.coverImageData.gistFileName || '').trim() }
        }
        if (out.coverImage !== undefined) delete out.coverImage
        try {
          if (out.isWishlist === undefined || out.isWishlist === null) out.isWishlist = 0
          else if (typeof out.isWishlist === 'string') out.isWishlist = (out.isWishlist === '1' || out.isWishlist.toLowerCase() === 'true') ? 1 : 0
          else out.isWishlist = out.isWishlist ? 1 : 0
          if (out.points === undefined) out.points = null
          if (out.updatedAt !== undefined && out.updatedAt !== null) out.updatedAt = Number(out.updatedAt) || 0
        } catch (e) {
          // ignore
        }
        if (Array.isArray(out.photos)) {
          out.photos = out.photos.map((p) => {
            if (!p || typeof p !== 'object') return { id: p?.id || '', gistFileName: '' }
            const gistFileName = String(p.gistFileName || '').trim() || (typeof p.uri === 'string' && p.uri.startsWith('gist-image://') ? p.uri.slice('gist-image://'.length) : '')
            return { id: String(p.id || '').trim(), gistFileName }
          })
          out.photos.sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')))
        }
        return out
      }

      const normalizedLocal = localRows.map(stripMeta)
      const normalizedRemote = remoteRows.map(stripMeta)
      const [localMap, remoteMap] = await Promise.all([
        asyncBuildComparableRecordMap(normalizedLocal.map(normalizeForDiff)),
        asyncBuildComparableRecordMap(normalizedRemote.map(normalizeForDiff))
      ])
      return localRows.filter((item) => {
        const id = String(item?.id || '').trim()
        if (!id) return false
        return localMap.get(id) !== remoteMap.get(id)
      })
    }

    function buildDeleteIds(localRows = [], remoteRows = []) {
      const localIdSet = new Set(localRows.map((item) => String(item?.id || '').trim()).filter(Boolean))
      const remoteIdSet = new Set(remoteRows.map((item) => String(item?.id || '').trim()).filter(Boolean))
      return [...remoteIdSet].filter((id) => !localIdSet.has(id))
    }

    if (shouldWriteData && isSupabaseIncrementalUpload && uploadPlan?.remoteData) {
      const localGoodsRows = syncData.goods || []
      const localTrashRows = syncData.trash || []
      const localGroupRows = syncData.goodsGroups || []
      const localGroupItemRows = syncData.goodsGroupItems || []
      const remoteGoodsRows = uploadPlan.remoteData.goods || []
      const remoteTrashRows = uploadPlan.remoteData.trash || []
      const remoteGroupRows = uploadPlan.remoteData.goodsGroups || []
      const remoteGroupItemRows = uploadPlan.remoteData.goodsGroupItems || []
      const [goodsDiffRows, trashDiffRows, groupDiffRows, groupItemDiffRows] = await Promise.all([
        buildRowsDiff(localGoodsRows, remoteGoodsRows),
        buildRowsDiff(localTrashRows, remoteTrashRows),
        buildRowsDiff(localGroupRows, remoteGroupRows),
        buildRowsDiff(localGroupItemRows, remoteGroupItemRows)
      ])

      dataMap[DATA_FILENAME] = {
        content: {
          ...syncData,
          goods: goodsDiffRows,
          trash: trashDiffRows,
          goodsGroups: groupDiffRows,
          goodsGroupItems: groupItemDiffRows
        }
      }
      writeOptions.deleteIdsByFile[DATA_FILENAME] = buildDeleteIds(
        [...localGoodsRows, ...localTrashRows],
        [...remoteGoodsRows, ...remoteTrashRows]
      )
      writeOptions.deleteIdsByFile.goodsGroups = buildDeleteIds(localGroupRows, remoteGroupRows)
      writeOptions.deleteIdsByFile.goodsGroupItems = buildDeleteIds(localGroupItemRows, remoteGroupItemRows)
    } else if (shouldWriteData) {
      dataMap[DATA_FILENAME] = { content: syncData }
    }

    if (shouldWriteRecharge) {
      if (isSupabaseIncrementalUpload && uploadPlan?.remoteRechargeData) {
        const rechargeRows = await buildRowsDiff(rechargeSyncData.recharge || [], uploadPlan.remoteRechargeData.recharge || [])
        dataMap[RECHARGE_DATA_FILENAME] = {
          content: {
            ...rechargeSyncData,
            recharge: rechargeRows,
            rechargeTrash: []
          }
        }
        writeOptions.deleteIdsByFile[RECHARGE_DATA_FILENAME] = buildDeleteIds(rechargeSyncData.recharge || [], uploadPlan.remoteRechargeData.recharge || [])
      } else {
        dataMap[RECHARGE_DATA_FILENAME] = { content: rechargeSyncData }
      }
    }

    if (shouldWriteEvent) {
      if (isSupabaseIncrementalUpload && uploadPlan?.remoteEventData) {
        const eventRows = await buildRowsDiff(eventSyncData.events || [], uploadPlan.remoteEventData.events || [])
        dataMap[EVENT_DATA_FILENAME] = {
          content: {
            ...eventSyncData,
            events: eventRows
          }
        }
        writeOptions.deleteIdsByFile[EVENT_DATA_FILENAME] = buildDeleteIds(eventSyncData.events || [], uploadPlan.remoteEventData.events || [])
      } else {
        dataMap[EVENT_DATA_FILENAME] = { content: eventSyncData }
      }
    }

    if (Object.keys(imageUpdates).length > 0 || Object.keys(dataMap).length > 0 || hasBudgetDiff) {
      dataMap[MANIFEST_FILENAME] = { content: manifest }
    }

    if (Object.keys(dataMap).length > 0) {
      try {
        // Log what will be written: filenames and approximate item counts
        const debugFiles = Object.keys(dataMap).reduce((acc, fn) => {
          const content = dataMap[fn]?.content
          if (!content) return acc
          if (Array.isArray(content.goods) || Array.isArray(content.trash)) {
            acc[fn] = { goods: (content.goods || []).length, trash: (content.trash || []).length }
          } else if (Array.isArray(content.recharge) || Array.isArray(content.events)) {
            acc[fn] = { recharge: (content.recharge || []).length, events: (content.events || []).length }
          } else {
            acc[fn] = { keys: Object.keys(content).length }
          }
          return acc
        }, {})
        const writeOptionsSummary = writeOptions
          ? {
              incremental: Boolean(writeOptions.incremental),
              deleteIdsByFile: Object.fromEntries(
                Object.entries(writeOptions.deleteIdsByFile || {}).map(([fileName, ids]) => [
                  fileName,
                  Array.isArray(ids) ? ids.length : 0
                ])
              )
            }
          : null
        log.debug('push:write-data-summary', { files: debugFiles, writeOptions: writeOptionsSummary })
      } catch (e) {
        // ignore
      }
      try {
        await trackSyncStep(i18n.global.t('sync.step.pushData'), () =>
          be.writeData(existingGist?.id || be.getDataGistId(), dataMap, writeOptions || undefined),
          { startDetail: i18n.global.t('sync.step.pushData.start'), category: 'sync', successDetail: () => i18n.global.t('sync.step.pushData.success') }
        )
      } catch (e) { wrapSyncError(e, PHASE_WRITE_DATA) }
    }

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
          if (be.getImagePublicUrl) {
            entry.uri = be.getImagePublicUrl(entry.gistFileName)
          }
          imageMap.set(i, entry)
        }
      }
      if (imageMap.size > 0) preparedImagesByItemId.set(item.id, imageMap)
    }
    await goodsStore.markImagesAsRemote(preparedImagesByItemId)

    if (be.getImagePublicUrl) {
      const eventsStore = useEventsStore()
      const preparedMediaByEventId = new Map()
      for (const event of (eventSyncData?.events || [])) {
        const eventId = String(event?.id || '').trim()
        if (!eventId) continue

        const coverFileName = String(event?.coverImageData?.gistFileName || '').trim()
        const hasCover = !!coverFileName
        const hasPhotos = Array.isArray(event?.photos) && event.photos.some((photo) => String(photo?.gistFileName || '').trim())
        if (!hasCover && !hasPhotos) continue

        preparedMediaByEventId.set(eventId, {
          coverImage: event.coverImage,
          coverImageData: event.coverImageData ? { ...event.coverImageData } : null,
          photos: Array.isArray(event.photos) ? event.photos.map((photo) => ({ ...photo })) : []
        })
      }
      await eventsStore.markMediaAsRemote(preparedMediaByEventId)
    }

    await ctx.saveLastSyncedAt(manifest.lastSyncAt)
    await ctx.saveEventLastSyncedAt(eventSyncData.updatedAt || manifest.lastSyncAt)

    const dataGistId = be.getDataGistId()
    if (ctx.rechargeGistId && ctx.rechargeGistId !== dataGistId) await ctx.saveRechargeGistId('')
    if (ctx.eventGistId && ctx.eventGistId !== dataGistId) await ctx.saveEventGistId('')

    return { ...mergedImageStats }
  }

  // ── Public: fullSync ──

  async function fullSync(ctx, options = {}) {
    const be = ctx.backend || backend
    await ctx.ensureEventsStoreReady()

    // ── Dirty domain optimization ──
    // When called from auto-push, we know which domains changed locally.
    // Skip reading remote data and building payloads for clean domains.
    const dirty = options.dirtyDomains
    const isRechargeDirty = !dirty || dirty.has('recharge')
    const isEventsDirty = !dirty || dirty.has('events')
    const isGoodsDirty = !dirty || dirty.has('goods') || dirty.has('presets') || dirty.has('group')
    const isBudgetDirty = !dirty || dirty.has('budget')

    log.debug('fullSync:start', {
      dirtyDomains: dirty ? [...dirty] : 'all',
      isGoodsDirty, isRechargeDirty, isEventsDirty
    })

    let gist
    try {
      gist = await be.ensureDataGist({
        buildSyncPayload: payload.buildSyncPayload,
        buildRechargeSyncData: payload.buildRechargeSyncData,
        buildEventSyncPayload: payload.buildEventSyncPayload,
        buildManifest: payload.buildManifest
      })
    } catch (e) { wrapSyncError(e, PHASE_ENSURE_GIST) }

    let remoteManifest
    try {
      remoteManifest = await readJson(be, {
        title: i18n.global.t('sync.step.readManifest'), gist, fileName: MANIFEST_FILENAME,
        startDetail: i18n.global.t('sync.step.readManifest.detail'), category: 'pull',
        successDetail: (parsed) => parsed ? i18n.global.t('sync.step.readManifest.success.hasId', { id: parsed.imageGistId || i18n.global.t('sync.notConfigured') }) : i18n.global.t('sync.step.readManifest.success.missing')
      })
    } catch (e) { wrapSyncError(e, PHASE_READ_MANIFEST) }
    if (remoteManifest?.imageGistId) await ctx.saveImageGistId(remoteManifest.imageGistId)

    const [existingRechargeGist, existingEventGist, existingImageGist] = await Promise.all([
      be.getExistingRechargeGist(),
      be.getExistingEventGist(),
      be.getExistingImageGist(remoteManifest)
    ])

    // Only read remote data for dirty domains — skip clean domains to save I/O
    let remoteData, remoteRechargeData, remoteEventData
    try {
      const remoteReads = []
      if (isGoodsDirty) {
        remoteReads.push(
          readJson(be, {
            title: i18n.global.t('sync.step.readData'), gist, fileName: DATA_FILENAME,
            startDetail: i18n.global.t('sync.step.readData.start'), category: 'pull', required: true, missingMessage: i18n.global.t('sync.step.readData.empty'),
            successDetail: (parsed) => {
              if (!parsed) return i18n.global.t('sync.step.readData.notFound')
              const counts = countWishlistSplit(Array.isArray(parsed.goods) ? parsed.goods : [])
              return i18n.global.t('sync.step.readData.success', { collection: counts.collection, wishlist: counts.wishlist, trash: (parsed.trash || []).length })
            }
          })
        )
      }
      if (isRechargeDirty) {
        remoteReads.push(
          readJson(be, {
            title: i18n.global.t('sync.step.readRecharge'), gist, fileName: RECHARGE_DATA_FILENAME,
            startDetail: i18n.global.t('sync.step.readRecharge.start'), category: 'pull', fallbackGist: existingRechargeGist, fallbackFileName: RECHARGE_DATA_FILENAME,
            successDetail: (parsed, source) => parsed ? i18n.global.t('sync.step.readRecharge.success', { source, count: (parsed.recharge || []).length }) : i18n.global.t('sync.step.readRecharge.notFound')
          })
        )
      }
      if (isEventsDirty) {
        remoteReads.push(
          readJson(be, {
            title: i18n.global.t('sync.step.readEvents'), gist, fileName: EVENT_DATA_FILENAME,
            startDetail: i18n.global.t('sync.step.readEvents.start'), category: 'pull', fallbackGist: existingEventGist, fallbackFileName: EVENT_DATA_FILENAME,
            successDetail: (parsed, source) => parsed ? i18n.global.t('sync.step.readEvents.success', { source, count: (parsed.events || []).length }) : i18n.global.t('sync.step.readEvents.notFound')
          })
        )
      }

      const results = await Promise.all(remoteReads)
      let resultIdx = 0
      if (isGoodsDirty) {
        remoteData = results[resultIdx++] || { goods: [], trash: [], presets: {} }
      }
      if (isRechargeDirty) {
        remoteRechargeData = results[resultIdx++] || { recharge: [], rechargeTrash: [] }
      }
      if (isEventsDirty) {
        remoteEventData = results[resultIdx++] || { events: [] }
      }
    } catch (e) { wrapSyncError(e, PHASE_READ_REMOTE) }

    remoteData = remoteData || { goods: [], trash: [], presets: {} }
    remoteRechargeData = remoteRechargeData || { recharge: [], rechargeTrash: [] }
    remoteEventData = remoteEventData || { events: [] }

    const remoteTime = remoteManifest?.lastSyncAt ? new Date(remoteManifest.lastSyncAt).getTime() : 0
    const localSyncTime = ctx.lastSyncedAt ? new Date(ctx.lastSyncedAt).getTime() : 0
    const isRemoteFromOtherDevice = !!(remoteManifest?.deviceId && remoteManifest.deviceId !== ctx.deviceId)
    const localChanges = conflict.getLocalChangesSince(localSyncTime)

    const goodsStore = useGoodsStore()
    const rechargeStore = useRechargeStore()
    const localRechargeData = rechargeStore.exportBackup({ includeDeleted: false, stripImage: true })
    const localEventData = payload.buildEventSyncData()

    // Build all comparable states — parallelize the async presets/budget reads
    const resolvedBudgetSettings = {
      monthly: remoteManifest?.budgetMonthly ?? remoteData?.budgetSettings?.monthly,
      yearly: remoteManifest?.budgetYearly ?? remoteData?.budgetSettings?.yearly
    }
    const [presetsData, localBudgetSettings] = await Promise.all([
      isGoodsDirty ? ctx.buildPresetsData() : Promise.resolve(null),
      (isGoodsDirty || isBudgetDirty) ? readBudgetSettings() : Promise.resolve(null)
    ])

    const [
      localComparableState,
      remoteComparableState,
      localRechargeComparableState,
      remoteRechargeComparableState,
      localEventComparableState,
      remoteEventComparableState
    ] = await Promise.all([
      isGoodsDirty
        ? (() => {
            const goodsGroupStore = useGoodsGroupStore()
            return payload.buildComparableSyncStateFromData(
              { goods: goodsStore.list, trash: goodsStore.trashList, presets: presetsData, goodsGroups: goodsGroupStore.groupList, goodsGroupItems: goodsGroupStore.groupItemList },
              { budgetSettings: localBudgetSettings }
            )
          })()
        : Promise.resolve(null),
      isGoodsDirty
        ? payload.buildComparableSyncStateFromData(remoteData, {
            budgetSettings: resolvedBudgetSettings
          })
        : Promise.resolve(null),
      isRechargeDirty
        ? payload.buildComparableRechargeStateFromData(localRechargeData)
        : Promise.resolve(null),
      isRechargeDirty
        ? payload.buildComparableRechargeStateFromData(remoteRechargeData)
        : Promise.resolve(null),
      isEventsDirty
        ? payload.buildComparableEventStateFromData(localEventData)
        : Promise.resolve(null),
      isEventsDirty
        ? payload.buildComparableEventStateFromData(remoteEventData)
        : Promise.resolve(null)
    ])

    const hasDataDiff = isGoodsDirty ? (localComparableState !== remoteComparableState) : false
    // Clean domains (not dirty, no remote read): always no diff — no local changes to push,
    // and we skipped the remote read so nothing to pull either.
    const hasRechargeDataDiff = isRechargeDirty ? (localRechargeComparableState !== remoteRechargeComparableState) : false
    const hasEventDataDiff = isEventsDirty ? (localEventComparableState !== remoteEventComparableState) : false
    // Budget is stored in manifest (budgetMonthly/budgetYearly) — no remote data read needed.
    const hasBudgetDiff = isBudgetDirty && localBudgetSettings && (
      normalizeBudgetValue(localBudgetSettings.monthly) !== normalizeBudgetValue(resolvedBudgetSettings.monthly) ||
      normalizeBudgetValue(localBudgetSettings.yearly) !== normalizeBudgetValue(resolvedBudgetSettings.yearly)
    )
    const hasEffectiveDiff = hasDataDiff || hasRechargeDataDiff || hasEventDataDiff || hasBudgetDiff

    log.debug('fullSync:compare', { hasDataDiff, hasRechargeDataDiff, hasEventDataDiff, hasBudgetDiff, isRechargeDirty, isEventsDirty, isBudgetDirty })

    if (!hasEffectiveDiff) {
      if (remoteManifest?.lastSyncAt) await ctx.saveLastSyncedAt(remoteManifest.lastSyncAt)
      if (remoteEventData?.updatedAt || remoteManifest?.lastSyncAt) {
        await ctx.saveEventLastSyncedAt(remoteEventData?.updatedAt || remoteManifest.lastSyncAt)
      }
      return { action: 'no_changes', ...conflict.getLocalChangesSince(remoteTime || localSyncTime) }
    }

    const localPayload = await trackSyncStep(i18n.global.t('sync.step.buildLocalGoodsPayload'), () => payload.buildSyncPayload({ existingImageGist }), {
      startDetail: i18n.global.t('sync.step.buildLocalGoodsPayload.start'), category: 'local',
      successDetail: (p) => i18n.global.t('sync.step.buildLocalGoodsPayload.success', { collection: p.syncData.goods.length, trash: p.syncData.trash.length, images: p.imageStats.imageFileCount })
    })
    // Delay building event payload until necessary (events payload is heavy due to images)
    let localEventPayload = null
    let allReferencedImageFiles = new Set([...localPayload.referencedImageFiles])
    let pendingAllImageCleanup = image.buildImageCleanupFiles(existingImageGist, allReferencedImageFiles)
    let hasPendingImageChanges = (
      Object.keys(localPayload.imageFiles).length > 0
      || Object.keys(pendingAllImageCleanup).length > 0
    )

      if (!hasDataDiff && !hasRechargeDataDiff && !hasEventDataDiff && hasPendingImageChanges) {
      let imageStats
      try {
        imageStats = await pushToRemote(gist, existingImageGist, existingRechargeGist, existingEventGist, ctx, {
          hasDataDiff: false,
          hasRechargeDataDiff: false,
          hasEventDataDiff: false,
          hasPendingImageChanges: true,
          incremental: typeof be.getImagePublicUrl === 'function',
          remoteData,
          remoteRechargeData,
          remoteEventData
        })
      }
      catch (e) { wrapSyncError(e, PHASE_PUSH) }
      return { action: 'pushed', ...conflict.getLocalChangesSince(remoteTime || localSyncTime), ...imageStats }
    }

    // If we reach here and event data diff or images might involve events, build event payload lazily
    // Build when there is an event data diff OR when there are pending image changes to process
    if (!localEventPayload && (hasEventDataDiff || hasPendingImageChanges)) {
      localEventPayload = await trackSyncStep(i18n.global.t('sync.step.buildLocalEventPayload'), () => payload.buildEventSyncPayload({ existingImageGist }), {
        startDetail: i18n.global.t('sync.step.buildLocalEventPayload.start'), category: 'local',
        successDetail: (p) => i18n.global.t('sync.step.buildLocalEventPayload.success', { count: p.eventData.events.length, images: p.imageStats.imageFileCount })
      })
      // merge referenced images and recompute cleanup/pending flags
      for (const f of (localEventPayload.referencedImageFiles || [])) allReferencedImageFiles.add(f)
      pendingAllImageCleanup = image.buildImageCleanupFiles(existingImageGist, allReferencedImageFiles)
      hasPendingImageChanges = (
        Object.keys(localPayload.imageFiles).length > 0
        || Object.keys(localEventPayload.imageFiles || {}).length > 0
        || Object.keys(pendingAllImageCleanup).length > 0
      )
    }

    if (remoteTime > localSyncTime || !remoteManifest) {
      // No manifest on remote = first sync, push local data instead of pulling empty remote
      if (!remoteManifest) {
        let imageStats
        try { imageStats = await pushToRemote(gist, existingImageGist, existingRechargeGist, existingEventGist, ctx) }
        catch (e) { wrapSyncError(e, PHASE_PUSH) }
        return { action: 'pushed', statusMessage: 'sync.firstSupabaseUpload', ...conflict.getLocalChangesSince(localSyncTime), ...imageStats }
      }
      if (localChanges.hasChanges) {
        return {
          action: 'conflict', statusMessage: 'sync.conflictDetected',
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
          pullRecharge: hasRechargeDataDiff,
          incrementalGoods: true,
          incrementalEvents: true,
          incrementalRecharge: true,
          cachedRemoteData: remoteData
        }, ctx)
      } catch (e) { wrapSyncError(e, PHASE_PULL) }
      await ctx.saveLastSyncedAt(remoteManifest.lastSyncAt)
      return { action: 'pulled', ...result }
    }

    let imageStats
    try {
      imageStats = await pushToRemote(gist, existingImageGist, existingRechargeGist, existingEventGist, ctx, {
        hasDataDiff,
        hasRechargeDataDiff,
        hasEventDataDiff,
        hasBudgetDiff,
        hasPendingImageChanges,
        incremental: typeof be.getImagePublicUrl === 'function',
        remoteData,
        remoteRechargeData,
        remoteEventData
      })
    }
    catch (e) { wrapSyncError(e, PHASE_PUSH) }
    return { action: 'pushed', ...conflict.getLocalChangesSince(remoteTime || localSyncTime), ...imageStats }
  }

  // ── Public: pullOnly ──

  async function pullOnly(ctx, { silent = false, forceRecharge = false, sourceTable = 'manual' } = {}) {
    const be = ctx.backend || backend
    await ctx.ensureEventsStoreReady()
    let gist, existingRechargeGist, existingEventGist
    try {
      [gist, existingRechargeGist, existingEventGist] = await Promise.all([
        be.getDataGist(),
        be.getExistingRechargeGist(),
        be.getExistingEventGist()
      ])
    } catch (e) { wrapSyncError(e, PHASE_ENSURE_GIST) }
    if (!gist) throw new Error(i18n.global.t('sync.error.remoteDataEmpty'))
    const isSupabaseBackend = typeof be.getImagePublicUrl === 'function'

    let remoteManifest, remoteRechargeData, remoteEventData
    try {
      remoteManifest = await readJson(be, { title: i18n.global.t('sync.step.readManifest'), gist, fileName: MANIFEST_FILENAME, startDetail: i18n.global.t('sync.step.readManifest.detail'), category: 'pull',
        successDetail: (parsed) => parsed ? i18n.global.t('sync.step.readManifest.success.hasId', { id: parsed.imageGistId || i18n.global.t('sync.notConfigured') }) : i18n.global.t('sync.step.readManifest.success.missing') })

      const rechargeStore = useRechargeStore()
      const localRechargeSnapshot = rechargeStore.exportBackup({ includeDeleted: false, stripImage: true })
      const shouldReadRechargePrecheck = forceRecharge || isSupabaseBackend || shouldPullRechargeByManifest(remoteManifest, localRechargeSnapshot)
      // If pull was triggered by realtime for a specific table, avoid reading unrelated heavy files
      const triggeredByRealtime = typeof sourceTable === 'string' && sourceTable !== 'manual'

      ;[remoteRechargeData, remoteEventData] = await Promise.all([
        (shouldReadRechargePrecheck && (!triggeredByRealtime || sourceTable === 'recharge_records'))
          ? readJson(be, { title: i18n.global.t('sync.step.readRecharge'), gist, fileName: RECHARGE_DATA_FILENAME, startDetail: i18n.global.t('sync.step.readRecharge.start'), category: 'pull',
              fallbackGist: existingRechargeGist, fallbackFileName: RECHARGE_DATA_FILENAME,
              successDetail: (parsed, source) => parsed ? i18n.global.t('sync.step.readRecharge.success', { source, count: (parsed.recharge || []).length }) : i18n.global.t('sync.step.readRecharge.notFound')
            }).then((result) => result || { recharge: [], rechargeTrash: [] })
          : Promise.resolve({ recharge: localRechargeSnapshot, rechargeTrash: [] }),
        (!triggeredByRealtime || sourceTable === 'events')
        ? readJson(be, { title: i18n.global.t('sync.step.readEvents'), gist, fileName: EVENT_DATA_FILENAME, startDetail: i18n.global.t('sync.step.readEvents.start'), category: 'pull',
          fallbackGist: existingEventGist, fallbackFileName: EVENT_DATA_FILENAME,
          successDetail: (parsed, source) => parsed ? i18n.global.t('sync.step.readEvents.success', { source, count: (parsed.events || []).length }) : i18n.global.t('sync.step.readEvents.notFound')
        }).then((result) => result || { events: [] })
        : Promise.resolve({ events: [] })
      ])
    } catch (e) { wrapSyncError(e, PHASE_READ_REMOTE) }

    if (remoteManifest?.imageGistId) await ctx.saveImageGistId(remoteManifest.imageGistId)

    const localSyncTime = ctx.lastSyncedAt ? new Date(ctx.lastSyncedAt).getTime() : 0
    const [
      localEventState,
      remoteEventState,
      localRechargeState,
      remoteRechargeState
    ] = await Promise.all([
      payload.buildComparableEventStateFromData(payload.buildEventSyncData()),
      payload.buildComparableEventStateFromData(remoteEventData),
      payload.buildComparableRechargeStateFromData(payload.buildRechargeSyncData({ incremental: false })),
      payload.buildComparableRechargeStateFromData(remoteRechargeData)
    ])
    const hasEventContentDiff = localEventState !== remoteEventState
    const hasRechargeContentDiff = localRechargeState !== remoteRechargeState
    const localChanges = conflict.getLocalChangesSince(localSyncTime)

    // No manifest on remote = nothing to pull, don't delete local data
    if (!remoteManifest) {
      return { action: 'no_changes', statusMessage: 'sync.noRemoteDataSkipPull' }
    }

    // Silent 模式（Realtime/visibilitychange 触发）：跳过冲突弹窗，直接拉取
    if (silent) {
      const diff = await conflict.buildPullConflictData(gist, remoteManifest, { forceRecharge, sourceTable })
      const hasAnyDiff = !!(
        diff.remoteOnlyGoods > 0 || diff.updatedGoods > 0 || diff.localOnlyGoods > 0
        || diff.remoteOnlyRecharge > 0 || diff.updatedRecharge > 0
        || diff.remoteOnlyEvents > 0 || diff.updatedEvents > 0
        || diff.hasBudgetDiff
        || diff.remoteOnlyGroups > 0 || diff.updatedGroups > 0 || diff.localOnlyGroups > 0
        || diff.remoteOnlyGroupItems > 0 || diff.updatedGroupItems > 0 || diff.localOnlyGroupItems > 0
      )
      if (!hasAnyDiff) {
        if (remoteManifest.lastSyncAt) await ctx.saveLastSyncedAt(remoteManifest.lastSyncAt)
        return { action: 'no_changes' }
      }
      let result
      try {
        result = await pullFromRemote(gist, remoteManifest, existingRechargeGist, existingEventGist, {
          hydrateGoodsImages: true,
          hydrateTrashImages: true,
          hydrateEventImages: true,
          pullRecharge: hasRechargeContentDiff,
          incrementalGoods: true,
          incrementalEvents: true,
          incrementalRecharge: true,
          cachedRemoteData: diff.remoteData
        }, ctx)
      } catch (e) { wrapSyncError(e, PHASE_PULL) }
      await ctx.saveLastSyncedAt(remoteManifest.lastSyncAt)
      return { action: 'pulled', statusMessage: 'sync.syncComplete', ...result }
    }

    if (localChanges.hasChanges) {
      const diff = await conflict.buildPullConflictData(gist, remoteManifest, { sourceTable })
      const hasPullConflict = !!(
        diff.remoteOnlyGoods > 0 || diff.remoteOnlyCollection > 0 || diff.remoteOnlyWishlist > 0 || diff.remoteOnlyTrash > 0
        || diff.updatedGoods > 0 || diff.localOnlyGoods > 0 || diff.localOnlyCollection > 0 || diff.localOnlyWishlist > 0 || diff.localOnlyTrash > 0
        || hasRechargeContentDiff || hasEventContentDiff || diff.hasBudgetDiff
        || diff.remoteOnlyGroups > 0 || diff.updatedGroups > 0 || diff.localOnlyGroups > 0
        || diff.remoteOnlyGroupItems > 0 || diff.updatedGroupItems > 0 || diff.localOnlyGroupItems > 0
      )
      if (!hasPullConflict) {
        if (remoteManifest.lastSyncAt) await ctx.saveLastSyncedAt(remoteManifest.lastSyncAt)
        return { action: 'no_changes' }
      }
      return {
        action: 'conflict', statusMessage: 'sync.remoteDataDetected',
        conflictData: { ...diff, rechargeGist: existingRechargeGist, eventGist: existingEventGist, isPullOnly: true }
      }
    }

    const diff = await conflict.buildPullConflictData(gist, remoteManifest, { sourceTable })
    const pullGoodsContentDiff = !!(
      diff.remoteOnlyGoods > 0 || diff.remoteOnlyCollection > 0 || diff.remoteOnlyWishlist > 0 || diff.remoteOnlyTrash > 0
      || diff.updatedGoods > 0 || diff.localOnlyGoods > 0 || diff.localOnlyCollection > 0 || diff.localOnlyWishlist > 0 || diff.localOnlyTrash > 0
    )
    const pullRechargeContentDiff = hasRechargeContentDiff
    const pullEventContentDiff = hasEventContentDiff
    const pullBudgetContentDiff = diff.hasBudgetDiff
    const pullGroupContentDiff = !!(
      diff.remoteOnlyGroups > 0 || diff.updatedGroups > 0 || diff.localOnlyGroups > 0
      || diff.remoteOnlyGroupItems > 0 || diff.updatedGroupItems > 0 || diff.localOnlyGroupItems > 0
    )

    if (!pullGoodsContentDiff && !pullRechargeContentDiff && !pullEventContentDiff && !pullBudgetContentDiff && !pullGroupContentDiff) {
      if (remoteManifest.lastSyncAt) await ctx.saveLastSyncedAt(remoteManifest.lastSyncAt)
      return { action: 'no_changes' }
    }

    let result
    try {
      result = await pullFromRemote(gist, remoteManifest, existingRechargeGist, existingEventGist, {
        hydrateGoodsImages: pullGoodsContentDiff,
        hydrateTrashImages: pullGoodsContentDiff,
        hydrateEventImages: pullEventContentDiff,
        pullRecharge: pullRechargeContentDiff,
        incrementalGoods: true,
        incrementalEvents: true,
        incrementalRecharge: true,
        cachedRemoteData: diff.remoteData
      }, ctx)
    } catch (e) { wrapSyncError(e, PHASE_PULL) }
    await ctx.saveLastSyncedAt(remoteManifest.lastSyncAt)
    return { action: 'pulled', ...result }
  }

  // ── Public: resolveConflict ──

  async function resolveConflict(ctx, useRemote) {
    const be = ctx.backend || backend
    if (useRemote) {
      let remoteManifest
      try {
        remoteManifest = await readJson(be, {
          title: i18n.global.t('sync.step.readManifest'), gist: ctx.conflictData.gist, fileName: MANIFEST_FILENAME,
          startDetail: i18n.global.t('sync.step.readConflictManifest'), category: 'pull',
          successDetail: (parsed) => parsed ? i18n.global.t('sync.step.readManifest.success.hasId', { id: parsed.imageGistId || i18n.global.t('sync.notConfigured') }) : i18n.global.t('sync.step.readManifest.success.missing')
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
      return { action: 'pulled', ...result }
    }

    let imageStats
    try { imageStats = await pushToRemote(ctx.conflictData.gist, null, ctx.conflictData.rechargeGist || null, ctx.conflictData.eventGist || null, ctx) }
    catch (e) { wrapSyncError(e, PHASE_PUSH) }
    return { action: 'pushed', ...imageStats }
  }

  // ── Public: resolvePullConflict ──

  async function resolvePullConflict(ctx, confirm) {
    const be = ctx.backend || backend
    if (!confirm) return { action: 'cancelled', statusMessage: 'sync.pullCancelled' }

    let remoteManifest
    try { remoteManifest = await be.getManifest(ctx.conflictData.gist) }
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
    return { action: 'pulled', ...result }
  }

  return { fullSync, pullOnly, resolveConflict, resolvePullConflict }
}
