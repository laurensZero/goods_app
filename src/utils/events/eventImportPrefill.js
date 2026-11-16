// @ts-check
/**
 * utils/events/eventImportPrefill.js
 * 从链接导入活动的预填数据传递与表单 patch 组装。
 *
 * 链路：导入弹层解析 + 场次/票种选择 → saveImportPrefill(sessionStorage) →
 * 跳 /events/add → applyImportPrefill 消费（读后即删）→ buildImportFormPatch
 * 生成表单 patch。
 *
 * 表单模型（见 utils/events/dayTickets.js、eventDates.js）：
 *   - 日期唯一存 form.dates（YYYY-MM-DD 数组），dayTicketList[i] 对齐 dates[i]，
 *     行结构 { price, ticketType }（无 date 字段）
 *   - 单天活动 dayTicketList 归一为空，票价走 ticketPrice + ticketType
 *   - 多天且逐天价格填满时，表单已有的深度 watch 会把总价汇总进 ticketPrice
 */

export const EVENT_IMPORT_PREFILL_KEY = 'goods-app:event-import-prefill'

const MAX_DATES = 31

/**
 * 保存导入预填数据（解析结果 + 用户勾选的场次/票种）。
 * @param {{ title?: string, location?: string, coverUrl?: string,
 *   dates?: string[], dayTickets?: Record<string, { price?: string, ticketType?: string } | null> }} payload
 */
export function saveImportPrefill(payload) {
  try {
    sessionStorage.setItem(EVENT_IMPORT_PREFILL_KEY, JSON.stringify(payload || {}))
  } catch {
    // sessionStorage 不可用时静默降级（预填失败不影响跳转）
  }
}

/**
 * 读取并清除导入预填数据。
 * @returns {Record<string, unknown> | null}
 */
export function consumeImportPrefill() {
  try {
    const raw = sessionStorage.getItem(EVENT_IMPORT_PREFILL_KEY)
    if (!raw) return null
    sessionStorage.removeItem(EVENT_IMPORT_PREFILL_KEY)
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    try {
      sessionStorage.removeItem(EVENT_IMPORT_PREFILL_KEY)
    } catch { /* ignore */ }
    return null
  }
}

/** 归一化日期字符串到 YYYY-MM-DD，非法返回 '' */
function normalizeDate(raw) {
  const match = String(raw || '').trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (!match) return ''
  return `${match[1]}-${String(Number(match[2])).padStart(2, '0')}-${String(Number(match[3])).padStart(2, '0')}`
}

/** 归一化价格：正数两位小数字符串，非法返回 ''（与 normalizeDayTicketPrice 行为一致） */
function normalizePrice(raw) {
  const num = Number(raw)
  if (!Number.isFinite(num) || num <= 0) return ''
  return String(Math.round(num * 100) / 100)
}

/**
 * 由导入弹层的场次行收集要预填的日期与票档。
 * 选中票档即代表导入该日期；本身没有票档数据的场次始终导入（只填日期）。
 * @param {Array<{ date?: string, tickets?: Array<{ name?: string, price?: string }>, ticketIndex?: number }>} rows
 * @returns {{ dates: string[], dayTickets: Record<string, { price: string, ticketType: string }> }}
 */
export function collectSessionSelection(rows) {
  const dates = []
  const dayTickets = {}
  for (const row of Array.isArray(rows) ? rows : []) {
    const date = normalizeDate(row?.date)
    if (!date) continue
    const tickets = Array.isArray(row?.tickets) ? row.tickets : []
    if (tickets.length === 0) {
      dates.push(date)
      continue
    }
    const index = Number(row?.ticketIndex)
    if (!Number.isInteger(index) || index < 0 || index >= tickets.length) continue
    const ticket = tickets[index] || {}
    dates.push(date)
    dayTickets[date] = {
      price: String(ticket.price ?? ''),
      ticketType: String(ticket.name || '').trim()
    }
  }
  return { dates, dayTickets }
}

/**
 * 由导入 payload 组装活动表单 patch。
 * @param {Record<string, unknown>} payload saveImportPrefill 存入的数据
 * @returns {{ name?: string, location?: string, coverImage?: string,
 *   dates?: string[], dayTicketList?: Array<{ price: string, ticketType: string }>,
 *   ticketPrice?: string, ticketType?: string } | null}
 *   无可填内容时返回 null。
 */
export function buildImportFormPatch(payload) {
  if (!payload || typeof payload !== 'object') return null

  const name = String(payload.title || '').trim()
  const location = String(payload.location || '').trim()
  const coverImage = String(payload.coverUrl || '').trim()

  const seen = new Set()
  const dates = (Array.isArray(payload.dates) ? payload.dates : [])
    .map(normalizeDate)
    .filter((date) => {
      if (!date || seen.has(date)) return false
      seen.add(date)
      return true
    })
    .sort()
    .slice(0, MAX_DATES)

  const dayTickets = payload.dayTickets && typeof payload.dayTickets === 'object' ? payload.dayTickets : {}

  /** @type {Record<string, any>} */
  const patch = {}
  if (name) patch.name = name
  if (location) patch.location = location
  if (coverImage) patch.coverImage = coverImage

  if (dates.length === 1) {
    // 单天：票价走 ticketPrice + ticketType（dayTicketList 会被表单归一为空）
    const chosen = dayTickets[dates[0]]
    patch.dates = dates
    if (chosen) {
      const price = normalizePrice(chosen.price)
      const ticketType = String(chosen.ticketType || '').trim()
      if (price) patch.ticketPrice = price
      if (ticketType) patch.ticketType = ticketType
    }
  } else if (dates.length > 1) {
    // 多天：构造与 dates 下标对齐的 dayTicketList（未选票种的天留空行）；
    // 全部填满时表单已有 watch 会自动汇总 ticketPrice
    patch.dates = dates
    patch.dayTicketList = dates.map((date) => {
      const chosen = dayTickets[date]
      return {
        price: chosen ? normalizePrice(chosen.price) : '',
        ticketType: chosen ? String(chosen.ticketType || '').trim() : ''
      }
    })
  } else if (name || location || coverImage) {
    // 没选任何场次：只填名称/地点/封面
    return patch
  } else {
    return null
  }

  return patch
}
