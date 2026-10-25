/**
 * 米游铺登录态会话的统一出口，供导入流程之外的调用方使用
 * （商品详情加购、心愿单批量加购等）。
 * 之前这些调用方各自 loadMihoyoCookieState + getNativeMihoyoCookie，
 * 且失败时不标记账号失效；现在统一取值与失效上报。
 */
import { loadMihoyoCookieState, markMihoyoCookieInvalid } from '@/utils/mihoyo/cookie'
import { getNativeMihoyoCookie } from '@/utils/mihoyo/nativeImport'
import { isMihoyoCookieExpiredError } from '@/utils/mihoyo/authError'

/** 取当前生效 Cookie：优先本地账号状态，其次安卓原生插件会话 */
export async function getActiveMihoyoCookie() {
  try {
    const state = await loadMihoyoCookieState()
    if (state?.cookie) return state.cookie
  } catch {
    // 本地状态读取失败时继续尝试原生
  }
  try {
    const nativeCookie = await getNativeMihoyoCookie()
    if (nativeCookie) return nativeCookie
  } catch {
    // ignore
  }
  return ''
}

/**
 * 上报一次疑似登录态失效。判定为失效时把对应账号标记为 invalid。
 * @param {Error|{retcode?:number,message?:string}} error - 加购/请求失败对象（addToCart 结果可直接展开传入）
 * @param {string} [cookie=''] - 失败时使用的 Cookie；缺省时取当前生效 Cookie
 * @returns {Promise<boolean>} 是否确认标记了失效
 */
export async function reportMihoyoCookieFailure(error, cookie = '') {
  if (!isMihoyoCookieExpiredError(error)) return false
  const value = String(cookie || '').trim() || await getActiveMihoyoCookie()
  if (!value) return false
  await markMihoyoCookieInvalid(value, String(error?.message || '登录态失效'))
  return true
}
