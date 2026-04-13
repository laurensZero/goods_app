import {
  buildComparableRecordMap,
  buildImageReferenceMap,
  buildTimestampRecordMap,
  countComparableRecordDiff,
  countWishlistSplit,
  getItemTimestamp,
  resolveGoodsTrashMaps
} from '@/utils/syncShared'

export function createSyncConflictService({
  lastSyncedAtRef,
  useGoodsStore,
  useRechargeStore,
  useEventsStore,
  shouldApplyRemoteItem,
  getExistingRechargeGist,
  getExistingEventGist,
  readJsonFromGistWithTrace,
  buildRechargeSyncData,
  buildEventSyncData,
  getLatestLocalModifiedAt
}) {
  function getLocalChangesSince(timestamp) {
    const goodsStore = useGoodsStore()
    const rechargeStore = useRechargeStore()
    const eventsStore = useEventsStore()
    const resolvedLocal = resolveGoodsTrashMaps(goodsStore.list, goodsStore.trashList)
    const goods = [...resolvedLocal.goodsMap.values()]
    const trash = [...resolvedLocal.trashMap.values()]
    const recharge = rechargeStore.exportBackup({ includeDeleted: false, stripImage: true })
    const events = eventsStore.list || []

    const updatedGoods = goods.filter((item) => getItemTimestamp(item) > timestamp).length
    const updatedTrash = trash.filter((item) => getItemTimestamp(item) > timestamp).length
    const updatedRecharge = recharge.filter((item) => getItemTimestamp(item) > timestamp).length
    const updatedEvents = events.filter((item) => (Number(item.updatedAt) || 0) > timestamp).length

    return {
      updatedGoods,
      updatedTrash,
      updatedRecharge,
      totalGoods: goods.length,
      totalTrash: trash.length,
      totalRecharge: recharge.length,
      totalEvents: events.length,
      updatedEvents,
      hasChanges: updatedGoods > 0 || updatedTrash > 0 || updatedRecharge > 0 || updatedEvents > 0
    }
  }

  async function buildPullConflictData(gist, remoteManifest) {
    const goodsStore = useGoodsStore()
    const rechargeStore = useRechargeStore()
    const eventsStore = useEventsStore()
    const existingRechargeGist = await getExistingRechargeGist()
    const existingEventGist = await getExistingEventGist()
    const remoteData = await readJsonFromGistWithTrace({
      title: '预检读取 data.json',
      gist,
      fileName: 'data.json',
      startDetail: '读取收藏、心愿单和回收站',
      category: 'pull',
      successDetail: (parsed) => {
        if (!parsed) return '未找到远端主数据'
        const goods = Array.isArray(parsed.goods) ? parsed.goods : []
        const trash = Array.isArray(parsed.trash) ? parsed.trash : []
        const counts = countWishlistSplit(goods)
        return `收藏 ${counts.collection}，心愿单 ${counts.wishlist}，回收站 ${trash.length}`
      }
    })
    const localRechargeData = buildRechargeSyncData({ incremental: false })
    const remoteRechargeData = await readJsonFromGistWithTrace({
      title: '预检读取 recharge-data.json',
      gist,
      fileName: 'recharge-data.json',
      startDetail: '读取充值记录',
      category: 'pull',
      fallbackGist: existingRechargeGist,
      fallbackFileName: 'recharge-data.json',
      successDetail: (parsed, source) => {
        if (!parsed) return '未找到充值数据'
        const recharge = Array.isArray(parsed.recharge) ? parsed.recharge : []
        const rechargeTrash = Array.isArray(parsed.rechargeTrash) ? parsed.rechargeTrash : []
        return `${source}，充值 ${recharge.length} 条，回收站 ${rechargeTrash.length} 条`
      }
    }) || {
      recharge: Array.isArray(remoteData?.recharge) ? remoteData.recharge : [],
      rechargeTrash: Array.isArray(remoteData?.rechargeTrash) ? remoteData.rechargeTrash : []
    }
    const localEventData = buildEventSyncData()
    const remoteEventData = await readJsonFromGistWithTrace({
      title: '预检读取 events-data.json',
      gist,
      fileName: 'events-data.json',
      startDetail: '读取活动数据',
      category: 'pull',
      fallbackGist: existingEventGist,
      fallbackFileName: 'events-data.json',
      successDetail: (parsed, source) => {
        if (!parsed) return '未找到活动数据'
        const events = Array.isArray(parsed.events) ? parsed.events : []
        return `${source}，活动 ${events.length} 场`
      }
    }) || { events: [] }
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
    const rechargeDiff = countComparableRecordDiff(
      buildComparableRecordMap(localRechargeData.recharge || []),
      buildComparableRecordMap(remoteRechargeData.recharge || [])
    )
    const eventDiff = countComparableRecordDiff(
      buildTimestampRecordMap(localEventData.events || []),
      buildTimestampRecordMap(remoteEventData.events || [])
    )
    const imageDiff = countComparableRecordDiff(
      buildImageReferenceMap({
        goods: [...resolvedLocal.goodsMap.values()],
        trash: [...resolvedLocal.trashMap.values()],
        events: localEventData.events || []
      }),
      buildImageReferenceMap({
        goods: remoteGoods,
        trash: remoteTrash,
        events: remoteEventData.events || []
      })
    )

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
      updatedGoods
    }
  }

  return {
    getLocalChangesSince,
    buildPullConflictData
  }
}
