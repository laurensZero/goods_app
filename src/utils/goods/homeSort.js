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

export function createHomeSortOptions(t) {
  return [
    {
      value: 'createdAt',
      label: t('home.sort.createdAt'),
      descLabel: t('home.sort.createdAtDesc'),
      ascLabel: t('home.sort.createdAtAsc'),
    },
    {
      value: 'acquiredAt',
      label: t('home.sort.acquiredAt'),
      descLabel: t('home.sort.acquiredAtDesc'),
      ascLabel: t('home.sort.acquiredAtAsc'),
    },
    {
      value: 'name',
      label: t('home.sort.name'),
      descLabel: t('home.sort.nameDesc'),
      ascLabel: t('home.sort.nameAsc'),
    },
    {
      value: 'price',
      label: t('home.sort.price'),
      descLabel: t('home.sort.priceDesc'),
      ascLabel: t('home.sort.priceAsc'),
    }
  ]
}

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

export function sortHomeGoodsList(list, sortMode, sortDirection) {
  const normalizedSortMode = normalizeHomeSortMode(sortMode)
  const directionFactor = sortDirection === 'asc' ? 1 : -1
  const sorted = [...list]

  sorted.sort((a, b) => {
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
  })

  return sorted
}
