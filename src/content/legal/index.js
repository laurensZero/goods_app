import { LEGAL_DOC_TYPES } from '@/constants/legalConstants'
import { termsContent } from './termsContent'
import { privacyContent } from './privacyContent'

export function getLegalDoc(type, locale) {
  const table = type === LEGAL_DOC_TYPES.PRIVACY ? privacyContent : termsContent
  return table[locale] || table['zh-CN']
}

export function getLegalDocTitle(type) {
  // 正文 markdown 里首行 # 即标题；此处仅供程序化取 key 用
  return type === LEGAL_DOC_TYPES.PRIVACY ? 'privacy' : 'terms'
}
