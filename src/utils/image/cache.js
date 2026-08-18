/**
 * utils/imageCache.js
 *
 * 图片缓存模块（内存 + Cache API + Capacitor FS）
 */

import { Filesystem, Directory } from '@capacitor/filesystem'
import { fetchWithPlatformBridge } from '@/utils/platform/http'

const CACHE_NAME = 'img-cache-v1'
const CAP_DIR = Directory.Cache
const CAP_FOLDER = 'img-cache'
const NATIVE_CACHE_META_KEY = 'img-cache-lru-v1'
const DEFAULT_NATIVE_CACHE_LIMIT_MB = 256

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

// Batched LRU metadata: keep in memory, flush to localStorage periodically
let _lruMetaCache = null
let _lruMetaDirty = false
let _lruFlushTimer = null
const LRU_FLUSH_INTERVAL_MS = 5000

function getLruMeta() {
  if (_lruMetaCache === null) {
    _lruMetaCache = readNativeCacheMeta()
  }
  return _lruMetaCache
}

function markLruDirty() {
  _lruMetaDirty = true
  if (!_lruFlushTimer) {
    _lruFlushTimer = setTimeout(() => {
      _lruFlushTimer = null
      flushLruMeta()
    }, LRU_FLUSH_INTERVAL_MS)
  }
}

function flushLruMeta() {
  if (_lruMetaDirty && _lruMetaCache) {
    writeNativeCacheMeta(_lruMetaCache)
    _lruMetaDirty = false
  }
}

async function evictNativeCacheIfNeeded() {
  if (!isNative()) return

  const maxBytes = getNativeCacheLimitBytes()
  flushLruMeta()
  let meta = getLruMeta()

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
    _lruMetaCache = meta
    flushLruMeta()
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

  _lruMetaCache = meta
  flushLruMeta()
}

function touchNativeCacheEntry(filename, size = null) {
  if (!isNative()) return
  const meta = getLruMeta()
  const current = meta[filename] || {}
  meta[filename] = {
    size: size == null ? Math.max(0, Number(current.size) || 0) : Math.max(0, Number(size) || 0),
    lastAccess: Date.now()
  }
  markLruDirty()
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
const memoryCacheTimers = new Map()
const MAX_MEMORY_CACHE_SIZE = isNative() ? 600 : 900
const MEMORY_BLOB_TTL_MS = isNative() ? 180000 : 420000

function setMemoryCache(url, objectUrl) {
  const existingTimer = memoryCacheTimers.get(url)
  if (existingTimer) {
    clearTimeout(existingTimer)
    memoryCacheTimers.delete(url)
  }

  if (memoryCache.size >= MAX_MEMORY_CACHE_SIZE) {
    const firstKey = memoryCache.keys().next().value
    const firstVal = memoryCache.get(firstKey)
    if (firstVal && firstVal.startsWith('blob:')) {
      URL.revokeObjectURL(firstVal)
    }
    const firstTimer = memoryCacheTimers.get(firstKey)
    if (firstTimer) {
      clearTimeout(firstTimer)
      memoryCacheTimers.delete(firstKey)
    }
    memoryCache.delete(firstKey)
  }
  memoryCache.set(url, objectUrl)

  if (objectUrl && objectUrl.startsWith('blob:')) {
    const timerId = setTimeout(() => {
      const currentValue = memoryCache.get(url)
      if (currentValue !== objectUrl) return

      memoryCache.delete(url)
      memoryCacheTimers.delete(url)

      if (![...memoryCache.values()].includes(objectUrl)) {
        URL.revokeObjectURL(objectUrl)
      }
    }, MEMORY_BLOB_TTL_MS)
    memoryCacheTimers.set(url, timerId)
  }
}

const IMAGE_LOAD_CONCURRENCY = isNative() ? 3 : 6
const viewportLoadQueue = []
const preloadLoadQueue = []
const queuedLoadKeys = new Set()
const queuedLoadMeta = new Map()
let imageLoadActiveCount = 0
let imageLoadDrainScheduled = false
let preloadPaused = false
let imageRefreshDispatchScheduled = 0

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

function enqueueImageLoadTask(task, priority = 'viewport') {
  task.priority = priority
  if (priority === 'preload') {
    preloadLoadQueue.push(task)
  } else {
    const dist = task.viewportDistance ?? Infinity
    const idx = viewportLoadQueue.findIndex((t) => (t.viewportDistance ?? Infinity) > dist)
    if (idx < 0) {
      viewportLoadQueue.push(task)
    } else {
      viewportLoadQueue.splice(idx, 0, task)
    }
  }
  queuedLoadKeys.add(task.cacheKey)
  queuedLoadMeta.set(task.cacheKey, task)
  scheduleImageLoadDrain()
}

function promoteQueuedImageLoad(cacheKey) {
  const task = queuedLoadMeta.get(cacheKey)
  if (!task || task.priority !== 'preload') return

  const preloadIndex = preloadLoadQueue.findIndex((entry) => entry.cacheKey === cacheKey)
  if (preloadIndex < 0) return

  preloadLoadQueue.splice(preloadIndex, 1)
  task.priority = 'viewport'
  const dist = task.viewportDistance ?? Infinity
  const idx = viewportLoadQueue.findIndex((t) => (t.viewportDistance ?? Infinity) > dist)
  if (idx < 0) {
    viewportLoadQueue.push(task)
  } else {
    viewportLoadQueue.splice(idx, 0, task)
  }
  scheduleImageLoadDrain()
}

function takeNextImageLoadTask() {
  if (viewportLoadQueue.length > 0) return viewportLoadQueue.shift()
  if (!preloadPaused && preloadLoadQueue.length > 0) return preloadLoadQueue.shift()
  return null
}

function setImageLoadPaused(paused) {
  preloadPaused = !!paused
  scheduleImageLoadDrain()
}

function dispatchImageCacheRefresh(reason = 'resume') {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('goodsapp:image-cache-refresh', {
    detail: {
      reason,
      timestamp: Date.now()
    }
  }))
}

const recentlyDecodedImages = new Map()
const decodePrimeInFlight = new Set()
const DECODED_IMAGE_TTL_MS = isNative() ? 90000 : 180000

function clearDecodedImageTimer(key) {
  const entry = recentlyDecodedImages.get(key)
  if (!entry) return
  if (entry.timerId) {
    clearTimeout(entry.timerId)
  }
}

function clearDecodedImageState() {
  recentlyDecodedImages.forEach((entry) => {
    if (entry?.timerId) {
      clearTimeout(entry.timerId)
    }
  })
  recentlyDecodedImages.clear()
}

function rememberDecodedImage(url) {
  const key = normalizeCacheUrl(url) || String(url || '').trim()
  if (!key) return

  clearDecodedImageTimer(key)
  const timerId = setTimeout(() => {
    recentlyDecodedImages.delete(key)
  }, DECODED_IMAGE_TTL_MS)

  recentlyDecodedImages.set(key, {
    decodedAt: Date.now(),
    timerId
  })
}

export function markImageDecoded(url) {
  rememberDecodedImage(url)
}

export function hasRecentlyDecodedImage(url) {
  const key = normalizeCacheUrl(url) || String(url || '').trim()
  if (!key) return false
  const entry = recentlyDecodedImages.get(key)
  if (!entry) return false
  const ageMs = Date.now() - Number(entry.decodedAt || 0)
  return Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= DECODED_IMAGE_TTL_MS
}

function scheduleDecodePrime(run) {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => run(), { timeout: 160 })
    return
  }
  setTimeout(() => run(), 0)
}

function primeImageDecode(src) {
  const normalizedSrc = String(src || '').trim()
  if (!normalizedSrc || hasRecentlyDecodedImage(normalizedSrc)) return
  if (decodePrimeInFlight.has(normalizedSrc)) return

  decodePrimeInFlight.add(normalizedSrc)

  const img = new Image()
  img.decoding = 'async'
  img.src = normalizedSrc

  if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
    rememberDecodedImage(normalizedSrc)
    decodePrimeInFlight.delete(normalizedSrc)
    return
  }

  if (typeof img.decode === 'function') {
    void img.decode().then(() => {
      rememberDecodedImage(normalizedSrc)
    }).catch(() => {}).finally(() => {
      decodePrimeInFlight.delete(normalizedSrc)
    })
    return
  }

  img.addEventListener('load', () => {
    rememberDecodedImage(normalizedSrc)
    decodePrimeInFlight.delete(normalizedSrc)
  }, { once: true })
  img.addEventListener('error', () => {
    decodePrimeInFlight.delete(normalizedSrc)
  }, { once: true })
}

// --- URL 转换逻辑 ---
/**
 * @param {string} url
 * @returns {string}
 */
function urlToFilename(url) {
  // 旧版仅取前 180 字符，长 URL（如 Supabase Storage 带 userId 前缀）会导致
  // 不同图片的缓存文件名碰撞。现在用 hash 确保唯一性：前缀保留 b64 前 100 字符
  // 便于调试，后缀追加 32-bit hash 防碰撞。
  const b64 = btoa(unescape(encodeURIComponent(url))).replace(/[+/=]/g, '_')
  let hash = 0
  for (let i = 0; i < url.length; i++) {
    hash = ((hash << 5) - hash + url.charCodeAt(i)) | 0
  }
  const hashHex = (hash >>> 0).toString(16).padStart(8, '0')
  return b64.slice(0, 100) + '_' + hashHex + '.cache'
}

// --- Layer 2: Cache API (Web 端持久化) ---
async function getFromCacheAPI(url) {
  // Native Android uses Capacitor Filesystem below. Keeping a second WebView
  // Cache API copy makes the same image consume storage twice and bypasses
  // the native LRU limit.
  if (!supportsCacheAPI || isNative()) return null
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
  if (!supportsCacheAPI || isNative()) return
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
let _writesSinceEviction = 0
const EVICT_EVERY_N_WRITES = 10
let _cleanupPromise = null

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
    _writesSinceEviction += 1
    if (_writesSinceEviction >= EVICT_EVERY_N_WRITES) {
      _writesSinceEviction = 0
      await evictNativeCacheIfNeeded()
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

export async function getCachedImage(url, options = {}) {
  if (!url) return ''

  const normalizedUrl = normalizeCacheUrl(url)
  const cacheKeys = getCacheKeyCandidates(normalizedUrl || url)
  const cacheKey = cacheKeys[0] || normalizedUrl || url
  const priority = options?.priority === 'preload' ? 'preload' : 'viewport'

  // 转换开发环境的跨域 URL 为代理路径（仅用于 fetch，缓存 key 保留原始 URL）
  let fetchUrl = normalizedUrl || url
  if (import.meta.env.DEV && fetchUrl.includes('sdk-webstatic.mihoyo.com')) {
    fetchUrl = fetchUrl.replace('https://sdk-webstatic.mihoyo.com', '/mihoyo-static')
  }

  // 1: 内存（用原始 URL 作为 key）
  for (const key of cacheKeys) {
    if (memoryCache.has(key)) return memoryCache.get(key)
  }

  let viewportDistance = options?.viewportDistance
  if (viewportDistance === undefined || viewportDistance === null) {
    viewportDistance = Infinity
  }

  // 防止并发请求相同 URL 导致多次 IO 和网络请求
  if (inFlight.has(cacheKey)) {
    if (priority === 'viewport') {
      const existingTask = queuedLoadMeta.get(cacheKey)
      if (existingTask) {
        existingTask.viewportDistance = Math.min(existingTask.viewportDistance ?? Infinity, viewportDistance)
      }
      promoteQueuedImageLoad(cacheKey)
    }
    return inFlight.get(cacheKey)
  }

  let resolvePromise = null
  const promise = new Promise((resolve) => {
    resolvePromise = resolve
  })

  inFlight.set(cacheKey, promise)
  enqueueImageLoadTask({
    cacheKey,
    viewportDistance,
    run: async () => {
        // 2: Cache API (Web)
        const cacheHit = await getFromCacheAPI(cacheKey)
        if (cacheHit) {
          setMemoryCache(cacheKey, cacheHit)
          if (normalizedUrl && normalizedUrl !== cacheKey) {
            setMemoryCache(url, cacheHit)
          }
          return cacheHit
        }

        // 3: Capacitor FS (Native)
        const fsHit = await getFromCapacitorFS(cacheKey)
        if (fsHit) {
          setMemoryCache(cacheKey, fsHit)
          if (normalizedUrl && normalizedUrl !== cacheKey) {
            setMemoryCache(url, fsHit)
          }
          return fsHit
        }

        try {
          const response = await fetchWithPlatformBridge(fetchUrl)
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

          return objectUrl
        } catch {
          setMemoryCache(cacheKey, url)
          if (normalizedUrl && normalizedUrl !== cacheKey) {
            setMemoryCache(url, url)
          }
          return url
        }
    },
    resolve: (value) => {
      inFlight.delete(cacheKey)
      queuedLoadKeys.delete(cacheKey)
      queuedLoadMeta.delete(cacheKey)
      resolvePromise?.(value)
    }
  }, priority)

  scheduleImageLoadDrain()
  return promise
}

/**
 * @param {string[]} urls
 */
export function preloadImages(urls) {
  urls.forEach((url) => {
    void getCachedImage(url, { priority: 'preload' }).then((cachedSrc) => {
      if (!cachedSrc) return
      scheduleDecodePrime(() => primeImageDecode(cachedSrc))
    }).catch(() => {})
  })
}

/**
 * Force refresh a cached image's memory entry and return a fresh object URL.
 * This revokes any existing blob: URL stored in memory cache for the key
 * and attempts to rehydrate from Cache API / Capacitor FS / network.
 * Useful when WebView may have lost texture for an existing object URL.
 * @param {string} url
 * @returns {Promise<string>} objectURL or original url
 */
export async function refreshCachedImage(url) {
  if (!url) return ''
  const normalizedUrl = normalizeCacheUrl(url)
  const cacheKeys = getCacheKeyCandidates(normalizedUrl || url)
  const cacheKey = cacheKeys[0] || normalizedUrl || url

  // revoke and delete any existing memory cache entry for this key
  try {
    const existing = memoryCache.get(cacheKey)
    if (existing && existing.startsWith('blob:')) {
      memoryCache.delete(cacheKey)
      const timer = memoryCacheTimers.get(cacheKey)
      if (timer) {
        clearTimeout(timer)
        memoryCacheTimers.delete(cacheKey)
      }
      try { URL.revokeObjectURL(existing) } catch {}
    }
  } catch {}

  // delegate to getCachedImage which will rehydrate from Cache API / FS / network
  try {
    const fresh = await getCachedImage(url)
    return fresh || url
  } catch {
    return url
  }
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

function scheduleImageLoadDrain() {
  if (imageLoadDrainScheduled) return
  imageLoadDrainScheduled = true

  const run = () => {
    imageLoadDrainScheduled = false
    drainImageLoadQueue()
  }

  const hasViewportWork = viewportLoadQueue.length > 0
  const hasPreloadOnlyWork = !hasViewportWork && !preloadPaused && preloadLoadQueue.length > 0

  if (hasViewportWork) {
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(run)
      return
    }
    setTimeout(run, 0)
    return
  }

  if (hasPreloadOnlyWork && typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(run, { timeout: 160 })
    return
  }

  setTimeout(run, 24)
}

function drainImageLoadQueue() {
  while (imageLoadActiveCount < IMAGE_LOAD_CONCURRENCY) {
    const task = takeNextImageLoadTask()
    if (!task) break

    if (!task.cacheKey || !queuedLoadKeys.has(task.cacheKey)) continue
    if (memoryCache.has(task.cacheKey)) {
      queuedLoadKeys.delete(task.cacheKey)
      task.resolve(memoryCache.get(task.cacheKey))
      continue
    }

    imageLoadActiveCount += 1
    Promise.resolve(task.run())
      .then(task.resolve)
      .catch(() => task.resolve(''))
      .finally(() => {
        imageLoadActiveCount = Math.max(0, imageLoadActiveCount - 1)
        if (viewportLoadQueue.length > 0 || (!preloadPaused && preloadLoadQueue.length > 0)) {
          scheduleImageLoadDrain()
        }
      })
  }
}

export function setImagePreloadPaused(paused) {
  setImageLoadPaused(paused)
}

export function signalImageCacheRefresh(reason = 'resume') {
  if (typeof window === 'undefined') return
  if (imageRefreshDispatchScheduled) return

  if (reason === 'resume') {
    clearDecodedImageState()
  }

  const run = () => {
    imageRefreshDispatchScheduled = 0
    dispatchImageCacheRefresh(reason)
  }

  if (typeof window.requestAnimationFrame === 'function') {
    imageRefreshDispatchScheduled = window.requestAnimationFrame(run)
    return
  }

  imageRefreshDispatchScheduled = window.setTimeout(run, 0)
}

export function getImageLoadState() {
  return {
    activeCount: imageLoadActiveCount,
    queuedViewportCount: viewportLoadQueue.length,
    queuedPreloadCount: preloadLoadQueue.length,
    preloadPaused
  }
}

export function clearImageLoadQueues() {
  viewportLoadQueue.length = 0
  preloadLoadQueue.length = 0
  queuedLoadKeys.clear()
  queuedLoadMeta.clear()
}

export function clearMemoryCache() {
  memoryCacheTimers.forEach((timerId) => clearTimeout(timerId))
  memoryCacheTimers.clear()
  memoryCache.forEach((val) => {
    if (val.startsWith('blob:')) URL.revokeObjectURL(val)
  })
  memoryCache.clear()
  clearDecodedImageState()
  if (_lruFlushTimer) {
    clearTimeout(_lruFlushTimer)
    _lruFlushTimer = null
  }
  flushLruMeta()
}

/**
 * Reconcile the persistent native image cache with the configured LRU limit.
 * This is intentionally separate from clearAllCache: it removes only stale
 * network-image cache files and never touches user-images or app data.
 */
export async function cleanupImageCache() {
  if (!isNative()) return
  if (_cleanupPromise) return _cleanupPromise

  _cleanupPromise = (async () => {
    // Remove the duplicate cache created by older Android builds. Native
    // builds no longer write to Cache API, so this is safe on every cleanup.
    if (supportsCacheAPI) {
      try { await caches.delete(CACHE_NAME) } catch { /* ignore */ }
    }
    await evictNativeCacheIfNeeded()
  })()
    .catch(() => {})
    .finally(() => {
      _cleanupPromise = null
    })

  return _cleanupPromise
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
