import { pinyin } from 'pinyin-pro'

/**
 * 生成中文文本的拼音搜索字符串
 * 返回格式: "全拼\n首字母" (小写)
 * 例: "龙华花园" → "longhuahua yuan\nlhhy"
 */
export function toPinyinSearchText(text) {
  if (!text) return ''
  const str = String(text).trim()
  if (!str) return ''

  const full = pinyin(str, { toneType: 'none', type: 'array' }).join('')
  const initials = pinyin(str, { pattern: 'first', toneType: 'none', type: 'array' }).join('')

  return `${full.toLowerCase()}\n${initials.toLowerCase()}`
}

/**
 * 拼音感知的文本匹配
 * 支持: 原文子串匹配、全拼匹配、首字母匹配
 */
export function pinyinIncludes(haystack, keyword) {
  if (!keyword) return true
  if (!haystack) return false

  const lowerHaystack = haystack.toLowerCase()
  const lowerKeyword = keyword.toLowerCase()

  // 原文子串匹配
  if (lowerHaystack.includes(lowerKeyword)) return true

  // 拼音匹配 — 只对包含中文的文本生效
  if (/[一-鿿]/.test(haystack)) {
    const pinyinText = toPinyinSearchText(haystack)
    if (pinyinText.includes(lowerKeyword)) return true
  }

  return false
}
