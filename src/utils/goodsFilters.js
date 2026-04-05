import { isStorageLocationUnderPrefix, normalizeStorageLocationValue } from '@/utils/storageLocations'

const DEFAULT_SORT = 'acquiredAt_desc'
const DEFAULT_DATE_PRESET = 'all'
const DEFAULT_TOGGLE = 'any'

export const GOODS_FILTER_SPECIAL_VALUES = {
  uncategorized: '__uncategorized__',
  noIp: '__no_ip__',
  noCharacter: '__no_character__',
  noStorageLocation: '__no_storage_location__'
}

export const GOODS_FILTER_SORT_OPTIONS = [
  { label: '最近购入', value: 'acquiredAt_desc' },
  { label: '最早购入', value: 'acquiredAt_asc' },
  { label: '价格最高', value: 'price_desc' },
  { label: '价格最低', value: 'price_asc' },
  { label: '总价最高', value: 'totalValue_desc' },
  { label: '名称排序', value: 'name_asc' }
]

export const GOODS_FILTER_DATE_PRESET_OPTIONS = [
  { label: '不限时间', value: 'all' },
  { label: '近 30 天', value: 'last_30_days' },
  { label: '近 3 个月', value: 'last_3_months' },
  { label: '近半年', value: 'last_6_months' },
  { label: '今年', value: 'this_year' },
  { label: '自定义', value: 'custom' }
]

export const GOODS_FILTER_BOOLEAN_OPTIONS = [
  { label: '不限', value: 'any' },
  { label: '有', value: 'yes' },
  { label: '无', value: 'no' }
]

function normalizeStringList(list) {
  if (!Array.isArray(list)) return []

  return [...new Set(
    list
      .map((item) => String(item || '').trim())
      .filter(Boolean)
  )]
}

function normalizeNumberLike(value) {
  if (value == null) return ''
  const text = String(value).trim()
  return text
}

function parseNumberLike(value) {
  if (value === '' || value == null) return null
  const parsed = Number.parseFloat(String(value))
  return Number.isFinite(parsed) ? parsed : null
}

function parseDateLike(value) {
  if (!value) return 0
  const timestamp = Date.parse(String(value))
  return Number.isFinite(timestamp) ? timestamp : 0
}

function normalizeOptionValue(value, options, defaultValue) {
  const matched = options.find((item) => item.value === value)
  return matched?.value || defaultValue
}

function normalizeDatePreset(value) {
  return normalizeOptionValue(value, GOODS_FILTER_DATE_PRESET_OPTIONS, DEFAULT_DATE_PRESET)
}

function normalizeToggleValue(value) {
  return normalizeOptionValue(value, GOODS_FILTER_BOOLEAN_OPTIONS, DEFAULT_TOGGLE)
}

function normalizeSortValue(value) {
  return normalizeOptionValue(value, GOODS_FILTER_SORT_OPTIONS, DEFAULT_SORT)
}

function getDatePresetFloor(datePreset) {
  const now = new Date()

  switch (datePreset) {
    case 'last_30_days':
      return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30).getTime()
    case 'last_3_months':
      return new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()).getTime()
    case 'last_6_months':
      return new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()).getTime()
    case 'this_year':
      return new Date(now.getFullYear(), 0, 1).getTime()
    default:
      return 0
  }
}

function buildSearchText(item) {
  const textParts = [
    item.name,
    item.category,
    item.ip,
    item.variant,
    item.note,
    item.storageLocation,
    ...(Array.isArray(item.characters) ? item.characters : []),
    ...(Array.isArray(item.tags) ? item.tags : [])
  ]

  return textParts
    .map((part) => String(part || '').trim().toLowerCase())
    .filter(Boolean)
    .join('\n')
}

function includesAny(selected, actualList, emptyToken) {
  if (!selected.length) return true

  const normalizedActual = normalizeStringList(actualList)

  return selected.some((value) => {
    if (value === emptyToken) {
      return normalizedActual.length === 0
    }

    return normalizedActual.includes(value)
  })
}

function matchesSingleValue(selected, actualValue, emptyToken) {
  if (!selected.length) return true

  const normalizedValue = String(actualValue || '').trim()

  return selected.some((value) => {
    if (value === emptyToken) {
      return !normalizedValue
    }

    return normalizedValue === value
  })
}

function matchesStorageLocationValue(selected, actualValue, emptyToken) {
  if (!selected.length) return true

  const normalizedValue = normalizeStorageLocationValue(actualValue)

  return selected.some((value) => {
    if (value === emptyToken) {
      return !normalizedValue
    }

    return isStorageLocationUnderPrefix(normalizedValue, value)
  })
}

function sortGoodsList(list, sortBy) {
  const sorted = [...list]

  sorted.sort((a, b) => {
    switch (sortBy) {
      case 'acquiredAt_asc':
        return a.acquiredTime - b.acquiredTime
          || a.name.localeCompare(b.name, 'zh-Hans-CN')
      case 'price_desc':
        return b.priceNumber - a.priceNumber
          || b.acquiredTime - a.acquiredTime
          || a.name.localeCompare(b.name, 'zh-Hans-CN')
      case 'price_asc':
        return a.priceNumber - b.priceNumber
          || b.acquiredTime - a.acquiredTime
          || a.name.localeCompare(b.name, 'zh-Hans-CN')
      case 'totalValue_desc':
        return b.totalValueNumber - a.totalValueNumber
          || b.acquiredTime - a.acquiredTime
          || a.name.localeCompare(b.name, 'zh-Hans-CN')
      case 'name_asc':
        return a.name.localeCompare(b.name, 'zh-Hans-CN')
          || b.acquiredTime - a.acquiredTime
      case 'acquiredAt_desc':
      default:
        return b.acquiredTime - a.acquiredTime
          || a.name.localeCompare(b.name, 'zh-Hans-CN')
    }
  })

  return sorted
}

export function createDefaultGoodsFilters(overrides = {}) {
  return {
    keyword: '',
    categories: [],
    ips: [],
    characters: [],
    storageLocations: [],
    priceMin: '',
    priceMax: '',
    acquiredPreset: DEFAULT_DATE_PRESET,
    acquiredFrom: '',
    acquiredTo: '',
    hasImage: DEFAULT_TOGGLE,
    hasNote: DEFAULT_TOGGLE,
    sortBy: DEFAULT_SORT,
    ...overrides
  }
}

export function normalizeGoodsFilterConditions(input = {}) {
  const normalized = createDefaultGoodsFilters()

  normalized.keyword = String(input.keyword || '').trim()
  normalized.categories = normalizeStringList(input.categories)
  normalized.ips = normalizeStringList(input.ips)
  normalized.characters = normalizeStringList(input.characters)
  normalized.storageLocations = normalizeStringList(input.storageLocations)
  normalized.priceMin = normalizeNumberLike(input.priceMin)
  normalized.priceMax = normalizeNumberLike(input.priceMax)
  normalized.acquiredPreset = normalizeDatePreset(input.acquiredPreset)
  normalized.acquiredFrom = String(input.acquiredFrom || '').trim()
  normalized.acquiredTo = String(input.acquiredTo || '').trim()
  normalized.hasImage = normalizeToggleValue(input.hasImage)
  normalized.hasNote = normalizeToggleValue(input.hasNote)
  normalized.sortBy = normalizeSortValue(input.sortBy)

  return normalized
}

export function areGoodsFilterConditionsEqual(a, b) {
  return JSON.stringify(normalizeGoodsFilterConditions(a)) === JSON.stringify(normalizeGoodsFilterConditions(b))
}

export function countActiveGoodsFilters(input, options = {}) {
  const { includeKeyword = true } = options
  const filters = normalizeGoodsFilterConditions(input)
  let count = 0

  if (includeKeyword && filters.keyword) count += 1
  if (filters.categories.length) count += 1
  if (filters.ips.length) count += 1
  if (filters.characters.length) count += 1
  if (filters.storageLocations.length) count += 1
  if (filters.priceMin !== '') count += 1
  if (filters.priceMax !== '') count += 1
  if (filters.acquiredPreset !== DEFAULT_DATE_PRESET) count += 1
  if (filters.hasImage !== DEFAULT_TOGGLE) count += 1
  if (filters.hasNote !== DEFAULT_TOGGLE) count += 1
  if (filters.sortBy !== DEFAULT_SORT) count += 1

  return count
}

export function applyGoodsFilters(list, input) {
  const filters = normalizeGoodsFilterConditions(input)
  const keyword = filters.keyword.toLowerCase()
  const priceMin = parseNumberLike(filters.priceMin)
  const priceMax = parseNumberLike(filters.priceMax)
  const presetFloor = getDatePresetFloor(filters.acquiredPreset)
  const customFrom = filters.acquiredPreset === 'custom' ? parseDateLike(filters.acquiredFrom) : 0
  const customTo = filters.acquiredPreset === 'custom'
    ? parseDateLike(filters.acquiredTo ? `${filters.acquiredTo}T23:59:59.999` : '')
    : 0

  const filtered = list.filter((item) => {
    const matchesKeyword = !keyword || buildSearchText(item).includes(keyword)
    if (!matchesKeyword) return false

    if (!matchesSingleValue(filters.categories, item.category, GOODS_FILTER_SPECIAL_VALUES.uncategorized)) return false
    if (!matchesSingleValue(filters.ips, item.ip, GOODS_FILTER_SPECIAL_VALUES.noIp)) return false
    if (!includesAny(filters.characters, item.characters, GOODS_FILTER_SPECIAL_VALUES.noCharacter)) return false
    if (!matchesStorageLocationValue(filters.storageLocations, item.storageLocation, GOODS_FILTER_SPECIAL_VALUES.noStorageLocation)) return false

    if (priceMin != null && Number(item.priceNumber || 0) < priceMin) return false
    if (priceMax != null && Number(item.priceNumber || 0) > priceMax) return false

    if (presetFloor > 0 && Number(item.acquiredTime || 0) < presetFloor) return false

    if (filters.acquiredPreset === 'custom') {
      const acquiredTime = Number(item.acquiredTime || 0)
      if ((customFrom || customTo) && !acquiredTime) return false
      if (customFrom && acquiredTime < customFrom) return false
      if (customTo && acquiredTime > customTo) return false
    }

    const hasImage = Array.isArray(item.images) ? item.images.length > 0 : Boolean(item.coverImage)
    if (filters.hasImage === 'yes' && !hasImage) return false
    if (filters.hasImage === 'no' && hasImage) return false

    const hasNote = Boolean(String(item.note || '').trim())
    if (filters.hasNote === 'yes' && !hasNote) return false
    if (filters.hasNote === 'no' && hasNote) return false

    return true
  })

  return sortGoodsList(filtered, filters.sortBy)
}
