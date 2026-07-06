// @ts-check
import { formatDate } from '@/utils/format'

/**
 * 向状态时间线追加一条新记录
 * @param {import('@/types/models').StatusTimelineEntry[]} timeline
 * @param {string} status - 新状态值
 * @param {{ at?: string, note?: string, unitIndex?: number }} [options]
 * @returns {import('@/types/models').StatusTimelineEntry[]}
 */
export function appendStatusTimelineEntry(timeline, status, options = {}) {
  const entry = {
    status,
    at: options.at || formatDate(new Date(), 'YYYY-MM-DD')
  }
  if (options.note) entry.note = options.note
  if (options.unitIndex != null) entry.unitIndex = options.unitIndex
  return [...(Array.isArray(timeline) ? timeline : []), entry]
}

/**
 * 批量更新多件商品的状态时间线（unitCollectStatusList 变更时）
 * @param {import('@/types/models').StatusTimelineEntry[]} timeline
 * @param {string[]} oldStatuses
 * @param {string[]} newStatuses
 * @param {string} [at]
 * @returns {import('@/types/models').StatusTimelineEntry[]}
 */
export function syncUnitStatusTimeline(timeline, oldStatuses, newStatuses, at) {
  const date = at || formatDate(new Date(), 'YYYY-MM-DD')
  const existing = Array.isArray(timeline) ? [...timeline] : []
  /** @type {import('@/types/models').StatusTimelineEntry[]} */
  const additions = []

  for (let i = 0; i < newStatuses.length; i++) {
    const oldStatus = oldStatuses[i] || ''
    const newStatus = newStatuses[i] || ''
    if (oldStatus && newStatus && oldStatus !== newStatus) {
      additions.push({ status: newStatus, at: date, unitIndex: i })
    }
  }

  return additions.length > 0 ? [...existing, ...additions] : existing
}
