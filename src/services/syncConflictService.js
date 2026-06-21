import {
  asyncBuildComparableRecordMap,
  buildImageReferenceMap,
  buildTimestampRecordMap,
  countComparableRecordDiff,
  countWishlistSplit,
  getItemTimestamp,
  resolveGoodsTrashMaps,
  normalizeBudgetValue,
  shouldPullRechargeByManifest,
  readBudgetSettings
} from '@/utils/sync/shared'
import i18n from '@/locales'

export function createSyncConflictService({
  backend,
  getBackend,
  lastSyncedAtRef,
  useGoodsStore,
  useRechargeStore,
  useEventsStore,
  useGoodsGroupStore,
  shouldApplyRemoteItem,
  getExistingRechargeGist,
  getExistingEventGist,
  buildRechargeSyncData,
  buildEventSyncData,
  getLatestLocalModifiedAt
}) {
  function resolveBackend() {
    return typeof getBackend === 'function' ? (getBackend() || backend) : backend
  }

  function getLocalChangesSince(timestamp) {
    const goodsStore = useGoodsStore()
    const rechargeStore = useRechargeStore()
    const eventsStore = useEventsStore()
    const goodsGroupStore = useGoodsGroupStore()
    const resolvedLocal = resolveGoodsTrashMaps(goodsStore.list, goodsStore.trashList)
    const goods = [...resolvedLocal.goodsMap.values()]
    const trash = [...resolvedLocal.trashMap.values()]
    const recharge = rechargeStore.exportBackup({ includeDeleted: false, stripImage: true })
    const events = eventsStore.list || []
    const groups = goodsGroupStore.groupList || []
    const groupItems = goodsGroupStore.groupItemList || []

    const updatedGoods = goods.filter((item) => getItemTimestamp(item) > timestamp).length
    const updatedTrash = trash.filter((item) => getItemTimestamp(item) > timestamp).length
    const updatedRecharge = recharge.filter((item) => getItemTimestamp(item) > timestamp).length
    const updatedEvents = events.filter((item) => (Number(item.updatedAt) || 0) > timestamp).length
    const updatedGroups = groups.filter((item) => (Number(item.updatedAt) || 0) > timestamp).length
    const updatedGroupItems = groupItems.filter((item) => (Number(item.updatedAt) || 0) > timestamp).length

    return {
      updatedGoods,
      updatedTrash,
      updatedRecharge,
      totalGoods: goods.length,
      totalTrash: trash.length,
      totalRecharge: recharge.length,
      totalEvents: events.length,
      updatedEvents,
      updatedGroups,
      updatedGroupItems,
      totalGroups: groups.length,
      totalGroupItems: groupItems.length,
      hasChanges: updatedGoods > 0 || updatedTrash > 0 || updatedRecharge > 0 || updatedEvents > 0 || updatedGroups > 0 || updatedGroupItems > 0
    }
  }

  async function buildPullConflictData(gist, remoteManifest, { forceRecharge = false, sourceTable = 'manual' } = {}) {
    const goodsStore = useGoodsStore()
    const rechargeStore = useRechargeStore()
    const eventsStore = useEventsStore()
    const currentBackend = resolveBackend()
    const isSupabaseBackend = typeof currentBackend.getImagePublicUrl === 'function'
    const existingRechargeGist = getExistingRechargeGist
      ? await getExistingRechargeGist()
      : await currentBackend.getExistingRechargeGist()
    const existingEventGist = getExistingEventGist
      ? await getExistingEventGist()
      : await currentBackend.getExistingEventGist()
    const remoteData = await currentBackend.readJson({
      title: i18n.global.t('sync.step.readData'),
      gist,
      fileName: 'data.json',
      startDetail: i18n.global.t('sync.step.readData.start'),
      category: 'pull',
      successDetail: (parsed) => {
        if (!parsed) return i18n.global.t('sync.step.readData.notFound')
        const goods = Array.isArray(parsed.goods) ? parsed.goods : []
        const trash = Array.isArray(parsed.trash) ? parsed.trash : []
        const counts = countWishlistSplit(goods)
        return i18n.global.t('sync.step.readData.success', { collection: counts.collection, wishlist: counts.wishlist, trash: trash.length })
      }
    })
    const localRechargeData = buildRechargeSyncData({ incremental: false })
    const localBudgetData = await readBudgetSettings()
    const remoteBudgetData = {
      monthly: normalizeBudgetValue(remoteManifest?.budgetMonthly ?? remoteData?.budgetSettings?.monthly),
      yearly: normalizeBudgetValue(remoteManifest?.budgetYearly ?? remoteData?.budgetSettings?.yearly)
    }
    const shouldReadRechargePrecheck = forceRecharge || isSupabaseBackend || shouldPullRechargeByManifest(remoteManifest, localRechargeData.recharge || [])
    const triggeredByRealtime = typeof sourceTable === 'string' && sourceTable !== 'manual'
    const localEventData = buildEventSyncData()
    const remoteRechargeData = (shouldReadRechargePrecheck && (!triggeredByRealtime || sourceTable === 'recharge_records'))
      ? (await currentBackend.readJson({
          title: i18n.global.t('sync.step.readRecharge'),
          gist,
          fileName: 'recharge-data.json',
          startDetail: i18n.global.t('sync.step.readRecharge.start'),
          category: 'pull',
          fallbackGist: existingRechargeGist,
          fallbackFileName: 'recharge-data.json',
          successDetail: (parsed, source) => {
            if (!parsed) return i18n.global.t('sync.step.readRecharge.notFound')
            const recharge = Array.isArray(parsed.recharge) ? parsed.recharge : []
            const rechargeTrash = Array.isArray(parsed.rechargeTrash) ? parsed.rechargeTrash : []
            return i18n.global.t('sync.step.readRecharge.successWithTrash', { source, count: recharge.length, trash: rechargeTrash.length })
          }
        }) || {
          recharge: Array.isArray(remoteData?.recharge) ? remoteData.recharge : [],
          rechargeTrash: Array.isArray(remoteData?.rechargeTrash) ? remoteData.rechargeTrash : []
        })
      : { recharge: localRechargeData.recharge || [], rechargeTrash: [] }
    const remoteEventData = (!triggeredByRealtime || sourceTable === 'events')
      ? (await currentBackend.readJson({
          title: i18n.global.t('sync.step.readEvents'),
          gist,
          fileName: 'events-data.json',
          startDetail: i18n.global.t('sync.step.readEvents.start'),
          category: 'pull',
          fallbackGist: existingEventGist,
          fallbackFileName: 'events-data.json',
          successDetail: (parsed, source) => {
            if (!parsed) return i18n.global.t('sync.step.readEvents.notFound')
            const events = Array.isArray(parsed.events) ? parsed.events : []
            return i18n.global.t('sync.step.readEvents.success', { source, count: events.length })
          }
        }) || { events: [] })
      : { events: [] }
    const resolvedLocal = resolveGoodsTrashMaps(goodsStore.list, goodsStore.trashList)

    let remoteGoods = []
    let remoteTrash = []

    if (remoteData) {
      const resolvedRemote = resolveGoodsTrashMaps(remoteData.goods || [], remoteData.trash || [])
      remoteGoods = [...resolvedRemote.goodsMap.values()]
      remoteTrash = [...resolvedRemote.trashMap.values()]
    }

    const localGoodsMap = resolvedLocal.goodsMap
    const localTrashMap = resolvedLocal.trashMap
    const remoteGoodsMap = new Map(remoteGoods.map((item) => [item.id, item]))
    const remoteTrashMap = new Map(remoteTrash.map((item) => [item.id, item]))

    let remoteOnlyGoods = 0
    let remoteOnlyCollection = 0
    let remoteOnlyWishlist = 0
    let remoteOnlyTrash = 0
    let localOnlyCollection = 0
    let localOnlyWishlist = 0
    let updatedGoods = 0

    for (const remoteItem of remoteGoods) {
      const localGoodsItem = localGoodsMap.get(remoteItem.id)
      const localTrashItem = localTrashMap.get(remoteItem.id)

      if (!localGoodsItem && !localTrashItem) {
        remoteOnlyGoods += 1
        if (remoteItem?.isWishlist) {
          remoteOnlyWishlist += 1
        } else {
          remoteOnlyCollection += 1
        }
      } else if (localGoodsItem && shouldApplyRemoteItem(localGoodsItem, remoteItem)) {
        updatedGoods += 1
      } else if (localTrashItem && shouldApplyRemoteItem(localTrashItem, remoteItem)) {
        updatedGoods += 1
      }
    }

    for (const remoteItem of remoteTrash) {
      if (!localTrashMap.has(remoteItem.id) && !localGoodsMap.has(remoteItem.id)) {
        remoteOnlyTrash += 1
      } else if (localGoodsMap.has(remoteItem.id) && !localTrashMap.has(remoteItem.id)) {
        const localItem = localGoodsMap.get(remoteItem.id)
        if (shouldApplyRemoteItem(localItem, remoteItem)) {
          updatedGoods += 1
        }
      }
    }

    const localOnlyGoods = [...localGoodsMap.keys()].filter((id) => !remoteGoodsMap.has(id) && !remoteTrashMap.has(id)).length
    const localOnlyTrash = [...localTrashMap.keys()].filter((id) => !remoteTrashMap.has(id) && !remoteGoodsMap.has(id)).length
    for (const item of localGoodsMap.values()) {
      if (remoteGoodsMap.has(item.id) || remoteTrashMap.has(item.id)) continue
      if (item?.isWishlist) {
        localOnlyWishlist += 1
      } else {
        localOnlyCollection += 1
      }
    }

    const remoteCounts = countWishlistSplit(remoteGoods)
    const [localRechargeMap, remoteRechargeMap] = await Promise.all([
      asyncBuildComparableRecordMap(localRechargeData.recharge || []),
      asyncBuildComparableRecordMap(remoteRechargeData.recharge || [])
    ])
    const rechargeDiff = countComparableRecordDiff(localRechargeMap, remoteRechargeMap)
    const eventDiff = countComparableRecordDiff(
      buildTimestampRecordMap(localEventData.events || []),
      buildTimestampRecordMap(remoteEventData.events || [])
    )

    const goodsGroupStore = useGoodsGroupStore()
    const groupDiff = countComparableRecordDiff(
      buildTimestampRecordMap(goodsGroupStore.groupList || []),
      buildTimestampRecordMap(remoteData?.goodsGroups || [])
    )
    const groupItemDiff = countComparableRecordDiff(
      buildTimestampRecordMap(goodsGroupStore.groupItemList || []),
      buildTimestampRecordMap(remoteData?.goodsGroupItems || [])
    )

    const hasBudgetDiff = localBudgetData.monthly !== remoteBudgetData.monthly || localBudgetData.yearly !== remoteBudgetData.yearly

    const localImageMap = buildImageReferenceMap({
      goods: [...resolvedLocal.goodsMap.values()],
      trash: [...resolvedLocal.trashMap.values()],
      events: localEventData.events || []
    })
    const remoteImageMap = buildImageReferenceMap({
      goods: remoteGoods,
      trash: remoteTrash,
      events: remoteEventData.events || []
    })
    const imageDiff = countComparableRecordDiff(localImageMap, remoteImageMap)
    const localOnlyImageKeys = [...localImageMap.keys()].filter((key) => !remoteImageMap.has(key))
    const remoteOnlyImageKeys = [...remoteImageMap.keys()].filter((key) => !localImageMap.has(key))

    console.info('[sync][pull-conflict] image diff summary', {
      remoteTotal: imageDiff.remoteTotal,
      remoteOnly: imageDiff.remoteOnly,
      localOnly: imageDiff.localOnly,
      updated: imageDiff.updated,
      remoteOnlyImageKeys: remoteOnlyImageKeys.slice(0, 10),
      localOnlyImageKeys: localOnlyImageKeys.slice(0, 10)
    })

    return {
      remoteTime: remoteManifest?.lastSyncAt || '',
      remoteDevice: remoteManifest?.deviceId || '',
      localTime: lastSyncedAtRef.value,
      localModifiedTime: getLatestLocalModifiedAt(),
      gist,
      remoteGoodsCount: remoteGoods.length,
      remoteCollectionCount: remoteCounts.collection,
      remoteWishlistCount: remoteCounts.wishlist,
      remoteTrashCount: remoteTrash.length,
      remoteOnlyGoods,
      remoteOnlyCollection,
      remoteOnlyWishlist,
      remoteOnlyTrash,
      remoteRechargeCount: rechargeDiff.remoteTotal,
      remoteOnlyRecharge: rechargeDiff.remoteOnly,
      updatedRecharge: rechargeDiff.updated,
      localOnlyRecharge: rechargeDiff.localOnly,
      remoteEventCount: eventDiff.remoteTotal,
      remoteOnlyEvents: eventDiff.remoteOnly,
      updatedEvents: eventDiff.updated,
      localOnlyEvents: eventDiff.localOnly,
      remoteGroupCount: groupDiff.remoteTotal,
      remoteOnlyGroups: groupDiff.remoteOnly,
      updatedGroups: groupDiff.updated,
      localOnlyGroups: groupDiff.localOnly,
      remoteGroupItemCount: groupItemDiff.remoteTotal,
      remoteOnlyGroupItems: groupItemDiff.remoteOnly,
      updatedGroupItems: groupItemDiff.updated,
      localOnlyGroupItems: groupItemDiff.localOnly,
      remoteImageCount: imageDiff.remoteTotal,
      remoteOnlyImages: imageDiff.remoteOnly,
      updatedImages: imageDiff.updated,
      localOnlyImages: imageDiff.localOnly,
      localOnlyImageKeys: localOnlyImageKeys.slice(0, 10),
      remoteOnlyImageKeys: remoteOnlyImageKeys.slice(0, 10),
      localOnlyGoods,
      localOnlyCollection,
      localOnlyWishlist,
      localOnlyTrash,
      updatedGoods,
      hasBudgetDiff,
      localBudgetMonthly: localBudgetData.monthly,
      localBudgetYearly: localBudgetData.yearly,
      remoteBudgetMonthly: remoteBudgetData.monthly,
      remoteBudgetYearly: remoteBudgetData.yearly,
      remoteData,
      remoteRechargeData,
      remoteEventData
    }
  }

  return {
    getLocalChangesSince,
    buildPullConflictData
  }
}
