import { Capacitor, registerPlugin } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

const MihoyoSessionImport = registerPlugin('MihoyoSessionImport')

export function canUseNativeMihoyoImport() {
  return Capacitor.getPlatform() === 'android'
}

export async function importMihoyoOrdersWithSession() {
  return MihoyoSessionImport.importOrders()
}

export async function importMihoyoCartWithSession() {
  return MihoyoSessionImport.importCart()
}

export async function getNativeMihoyoCookie() {
  if (!canUseNativeMihoyoImport()) return ''
  try {
    const result = await MihoyoSessionImport.getSavedCookie()
    return result?.cookie || ''
  } catch {
    return ''
  }
}

/**
 * 写入原生侧已保存 Cookie（多账号切换用）。
 * 新版插件 setSavedCookie 写 SharedPreferences + CapacitorStorage；
 * 旧包无此方法时返回 false，调用方需走重新登录。
 */
export async function setNativeMihoyoCookie(cookie) {
  if (!canUseNativeMihoyoImport()) return false
  const value = String(cookie || '').trim()
  try {
    const result = await MihoyoSessionImport.setSavedCookie({ cookie: value })
    return Boolean(result?.ok)
  } catch {
    // 弱回退：写 Capacitor Preferences（与 Activity 双写位置一致时可被 loadMihoyoCookieState 读到）
    try {
      await Preferences.set({
        key: 'mihoyo_cookie_state',
        value: JSON.stringify({
          cookie: value,
          updatedAt: new Date().toISOString(),
          invalidAt: '',
          invalidReason: ''
        })
      })
    } catch {
      // ignore
    }
    return false
  }
}

/**
 * 让原生会话改用给定 Cookie（安卓端粘贴 Cookie 登录后调用）。
 * 写入后必须能读回同一 Cookie，否则原生导入仍会用旧会话。
 * 旧包没有 setSavedCookie 时返回 ok=false / unsupported=true，调用方应引导用户走网页登录。
 * @param {string} cookie
 * @returns {Promise<{ ok: boolean, unsupported: boolean }>}
 */
export async function applyNativeMihoyoCookie(cookie) {
  const value = String(cookie || '').trim()
  if (!canUseNativeMihoyoImport()) return { ok: true, unsupported: false }
  if (!value) return { ok: false, unsupported: false }
  const stored = await setNativeMihoyoCookie(value)
  if (!stored) return { ok: false, unsupported: true }
  try {
    const current = await getNativeMihoyoCookie()
    return { ok: Boolean(current) && current === value, unsupported: false }
  } catch {
    return { ok: false, unsupported: false }
  }
}

/** 退出米游铺原生登录（清插件 Cookie + WebView Cookie），便于切换账号 */
export async function logoutMihoyoNativeSession() {
  if (!canUseNativeMihoyoImport()) return
  try {
    await MihoyoSessionImport.logout()
  } catch {
    // 插件未实现或失败时仍由 clearMihoyoCookieState 清 JS 侧存储
  }
}

/**
 * 拉起 WebView 登录新账号（不复用已保存 Cookie）。
 * 需新版原生插件 login()；旧包返回 unsupported。
 * @returns {Promise<{ok: boolean, cookie: string, cancelled: boolean, unsupported?: boolean, message?: string}>}
 */
export async function loginMihoyoNativeNewAccount() {
  if (!canUseNativeMihoyoImport()) {
    return { ok: false, cookie: '', cancelled: false, unsupported: true }
  }
  try {
    const result = await MihoyoSessionImport.login({})
    const cookie = String(result?.cookie || '').trim() || (await getNativeMihoyoCookie())
    return { ok: Boolean(cookie), cookie, cancelled: false }
  } catch (e) {
    const message = String(e?.message || '')
    const unsupported = /not implemented|未实现|undefined|missing/i.test(message)
    return {
      ok: false,
      cookie: '',
      cancelled: /取消/.test(message),
      unsupported,
      message,
    }
  }
}
