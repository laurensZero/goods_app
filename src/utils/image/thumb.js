/**
 * utils/image/thumb.js
 *
 * 客户端本地缩略图：把原图（远程或本地）在本地解码并降采样成小图，
 * 供 photo-grid 这类小尺寸场景显示，避免一次性解码多张几 MB 的原图
 * 拖垮详情页（此前服务端缩放方案因滥用风险被移除，见 resize-image 的历史）。
 *
 * 生成跑在 Web Worker（OffscreenCanvas + createImageBitmap）里：解码、逐级
 * 降采样、透明检测、JPEG/PNG 编码都是主线程重活，6-7 张照片连发会把入场
 * 滑动卡成幻灯片；Worker 不可用（旧 WebView / file:// 限制 / 测试环境）时
 * 逐张回退主线程生成，行为与旧版一致。
 *
 * 缓存层级（key = 目标尺寸 + 原图 URL）：
 *   1. 内存（objectURL，LRU 上限）
 *   2. 持久层 — 复用 utils/image/cache 的 Cache API / Capacitor FS 与清理策略
 *   3. 现场生成 — Worker（优先）→ 主线程 createImageBitmap / canvas 逐步减半 → 编码
 *
 * 任何一步失败都回退原图 URL，并做会话级负缓存避免反复重试；
 * 调用方拿到的返回值一定可以直接当 <img src> 用。
 */

import {
  getCachedImage,
  readDerivedImageCache,
  writeDerivedImageCache
} from '@/utils/image/cache'

const DEFAULT_THUMB_SIZE = 480
const MEMORY_MAX_ENTRIES = 300
// 同时解码/绘制的并发数：多张照片同时生成时避免把解码端打满
const GENERATE_CONCURRENCY = 2
const ENCODE_JPEG_QUALITY = 0.82
// 原图最长边相对目标尺寸的倍数低于该值时不再生成，直接回退原图
const THUMB_WORTHWHILE_RATIO = 1.25
// Worker 池大小与单任务超时；超时视为该次生成失败，走主线程兜底
const THUMB_WORKER_POOL = GENERATE_CONCURRENCY
const THUMB_WORKER_JOB_TIMEOUT_MS = 15000

// --- Worker 生成 ---

// 自包含的 worker 源码（Blob URL 创建，兼容 file:// 宿主）。与主线程
// rasterizeThumb 的降采样策略保持一致：逐步减半到 2 倍目标以内再收尾，
// 带透明通道编码 PNG，否则 JPEG。
const THUMB_WORKER_SOURCE = `
const JPEG_QUALITY = ${ENCODE_JPEG_QUALITY}
function drawTo(prevCanvas, bitmap, nextW, nextH) {
  try {
    const canvas = new OffscreenCanvas(nextW, nextH)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(prevCanvas || bitmap, 0, 0, nextW, nextH)
    return canvas
  } catch (e) {
    return null
  }
}
function hasAlpha(canvas) {
  try {
    const ctx = canvas.getContext('2d')
    if (!ctx) return false
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    for (let i = 3; i < data.length; i += 16) {
      if (data[i] < 250) return true
    }
    return false
  } catch (e) {
    return false
  }
}
self.onmessage = async (event) => {
  const { id, sourceUri, maxSize, worthwhileRatio } = event.data || {}
  let bitmap = null
  try {
    const target = Math.max(32, Math.min(1024, Math.floor(Number(maxSize) || 480)))
    const response = await fetch(sourceUri)
    if (!response.ok) throw new Error('HTTP ' + response.status)
    const blob = await response.blob()
    bitmap = await createImageBitmap(blob)
    if (!(bitmap.width > 0 && bitmap.height > 0)) throw new Error('empty image')

    const longestSide = Math.max(bitmap.width, bitmap.height)
    if (longestSide <= target * (Number(worthwhileRatio) || 1.25)) {
      self.postMessage({ id, ok: false, reason: 'not-worthwhile' })
      return
    }

    const scale = target / longestSide
    const targetW = Math.max(1, Math.round(bitmap.width * scale))
    const targetH = Math.max(1, Math.round(bitmap.height * scale))

    let curW = bitmap.width
    let curH = bitmap.height
    let canvas = null
    while (curW * 0.5 > targetW && curH * 0.5 > targetH) {
      const next = drawTo(canvas, bitmap, Math.max(targetW, Math.floor(curW / 2)), Math.max(targetH, Math.floor(curH / 2)))
      if (!next) break
      canvas = next
      curW = canvas.width
      curH = canvas.height
    }
    if (!canvas) {
      canvas = drawTo(null, bitmap, targetW, targetH)
    } else if (curW !== targetW || curH !== targetH) {
      canvas = drawTo(canvas, null, targetW, targetH) || canvas
    }
    if (!canvas) throw new Error('draw failed')

    const out = hasAlpha(canvas)
      ? await canvas.convertToBlob({ type: 'image/png' })
      : await canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY })
    if (!(out && out.size > 0)) throw new Error('encode failed')
    self.postMessage({ id, ok: true, blob: out })
  } catch (error) {
    self.postMessage({ id, ok: false, reason: String((error && error.message) || error) })
  } finally {
    if (bitmap) { try { bitmap.close() } catch (e) {} }
  }
}
`

const thumbWorkers = []
let thumbWorkerUnavailable = false
let thumbWorkerJobId = 0
const thumbWorkerJobs = new Map()

function handleThumbWorkerMessage(event) {
  const { id, ok, blob, reason } = event.data || {}
  const job = thumbWorkerJobs.get(id)
  if (!job) return
  thumbWorkerJobs.delete(id)
  clearTimeout(job.timer)
  if (ok && blob) job.resolve(blob)
  else job.reject(makeWorkerJobError(reason))
}

function makeWorkerJobError(reason) {
  const error = new Error(reason || 'thumb worker failed')
  error.notWorthwhile = reason === 'not-worthwhile'
  return error
}

function getThumbWorker() {
  if (thumbWorkerUnavailable) return null
  if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof createImageBitmap === 'undefined') {
    thumbWorkerUnavailable = true
    return null
  }
  const idle = thumbWorkers.find((worker) => !worker.__busy)
  if (idle) return idle
  if (thumbWorkers.length >= THUMB_WORKER_POOL) return thumbWorkers[thumbWorkerJobId % thumbWorkers.length]
  try {
    const blobUrl = URL.createObjectURL(new Blob([THUMB_WORKER_SOURCE], { type: 'text/javascript' }))
    const worker = new Worker(blobUrl)
    URL.revokeObjectURL(blobUrl)
    worker.__busy = false
    worker.onmessage = (event) => {
      worker.__busy = false
      handleThumbWorkerMessage(event)
    }
    worker.onerror = () => {
      // worker 崩溃（脚本错误/跨域限制）：放弃 worker 通道，在途任务回退主线程
      worker.__busy = false
      thumbWorkerUnavailable = true
      const index = thumbWorkers.indexOf(worker)
      if (index > -1) thumbWorkers.splice(index, 1)
      try { worker.terminate() } catch { /* ignore */ }
      for (const job of thumbWorkerJobs.values()) {
        clearTimeout(job.timer)
        job.reject(makeWorkerJobError('worker crashed'))
      }
      thumbWorkerJobs.clear()
    }
    thumbWorkers.push(worker)
    return worker
  } catch {
    thumbWorkerUnavailable = true
    return null
  }
}

function generateThumbBlobInWorker(sourceUri, maxSize) {
  const worker = getThumbWorker()
  if (!worker) return Promise.reject(makeWorkerJobError('worker unavailable'))
  const id = ++thumbWorkerJobId
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (!thumbWorkerJobs.has(id)) return
      thumbWorkerJobs.delete(id)
      reject(makeWorkerJobError('worker timeout'))
    }, THUMB_WORKER_JOB_TIMEOUT_MS)
    thumbWorkerJobs.set(id, { resolve, reject, timer })
    worker.__busy = true
    worker.postMessage({ id, sourceUri, maxSize, worthwhileRatio: THUMB_WORTHWHILE_RATIO })
  })
}

/** @type {Map<string, string>} key -> 缩略图 objectURL，或回退原图 URL（负缓存） */
const memoryCache = new Map()
const inFlight = new Map()

const generateQueue = []
let generateActive = 0

function buildThumbKey(url, maxSize) {
  const size = Math.max(16, Math.floor(Number(maxSize) || DEFAULT_THUMB_SIZE))
  // 持久层 key 必须是合法 URL（Cache API 只接受 http(s)），原生 FS 用它派生文件名
  return `https://thumb.cache.local/${size}/${encodeURIComponent(String(url || '').trim())}`
}

function revokeIfBlobUrl(value) {
  if (value && value.startsWith('blob:')) {
    try { URL.revokeObjectURL(value) } catch { /* ignore */ }
  }
}

function setMemory(key, value) {
  const previous = memoryCache.get(key)
  if (previous !== undefined && previous !== value) revokeIfBlobUrl(previous)
  memoryCache.delete(key)
  memoryCache.set(key, value)
  while (memoryCache.size > MEMORY_MAX_ENTRIES) {
    const oldestKey = memoryCache.keys().next().value
    revokeIfBlobUrl(memoryCache.get(oldestKey))
    memoryCache.delete(oldestKey)
  }
}

function touchMemory(key) {
  const value = memoryCache.get(key)
  if (value === undefined) return undefined
  memoryCache.delete(key)
  memoryCache.set(key, value)
  return value
}

function enqueueGenerate(task) {
  return new Promise((resolve) => {
    generateQueue.push({ task, resolve })
    drainGenerateQueue()
  })
}

function drainGenerateQueue() {
  while (generateActive < GENERATE_CONCURRENCY && generateQueue.length > 0) {
    const next = generateQueue.shift()
    generateActive += 1
    Promise.resolve()
      .then(next.task)
      .then(next.resolve, () => next.resolve(null))
      .finally(() => {
        generateActive -= 1
        drainGenerateQueue()
      })
  }
}

// --- 本地生成 ---

function isLocalDecodableUri(uri) {
  return /^(blob:|data:|file:|content:|capacitor:)/i.test(uri) || uri.includes('/_capacitor_file_/')
}

async function resolveSourceUri(url) {
  // 本地图直接用原 URI 解码，不要把原图再复制一份进图片缓存；
  // 远程图走现有缓存管道（去重/限流/持久化），与点开大图预览共享下载。
  if (isLocalDecodableUri(url)) return url
  try {
    return (await getCachedImage(url)) || url
  } catch {
    return url
  }
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    // 兜底超时：个别 WebView 加载失败可能既不触发 load 也不触发 error
    const timer = setTimeout(() => reject(new Error('image decode timeout')), 4000)
    const done = (fn, value) => {
      clearTimeout(timer)
      fn(value)
    }
    img.decoding = 'async'
    img.onload = () => (img.naturalWidth > 0 ? done(resolve, img) : done(reject, new Error('empty image')))
    img.onerror = () => done(reject, new Error('image decode failed'))
    img.src = src
  })
}

async function decodeSource(src) {
  // createImageBitmap 的解码在部分平台可离主线程，优先使用；
  // 失败（旧 WebView / 跨域 canvas 污染等）再回退 Image 元素解码。
  if (typeof createImageBitmap === 'function') {
    try {
      const response = await fetch(src)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const blob = await response.blob()
      const bitmap = await createImageBitmap(blob)
      if (bitmap.width > 0 && bitmap.height > 0) {
        return {
          width: bitmap.width,
          height: bitmap.height,
          close: () => { try { bitmap.close?.() } catch { /* ignore */ } },
          draw: (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h)
        }
      }
      try { bitmap.close?.() } catch { /* ignore */ }
    } catch { /* 回退到 Image 元素解码 */ }
  }
  const img = await loadImageElement(src)
  return {
    width: img.naturalWidth,
    height: img.naturalHeight,
    close: () => {},
    draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h)
  }
}

function drawToCanvas(source, w, h) {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    source.draw(ctx, w, h)
    return canvas
  } catch {
    // 跨域污染等导致绘制失败
    return null
  }
}

function canvasSource(canvas) {
  return {
    width: canvas.width,
    height: canvas.height,
    close: () => {},
    draw: (ctx, w, h) => ctx.drawImage(canvas, 0, 0, w, h)
  }
}

function canvasToBlob(canvas, { type, quality }) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => (blob && blob.size > 0 ? resolve(blob) : reject(new Error('encode failed'))), type, quality)
    } catch (error) {
      reject(error)
    }
  })
}

function canvasHasAlpha(canvas) {
  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return false
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    for (let i = 3; i < data.length; i += 16) {
      if (data[i] < 250) return true
    }
    return false
  } catch {
    return false
  }
}

async function rasterizeThumb(sourceUri, maxSize) {
  const target = Math.max(32, Math.min(1024, Math.floor(Number(maxSize) || DEFAULT_THUMB_SIZE)))
  const source = await decodeSource(sourceUri)
  try {
    const longestSide = Math.max(source.width, source.height)
    // 原图本来就够小，缩略图没有收益，直接回退原图
    if (longestSide <= target * THUMB_WORTHWHILE_RATIO) return null

    const scale = target / longestSide
    const targetW = Math.max(1, Math.round(source.width * scale))
    const targetH = Math.max(1, Math.round(source.height * scale))

    // 逐步减半到 2 倍目标以内，再用最后一次 drawImage 收到目标尺寸，
    // 避免一次性大幅降采样出现锯齿；第一步直接从原图源绘制，不额外创建全尺寸 canvas。
    let curW = source.width
    let curH = source.height
    let canvas = null
    while (curW * 0.5 > targetW && curH * 0.5 > targetH) {
      const nextW = Math.max(targetW, Math.floor(curW / 2))
      const nextH = Math.max(targetH, Math.floor(curH / 2))
      const next = drawToCanvas(canvas ? canvasSource(canvas) : source, nextW, nextH)
      if (!next) break
      canvas = next
      curW = nextW
      curH = nextH
    }
    if (!canvas) {
      canvas = drawToCanvas(source, targetW, targetH)
      if (!canvas) return null
    } else if (curW !== targetW || curH !== targetH) {
      canvas = drawToCanvas(canvasSource(canvas), targetW, targetH) || canvas
    }

    // 带透明通道的图编码成 PNG，避免 JPEG 把透明区域填成黑色
    const hasAlpha = canvasHasAlpha(canvas)
    return hasAlpha
      ? await canvasToBlob(canvas, { type: 'image/png' })
      : await canvasToBlob(canvas, { type: 'image/jpeg', quality: ENCODE_JPEG_QUALITY })
  } finally {
    source.close()
  }
}

async function generateThumbBlob(rawUrl, maxSize) {
  const sourceUri = await resolveSourceUri(rawUrl)
  if (!sourceUri) return null
  // 优先 Worker：解码/降采样/编码全部离主线程，多张连发不再卡滚动。
  // not-worthwhile（原图本来就小）等价于主线程 rasterizeThumb 返回 null；
  // 其余失败（环境不支持/超时/崩溃）回退主线程生成，行为与旧版一致。
  try {
    return await generateThumbBlobInWorker(sourceUri, maxSize)
  } catch (error) {
    if (error?.notWorthwhile) return null
    return rasterizeThumb(sourceUri, maxSize)
  }
}

// --- 对外 API ---

/**
 * 获取一张图的本地缩略图展示地址。
 * 命中顺序：内存 -> 持久层 -> 现场生成；全部失败时返回原图 URL。
 * @param {string} url 原图 URI（远程 URL / 本地文件 URI 均可）
 * @param {{ maxSize?: number, viewportDistance?: number }} [options]
 * @returns {Promise<string>}
 */
export async function getCachedImageThumb(url, options = {}) {
  const raw = String(url || '').trim()
  if (!raw) return ''
  const key = buildThumbKey(raw, options.maxSize)

  const memoryHit = touchMemory(key)
  if (memoryHit !== undefined) return memoryHit

  const existing = inFlight.get(key)
  if (existing) return existing

  const promise = (async () => {
    const persisted = await readDerivedImageCache(key).catch(() => null)
    if (persisted) {
      setMemory(key, persisted)
      return persisted
    }

    const blob = await enqueueGenerate(() => generateThumbBlob(raw, options.maxSize))
    if (blob) {
      const objectUrl = URL.createObjectURL(blob)
      setMemory(key, objectUrl)
      writeDerivedImageCache(key, blob).catch(() => { /* 忽略持久化失败 */ })
      return objectUrl
    }

    // 生成失败：负缓存原图 URL，会话内不再反复尝试
    setMemory(key, raw)
    return raw
  })()

  inFlight.set(key, promise)
  try {
    return await promise
  } finally {
    inFlight.delete(key)
  }
}

/**
 * 同步读取缩略图内存层，语义同 peekCachedImage。
 * @param {string} url
 * @param {number} [maxSize]
 * @returns {string}
 */
export function peekImageThumb(url, maxSize = DEFAULT_THUMB_SIZE) {
  const raw = String(url || '').trim()
  if (!raw) return ''
  return memoryCache.get(buildThumbKey(raw, maxSize)) || ''
}

/**
 * 丢弃缩略图内存条目并重新解析（持久层命中或现场生成）。
 * 供 LazyCachedImage 在 WebView 可能丢失纹理的 resume 场景使用。
 * @param {string} url
 * @param {{ maxSize?: number }} [options]
 * @returns {Promise<string>}
 */
export async function refreshCachedImageThumb(url, options = {}) {
  const raw = String(url || '').trim()
  if (!raw) return ''
  const key = buildThumbKey(raw, options.maxSize)

  const existing = memoryCache.get(key)
  if (existing !== undefined) {
    memoryCache.delete(key)
    revokeIfBlobUrl(existing)
  }

  try {
    return (await getCachedImageThumb(raw, options)) || raw
  } catch {
    return raw
  }
}
