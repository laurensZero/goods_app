import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getItems, addItem, saveItems } from '@/utils/db'
import {
  buildGoodsIdentityKey,
  getGoodsVariant,
  normalizeGoodsName,
  stripVariantFromNote
} from '@/utils/goodsIdentity'

export const useGoodsStore = defineStore('goods', () => {
  const list = ref([])
  const isReady = ref(false)

  const getById = computed(() => (id) => list.value.find((item) => item.id === id))

  function normalizeGoodsInput(data, fallbackId = '') {
    const variant = getGoodsVariant(data)

    return {
      id: data.id || fallbackId,
      name: normalizeGoodsName(data.name),
      category: String(data.category || '').trim(),
      ip: String(data.ip || '').trim(),
      characters: Array.isArray(data.characters) ? data.characters.filter(Boolean) : [],
      variant,
      price: data.price === '' || data.price == null ? '' : data.price,
      acquiredAt: String(data.acquiredAt || data.purchaseDate || '').trim(),
      image: String(data.image || '').trim(),
      note: stripVariantFromNote(data.note || data.notes || ''),
      quantity: Math.max(1, Number(data.quantity) || 1),
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
      variant,
      price: existing.price === '' || existing.price == null ? incoming.price : existing.price,
      acquiredAt: existing.acquiredAt || incoming.acquiredAt,
      image: existing.image || incoming.image,
      note: stripVariantFromNote(existing.note || '') || stripVariantFromNote(incoming.note || ''),
      quantity: Math.max(1, Number(existing.quantity) || 1) + Math.max(1, Number(incoming.quantity) || 1),
    }
  }

  async function init() {
    list.value = await getItems()
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
    list.value = list.value.filter((item) => item.id !== id)
    await saveItems(list.value)
  }

  async function removeMultipleGoods(ids) {
    list.value = list.value.filter((item) => !ids.has(item.id))
    await saveItems(list.value)
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
    list.value = await getItems()
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

  return {
    list,
    isReady,
    getById,
    init,
    addGoods,
    updateGoods,
    updateMultipleGoods,
    removeGoods,
    removeMultipleGoods,
    addMultipleGoods,
    importGoodsBackup,
    refreshList
  }
})
