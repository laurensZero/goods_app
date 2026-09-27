// @ts-check
/**
 * 活动逐天票务纯函数：天数由 dates（YYYY-MM-DD 数组）得出，下标 i 对应 dates[i]。
 * store 归一化与编辑表单共用。
 */

// 逐天票务天数上限：防止误填超长日期区间（如年份手滑）生成上千行输入
export const MAX_DAY_TICKETS = 31

export function isDateStr(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim())
}

/** 校验、截断日期列表（不排序——票务按下标对齐） */
function normalizeDateList(dates) {
  let raw = dates
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
  return raw
    .map((item) => String(item || '').trim())
    .filter((item) => isDateStr(item))
    .slice(0, MAX_DAY_TICKETS)
}

/** 有效活动日列表 */
export function getEventDayDates(dates) {
  return normalizeDateList(dates)
}

/** 活动天数 */
export function parseDayCount(dates) {
  return normalizeDateList(dates).length
}

/** 第 index（0 起）天的日期字符串；越界或非法返回 '' */
export function getDayDate(dates, index) {
  return normalizeDateList(dates)[index] || ''
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
export function normalizeDayTicketList(list, dates) {
  const dayCount = parseDayCount(dates)
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

// 所有天的价格都填了才认为完整，完整时总和作为 ticketPrice（镜像谷子 resolveCompleteUnitActualPriceTotal）
export function resolveCompleteDayTicketTotal(list, dates) {
  const dayCount = parseDayCount(dates)
  if (dayCount < 2 || !Array.isArray(list) || list.length < dayCount) return ''

  let total = 0
  for (let i = 0; i < dayCount; i += 1) {
    const price = normalizeDayTicketPrice(list[i]?.price)
    if (!price) return ''
    total += Number.parseFloat(price)
  }
  return `${Math.round(total * 100) / 100}`
}
