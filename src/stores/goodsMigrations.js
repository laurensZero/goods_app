import { triggerRef } from 'vue'
import { saveItems, deleteItems } from '@/utils/db'
import { buildGoodsIdentityKey } from '@/utils/goodsIdentity'
import { getPrimaryGoodsImageUrl, normalizeGoodsImageList } from '@/utils/goodsImages'
import { normalizeCharacterList, normalizeGoodsInput, normalizeTrashItem, mergeGoodsRecord } from '@/stores/goodsHelpers'

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function deepEqual(left, right) {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false
    for (let i = 0; i < left.length; i++) {
      if (!deepEqual(left[i], right[i])) return false
    }
    return true
  }
  if (isPlainObject(left) || isPlainObject(right)) {
    if (!isPlainObject(left) || !isPlainObject(right)) return false
    const leftKeys = Object.keys(left)
    const rightKeys = Object.keys(right)
    if (leftKeys.length !== rightKeys.length) return false
    for (const key of leftKeys) {
      if (!Object.prototype.hasOwnProperty.call(right, key)) return false
      if (!deepEqual(left[key], right[key])) return false
    }
    return true
  }
  return false
}

async function normalizeExistingCharacters(list, trashList, persistTrash) {
  const updates = []
  list.value = list.value.map((item) => {
    const normalizedCharacters = normalizeCharacterList(item.characters)
    if (deepEqual(normalizedCharacters, item.characters)) return item
    const next = { ...item, characters: normalizedCharacters, updatedAt: Date.now() }
    updates.push(next)
    return next
  })

  let trashChanged = false
  trashList.value = trashList.value.map((item) => {
    const normalizedCharacters = normalizeCharacterList(item.characters)
    if (deepEqual(normalizedCharacters, item.characters)) return item
    trashChanged = true
    return { ...item, characters: normalizedCharacters, updatedAt: Date.now() }
  })

  if (updates.length > 0) {
    triggerRef(list)
    await saveItems(updates)
  }
  if (trashChanged) {
    triggerRef(trashList)
    await persistTrash()
  }
}

async function normalizeExistingVariants(list, trashList, persistTrash) {
  const now = Date.now()
  let listChanged = false
  const mergedList = []
  const mergedKeyToIndex = new Map()
  const removedIds = new Set()

  list.value.forEach((item) => {
    const normalized = normalizeGoodsInput(item, item.id)
    const unchanged = deepEqual(normalized, item)
    const next = unchanged ? item : { ...normalized, updatedAt: now }
    if (!unchanged) listChanged = true

    const key = `${next.isWishlist ? 1 : 0}::${buildGoodsIdentityKey(next)}`
    if (mergedKeyToIndex.has(key)) {
      const existingIndex = mergedKeyToIndex.get(key)
      mergedList[existingIndex] = { ...mergeGoodsRecord(mergedList[existingIndex], next), updatedAt: now }
      removedIds.add(next.id)
      listChanged = true
      return
    }

    mergedKeyToIndex.set(key, mergedList.length)
    mergedList.push(next)
  })

  let trashChanged = false
  trashList.value = trashList.value.map((item) => {
    const normalized = normalizeTrashItem(item, item.id)
    if (deepEqual(normalized, item)) return item
    const next = { ...normalized, updatedAt: now }
    trashChanged = true
    return next
  })

  if (listChanged) {
    list.value = mergedList
    triggerRef(list)
    await saveItems(mergedList)
    if (removedIds.size > 0) {
      await deleteItems(Array.from(removedIds))
    }
  }
  if (trashChanged) {
    triggerRef(trashList)
    await persistTrash()
  }
}

async function backfillLegacyImages(list) {
  const updates = []
  list.value = list.value.map((item) => {
    if (Array.isArray(item.images) && item.images.length > 0) return item
    const legacyCover = String(item.coverImage || '').trim()
    if (!legacyCover) return item
    const images = normalizeGoodsImageList(undefined, legacyCover)
    if (images.length === 0) return item
    const coverImage = getPrimaryGoodsImageUrl(images, legacyCover)
    const next = { ...item, images, coverImage }
    updates.push(next)
    return next
  })

  if (updates.length > 0) {
    triggerRef(list)
    await saveItems(updates)
  }
}

export {
  normalizeExistingCharacters,
  normalizeExistingVariants,
  backfillLegacyImages
}
