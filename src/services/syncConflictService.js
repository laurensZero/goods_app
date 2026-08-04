import {
  buildImageReferenceMap,
  countComparableRecordDiff,
  countWishlistSplit,
  getItemTimestamp,
  resolveGoodsTrashMaps,
  normalizeBudgetValue,
  readBudgetSettings
} from '@/utils/sync/shared'
import { compareStateSync } from '@/utils/sync/stateCompare'

export function createSyncConflictService({
  backend,
  getBackend,
  lastSyncedAtRef,
  useGoodsStore,
  useRechargeStore,
  useEventsStore,
  useGoodsGroupStore,
  shouldApplyRemoteItem,
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
    const recharge = rechargeStore.exportBackup({ includeDeleted: false, stripImage: false })
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

  async function buildPullConflictData(remoteManifest, { forceRecharge = false, sourceTable = 'manual', cachedRemoteData = null, cachedRemoteRechargeData = null, cachedRemoteEventData = null } = {}) {
    const goodsStore = useGoodsStore()
    const currentBackend = resolveBackend()

    // Read all remote data via pullAll
    const remoteData = cachedRemoteData || await currentBackend.pullAll({})
    const localRechargeData = buildRechargeSyncData({ incremental: false })
    const localBudgetData = await readBudgetSettings()
    const remoteBudgetData = {
      monthly: normalizeBudgetValue(remoteManifest?.budgetMonthly ?? remoteData?.budgetSettings?.monthly),
      yearly: normalizeBudgetValue(remoteManifest?.budgetYearly ?? remoteData?.budgetSettings?.yearly)
    }
    const localEventData = buildEventSyncData()

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
    const rechargeDiff = compareStateSync(localRechargeData.recharge || [], remoteData?.recharge || [])
    const eventDiff = compareStateSync(localEventData.events || [], remoteData?.events || [])

    const goodsGroupStore = useGoodsGroupStore()
    const groupDiff = compareStateSync(goodsGroupStore.groupList || [], remoteData?.goodsGroups || [])
    const groupItemDiff = compareStateSync(goodsGroupStore.groupItemList || [], remoteData?.goodsGroupItems || [])

    const hasBudgetDiff = localBudgetData.monthly !== remoteBudgetData.monthly || localBudgetData.yearly !== remoteBudgetData.yearly

    const localImageMap = buildImageReferenceMap({
      goods: [...resolvedLocal.goodsMap.values()],
      trash: [...resolvedLocal.trashMap.values()],
      events: localEventData.events || []
    })
    const remoteImageMap = buildImageReferenceMap({
      goods: remoteGoods,
      trash: remoteTrash,
      events: remoteData?.events || []
    })
    const imageDiff = countComparableRecordDiff(localImageMap, remoteImageMap)
    const localOnlyImageKeys = [...localImageMap.keys()].filter((key) => !remoteImageMap.has(key))
    const remoteOnlyImageKeys = [...remoteImageMap.keys()].filter((key) => !localImageMap.has(key))

    return {
      remoteTime: remoteManifest?.lastSyncAt || '',
      remoteDevice: remoteManifest?.deviceId || '',
      localTime: lastSyncedAtRef.value,
      localModifiedTime: getLatestLocalModifiedAt(),
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
      remoteRechargeData: remoteData?.recharge || [],
      remoteEventData: remoteData?.events || []
    }
  }

  return {
    getLocalChangesSince,
    buildPullConflictData
  }
}
