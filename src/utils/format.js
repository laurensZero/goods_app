/**
 * utils/format.js
 * 日期、价格等格式化辅助函数。
 */

/**
 * 格式化日期
 * @param {Date|string} date
 * @param {string} pattern  支持 YYYY-MM-DD / YYYY年MM月DD日 / YYYY-MM-DD HH:mm 等
 * @returns {string}
 *
 * @example
 * formatDate(new Date(), 'YYYY-MM-DD')   // '2026-03-08'
 * formatDate('2026-01-01', 'YYYY年MM月DD日') // '2026年01月01日'
 * formatDate(new Date(), 'YYYY-MM-DD HH:mm') // '2026-04-26 18:30'
 */
export function formatDate(date, pattern = 'YYYY-MM-DD') {
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return ''

  const pad = (n) => String(n).padStart(2, '0')
  return pattern
    .replace('YYYY', d.getFullYear())
    .replace('MM', pad(d.getMonth() + 1))
    .replace('DD', pad(d.getDate()))
    .replace('HH', pad(d.getHours()))
    .replace('mm', pad(d.getMinutes()))
}

/**
 * 格式化价格，保留两位小数并添加 ¥ 前缀
 * @param {number|string} price
 * @returns {string}
 *
 * @example
 * formatPrice(99)     // '¥99.00'
 * formatPrice(1888.8) // '¥1888.80'
 */
import { CURRENCY_MAP, DEFAULT_CURRENCY } from '@/constants/currencies'

export function formatPrice(price) {
  const num = parseFloat(price)
  if (isNaN(num)) return '—'
  return `¥${num.toFixed(2)}`
}

/**
 * 格式化带币种符号的价格
 * @param {number|string} amount
 * @param {string} currencyCode 如 'CNY', 'USD', 'JPY'
 * @returns {string} 如 '¥1280.00' / '$19.99' / '¥5800'
 */
export function formatCurrency(amount, currencyCode = DEFAULT_CURRENCY) {
  const num = parseFloat(amount)
  if (isNaN(num)) return '—'
  const info = CURRENCY_MAP[currencyCode] || CURRENCY_MAP[DEFAULT_CURRENCY]
  const formatted = Number.isInteger(num) ? String(num) : num.toFixed(2)
  return `${info.symbol}${formatted}`
}

/**
 * 返回换算为 CNY 的展示文本（非 CNY 币种时）
 * @param {number|string} amount 原始金额
 * @param {string} currencyCode 原始币种
 * @param {Function} convertToCNY 汇率换算函数 (amount, currency) => number
 * @returns {string} '≈ ¥123.45' 或 ''（CNY 时）
 */
export function formatCNYConverted(amount, currencyCode, convertToCNY) {
  if (!currencyCode || currencyCode === 'CNY') return ''
  const num = parseFloat(amount)
  if (isNaN(num) || num <= 0) return ''
  const cny = convertToCNY(num, currencyCode)
  if (!cny || cny <= 0) return ''
  return `≈ ¥${cny.toFixed(2)}`
}
