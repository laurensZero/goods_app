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
  },
  {
    value: 'custom',
    label: '自定义',
    descLabel: '自定义顺序',
    ascLabel: '自定义顺序',
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
    },
    {
      value: 'custom',
      label: t('home.sort.custom'),
      descLabel: t('home.sort.customDesc'),
      ascLabel: t('home.sort.customAsc'),
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

/**
 * manualOrders[mode]；缺省 0
 * @param {object} item
 * @param {string} mode
 */
function parseManualOrder(item, mode) {
  const map = item?.manualOrders
  if (map && typeof map === 'object') {
    const n = Number(map[mode])
    if (Number.isFinite(n)) return n
  }
  return 0
}

export function sortHomeGoodsList(list, sortMode, sortDirection) {
  const normalizedSortMode = normalizeHomeSortMode(sortMode)
  const directionFactor = sortDirection === 'asc' ? 1 : -1
  const sorted = [...list]

  sorted.sort((a, b) => {
    if (normalizedSortMode === 'custom') {
      return (parseManualOrder(a, 'custom') - parseManualOrder(b, 'custom'))
        || (Number(b?.updatedAt || b?.createdTime || 0) - Number(a?.updatedAt || a?.createdTime || 0))
        || String(a?.sortId || a?.id || '').localeCompare(String(b?.sortId || b?.id || ''))
    }

    if (normalizedSortMode === 'name') {
      return compareName(a, b) * directionFactor
        || (parseManualOrder(a, 'name') - parseManualOrder(b, 'name'))
        || (parseAddedTime(b) - parseAddedTime(a))
        || String(a?.sortId || a?.id || '').localeCompare(String(b?.sortId || b?.id || ''))
    }

    if (normalizedSortMode === 'price') {
      const priceA = Number(a?.totalValueNumber || 0)
      const priceB = Number(b?.totalValueNumber || 0)
      return (priceA - priceB) * directionFactor
        || (parseManualOrder(a, 'price') - parseManualOrder(b, 'price'))
        || (parseAddedTime(a) - parseAddedTime(b))
        || compareName(a, b)
        || String(a?.sortId || a?.id || '').localeCompare(String(b?.sortId || b?.id || ''))
    }

    if (normalizedSortMode === 'acquiredAt') {
      return (Number(a?.acquiredTime || 0) - Number(b?.acquiredTime || 0)) * directionFactor
        || (parseManualOrder(a, 'acquiredAt') - parseManualOrder(b, 'acquiredAt'))
        || (parseAddedTime(a) - parseAddedTime(b)) * directionFactor
        || compareName(a, b)
        || String(a?.sortId || a?.id || '').localeCompare(String(b?.sortId || b?.id || ''))
    }

    return (parseAddedTime(a) - parseAddedTime(b)) * directionFactor
      || (parseManualOrder(a, 'createdAt') - parseManualOrder(b, 'createdAt'))
      || (Number(a?.acquiredTime || 0) - Number(b?.acquiredTime || 0)) * directionFactor
      || compareName(a, b)
      || String(a?.sortId || a?.id || '').localeCompare(String(b?.sortId || b?.id || ''))
  })

  return sorted
}

/** 自定义排序不响应升降序切换；日期排序仍可切换方向 */
export function isHomeSortDirectionLocked(sortMode) {
  return normalizeHomeSortMode(sortMode) === 'custom'
}

/** 日期/名称/价格主排序 + 同模式 manualOrders 次级：允许在把手拖拽的排序模式 */
export function isHomeSortReorderable(sortMode) {
  const mode = normalizeHomeSortMode(sortMode)
  return mode === 'custom'
    || mode === 'createdAt'
    || mode === 'acquiredAt'
    || mode === 'name'
    || mode === 'price'
}

/**
 * 「同组才能互换」的分组键。
 * - createdAt/acquiredAt：同一天
 * - name：同名
 * - price：同价
 * - custom：null（不限制）
 */
export function getHomeSortGroupKey(item, sortMode) {
  const mode = normalizeHomeSortMode(sortMode)
  if (mode === 'custom') return null

  if (mode === 'acquiredAt') {
    const t = Number(item?.acquiredTime || 0)
    if (!t) return `acq:${String(item?.acquiredAt || item?.id || '')}`
    const d = new Date(t)
    return `acq:${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
  }

  if (mode === 'createdAt') {
    const t = parseAddedTime(item)
    if (!t) return `crt:${String(item?.createdTime || item?.sortId || item?.id || '')}`
    const d = new Date(t)
    return `crt:${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
  }

  if (mode === 'name') {
    return `name:${String(item?.name || '').trim()}`
  }

  if (mode === 'price') {
    return `price:${Number(item?.totalValueNumber || 0)}`
  }

  return null
}

/** 兼容旧名 */
export function getHomeSortDayKey(item, sortMode) {
  return getHomeSortGroupKey(item, sortMode)
}
