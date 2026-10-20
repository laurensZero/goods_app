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

function extractPresetKey(item, keyOf) {
  return keyOf ? keyOf(item) : (typeof item === 'string' ? item : item.name)
}

/**
 * @param {string[]|{name:string,ip:string}[]} list
 * @param {'default'|'name'|'goodsCount'} sortMode
 * @param {'asc'|'desc'} sortDirection
 * @param {Map<string,{collection:number,wishlist:number}>|Map<string,number>} goodsCountMap  名称 → 商品数量
 * @param {Set<string>} favoriteSet          收藏项 key 集合（默认取名称）
 * @param {{ alwaysLast?: (item) => boolean, keyOf?: (item) => string }} [opts]
 *   keyOf 用于收藏 / 数量查找的键（角色等按名字不唯一的域可传 (ip,name) 复合 id）
 * @returns 排序后的列表
 */
export function sortPresetList(list, sortMode, sortDirection, goodsCountMap, favoriteSet, opts = {}) {
  if (!Array.isArray(list) || list.length === 0) return []

  const { alwaysLast } = opts
  const dir = sortDirection === 'desc' ? -1 : 1

  function extractName(item) {
    return typeof item === 'string' ? item : item.name
  }

  const keyOf = opts.keyOf || extractName

  function compareByName(a, b) {
    return extractName(a).localeCompare(extractName(b), 'zh-Hans-CN')
  }

  function compareByCount(a, b) {
    const countA = goodsCountMap.get(keyOf(a))
    const countB = goodsCountMap.get(keyOf(b))
    const totalA = typeof countA === 'object' ? (countA.collection + countA.wishlist) : (countA || 0)
    const totalB = typeof countB === 'object' ? (countB.collection + countB.wishlist) : (countB || 0)
    if (totalA !== totalB) return (totalA - totalB) * dir
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
    if (alwaysLast && alwaysLast(item)) {
      last.push(item)
    } else if (favoriteSet.has(keyOf(item))) {
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

/**
 * 判断预设项在默认排序下所属的分组。
 * 拖动重排时只在同一分组内换位，否则收藏项/「其他」会被排序规则拉回原位。
 */
export function presetGroupKey(item, { favoriteSet, keyOf, alwaysLast } = {}) {
  if (alwaysLast && alwaysLast(item)) return 'last'
  if (favoriteSet && favoriteSet.has(extractPresetKey(item, keyOf))) return 'favorites'
  return 'normal'
}

/**
 * 把默认排序的展示顺序还原成预设数组的存储顺序。
 * default 升序时展示顺序就是存储顺序；降序时收藏组和普通组在展示上被反转，
 * 需要反转回来，避免拖完一次顺序又被排序规则倒过来。
 */
export function presetStoreOrderFromDisplay(displayList, { sortDirection, favoriteSet, keyOf, alwaysLast } = {}) {
  if (!Array.isArray(displayList) || displayList.length === 0) return []

  const groups = {
    favorites: [],
    normal: [],
    last: []
  }

  for (const item of displayList) {
    groups[presetGroupKey(item, { favoriteSet, keyOf, alwaysLast })].push(item)
  }

  if (sortDirection === 'desc') {
    groups.favorites.reverse()
    groups.normal.reverse()
  }

  return [...groups.favorites, ...groups.normal, ...groups.last]
}
