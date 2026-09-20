// @ts-check
/**
 * 活动日期：时间段（开始–结束连续区间）与单独几天（可不连续）。
 * 空 selectedDates = 连续区间；非空 = 仅这些天（start/end 取 min/max 便于排序展示）。
 */

import { isDateStr, MAX_DAY_TICKETS } from './dayTickets'

const DAY_MS = 24 * 60 * 60 * 1000

/** 校验、去重、升序；非法项丢弃 */
export function normalizeSelectedDates(list) {
  if (!Array.isArray(list)) return []
  const seen = new Set()
  const out = []
  for (const item of list) {
    const s = String(item || '').trim()
    if (!isDateStr(s) || seen.has(s)) continue
    seen.add(s)
    out.push(s)
  }
  out.sort()
  return out
}

/** 解析 start/end/selectedDates，产出规范字段（bounds 与列表一致） */
export function resolveEventDateFields({ startDate, endDate, selectedDates } = {}) {
  const selected = normalizeSelectedDates(selectedDates)
  if (selected.length > 0) {
    const capped = selected.slice(0, MAX_DAY_TICKETS)
    return {
      startDate: capped[0],
      endDate: capped[capped.length - 1],
      selectedDates: capped
    }
  }
  const start = String(startDate || '').trim()
  let end = String(endDate || '').trim()
  if (start && (!isDateStr(end) || end < start)) end = start
  return {
    startDate: isDateStr(start) ? start : '',
    endDate: isDateStr(start) ? end : '',
    selectedDates: []
  }
}

/** 某日 + offset 天 → YYYY-MM-DD */
export function addDays(dateStr, offset) {
  if (!isDateStr(dateStr)) return ''
  const ms = new Date(`${dateStr}T00:00:00`).getTime() + offset * DAY_MS
  if (!Number.isFinite(ms)) return ''
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 连续区间展开（含首尾），非法/超长截断 */
export function expandContinuousRange(startDate, endDate, max = MAX_DAY_TICKETS) {
  const start = String(startDate || '').trim()
  if (!isDateStr(start)) return []
  const endRaw = String(endDate || '').trim()
  const end = isDateStr(endRaw) && endRaw >= start ? endRaw : start
  const startMs = new Date(`${start}T00:00:00`).getTime()
  const endMs = new Date(`${end}T00:00:00`).getTime()
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return [start]
  const count = Math.min(max, Math.round((endMs - startMs) / DAY_MS) + 1)
  return Array.from({ length: count }, (_, i) => addDays(start, i)).filter(Boolean)
}

/**
 * 活动「有效日期」列表：
 * - selectedDates 非空 → 这些天（可能不连续）
 * - 否则 → start~end 连续区间
 */
export function getEventDayDates(startDate, endDate, selectedDates = null, max = MAX_DAY_TICKETS) {
  const selected = normalizeSelectedDates(selectedDates)
  if (selected.length > 0) return selected.slice(0, max)
  return expandContinuousRange(startDate, endDate, max)
}

/** 是否恰好覆盖 start~end 的完整连续区间 */
export function isFullContinuousRange(selectedDates, startDate, endDate) {
  const selected = normalizeSelectedDates(selectedDates)
  if (selected.length === 0) return true
  const continuous = expandContinuousRange(startDate, endDate)
  if (continuous.length !== selected.length) return false
  return continuous.every((d, i) => d === selected[i])
}

/**
 * 把日历选中的天收敛为存储字段：
 * - 空 → 清空
 * - 连续完整一段 → range（selectedDates 空）
 * - 否则 → selectedDates + min/max bounds
 */
export function selectionToEventDates(dates) {
  const selected = normalizeSelectedDates(dates)
  if (selected.length === 0) {
    return { startDate: '', endDate: '', selectedDates: [] }
  }
  const start = selected[0]
  const end = selected[selected.length - 1]
  if (isFullContinuousRange(selected, start, end)) {
    return { startDate: start, endDate: end, selectedDates: [] }
  }
  return { startDate: start, endDate: end, selectedDates: selected.slice(0, MAX_DAY_TICKETS) }
}

/** 日历月视图格子：前置 null 补齐，后为 YYYY-MM-DD */
export function buildMonthCells(year, month) {
  const y = Number(year)
  const m = Number(month)
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return []
  const first = new Date(y, m - 1, 1)
  const pad = first.getDay()
  const daysInMonth = new Date(y, m, 0).getDate()
  const cells = []
  for (let i = 0; i < pad; i += 1) cells.push(null)
  for (let d = 1; d <= daysInMonth; d += 1) {
    cells.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  return cells
}

/**
 * 展示文案：
 * - 无日期 → ''
 * - 单日 → 该日
 * - 连续区间 → `start - end`
 * - 单独几天（≤4）→ 日期列表
 * - 单独几天（更多）→ `start - end · N{daysUnit}`
 */
export function formatEventDateDisplay(event, { daysUnit = '天' } = {}) {
  const { startDate, endDate, selectedDates } = resolveEventDateFields(event || {})
  if (!startDate && selectedDates.length === 0) return ''
  if (selectedDates.length === 0) {
    if (!endDate || endDate === startDate) return startDate
    return `${startDate} - ${endDate}`
  }
  if (selectedDates.length === 1) return selectedDates[0]
  if (isFullContinuousRange(selectedDates, startDate, endDate)) {
    return `${startDate} - ${endDate}`
  }
  if (selectedDates.length <= 4) {
    return selectedDates.map((d) => d.slice(5)).join('、')
  }
  return `${startDate} - ${endDate} · ${selectedDates.length}${daysUnit}`
}
