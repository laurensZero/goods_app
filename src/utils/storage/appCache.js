/**
 * utils/storage/appCache.js
 *
 * 原生 AppCache 插件的 JS 封装：读取「整个应用缓存目录」的真实占用，并清理
 * WebView（Chromium）的 HTTP 缓存。
 *
 * 背景：设置页的图片上限只作用于 cacheDir/img-cache；安卓设置里显示的「缓存」
 * 是整个 cacheDir，其中最大的一块是 Android WebView 的 HTTP 缓存（所有 fetch、
 * 内嵌网页与 CDN 图片的第二份拷贝）。那份缓存 JS 侧既量不到也删不掉，只能走
 * 原生插件。
 */
import { Capacitor, registerPlugin } from '@capacitor/core'

const AppCache = registerPlugin('AppCache')

/** WebView 缓存目录名（现代为 org.chromium.android_webview，老版本是 WebView） */
export const WEBVIEW_CACHE_DIR_PATTERN = /chromium|webview/i

export function isAppCacheBridgeAvailable() {
  try {
    return Capacitor?.isNativePlatform?.() === true
  } catch {
    return false
  }
}

/**
 * 归一化原生返回；插件缺失（旧 APK 里没有该插件）时返回 null，调用方自行降级。
 * webView 缺失时按目录名兜底汇总，避免插件目录命名差异导致显示 0。
 */
export function normalizeAppCacheStats(raw) {
  if (!raw || typeof raw !== 'object') return null

  const dirs = {}
  const rawDirs = raw.dirs && typeof raw.dirs === 'object' ? raw.dirs : {}
  for (const [name, size] of Object.entries(rawDirs)) {
    dirs[name] = Math.max(0, Number(size) || 0)
  }

  const fallbackTotal = Object.values(dirs).reduce((sum, size) => sum + size, 0)
  const total = Math.max(0, Number(raw.total) || fallbackTotal)

  let webView = Math.max(0, Number(raw.webView) || 0)
  if (!webView) {
    webView = Object.entries(dirs).reduce(
      (sum, [name, size]) => (WEBVIEW_CACHE_DIR_PATTERN.test(name) ? sum + size : sum),
      0
    )
  }

  return { total, webView, dirs, path: String(raw.path || '') }
}

/**
 * @returns {Promise<{total:number, webView:number, dirs:Record<string, number>, path:string}|null>}
 */
export async function getAppCacheStats() {
  if (!isAppCacheBridgeAvailable()) return null
  try {
    return normalizeAppCacheStats(await AppCache.stats())
  } catch {
    return null
  }
}

/** 清 WebView 资源缓存（内存 + 磁盘）。Cookie 与业务数据不受影响。 */
export async function clearWebViewCache() {
  if (!isAppCacheBridgeAvailable()) return false
  try {
    await AppCache.clearWebViewCache()
    return true
  } catch {
    return false
  }
}
