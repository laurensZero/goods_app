// @ts-check
/**
 * 识别结果 → 编辑表单预填计划（纯函数，零 Vue / UI 依赖）。
 *
 * 三条规则，都能单测：
 * 1. **不覆盖用户已填的内容**——只在目标字段当前为空时预填。识别是「建议」，
 *    用户已经打了一半的字不该被冲掉；被跳过的字段如实报出来，不静默丢弃。
 * 2. **不是所有字段都适用**——心愿单模式下 `actualPrice` / `acquiredAt` 会被表单
 *    自己清空，预填它们只会造出一个看不见的脏值，所以由调用方按 `exclude` 排除。
 * 3. **低置信不进表单**——置信度判定已在 `recognizeImage` 完成（low 会被留在服务层），
 *    这里只负责把 medium / 未验证的字段标出来，让 UI 提示「请核对」。
 */

/** 识别结果里能落到编辑表单的字段（与 GoodsEditorForm 的 form 字段同名） */
export const FORM_PREFILL_FIELDS = [
  'name',
  'category',
  'ip',
  'characters',
  'price',
  'actualPrice',
  'acquiredAt'
]

/**
 * @param {unknown} value
 * @returns {boolean} 是否视为「空」（空串 / 全空白 / 空数组 / null）
 */
export function isEmptyFormValue(value) {
  if (value === undefined || value === null) return true
  if (Array.isArray(value)) return value.length === 0
  return String(value).trim() === ''
}

/**
 * @param {Object} options
 * @param {Record<string, { value: any, confidence?: string, verified?: boolean | null }>} [options.fields] recognizeImage() 的 fields
 * @param {Record<string, any>} [options.current] 表单当前值（同名键）
 * @param {string[]} [options.exclude] 本次不适用、不预填的字段
 * @returns {{
 *   assignments: Record<string, any>,
 *   filled: string[],
 *   skipped: string[],
 *   notRecognized: string[],
 *   notApplicable: string[],
 *   uncertain: string[],
 *   unverified: string[]
 * }}
 */
export function planFormPrefill({ fields, current, exclude = [] } = {}) {
  const recognized = fields && typeof fields === 'object' ? fields : {}
  const currentValues = current && typeof current === 'object' ? current : {}
  const excluded = new Set(Array.isArray(exclude) ? exclude : [])

  /** @type {Record<string, any>} */
  const assignments = {}
  const filled = []
  const skipped = []
  const notRecognized = []
  const notApplicable = []
  const uncertain = []
  const unverified = []

  for (const field of FORM_PREFILL_FIELDS) {
    if (excluded.has(field)) {
      notApplicable.push(field)
      continue
    }

    const entry = recognized[field]
    if (!entry || isEmptyFormValue(entry.value)) {
      notRecognized.push(field)
      continue
    }

    if (!isEmptyFormValue(currentValues[field])) {
      skipped.push(field)
      continue
    }

    assignments[field] = entry.value
    filled.push(field)
    if (entry.confidence === 'medium') uncertain.push(field)
    if (entry.verified === null) unverified.push(field)
  }

  return { assignments, filled, skipped, notRecognized, notApplicable, uncertain, unverified }
}
