// @ts-check
import { triggerRef } from 'vue'
import { saveItems } from '@/utils/db/index'
import { normalizeWishlistFlag } from '@/stores/goods/goodsHelpers'

/**
 * 目标列表（同 isWishlist）的下一个手动序号。
 * 空列表 → 0；已有条目时取 max+1（含从未手排的 0）。
 * @param {import('@/types/models').GoodsItem[]} items
 * @param {boolean} isWishlist
 * @param {string} [excludeId]
 */
export function nextGoodsSortOrder(items, isWishlist, excludeId = '') {
  const target = normalizeWishlistFlag(isWishlist)
  let max = -1
  for (const item of items) {
    if (excludeId && item.id === excludeId) continue
    if (normalizeWishlistFlag(item.isWishlist) !== target) continue
    const n = Number(item.sortOrder)
    if (Number.isFinite(n) && n > max) max = n
  }
  return max + 1
}

/**
 * 构建「单纯 reverse」后的 id 序列：按当前 sortOrder 升序取域内条目再整体反转。
 * @param {import('@/types/models').GoodsItem[]} items
 * @param {boolean} isWishlist
 * @param {string[]} [displayIds] 可选：当前展示序（自定义模式下的未分组 goods），优先使用
 * @returns {string[]}
 */
export function buildReverseGoodsSortIds(items, isWishlist, displayIds) {
  if (Array.isArray(displayIds) && displayIds.length >= 2) {
    return displayIds.map((id) => String(id)).reverse()
  }

  const wish = normalizeWishlistFlag(isWishlist)
  const domain = []
  for (const item of items || []) {
    if (!item || !item.id) continue
    if (item._type === 'group') continue
    if (normalizeWishlistFlag(item.isWishlist) !== wish) continue
    domain.push(item)
  }
  domain.sort((a, b) => {
    const so = (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0)
    if (so !== 0) return so
    return String(a.id).localeCompare(String(b.id))
  })
  return domain.map((item) => String(item.id)).reverse()
}

/**
 * 按展示 id 序列重写 goods.sortOrder（下标即序号）。
 * 仅写入实际变更的行。
 * @param {string[]} orderedGoodsIds
 * @param {import('vue').ShallowRef<import('@/types/models').GoodsItem[]>} list
 * @param {(ids: string[]) => void} [onMutate]
 */
export async function reorderGoods(orderedGoodsIds, list, onMutate) {
  if (!Array.isArray(orderedGoodsIds) || orderedGoodsIds.length === 0) return

  const orderMap = new Map()
  for (let i = 0; i < orderedGoodsIds.length; i++) {
    const id = orderedGoodsIds[i]
    if (id != null && id !== '' && !orderMap.has(id)) orderMap.set(id, orderMap.size)
  }
  if (orderMap.size === 0) return

  const now = Date.now()
  /** @type {import('@/types/models').GoodsItem[]} */
  const updatedItems = []
  const updatedIds = new Set()

  list.value = list.value.map((item) => {
    const nextOrder = orderMap.get(item.id)
    if (nextOrder === undefined) return item
    const current = Number(item.sortOrder) || 0
    if (current === nextOrder) return item
    const next = { ...item, sortOrder: nextOrder, updatedAt: now }
    updatedItems.push(next)
    updatedIds.add(item.id)
    return next
  })

  if (updatedItems.length === 0) return
  triggerRef(list)
  try {
    await saveItems(updatedItems)
  } catch (e) {
    console.error('[goods] reorderGoods DB write failed:', e)
    throw e
  }
  onMutate?.([...updatedIds])
}
