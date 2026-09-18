// @ts-check
import { sortHomeGoodsList, normalizeHomeSortMode } from '@/utils/goods/homeSort'
import {
  normalizeWishlistFlag,
  parseAcquiredTime,
  parseNumericPrice,
  resolveCollectionTotalValue
} from '@/stores/goods/goodsHelpers'

/**
 * 重新生成自定义序时的基准排序模式。
 * 传入 custom/非法值时回退到添加时间，避免用旧自定义序重写自己。
 * @param {string} baseMode
 * @returns {string}
 */
export function getCustomSortRegenerateBaseMode(baseMode) {
  return normalizeHomeSortMode(baseMode) === 'custom'
    ? 'createdAt'
    : normalizeHomeSortMode(baseMode)
}

/**
 * 列表排序依赖 view 层字段；store.list 原始行可能没有 acquiredTime/totalValueNumber。
 * @param {Record<string, any>} item
 */
function prepareItemForRegenerateSort(item) {
  const acquiredTime = Number(item?.acquiredTime) > 0
    ? Number(item.acquiredTime)
    : parseAcquiredTime(item?.acquiredAt)
  const hasTotal = item?.totalValueNumber !== undefined
    && item?.totalValueNumber !== null
    && item?.totalValueNumber !== ''
    && Number.isFinite(Number(item.totalValueNumber))
  const totalValueNumber = hasTotal
    ? Number(item.totalValueNumber)
    : parseNumericPrice(resolveCollectionTotalValue(item))
  return {
    ...item,
    acquiredTime,
    totalValueNumber,
    // 重新生成只写 manualOrders.custom；排序时不读旧手动序
    manualOrders: {}
  }
}

/**
 * 构建重新生成后的 goods id 序列（用于写入 manualOrders.custom）。
 * @param {import('@/types/models').GoodsItem[]} items
 * @param {{ isWishlist?: boolean, baseMode?: string, sortDirection?: string }} [options]
 * @returns {string[]}
 */
export function buildCustomSortRegenerateIds(items, { isWishlist, baseMode, sortDirection } = {}) {
  const wish = normalizeWishlistFlag(isWishlist)
  /** @type {import('@/types/models').GoodsItem[]} */
  const domain = []
  for (const item of items || []) {
    if (!item || !item.id) continue
    if (item._type === 'group') continue
    if (normalizeWishlistFlag(item.isWishlist) !== wish) continue
    domain.push(prepareItemForRegenerateSort(item))
  }
  if (domain.length === 0) return []

  const mode = getCustomSortRegenerateBaseMode(baseMode)
  const direction = sortDirection === 'asc' ? 'asc' : 'desc'
  // 非 custom 主序键字段参与；次级键 sortOrder 已置 0，不会带回旧自定义序
  return sortHomeGoodsList(domain, mode, direction).map((item) => String(item.id))
}
