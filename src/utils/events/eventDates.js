// @ts-check
/**
 * 活动日期：唯一存储为 dates JSON 数组（YYYY-MM-DD，升序、去重）。
 * - []           → 无日期
 * - 连续若干天   → 展示时收成 `start - end`
 * - 不连续若干天 → 展示时列出各天
 *
 * 不再使用 startDate / endDate / selectedDates 三列，避免同步时互相覆盖。
 */

import { isDateStr, MAX_DAY_TICKETS } from './dayTickets'

const DAY_MS = 24 * 60 * 60 * 1000

/** 校验、去重、升序、截断；兼容 JSON 字符串与脏数据 */
export function normalizeEventDates(list, max = MAX_DAY_TICKETS) {
  let raw = list
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return []
    try {
      raw = JSON.parse(trimmed)
    } catch {
      return []
    }
  }
  if (!Array.isArray(raw)) return []
  const seen = new Set()
  const out = []
  for (const item of raw) {
    const s = String(item || '').trim()
    if (!isRealDateStr(s) || seen.has(s)) continue
    seen.add(s)
    out.push(s)
  }
  out.sort()
  return out.slice(0, max)
}

/** YYYY-MM-DD 且是真实存在的日历日（排除 2026-02-31 这类） */
function isRealDateStr(value) {
  const s = String(value || '').trim()
  if (!isDateStr(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
}

/**
 * 从活动对象提取 dates；兼容旧三列（startDate/endDate/selectedDates）以便迁移回填。
 * dates 为空时回退旧字段，避免升级后历史数据丢日期。
 */
export function resolveEventDates(event = {}) {
  if (event == null) return []
  const current = normalizeEventDates(event.dates)
  if (current.length > 0) return current
  const legacySelected = normalizeEventDates(event.selectedDates)
  if (legacySelected.length > 0) return legacySelected
  const start = String(event.startDate || '').trim()
  if (!isRealDateStr(start)) return []
  return expandContinuousRange(start, event.endDate)
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

/** 活动有效日列表 = dates */
export function getEventDayDates(eventOrDates, max = MAX_DAY_TICKETS) {
  if (Array.isArray(eventOrDates) || typeof eventOrDates === 'string') {
    return normalizeEventDates(eventOrDates, max)
  }
  return resolveEventDates(eventOrDates).slice(0, max)
}

/** 首日（排序用） */
export function getFirstEventDate(event) {
  const dates = resolveEventDates(event)
  return dates[0] || ''
}

/** 是否恰好是完整连续区间 */
export function isFullContinuousRange(dates) {
  const selected = normalizeEventDates(dates, Number.MAX_SAFE_INTEGER)
  if (selected.length <= 1) return true
  const continuous = expandContinuousRange(selected[0], selected[selected.length - 1], Number.MAX_SAFE_INTEGER)
  if (continuous.length !== selected.length) return false
  return continuous.every((d, i) => d === selected[i])
}

/** 日历选中的天 → 存储用 dates 数组 */
export function selectionToEventDates(dates) {
  return normalizeEventDates(dates)
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
 * - 不连续几天：≤8 天列出 MM-DD，过多时 `start - end · N 天`
 */
export function formatEventDateDisplay(event, { daysUnit = '天' } = {}) {
  const dates = Array.isArray(event) ? normalizeEventDates(event) : resolveEventDates(event)
  if (dates.length === 0) return ''
  if (dates.length === 1) return dates[0]
  const start = dates[0]
  const end = dates[dates.length - 1]
  if (isFullContinuousRange(dates)) {
    return `${start} - ${end}`
  }
  if (dates.length <= 8) {
    return dates.map((d) => d.slice(5)).join('、')
  }
  return `${start} - ${end} · ${dates.length}${daysUnit}`
}
