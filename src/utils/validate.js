/**
 * utils/validate.js
 * 添加/编辑谷子表单的校验规则。
 * 每个函数返回 { valid: boolean, message: string }。
 */

import i18n from '@/locales'

/**
 * 校验谷子名称
 * @param {string} name
 */
export function validateName(name, options = {}) {
  const label = options.label || '名称'
  const maxLength = Number.isFinite(Number(options.maxLength)) ? Number(options.maxLength) : 50

  if (!name || !name.trim()) {
    return { valid: false, message: i18n.global.t('validation.required', { field: label }) }
  }
  if (name.trim().length > maxLength) {
    return { valid: false, message: i18n.global.t('validation.maxLength', { field: label, max: maxLength }) }
  }
  return { valid: true, message: '' }
}

/**
 * 校验价格
 * @param {string|number} price
 */
export function validatePrice(price) {
  if (price === '' || price === null || price === undefined) {
    return { valid: true, message: '' } // 价格允许为空
  }
  const num = Number(price)
  if (isNaN(num) || num < 0) {
    return { valid: false, message: i18n.global.t('validation.invalidPrice') }
  }
  if (num > 999999) {
    return { valid: false, message: i18n.global.t('validation.priceOutOfRange') }
  }
  return { valid: true, message: '' }
}
