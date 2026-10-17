// @ts-check
/**
 * 词表收敛：把模型从图里读出来的名称，对齐到用户已有的品类 / IP / 角色写法。
 *
 * 三级匹配：
 * - `exact`  归一后完全相同（含全半角、大小写、空格差异）
 * - `fuzzy`  拼音相同（抓「納西妲 / 纳西妲」这类繁简与形近差异）或一方包含另一方（长度 ≥ 2）
 * - `none`   词表里没有 → **保留模型原值**但降级为「未命中词表」，交用户确认
 *
 * 为什么不把词表钉成 JSON Schema 的 enum：模型拿不准时会把值硬塞进最接近的枚举项，
 * 比留空更糟；也会丢掉用户词表里还没有的新 IP / 角色（本 App 本来就从谷子同步词表）。
 */

import { toPinyinKey } from '@/utils/pinyin'

/** 匹配用的归一：去空白 + 小写（不做全半角展开，交由拼音层处理中文差异） */
export function normalizeVocabText(text) {
  return String(text ?? '').trim().replace(/\s+/g, '').toLowerCase()
}

const HAN_PATTERN = /[\u4e00-\u9fff]/

/** 子串匹配的最短长度：太短会把「立」匹到「立牌」 */
const MIN_SUBSTRING_LENGTH = 2

/**
 * 把一个原始名称对齐到候选词表。
 * @param {unknown} rawValue
 * @param {string[]} candidates
 * @returns {{ value: string, match: 'exact' | 'fuzzy' | 'none' }}
 */
export function matchVocabulary(rawValue, candidates) {
  const raw = String(rawValue ?? '').trim()
  const list = (Array.isArray(candidates) ? candidates : []).filter(Boolean)
  if (!raw || list.length === 0) return { value: raw, match: 'none' }

  const key = normalizeVocabText(raw)

  for (const candidate of list) {
    if (normalizeVocabText(candidate) === key) return { value: candidate, match: 'exact' }
  }

  // 拼音同音：只有含汉字时才尝试，避免把纯英文/日文假名卷进来
  if (HAN_PATTERN.test(raw)) {
    const pinyinKey = toPinyinKey(raw)
    if (pinyinKey && pinyinKey !== normalizeVocabText(raw)) {
      for (const candidate of list) {
        if (toPinyinKey(candidate) === pinyinKey) return { value: candidate, match: 'fuzzy' }
      }
    }
  }

  if (key.length >= MIN_SUBSTRING_LENGTH) {
    for (const candidate of list) {
      const candidateKey = normalizeVocabText(candidate)
      if (candidateKey.length < MIN_SUBSTRING_LENGTH) continue
      if (candidateKey.includes(key) || key.includes(candidateKey)) {
        return { value: candidate, match: 'fuzzy' }
      }
    }
  }

  return { value: raw, match: 'none' }
}

/**
 * 按字段语义选择词表并收敛。
 * @param {string} field
 * @param {any} value 可能是字符串（ip/category）或字符串数组（characters）
 * @param {{ categories?: string[], ips?: string[], characters?: string[] }} [vocabulary]
 * @returns {{ value: any, match: 'exact' | 'fuzzy' | 'none' | 'mixed', unmatched: string[] }}
 */
export function mapFieldToPresets(field, value, vocabulary) {
  const candidates = field === 'category'
    ? vocabulary?.categories
    : field === 'ip'
      ? vocabulary?.ips
      : field === 'characters'
        ? vocabulary?.characters
        : null

  if (!candidates || candidates.length === 0) {
    return { value, match: 'none', unmatched: [] }
  }

  if (Array.isArray(value)) {
    const unmatched = []
    let hasFuzzy = false
    const mapped = value.map((item) => {
      const result = matchVocabulary(item, candidates)
      if (result.match === 'none') unmatched.push(String(item).trim())
      if (result.match === 'fuzzy') hasFuzzy = true
      return result.value
    })
    return {
      value: mapped,
      match: unmatched.length > 0 ? 'mixed' : hasFuzzy ? 'fuzzy' : 'exact',
      unmatched
    }
  }

  const result = matchVocabulary(value, candidates)
  return {
    value: result.value,
    match: result.match,
    unmatched: result.match === 'none' ? [String(value).trim()] : []
  }
}

/**
 * 从 presets store 的原始结构里取词表。
 * @param {any} presets presets store（或任何 { categories, ips, characters } 形状）
 * @returns {{ categories: string[], ips: string[], characters: string[] }}
 */
export function buildVocabulary(presets) {
  const categories = toNameList(presets?.categories)
  const ips = toNameList(presets?.ips)
  const characters = toNameList(presets?.characters)
  return { categories, ips, characters }
}

/**
 * 兼容两种形状：字符串数组，或 `{ name, ip }` 对象数组（角色）。提取全部名称字段。
 * @param {any} list
 * @returns {string[]}
 */
function toNameList(list) {
  if (!Array.isArray(list)) return []
  const out = []
  for (const item of list) {
    const name = typeof item === 'string' ? item : item?.name
    const text = String(name ?? '').trim()
    if (text) out.push(text)
  }
  return out
}

/**
 * 词表相关的文本集合，供拼音缓存预热（匹配前 await 一次即可）。
 * @param {{ categories?: string[], ips?: string[], characters?: string[] }} vocabulary
 * @returns {string[]}
 */
export function vocabularyTexts(vocabulary) {
  return [
    ...(vocabulary?.categories || []),
    ...(vocabulary?.ips || []),
    ...(vocabulary?.characters || [])
  ].filter(Boolean)
}
