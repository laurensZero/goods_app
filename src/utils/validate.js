/**
 * utils/validate.js
 * 添加/编辑谷子表单的校验规则。
 * 每个函数返回 { valid: boolean, message: string }。
 */

/**
 * 校验谷子名称
 * @param {string} name
 */
export function validateName(name) {
  if (!name || !name.trim()) {
    return { valid: false, message: '名称不能为空' }
  }
  if (name.trim().length > 50) {
    return { valid: false, message: '名称最多 50 个字符' }
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
    return { valid: false, message: '请输入有效的非负价格' }
  }
  if (num > 999999) {
    return { valid: false, message: '价格超出合理范围' }
  }
  return { valid: true, message: '' }
}
