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
  diffRemovedManagedImagePaths
} from '@/stores/goodsHelpers'
import { cancelSaleReminderNotifications, scheduleSaleReminderForItem } from '@/utils/saleReminder'
import {
  applyAcquiredAtToTimeline,
  bootstrapAcquisitionStatus,
  ensureInitialTimeline
} from '@/utils/goods/statusTimeline'

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
  const incoming = itemsData.map((data, i) => {
    const imagesExplicit = Array.isArray(data?.images)
    return ensureInitialTimeline(normalizeGoodsInput({ ...data, __imagesExplicit: imagesExplicit, updatedAt: now + i }, String(now + i)))
  })

  for (const item of incoming) {
    list.value.unshift(item)
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

  const imagesExplicit = Array.isArray(data?.images)
  const previous = list.value[idx]
  const next = normalizeGoodsInput({ ...previous, ...data, id, __imagesExplicit: imagesExplicit, updatedAt: Date.now() }, id)
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
 * @param {object} data
 * @param {import('vue').ShallowRef<import('@/types/models').GoodsItem[]>} list
 * @param {() => void} [onMutate]
 */
export async function updateMultipleGoods(ids, data, list, onMutate) {
  let changed = false
  const imagesExplicit = Array.isArray(data?.images)
  const now = Date.now()
  const removedPaths = new Set()
  const previousItems = []

  list.value = list.value.map((item) => {
    if (!ids.has(item.id)) return item
    changed = true
    previousItems.push(item)

    // 批量编辑购入日期 → 购入语义条目同步到新日期(与编辑器共用 applyAcquiredAtToTimeline);
    // 空时间线的兜底状态限购入语义,避免给「已出/在售」商品造出假卖出条目
    const mergedData = { ...item, ...data, id: item.id, __imagesExplicit: imagesExplicit, updatedAt: now }
    const newAcquiredAt = data.acquiredAt || ''
    const oldAcquiredAt = item.acquiredAt || ''
    if (newAcquiredAt && newAcquiredAt !== oldAcquiredAt) {
      const timeline = Array.isArray(item.statusTimeline) ? item.statusTimeline : []
      mergedData.statusTimeline = timeline.length === 0
        ? [{ status: bootstrapAcquisitionStatus(item.collectStatus), at: newAcquiredAt }]
        : applyAcquiredAtToTimeline(timeline, oldAcquiredAt, newAcquiredAt)
    }
    const next = normalizeGoodsInput(mergedData, item.id)
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
