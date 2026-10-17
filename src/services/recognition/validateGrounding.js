// @ts-check
/**
 * 出处校验：识别结果的第一道（也是最硬的一道）防编造闸门。
 *
 * 模型被要求为每个字段给出依据的原文片段（`evidence[key]`），这里逐字段验证该片段
 * 确实出现在它自己回写的 `transcript` 里。对不上就说明这个值是编的，直接丢弃——
 * 这比任何提示词工程都可靠，也与具体模型无关。
 *
 * 三级结论：
 * - `verified: true`   出处存在且能对上 → 采用，置信度沿用模型给的
 * - `verified: null`   模型没给出处（能力/格式不完整）→ 采用但降级为「未经验证」
 * - 丢弃              给了出处但对不上 → 判定编造
 */

/** 全角 → 半角之后仍有差异的常见标点等价表（截图里全角更常见） */
const PUNCTUATION_EQUIVALENTS = {
  '￥': '¥',
  '﹩': '$',
  '（': '(',
  '）': ')',
  '【': '[',
  '】': ']',
  '「': '"',
  '」': '"',
  '『': '"',
  '』': '"',
  '：': ':',
  '；': ';',
  '，': ',',
  '。': '.',
  '！': '!',
  '？': '?',
  '、': ',',
  '＂': '"',
  '｜': '|',
  '／': '/',
  '－': '-',
  '～': '~'
}

/**
 * 匹配用归一：半角化、统一标点、去掉所有空白、小写。
 * 只用于「这段文字是否出现在转写里」的判断，不改变存给用户的值。
 * @param {unknown} text
 * @returns {string}
 */
export function normalizeForMatch(text) {
  let out = ''
  for (const char of String(text ?? '')) {
    const code = char.codePointAt(0) || 0
    // 全角 ASCII（！ 到 ～）→ 半角
    if (code >= 0xff01 && code <= 0xff5e) {
      out += String.fromCodePoint(code - 0xfee0)
      continue
    }
    if (code === 0x3000) continue // 全角空格
    if (/\s/.test(char)) continue
    out += char
  }
  let mapped = ''
  for (const char of out) mapped += PUNCTUATION_EQUIVALENTS[char] ?? char
  return mapped.toLowerCase()
}

/**
 * 出处片段是否真的能在这段转写里找到。
 * @param {unknown} sourceText 模型给出的原文片段
 * @param {unknown} transcript 模型回写的完整转写
 * @returns {boolean}
 */
export function isGrounded(sourceText, transcript) {
  const needle = normalizeForMatch(sourceText)
  if (!needle) return false
  return normalizeForMatch(transcript).includes(needle)
}

/**
 * 对一批抽取结果做出处校验。
 * @param {Record<string, any>} fields 字段值（已去掉空值）
 * @param {Record<string, string>} evidence 每个字段的原文出处
 * @param {string} transcript 完整转写
 * @returns {{
 *   fields: Record<string, { value: any, sourceText: string, verified: boolean | null }>,
 *   warnings: Array<{ code: string, field: string }>
 * }}
 */
export function applyGrounding(fields, evidence, transcript) {
  const source = fields && typeof fields === 'object' ? fields : {}
  const evidenceMap = evidence && typeof evidence === 'object' ? evidence : {}
  const warnings = []
  /** @type {Record<string, { value: any, sourceText: string, verified: boolean | null }>} */
  const kept = {}

  for (const [field, value] of Object.entries(source)) {
    const sourceText = String(evidenceMap[field] ?? '').trim()

    if (!sourceText) {
      // 模型没给出处：不当作编造（可能只是没按格式填），但不能算已验证
      kept[field] = { value, sourceText: '', verified: null }
      warnings.push({ code: 'evidence_missing', field })
      continue
    }

    if (!isGrounded(sourceText, transcript)) {
      warnings.push({ code: 'grounding_failed', field })
      continue
    }

    kept[field] = { value, sourceText, verified: true }
  }

  return { fields: kept, warnings }
}
