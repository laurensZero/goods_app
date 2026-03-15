import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { defineStore } from 'pinia'
import { ref, shallowRef, computed, triggerRef } from 'vue'
import { getItems, addItem, saveItems, deleteItems } from '@/utils/db'
import {
  buildGoodsIdentityKey,
  getGoodsVariant,
  normalizeGoodsName,
  stripVariantFromNote
} from '@/utils/goodsIdentity'
import {
  isStorageLocationUnderPrefix,
  normalizeStorageLocationValue,
  replaceStorageLocationPrefix as replaceStorageLocationPathPrefix
} from '@/utils/storageLocations'
import {
  getPrimaryGoodsImageUrl,
  normalizeGoodsImageList
} from '@/utils/goodsImages'

const TRASH_STORAGE_KEY = 'goods_trash_items'
const IS_NATIVE = Capacitor.isNativePlatform()

function isValidYearMonth(value) {
  return /^\d{4}-\d{2}$/.test(value)
}

function parseAcquiredTime(value) {
  if (!value) return 0
  const timestamp = Date.parse(String(value))
  return Number.isFinite(timestamp) ? timestamp : 0
}

function parseTimelineYearMonth(value) {
  const yearMonth = String(value || '').slice(0, 7)
  return isValidYearMonth(yearMonth) ? yearMonth : ''
}

function parseNumericPrice(value) {
  const price = Number.parseFloat(value)
  return Number.isFinite(price) ? price : 0
}

function parseQuantity(value) {
  return Math.max(1, Number(value) || 1)
}

function normalizeWishlistFlag(value) {
  return value === true || value === 1 || value === '1'
}

function normalizeCharacterList(list) {
  if (!Array.isArray(list)) return []
  return [...new Set(
    list
      .map((name) => String(name || '').trim())
      .filter(Boolean)
  )]
}

function normalizeTagList(list) {
  if (!Array.isArray(list)) return []
  return [...new Set(
    list
      .map((tag) => String(tag || '').trim())
      .filter(Boolean)
  )]
}

function mergeGoodsImages(existingImages, incomingImages, existingImage = '', incomingImage = '') {
  const merged = normalizeGoodsImageList(
    [...normalizeGoodsImageList(existingImages, existingImage), ...normalizeGoodsImageList(incomingImages, incomingImage)],
    existingImage || incomingImage
  )

  return merged.length > 0 ? merged : normalizeGoodsImageList([], existingImage || incomingImage)
}

function parseDeletedTime(value) {
  if (!value) return 0
  const timestamp = Date.parse(String(value))
  return Number.isFinite(timestamp) ? timestamp : 0
}

function parsePersistedList(raw) {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function readTrashLocal() {
  try {
    return parsePersistedList(localStorage.getItem(TRASH_STORAGE_KEY))
  } catch {
    return []
  }
}

function writeTrashLocal(list) {
  try {
    localStorage.setItem(TRASH_STORAGE_KEY, JSON.stringify(list))
  } catch {
    // ignore
  }
}

async function readPersistedTrash() {
  if (IS_NATIVE) {
    try {
      const { value } = await Preferences.get({ key: TRASH_STORAGE_KEY })
      if (value !== null) return parsePersistedList(value)
    } catch {
      // fall through
    }
  }

  return readTrashLocal()
}

async function writePersistedTrash(list) {
  writeTrashLocal(list)

  if (!IS_NATIVE) return

  try {
    await Preferences.set({
      key: TRASH_STORAGE_KEY,
      value: JSON.stringify(list)
    })
  } catch {
    // ignore
  }
}

export const useGoodsStore = defineStore('goods', () => {
  const list = shallowRef([])
  const trashList = shallowRef([])
  const isReady = ref(false)

  const listById = computed(() => new Map(list.value.map((item) => [item.id, item])))
  const trashById = computed(() => new Map(trashList.value.map((item) => [item.id, item])))
  const getById = computed(() => (id) => listById.value.get(id))
  const getTrashById = computed(() => (id) => trashById.value.get(id))
  const collectionList = computed(() => list.value.filter((item) => !item.isWishlist))
  const wishlistList = computed(() => list.value.filter((item) => item.isWishlist))
  const storageLocations = computed(() =>
    [...new Set(
      collectionList.value
        .map((item) => normalizeStorageLocationValue(item.storageLocation || ''))
        .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
  )
  const viewList = computed(() =>
    list.value.map((item) => {
      const quantityNumber = parseQuantity(item.quantity)
      const priceNumber = parseNumericPrice(item.price)

      return {
        ...item,
        isWishlist: normalizeWishlistFlag(item.isWishlist),
        sortId: String(item.id),
        acquiredTime: parseAcquiredTime(item.acquiredAt),
        timelineYearMonth: parseTimelineYearMonth(item.acquiredAt),
        priceNumber,
        quantityNumber,
        totalValueNumber: priceNumber * quantityNumber
      }
    })
  )
  const collectionViewList = computed(() => viewList.value.filter((item) => !item.isWishlist))
  const wishlistViewList = computed(() => viewList.value.filter((item) => item.isWishlist))
  const trashViewList = computed(() =>
    [...trashList.value]
      .map((item) => {
        const quantityNumber = parseQuantity(item.quantity)
        const priceNumber = parseNumericPrice(item.price)

        return {
          ...item,
          deletedTime: parseDeletedTime(item.deletedAt),
          acquiredTime: parseAcquiredTime(item.acquiredAt),
          priceNumber,
          quantityNumber,
          totalValueNumber: priceNumber * quantityNumber
        }
      })
      .sort((a, b) => b.deletedTime - a.deletedTime || b.acquiredTime - a.acquiredTime)
  )

  function normalizeGoodsInput(data, fallbackId = '') {
    const variant = getGoodsVariant(data)
    const images = normalizeGoodsImageList(data.images, data.image || data.coverImage)
    const coverImage = getPrimaryGoodsImageUrl(images, data.image || data.coverImage)

    return {
      id: data.id || fallbackId,
      name: normalizeGoodsName(data.name),
      category: String(data.category || '').trim(),
      ip: String(data.ip || '').trim(),
      isWishlist: normalizeWishlistFlag(data.isWishlist),
      characters: normalizeCharacterList(data.characters),
      tags: normalizeTagList(data.tags),
      storageLocation: normalizeStorageLocationValue(data.storageLocation || data.location || ''),
      variant,
      price: data.price === '' || data.price == null ? '' : data.price,
      points: data.points != null && data.points !== '' ? Number(data.points) : undefined,
      acquiredAt: String(data.acquiredAt || data.purchaseDate || '').trim(),
      coverImage,
      images,
      note: stripVariantFromNote(data.note || data.notes || ''),
      quantity: Math.max(1, Number(data.quantity) || 1)
    }
  }

  function normalizeTrashItem(data, fallbackId = '') {
    return {
      ...normalizeGoodsInput(data, fallbackId),
      deletedAt: String(data.deletedAt || new Date().toISOString()).trim()
    }
  }

  function mergeGoodsRecord(existing, incoming) {
    const variant = getGoodsVariant(existing) || getGoodsVariant(incoming)
    const images = mergeGoodsImages(existing.images, incoming.images, existing.coverImage, incoming.coverImage)

    return {
      ...existing,
      name: existing.name || incoming.name,
      category: existing.category || incoming.category,
      ip: existing.ip || incoming.ip,
      isWishlist: normalizeWishlistFlag(existing.isWishlist),
      characters: existing.characters?.length ? existing.characters : incoming.characters,
      tags: normalizeTagList([...(existing.tags || []), ...(incoming.tags || [])]),
      storageLocation: existing.storageLocation || incoming.storageLocation,
      variant,
      price: existing.price === '' || existing.price == null ? incoming.price : existing.price,
      points: existing.points ?? incoming.points,
      acquiredAt: existing.acquiredAt || incoming.acquiredAt,
      coverImage: getPrimaryGoodsImageUrl(images, existing.coverImage || incoming.coverImage),
      images,
      note: stripVariantFromNote(existing.note || '') || stripVariantFromNote(incoming.note || ''),
      quantity: Math.max(1, Number(existing.quantity) || 1) + Math.max(1, Number(incoming.quantity) || 1)
    }
  }

  async function persistTrash() {
    await writePersistedTrash(trashList.value)
  }

  async function init() {
    list.value = (await getItems()).map((item) => normalizeGoodsInput(item, item.id))
    trashList.value = (await readPersistedTrash()).map((item) => normalizeTrashItem(item, item.id))
    isReady.value = true
  }

  async function addGoods(data) {
    const incoming = normalizeGoodsInput(data, String(Date.now()))
    const key = buildGoodsIdentityKey(incoming)
    const existingIndex = list.value.findIndex((item) =>
      item.isWishlist === incoming.isWishlist && buildGoodsIdentityKey(item) === key
    )

    if (existingIndex !== -1) {
      list.value[existingIndex] = mergeGoodsRecord(list.value[existingIndex], incoming)
    triggerRef(list)
      await addItem(list.value[existingIndex])
      return list.value[existingIndex]
    }

    list.value.unshift(incoming)
    triggerRef(list)
    await addItem(incoming)
    return incoming
  }

  async function updateGoods(id, data) {
    const idx = list.value.findIndex((item) => item.id === id)
    if (idx === -1) return

    list.value[idx] = normalizeGoodsInput({ ...list.value[idx], ...data, id }, id)
    triggerRef(list)
    await addItem(list.value[idx])
  }

  async function updateMultipleGoods(ids, data) {
    let changed = false
    list.value = list.value.map((item) => {
      if (!ids.has(item.id)) return item
      changed = true
      return normalizeGoodsInput({ ...item, ...data, id: item.id }, item.id)
    })

    if (changed) {
      const updatedItems = list.value.filter(item => ids.has(item.id))
      await saveItems(updatedItems)
    }
  }

  async function removeGoods(id) {
    const item = list.value.find((entry) => entry.id === id)
    if (!item) return

    trashList.value.unshift(normalizeTrashItem(item, item.id))
    triggerRef(trashList)
    list.value = list.value.filter((entry) => entry.id !== id)
    await Promise.all([
      deleteItems([id]),
      persistTrash()
    ])
  }

  async function removeMultipleGoods(ids) {
    const removedItems = list.value
      .filter((item) => ids.has(item.id))
      .map((item) => normalizeTrashItem(item, item.id))

    if (removedItems.length === 0) return

    trashList.value = [...removedItems, ...trashList.value]
    list.value = list.value.filter((item) => !ids.has(item.id))
    await Promise.all([
      deleteItems(Array.from(ids)),
      persistTrash()
    ])
  }

  async function restoreTrashItem(id) {
    const item = trashList.value.find((entry) => entry.id === id)
    if (!item) return null

    const restored = normalizeGoodsInput(item, item.id)
    if (list.value.some((entry) => entry.id === restored.id)) {
      restored.id = String(Date.now())
    }

    list.value.unshift(restored)
    triggerRef(list)
    trashList.value = trashList.value.filter((entry) => entry.id !== id)
    await Promise.all([
      addItem(restored),
      persistTrash()
    ])
    return restored
  }

  async function deleteTrashItem(id) {
    const next = trashList.value.filter((entry) => entry.id !== id)
    if (next.length === trashList.value.length) return

    trashList.value = next
    await persistTrash()
  }

  async function emptyTrash() {
    if (trashList.value.length === 0) return
    trashList.value = []
    await persistTrash()
  }

  async function replaceCategoryName(oldName, newName) {
    const previous = String(oldName || '').trim()
    const next = String(newName || '').trim()
    if (!previous || !next || previous === next) return

    let trashChanged = false
    const updatedItems = []

    list.value = list.value.map((item) => {
      if (item.category !== previous) return item
      const updated = { ...item, category: next }
      updatedItems.push(updated)
      return updated
    })

    trashList.value = trashList.value.map((item) => {
      if (item.category !== previous) return item
      trashChanged = true
      return {
        ...item,
        category: next
      }
    })

    await Promise.all([
      updatedItems.length > 0 ? saveItems(updatedItems) : Promise.resolve(),
      trashChanged ? persistTrash() : Promise.resolve()
    ])
  }

  async function replaceIpName(oldName, newName) {
    const previous = String(oldName || '').trim()
    const next = String(newName || '').trim()
    if (!previous || !next || previous === next) return

    let trashChanged = false
    const updatedItems = []

    list.value = list.value.map((item) => {
      if (item.ip !== previous) return item
      const updated = { ...item, ip: next }
      updatedItems.push(updated)
      return updated
    })

    trashList.value = trashList.value.map((item) => {
      if (item.ip !== previous) return item
      trashChanged = true
      return {
        ...item,
        ip: next
      }
    })

    await Promise.all([
      updatedItems.length > 0 ? saveItems(updatedItems) : Promise.resolve(),
      trashChanged ? persistTrash() : Promise.resolve()
    ])
  }

  async function replaceCharacterName(oldName, newName) {
    const previous = String(oldName || '').trim()
    const next = String(newName || '').trim()
    if (!previous || !next || previous === next) return

    let trashChanged = false
    const updatedItems = []

    list.value = list.value.map((item) => {
      if (!item.characters?.includes(previous)) return item
      const updated = {
        ...item,
        characters: normalizeCharacterList(
          item.characters.map((character) => (character === previous ? next : character))
        )
      }
      updatedItems.push(updated)
      return updated
    })

    trashList.value = trashList.value.map((item) => {
      if (!item.characters?.includes(previous)) return item
      trashChanged = true
      return {
        ...item,
        characters: normalizeCharacterList(
          item.characters.map((character) => (character === previous ? next : character))
        )
      }
    })

    await Promise.all([
      updatedItems.length > 0 ? saveItems(updatedItems) : Promise.resolve(),
      trashChanged ? persistTrash() : Promise.resolve()
    ])
  }

  async function syncCharacterIp(name, nextIp, previousIp = '') {
    const characterName = String(name || '').trim()
    const currentIp = String(previousIp || '').trim()
    const targetIp = String(nextIp || '').trim()
    if (!characterName || currentIp === targetIp) return

    let trashChanged = false
    const updatedItems = []

    const shouldSyncItem = (item) => {
      if (!item.characters?.includes(characterName)) return false
      const itemIp = String(item.ip || '').trim()
      return itemIp === currentIp || (!itemIp && targetIp)
    }

    list.value = list.value.map((item) => {
      if (!shouldSyncItem(item)) return item
      const updated = { ...item, ip: targetIp }
      updatedItems.push(updated)
      return updated
    })

    trashList.value = trashList.value.map((item) => {
      if (!shouldSyncItem(item)) return item
      trashChanged = true
      return {
        ...item,
        ip: targetIp
      }
    })

    await Promise.all([
      updatedItems.length > 0 ? saveItems(updatedItems) : Promise.resolve(),
      trashChanged ? persistTrash() : Promise.resolve()
    ])
  }

  async function replaceStorageLocationPrefix(oldPrefix, newPrefix) {
    const normalizedOldPrefix = normalizeStorageLocationValue(oldPrefix)
    const normalizedNewPrefix = normalizeStorageLocationValue(newPrefix)
    if (!normalizedOldPrefix || normalizedOldPrefix === normalizedNewPrefix) return

    const updatedItems = []
    list.value = list.value.map((item) => {
      const nextLocation = replaceStorageLocationPathPrefix(
        item.storageLocation,
        normalizedOldPrefix,
        normalizedNewPrefix
      )

      if (nextLocation === item.storageLocation) return item
      const updated = { ...item, storageLocation: nextLocation }
      updatedItems.push(updated)
      return updated
    })

    if (updatedItems.length > 0) {
      await saveItems(updatedItems)
    }
  }

  async function clearStorageLocationPrefix(prefix) {
    const normalizedPrefix = normalizeStorageLocationValue(prefix)
    if (!normalizedPrefix) return

    const updatedItems = []
    list.value = list.value.map((item) => {
      if (!isStorageLocationUnderPrefix(item.storageLocation, normalizedPrefix)) {
        return item
      }

      const updated = { ...item, storageLocation: '' }
      updatedItems.push(updated)
      return updated
    })

    if (updatedItems.length > 0) {
      await saveItems(updatedItems)
    }
  }

  async function addMultipleGoods(items) {
    const now = Date.now()
    const existingItems = [...list.value]
    const buildScopedKey = (item) => `${item.isWishlist ? 1 : 0}::${buildGoodsIdentityKey(item)}`
    const existingKeyToIndex = new Map(
      existingItems.map((item, index) => [buildScopedKey(item), index])
    )
    const newItems = []
    const newKeyToIndex = new Map()
    const changedExistingIds = new Set()

    items.forEach((rawItem, index) => {
      const clean = Object.fromEntries(
        Object.entries(rawItem).filter(([key]) => !key.startsWith('_'))
      )
      const normalized = normalizeGoodsInput(clean, String(now + index))
      const key = buildScopedKey(normalized)

      if (existingKeyToIndex.has(key)) {
        const existingIndex = existingKeyToIndex.get(key)
        existingItems[existingIndex] = mergeGoodsRecord(existingItems[existingIndex], normalized)
        changedExistingIds.add(existingItems[existingIndex].id)
        return
      }

      if (newKeyToIndex.has(key)) {
        const newIndex = newKeyToIndex.get(key)
        newItems[newIndex] = mergeGoodsRecord(newItems[newIndex], normalized)
        return
      }

      newKeyToIndex.set(key, newItems.length)
      newItems.push(normalized)
    })

    list.value = [...newItems, ...existingItems]
    await saveItems([
      ...newItems,
      ...existingItems.filter((item) => changedExistingIds.has(item.id))
    ])
  }

  async function refreshList() {
    list.value = (await getItems()).map((item) => normalizeGoodsInput(item, item.id))
  }

  async function importGoodsBackup(items) {
    const existingIds = new Set(list.value.map((item) => item.id))
    const newItems = items
      .filter((item) => item.id && !existingIds.has(item.id))
      .map((item) => normalizeGoodsInput(item, item.id))

    if (newItems.length === 0) return 0

    list.value = [...newItems, ...list.value]

    await saveItems(newItems)
    return newItems.length
  }

  async function importTrashBackup(items) {
    if (!Array.isArray(items) || items.length === 0) return 0

    const existingIds = new Set(trashList.value.map((item) => item.id))
    const newItems = items
      .filter((item) => item.id && !existingIds.has(item.id))
      .map((item) => normalizeTrashItem(item, item.id))

    if (newItems.length === 0) return 0

    trashList.value = [...newItems, ...trashList.value]
    await persistTrash()
    return newItems.length
  }

  return {
    list,
    trashList,
    collectionList,
    wishlistList,
    viewList,
    collectionViewList,
    wishlistViewList,
    trashViewList,
    storageLocations,
    isReady,
    getById,
    getTrashById,
    init,
    addGoods,
    updateGoods,
    updateMultipleGoods,
    removeGoods,
    removeMultipleGoods,
    restoreTrashItem,
    deleteTrashItem,
    emptyTrash,
    replaceCategoryName,
    replaceIpName,
    replaceCharacterName,
    syncCharacterIp,
    replaceStorageLocationPrefix,
    clearStorageLocationPrefix,
    addMultipleGoods,
    importGoodsBackup,
    importTrashBackup,
    refreshList
  }
})
