import { Capacitor } from '@capacitor/core'

export const WEB_APK_PROMO_DISMISS_KEY = 'goods_web_apk_promo_dismissed_v1'

/**
 * 是否命中「网页版 · 安卓 UA · APK 引流」目标用户。
 * 排除：原生 Capacitor / Tauri 桌面壳 / 非 Android UA。
 */
export function isWebAndroidPromoTarget(userAgent, {
  isNative = Capacitor.isNativePlatform()
} = {}) {
  if (isNative) return false
  const ua = String(userAgent || '')
  if (!ua) return false
  if (/tauri/i.test(ua)) return false
  return /\bandroid\b/i.test(ua)
}

export function isWebApkPromoDismissed(storage = globalThis.localStorage) {
  try {
    return storage?.getItem(WEB_APK_PROMO_DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

export function dismissWebApkPromo(storage = globalThis.localStorage) {
  try {
    storage?.setItem(WEB_APK_PROMO_DISMISS_KEY, '1')
    return true
  } catch {
    return false
  }
}
