import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getItems, addItem, saveItems } from '@/utils/db'
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

function normalizeCharacterList(list) {
  if (!Array.isArray(list)) return []
  return [...new Set(
    list
      .map((name) => String(name || '').trim())
      .filter(Boolean)
  )]
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
  const list = ref([])
  const trashList = ref([])
  const isReady = ref(false)

  const getById = computed(() => (id) => list.value.find((item) => item.id === id))
  const getTrashById = computed(() => (id) => trashList.value.find((item) => item.id === id))
  const storageLocations = computed(() =>
    [...new Set(
      list.value
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
        sortId: String(item.id),
        acquiredTime: parseAcquiredTime(item.acquiredAt),
        timelineYearMonth: parseTimelineYearMonth(item.acquiredAt),
        priceNumber,
        quantityNumber,
        totalValueNumber: priceNumber * quantityNumber
      }
    })
  )
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

    return {
      id: data.id || fallbackId,
      name: normalizeGoodsName(data.name),
      category: String(data.category || '').trim(),
      ip: String(data.ip || '').trim(),
      characters: Array.isArray(data.characters) ? data.characters.filter(Boolean) : [],
      storageLocation: normalizeStorageLocationValue(data.storageLocation || data.location || ''),
      variant,
      price: data.price === '' || data.price == null ? '' : data.price,
      points: data.points != null && data.points !== '' ? Number(data.points) : undefined,
      acquiredAt: String(data.acquiredAt || data.purchaseDate || '').trim(),
      image: String(data.image || '').trim(),
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

    return {
      ...existing,
      name: existing.name || incoming.name,
      category: existing.category || incoming.category,
      ip: existing.ip || incoming.ip,
      characters: existing.characters?.length ? existing.characters : incoming.characters,
      storageLocation: existing.storageLocation || incoming.storageLocation,
      variant,
      price: existing.price === '' || existing.price == null ? incoming.price : existing.price,
      points: existing.points ?? incoming.points,
      acquiredAt: existing.acquiredAt || incoming.acquiredAt,
      image: existing.image || incoming.image,
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
    const existingIndex = list.value.findIndex((item) => buildGoodsIdentityKey(item) === key)

    if (existingIndex !== -1) {
      list.value[existingIndex] = mergeGoodsRecord(list.value[existingIndex], incoming)
      await addItem(list.value[existingIndex])
      return list.value[existingIndex]
    }

    list.value.unshift(incoming)
    await addItem(incoming)
    return incoming
  }

  async function updateGoods(id, data) {
    const idx = list.value.findIndex((item) => item.id === id)
    if (idx === -1) return

    list.value[idx] = normalizeGoodsInput({ ...list.value[idx], ...data, id }, id)
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
      await saveItems(list.value)
    }
  }

  async function removeGoods(id) {
    const item = list.value.find((entry) => entry.id === id)
    if (!item) return

    trashList.value.unshift(normalizeTrashItem(item, item.id))
    list.value = list.value.filter((entry) => entry.id !== id)
    await Promise.all([
      saveItems(list.value),
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
      saveItems(list.value),
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
    trashList.value = trashList.value.filter((entry) => entry.id !== id)
    await Promise.all([
      saveItems(list.value),
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

    let listChanged = false
    let trashChanged = false

    list.value = list.value.map((item) => {
      if (item.category !== previous) return item
      listChanged = true
      return {
        ...item,
        category: next
      }
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
      listChanged ? saveItems(list.value) : Promise.resolve(),
      trashChanged ? persistTrash() : Promise.resolve()
    ])
  }

  async function replaceIpName(oldName, newName) {
    const previous = String(oldName || '').trim()
    const next = String(newName || '').trim()
    if (!previous || !next || previous === next) return

    let listChanged = false
    let trashChanged = false

    list.value = list.value.map((item) => {
      if (item.ip !== previous) return item
      listChanged = true
      return {
        ...item,
        ip: next
      }
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
      listChanged ? saveItems(list.value) : Promise.resolve(),
      trashChanged ? persistTrash() : Promise.resolve()
    ])
  }

  async function replaceCharacterName(oldName, newName) {
    const previous = String(oldName || '').trim()
    const next = String(newName || '').trim()
    if (!previous || !next || previous === next) return

    let listChanged = false
    let trashChanged = false

    list.value = list.value.map((item) => {
      if (!item.characters?.includes(previous)) return item
      listChanged = true
      return {
        ...item,
        characters: normalizeCharacterList(
          item.characters.map((character) => (character === previous ? next : character))
        )
      }
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
      listChanged ? saveItems(list.value) : Promise.resolve(),
      trashChanged ? persistTrash() : Promise.resolve()
    ])
  }

  async function syncCharacterIp(name, nextIp, previousIp = '') {
    const characterName = String(name || '').trim()
    const currentIp = String(previousIp || '').trim()
    const targetIp = String(nextIp || '').trim()
    if (!characterName || currentIp === targetIp) return

    let listChanged = false
    let trashChanged = false

    const shouldSyncItem = (item) => {
      if (!item.characters?.includes(characterName)) return false
      const itemIp = String(item.ip || '').trim()
      return itemIp === currentIp || (!itemIp && targetIp)
    }

    list.value = list.value.map((item) => {
      if (!shouldSyncItem(item)) return item
      listChanged = true
      return {
        ...item,
        ip: targetIp
      }
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
      listChanged ? saveItems(list.value) : Promise.resolve(),
      trashChanged ? persistTrash() : Promise.resolve()
    ])
  }

  async function replaceStorageLocationPrefix(oldPrefix, newPrefix) {
    const normalizedOldPrefix = normalizeStorageLocationValue(oldPrefix)
    const normalizedNewPrefix = normalizeStorageLocationValue(newPrefix)
    if (!normalizedOldPrefix || normalizedOldPrefix === normalizedNewPrefix) return

    let changed = false
    list.value = list.value.map((item) => {
      const nextLocation = replaceStorageLocationPathPrefix(
        item.storageLocation,
        normalizedOldPrefix,
        normalizedNewPrefix
      )

      if (nextLocation === item.storageLocation) return item
      changed = true
      return {
        ...item,
        storageLocation: nextLocation
      }
    })

    if (changed) {
      await saveItems(list.value)
    }
  }

  async function clearStorageLocationPrefix(prefix) {
    const normalizedPrefix = normalizeStorageLocationValue(prefix)
    if (!normalizedPrefix) return

    let changed = false
    list.value = list.value.map((item) => {
      if (!isStorageLocationUnderPrefix(item.storageLocation, normalizedPrefix)) {
        return item
      }

      changed = true
      return {
        ...item,
        storageLocation: ''
      }
    })

    if (changed) {
      await saveItems(list.value)
    }
  }

  async function addMultipleGoods(items) {
    const now = Date.now()
    const existingItems = [...list.value]
    const existingKeyToIndex = new Map(
      existingItems.map((item, index) => [buildGoodsIdentityKey(item), index])
    )
    const newItems = []
    const newKeyToIndex = new Map()

    items.forEach((rawItem, index) => {
      const clean = Object.fromEntries(
        Object.entries(rawItem).filter(([key]) => !key.startsWith('_'))
      )
      const normalized = normalizeGoodsInput(clean, String(now + index))
      const key = buildGoodsIdentityKey(normalized)

      if (existingKeyToIndex.has(key)) {
        const existingIndex = existingKeyToIndex.get(key)
        existingItems[existingIndex] = mergeGoodsRecord(existingItems[existingIndex], normalized)
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
    await saveItems(list.value)
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

    for (let i = newItems.length - 1; i >= 0; i--) {
      list.value.unshift(newItems[i])
    }

    await saveItems(list.value)
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
    viewList,
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
