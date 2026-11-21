// @ts-check
/**
 * 活动逐天地点纯函数：天数由 dates（YYYY-MM-DD 数组）得出，下标 i 对应 dates[i]。
 * 条目 = { location, city, latitude, longitude }，与 dayTicketList 同一套下标对齐约定。
 * - 某天条目携带自定义地点（location/city 非空）→ 该天用条目里的地点/坐标；
 * - 否则该天回落活动级 location/city/latitude/longitude。
 * 单天（或无日期）不保留逐天数据，走主字段——与 normalizeDayTicketList 的口径一致。
 * store 归一化、编辑表单与活动地图共用。
 */

import { MAX_DAY_TICKETS, isDateStr } from './dayTickets'

/** 与 dates 对齐的天数；兼容 JSON 字符串形态（SQLite 列直读） */
function parseDayCount(dates) {
  let raw = dates
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return 0
    try {
      raw = JSON.parse(trimmed)
    } catch {
      return 0
    }
  }
  if (!Array.isArray(raw)) return 0
  return raw.filter((item) => isDateStr(item)).length
}

/**
 * 归一化单天地点条目：字段 trim；location 与 city 都为空视为空行返回 null
 * （只有坐标没有地点文本的条目不参与回落判定，直接丢弃防脏数据）。
 */
export function normalizeDayLocationEntry(item) {
  if (!item || typeof item !== 'object') return null
  const entry = {
    location: String(item.location || '').trim(),
    city: String(item.city || '').trim(),
    latitude: String(item.latitude || '').trim(),
    longitude: String(item.longitude || '').trim()
  }
  if (!entry.location && !entry.city) return null
  return entry
}

/** 条目是否携带自定义地点（location 或 city 非空）——地图/展示层据此判定是否回落主地点 */
export function hasDayLocationOverride(entry) {
  return Boolean(
    entry &&
    (String(entry.location || '').trim() || String(entry.city || '').trim())
  )
}

/** 读取活动对象上的逐天地点列表：兼容数组与 JSON 字符串形态（SQLite 列直读） */
export function getDayLocationList(eventOrList) {
  if (eventOrList == null) return []
  let raw = eventOrList
  if (!Array.isArray(eventOrList) && typeof eventOrList === 'object') {
    raw = eventOrList.dayLocations
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return []
    try {
      raw = JSON.parse(trimmed)
    } catch {
      return []
    }
  }
  return Array.isArray(raw) ? raw : []
}

/**
 * 归一化逐天地点列表：截断到天数（按下标对齐，不排序）、空行置 null、裁掉尾部空行。
 * 尾部空行裁剪与 normalizeDayTicketList 一致；中段空行保留占位维持与 dates 的下标对齐。
 */
export function normalizeDayLocationList(list, dates) {
  const dayCount = parseDayCount(dates)
  if (dayCount < 2 || !Array.isArray(list)) return []

  const normalized = list
    .slice(0, Math.min(dayCount, MAX_DAY_TICKETS))
    .map(normalizeDayLocationEntry)

  while (normalized.length > 0 && !normalized[normalized.length - 1]) {
    normalized.pop()
  }

  return normalized
}
