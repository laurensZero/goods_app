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
    if (error.code === 'COOKIE_EXPIRED') return true
    if (isMihoyoAuthRetcode(error.retcode)) return true
    // 429 是限流，不可能是登录态问题
    if (Number(error.retcode) === 429 || Number(error.status) === 429) return false
    if (isMihoyoAuthHttpStatus(error.status)) return true
  }
  const message = String(error?.message || error || '').trim()
  if (!message) return false

  // JSON 语法错误常见文案是 "Unexpected token 'T'..."，其中 token 会被
  // 下面的兜底正则误判成登录态失效（429 纯文本响应就踩过这个坑）。
  // 超时、限流、解析失败同理：都属于可重试的临时错误，不能清登录态。
  if (/unexpected token|not valid json|json parse|响应解析失败|超时|timeout|timed\s*out|频繁|rate limit|too many requests|实名认证|身份认证/i.test(message)) return false

  // 只匹配「鉴权主体」相关词，不匹配裸的 过期/失效/无效，也不匹配裸的 账号/account：
  // 「商品已失效」「优惠券已过期」「该账号限购 1 件」都是业务错误，
  // 误判成 Cookie 失效会清掉登录态并让下单直接停止。
  return /cookie|token|ltoken|login|log\s*in|auth|unauthorized|forbidden|session|会话|登录|鉴权|未授权|401|403|认证(?:失败|过期|失效|异常)|account\s+(?:(?:has|is)\s+)?(?:login|session|auth|unauthorized|forbidden|disabled|locked|expired|not\s+logged)|账号(?:已|已经|状态)?(?:登录|未登录|失效|异常|冻结|封禁|未授权)/i.test(message)
}
