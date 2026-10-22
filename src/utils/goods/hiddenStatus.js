// @ts-check
import { normalizeCollectStatus, resolvePrimaryCollectStatus } from '@/utils/goods/status'
import { getEntryUnitIndexes, makeUnitScopeFields } from '@/utils/goods/statusTimeline'

/** 收藏页可单独隐藏的「已离手」状态 */
export const HIDDEN_COLLECT_STATUS_VALUES = ['已出', '丢失', '已赠出']

/** 隐藏状态偏好（仅本地显示设置，不进同步） */
export const HIDDEN_COLLECT_STATUS_STORAGE_KEY = 'goods-app:home-hidden-statuses'

/**
 * 归一化用户偏好：只保留受支持的三个状态，顺序固定。
 * @param {unknown} value
 * @returns {string[]}
 */
export function normalizeHiddenCollectStatuses(value) {
  if (!Array.isArray(value)) return []
  return HIDDEN_COLLECT_STATUS_VALUES.filter((status) => value.includes(status))
}

/**
 * 读取本地隐藏状态偏好（分组详情等独立页面用）。
 * @returns {string[]}
 */
export function readHiddenCollectStatuses() {
  try {
    const raw = localStorage.getItem(HIDDEN_COLLECT_STATUS_STORAGE_KEY)
    if (!raw) return []
    return normalizeHiddenCollectStatuses(JSON.parse(raw))
  } catch {
    return []
  }
}

/**
 * 逐件状态列表；无逐件数据时返回 null（按整条 collectStatus 判断）。
 * @param {object} item
 * @returns {string[]|null}
 */
function resolveUnitStatuses(item) {
  const raw = Array.isArray(item?.unitCollectStatusList) ? item.unitCollectStatusList : []
  if (raw.length === 0) return null

  const quantity = Math.max(1, Math.floor(Number(item?.quantity) || 1))
  const fallback = normalizeCollectStatus(item?.collectStatus)
  const statuses = raw
    .slice(0, quantity)
    .map((status) => normalizeCollectStatus(status))

  while (statuses.length < quantity) statuses.push(fallback)
  return statuses
}

/**
 * 按保留的原始下标过滤逐件数组；空数组/非数组原样返回。
 * @param {unknown} list
 * @param {number[]} keepIndexes
 * @returns {unknown}
 */
function filterUnitArray(list, keepIndexes) {
  if (!Array.isArray(list) || list.length === 0) return list
  return keepIndexes.map((index) => list[index])
}

/**
 * 时间线随件下标重排：隐藏件上的条目丢弃，保留件重映射到新下标；
 * 整批条目（无 unitIndex）不受影响。
 * @param {unknown} timeline
 * @param {Map<number, number>} indexMap
 * @returns {unknown}
 */
function remapTimeline(timeline, indexMap) {
  if (!Array.isArray(timeline) || timeline.length === 0) return timeline

  const next = []
  for (const entry of timeline) {
    const scope = getEntryUnitIndexes(entry)
    if (!scope) {
      next.push(entry)
      continue
    }

    const mapped = scope
      .map((index) => indexMap.get(index))
      .filter((index) => index != null)
    if (mapped.length === 0) continue

    const rest = { ...entry }
    delete rest.unitIndex
    delete rest.unitIndexes
    next.push({ ...rest, ...makeUnitScopeFields(mapped) })
  }
  return next
}

/**
 * 仅隐藏被选中状态的份数：全部份数命中时返回 null（整条隐藏），
 * 部分命中时返回裁剪后的副本（份数、逐件状态/价格/角色/出谷信息同步缩减）。
 * @param {object} item
 * @param {Set<string>} hiddenStatuses
 * @returns {object|null}
 */
export function hideUnitsByCollectStatus(item, hiddenStatuses) {
  if (!item || item.isWishlist || !hiddenStatuses?.size) return item

  const statuses = resolveUnitStatuses(item)
  if (!statuses) {
    return hiddenStatuses.has(normalizeCollectStatus(item.collectStatus)) ? null : item
  }

  const keepIndexes = []
  statuses.forEach((status, index) => {
    if (!hiddenStatuses.has(status)) keepIndexes.push(index)
  })

  if (keepIndexes.length === statuses.length) return item
  if (keepIndexes.length === 0) return null

  const unitCollectStatusList = keepIndexes.map((index) => statuses[index])
  const indexMap = new Map(keepIndexes.map((oldIndex, newIndex) => [oldIndex, newIndex]))
  const quantity = keepIndexes.length

  return {
    ...item,
    quantity,
    collectStatus: resolvePrimaryCollectStatus({
      collectStatus: item.collectStatus,
      unitCollectStatusList
    }),
    unitCollectStatusList,
    unitAcquiredAtList: filterUnitArray(item.unitAcquiredAtList, keepIndexes),
    unitActualPriceList: filterUnitArray(item.unitActualPriceList, keepIndexes),
    unitCharacterList: filterUnitArray(item.unitCharacterList, keepIndexes),
    unitSaleInfoList: filterUnitArray(item.unitSaleInfoList, keepIndexes),
    statusTimeline: remapTimeline(item.statusTimeline, indexMap)
  }
}

/**
 * 列表级过滤。无隐藏状态时原样返回（保持数组引用，避免无谓重渲染）。
 * @template {object} T
 * @param {T[]} items
 * @param {Iterable<string>|Set<string>} hiddenStatuses
 * @param {{ refresh?: (item: T) => T }} [options] - 视图层条目裁剪后需要重算派生字段时传入
 * @returns {T[]}
 */
export function applyHiddenCollectStatuses(items, hiddenStatuses, options = {}) {
  const hiddenSet = hiddenStatuses instanceof Set
    ? hiddenStatuses
    : new Set(normalizeHiddenCollectStatuses([...hiddenStatuses]))
  if (hiddenSet.size === 0) return items

  const { refresh } = options
  const result = []
  let changed = false

  for (const item of items) {
    const next = hideUnitsByCollectStatus(item, hiddenSet)
    if (next === item) {
      result.push(item)
      continue
    }

    changed = true
    if (!next) continue
    result.push(refresh ? refresh(/** @type {T} */ (next)) : /** @type {T} */ (next))
  }

  return changed ? result : items
}
