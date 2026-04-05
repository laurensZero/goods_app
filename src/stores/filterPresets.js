import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { normalizeGoodsFilterConditions } from '@/utils/goodsFilters'
import { parseJsonArray } from '@/utils/parseJsonArray'

const STORAGE_KEY = 'goods_filter_presets'
const IS_NATIVE = Capacitor.isNativePlatform()

function readLocal() {
  try {
    return parseJsonArray(localStorage.getItem(STORAGE_KEY))
  } catch {
    return []
  }
}

function writeLocal(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // ignore
  }
}

async function readPersistedPresets() {
  if (IS_NATIVE) {
    try {
      const { value } = await Preferences.get({ key: STORAGE_KEY })
      if (value !== null) return parseJsonArray(value)
    } catch {
      // fall through to local storage
    }
  }

  return readLocal()
}

async function writePersistedPresets(list) {
  writeLocal(list)

  if (!IS_NATIVE) return

  try {
    await Preferences.set({
      key: STORAGE_KEY,
      value: JSON.stringify(list)
    })
  } catch {
    // ignore
  }
}

function normalizePresetScope(scope) {
  return scope === 'wishlist' ? 'wishlist' : 'collection'
}

function normalizeFilterPreset(item) {
  const now = Date.now()

  return {
    id: String(item?.id || `filter_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`),
    name: String(item?.name || '').trim(),
    scope: normalizePresetScope(item?.scope),
    conditions: normalizeGoodsFilterConditions(item?.conditions),
    createdAt: Number(item?.createdAt) || now,
    updatedAt: Number(item?.updatedAt) || now
  }
}

export const useFilterPresetsStore = defineStore('filterPresets', () => {
  const presets = ref([])
  const isReady = ref(false)

  const sortedPresets = computed(() =>
    [...presets.value].sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
  )

  async function persist() {
    await writePersistedPresets(presets.value)
  }

  async function init() {
    presets.value = (await readPersistedPresets())
      .map((item) => normalizeFilterPreset(item))
      .filter((item) => item.name)
    isReady.value = true
  }

  function getPresetsByScope(scope = 'collection') {
    const normalizedScope = normalizePresetScope(scope)
    return sortedPresets.value.filter((item) => item.scope === normalizedScope)
  }

  async function savePreset(payload) {
    const normalized = normalizeFilterPreset(payload)
    if (!normalized.name) return null

    const index = presets.value.findIndex((item) => item.id === normalized.id)

    if (index !== -1) {
      presets.value[index] = {
        ...presets.value[index],
        name: normalized.name,
        scope: normalized.scope,
        conditions: normalized.conditions,
        updatedAt: Date.now()
      }
    } else {
      presets.value.unshift(normalized)
    }

    await persist()
    return presets.value.find((item) => item.id === normalized.id) || normalized
  }

  async function removePreset(id) {
    const next = presets.value.filter((item) => item.id !== id)
    if (next.length === presets.value.length) return
    presets.value = next
    await persist()
  }

  return {
    presets,
    sortedPresets,
    isReady,
    init,
    getPresetsByScope,
    savePreset,
    removePreset
  }
})
