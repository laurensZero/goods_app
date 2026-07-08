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

/**
 * 批量同步逐份购入日期到时间线（unitAcquiredAtList 变更时）
 * @param {import('@/types/models').StatusTimelineEntry[]} timeline
 * @param {string[]} oldUnitDates
 * @param {string[]} newUnitDates
 * @param {string[]} unitStatuses - 每份对应的状态
 * @returns {import('@/types/models').StatusTimelineEntry[]}
 */
export function syncUnitAcquiredTimeline(timeline, oldUnitDates, newUnitDates, unitStatuses) {
  const existing = Array.isArray(timeline) ? [...timeline] : []
  /** @type {import('@/types/models').StatusTimelineEntry[]} */
  const additions = []

  for (let i = 0; i < newUnitDates.length; i++) {
    const oldDate = String(oldUnitDates[i] || '').trim()
    const newDate = String(newUnitDates[i] || '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) continue
    if (oldDate === newDate) continue

    const status = (unitStatuses && unitStatuses[i]) ? String(unitStatuses[i]).trim() : '已拥有'
    additions.push({ status, at: newDate, unitIndex: i })
  }

  if (additions.length === 0) return existing

  // 移除已有同 unitIndex 的旧日期条目，用新条目替换
  const filtered = existing.filter((entry) => {
    if (entry.unitIndex == null) return true
    return !additions.some((a) => a.unitIndex === entry.unitIndex)
  })

  return [...filtered, ...additions].sort((a, b) => a.at.localeCompare(b.at))
}

/**
 * 标准化时间线日期字符串
 * @param {string} value
 * @returns {string}
 */
export function normalizeTimelineDate(value) {
  const normalized = String(value || '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : ''
}

/**
 * 从时间线中获取某个状态的开始日期
 * @param {object} item
 * @param {string} status
 * @param {number|null} [unitIndex]
 * @returns {string}
 */
export function getTimelineStartDate(item, status, unitIndex = null) {
  const timeline = Array.isArray(item?.statusTimeline) ? item.statusTimeline : []
  const normalizedStatus = String(status || '').trim()
  const hasUnitIndex = Number.isInteger(unitIndex)

  let latestWithUnit = ''
  let latestWithUnitTimestamp = 0
  let latestWithoutUnit = ''
  let latestWithoutUnitTimestamp = 0

  for (const entry of timeline) {
    if (!entry || typeof entry !== 'object') continue
    if (normalizedStatus && String(entry.status || '').trim() !== normalizedStatus) continue

    const date = normalizeTimelineDate(entry.at)
    if (!date) continue
    const timestamp = Date.parse(date)
    if (!Number.isFinite(timestamp)) continue

    if (hasUnitIndex) {
      if (Number.isInteger(entry.unitIndex) && entry.unitIndex === unitIndex) {
        if (timestamp > latestWithUnitTimestamp) {
          latestWithUnit = date
          latestWithUnitTimestamp = timestamp
        }
        continue
      }

      if (!Number.isInteger(entry.unitIndex) && timestamp > latestWithoutUnitTimestamp) {
        latestWithoutUnit = date
        latestWithoutUnitTimestamp = timestamp
      }
      continue
    }

    if (timestamp > latestWithoutUnitTimestamp) {
      latestWithoutUnit = date
      latestWithoutUnitTimestamp = timestamp
    }
  }

  return latestWithUnit || latestWithoutUnit
}

/**
 * 从日期字符串计算持有天数
 * @param {string} date
 * @returns {number|null}
 */
export function getHoldingDaysFromDate(date) {
  if (!date) return null
  const diff = Date.now() - new Date(date).getTime()
  const days = Math.floor(diff / 86400000)
  return days >= 0 ? days : null
}
