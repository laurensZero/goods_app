import { Capacitor, registerPlugin } from '@capacitor/core'

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

/** 退出米游铺原生登录（清插件 Cookie + WebView Cookie），便于切换账号 */
export async function logoutMihoyoNativeSession() {
  if (!canUseNativeMihoyoImport()) return
  try {
    await MihoyoSessionImport.logout()
  } catch {
    // 插件未实现或失败时仍由 clearMihoyoCookieState 清 JS 侧存储
  }
}
