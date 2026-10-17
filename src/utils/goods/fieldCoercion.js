// @ts-check
/**
 * 谷子字段的文本归一与类型转换（表格导入 / 拍照识别共用）。
 *
 * 这里同时是两件事的唯一登记处：
 * - `MAPPABLE_FIELDS`：允许被外部映射写入的字段白名单；
 * - 字段形态集合（数组 / 布尔 / 日期 / 金额），外部据此生成 JSON Schema。
 *
 * 表格导入（`services/ai/tableImportTools.js`）与识别预填都走这里做类型收敛，
 * 避免同一套「裸文本 → 谷子字段」规则各写一份后逐渐漂移。
 */

/** 可映射到谷子的字段（对齐 writeTools WRITABLE_FIELDS 的常用子集） */
export const MAPPABLE_FIELDS = [
  'name', 'category', 'ip', 'characters', 'tags', 'variant', 'storageLocation',
  'price', 'actualPrice', 'currency', 'quantity',
  'acquiredAt', 'isWishlist', 'note',
  'collectStatus', 'sellPrice', 'sellPlatform', 'sellDate', 'saleAt'
]

/** 需要数组的字段：单元格按分隔符自动拆 */
export const ARRAY_FIELDS = new Set(['characters', 'tags'])

/**
 * 数组字段的分隔符：中英逗号、顿号、分号、竖线与斜杠。
 * 全角逗号「，」已纳入——中文输入法默认全角，识别与粘贴场景大量出现。
 */
export const ARRAY_SPLIT_PATTERN = /[,，、;；|/]+/

/** 需要布尔的字段 */
export const BOOL_FIELDS = new Set(['isWishlist'])

/** 日期字段：统一尝试多种常见格式 → YYYY-MM-DD */
export const DATE_FIELDS = new Set(['acquiredAt', 'sellDate', 'saleAt'])

/** 金额字段：清掉货币符号与千分位后校验为纯数字串（保持字符串，避免浮点误差） */
export const MONEY_FIELDS = new Set(['price', 'actualPrice', 'sellPrice'])

/** 日期解析尝试顺序 */
export const DATE_FORMATS = [
  /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
  /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/,
  /^(\d{4})\.(\d{1,2})\.(\d{1,2})$/,
  /^(\d{4})年(\d{1,2})月(\d{1,2})日$/,
  /^(\d{4})(\d{2})(\d{2})$/
]

/**
 * 常见日期格式 → YYYY-MM-DD；无法识别返回空串（不抛错，由调用方决定怎么报）。
 * @param {string} value
 * @returns {string}
 */
export function normalizeDate(value) {
  for (const re of DATE_FORMATS) {
    const m = value.match(re)
    if (!m) continue
    const y = m[1]
    const mo = String(Number(m[2])).padStart(2, '0')
    const d = String(Number(m[3])).padStart(2, '0')
    if (Number(m[2]) < 1 || Number(m[2]) > 12 || Number(m[3]) < 1 || Number(m[3]) > 31) continue
    return `${y}-${mo}-${d}`
  }
  return ''
}

/**
 * 单个单元格/字段值的类型收敛。空值返回 undefined（调用方据此判断「该字段没值」）。
 * 日期、数量、金额格式不可识别时抛错——导入/预填场景宁可报错让用户看，也不要静默写脏值。
 * @param {string} field
 * @param {unknown} raw
 * @returns {any}
 */
export function coerceValue(field, raw) {
  const value = String(raw ?? '').trim()
  if (value === '') return undefined
  if (ARRAY_FIELDS.has(field)) {
    return value.split(ARRAY_SPLIT_PATTERN).map((s) => s.trim()).filter(Boolean)
  }
  if (BOOL_FIELDS.has(field)) {
    if (['1', 'true', '是', 'y', 'yes'].includes(value.toLowerCase()) || value === '✓') return true
    if (['0', 'false', '否', 'n', 'no'].includes(value.toLowerCase()) || value === '✗') return false
    return undefined
  }
  if (DATE_FIELDS.has(field)) {
    const normalized = normalizeDate(value)
    if (!normalized) throw new Error(`无法识别日期：「${value}」（需 YYYY-MM-DD）`)
    return normalized
  }
  if (field === 'quantity') {
    const n = Number(value.replace(/[^\d.-]/g, ''))
    if (!Number.isFinite(n) || n < 1) throw new Error(`数量无效：「${value}」（需 ≥ 1 的数字）`)
    return Math.floor(n)
  }
  if (MONEY_FIELDS.has(field)) {
    const cleaned = value.replace(/[¥$€£,\s]/g, '')
    if (cleaned === '') return undefined
    if (!/^-?\d+(\.\d+)?$/.test(cleaned)) throw new Error(`金额格式无法识别：「${value}」`)
    return cleaned
  }
  return value
}

/**
 * 整批默认值清洗：只保留白名单字段与非空值。
 * @param {Record<string, any>} [defaults]
 * @returns {Record<string, any>}
 */
export function normalizeDefaults(defaults) {
  if (!defaults || typeof defaults !== 'object' || Array.isArray(defaults)) return {}
  /** @type {Record<string, any>} */
  const out = {}
  for (const [key, value] of Object.entries(defaults)) {
    if (!MAPPABLE_FIELDS.includes(key)) continue
    if (value === undefined || value === null || value === '') continue
    out[key] = value
  }
  return out
}
