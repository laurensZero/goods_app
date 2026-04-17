/**
 * utils/imageCache.js
 *
 * 图片缓存模块（内存 + Cache API + Capacitor FS）
 */

import { Filesystem, Directory } from '@capacitor/filesystem'

const CACHE_NAME = 'img-cache-v1'
const CAP_DIR = Directory.Cache
const CAP_FOLDER = 'img-cache'
const NATIVE_CACHE_META_KEY = 'img-cache-lru-v1'
const DEFAULT_NATIVE_CACHE_LIMIT_MB = 512

function getNativeCacheLimitBytes() {
  try {
    const raw = Number(localStorage.getItem('img-cache-limit-mb'))
    if (Number.isFinite(raw) && raw >= 32) {
      return Math.floor(raw * 1024 * 1024)
    }
  } catch {
    // ignore invalid localStorage state
  }
  return DEFAULT_NATIVE_CACHE_LIMIT_MB * 1024 * 1024
}

function readNativeCacheMeta() {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(NATIVE_CACHE_META_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed
  } catch {
    return {}
  }
}

function writeNativeCacheMeta(meta) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(NATIVE_CACHE_META_KEY, JSON.stringify(meta))
  } catch {
    // ignore storage quota errors
  }
}

async function evictNativeCacheIfNeeded() {
  if (!isNative()) return

  const maxBytes = getNativeCacheLimitBytes()
  let meta = readNativeCacheMeta()

  let files = []
  try {
    const res = await Filesystem.readdir({ path: CAP_FOLDER, directory: CAP_DIR })
    files = (res?.files || []).filter((entry) => entry?.type !== 'directory')
  } catch {
    writeNativeCacheMeta({})
    return
  }

  const fileNames = new Set(files.map((entry) => entry.name))

  for (const entry of files) {
    const current = meta[entry.name] || {}
    meta[entry.name] = {
      size: Math.max(0, Number(current.size) || Number(entry.size) || 0),
      lastAccess: Number(current.lastAccess) || Date.now()
    }
  }

  for (const key of Object.keys(meta)) {
    if (!fileNames.has(key)) {
      delete meta[key]
    }
  }

  let total = Object.values(meta).reduce((sum, item) => sum + (Number(item?.size) || 0), 0)
  if (total <= maxBytes) {
    writeNativeCacheMeta(meta)
    return
  }

  const sorted = Object.entries(meta)
    .sort((a, b) => (Number(a[1]?.lastAccess) || 0) - (Number(b[1]?.lastAccess) || 0))

  for (const [name, info] of sorted) {
    if (total <= maxBytes) break
    try {
      await Filesystem.deleteFile({
        path: `${CAP_FOLDER}/${name}`,
        directory: CAP_DIR
      })
    } catch {
      // ignore file deletion failure
    }
    total -= Math.max(0, Number(info?.size) || 0)
    delete meta[name]
  }

  writeNativeCacheMeta(meta)
}

function touchNativeCacheEntry(filename, size = null) {
  if (!isNative()) return
  const meta = readNativeCacheMeta()
  const current = meta[filename] || {}
  meta[filename] = {
    size: size == null ? Math.max(0, Number(current.size) || 0) : Math.max(0, Number(size) || 0),
    lastAccess: Date.now()
  }
  writeNativeCacheMeta(meta)
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = String(reader.result || '')
      const commaIdx = result.indexOf(',')
      resolve(commaIdx > -1 ? result.slice(commaIdx + 1) : result)
    }
    reader.onerror = () => reject(new Error('blob base64 encode failed'))
    reader.readAsDataURL(blob)
  })
}

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

function normalizeCacheUrl(input) {
  const value = String(input || '').trim()
  if (!value) return ''
  if (/^(blob:|data:|file:|content:|capacitor:)/i.test(value)) return value

  try {
    const base = typeof window !== 'undefined' ? window.location.href : 'http://localhost'
    const parsed = new URL(value, base)
    parsed.hash = ''
    if (parsed.searchParams?.sort) parsed.searchParams.sort()
    return parsed.toString()
  } catch {
    return value
  }
}

function getCacheKeyCandidates(url) {
  const raw = String(url || '').trim()
  const normalized = normalizeCacheUrl(raw)
  if (!raw) return []
  return normalized && normalized !== raw ? [normalized, raw] : [raw]
}

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
    for (const key of getCacheKeyCandidates(url)) {
      const response = await cache.match(key)
      if (!response) continue
      const blob = await response.blob()
      return URL.createObjectURL(blob)
    }
    return null
  } catch {
    return null
  }
}

async function putToCacheAPI(url, responseClone) {
  if (!supportsCacheAPI) return
  try {
    const cache = await caches.open(CACHE_NAME)
    await cache.put(normalizeCacheUrl(url) || url, responseClone)
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
    for (const key of getCacheKeyCandidates(url)) {
      const filename = urlToFilename(key)
      try {
        const result = await Filesystem.readFile({
          path: `${CAP_FOLDER}/${filename}`,
          directory: CAP_DIR
        })
        const response = await fetch(`data:application/octet-stream;base64,${result.data}`)
        const blob = await response.blob()
        touchNativeCacheEntry(filename, blob.size)
        return URL.createObjectURL(blob)
      } catch {
        continue
      }
    }
    return null
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
    const b64 = await blobToBase64(blob)
    await Filesystem.writeFile({
      path: `${CAP_FOLDER}/${filename}`,
      data: b64,
      directory: CAP_DIR
    })
    touchNativeCacheEntry(filename, blob.size)
    await evictNativeCacheIfNeeded()
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

  const normalizedUrl = normalizeCacheUrl(url)
  const cacheKeys = getCacheKeyCandidates(normalizedUrl || url)
  const cacheKey = cacheKeys[0] || normalizedUrl || url

  // 转换开发环境的跨域 URL 为代理路径（仅用于 fetch，缓存 key 保留原始 URL）
  let fetchUrl = normalizedUrl || url
  if (import.meta.env.DEV && fetchUrl.includes('sdk-webstatic.mihoyo.com')) {
    fetchUrl = fetchUrl.replace('https://sdk-webstatic.mihoyo.com', '/mihoyo-static')
  }

  // 1: 内存（用原始 URL 作为 key）
  for (const key of cacheKeys) {
    if (memoryCache.has(key)) return memoryCache.get(key)
  }

  // 防止并发请求相同 URL 导致多次 IO 和网络请求
  if (inFlight.has(cacheKey)) return inFlight.get(cacheKey)

  const promise = (async () => {
    // 2: Cache API (Web)
    const cacheHit = await getFromCacheAPI(cacheKey)
    if (cacheHit) {
      setMemoryCache(cacheKey, cacheHit)
      if (normalizedUrl && normalizedUrl !== cacheKey) {
        setMemoryCache(url, cacheHit)
      }
      inFlight.delete(cacheKey)
      return cacheHit
    }

    // 3: Capacitor FS (Native)
    const fsHit = await getFromCapacitorFS(cacheKey)
    if (fsHit) {
      setMemoryCache(cacheKey, fsHit)
      if (normalizedUrl && normalizedUrl !== cacheKey) {
        setMemoryCache(url, fsHit)
      }
      inFlight.delete(cacheKey)
      return fsHit
    }

    try {
      const response = await fetch(fetchUrl)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      setMemoryCache(cacheKey, objectUrl)
      if (normalizedUrl && normalizedUrl !== cacheKey) {
        setMemoryCache(url, objectUrl)
      }

      // 后台写入 Cache API 和 Capacitor FS（用规范化后的 URL 作为 key），不阻塞返回
      putToCacheAPI(cacheKey, new Response(blob.slice(), { headers: { 'Content-Type': blob.type } }))
      putToCapacitorFS(cacheKey, blob)

      inFlight.delete(cacheKey)
      return objectUrl
    } catch {
      setMemoryCache(cacheKey, url)
      if (normalizedUrl && normalizedUrl !== cacheKey) {
        setMemoryCache(url, url)
      }
      inFlight.delete(cacheKey)
      return url
    }
  })()

  inFlight.set(cacheKey, promise)
  return promise
}

/**
 * @param {string[]} urls
 */
export function preloadImages(urls) {
  urls.forEach((url) => {
    const key = normalizeCacheUrl(url)
    if (!key || memoryCache.has(key) || preloadQueued.has(key)) return
    preloadQueue.push(key)
    preloadQueued.add(key)
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
  for (const key of getCacheKeyCandidates(url)) {
    const cached = memoryCache.get(key)
    if (cached) return cached
  }
  return ''
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
      writeNativeCacheMeta({})
    } catch { /* ignore */ }
  }
}
