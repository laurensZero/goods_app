/**
 * 法律文本日期的唯一登记处。
 * termsContent / privacyContent 的 5 种语言正文都通过 legalDateBlock() 取这两行，
 * 改日期只需要改下面两个常量（ISO 格式 YYYY-MM-DD），全局生效。
 */

/** 生效日期 */
export const LEGAL_EFFECTIVE_DATE = '2026-03-08'

/** 更新日期 */
export const LEGAL_UPDATED_DATE = '2026-10-08'

/** 各语言的日期标签与分隔符（保持与原正文标点一致） */
const LABELS = {
  'zh-CN': { effective: '生效日期：', updated: '更新日期：' },
  'zh-TW': { effective: '生效日期：', updated: '更新日期：' },
  en: { effective: 'Effective date: ', updated: 'Last updated: ' },
  ja: { effective: '発効日：', updated: '更新日：' },
  ko: { effective: '시행일: ', updated: '최종 업데이트: ' }
}

function formatDate(iso, locale) {
  const [y, m, d] = iso.split('-').map(Number)
  if (locale === 'en') {
    return `${new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC'
    })}`
  }
  if (locale === 'ko') return `${y}년 ${m}월 ${d}일`
  return `${y}年${m}月${d}日`
}

/**
 * 生成「生效日期」+ 下一行「更新日期」的 Markdown 片段。
 * @param {string} locale vue-i18n locale key
 * @returns {string}
 */
export function legalDateBlock(locale) {
  const labels = LABELS[locale] || LABELS['zh-CN']
  return `**${labels.effective}${formatDate(LEGAL_EFFECTIVE_DATE, locale)}**\n\n**${labels.updated}${formatDate(LEGAL_UPDATED_DATE, locale)}**`
}