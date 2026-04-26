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
export function formatPrice(price) {
  const num = parseFloat(price)
  if (isNaN(num)) return '—'
  return `¥${num.toFixed(2)}`
}
