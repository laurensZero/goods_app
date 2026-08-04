// src/services/syncPullPipeline.js
// Pull pipeline: read remote → diff → hydrate images → merge to local

import { resolveGoodsTrashMaps, getItemTimestamp, normalizeBudgetValue, countWishlistSplit } from '@/utils/sync/shared'
import { parseCloudImageUri } from '@/utils/goods/images'
import { compareStateSync } from '@/utils/sync/stateCompare'
import { writePersisted } from '@/utils/platform/storage'
import { MONTHLY_BUDGET_STORAGE_KEY, YEARLY_BUDGET_STORAGE_KEY } from '@/constants/budgetConstants'
import i18n from '@/locales'

/**
 * Read remote data from the backend via pullAll RPC.
 * sync_pull 恒返回全部域 + manifest + presets，没有按表/按域裁剪参数；
 * 只需要清单时请用 be.readManifest()（直查 sync_manifest，不拉数据行）。
 *
 * @param {object} be - backend adapter
 * @param {object} opts
 * @param {number} opts.since - incremental: only rows after this timestamp (ms)
 */
export async function readRemoteData(be, { since = 0, trackSyncStep = null } = {}) {
  // Helper to wrap a task with trackSyncStep if available
  const wrapStep = (title, task, opts) => trackSyncStep ? trackSyncStep(title, task, opts) : task()

  const isIncremental = since > 0
  const pullData = await wrapStep(
    i18n.global.t('sync.step.readData'),
    () => be.pullAll({ since }),
    {
      startDetail: i18n.global.t('sync.step.readData.start'),
      category: 'pull',
      successDetail: (data) => {
        const g = data?.goods || []
        const c = countWishlistSplit(g)
        return i18n.global.t('sync.step.readData.success', { collection: c.collection, wishlist: c.wishlist, trash: (data?.trash || []).length })
      }
    }
  )
  pullData.isIncremental = isIncremental
  return pullData
}

/**
 * Compare local stores with remote data.
 * Pure function — no side effects.
 */
export function diffLocalRemote(localStores, remoteData, { domains = null, incremental = false } = {}) {
  const { goodsStore, rechargeStore, eventsStore, goodsGroupStore } = localStores

  const localResolved = resolveGoodsTrashMaps(goodsStore.list, goodsStore.trashList)
  const remoteResolved = resolveGoodsTrashMaps(remoteData.goods || [], remoteData.trash || [])

  // Collect changed IDs for incremental pull
  const changedGoodsIds = new Set()
  const changedTrashIds = new Set()
  for (const remoteItem of remoteResolved.goodsMap.values()) {
    const localItem = localResolved.goodsMap.get(remoteItem.id) || localResolved.trashMap.get(remoteItem.id)
    if (!localItem || getItemTimestamp(remoteItem) > getItemTimestamp(localItem)) {
      changedGoodsIds.add(remoteItem.id)
    }
  }
  for (const remoteItem of remoteResolved.trashMap.values()) {
    const localItem = localResolved.trashMap.get(remoteItem.id) || localResolved.goodsMap.get(remoteItem.id)
    if (!localItem || getItemTimestamp(remoteItem) > getItemTimestamp(localItem)) {
      changedTrashIds.add(remoteItem.id)
    }
  }

  // Timestamp-based comparison (incremental skips localOnly counting)
  const goodsTrashCompare = compareStateSync(
    [...localResolved.goodsMap.values(), ...localResolved.trashMap.values()],
    [...remoteResolved.goodsMap.values(), ...remoteResolved.trashMap.values()],
    { incremental }
  )
  const groupsCompare = compareStateSync(
    (goodsGroupStore.groupList || []).filter(g => !g.deleted),
    remoteData.groups || [],
    { incremental }
  )
  const groupItemsCompare = compareStateSync(
    (goodsGroupStore.groupItemList || []).filter(gi => !gi.deleted),
    remoteData.groupItems || [],
    { incremental }
  )
  const rechargeCompare = compareStateSync(
    rechargeStore.exportBackup({ includeDeleted: false, stripImage: false }) || [],
    remoteData.recharge || [],
    { incremental }
  )
  const eventCompare = compareStateSync(
    (eventsStore.list || []).filter(e => !e.deleted),
    remoteData.events || [],
    { incremental }
  )

  const hasChanges = goodsTrashCompare.hasChanges || groupsCompare.hasChanges || groupItemsCompare.hasChanges
    || rechargeCompare.hasChanges || eventCompare.hasChanges

  return {
    goodsTrashCompare, groupsCompare, groupItemsCompare, rechargeCompare, eventCompare,
    changedGoodsIds, changedTrashIds,
    hasChanges
  }
}

/**
 * Hydrate remote items with images (restore cloud-image:// or public URLs).
 * @returns {{ restoredImages: number }}
 */
export async function hydrateRemoteImages(imageService, be, remoteData, diff) {
  const imageStats = { restoredImages: 0 }
  if (!imageService) return imageStats

  const imageCloud = await imageService.resolveRemoteImageCloud(remoteData.manifest)

  const hydrationTasks = []
  if ((remoteData.goods || []).length > 0 && diff.changedGoodsIds.size > 0) {
    hydrationTasks.push(
      imageService.hydrateRemoteItemsWithImages(remoteData.goods, imageCloud, imageStats, { targetItemIds: diff.changedGoodsIds })
        .then(hydrated => { remoteData.goods = hydrated })
    )
  }
  if ((remoteData.trash || []).length > 0 && diff.changedTrashIds.size > 0) {
    hydrationTasks.push(
      imageService.hydrateRemoteItemsWithImages(remoteData.trash, imageCloud, imageStats, { targetItemIds: diff.changedTrashIds })
        .then(hydrated => { remoteData.trash = hydrated })
    )
  }
  if ((remoteData.events || []).length > 0) {
    hydrationTasks.push(
      imageService.hydrateEventCoversWithImages(remoteData.events, imageCloud, imageStats)
        .then(hydrated => { remoteData.events = hydrated })
    )
  }

  if (hydrationTasks.length > 0) await Promise.all(hydrationTasks)
  return imageStats
}

/**
 * Apply remote data to local stores.
 *
 * @param {object} stores - { goodsStore, rechargeStore, eventsStore, goodsGroupStore, presetsStore }
 * @param {object} remoteData - remote data from readRemoteData
 * @param {object} opts
 * @param {boolean} opts.reconcileMissing - if true, delete local items not present in remote
 * @param {object} opts.diff - diff result from diffLocalRemote
 * @param {Function} opts.shouldApplyRemoteItem - conflict resolver
 * @param {Set<string>|Function|null} opts.dirtyGoodsIds - 本地未推送改动的商品 id（或返回该集合的 getter），reconcile 删除时排除
 * @param {number} opts.pullStartMs - 拉取开始时刻（本机毫秒）；不早于它的行时间视为 NULL updated_at 的 Date.now() 回退值，不参与水位线统计
 */
export async function mergeToLocal(stores, remoteData, opts = {}) {
  const { goodsStore, rechargeStore, eventsStore, goodsGroupStore, presetsStore } = stores
  const { reconcileMissing = true, localSyncTime = 0, dirtyGoodsIds = null, pullStartMs = 0, resolveRechargeImage = null } = opts

  // 合并前对比本地状态，统计实际会落库的新增/更新数（LWW：仅远端更新时间更新才生效）。
  // 拉取重叠窗口（PULL_CLOCK_OVERLAP_MS）会重复拉到已合并过的行，
  // 按拉取行数计数会让 UI 误报「导入 N 件」，必须按实际变化计数
  const counts = countAppliedChanges(stores, remoteData)

  // Compute remote watermark
  let remoteWatermark = 0
  function trackTs(items) {
    for (const item of (items || [])) {
      const ts = Number(item?.updatedAt) || 0
      // NULL updated_at 的行在 reader 里被 normalizeTimestamp 回退为读取时刻的本机
      // Date.now()（恒不早于拉取开始时刻），不得把水位线推到本机当前时间造成漏拉
      if (pullStartMs > 0 && ts >= pullStartMs) continue
      if (ts > remoteWatermark) remoteWatermark = ts
    }
  }
  trackTs(remoteData.goods); trackTs(remoteData.trash)
  trackTs(remoteData.recharge); trackTs(remoteData.rechargeTrash)
  trackTs(remoteData.events); trackTs(remoteData.eventsTrash)
  trackTs(remoteData.groups); trackTs(remoteData.groupsTrash)
  trackTs(remoteData.groupItems); trackTs(remoteData.groupItemsTrash)

  // ── Goods ──
  const goods = remoteData.goods || []
  const trash = remoteData.trash || []

  // Import new + update existing
  if (goods.length > 0) {
    await goodsStore.importGoodsBackup(goods)
    await goodsStore.updateGoodsBackup(goods)
  }
  if (trash.length > 0) {
    await goodsStore.importTrashBackup(trash)
    await goodsStore.updateTrashBackup(trash)
  }

  // Reconcile: delete local items not in remote
  if (reconcileMissing && (goods.length > 0 || trash.length > 0)) {
    const remoteGoodsIds = new Set(goods.map(g => g.id))
    const remoteTrashIds = new Set(trash.map(t => t.id))
    const hasAnyRemote = remoteGoodsIds.size > 0 || remoteTrashIds.size > 0

    if (hasAnyRemote) {
      // dirty 标记（已持久化、不受时钟影响）中的条目是尚未推送的本地改动：
      // 客户端时钟落后时新建条目可能 updatedAt <= 水位线，被误判为"远端已删"而物理删除。
      // 支持传 getter：在 reconcile 执行时刻实时读取，拉取在途期间新增的商品同样受保护
      const dirtyIdSet = typeof dirtyGoodsIds === 'function' ? dirtyGoodsIds() : dirtyGoodsIds
      const isDirtyLocal = (id) => !!dirtyIdSet && dirtyIdSet.has(String(id))
      const localOnlyGoodsIds = goodsStore.list
        .filter(item => !remoteGoodsIds.has(item.id) && !remoteTrashIds.has(item.id))
        .filter(item => getItemTimestamp(item) <= localSyncTime && !isDirtyLocal(item.id))
        .map(item => item.id)
      const localOnlyTrashIds = goodsStore.trashList
        .filter(item => !remoteTrashIds.has(item.id) && !remoteGoodsIds.has(item.id))
        .filter(item => getItemTimestamp(item) <= localSyncTime && !isDirtyLocal(item.id))
        .map(item => item.id)
      if (localOnlyGoodsIds.length > 0) await goodsStore.deleteGoodsPermanently(localOnlyGoodsIds)
      if (localOnlyTrashIds.length > 0) await Promise.all(localOnlyTrashIds.map(id => goodsStore.deleteTrashItem(id)))
    }
  }

  // ── Recharge ──
  const rechargeArr = remoteData.recharge || []
  const rechargeTrashArr = remoteData.rechargeTrash || []
  const allRecharge = [...rechargeArr, ...rechargeTrashArr]
  if (allRecharge.length > 0) {
    // Resolve cloud-image:// URIs to public URLs if a resolver is provided
    if (typeof resolveRechargeImage === 'function') {
      for (const record of allRecharge) {
        const cloudFileName = parseCloudImageUri(record.image)
        if (cloudFileName) {
          record.image = resolveRechargeImage(cloudFileName)
        }
      }
    }
    await rechargeStore.importBackup(allRecharge, {
      reconcileMissing,
      preserveLocalNewerThan: remoteWatermark
    })
  }

  // ── Events ──
  const eventsArr = remoteData.events || []
  const eventsTrashArr = remoteData.eventsTrash || []
  const allEvents = [...eventsArr, ...eventsTrashArr]
  if (allEvents.length > 0) {
    await eventsStore.importEventsBackup(allEvents, {
      reconcileMissing,
      preserveLocalNewerThan: remoteWatermark
    })
  }

  // ── Groups ──
  const groupsArr = remoteData.groups || []
  const groupsTrashArr = remoteData.groupsTrash || []
  const groupItemsArr = remoteData.groupItems || []
  const groupItemsTrashArr = remoteData.groupItemsTrash || []
  const allGroups = [...groupsArr, ...groupsTrashArr]
  const allGroupItems = [...groupItemsArr, ...groupItemsTrashArr]
  if (allGroups.length > 0 || allGroupItems.length > 0) {
    await goodsGroupStore.updateGroupsBackup(allGroups, allGroupItems)
  }

  // ── Presets ──
  if (remoteData.presets && presetsStore) {
    await presetsStore.replacePresetsSnapshot(remoteData.presets)
  }

  // ── Budget settings ──
  if (remoteData.manifest) {
    const monthly = normalizeBudgetValue(remoteData.manifest.budgetMonthly)
    const yearly = normalizeBudgetValue(remoteData.manifest.budgetYearly)
    if (monthly > 0 || yearly > 0) {
      await Promise.all([
        writePersisted(MONTHLY_BUDGET_STORAGE_KEY, monthly > 0 ? String(monthly) : ''),
        writePersisted(YEARLY_BUDGET_STORAGE_KEY, yearly > 0 ? String(yearly) : '')
      ])
    }
  }

  return { remoteWatermark, counts }
}

/**
 * Count how many remote rows would actually change local state (LWW by timestamp).
 * Pure read — must run BEFORE the merge mutates the stores.
 */
function countAppliedChanges(stores, remoteData) {
  const { goodsStore, rechargeStore, eventsStore, goodsGroupStore } = stores
  const localResolved = resolveGoodsTrashMaps(goodsStore.list || [], goodsStore.trashList || [])
  const counts = {
    importedGoods: 0, updatedGoods: 0, importedTrash: 0,
    importedRecharge: 0, updatedRecharge: 0,
    importedEvents: 0, updatedEvents: 0,
    importedGroups: 0
  }

  for (const g of (remoteData.goods || [])) {
    const inGoods = localResolved.goodsMap.get(g.id)
    const local = inGoods || localResolved.trashMap.get(g.id)
    if (!local) counts.importedGoods++
    else if (getItemTimestamp(g) > getItemTimestamp(local)) {
      // 本地在回收站、远端更新 → 恢复到收藏，对用户而言是新增
      if (inGoods) counts.updatedGoods++
      else counts.importedGoods++
    }
  }
  for (const t of (remoteData.trash || [])) {
    const inTrash = localResolved.trashMap.get(t.id)
    const local = inTrash || localResolved.goodsMap.get(t.id)
    // 本地不存在或从收藏移入回收站才计数；回收站内容更新对用户不可见，不计
    if (!local) counts.importedTrash++
    else if (!inTrash && getItemTimestamp(t) > getItemTimestamp(local)) counts.importedTrash++
  }

  const localRecharge = new Map(
    (rechargeStore.exportBackup?.({ includeDeleted: true, stripImage: false }) || []).map(r => [r.id, r])
  )
  for (const r of (remoteData.recharge || [])) {
    const local = localRecharge.get(r.id)
    if (!local) counts.importedRecharge++
    else if (getItemTimestamp(r) > getItemTimestamp(local)) counts.updatedRecharge++
  }
  for (const r of (remoteData.rechargeTrash || [])) {
    const local = localRecharge.get(r.id)
    // 远端删除覆盖本地存活记录 → 对用户可见的变化
    if (local && !local.deleted && getItemTimestamp(r) > getItemTimestamp(local)) counts.updatedRecharge++
  }

  const localEvents = new Map((eventsStore?.list || []).map(e => [e.id, e]))
  for (const e of (remoteData.events || [])) {
    const local = localEvents.get(e.id)
    if (!local) counts.importedEvents++
    else if (getItemTimestamp(e) > getItemTimestamp(local)) counts.updatedEvents++
  }
  for (const e of (remoteData.eventsTrash || [])) {
    const local = localEvents.get(e.id)
    if (local && !local.deleted && getItemTimestamp(e) > getItemTimestamp(local)) counts.updatedEvents++
  }

  const localGroups = new Map((goodsGroupStore?.groupList || []).map(g => [g.id, g]))
  for (const g of [...(remoteData.groups || []), ...(remoteData.groupsTrash || [])]) {
    const local = localGroups.get(g.id)
    if (!local || getItemTimestamp(g) > getItemTimestamp(local)) counts.importedGroups++
  }
  const localGroupItems = new Map((goodsGroupStore?.groupItemList || []).map(gi => [gi.id, gi]))
  for (const gi of [...(remoteData.groupItems || []), ...(remoteData.groupItemsTrash || [])]) {
    const local = localGroupItems.get(gi.id)
    if (!local || getItemTimestamp(gi) > getItemTimestamp(local)) counts.importedGroups++
  }

  return counts
}
