import { computed, onScopeDispose, reactive, ref, watch } from 'vue'
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
import { normalizeStorageLocationValue, splitStorageLocationPath, buildStorageLocationPath } from '@/utils/storage/storageLocations'
import { writePersisted } from '@/utils/platform/storage'

// 关键词匹配偏好（拼音/大小写/备注）跨会话记住上次选择
const MATCH_PREFS_KEY = 'goods_search_match_prefs'

function buildOptionList(values, specialOption = null) {
  const base = [...new Set(values.map((item) => String(item || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
    .map((value) => ({ label: value, value }))

  return specialOption ? [specialOption, ...base] : base
}

// 分类筛选项按 presets.categories 的自定义顺序排列（与编辑/导入时选择分类一致）
// 「其他」永远垫底；不在预设里的分类按字母序放在「其他」之前
function buildCategoryOptionList(values, orderedCatalog, specialOption = null) {
  const OTHER = '其他'
  const present = new Set(values.map((item) => String(item || '').trim()).filter(Boolean))

  const orderedNames = []
  const seen = new Set()

  for (const raw of orderedCatalog) {
    const name = String(raw || '').trim()
    if (!name || name === OTHER || seen.has(name) || !present.has(name)) continue
    orderedNames.push(name)
    seen.add(name)
  }

  const extras = [...present]
    .filter((name) => name !== OTHER && !seen.has(name))
    .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))

  const ordered = [
    ...orderedNames,
    ...extras,
    ...(present.has(OTHER) ? [OTHER] : [])
  ].map((value) => ({ label: value, value }))

  return specialOption ? [specialOption, ...ordered] : ordered
}

function readMatchPrefsSync() {
  try {
    const raw = localStorage.getItem(MATCH_PREFS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return {
      matchPinyin: typeof parsed.matchPinyin === 'boolean' ? parsed.matchPinyin : undefined,
      matchCase: typeof parsed.matchCase === 'boolean' ? parsed.matchCase : undefined,
      includeNote: typeof parsed.includeNote === 'boolean' ? parsed.includeNote : undefined
    }
  } catch {
    return null
  }
}

export function useGoodsSearch(sourceList, { scope = 'collection' } = {}) {
  const { t } = useI18n()
  const presets = usePresetsStore()
  const filterPresetsStore = useFilterPresetsStore()

  // --- Filter state ---
  const savedMatchPrefs = readMatchPrefsSync() || {}
  const filters = reactive(createDefaultGoodsFilters({
    hasImage: 'any',
    ...savedMatchPrefs
  }))
  const debouncedKeyword = ref('')
  const activePresetId = ref('')
  const activePresetName = ref('')

  // 关键字真防抖：避免每个按键都触发全表过滤 + 重排
  // 区分大小写时保留原始大小写，否则统一小写
  let keywordDebounceTimer = 0

  function commitKeyword(value) {
    const trimmed = String(value || '').trim()
    debouncedKeyword.value = filters.matchCase ? trimmed : trimmed.toLowerCase()
  }

  function scheduleKeywordCommit(value) {
    clearTimeout(keywordDebounceTimer)
    keywordDebounceTimer = setTimeout(() => {
      commitKeyword(value)
    }, 250)
  }

  watch(
    () => filters.keyword,
    (value) => scheduleKeywordCommit(value)
  )

  // 切换大小写匹配时立刻按新规则重算 keyword（防抖已提交的会被覆盖）
  watch(
    () => filters.matchCase,
    () => {
      clearTimeout(keywordDebounceTimer)
      commitKeyword(filters.keyword)
    }
  )

  // 持久化匹配偏好
  watch(
    () => [filters.matchPinyin, filters.matchCase, filters.includeNote],
    ([matchPinyin, matchCase, includeNote]) => {
      const payload = JSON.stringify({ matchPinyin, matchCase, includeNote })
      try {
        localStorage.setItem(MATCH_PREFS_KEY, payload)
      } catch {
        // ignore
      }
      writePersisted(MATCH_PREFS_KEY, payload)
    }
  )

  onScopeDispose(() => {
    clearTimeout(keywordDebounceTimer)
  })

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
  const categoryOptions = computed(() => buildCategoryOptionList(
    sourceList.value.map((item) => item.category),
    presets.categories,
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

  // --- Custom field filter groups (select 型；值来自条目实际填写 + 预设选项顺序) ---
  const customFieldDefs = computed(() => (
    Array.isArray(presets.customFieldDefs) ? presets.customFieldDefs : []
  ))

  /**
   * 每个 select 型自定义字段一组 chip：
   * - 只列出「源列表里真的出现过」的值（与分类/IP 筛选一致，避免选了必然 0 结果）
   * - 已选中但源列表已无匹配的值也保留，否则用户看不到、也取消不掉
   * - 顺序按预设 options，未登记的值按字母序垫后
   */
  const customFieldFilterGroups = computed(() => {
    /** @type {Array<{ defId: string, name: string, options: Array<{ label: string, value: string }> }>} */
    const groups = []

    for (const def of customFieldDefs.value) {
      if (String(def?.type || '') !== 'select') continue
      const defId = String(def?.id || '').trim()
      if (!defId) continue

      const present = new Set()
      for (const item of sourceList.value) {
        const value = String(item?.customFields?.[defId] ?? '').trim()
        if (value) present.add(value)
      }
      for (const value of filters.customFields[defId] || []) present.add(value)
      if (!present.size) continue

      const ordered = []
      const seen = new Set()
      for (const raw of Array.isArray(def.options) ? def.options : []) {
        const value = String(raw || '').trim()
        if (!value || seen.has(value) || !present.has(value)) continue
        ordered.push(value)
        seen.add(value)
      }
      for (const value of [...present].filter((entry) => !seen.has(entry)).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))) {
        ordered.push(value)
      }

      groups.push({
        defId,
        name: String(def?.name || '').trim(),
        options: ordered.map((value) => ({ label: value, value }))
      })
    }

    return groups
  })

  // 字段定义被删除/改成非 select 时清掉残留筛选，否则该字段会永远筛不出任何条目
  watch(
    () => customFieldDefs.value.map((def) => [String(def?.id || ''), String(def?.type || '')].join(':')).join('|'),
    () => {
      const allowed = new Set(customFieldFilterGroups.value.map((group) => group.defId))
      const keys = Object.keys(filters.customFields)
      if (keys.every((key) => allowed.has(key))) return

      const next = {}
      for (const key of keys) {
        if (allowed.has(key)) next[key] = filters.customFields[key]
      }
      filters.customFields = next
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
    // 重置筛选条件时保留匹配偏好（拼音/大小写/备注）
    assignFilters(createDefaultGoodsFilters({
      hasImage: 'any',
      matchPinyin: filters.matchPinyin,
      matchCase: filters.matchCase,
      includeNote: filters.includeNote
    }))
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

  /**
   * 自定义字段筛选开关。不能复用 toggleFilterValue：它按数组处理 filters[key]，
   * 传 'customFields' 会把整个对象写成数组。这里整对象替换，保证 key 增减都被追踪。
   */
  function toggleCustomFieldFilter(defId, value) {
    const key = String(defId || '').trim()
    if (!key) return

    const current = Array.isArray(filters.customFields[key]) ? [...filters.customFields[key]] : []
    const next = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value]

    const nextMap = { ...filters.customFields }
    if (next.length) nextMap[key] = next
    else delete nextMap[key]
    filters.customFields = nextMap
  }

  /** defId → 字段名（预设摘要里展示用户看得懂的名字） */
  function customFieldNameOf(defId) {
    const hit = customFieldDefs.value.find((def) => String(def?.id || '') === defId)
    return String(hit?.name || '').trim() || defId
  }

  function assignFilters(nextFilters) {
    const normalized = normalizeGoodsFilterConditions({
      ...nextFilters,
      hasImage: 'any'
    })
    Object.assign(filters, normalized)
    clearTimeout(keywordDebounceTimer)
    debouncedKeyword.value = normalized.matchCase
      ? normalized.keyword
      : normalized.keyword.toLowerCase()
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
    const customEntries = Object.entries(normalized.customFields)
    if (customEntries.length) {
      segments.push(customEntries
        .slice(0, 2)
        .map(([defId, values]) => `${customFieldNameOf(defId)}:${values.slice(0, 2).join("/")}`)
        .join(' '))
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
    customFieldFilterGroups,

    // Preset operations
    searchPresets,
    applyPreset,
    saveNewPreset,
    updateActivePreset,
    removePreset,
    resetFilters,

    // Helpers
    toggleFilterValue,
    toggleCustomFieldFilter,
    assignFilters,
    formatPresetSummary
  }
}
