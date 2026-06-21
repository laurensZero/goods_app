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

  list.value.unshift(incoming)
  triggerRef(list)
  try {
    await addItem(incoming)
  } catch (e) {
    console.error('[goods] addGoods DB write failed:', e)
    throw e
  }
  onMutate?.([incoming.id])
  void scheduleSaleReminderForItem(incoming)
  return incoming
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
    return normalizeGoodsInput({ ...data, __imagesExplicit: imagesExplicit, updatedAt: now + i }, String(now + i))
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
    const next = normalizeGoodsInput({ ...item, ...data, id: item.id, __imagesExplicit: imagesExplicit, updatedAt: now }, item.id)
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
 * @param {string} id
 * @param {import('vue').ShallowRef<import('@/types/models').GoodsItem[]>} list
 * @param {import('vue').ShallowRef<import('@/types/models').TrashGoodsItem[]>} trashList
 * @param {() => Promise<void>} persistTrash
 * @param {() => void} [onMutate]
 */
export async function removeGoods(id, list, trashList, persistTrash, onMutate) {
  const item = list.value.find((entry) => entry.id === id)
  if (!item) return

  const now = Date.now()
  trashList.value.unshift(normalizeTrashItem({
    ...item,
    updatedAt: now,
    deletedAt: new Date(now).toISOString()
  }, item.id))
  triggerRef(trashList)
  list.value = list.value.filter((entry) => entry.id !== id)
  try {
    await Promise.all([
      deleteItems([id]),
      cancelSaleReminderNotifications(id, item.saleReminderOffsets),
      persistTrash()
    ])
  } catch (e) {
    console.error('[goods] removeGoods DB write failed:', e)
    throw e
  }
  onMutate?.([id])
}

/**
 * @param {Set<string>} ids
 * @param {import('vue').ShallowRef<import('@/types/models').GoodsItem[]>} list
 * @param {import('vue').ShallowRef<import('@/types/models').TrashGoodsItem[]>} trashList
 * @param {() => Promise<void>} persistTrash
 * @param {() => void} [onMutate]
 */
export async function removeMultipleGoods(ids, list, trashList, persistTrash, onMutate) {
  const now = Date.now()
  const removedItems = list.value
    .filter((item) => ids.has(item.id))
    .map((item) => normalizeTrashItem({
      ...item,
      updatedAt: now,
      deletedAt: new Date(now).toISOString()
    }, item.id))

  if (removedItems.length === 0) return

  trashList.value = [...removedItems, ...trashList.value]
  list.value = list.value.filter((item) => !ids.has(item.id))
  try {
    await Promise.all([
      deleteItems(Array.from(ids)),
      ...removedItems.map((item) => cancelSaleReminderNotifications(item.id, item.saleReminderOffsets)),
      persistTrash()
    ])
  } catch (e) {
    console.error('[goods] removeMultipleGoods DB write failed:', e)
    throw e
  }
  onMutate?.([...ids])
}

/**
 * @param {string} id
 * @param {import('vue').ShallowRef<import('@/types/models').GoodsItem[]>} list
 * @param {import('vue').ShallowRef<import('@/types/models').TrashGoodsItem[]>} trashList
 * @param {() => Promise<void>} persistTrash
 * @param {() => void} [onMutate]
 */
export async function restoreTrashItem(id, list, trashList, persistTrash, onMutate) {
  const item = trashList.value.find((entry) => entry.id === id)
  if (!item) return null

  const restored = normalizeGoodsInput({ ...item, updatedAt: Date.now() }, item.id)
  if (list.value.some((entry) => entry.id === restored.id)) {
    restored.id = String(Date.now())
  }

  list.value.unshift(restored)
  triggerRef(list)
  trashList.value = trashList.value.filter((entry) => entry.id !== id)
  try {
    await Promise.all([
      addItem(restored),
      persistTrash()
    ])
  } catch (e) {
    console.error('[goods] restoreTrashItem DB write failed:', e)
    throw e
  }
  onMutate?.([id])
  void scheduleSaleReminderForItem(restored)
  return restored
}

/**
 * @param {string} id
 * @param {import('vue').ShallowRef<import('@/types/models').TrashGoodsItem[]>} trashList
 * @param {() => Promise<void>} persistTrash
 * @param {() => void} [onMutate]
 */
export async function deleteTrashItem(id, trashList, persistTrash, onMutate) {
  const existing = trashList.value.find((entry) => entry.id === id)
  const next = trashList.value.filter((entry) => entry.id !== id)
  if (next.length === trashList.value.length) return

  trashList.value = next
  try {
    await persistTrash()
    await cancelSaleReminderNotifications(id, existing?.saleReminderOffsets)
    await deleteManagedLocalImages(collectManagedLocalImagePathsFromGoodsItem(existing))
  } catch (e) {
    console.error('[goods] deleteTrashItem DB write failed:', e)
    throw e
  }
  onMutate?.([id])
}

/**
 * @param {import('vue').ShallowRef<import('@/types/models').TrashGoodsItem[]>} trashList
 * @param {() => Promise<void>} persistTrash
 * @param {() => void} [onMutate]
 */
export async function emptyTrash(trashList, persistTrash, onMutate) {
  if (trashList.value.length === 0) return
  const removedItems = [...trashList.value]
  const removedPaths = new Set()
  for (const item of removedItems) {
    for (const path of collectManagedLocalImagePathsFromGoodsItem(item)) {
      removedPaths.add(path)
    }
  }
  trashList.value = []
  try {
    await persistTrash()
    await Promise.all(removedItems.map((item) => cancelSaleReminderNotifications(item.id, item.saleReminderOffsets)))
    await deleteManagedLocalImages(removedPaths)
  } catch (e) {
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
