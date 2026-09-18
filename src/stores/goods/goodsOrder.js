// @ts-check
import { triggerRef } from 'vue'
import { saveItems } from '@/utils/db/index'
import { normalizeWishlistFlag, normalizeManualOrders, MANUAL_ORDER_MODES } from '@/stores/goods/goodsHelpers'

/** @param {string} mode */
function resolveOrderMode(mode) {
  return MANUAL_ORDER_MODES.includes(mode) ? mode : 'custom'
}

/**
 * @param {import('@/types/models').GoodsItem} item
 * @param {string} mode
 */
export function readManualOrder(item, mode) {
  const key = resolveOrderMode(mode)
  const map = item?.manualOrders
  if (map && typeof map === 'object') {
    const n = Number(map[key])
    if (Number.isFinite(n)) return n
  }
  return 0
}

/**
 * 目标列表（同 isWishlist）在指定模式上的下一个手动序号。
 * @param {import('@/types/models').GoodsItem[]} items
 * @param {boolean} isWishlist
 * @param {string} [excludeId]
 * @param {string} [mode]
 */
export function nextGoodsSortOrder(items, isWishlist, excludeId = '', mode = 'custom') {
  const target = normalizeWishlistFlag(isWishlist)
  const key = resolveOrderMode(mode)
  let max = -1
  for (const item of items) {
    if (excludeId && item.id === excludeId) continue
    if (normalizeWishlistFlag(item.isWishlist) !== target) continue
    const n = readManualOrder(item, key)
    if (n > max) max = n
  }
  return max + 1
}

/**
 * 构建「单纯 reverse」后的 id 序列。
 * @param {import('@/types/models').GoodsItem[]} items
 * @param {boolean} isWishlist
 * @param {string[]} [displayIds]
 * @param {string} [mode]
 * @returns {string[]}
 */
export function buildReverseGoodsSortIds(items, isWishlist, displayIds, mode = 'custom') {
  if (Array.isArray(displayIds) && displayIds.length >= 2) {
    return displayIds.map((id) => String(id)).reverse()
  }

  const wish = normalizeWishlistFlag(isWishlist)
  const key = resolveOrderMode(mode)
  const domain = []
  for (const item of items || []) {
    if (!item || !item.id) continue
    if (item._type === 'group') continue
    if (normalizeWishlistFlag(item.isWishlist) !== wish) continue
    domain.push(item)
  }
  domain.sort((a, b) => {
    const so = readManualOrder(a, key) - readManualOrder(b, key)
    if (so !== 0) return so
    return String(a.id).localeCompare(String(b.id))
  })
  return domain.map((item) => String(item.id)).reverse()
}

/**
 * 按展示 id 序列重写 manualOrders[mode]（下标即序号）。
 * @param {string[]} orderedGoodsIds
 * @param {import('vue').ShallowRef<import('@/types/models').GoodsItem[]>} list
 * @param {(ids: string[]) => void} [onMutate]
 * @param {string} [mode]
 */
export async function reorderGoods(orderedGoodsIds, list, onMutate, mode = 'custom') {
  if (!Array.isArray(orderedGoodsIds) || orderedGoodsIds.length === 0) return
  const key = resolveOrderMode(mode)

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
    const current = readManualOrder(item, key)
    if (current === nextOrder) return item
    const manualOrders = { ...normalizeManualOrders(item.manualOrders), [key]: nextOrder }
    const next = { ...item, manualOrders, updatedAt: now }
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
