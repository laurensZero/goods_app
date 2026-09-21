/** 法律文本版本：正文有实质变更时 +1，已同意用户会重新弹窗确认 */
export const LEGAL_DOCS_VERSION = '3'

/** 已接受版本号的持久化 key（原生 Preferences / Web localStorage） */
export const LEGAL_ACCEPTED_KEY = 'goods_legal_accepted_version'

/** 法律文档类型 */
export const LEGAL_DOC_TYPES = Object.freeze({
  TERMS: 'terms',
  PRIVACY: 'privacy'
})
