// @ts-check
/**
 * 活动逐天票务纯函数：天数由 startDate~endDate 区间得出，列表下标 i 对应第 i+1 天。
 * store 归一化与编辑表单共用，保证两侧对「第 N 天」的理解一致。
 */

// 逐天票务天数上限：防止误填超长日期区间（如年份手滑）生成上千行输入
export const MAX_DAY_TICKETS = 31

const DAY_MS = 24 * 60 * 60 * 1000

export function isDateStr(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim())
}

/** 区间含首尾；无开始日期为 0 天，结束早于开始或非法时按 1 天，超长截断到上限 */
export function parseDayCount(startDate, endDate) {
  const start = String(startDate || '').trim()
  if (!isDateStr(start)) return 0
  const end = String(endDate || '').trim()
  if (!isDateStr(end)) return 1
  const startMs = new Date(`${start}T00:00:00`).getTime()
  const endMs = new Date(`${end}T00:00:00`).getTime()
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return 1
  return Math.min(MAX_DAY_TICKETS, Math.round((endMs - startMs) / DAY_MS) + 1)
}

/** 第 index（0 起）天的日期字符串；无法解析时返回 '' */
export function getDayDate(startDate, index) {
  const start = String(startDate || '').trim()
  if (!isDateStr(start) || index < 0) return ''
  const ms = new Date(`${start}T00:00:00`).getTime() + index * DAY_MS
  if (!Number.isFinite(ms)) return ''
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function normalizeDayTicketPrice(value) {
  if (value === '' || value == null) return ''
  const numeric = Number.parseFloat(String(value).trim())
  if (!Number.isFinite(numeric) || numeric < 0) return ''
  return `${Math.round(numeric * 100) / 100}`
}

/**
 * 归一化逐天票务列表：截断到天数、价格规范化、票种 trim、整行空裁尾。
 * 单天（或无日期）不保留逐天数据，走 ticketPrice 单价字段。
 */
export function normalizeDayTicketList(list, startDate, endDate) {
  const dayCount = parseDayCount(startDate, endDate)
  if (dayCount < 2 || !Array.isArray(list)) return []

  const normalized = list.slice(0, dayCount).map((item) => {
    if (!item || typeof item !== 'object') return null
    const price = normalizeDayTicketPrice(item.price)
    const ticketType = String(item.ticketType || '').trim()
    if (!price && !ticketType) return null
    return { price, ticketType }
  })

  while (normalized.length > 0 && !normalized[normalized.length - 1]) {
    normalized.pop()
  }

  return normalized
}

// 所有天的价格都填了才视为完整，完整时总和作为 ticketPrice（镜像谷子 resolveCompleteUnitActualPriceTotal）
export function resolveCompleteDayTicketTotal(list, startDate, endDate) {
  const dayCount = parseDayCount(startDate, endDate)
  if (dayCount < 2 || !Array.isArray(list) || list.length < dayCount) return ''

  let total = 0
  for (let i = 0; i < dayCount; i += 1) {
    const price = normalizeDayTicketPrice(list[i]?.price)
    if (!price) return ''
    total += Number.parseFloat(price)
  }
  return `${Math.round(total * 100) / 100}`
}
