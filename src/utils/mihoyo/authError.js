/**
 * 米游社 / 米游铺鉴权错误判定。
 *
 * 刷新流程必须按明确的 retcode 判断，不能复用宽泛的文案正则，
 * 否则超时、代理失败等临时错误会被误判成 Cookie 失效。
 */

const AUTH_RETCODES = new Set([
  -100, // 未登录 / 登录失效
  -101, // 登录失效
  -111, // 登录状态异常
  10001, // 部分通行证接口的未登录码
])

const AUTH_HTTP_STATUS = new Set([401, 403])

export function isMihoyoAuthRetcode(retcode) {
  const value = Number(retcode)
  return Number.isFinite(value) && AUTH_RETCODES.has(value)
}

export function isMihoyoAuthHttpStatus(status) {
  const value = Number(status)
  return Number.isFinite(value) && AUTH_HTTP_STATUS.has(value)
}

/**
 * 判断一个错误是否为「登录态失效」。
 * 优先用结构化证据（MihoyoApiError 的 retcode / 传输层错误附带的 HTTP status），
 * 文案正则只作为旧调用点（纯 Error 字符串）的兜底，避免超时/网络错误被误判。
 */
export function isMihoyoCookieExpiredError(error) {
  if (error && typeof error === 'object') {
    if (isMihoyoAuthRetcode(error.retcode)) return true
    if (isMihoyoAuthHttpStatus(error.status)) return true
  }
  const message = String(error?.message || error || '').trim()
  if (!message) return false

  return /cookie|token|ltoken|login|account|auth|unauthorized|forbidden|401|403|登录|失效|过期|无效|认证|鉴权/i.test(message)
}
