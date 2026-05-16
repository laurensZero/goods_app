const DEFAULT_SORT_MODE = 'createdAt'

export const HOME_SORT_OPTIONS = [
  {
    value: 'createdAt',
    label: '添加时间',
    descLabel: '最近添加',
    ascLabel: '最早添加',
  },
  {
    value: 'acquiredAt',
    label: '购入时间',
    descLabel: '最近购入',
    ascLabel: '最早购入',
  },
  {
    value: 'name',
    label: '名称',
    descLabel: '名称 Z-A',
    ascLabel: '名称 A-Z',
  },
  {
    value: 'price',
    label: '价格',
    descLabel: '价格高到低',
    ascLabel: '价格低到高',
  }
]

export function normalizeHomeSortMode(value) {
  const matched = HOME_SORT_OPTIONS.find((option) => option.value === value)
  return matched?.value || DEFAULT_SORT_MODE
}

export function getHomeSortOption(sortMode) {
  return HOME_SORT_OPTIONS.find((option) => option.value === normalizeHomeSortMode(sortMode)) || HOME_SORT_OPTIONS[0]
}

function parseAddedTime(item) {
  const existing = Number(item?.createdTime)
  if (Number.isFinite(existing) && existing > 0) return existing

  const rawId = String(item?.sortId || item?.id || '').trim()
  if (/^\d{10,17}$/.test(rawId)) {
    const parsed = Number(rawId)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }

  return 0
}

function compareName(a, b) {
  return String(a?.name || '').localeCompare(String(b?.name || ''), 'zh-Hans-CN')
}

function compareItems(a, b, normalizedSortMode, directionFactor) {
  if (normalizedSortMode === 'name') {
    return compareName(a, b) * directionFactor
      || (parseAddedTime(b) - parseAddedTime(a))
      || (Number(b?.acquiredTime || 0) - Number(a?.acquiredTime || 0))
      || String(a?.sortId || a?.id || '').localeCompare(String(b?.sortId || b?.id || ''))
  }

  if (normalizedSortMode === 'price') {
    const priceA = Number(a?.totalValueNumber || 0)
    const priceB = Number(b?.totalValueNumber || 0)
    return (priceA - priceB) * directionFactor
      || (parseAddedTime(a) - parseAddedTime(b))
      || (Number(a?.acquiredTime || 0) - Number(b?.acquiredTime || 0))
      || compareName(a, b)
      || String(a?.sortId || a?.id || '').localeCompare(String(b?.sortId || b?.id || ''))
  }

  if (normalizedSortMode === 'acquiredAt') {
    return (Number(a?.acquiredTime || 0) - Number(b?.acquiredTime || 0)) * directionFactor
      || (parseAddedTime(a) - parseAddedTime(b)) * directionFactor
      || compareName(a, b)
      || String(a?.sortId || a?.id || '').localeCompare(String(b?.sortId || b?.id || ''))
  }

  return (parseAddedTime(a) - parseAddedTime(b)) * directionFactor
    || (Number(a?.acquiredTime || 0) - Number(b?.acquiredTime || 0)) * directionFactor
    || compareName(a, b)
    || String(a?.sortId || a?.id || '').localeCompare(String(b?.sortId || b?.id || ''))
}

export function sortHomeGoodsList(list, sortMode, sortDirection) {
  const normalizedSortMode = normalizeHomeSortMode(sortMode)
  const directionFactor = sortDirection === 'asc' ? 1 : -1

  // Check if already sorted — avoid creating new array
  let isSorted = true
  for (let i = 1; i < list.length; i++) {
    if (compareItems(list[i - 1], list[i], normalizedSortMode, directionFactor) > 0) {
      isSorted = false
      break
    }
  }
  if (isSorted) return list

  const sorted = [...list]
  sorted.sort((a, b) => compareItems(a, b, normalizedSortMode, directionFactor))
  return sorted
}
