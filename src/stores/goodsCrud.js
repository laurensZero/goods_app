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
    onMutate?.()
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
  onMutate?.()
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
    await addItem(next)
    await deleteManagedLocalImages(removedPaths)
  } catch (e) {
    console.error('[goods] updateGoods DB write failed:', e)
    throw e
  }
  onMutate?.()
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

  list.value = list.value.map((item) => {
    if (!ids.has(item.id)) return item
    changed = true
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
    onMutate?.()
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
      persistTrash()
    ])
  } catch (e) {
    console.error('[goods] removeGoods DB write failed:', e)
    throw e
  }
  onMutate?.()
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
      persistTrash()
    ])
  } catch (e) {
    console.error('[goods] removeMultipleGoods DB write failed:', e)
    throw e
  }
  onMutate?.()
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
  onMutate?.()
  return restored
}

/**
 * @param {string} id
 * @param {import('vue').ShallowRef<import('@/types/models').TrashGoodsItem[]>} trashList
 * @param {() => Promise<void>} persistTrash
 */
export async function deleteTrashItem(id, trashList, persistTrash) {
  const existing = trashList.value.find((entry) => entry.id === id)
  const next = trashList.value.filter((entry) => entry.id !== id)
  if (next.length === trashList.value.length) return

  trashList.value = next
  try {
    await persistTrash()
    await deleteManagedLocalImages(collectManagedLocalImagePathsFromGoodsItem(existing))
  } catch (e) {
    console.error('[goods] deleteTrashItem DB write failed:', e)
    throw e
  }
}

/**
 * @param {import('vue').ShallowRef<import('@/types/models').TrashGoodsItem[]>} trashList
 * @param {() => Promise<void>} persistTrash
 */
export async function emptyTrash(trashList, persistTrash) {
  if (trashList.value.length === 0) return
  const removedPaths = new Set()
  for (const item of trashList.value) {
    for (const path of collectManagedLocalImagePathsFromGoodsItem(item)) {
      removedPaths.add(path)
    }
  }
  trashList.value = []
  try {
    await persistTrash()
    await deleteManagedLocalImages(removedPaths)
  } catch (e) {
    console.error('[goods] emptyTrash DB write failed:', e)
    throw e
  }
}

/**
 * @param {string[]|Set<string>} ids
 * @param {import('vue').ShallowRef<import('@/types/models').GoodsItem[]>} list
 */
export async function deleteGoodsPermanently(ids, list) {
  const targetIds = [...new Set(Array.from(ids || []).filter(Boolean))]
  if (targetIds.length === 0) return 0

  const targetIdSet = new Set(targetIds)
  const removedPaths = new Set()
  for (const item of list.value) {
    if (!targetIdSet.has(item.id)) continue
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
    await deleteManagedLocalImages(removedPaths)
  } catch (e) {
    console.error('[goods] deleteGoodsPermanently DB write failed:', e)
    throw e
  }
  return targetIds.length
}
