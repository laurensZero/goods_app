import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePresetsStore } from '@/stores/presets'
import { useFilterPresetsStore } from '@/stores/filterPresets'
import {
  createDefaultGoodsFilters,
  normalizeGoodsFilterConditions,
  countActiveGoodsFilters,
  filterGoodsList,
  GOODS_FILTER_SPECIAL_VALUES,
  GOODS_FILTER_DATE_PRESET_OPTIONS
} from '@/utils/goods/filters'
import { normalizeStorageLocationValue, splitStorageLocationPath, buildStorageLocationPath } from '@/utils/storageLocations'

function buildOptionList(values, specialOption = null) {
  const base = [...new Set(values.map((item) => String(item || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
    .map((value) => ({ label: value, value }))

  return specialOption ? [specialOption, ...base] : base
}

export function useGoodsSearch(sourceList, { scope = 'collection' } = {}) {
  const { t } = useI18n()
  const presets = usePresetsStore()
  const filterPresetsStore = useFilterPresetsStore()

  // --- Filter state ---
  const filters = reactive(createDefaultGoodsFilters({ hasImage: 'any' }))
  const debouncedKeyword = ref('')
  const activePresetId = ref('')
  const activePresetName = ref('')

  // --- Keyword debounce ---
  let searchTimeout = null

  watch(
    () => filters.keyword,
    (value) => {
      if (searchTimeout) clearTimeout(searchTimeout)
      searchTimeout = setTimeout(() => {
        debouncedKeyword.value = String(value || '').trim().toLowerCase()
      }, 180)
    },
    { immediate: true }
  )

  // --- Normalized filters (merges live filters + debounced keyword) ---
  const normalizedFilters = computed(() =>
    normalizeGoodsFilterConditions({
      ...filters,
      keyword: debouncedKeyword.value
    })
  )

  // --- Filtered list: zero overhead when no filters active ---
  const activeFilterCount = computed(() => countActiveGoodsFilters(filters))
  const isFiltering = computed(() => activeFilterCount.value > 0)

  const filteredItems = computed(() =>
    isFiltering.value
      ? filterGoodsList(sourceList.value, normalizedFilters.value)
      : sourceList.value
  )

  // --- Option lists (derived from sourceList, NOT filteredItems) ---
  const categoryOptions = computed(() => buildOptionList(
    sourceList.value.map((item) => item.category),
    sourceList.value.some((item) => !String(item.category || '').trim())
      ? { label: t('search.uncategorized'), value: GOODS_FILTER_SPECIAL_VALUES.uncategorized }
      : null
  ))

  const ipOptions = computed(() => buildOptionList(
    sourceList.value.map((item) => item.ip),
    sourceList.value.some((item) => !String(item.ip || '').trim())
      ? { label: t('search.noIp'), value: GOODS_FILTER_SPECIAL_VALUES.noIp }
      : null
  ))

  const characterSourceList = computed(() => {
    if (filters.ips.length === 0) return sourceList.value

    return sourceList.value.filter((item) => {
      const itemIp = String(item.ip || '').trim()
      return filters.ips.some((value) => (
        value === GOODS_FILTER_SPECIAL_VALUES.noIp ? !itemIp : value === itemIp
      ))
    })
  })

  const characterOptions = computed(() => buildOptionList(
    characterSourceList.value.flatMap((item) => (Array.isArray(item.characters) ? item.characters : [])),
    characterSourceList.value.some((item) => !Array.isArray(item.characters) || item.characters.length === 0)
      ? { label: t('search.noCharacter'), value: GOODS_FILTER_SPECIAL_VALUES.noCharacter }
      : null
  ))

  const showAllCharacterOptions = ref(false)

  const hasCollapsedCharacterOptions = computed(() => (
    characterOptions.value.some((option) => option.value !== GOODS_FILTER_SPECIAL_VALUES.noCharacter)
  ))

  const visibleCharacterOptions = computed(() => {
    if (showAllCharacterOptions.value) return characterOptions.value

    return characterOptions.value.filter((option) => (
      option.value === GOODS_FILTER_SPECIAL_VALUES.noCharacter
    ))
  })

  // Auto-expand when a non-special character is selected
  watch(
    () => filters.characters.slice(),
    (selectedValues) => {
      if (selectedValues.some((value) => value !== GOODS_FILTER_SPECIAL_VALUES.noCharacter)) {
        showAllCharacterOptions.value = true
      }
    },
    { immediate: true }
  )

  // Remove invalid character selections when options change
  watch(
    () => characterOptions.value.map((option) => option.value),
    (nextOptions) => {
      const allowedValues = new Set(nextOptions)
      const nextCharacters = filters.characters.filter((value) => allowedValues.has(value))

      if (nextCharacters.length !== filters.characters.length) {
        filters.characters = nextCharacters
      }
    },
    { immediate: true }
  )

  // --- Storage location tree with item counts ---
  const hasUnassignedStorageLocation = computed(() => (
    sourceList.value.some((item) => !normalizeStorageLocationValue(item.storageLocation))
  ))

  const storageLocationCounts = computed(() => {
    const counts = new Map()

    for (const item of sourceList.value) {
      const normalizedPath = normalizeStorageLocationValue(item.storageLocation)
      if (!normalizedPath) continue

      const pathParts = []
      for (const part of splitStorageLocationPath(normalizedPath)) {
        pathParts.push(part)
        const currentPath = buildStorageLocationPath(pathParts)
        counts.set(currentPath, (counts.get(currentPath) || 0) + 1)
      }
    }

    return counts
  })

  const storageLocationTree = computed(() => {
    const attachCounts = (nodes = []) => nodes.map((node) => ({
      name: node.name,
      path: node.path,
      depth: Math.max(0, Number(node.depth || 1) - 1),
      itemCount: storageLocationCounts.value.get(node.path) || 0,
      children: attachCounts(node.children || [])
    }))

    return attachCounts(presets.storageLocationTree)
  })

  // --- Preset operations ---
  const searchPresets = computed(() => filterPresetsStore.getPresetsByScope(scope))

  function applyPreset(preset) {
    assignFilters(preset.conditions)
    activePresetId.value = preset.id
    activePresetName.value = preset.name
  }

  async function saveNewPreset(name) {
    const trimmed = String(name || '').trim()
    if (!trimmed || activeFilterCount.value <= 0) return null

    const saved = await filterPresetsStore.savePreset({
      name: trimmed,
      scope,
      conditions: normalizeGoodsFilterConditions(filters)
    })

    if (!saved) return null

    activePresetId.value = saved.id
    activePresetName.value = saved.name
    return saved
  }

  async function updateActivePreset() {
    if (!activePresetId.value || activeFilterCount.value <= 0) return null

    const saved = await filterPresetsStore.savePreset({
      id: activePresetId.value,
      name: activePresetName.value,
      scope,
      conditions: normalizeGoodsFilterConditions(filters)
    })

    if (!saved) return null

    activePresetId.value = saved.id
    activePresetName.value = saved.name
    return saved
  }

  async function removePreset(id) {
    if (activePresetId.value === id) {
      activePresetId.value = ''
      activePresetName.value = ''
    }

    await filterPresetsStore.removePreset(id)
  }

  function resetFilters() {
    assignFilters(createDefaultGoodsFilters({ hasImage: 'any' }))
    activePresetId.value = ''
    activePresetName.value = ''
  }

  // --- Helper functions ---
  function toggleFilterValue(key, value) {
    const current = Array.isArray(filters[key]) ? [...filters[key]] : []
    filters[key] = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value]
  }

  function assignFilters(nextFilters) {
    const normalized = normalizeGoodsFilterConditions({
      ...nextFilters,
      hasImage: 'any'
    })
    Object.assign(filters, normalized)
    debouncedKeyword.value = normalized.keyword.toLowerCase()
  }

  function formatPresetSummary(conditions) {
    const normalized = normalizeGoodsFilterConditions({
      ...conditions,
      hasImage: 'any'
    })
    const segments = []

    if (normalized.categories.length) segments.push(normalized.categories.slice(0, 2).join(' / '))
    if (normalized.ips.length) segments.push(normalized.ips.slice(0, 2).join(' / '))
    if (normalized.storageLocations.length) segments.push(normalized.storageLocations[0])
    if (normalized.priceMin !== '' || normalized.priceMax !== '') {
      segments.push(`¥${normalized.priceMin || '0'} - ${normalized.priceMax || t('search.noLimit')}`)
    }
    if (normalized.acquiredPreset !== 'all') {
      const preset = GOODS_FILTER_DATE_PRESET_OPTIONS.find((item) => item.value === normalized.acquiredPreset)
      if (preset) segments.push(preset.label)
    }

    return segments.length ? segments.slice(0, 3).join(' · ') : t('search.onlyKeywordsOrBasic')
  }

  // --- Return ---
  return {
    // State
    filters,
    debouncedKeyword,
    activePresetId,
    activePresetName,

    // Derived
    normalizedFilters,
    activeFilterCount,
    isFiltering,
    filteredItems,

    // Option lists
    categoryOptions,
    ipOptions,
    characterSourceList,
    characterOptions,
    showAllCharacterOptions,
    hasCollapsedCharacterOptions,
    visibleCharacterOptions,
    hasUnassignedStorageLocation,
    storageLocationTree,

    // Preset operations
    searchPresets,
    applyPreset,
    saveNewPreset,
    updateActivePreset,
    removePreset,
    resetFilters,

    // Helpers
    toggleFilterValue,
    assignFilters,
    formatPresetSummary
  }
}
