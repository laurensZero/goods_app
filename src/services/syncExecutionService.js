import { buildComparableRecordMap, buildImageSyncStats, countComparableRecordDiff, countWishlistSplit, getItemTimestamp, resolveGoodsTrashMaps } from '@/utils/syncShared'
import { parseGistImageUri } from '@/utils/goodsImages'

export function createSyncExecutionService({
  tokenRef,
  gistIdRef,
  rechargeGistIdRef,
  eventGistIdRef,
  ensureImageGist,
  resolveRemoteImageGist,
  hydrateRemoteItemsWithImages,
  hydrateEventCoversWithImages,
  buildImageCleanupFiles,
  buildSyncPayload,
  buildRechargeSyncData,
  buildEventSyncPayload,
  buildManifest,
  readJsonFromGistWithTrace,
  trackSyncStep,
  getGist,
  updateGist,
  lastSyncedAtRef,
  getExistingRechargeGist,
  getExistingEventGist,
  saveLastSyncedAt,
  saveEventLastSyncedAt,
  saveRechargeGistId,
  saveEventGistId,
  useGoodsStore,
  useRechargeStore,
  useEventsStore,
  usePresetsStore,
  shouldApplyRemoteItem,
  deleteItems,
  constants
}) {
  const {
    DATA_FILENAME,
    RECHARGE_DATA_FILENAME,
    EVENT_DATA_FILENAME,
    MANIFEST_FILENAME
  } = constants

  function resolveCoverGistFileName(event) {
    return String(event?.coverImageData?.gistFileName || parseGistImageUri(event?.coverImage) || '').trim()
  }

  function collectChangedGoodsIds(localResolved, remoteResolved) {
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

  function collectChangedTrashIds(localResolved, remoteResolved) {
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
  async function pullFromRemote(gist, remoteManifest = null, rechargeGist = null, eventGist = null, options = {}) {
    const shouldHydrateGoodsImages = options.hydrateGoodsImages !== false
    const shouldHydrateTrashImages = options.hydrateTrashImages !== false
    const shouldHydrateEventImages = options.hydrateEventImages !== false

    const remoteData = await readJsonFromGistWithTrace({
      title: '读取 data.json',
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
    const rechargeData = await readJsonFromGistWithTrace({
      title: '正式拉取 recharge-data.json',
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
    const eventData = await readJsonFromGistWithTrace({
      title: '正式拉取 events-data.json',
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

    const goodsStore = useGoodsStore()
    const rechargeStore = useRechargeStore()
    const presets = usePresetsStore()
    const eventsStore = useEventsStore()

    const localSyncTime = lastSyncedAtRef?.value ? new Date(lastSyncedAtRef.value).getTime() : 0
    const localResolved = resolveGoodsTrashMaps(goodsStore.list, goodsStore.trashList)
    const remoteResolved = resolveGoodsTrashMaps(remoteData.goods || [], remoteData.trash || [])
    const changedGoodsIds = collectChangedGoodsIds(localResolved, remoteResolved)
    const changedTrashIds = collectChangedTrashIds(localResolved, remoteResolved)
    const changedEventIds = collectChangedEventIds(eventsStore.list || [], Array.isArray(eventData?.events) ? eventData.events : [])
    const goodsTrashCompare = countComparableRecordDiff(
      buildComparableRecordMap([
        ...localResolved.goodsMap.values(),
        ...localResolved.trashMap.values()
      ]),
      buildComparableRecordMap([
        ...remoteResolved.goodsMap.values(),
        ...remoteResolved.trashMap.values()
      ])
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
      goodsTrashCompare.remoteOnly > 0
      || goodsTrashCompare.localOnly > 0
      || goodsTrashCompare.updated > 0
      || rechargeCompare.remoteOnly > 0
      || rechargeCompare.localOnly > 0
      || rechargeCompare.updated > 0
      || eventCompare.remoteOnly > 0
      || eventCompare.localOnly > 0
      || eventCompare.updated > 0
    )

    if (!hasDataChangesBeforeImages) {
      if (remoteManifest?.lastSyncAt) {
        await saveLastSyncedAt(remoteManifest.lastSyncAt)
      }
      if (eventData?.updatedAt || remoteManifest?.lastSyncAt) {
        await saveEventLastSyncedAt(eventData?.updatedAt || remoteManifest.lastSyncAt)
      }

      return {
        importedGoods: 0,
        updatedGoods: 0,
        importedTrash: 0,
        updatedTrash: 0,
        importedRecharge: 0,
        updatedRecharge: 0,
        importedEvents: 0,
        updatedEvents: 0,
        restoredImages: 0,
        totalGoods: remoteResolved.goodsMap.size,
        totalTrash: remoteResolved.trashMap.size,
        totalRecharge: Array.isArray(rechargeData?.recharge) ? rechargeData.recharge.length : 0,
        totalEvents: Array.isArray(eventData?.events) ? eventData.events.length : 0,
        noChanges: true
      }
    }

    const imageStats = buildImageSyncStats()
    const imageGist = await resolveRemoteImageGist(remoteManifest)

    if (shouldHydrateGoodsImages) {
      const goodsImageCountBefore = imageStats.restoredImages
      remoteData.goods = await trackSyncStep('恢复收藏图片', async () => hydrateRemoteItemsWithImages(remoteData.goods || [], imageGist, imageStats, {
        targetItemIds: changedGoodsIds
      }), {
        startDetail: '正在恢复收藏条目图片',
        category: 'image',
        successDetail: () => `恢复 ${imageStats.restoredImages - goodsImageCountBefore} 张收藏图片`
      })
    }

    if (shouldHydrateTrashImages) {
      const trashImageCountBefore = imageStats.restoredImages
      remoteData.trash = await trackSyncStep('恢复回收站图片', async () => hydrateRemoteItemsWithImages(remoteData.trash || [], imageGist, imageStats, {
        targetItemIds: changedTrashIds
      }), {
        startDetail: '正在恢复回收站条目图片',
        category: 'image',
        successDetail: () => `恢复 ${imageStats.restoredImages - trashImageCountBefore} 张回收站图片`
      })
    }

    if (shouldHydrateEventImages && eventData && Array.isArray(eventData.events)) {
      const eventImageCountBefore = imageStats.restoredImages
      eventData.events = await trackSyncStep('恢复活动封面', async () => hydrateEventCoversWithImages(eventData.events, imageGist, imageStats, {
        targetEventIds: changedEventIds
      }), {
        startDetail: '正在恢复活动封面图片',
        category: 'image',
        successDetail: () => `恢复 ${imageStats.restoredImages - eventImageCountBefore} 张活动封面`
      })
    }

    if (remoteData.presets) {
      await presets.replacePresetsSnapshot(remoteData.presets)
    }

    const resolvedRemote = resolveGoodsTrashMaps(remoteData.goods || [], remoteData.trash || [])
    const remoteGoods = [...resolvedRemote.goodsMap.values()]
    const remoteTrash = [...resolvedRemote.trashMap.values()]

    const goodsToImport = []
    const goodsToUpdate = []
    const trashIdsToRemove = new Set()
    const localGoodsMap = new Map(goodsStore.list.map((item) => [item.id, item]))
    const localTrashMap = new Map(goodsStore.trashList.map((item) => [item.id, item]))

    for (const remoteItem of remoteGoods) {
      const localItem = localGoodsMap.get(remoteItem.id)
      const localTrashItem = localTrashMap.get(remoteItem.id)

      if (localTrashItem) {
        if (getItemTimestamp(remoteItem) > getItemTimestamp(localTrashItem)) {
          trashIdsToRemove.add(remoteItem.id)
        } else {
          continue
        }
      }

      if (!localItem) {
        goodsToImport.push(remoteItem)
      } else if (shouldApplyRemoteItem(localItem, remoteItem)) {
        goodsToUpdate.push(remoteItem)
      }
    }

    if (trashIdsToRemove.size > 0) {
      for (const id of trashIdsToRemove) {
        await goodsStore.deleteTrashItem(id)
      }
    }

    if (goodsToImport.length > 0) {
      await goodsStore.importGoodsBackup(goodsToImport)
      await presets.syncCharactersFromGoods(goodsToImport)
      await presets.syncStorageLocationsFromPaths(
        goodsToImport.map((item) => item.storageLocation).filter(Boolean)
      )
    }

    await goodsStore.updateGoodsBackup(goodsToUpdate)

    const currentGoodsMap = new Map(goodsStore.list.map((item) => [item.id, item]))
    const currentTrashMap = new Map(goodsStore.trashList.map((item) => [item.id, item]))
    const goodsIdsToDelete = new Set()
    const trashToImport = []
    const trashToUpdate = []

    for (const remoteItem of remoteTrash) {
      const localGoodsItem = currentGoodsMap.get(remoteItem.id)
      const localTrashItem = currentTrashMap.get(remoteItem.id)

      if (localGoodsItem) {
        if (getItemTimestamp(remoteItem) >= getItemTimestamp(localGoodsItem)) {
          goodsIdsToDelete.add(remoteItem.id)
        } else {
          continue
        }
      }

      if (!localTrashItem) {
        trashToImport.push(remoteItem)
      } else if (shouldApplyRemoteItem(localTrashItem, remoteItem)) {
        trashToUpdate.push(remoteItem)
      }
    }

    if (goodsIdsToDelete.size > 0) {
      goodsStore.list = goodsStore.list.filter((item) => !goodsIdsToDelete.has(item.id))
      await deleteItems([...goodsIdsToDelete])
    }

    if (trashToImport.length > 0) {
      await goodsStore.importTrashBackup(trashToImport)
    }

    if (trashToUpdate.length > 0) {
      await goodsStore.updateTrashBackup(trashToUpdate)
    }

    const remoteGoodsIds = new Set(remoteGoods.map((item) => item.id))
    const remoteTrashIds = new Set(remoteTrash.map((item) => item.id))
    const localOnlyGoodsIds = goodsStore.list
      .filter((item) => !remoteGoodsIds.has(item.id) && !remoteTrashIds.has(item.id))
      .map((item) => item.id)
    const localOnlyTrashIds = goodsStore.trashList
      .filter((item) => !remoteTrashIds.has(item.id) && !remoteGoodsIds.has(item.id))
      .map((item) => item.id)

    if (localOnlyGoodsIds.length > 0) {
      const localOnlyGoodsSet = new Set(localOnlyGoodsIds)
      goodsStore.list = goodsStore.list.filter((item) => !localOnlyGoodsSet.has(item.id))
      await deleteItems(localOnlyGoodsIds)
    }

    if (localOnlyTrashIds.length > 0) {
      for (const id of localOnlyTrashIds) {
        await goodsStore.deleteTrashItem(id)
      }
    }

    const remoteRecharge = Array.isArray(rechargeData?.recharge)
      ? rechargeData.recharge
      : []
    const remoteRechargeLegacy = Array.isArray(remoteData.rechargeRecords) ? remoteData.rechargeRecords : []
    const rechargeApplyResult = rechargeStore.replaceBackup([
      ...remoteRecharge,
      ...remoteRechargeLegacy
    ].filter((item) => !item?.deleted))

    let eventApplyResult = { added: 0, updated: 0, removed: 0, total: 0 }
    if (eventData && Array.isArray(eventData.events)) {
      const eventsStore = useEventsStore()
      eventApplyResult = {
        ...(await eventsStore.importEventsBackup(eventData.events, { reconcileMissing: true })),
        total: eventData.events.length
      }
      await saveEventLastSyncedAt(eventData.updatedAt || remoteManifest?.lastSyncAt || new Date().toISOString())
    }

    return {
      importedGoods: goodsToImport.length,
      updatedGoods: goodsToUpdate.length,
      importedTrash: trashToImport.length,
      updatedTrash: trashToUpdate.length,
      importedRecharge: rechargeApplyResult.added,
      updatedRecharge: rechargeApplyResult.updated,
      importedEvents: eventApplyResult.added,
      updatedEvents: eventApplyResult.updated,
      removedEvents: eventApplyResult.removed,
      restoredImages: imageStats.restoredImages,
      totalGoods: remoteGoods.length,
      totalTrash: remoteTrash.length,
      totalRecharge: rechargeApplyResult.total,
      totalEvents: eventApplyResult.total
    }
  }

  async function pushToRemote(existingGist = null, existingImageGist = null, existingRechargeGist = null, existingEventGist = null) {
    if (!existingGist && gistIdRef.value) {
      await getGist(tokenRef.value, gistIdRef.value)
    }

    const imageGist = existingImageGist || await ensureImageGist()

    const { syncData, imageStats, imageFiles, referencedImageFiles } = await trackSyncStep('整理收藏/回收站同步数据', async () => buildSyncPayload({ existingImageGist: imageGist }), {
      startDetail: '读取本地收藏、回收站和图片',
      category: 'local',
      successDetail: (payload) => {
        const goodsCount = Array.isArray(payload?.syncData?.goods) ? payload.syncData.goods.length : 0
        const trashCount = Array.isArray(payload?.syncData?.trash) ? payload.syncData.trash.length : 0
        return `收藏 ${goodsCount}，回收站 ${trashCount}，图片 ${payload?.imageStats?.imageFileCount || 0} 个`
      }
    })
    const rechargeSyncData = await trackSyncStep('整理充值同步数据', async () => buildRechargeSyncData({ incremental: false }), {
      startDetail: '读取本地充值记录',
      category: 'local',
      successDetail: (payload) => {
        const rechargeCount = Array.isArray(payload?.recharge) ? payload.recharge.length : 0
        return `充值 ${rechargeCount} 条`
      }
    })
    const { eventData: eventSyncData, imageStats: eventImageStats, imageFiles: eventImageFiles, referencedImageFiles: eventReferencedImageFiles } = await trackSyncStep('整理活动同步数据', async () => buildEventSyncPayload({ existingImageGist: imageGist }), {
      startDetail: '读取活动和封面图片',
      category: 'local',
      successDetail: (payload) => {
        const eventCount = Array.isArray(payload?.eventData?.events) ? payload.eventData.events.length : 0
        return `活动 ${eventCount} 场，图片 ${payload?.imageStats?.imageFileCount || 0} 个`
      }
    })

    const allReferencedImageFiles = new Set([...referencedImageFiles, ...eventReferencedImageFiles])
    const imageCleanupFiles = buildImageCleanupFiles(imageGist, allReferencedImageFiles)
    const imageUpdates = {
      ...imageFiles,
      ...eventImageFiles,
      ...imageCleanupFiles
    }

    if (Object.keys(imageUpdates).length > 0) {
      await trackSyncStep('更新图片 Gist', async () => updateGist(tokenRef.value, imageGist.id, imageUpdates), {
        startDetail: `上传 ${Object.keys(imageUpdates).length} 个图片变更`,
        category: 'image',
        successDetail: () => '图片 Gist 已更新'
      })
    }

    const syncTimestamp = new Date().toISOString()

    const mergedImageStats = {
      uploadedImages: (Number(imageStats.uploadedImages) || 0) + (Number(eventImageStats.uploadedImages) || 0),
      reusedImages: (Number(imageStats.reusedImages) || 0) + (Number(eventImageStats.reusedImages) || 0),
      restoredImages: (Number(imageStats.restoredImages) || 0) + (Number(eventImageStats.restoredImages) || 0),
      imageFileCount: allReferencedImageFiles.size,
      imageUpdatedAt: Object.keys(imageUpdates).length > 0 ? syncTimestamp : ''
    }
    const manifest = buildManifest(mergedImageStats, syncTimestamp)

    await trackSyncStep('更新主同步 Gist', async () => updateGist(tokenRef.value, gistIdRef.value, {
      [DATA_FILENAME]: { content: JSON.stringify(syncData) },
      [RECHARGE_DATA_FILENAME]: { content: JSON.stringify(rechargeSyncData) },
      [EVENT_DATA_FILENAME]: { content: JSON.stringify(eventSyncData) },
      [MANIFEST_FILENAME]: { content: JSON.stringify(manifest) }
    }), {
      startDetail: '上传 data.json / recharge-data.json / events-data.json / manifest.json',
      category: 'sync',
      successDetail: () => '主同步 Gist 已更新'
    })

    await saveLastSyncedAt(manifest.lastSyncAt)
    await saveEventLastSyncedAt(eventSyncData.updatedAt || manifest.lastSyncAt)

    if (rechargeGistIdRef.value && rechargeGistIdRef.value !== gistIdRef.value) {
      await saveRechargeGistId('')
    }
    if (eventGistIdRef.value && eventGistIdRef.value !== gistIdRef.value) {
      await saveEventGistId('')
    }

    return { ...mergedImageStats }
  }

  return {
    pullFromRemote,
    pushToRemote
  }
}
