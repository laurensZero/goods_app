// @ts-check
import { triggerRef } from 'vue'
import { addItem, saveItems, deleteItems } from '@/utils/db/index'
import { buildGoodsIdentityKey } from '@/utils/goods/identity'
import {
  collectManagedLocalImagePathsFromGoodsItem,
  deleteManagedLocalImages
} from '@/utils/image/localImage'
import {
  normalizeGoodsInput,
  normalizeTrashItem,
  mergeGoodsRecord,
  diffRemovedManagedImagePaths,
  normalizeWishlistFlag
} from '@/stores/goods/goodsHelpers'
import { cancelSaleReminderNotifications, scheduleSaleReminderForItem } from '@/utils/goods/saleReminder'
import {
  ensureInitialTimeline,
  maintainTimelineOnGoodsUpdate
} from '@/utils/goods/statusTimeline'
import { nextGoodsSortOrder } from '@/stores/goods/goodsOrder'

/** 新建/翻转心愿时：只给自定义序 append；其它模式次级序留空，让日期/名称/价格主序决定位置 */
function appendManualOrders(items, isWishlist, excludeId = '') {
  return {
    custom: nextGoodsSortOrder(items, isWishlist, excludeId, 'custom')
  }
}

/**
 * @param {object} data
 * @param {import('vue').ShallowRef<import('@/types/models').GoodsItem[]>} list
 * @param {() => void} [onMutate]
 */
export async function addGoods(data, list, onMutate) {
  const imagesExplicit = Array.isArray(data?.images)
  const now = Date.now()
  const incoming = normalizeGoodsInput({ ...data, __imagesExplicit: imagesExplicit, updatedAt: now }, String(now))
  const key = buildGoodsIdentityKey(incoming)
  const existingIndex = list.value.findIndex((item) =>
    item.isWishlist === incoming.isWishlist && buildGoodsIdentityKey(item) === key
  )

  if (existingIndex !== -1) {
    // 合并进已有商品:incoming 不做时间线兜底,避免给既有时间线拼入凭空的「已拥有@今天」
    list.value[existingIndex] = mergeGoodsRecord(list.value[existingIndex], incoming)
    triggerRef(list)
    try {
      await addItem(list.value[existingIndex])
    } catch (e) {
      console.error('[goods] addGoods (merge) DB write failed:', e)
      throw e
    }
    onMutate?.([list.value[existingIndex].id])
    void scheduleSaleReminderForItem(list.value[existingIndex])
    return list.value[existingIndex]
  }

  if (data?.manualOrders == null) {
    incoming.manualOrders = appendManualOrders(list.value, incoming.isWishlist)
  }
  const fresh = ensureInitialTimeline(incoming)
  list.value.unshift(fresh)
  triggerRef(list)
  try {
    await addItem(fresh)
  } catch (e) {
    console.error('[goods] addGoods DB write failed:', e)
    throw e
  }
  onMutate?.([fresh.id])
  void scheduleSaleReminderForItem(fresh)
  return fresh
}

/**
 * Batch add multiple goods items — single triggerRef + single DB transaction.
 * @param {object[]} itemsData
 * @param {import('vue').ShallowRef<import('@/types/models').GoodsItem[]>} list
 * @param {() => void} [onMutate]
 */
export async function addGoodsBatch(itemsData, list, onMutate) {
  const now = Date.now()
  /** @type {import('@/types/models').GoodsItem[]} */
  const incoming = []
  for (let i = 0; i < itemsData.length; i++) {
    const data = itemsData[i]
    const imagesExplicit = Array.isArray(data?.images)
    const itemNow = now + i
    const normalized = normalizeGoodsInput({ ...data, __imagesExplicit: imagesExplicit, updatedAt: itemNow }, String(itemNow))
    if (data?.manualOrders == null) {
      normalized.manualOrders = appendManualOrders(list.value, normalized.isWishlist)
    }
    incoming.push(ensureInitialTimeline(normalized))
    // 同批后续条目也要看到前面刚加入的 manualOrders，避免同序
    list.value.unshift(incoming[incoming.length - 1])
  }

  triggerRef(list)

  try {
    await saveItems(incoming)
  } catch (e) {
    console.error('[goods] addGoodsBatch DB write failed:', e)
    throw e
  }
  onMutate?.(incoming.map((item) => item.id))
  for (const item of incoming) {
    void scheduleSaleReminderForItem(item)
  }
  return incoming
}

/**
 * @param {string} id
 * @param {object} data
 * @param {import('vue').ShallowRef<import('@/types/models').GoodsItem[]>} list
 * @param {() => void} [onMutate]
 */
export async function updateGoods(id, data, list, onMutate) {
  const idx = list.value.findIndex((item) => item.id === id)
  if (idx === -1) return null

  const previous = list.value[idx]
  // 编辑器会显式传入算好的 statusTimeline;MCP/AI 只改字段时由 maintainTimelineOnGoodsUpdate 补齐
  const timelineAware = maintainTimelineOnGoodsUpdate(previous, data)
  const imagesExplicit = Array.isArray(timelineAware?.images)
  const next = normalizeGoodsInput({ ...previous, ...timelineAware, id, __imagesExplicit: imagesExplicit, updatedAt: Date.now() }, id)
  // isWishlist 翻转：manualOrders 各模式 append 到目标列表末尾
  if (normalizeWishlistFlag(previous.isWishlist) !== normalizeWishlistFlag(next.isWishlist)) {
    next.manualOrders = appendManualOrders(list.value, next.isWishlist, id)
  }
  const removedPaths = diffRemovedManagedImagePaths(previous, next)
  list.value[idx] = next
  triggerRef(list)
  try {
    await Promise.all([addItem(next), deleteManagedLocalImages(removedPaths)])
  } catch (e) {
    console.error('[goods] updateGoods DB write failed:', e)
    throw e
  }
  onMutate?.([id])
  void cancelSaleReminderNotifications(previous.id, previous.saleReminderOffsets)
    .then(() => scheduleSaleReminderForItem(next))
    .catch(() => {})
  return id
}

/**
 * @param {Set<string>} ids
 * @param {object | ((item: import('@/types/models').GoodsItem) => object)} data - 字段补丁，或按条目返回补丁的函数（如优惠分摊）
 * @param {import('vue').ShallowRef<import('@/types/models').GoodsItem[]>} list
 * @param {() => void} [onMutate]
 */
export async function updateMultipleGoods(ids, data, list, onMutate) {
  let changed = false
  const isFn = typeof data === 'function'
  const sharedImages = !isFn && Array.isArray(data?.images)
  const now = Date.now()
  const removedPaths = new Set()
  const previousItems = []
  const transitionNextOrders = new Map()

  function nextTransitionCustomOrder(isWishlist) {
    const target = normalizeWishlistFlag(isWishlist)
    if (!transitionNextOrders.has(target)) {
      transitionNextOrders.set(target, nextGoodsSortOrder(list.value, target))
    }
    const next = transitionNextOrders.get(target)
    transitionNextOrders.set(target, next + 1)
    return next
  }

  list.value = list.value.map((item) => {
    if (!ids.has(item.id)) return item
    changed = true
    previousItems.push(item)

    const itemData = isFn ? (data(item) || {}) : data
    const imagesExplicit = isFn ? Array.isArray(itemData?.images) : sharedImages
    let patch = { ...itemData }

    // 批量改整条收藏状态时，多件商品的逐件状态同步对齐；
    // 否则列表角标/时间流转仍按 unitCollectStatusList 显示旧状态（如「已拥有」）
    const becomesWishlist = itemData.isWishlist === true
    const staysWishlist = item.isWishlist === true && itemData.isWishlist === undefined
    if (itemData.collectStatus !== undefined && !becomesWishlist && !staysWishlist) {
      const qty = Math.max(1, Number(itemData.quantity ?? item.quantity) || 1)
      if (qty >= 2) {
        const newStatus = String(itemData.collectStatus || '').trim() || '已拥有'
        patch.unitCollectStatusList = Array.from({ length: qty }, () => newStatus)
      }
    }

    // 时间线自动维护与单件编辑/MCP 共用：改状态、逐件状态、购入日期等都会落时间线条目
    const timelineAware = maintainTimelineOnGoodsUpdate(item, patch)
    const mergedData = { ...item, ...timelineAware, id: item.id, __imagesExplicit: imagesExplicit, updatedAt: now }
    const next = normalizeGoodsInput(mergedData, item.id)
    // 批量心愿单↔收藏转换也必须重新分配目标列表的 custom 序号；
    // 否则会把心愿单序号带进收藏（或反之），与目标列表已有序号重复。
    if (normalizeWishlistFlag(item.isWishlist) !== normalizeWishlistFlag(next.isWishlist)) {
      next.manualOrders = { custom: nextTransitionCustomOrder(next.isWishlist) }
    }
    for (const path of diffRemovedManagedImagePaths(item, next)) {
      removedPaths.add(path)
    }
    return next
  })

  if (changed) {
    const updatedItems = list.value.filter(item => ids.has(item.id))
    try {
      await saveItems(updatedItems)
      await deleteManagedLocalImages(removedPaths)
    } catch (e) {
      console.error('[goods] updateMultipleGoods DB write failed:', e)
      throw e
    }
    onMutate?.([...ids])
    for (const item of updatedItems) {
      const previous = previousItems.find((entry) => entry.id === item.id)
      void cancelSaleReminderNotifications(item.id, previous?.saleReminderOffsets)
        .then(() => scheduleSaleReminderForItem(item))
        .catch(() => {})
    }
  }
}

/**
 * 删除入回收站：写 trashed=1 的完整行到 goods 表（同表软删除，单次写入原子完成）。
 * @param {string} id
 * @param {import('vue').ShallowRef<import('@/types/models').GoodsItem[]>} list
 * @param {import('vue').ShallowRef<import('@/types/models').TrashGoodsItem[]>} trashList
 * @param {() => void} [onMutate]
 */
export async function removeGoods(id, list, trashList, onMutate) {
  const item = list.value.find((entry) => entry.id === id)
  if (!item) return

  const now = Date.now()
  const trashedItem = normalizeTrashItem({
    ...item,
    updatedAt: now,
    deletedAt: new Date(now).toISOString()
  }, item.id)
  // 快照当前状态，落库失败时用于回滚
  const prevList = list.value
  const prevTrash = trashList.value
  trashList.value = [trashedItem, ...prevTrash]
  list.value = prevList.filter((entry) => entry.id !== id)
  try {
    await Promise.all([
      saveItems([trashedItem]),
      cancelSaleReminderNotifications(id, item.saleReminderOffsets)
    ])
  } catch (e) {
    trashList.value = prevTrash
    list.value = prevList
    console.error('[goods] removeGoods DB write failed:', e)
    throw e
  }
  onMutate?.([id])
}

/**
 * @param {Set<string>} ids
 * @param {import('vue').ShallowRef<import('@/types/models').GoodsItem[]>} list
 * @param {import('vue').ShallowRef<import('@/types/models').TrashGoodsItem[]>} trashList
 * @param {() => void} [onMutate]
 */
export async function removeMultipleGoods(ids, list, trashList, onMutate) {
  const now = Date.now()
  const removedItems = list.value
    .filter((item) => ids.has(item.id))
    .map((item) => normalizeTrashItem({
      ...item,
      updatedAt: now,
      deletedAt: new Date(now).toISOString()
    }, item.id))

  if (removedItems.length === 0) return

  // 快照当前状态，落库失败时用于回滚
  const prevList = list.value
  const prevTrash = trashList.value
  trashList.value = [...removedItems, ...prevTrash]
  list.value = prevList.filter((item) => !ids.has(item.id))
  try {
    await Promise.all([
      saveItems(removedItems),
      ...removedItems.map((item) => cancelSaleReminderNotifications(item.id, item.saleReminderOffsets))
    ])
  } catch (e) {
    trashList.value = prevTrash
    list.value = prevList
    console.error('[goods] removeMultipleGoods DB write failed:', e)
    throw e
  }
  onMutate?.([...ids])
}

/**
 * @param {string} id
 * @param {import('vue').ShallowRef<import('@/types/models').GoodsItem[]>} list
 * @param {import('vue').ShallowRef<import('@/types/models').TrashGoodsItem[]>} trashList
 * @param {() => void} [onMutate]
 */
export async function restoreTrashItem(id, list, trashList, onMutate) {
  const item = trashList.value.find((entry) => entry.id === id)
  if (!item) return null

  // 回收站条目恒 trashed=true，恢复时必须显式清掉，否则写回 goods 表会保持软删除；
  // deletedAt 一并清空（normalizeGoodsInput 白名单不含该字段，落库时写空串）
  const restored = normalizeGoodsInput({ ...item, trashed: false, deletedAt: '', updatedAt: Date.now() }, item.id)
  if (list.value.some((entry) => entry.id === restored.id)) {
    restored.id = String(Date.now())
  }

  list.value.unshift(restored)
  triggerRef(list)
  trashList.value = trashList.value.filter((entry) => entry.id !== id)
  try {
    await addItem(restored)
  } catch (e) {
    console.error('[goods] restoreTrashItem DB write failed:', e)
    throw e
  }
  onMutate?.([id])
  void scheduleSaleReminderForItem(restored)
  return restored
}

/**
 * 回收站永久删除：物理 DELETE goods 表里的软删除行。
 * @param {string} id
 * @param {import('vue').ShallowRef<import('@/types/models').TrashGoodsItem[]>} trashList
 * @param {() => void} [onMutate]
 * @param {(ids: string[]) => Promise<void>} [onPermanentlyDeleted]
 */
export async function deleteTrashItem(id, trashList, onMutate, onPermanentlyDeleted) {
  const existing = trashList.value.find((entry) => entry.id === id)
  const next = trashList.value.filter((entry) => entry.id !== id)
  if (next.length === trashList.value.length) return

  // 快照当前状态，失败时回滚，避免内存与存储不一致
  const prevTrash = trashList.value
  trashList.value = next
  try {
    await onPermanentlyDeleted?.([id])
  } catch (e) {
    trashList.value = prevTrash
    console.error('[goods] deleteTrashItem: tombstone persist failed, aborting delete:', e)
    throw e
  }
  try {
    await Promise.all([
      deleteItems([id]),
      cancelSaleReminderNotifications(id, existing?.saleReminderOffsets),
      deleteManagedLocalImages(collectManagedLocalImagePathsFromGoodsItem(existing))
    ])
  } catch (e) {
    console.error('[goods] deleteTrashItem DB write failed:', e)
    throw e
  }
  onMutate?.([id])
}

/**
 * 清空回收站：把所有 trashed=1 行物理 DELETE 出 goods 表。
 * @param {import('vue').ShallowRef<import('@/types/models').TrashGoodsItem[]>} trashList
 * @param {() => void} [onMutate]
 * @param {(ids: string[]) => Promise<void>} [onPermanentlyDeleted]
 */
export async function emptyTrash(trashList, onMutate, onPermanentlyDeleted) {
  if (trashList.value.length === 0) return
  const removedItems = [...trashList.value]
  const removedPaths = new Set()
  for (const item of removedItems) {
    for (const path of collectManagedLocalImagePathsFromGoodsItem(item)) {
      removedPaths.add(path)
    }
  }
  try {
    await onPermanentlyDeleted?.(removedItems.map((item) => item.id))
  } catch (e) {
    console.error('[goods] emptyTrash: tombstone persist failed, aborting delete:', e)
    throw e
  }
  trashList.value = []
  try {
    await Promise.all([
      deleteItems(removedItems.map((item) => item.id)),
      ...removedItems.map((item) => cancelSaleReminderNotifications(item.id, item.saleReminderOffsets))
    ])
    await deleteManagedLocalImages(removedPaths)
  } catch (e) {
    trashList.value = removedItems
    console.error('[goods] emptyTrash DB write failed:', e)
    throw e
  }
  onMutate?.(removedItems.map((item) => item.id))
}

/**
 * @param {string[]|Set<string>} ids
 * @param {import('vue').ShallowRef<import('@/types/models').GoodsItem[]>} list
 * @param {() => void} [onMutate]
 */
export async function deleteGoodsPermanently(ids, list, onMutate) {
  const targetIds = [...new Set(Array.from(ids || []).filter(Boolean))]
  if (targetIds.length === 0) return 0

  const targetIdSet = new Set(targetIds)
  const removedItems = list.value.filter((item) => targetIdSet.has(item.id))
  const removedPaths = new Set()
  for (const item of removedItems) {
    for (const path of collectManagedLocalImagePathsFromGoodsItem(item)) {
      removedPaths.add(path)
    }
  }

  const next = list.value.filter((item) => !targetIdSet.has(item.id))
  if (next.length === list.value.length) return 0

  list.value = next
  triggerRef(list)
  try {
    await deleteItems(targetIds)
    await Promise.all(removedItems.map((item) => cancelSaleReminderNotifications(item.id, item.saleReminderOffsets)))
    await deleteManagedLocalImages(removedPaths)
  } catch (e) {
    console.error('[goods] deleteGoodsPermanently DB write failed:', e)
    throw e
  }
  onMutate?.(targetIds)
  return targetIds.length
}
