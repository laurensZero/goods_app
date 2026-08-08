import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { useAuthStore } from '@/stores/auth'
import { getSession } from '@/utils/supabase/auth'
import { getSupabaseClient } from '@/utils/sync/supabaseClient'
import { createLogger } from '@/utils/logger'

const log = createLogger('cloud-cutout')

let imglyModule = null
async function getImgly() {
  if (!imglyModule) {
    imglyModule = await import('@imgly/background-removal')
  }
  return imglyModule
}

let hasSuccessfulCutout = false
const MODEL_READY_STORAGE_KEY = 'goods-app:cutout-model-ready'
const LOCAL_ASSET_READY_STORAGE_KEY = 'goods-app:cutout-local-assets-ready-v1.7.1-utf8'
const MIRROR_URLS_STORAGE_KEY = 'goods-app:cutout-mirror-urls'
const IMGLY_MODEL_VERSION = '1.7.0'
const IMGLY_BASE_URL = `https://staticimgly.com/@imgly/background-removal-data/${IMGLY_MODEL_VERSION}/dist/`
const LOCAL_ASSET_BASE_PATH = `imgly-assets/${IMGLY_MODEL_VERSION}/dist`

let modelReady = (() => {
  try {
    return localStorage.getItem(MODEL_READY_STORAGE_KEY) === '1'
  } catch {
    return false
  }
})()
let preloadPromise = null
let localAssetPreparePromise = null

function readLocalFlag(key) {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function writeLocalFlag(key, value) {
  try {
    if (value) {
      localStorage.setItem(key, '1')
    } else {
      localStorage.removeItem(key)
    }
  } catch {
  }
}

function resetCutoutModelState() {
  hasSuccessfulCutout = false
  modelReady = false
  preloadPromise = null
  localAssetPreparePromise = null
  writeLocalFlag(MODEL_READY_STORAGE_KEY, false)
  writeLocalFlag(LOCAL_ASSET_READY_STORAGE_KEY, false)
}

function normalizeAssetPath(path) {
  return String(path || '').replace(/^\/+/, '')
}

function normalizeBaseUrl(url) {
  const value = String(url || '').trim()
  if (!value) return ''
  return value.endsWith('/') ? value : `${value}/`
}

function getConfiguredMirrorUrls() {
  const urls = []

  try {
    const saved = localStorage.getItem(MIRROR_URLS_STORAGE_KEY)
    if (saved) {
      saved
        .split(',')
        .map(normalizeBaseUrl)
        .filter(Boolean)
        .forEach((item) => urls.push(item))
    }
  } catch {
  }

  try {
    const runtimeMirror = globalThis?.__IMGLY_MIRROR_BASE_URLS__
    if (Array.isArray(runtimeMirror)) {
      runtimeMirror
        .map(normalizeBaseUrl)
        .filter(Boolean)
        .forEach((item) => urls.push(item))
    } else if (typeof runtimeMirror === 'string') {
      const normalized = normalizeBaseUrl(runtimeMirror)
      if (normalized) urls.push(normalized)
    }
  } catch {
  }

  urls.push(IMGLY_BASE_URL)
  return [...new Set(urls)]
}

async function fetchFromMirrors(relativePath, mirrorUrls, fetchArgs = {}) {
  const relPath = normalizeAssetPath(relativePath)
  let lastError = null

  for (const baseUrl of mirrorUrls) {
    try {
      const response = await fetch(`${baseUrl}${relPath}`, fetchArgs)
      if (!response.ok) {
        lastError = new Error(`HTTP ${response.status}`)
        continue
      }
      return { response, baseUrl }
    } catch (error) {
      lastError = error
    }
  }

  throw lastError || new Error(`资源下载失败: ${relativePath}`)
}

async function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result || '')
      const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : ''
      if (!base64) {
        reject(new Error('模型资源编码失败'))
        return
      }
      resolve(base64)
    }
    reader.onerror = () => reject(new Error('模型资源读取失败'))
    reader.readAsDataURL(blob)
  })
}

async function existsInData(path) {
  try {
    await Filesystem.stat({ path, directory: Directory.Data })
    return true
  } catch {
    return false
  }
}

async function writeBinaryAsset(path, blob) {
  const base64 = await blobToBase64(blob)
  await Filesystem.writeFile({
    path,
    data: base64,
    directory: Directory.Data,
    recursive: true
  })
}

async function resolveLocalPublicPath() {
  const markerPath = `${LOCAL_ASSET_BASE_PATH}/resources.json`
  const { uri } = await Filesystem.getUri({
    path: markerPath,
    directory: Directory.Data
  })
  const markerUrl = Capacitor.convertFileSrc(uri)
  return markerUrl.replace(/resources\.json(?:\?.*)?$/, '')
}

async function prepareLocalCutoutAssets() {
  if (!Capacitor.isNativePlatform()) {
    return ''
  }

  const markerPath = `${LOCAL_ASSET_BASE_PATH}/resources.json`
  const localReady = readLocalFlag(LOCAL_ASSET_READY_STORAGE_KEY)
  if (localReady && await existsInData(markerPath)) {
    return resolveLocalPublicPath()
  }

  if (!localAssetPreparePromise) {
    localAssetPreparePromise = (async () => {
      const mirrorUrls = getConfiguredMirrorUrls()
      const { response: resourcesResponse, baseUrl: selectedBaseUrl } = await fetchFromMirrors(
        'resources.json',
        mirrorUrls,
        { cache: 'force-cache' }
      )

      const resourceMap = await resourcesResponse.json()
      const requiredKeys = [
        '/models/isnet',
        '/onnxruntime-web/ort-wasm-simd-threaded.wasm',
        '/onnxruntime-web/ort-wasm-simd-threaded.mjs',
        '/onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm',
        '/onnxruntime-web/ort-wasm-simd-threaded.jsep.mjs'
      ]

      const chunkNames = new Set()
      for (const key of requiredKeys) {
        const entry = resourceMap[key]
        if (!entry?.chunks?.length) continue
        for (const chunk of entry.chunks) {
          const chunkName = normalizeAssetPath(chunk?.name)
          if (chunkName) chunkNames.add(chunkName)
        }
      }

      for (const chunkName of chunkNames) {
        const localPath = `${LOCAL_ASSET_BASE_PATH}/${chunkName}`
        if (await existsInData(localPath)) continue

        const preferredMirrors = [selectedBaseUrl, ...mirrorUrls.filter((item) => item !== selectedBaseUrl)]
        const { response } = await fetchFromMirrors(chunkName, preferredMirrors, { cache: 'force-cache' })
        const blob = await response.blob()
        await writeBinaryAsset(localPath, blob)
      }

      await Filesystem.writeFile({
        path: markerPath,
        data: JSON.stringify(resourceMap),
        directory: Directory.Data,
        encoding: Encoding.UTF8,
        recursive: true
      })

      writeLocalFlag(LOCAL_ASSET_READY_STORAGE_KEY, true)
      return resolveLocalPublicPath()
    })().catch((error) => {
      writeLocalFlag(LOCAL_ASSET_READY_STORAGE_KEY, false)
      localAssetPreparePromise = null
      throw error
    })
  }

  return localAssetPreparePromise
}

function timeoutPromise(timeoutMs) {
  return new Promise((_, reject) => {
    const timer = setTimeout(() => {
      clearTimeout(timer)
      const seconds = Math.max(1, Math.round(timeoutMs / 1000))
      reject(new Error(`抠图超时（>${seconds}s），请重试`))
    }, timeoutMs)
  })
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

// 统一抠图错误：保留原始 Error 信息，否则用兜底文案
function normalizeCutoutError(error, fallbackMessage) {
  if (error instanceof Error && error.message) return error
  return new Error(fallbackMessage || '抠图失败')
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.readAsDataURL(blob)
  })
}

async function inspectImageBlob(blob) {
  try {
    const bytes = new Uint8Array(await blob.slice(0, 33).arrayBuffer())
    const isPng = bytes.length >= 24
      && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
      && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
    if (isPng && bytes.length >= 26) {
      const readU32 = (offset) => (
        bytes[offset] * 0x1000000
        + bytes[offset + 1] * 0x10000
        + bytes[offset + 2] * 0x100
        + bytes[offset + 3]
      )
      return {
        signature: 'png',
        width: readU32(16),
        height: readU32(20),
        bitDepth: bytes[24],
        colorType: bytes[25],
        interlace: bytes.length > 28 ? bytes[28] : null
      }
    }
    return {
      signature: Array.from(bytes.slice(0, 12)).map((value) => value.toString(16).padStart(2, '0')).join('')
    }
  } catch (error) {
    return { inspectError: error?.message || String(error) }
  }
}

async function loadImageElement(blob) {
  if (!(blob instanceof Blob) || blob.size <= 0) {
    log.error('image-decode:empty-blob', {
      isBlob: blob instanceof Blob,
      size: Number(blob?.size) || 0,
      type: String(blob?.type || '')
    })
    throw new Error('图片数据为空')
  }

  const blobInfo = {
    size: blob.size,
    type: blob.type || '(empty)',
    native: Capacitor.isNativePlatform()
  }
  const imageHeader = await inspectImageBlob(blob)

  // Android WebView 对大尺寸 PNG 转 Data URL 后会额外复制一份 Base64，
  // 很容易在解码阶段触发内存不足。优先使用 Blob URL，失败后再回退到
  // Data URL；这样既覆盖旧 WebView 的 Blob URL 兼容问题，也避免正常情况
  // 下不必要的 Base64 内存膨胀。
  const load = (src) => new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片解码失败'))
    img.src = src
  })

  let objectUrl = ''
  try {
    objectUrl = URL.createObjectURL(blob)
    const image = await load(objectUrl)
    log.info('image-decode:blob-url-success', {
      ...blobInfo,
      header: imageHeader,
      width: image.naturalWidth || image.width || 0,
      height: image.naturalHeight || image.height || 0
    })
    return image
  } catch (error) {
    // 某些 Android WebView 对带透明通道的 Blob URL 解码失败，继续尝试
    // Data URL。不要直接丢失原始错误，两个方案都失败时统一抛出明确错误。
    try {
      log.warn('image-decode:blob-url-failed', { ...blobInfo, header: imageHeader }, error)
      const dataUrl = await blobToDataUrl(blob)
      const image = await load(dataUrl)
      log.info('image-decode:data-url-success', {
        ...blobInfo,
        header: imageHeader,
        width: image.naturalWidth || image.width || 0,
        height: image.naturalHeight || image.height || 0
      })
      return image
    } catch (fallbackError) {
      log.error('image-decode:data-url-failed', { ...blobInfo, header: imageHeader }, fallbackError)
      throw error instanceof Error ? error : new Error('图片解码失败')
    }
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  }
}

async function blobToCanvas(blob) {
  const img = await loadImageElement(blob)
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth || img.width
  canvas.height = img.naturalHeight || img.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0)
  return canvas
}

function canvasToBlob(canvas, type = 'image/png', quality = 1) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('抠图结果处理失败'))
        return
      }
      resolve(blob)
    }, type, quality)
  })
}

function createCanvas(width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  return canvas
}

async function prepareCutoutInput(blob, options = {}) {
  const sourceCanvas = await blobToCanvas(blob)
  const sourceWidth = sourceCanvas.width
  const sourceHeight = sourceCanvas.height
  const longestSide = Math.max(sourceWidth, sourceHeight)
  const maxProcessSize = clamp(Number(options.maxProcessSize) || 1800, 480, 4096)
  const paddingRatio = clamp(Number(options.paddingRatio) || 0.08, 0, 0.24)

  let scale = 1
  if (longestSide > maxProcessSize) {
    scale = maxProcessSize / longestSide
  }

  const contentWidth = Math.max(1, Math.round(sourceWidth * scale))
  const contentHeight = Math.max(1, Math.round(sourceHeight * scale))
  const padding = paddingRatio > 0
    ? Math.max(24, Math.round(Math.min(contentWidth, contentHeight) * paddingRatio))
    : 0

  const preparedCanvas = createCanvas(contentWidth + padding * 2, contentHeight + padding * 2)
  const ctx = preparedCanvas.getContext('2d', { willReadFrequently: true })
  ctx.clearRect(0, 0, preparedCanvas.width, preparedCanvas.height)
  ctx.drawImage(sourceCanvas, 0, 0, sourceWidth, sourceHeight, padding, padding, contentWidth, contentHeight)

  return {
    blob: await canvasToBlob(preparedCanvas, 'image/png', 1),
    referenceCanvas: preparedCanvas,
    meta: {
      sourceWidth,
      sourceHeight,
      contentWidth,
      contentHeight,
      padding
    }
  }
}

async function refineCutoutMask(blob, referenceCanvas) {
  const maskCanvas = await blobToCanvas(blob)
  if (
    !referenceCanvas
    || referenceCanvas.width !== maskCanvas.width
    || referenceCanvas.height !== maskCanvas.height
  ) {
    return blob
  }

  const width = maskCanvas.width
  const height = maskCanvas.height
  const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true })
  const referenceCtx = referenceCanvas.getContext('2d', { willReadFrequently: true })
  const maskImage = maskCtx.getImageData(0, 0, width, height)
  const referenceImage = referenceCtx.getImageData(0, 0, width, height)
  const maskData = maskImage.data
  const referenceData = referenceImage.data

  // 预计算参考图亮度与饱和度，避免循环内重复取像素
  const pixelCount = width * height
  const luminance = new Float32Array(pixelCount)
  const saturation = new Float32Array(pixelCount)
  for (let i = 0, p = 0; i < pixelCount; i += 1, p += 4) {
    const r = referenceData[p]
    const g = referenceData[p + 1]
    const b = referenceData[p + 2]
    const maxRgb = Math.max(r, g, b)
    const minRgb = Math.min(r, g, b)
    luminance[i] = r * 0.2126 + g * 0.7152 + b * 0.0722
    saturation[i] = maxRgb <= 0 ? 0 : (maxRgb - minRgb) / maxRgb
  }

  // 预计算 mask 归一化 alpha，邻域访问用线性索引
  const alpha = new Float32Array(pixelCount)
  for (let i = 0, p = 0; i < pixelCount; i += 1, p += 4) {
    alpha[i] = maskData[p + 3] / 255
  }

  for (let y = 1; y < height - 1; y += 1) {
    const rowOffset = y * width
    for (let x = 1; x < width - 1; x += 1) {
      const index = rowOffset + x
      const currentAlpha = alpha[index]
      if (currentAlpha <= 0.015) {
        maskData[index * 4 + 3] = 0
        continue
      }
      if (currentAlpha >= 0.985) {
        maskData[index * 4 + 3] = 255
        continue
      }

      const lum = luminance[index]
      const edgeStrength = Math.max(
        Math.abs(lum - luminance[index - 1]),
        Math.abs(lum - luminance[index + 1]),
        Math.abs(lum - luminance[index - width]),
        Math.abs(lum - luminance[index + width])
      ) / 255

      // 邻域 alpha 最大值（8 邻域内联展开）
      let neighborAlpha = 0
      let na = alpha[index - width - 1]
      if (na > neighborAlpha) neighborAlpha = na
      na = alpha[index - width]
      if (na > neighborAlpha) neighborAlpha = na
      na = alpha[index - width + 1]
      if (na > neighborAlpha) neighborAlpha = na
      na = alpha[index - 1]
      if (na > neighborAlpha) neighborAlpha = na
      na = alpha[index + 1]
      if (na > neighborAlpha) neighborAlpha = na
      na = alpha[index + width - 1]
      if (na > neighborAlpha) neighborAlpha = na
      na = alpha[index + width]
      if (na > neighborAlpha) neighborAlpha = na
      na = alpha[index + width + 1]
      if (na > neighborAlpha) neighborAlpha = na

      const detailScore = Math.max(saturation[index] * 0.8, edgeStrength)

      let nextAlpha = currentAlpha

      if (currentAlpha < 0.12) {
        nextAlpha = neighborAlpha > 0.88 && detailScore > 0.24
          ? Math.min(0.22, currentAlpha + 0.06)
          : 0
      } else if (currentAlpha < 0.3) {
        if (neighborAlpha < 0.62 || detailScore < 0.16) {
          nextAlpha = currentAlpha * 0.28
        } else {
          nextAlpha = Math.min(0.34, currentAlpha + 0.04)
        }
      } else if (currentAlpha < 0.58) {
        if (neighborAlpha < 0.5 && detailScore < 0.12) {
          nextAlpha = currentAlpha * 0.72
        } else if (neighborAlpha > 0.82 && detailScore > 0.18) {
          nextAlpha = Math.min(0.68, currentAlpha + 0.06)
        }
      }

      if (nextAlpha !== currentAlpha) {
        maskData[index * 4 + 3] = Math.round(clamp(nextAlpha, 0, 1) * 255)
      }
    }
  }

  maskCtx.putImageData(maskImage, 0, 0)
  return canvasToBlob(maskCanvas, 'image/png', 1)
}

async function finalizeCutoutResult(blob, meta) {
  if (!meta?.padding) return blob

  const canvas = await blobToCanvas(blob)
  const outputCanvas = createCanvas(meta.sourceWidth, meta.sourceHeight)
  const ctx = outputCanvas.getContext('2d', { willReadFrequently: true })
  ctx.clearRect(0, 0, outputCanvas.width, outputCanvas.height)
  ctx.drawImage(
    canvas,
    meta.padding,
    meta.padding,
    meta.contentWidth,
    meta.contentHeight,
    0,
    0,
    meta.sourceWidth,
    meta.sourceHeight
  )
  return canvasToBlob(outputCanvas, 'image/png', 1)
}

export async function clearLocalModelAssets() {
  if (!Capacitor.isNativePlatform()) return false
  try {
    await Filesystem.rmdir({
      path: 'imgly-assets',
      directory: Directory.Data,
      recursive: true
    })
  } catch (error) {
    console.error('清理模型文件失败', error)
  } finally {
    resetCutoutModelState()
  }

  return true
}

// ---------- 云端抠图（FAPIhub，经 Supabase Edge Function 转发） ----------
// 白名单权限缓存：同一次会话内复用，登录状态变化后失效由 reset 处理
let cachedCloudAllowed = null

export function resetCloudCutoutPermission() {
  cachedCloudAllowed = null
}

/**
 * 校验当前登录用户是否在 feature_whitelist（feature='remove_bg'）白名单内。
 * 安全策略：未登录 / 网络失败 / Edge Function 不可用 → 一律 false。
 * 结果模块级缓存，同会话内不重复请求。
 */
export async function checkCloudCutoutPermission() {
  const authStore = useAuthStore()
  try {
    await authStore.init()
  } catch {
    cachedCloudAllowed = false
    return false
  }

  if (!authStore.isLoggedIn) {
    cachedCloudAllowed = false
    return false
  }
  if (cachedCloudAllowed !== null) {
    return cachedCloudAllowed
  }

  try {
    const supabase = getSupabaseClient()
    const session = await getSession()
    if (!session?.access_token) {
      cachedCloudAllowed = false
      return cachedCloudAllowed
    }
    const { data, error } = await supabase.functions.invoke('remove-bg', {
      method: 'GET',
      headers: { Authorization: `Bearer ${session.access_token}` }
    })
    if (error) throw error
    cachedCloudAllowed = data?.allowed === true
  } catch (e) {
    log.error('check:failed', { message: e?.message })
    cachedCloudAllowed = false
  }
  return cachedCloudAllowed
}

/**
 * 上传图片到 Edge Function，经 FAPIhub 抠图后返回 mask（PNG Blob）。
 * @param {Blob} inputBlob 已预处理（含 padding）的输入图
 * @param {object} options { model?: 'falcon'|'aurora'|'ghost', onProgress }
 * @returns {Promise<Blob>} mask 图片
 */
async function uploadCloudCutoutMask(inputBlob, options = {}) {
  const reportProgress = typeof options.onProgress === 'function' ? options.onProgress : null
  const emitProgress = (percent, text) => {
    if (!reportProgress) return
    reportProgress({
      percent: clamp(Math.round(Number(percent) || 0), 0, 100),
      text: text || '云端抠图处理中...'
    })
  }

  const session = await getSession()
  if (!session?.access_token) {
    throw new Error('云端抠图需要登录')
  }

  const supabase = getSupabaseClient()
  const formData = new FormData()
  formData.append('image', inputBlob, 'cutout.png')
  const model = options.model || 'falcon'
  formData.append('model', model)

  emitProgress(40, '连接云端...')
  let progressTimer = null
  try {
    // 等待期间平滑推进进度，避免长时间停在固定百分比让用户以为卡死
    let fakePercent = 40
    progressTimer = setInterval(() => {
      fakePercent = Math.min(78, fakePercent + (Math.random() * 2 + 1))
      emitProgress(fakePercent, '云端处理中，请稍候...')
    }, 800)

    // 不用 supabase.functions.invoke：supabase-js 2.105.4 只把 octet-stream/pdf
    // 解析成 Blob，image/png 会被当 text 读成乱码。改用原生 fetch 直接请求
    // Edge Function，返回的 Blob 携带正确 Content-Type，Android WebView 才能解码。
    const url = new URL(`functions/v1/remove-bg`, supabase.supabaseUrl).toString()
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: supabase.supabaseKey,
        Authorization: `Bearer ${session.access_token}`
      },
      body: formData
    })

    if (!response.ok) {
      // 非 2xx（如 403 白名单失效）——把云端具体原因透传给用户
      if (response.status === 403) {
        cachedCloudAllowed = false
      }
      let message = ''
      try {
        const body = await response.json()
        if (body?.error && typeof body.error === 'string') message = body.error
      } catch {
        // 非 JSON 错误体，忽略
      }
      throw new Error(message || `云端抠图失败（${response.status}）`)
    }

    const data = await response.blob()
    if (!(data instanceof Blob) || data.size === 0) {
      throw new Error('云端抠图失败，请稍后重试')
    }

    emitProgress(80, '云端处理完成')
    return data
  } finally {
    if (progressTimer) clearInterval(progressTimer)
  }
}

export function useImageCutout() {
  function isCutoutModelReady() {
    return modelReady
  }

  async function ensureCutoutModelReady() {
    if (modelReady) return

    if (!preloadPromise) {
      preloadPromise = (async () => {
        const localPublicPath = await prepareLocalCutoutAssets().catch(() => '')

        const preloadConfig = {
          model: 'isnet',
          fetchArgs: {
            cache: 'force-cache'
          }
        }

        if (localPublicPath) {
          preloadConfig.publicPath = localPublicPath
        }

        const { preload } = await getImgly()
        await preload(preloadConfig)
      })()
        .then(() => {
          modelReady = true
          writeLocalFlag(MODEL_READY_STORAGE_KEY, true)
        })
        .catch((error) => {
          preloadPromise = null
          throw error
        })
    }

    await preloadPromise
  }

  async function createCutoutMask(inputBlob, options = {}) {
    const reportProgress = typeof options.onProgress === 'function'
      ? options.onProgress
      : null

    const emitProgress = (percent, text) => {
      if (!reportProgress) return
      reportProgress({
        percent: clamp(Math.round(Number(percent) || 0), 0, 100),
        text: text || '抠图处理中...'
      })
    }

    await ensureCutoutModelReady()
      .then(() => {
        emitProgress(20, '模型准备完成')
      })
      .catch((error) => {
        throw normalizeCutoutError(error, '抠图模型准备失败')
      })

    emitProgress(28, '抠图引擎启动中...')
    const localPublicPath = await prepareLocalCutoutAssets().catch(() => '')
    const preparedInput = await prepareCutoutInput(inputBlob, options)

    const removeConfig = {
      model: 'isnet',
      fetchArgs: {
        cache: 'force-cache'
      },
      progress: (key, current, total) => {
        const currentValue = Number(current)
        const totalValue = Number(total)
        if (!Number.isFinite(currentValue) || !Number.isFinite(totalValue) || totalValue <= 0) {
          return
        }
        const ratio = clamp(currentValue / totalValue, 0, 1)
        const percent = 28 + ratio * 57
        emitProgress(percent, `抠图处理中：${Math.round(ratio * 100)}%`)
      },
      output: {
        format: 'image/png',
        quality: 1,
        type: 'mask'
      }
    }

    if (localPublicPath) {
      removeConfig.publicPath = localPublicPath
    }

    const { segmentForeground } = await getImgly()
    const maskBlob = await segmentForeground(preparedInput.blob, removeConfig)
    emitProgress(88, '修复主体颜色中...')
    const refinedMask = await refineCutoutMask(maskBlob, preparedInput.referenceCanvas)
    emitProgress(94, '边缘优化中...')

    return {
      preparedBlob: preparedInput.blob,
      maskBlob: refinedMask,
      meta: preparedInput.meta,
      width: preparedInput.referenceCanvas.width,
      height: preparedInput.referenceCanvas.height,
      source: 'local'
    }
  }

  // 云端抠图：本地预处理（缩放+padding），上传 FAPIhub，返回的即抠好的透明图。
  // 不再做本地 refine/重建（云端返回图 RGB 已正确，本地重建反而重且易错）。
  async function createCloudCutoutMask(inputBlob, options = {}) {
    const reportProgress = typeof options.onProgress === 'function'
      ? options.onProgress
      : null

    const emitProgress = (percent, text) => {
      if (!reportProgress) return
      reportProgress({
        percent: clamp(Math.round(Number(percent) || 0), 0, 100),
        text: text || '云端抠图处理中...'
      })
    }

    if (!(await checkCloudCutoutPermission())) {
      throw new Error('云端抠图未授权')
    }

    emitProgress(12, '云端引擎准备中...')
    const preparedInput = await prepareCutoutInput(inputBlob, { ...options, maxProcessSize: 1800 })
    const cutoutBlob = await uploadCloudCutoutMask(preparedInput.blob, options)
    emitProgress(92, '处理完成')

    return {
      preparedBlob: preparedInput.blob,
      maskBlob: cutoutBlob,
      meta: preparedInput.meta,
      width: preparedInput.referenceCanvas.width,
      height: preparedInput.referenceCanvas.height,
      source: 'cloud'
    }
  }

  async function applyCutoutMask(preparedBlob, maskBlob, meta) {
    const localPublicPath = await prepareLocalCutoutAssets().catch(() => '')
    const applyConfig = {
      model: 'isnet',
      fetchArgs: {
        cache: 'force-cache'
      },
      output: {
        format: 'image/png',
        quality: 1
      }
    }

    if (localPublicPath) {
      applyConfig.publicPath = localPublicPath
    }

    const { applySegmentationMask } = await getImgly()
    const cutoutBlob = await applySegmentationMask(preparedBlob, maskBlob, applyConfig)
    return finalizeCutoutResult(cutoutBlob, meta)
  }

  // 云端返回的已抠好的透明图：只需裁掉 padding 并缩回原始尺寸，一次 drawImage 即可。
  // maskBlob 实为完整抠图结果（带透明通道），preparedBlob 仅用于尺寸兼容。
  async function applyCloudCutoutMask(preparedBlob, maskBlob, meta) {
    // Edge Function 经原生 fetch 返回的 Blob 携带 image/png Content-Type，
    // blobToCanvas 用 <img> 按字节解码，Android WebView 可正常处理。
    return finalizeCutoutResult(maskBlob, meta)
  }

  async function removeBackgroundWithTimeout(inputBlob, options = {}) {
    const explicitTimeoutMs = Number(options.timeoutMs)
    const timeoutMs = explicitTimeoutMs > 0
      ? explicitTimeoutMs
      : (hasSuccessfulCutout ? 25000 : 90000)

    const reportProgress = typeof options.onProgress === 'function'
      ? options.onProgress
      : null

    const emitProgress = (percent, text) => {
      if (!reportProgress) return
      reportProgress({
        percent: clamp(Math.round(Number(percent) || 0), 0, 100),
        text: text || '抠图处理中...'
      })
    }

    const cutoutTask = ensureCutoutModelReady()
      .then(() => {
        emitProgress(20, '模型准备完成')
      })
      .catch(() => undefined)
      .then(async () => {
        emitProgress(28, '抠图引擎启动中...')
        const localPublicPath = await prepareLocalCutoutAssets().catch(() => '')
        const preparedInput = await prepareCutoutInput(inputBlob, options)

        const removeConfig = {
          model: 'isnet',
          fetchArgs: {
            cache: 'force-cache'
          },
          progress: (key, current, total) => {
            const currentValue = Number(current)
            const totalValue = Number(total)
            if (!Number.isFinite(currentValue) || !Number.isFinite(totalValue) || totalValue <= 0) {
              return
            }
            const ratio = clamp(currentValue / totalValue, 0, 1)
            const percent = 28 + ratio * 57
            emitProgress(percent, `抠图处理中：${Math.round(ratio * 100)}%`)
          },
          output: {
            format: 'image/png',
            quality: 1,
            type: 'mask'
          }
        }

        if (localPublicPath) {
          removeConfig.publicPath = localPublicPath
        }

        const { segmentForeground, applySegmentationMask } = await getImgly()
        return segmentForeground(preparedInput.blob, removeConfig)
          .then(async (maskBlob) => {
            emitProgress(88, '修复主体颜色中...')
            const refinedMask = await refineCutoutMask(maskBlob, preparedInput.referenceCanvas)
            emitProgress(94, '边缘优化中...')
            const cutoutBlob = await applySegmentationMask(preparedInput.blob, refinedMask, {
              ...removeConfig,
              output: {
                format: 'image/png',
                quality: 1
              }
            })
            return finalizeCutoutResult(cutoutBlob, preparedInput.meta)
          })
      })
      .then(async (result) => {
        hasSuccessfulCutout = true
        modelReady = true
        writeLocalFlag(MODEL_READY_STORAGE_KEY, true)
        emitProgress(100, '抠图完成')
        return result
      })

    if (timeoutMs <= 0) return cutoutTask

    return Promise.race([
      cutoutTask,
      timeoutPromise(timeoutMs)
    ])
  }

  return {
    applyCutoutMask,
    applyCloudCutoutMask,
    createCutoutMask,
    createCloudCutoutMask,
    removeBackgroundWithTimeout,
    ensureCutoutModelReady,
    isCutoutModelReady
  }
}
