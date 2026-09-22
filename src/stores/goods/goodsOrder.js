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
 * 已写入的手动序；缺键/空值返回 null（与 readManualOrder 的缺省 0 区分）。
 * @param {import('@/types/models').GoodsItem} item
 * @param {string} mode
 * @returns {number | null}
 */
export function getManualOrderIfSet(item, mode) {
  const key = resolveOrderMode(mode)
  const map = item?.manualOrders
  if (!map || typeof map !== 'object') return null
  if (map[key] == null || map[key] === '') return null
  const n = Math.floor(Number(map[key]))
  return Number.isFinite(n) && n >= 0 ? n : null
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

  const submitted = []
  const submittedSet = new Set()
  for (const rawId of orderedGoodsIds) {
    const id = String(rawId || '')
    if (!id || submittedSet.has(id)) continue
    submittedSet.add(id)
    submitted.push(id)
  }
  if (submitted.length === 0) return

  // custom 模式必须在整个收藏/愿望单域内重新编号；否则虚拟列表、旧数据或
  // 心愿转收藏带来的局部序号会与旧序号重复，排序比较器只能退回时间/id。
  // 其它模式的调用方已经把同日/同名/同价组裁好，只在提交组内重编号。
  const first = list.value.find((item) => item.id === submitted[0])
  const targetWishlist = normalizeWishlistFlag(first?.isWishlist)
  const domainIds = key === 'custom'
    ? list.value
      .filter((item) => normalizeWishlistFlag(item.isWishlist) === targetWishlist)
      .map((item) => String(item.id))
    : submitted
  const domainSet = new Set(domainIds)
  const validSubmitted = submitted.filter((id) => domainSet.has(id))
  if (validSubmitted.length === 0) return

  // 若调用方只提交了可见子集，把这些 id 放回它们原本占用的槽位；
  // 这样既支持虚拟列表，也不会把屏外条目整体挪到末尾。
  const currentDomain = domainIds.slice()
  const positions = []
  for (let i = 0; i < currentDomain.length; i++) {
    if (submittedSet.has(currentDomain[i])) positions.push(i)
  }
  const completeOrder = currentDomain.slice()
  for (let i = 0; i < positions.length; i++) completeOrder[positions[i]] = validSubmitted[i]

  const orderMap = new Map(completeOrder.map((id, index) => [id, index]))

  const now = Date.now()
  /** @type {import('@/types/models').GoodsItem[]} */
  const updatedItems = []
  const updatedIds = new Set()

  list.value = list.value.map((item) => {
    const nextOrder = orderMap.get(item.id)
    if (nextOrder === undefined) return item
    // 必须区分「未写入」和「已写入 0」：readManualOrder 缺键也返回 0，
    // 若据此跳过，组内首位永远落不成显式 0，同日比较会退回时间/id，拖了像没动。
    const current = getManualOrderIfSet(item, key)
    if (current !== null && current === nextOrder) return item
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
