/**
 * utils/storage/cacheMaintenance.js
 *
 * 原生端「应用缓存目录」残留回收。
 *
 * Directory.Cache 在 Android 上就是 context.getCacheDir()，安卓设置里显示的
 * 「缓存」统计的是整个目录，而设置页里的图片上限（getNativeCacheLimitMb）只
 * 约束 img-cache/ 一个子目录。同目录下还有三处会无界增长：
 *
 * - share-poster/     每次「分享海报」写一张 PNG，分享完即无用，旧实现从不删除
 * - updates/          APK 更新包 / 手动导入的 bundle zip，只有装完（或用户手动清）才会删
 * - capgo_downloads/  CapGo 下载的 zip 与 .tmp 分片，插件只清自己认为过期的临时文件
 *
 * 这里做兜底回收：按时间保留最近的文件，旧的删掉。只动 cache 目录，绝不碰
 * 用户数据（Directory.Data / Documents）。
 */
import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { createLogger } from '@/utils/logger'
import { getNativeCacheLimitMb } from '@/utils/image/cache'
import { clearWebViewCache, getAppCacheStats } from '@/utils/storage/appCache'

const log = createLogger('cache-maintenance')

export const SHARE_POSTER_DIR = 'share-poster'
export const UPDATE_RESIDUE_DIR = 'updates'
export const CAPGO_DOWNLOAD_DIR = 'capgo_downloads'

/** 海报只服务于「刚刚那次分享」，多留几张兜住并发分享即可 */
const SHARE_POSTER_KEEP = 3
const SHARE_POSTER_MAX_AGE_MS = 24 * 60 * 60 * 1000
/** 更新包可能是用户正在下载/准备安装的那一份，给足宽限期再删 */
const RESIDUE_MAX_AGE_MS = 48 * 60 * 60 * 1000
/** 冷启动/回前台最多每 6 小时扫一次，避免频繁 readdir */
const MAINTENANCE_INTERVAL_MS = 6 * 60 * 60 * 1000
const LAST_RUN_STORAGE_KEY = 'goods-cache-maintenance-at'

/**
 * WebView（Chromium）HTTP 缓存的独立预算：图片上限的一半，夹在 64MB–256MB。
 * 那份缓存只能整块清、无法设上限，所以超预算时清空重来。
 */
export const WEBVIEW_CACHE_MIN_BYTES = 64 * 1024 * 1024
export const WEBVIEW_CACHE_MAX_BYTES = 256 * 1024 * 1024


// share-poster 文件名形如 goods_share_<shareId>_<Date.now()>.png；
// shareId 插在中间，按字典序排不等于按时间排，必须把时间戳抠出来。
const POSTER_TIMESTAMP_PATTERN = /_(\d{10,})\.png$/i

function isNative() {
  try {
    return Capacitor?.isNativePlatform?.() === true
  } catch {
    return false
  }
}

/**
 * @capacitor/filesystem 的 mtime 单位随平台变化：Android 是毫秒，iOS 是纳秒。
 * 统一归一到毫秒，无法解析时返回 0（表示「时间未知」，调用方一律保守处理）。
 */
function normalizeMtime(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return 0
  return numeric > 1e14 ? Math.round(numeric / 1e6) : numeric
}

function posterTimestamp(name) {
  const match = String(name || '').match(POSTER_TIMESTAMP_PATTERN)
  return match ? Number(match[1]) : 0
}

function readLastRunAt() {
  try {
    return Number(localStorage.getItem(LAST_RUN_STORAGE_KEY)) || 0
  } catch {
    return 0
  }
}

function writeLastRunAt(timestamp) {
  try {
    localStorage.setItem(LAST_RUN_STORAGE_KEY, String(timestamp))
  } catch {
    // localStorage 不可用时退化为「每次启动都扫」，不影响正确性
  }
}

/** 列目录：目录不存在（从未写过）视为没有残留 */
async function listCacheFiles(path) {
  try {
    const res = await Filesystem.readdir({ path, directory: Directory.Cache })
    return (res?.files || []).filter((entry) => entry?.type !== 'directory')
  } catch {
    return []
  }
}

async function removeCacheFiles(path, entries) {
  let removed = 0
  let bytes = 0

  for (const entry of entries) {
    try {
      await Filesystem.deleteFile({ path: `${path}/${entry.name}`, directory: Directory.Cache })
      removed += 1
      bytes += Math.max(0, Number(entry.size) || 0)
    } catch {
      // 单个文件删除失败（已不存在、被占用）不阻塞其余回收
    }
  }

  return { removed, bytes }
}

/**
 * 分享海报：只留最近的 {@link SHARE_POSTER_KEEP} 张，且超过 24 小时的必删。
 * @returns {Promise<{removed:number,bytes:number}>}
 */
export async function pruneSharePosters(now = Date.now()) {
  const entries = await listCacheFiles(SHARE_POSTER_DIR)
  if (entries.length === 0) return { removed: 0, bytes: 0 }

  const decorated = entries
    .map((entry) => ({
      ...entry,
      __at: normalizeMtime(entry?.mtime) || posterTimestamp(entry?.name)
    }))
    .sort((a, b) => (b.__at - a.__at) || String(b.name || '').localeCompare(String(a.name || '')))

  const stale = decorated.filter((entry, index) => (
    index >= SHARE_POSTER_KEEP
    || (entry.__at > 0 && now - entry.__at > SHARE_POSTER_MAX_AGE_MS)
  ))

  return removeCacheFiles(SHARE_POSTER_DIR, stale)
}

/** 目录里所有「mtime 明确且超过宽限期」的文件（mtime 未知一律保留） */
async function collectExpiredFiles(path, now, maxAgeMs) {
  const entries = await listCacheFiles(path)
  return entries.filter((entry) => {
    const at = normalizeMtime(entry?.mtime)
    return at > 0 && now - at > maxAgeMs
  })
}

/**
 * 更新残留（APK / 手动导入的 bundle zip）：超过 48 小时未使用即删。
 * 正在下载的那份 mtime 是当前时间，不会被误删。
 */
export async function pruneUpdateResidue(now = Date.now()) {
  const stale = await collectExpiredFiles(UPDATE_RESIDUE_DIR, now, RESIDUE_MAX_AGE_MS)
  return removeCacheFiles(UPDATE_RESIDUE_DIR, stale)
}

/** CapGo 下载目录（zip + .tmp 分片）残留：同样按 48 小时宽限期回收 */
export async function pruneCapgoDownloadResidue(now = Date.now()) {
  const stale = await collectExpiredFiles(CAPGO_DOWNLOAD_DIR, now, RESIDUE_MAX_AGE_MS)
  return removeCacheFiles(CAPGO_DOWNLOAD_DIR, stale)
}

/** WebView 缓存预算（字节）：图片上限的一半，夹在 [64MB, 256MB] */
export function getWebViewCacheBudgetBytes(limitMb = getNativeCacheLimitMb()) {
  const limitBytes = Math.max(0, Number(limitMb) || 0) * 1024 * 1024
  const half = Math.floor(limitBytes / 2)
  return Math.min(WEBVIEW_CACHE_MAX_BYTES, Math.max(WEBVIEW_CACHE_MIN_BYTES, half))
}

/**
 * WebView HTTP 缓存超预算就整块清掉。清的是资源缓存（图片/接口响应之后会重新下载），
 * 不影响 Cookie（米游铺登录态）与任何业务数据。
 *
 * @returns {Promise<{available:boolean, cleared:boolean, webView:number, total:number, budget:number}>}
 */
export async function enforceWebViewCacheBudget({ limitMb } = {}) {
  const budget = getWebViewCacheBudgetBytes(limitMb)
  const stats = await getAppCacheStats()

  if (!stats) {
    return { available: false, cleared: false, webView: 0, total: 0, budget }
  }

  if (stats.webView <= budget) {
    return { available: true, cleared: false, webView: stats.webView, total: stats.total, budget }
  }

  const cleared = await clearWebViewCache()
  return { available: true, cleared, webView: stats.webView, total: stats.total, budget }
}

let _maintenancePromise = null

/**
 * 统一入口：按 {@link MAINTENANCE_INTERVAL_MS} 节流地跑一次缓存回收。
 * 冷启动与回前台都可安全重复调用。
 *
 * @param {{ force?: boolean, now?: number }} [options]
 * @returns {Promise<{removed:number,bytes:number,skipped?:string,failed?:boolean,webViewCleared?:boolean,cacheTotal?:number,webViewCache?:number}>}
 */
export function runCacheMaintenance({ force = false, now = Date.now() } = {}) {
  if (!isNative()) {
    return Promise.resolve({ removed: 0, bytes: 0, skipped: 'not-native' })
  }

  if (_maintenancePromise) return _maintenancePromise

  if (!force && now - readLastRunAt() < MAINTENANCE_INTERVAL_MS) {
    return Promise.resolve({ removed: 0, bytes: 0, skipped: 'throttled' })
  }

  _maintenancePromise = (async () => {
    const results = await Promise.all([
      pruneSharePosters(now),
      pruneUpdateResidue(now),
      pruneCapgoDownloadResidue(now)
    ])

    const removed = results.reduce((sum, item) => sum + item.removed, 0)
    const bytes = results.reduce((sum, item) => sum + item.bytes, 0)

    // WebView HTTP 缓存不在这套目录预算内，单独按预算整块回收
    const webViewResult = await enforceWebViewCacheBudget()

    // 即使这次没删到东西也记录时间：否则每次冷启动都要全量 readdir 三个目录
    writeLastRunAt(now)
    if (removed > 0 || webViewResult.cleared) {
      log.info('cache-maintenance:pruned', {
        removed,
        bytes,
        cacheTotal: webViewResult.total,
        webViewCache: webViewResult.webView,
        webViewCleared: webViewResult.cleared
      })
    }

    return {
      removed,
      bytes,
      webViewCleared: webViewResult.cleared,
      webViewCache: webViewResult.webView,
      cacheTotal: webViewResult.total
    }
  })()
    .catch((error) => {
      log.warn('cache-maintenance:failed', error)
      return { removed: 0, bytes: 0, failed: true }
    })
    .finally(() => {
      _maintenancePromise = null
    })

  return _maintenancePromise
}
