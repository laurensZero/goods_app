/**
 * 预设列表排序工具
 *
 * 支持三种排序模式：默认/添加顺序（default）、名称（name）、商品数量（goodsCount）。
 * 收藏项始终排在列表最前；「其他」分类始终排在最后。
 * default 模式下保持原数组顺序（即添加顺序），仅按收藏/普通/末尾分组。
 */

export const PRESET_SORT_MODES = [
  { value: 'default', label: '默认' },
  { value: 'name', label: '名称' },
  { value: 'goodsCount', label: '商品数' }
]

export function normalizePresetSortMode(value) {
  if (PRESET_SORT_MODES.some((m) => m.value === value)) return value
  return 'default'
}

/**
 * @param {string[]|{name:string,ip:string}[]} list
 * @param {'default'|'name'|'goodsCount'} sortMode
 * @param {'asc'|'desc'} sortDirection
 * @param {Map<string,number>} goodsCountMap  名称 → 商品数量
 * @param {Set<string>} favoriteSet          收藏项名称集合
 * @param {{ alwaysLast?: (item) => boolean }} [opts]
 * @returns 排序后的列表
 */
export function sortPresetList(list, sortMode, sortDirection, goodsCountMap, favoriteSet, opts = {}) {
  if (!Array.isArray(list) || list.length === 0) return []

  const { alwaysLast } = opts
  const dir = sortDirection === 'desc' ? -1 : 1

  function extractName(item) {
    return typeof item === 'string' ? item : item.name
  }

  function compareByName(a, b) {
    return extractName(a).localeCompare(extractName(b), 'zh-Hans-CN')
  }

  function compareByCount(a, b) {
    const countA = goodsCountMap.get(extractName(a)) || 0
    const countB = goodsCountMap.get(extractName(b)) || 0
    if (countA !== countB) return (countA - countB) * dir
    // 同数量按名称回退
    return compareByName(a, b)
  }

  function getComparator() {
    if (sortMode === 'goodsCount') return compareByCount
    if (sortMode === 'name') return (a, b) => compareByName(a, b) * dir
    // default: 不排序，保持原顺序
    return null
  }

  const comparator = getComparator()

  // 分组：收藏 + 普通 + 始终排最后
  const favorites = []
  const normal = []
  const last = []

  for (const item of list) {
    const name = extractName(item)
    if (alwaysLast && alwaysLast(item)) {
      last.push(item)
    } else if (favoriteSet.has(name)) {
      favorites.push(item)
    } else {
      normal.push(item)
    }
  }

  if (comparator) {
    favorites.sort(comparator)
    normal.sort(comparator)
  } else if (dir === -1) {
    // default 模式降序：反转各组内顺序
    favorites.reverse()
    normal.reverse()
  }

  return [...favorites, ...normal, ...last]
}
