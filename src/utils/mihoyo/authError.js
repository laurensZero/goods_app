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
