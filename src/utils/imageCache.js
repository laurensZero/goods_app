/**
 * utils/imageCache.js
 *
 * 图片缓存模块（内存 + Cache API + Capacitor FS）
 */

import { Filesystem, Directory } from '@capacitor/filesystem'

const CACHE_NAME = 'img-cache-v1'
const CAP_DIR = Directory.Cache
const CAP_FOLDER = 'img-cache'

// --- 平台检测 ---
function isNative() {
  try {
    return (
      typeof window !== 'undefined' &&
      window.Capacitor?.isNativePlatform?.() === true
    )
  } catch {
    return false
  }
}

const supportsCacheAPI = typeof caches !== 'undefined'

// --- Layer 1: 内存缓存 ---
/** @type {Map<string, string>} url -> objectURL 或原始 url */
const memoryCache = new Map()
const MAX_MEMORY_CACHE_SIZE = 1500

function setMemoryCache(url, objectUrl) {
  if (memoryCache.size >= MAX_MEMORY_CACHE_SIZE) {
    const firstKey = memoryCache.keys().next().value
    const firstVal = memoryCache.get(firstKey)
    if (firstVal && firstVal.startsWith('blob:')) {
      URL.revokeObjectURL(firstVal)
    }
    memoryCache.delete(firstKey)
  }
  memoryCache.set(url, objectUrl)
}

const PRELOAD_CONCURRENCY = 2
const preloadQueue = []
const preloadQueued = new Set()
let preloadActiveCount = 0
let preloadDrainScheduled = false

// --- URL 转换逻辑 ---
/**
 * @param {string} url
 * @returns {string}
 */
function urlToFilename(url) {
  const b64 = btoa(unescape(encodeURIComponent(url)))
  return b64.replace(/[+/=]/g, '_').slice(0, 180) + '.cache'
}

// --- Layer 2: Cache API (Web 端持久化) ---
async function getFromCacheAPI(url) {
  if (!supportsCacheAPI) return null
  try {
    const cache = await caches.open(CACHE_NAME)
    const response = await cache.match(url)
    if (!response) return null
    const blob = await response.blob()
    return URL.createObjectURL(blob)
  } catch {
    return null
  }
}

async function putToCacheAPI(url, responseClone) {
  if (!supportsCacheAPI) return
  try {
    const cache = await caches.open(CACHE_NAME)
    await cache.put(url, responseClone)
  } catch { /* 容量超限等，忽略 */ }
}

// --- Layer 3: Capacitor Filesystem (原生端持久化) ---
/**
 * @param {string} url
 * @returns {Promise<string|null>}
 */
async function getFromCapacitorFS(url) {
  if (!isNative()) return null
  try {
    const filename = urlToFilename(url)
    const result = await Filesystem.readFile({
      path: `${CAP_FOLDER}/${filename}`,
      directory: CAP_DIR
    })
    // 将文件结果转为 Blob
    const response = await fetch(`data:application/octet-stream;base64,${result.data}`)
    const blob = await response.blob()
    return URL.createObjectURL(blob)
  } catch {
    return null
  }
}

/**
 * @param {string} url
 * @param {Blob} blob
 */
async function putToCapacitorFS(url, blob) {
  if (!isNative()) return
  try {
    await Filesystem.mkdir({
      path: CAP_FOLDER,
      directory: CAP_DIR,
      recursive: true
    }).catch(() => {})

    const filename = urlToFilename(url)
    const reader = new FileReader()
    reader.readAsDataURL(blob)
    reader.onloadend = async () => {
      let b64 = reader.result
      const commaIdx = b64.indexOf(',')
      if (commaIdx > -1) b64 = b64.slice(commaIdx + 1)
      await Filesystem.writeFile({
        path: `${CAP_FOLDER}/${filename}`,
        data: b64,
        directory: CAP_DIR
      })
    }
  } catch { /* 写入失败不影响主流程 */ }
}

// --- 核心函数 ---
/**
 * 获取缓存图片
 * 命中顺序：内存 -> Cache API -> Capacitor FS -> 网络
 *
 * @returns {Promise<string>}
 */
const inFlight = new Map()

export async function getCachedImage(url) {
  if (!url) return ''

  // 转换开发环境的跨域 URL 为代理路径（仅用于 fetch，缓存 key 保留原始 URL）
  let fetchUrl = url
  if (import.meta.env.DEV && url.includes('sdk-webstatic.mihoyo.com')) {
    fetchUrl = url.replace('https://sdk-webstatic.mihoyo.com', '/mihoyo-static')
  }

  // 1: 内存（用原始 URL 作为 key）
  if (memoryCache.has(url)) return memoryCache.get(url)

  // 防止并发请求相同 URL 导致多次 IO 和网络请求
  if (inFlight.has(url)) return inFlight.get(url)

  const promise = (async () => {
    // 2: Cache API (Web)
    const cacheHit = await getFromCacheAPI(url)
    if (cacheHit) {
      setMemoryCache(url, cacheHit)
      inFlight.delete(url)
      return cacheHit
    }

    // 3: Capacitor FS (Native)
    const fsHit = await getFromCapacitorFS(url)
    if (fsHit) {
      setMemoryCache(url, fsHit)
      inFlight.delete(url)
      return fsHit
    }

    try {
      const response = await fetch(fetchUrl)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      setMemoryCache(url, objectUrl)

      // 后台写入 Cache API 和 Capacitor FS（用原始 URL 作为 key），不阻塞返回
      putToCacheAPI(url, new Response(blob.slice(), { headers: { 'Content-Type': blob.type } }))
      putToCapacitorFS(url, blob)

      inFlight.delete(url)
      return objectUrl
    } catch {
      setMemoryCache(url, url)
      inFlight.delete(url)
      return url
    }
  })()

  inFlight.set(url, promise)
  return promise
}

/**
 * @param {string[]} urls
 */
export function preloadImages(urls) {
  urls.forEach((url) => {
    if (!url || memoryCache.has(url) || preloadQueued.has(url)) return
    preloadQueue.push(url)
    preloadQueued.add(url)
  })

  schedulePreloadDrain()
}

/**
 * 同步读取内存层缓存。
 * 只用于避免组件重挂载时出现一帧空白占位。
 * @param {string} url
 * @returns {string}
 */
export function peekCachedImage(url) {
  if (!url) return ''
  return memoryCache.get(url) || ''
}

function schedulePreloadDrain() {
  if (preloadDrainScheduled) return
  preloadDrainScheduled = true

  const run = () => {
    preloadDrainScheduled = false
    drainPreloadQueue()
  }

  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(run, { timeout: 240 })
    return
  }

  setTimeout(run, 32)
}

function drainPreloadQueue() {
  while (preloadActiveCount < PRELOAD_CONCURRENCY && preloadQueue.length > 0) {
    const url = preloadQueue.shift()
    preloadQueued.delete(url)

    if (!url || memoryCache.has(url)) continue

    preloadActiveCount += 1
    getCachedImage(url)
      .catch(() => {})
      .finally(() => {
        preloadActiveCount = Math.max(0, preloadActiveCount - 1)
        if (preloadQueue.length > 0) schedulePreloadDrain()
      })
  }
}

export function clearMemoryCache() {
  memoryCache.forEach((val) => {
    if (val.startsWith('blob:')) URL.revokeObjectURL(val)
  })
  memoryCache.clear()
}

export async function clearAllCache() {
  clearMemoryCache()
  if (supportsCacheAPI) {
    try { await caches.delete(CACHE_NAME) } catch { /* ignore */ }
  }
  if (isNative()) {
    try {
      await Filesystem.rmdir({
        path: CAP_FOLDER,
        directory: CAP_DIR,
        recursive: true
      })
    } catch { /* ignore */ }
  }
}
