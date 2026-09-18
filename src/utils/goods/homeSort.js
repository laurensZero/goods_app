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

function parseSortOrder(item) {
  const n = Number(item?.sortOrder)
  return Number.isFinite(n) ? n : 0
}

export function sortHomeGoodsList(list, sortMode, sortDirection) {
  const normalizedSortMode = normalizeHomeSortMode(sortMode)
  const directionFactor = sortDirection === 'asc' ? 1 : -1
  const sorted = [...list]

  sorted.sort((a, b) => {
    if (normalizedSortMode === 'custom') {
      // 手动序固定升序；组卡片等无 sortOrder 的项按 0 处理并靠后置稳定排序
      return (parseSortOrder(a) - parseSortOrder(b))
        || (Number(b?.updatedAt || b?.createdTime || 0) - Number(a?.updatedAt || a?.createdTime || 0))
        || String(a?.sortId || a?.id || '').localeCompare(String(b?.sortId || b?.id || ''))
    }

    if (normalizedSortMode === 'name') {
      // 主序：名称；同名内按 sortOrder
      return compareName(a, b) * directionFactor
        || (parseSortOrder(a) - parseSortOrder(b))
        || (parseAddedTime(b) - parseAddedTime(a))
        || String(a?.sortId || a?.id || '').localeCompare(String(b?.sortId || b?.id || ''))
    }

    if (normalizedSortMode === 'price') {
      const priceA = Number(a?.totalValueNumber || 0)
      const priceB = Number(b?.totalValueNumber || 0)
      // 主序：价格；同价内按 sortOrder
      return (priceA - priceB) * directionFactor
        || (parseSortOrder(a) - parseSortOrder(b))
        || (parseAddedTime(a) - parseAddedTime(b))
        || compareName(a, b)
        || String(a?.sortId || a?.id || '').localeCompare(String(b?.sortId || b?.id || ''))
    }

    if (normalizedSortMode === 'acquiredAt') {
      // 主序：购入日；同一天内按 sortOrder（手动小范围重排）
      return (Number(a?.acquiredTime || 0) - Number(b?.acquiredTime || 0)) * directionFactor
        || (parseSortOrder(a) - parseSortOrder(b))
        || (parseAddedTime(a) - parseAddedTime(b)) * directionFactor
        || compareName(a, b)
        || String(a?.sortId || a?.id || '').localeCompare(String(b?.sortId || b?.id || ''))
    }

    // createdAt：主序添加时间；同一天内按 sortOrder
    return (parseAddedTime(a) - parseAddedTime(b)) * directionFactor
      || (parseSortOrder(a) - parseSortOrder(b))
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

/** 日期/名称/价格主排序 + 同组 sortOrder 次级：允许在把手拖拽的排序模式 */
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
 * - price：同价（totalValueNumber）
 * - custom：返回 null，表示不限制
 * @param {object} item
 * @param {string} sortMode
 * @returns {string | null}
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
