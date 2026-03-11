/**
 * utils/imageCache.js
 *
 * 鍥剧墖缂撳瓨妯″潡锛圫tep 3 / 3锛氬唴瀛?+ Cache API + Capacitor Filesystem锛?
 *
 * 缂撳瓨鍒嗗眰锛?
 *   Layer 1 鈹€鈹€ 鍐呭瓨 Map           锛堝綋鍓嶉〉闈㈢敓鍛藉懆鏈燂紝鏈€蹇紝鍚屾锛?
 *   Layer 2 鈹€鈹€ Cache API          锛堣法鍒锋柊鎸佷箙锛屾祻瑙堝櫒绠＄悊娣樻卑锛?
 *   Layer 3 鈹€鈹€ Capacitor FS       锛堝師鐢熸枃浠剁郴缁燂紝鏈€鎸佷箙锛屼粎 native 骞冲彴锛?
 *
 * 骞冲彴鍒ゆ柇锛?
 *   - Web 棰勮锛歀ayer 1 + Layer 2 鐢熸晥锛孡ayer 3 鑷姩璺宠繃
 *   - Capacitor Native App锛氫笁灞傚叏閮ㄧ敓鏁?
 *
 * 瀵瑰鎺ュ彛涓嶅彉锛歡etCachedImage(url) 鈫?Promise<string>
 */

import { Filesystem, Directory } from '@capacitor/filesystem'

const CACHE_NAME = 'img-cache-v1'
const CAP_DIR = Directory.Cache
const CAP_FOLDER = 'img-cache'

// 鈹€鈹€ 骞冲彴妫€娴?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
/** 鏄惁杩愯鍦?Capacitor 鍘熺敓鐜 */
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

/** 鏄惁鏀寔 Cache API */
const supportsCacheAPI = typeof caches !== 'undefined'

// 鈹€鈹€ Layer 1锛氬唴瀛樼紦瀛?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
/** @type {Map<string, string>} url 鈫?objectURL 鎴栧師濮?url */
const memoryCache = new Map()
const PRELOAD_CONCURRENCY = 2
const preloadQueue = []
const preloadQueued = new Set()
let preloadActiveCount = 0
let preloadDrainScheduled = false

// 鈹€鈹€ URL 鈫?鏂囦欢鍚?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
/**
 * 灏?URL 杞负瀹夊叏鐨勬枃浠跺悕锛堢畝鍗?base64url锛屽幓鎺夌壒娈婂瓧绗︼級
 * @param {string} url
 * @returns {string}
 */
function urlToFilename(url) {
  const b64 = btoa(unescape(encodeURIComponent(url)))
  return b64.replace(/[+/=]/g, '_').slice(0, 180) + '.cache'
}

// 鈹€鈹€ Layer 2锛欳ache API 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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
  } catch { /* 瀹归噺瓒呴檺绛夛紝蹇界暐 */ }
}

// 鈹€鈹€ Layer 3锛欳apacitor Filesystem 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
/**
 * 浠?Capacitor FS 璇诲彇鍥剧墖锛岃繑鍥?objectURL锛涘け璐ヨ繑鍥?null
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
    // readFile 杩斿洖 base64 瀛楃涓?
    const byteChars = atob(result.data)
    const bytes = Uint8Array.from(byteChars, (c) => c.charCodeAt(0))
    const blob = new Blob([bytes]) // MIME 绫诲瀷鐢辨祻瑙堝櫒鎺ㄦ柇
    return URL.createObjectURL(blob)
  } catch {
    return null
  }
}

/**
 * 灏?Blob 鍐欏叆 Capacitor FS锛堝悗鍙版墽琛岋紝涓嶉樆濉炰富娴佺▼锛?
 * @param {string} url
 * @param {Blob} blob
 */
async function putToCapacitorFS(url, blob) {
  if (!isNative()) return
  try {
    // 纭繚鐩綍瀛樺湪
    await Filesystem.mkdir({
      path: CAP_FOLDER,
      directory: CAP_DIR,
      recursive: true
    }).catch(() => { /* 鐩綍宸插瓨鍦ㄦ椂浼氭姤閿欙紝蹇界暐 */ })

    const filename = urlToFilename(url)
    // 灏?Blob 杞负 base64
    const arrayBuffer = await blob.arrayBuffer()
    const bytes = new Uint8Array(arrayBuffer)
    const b64 = btoa(String.fromCharCode(...bytes))

    await Filesystem.writeFile({
      path: `${CAP_FOLDER}/${filename}`,
      data: b64,
      directory: CAP_DIR
    })
  } catch { /* 鍐欏叆澶辫触涓嶅奖鍝嶄富娴佺▼ */ }
}

// 鈹€鈹€ 鏍稿績鍑芥暟 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
/**
 * 鑾峰彇缂撳瓨鍥剧墖 URL锛堜笁绾ф煡鎵撅級銆?
 *
 * 鍛戒腑椤哄簭锛氬唴瀛?鈫?Cache API 鈫?Capacitor FS 鈫?缃戠粶
 *
 * @param {string} url 鍘熷鍥剧墖鍦板潃
 * @returns {Promise<string>}
 */
export async function getCachedImage(url) {
  if (!url) return ''

  // 鈶?鍐呭瓨
  if (memoryCache.has(url)) return memoryCache.get(url)

  // 鈶?Cache API锛圵eb锛?
  const cacheHit = await getFromCacheAPI(url)
  if (cacheHit) {
    memoryCache.set(url, cacheHit)
    return cacheHit
  }

  // 鈶?Capacitor FS锛圢ative锛?
  const fsHit = await getFromCapacitorFS(url)
  if (fsHit) {
    memoryCache.set(url, fsHit)
    return fsHit
  }

  // 鈶?缃戠粶璇锋眰 鈫?鍚屾鍐欎笁灞?
  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    memoryCache.set(url, objectUrl)

    // 鍚庡彴鍐欏叆 Cache API + Capacitor FS锛屼笉闃诲杩斿洖鍊?
    putToCacheAPI(url, new Response(blob.slice(), { headers: { 'Content-Type': blob.type } }))
    putToCapacitorFS(url, blob)

    return objectUrl
  } catch {
    memoryCache.set(url, url)
    return url
  }
}

/**
 * 鎵归噺棰勭儹锛堥椤靛垪琛ㄥ姞杞芥椂璋冪敤锛?
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

/**
 * 娓呯┖鍐呭瓨缂撳瓨锛堥噴鏀?objectURL锛?
 * Cache API + Capacitor FS 缂撳瓨浠嶄繚鐣欙紝涓嬫鍙噸寤哄唴瀛樼紦瀛?
 */
export function clearMemoryCache() {
  memoryCache.forEach((val) => {
    if (val.startsWith('blob:')) URL.revokeObjectURL(val)
  })
  memoryCache.clear()
}

/**
 * 娓呯┖鎵€鏈夌紦瀛橈紙鍐呭瓨 + Cache API + Capacitor FS锛?
 * 鍙寕鍒般€岃缃?鈫?娓呴櫎缂撳瓨銆嶆寜閽?
 */
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
