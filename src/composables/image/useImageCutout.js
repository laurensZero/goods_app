import { applySegmentationMask, preload, segmentForeground } from '@imgly/background-removal'
import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'

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

function blobToCanvas(blob) {
  return new Promise(async (resolve, reject) => {
    try {
      const bitmap = await createImageBitmap(blob)
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(bitmap, 0, 0)
      bitmap.close?.()
      resolve(canvas)
    } catch (error) {
      reject(error)
    }
  })
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

function getPixelAlpha(data, width, x, y) {
  if (x < 0 || y < 0 || x >= width) return 0
  return data[(y * width + x) * 4 + 3] / 255
}

function getPixelLuminance(data, width, x, y) {
  const index = (y * width + x) * 4
  return data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722
}

function getMaxNeighborAlpha(data, width, height, x, y) {
  let maxAlpha = 0

  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      if (offsetX === 0 && offsetY === 0) continue
      const sampleX = x + offsetX
      const sampleY = y + offsetY
      if (sampleX < 0 || sampleY < 0 || sampleX >= width || sampleY >= height) continue
      maxAlpha = Math.max(maxAlpha, getPixelAlpha(data, width, sampleX, sampleY))
    }
  }

  return maxAlpha
}

function estimateBackgroundColor(referenceData, maskData, width, height) {
  const borderSize = Math.max(8, Math.round(Math.min(width, height) * 0.06))
  let totalR = 0
  let totalG = 0
  let totalB = 0
  let sampleCount = 0

  const collectPixel = (x, y, allowMasked = false) => {
    const index = (y * width + x) * 4
    const alpha = maskData[index + 3] / 255
    if (!allowMasked && alpha > 0.2) return
    totalR += referenceData[index]
    totalG += referenceData[index + 1]
    totalB += referenceData[index + 2]
    sampleCount += 1
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const isBorder =
        x < borderSize
        || y < borderSize
        || x >= width - borderSize
        || y >= height - borderSize
      if (!isBorder) continue
      collectPixel(x, y, false)
    }
  }

  if (!sampleCount) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const isBorder =
          x < borderSize
          || y < borderSize
          || x >= width - borderSize
          || y >= height - borderSize
        if (!isBorder) continue
        collectPixel(x, y, true)
      }
    }
  }

  if (!sampleCount) {
    return { r: 255, g: 255, b: 255 }
  }

  return {
    r: totalR / sampleCount,
    g: totalG / sampleCount,
    b: totalB / sampleCount
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
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * 4
      const alpha = maskData[index + 3] / 255
      if (alpha <= 0.015) {
        maskData[index + 3] = 0
        continue
      }
      if (alpha >= 0.985) {
        maskData[index + 3] = 255
        continue
      }

      const r = referenceData[index]
      const g = referenceData[index + 1]
      const b = referenceData[index + 2]
      const maxRgb = Math.max(r, g, b)
      const minRgb = Math.min(r, g, b)
      const saturation = maxRgb <= 0 ? 0 : (maxRgb - minRgb) / maxRgb
      const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722
      const edgeStrength = Math.max(
        Math.abs(luminance - getPixelLuminance(referenceData, width, x - 1, y)),
        Math.abs(luminance - getPixelLuminance(referenceData, width, x + 1, y)),
        Math.abs(luminance - getPixelLuminance(referenceData, width, x, y - 1)),
        Math.abs(luminance - getPixelLuminance(referenceData, width, x, y + 1))
      ) / 255
      const neighborAlpha = getMaxNeighborAlpha(maskData, width, height, x, y)
      const detailScore = Math.max(saturation * 0.8, edgeStrength)

      let nextAlpha = alpha

      if (alpha < 0.12) {
        nextAlpha = neighborAlpha > 0.88 && detailScore > 0.24
          ? Math.min(0.22, alpha + 0.06)
          : 0
      } else if (alpha < 0.3) {
        if (neighborAlpha < 0.62 || detailScore < 0.16) {
          nextAlpha = alpha * 0.28
        } else {
          nextAlpha = Math.min(0.34, alpha + 0.04)
        }
      } else if (alpha < 0.58) {
        if (neighborAlpha < 0.5 && detailScore < 0.12) {
          nextAlpha = alpha * 0.72
        } else if (neighborAlpha > 0.82 && detailScore > 0.18) {
          nextAlpha = Math.min(0.68, alpha + 0.06)
        }
      }

      if (nextAlpha !== alpha) {
        maskData[index + 3] = Math.round(clamp(nextAlpha, 0, 1) * 255)
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

    const maskBlob = await segmentForeground(preparedInput.blob, removeConfig)
    emitProgress(88, '修复主体颜色中...')
    const refinedMask = await refineCutoutMask(maskBlob, preparedInput.referenceCanvas)
    emitProgress(94, '边缘优化中...')

    return {
      preparedBlob: preparedInput.blob,
      maskBlob: refinedMask,
      meta: preparedInput.meta,
      width: preparedInput.referenceCanvas.width,
      height: preparedInput.referenceCanvas.height
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

    const cutoutBlob = await applySegmentationMask(preparedBlob, maskBlob, applyConfig)
    return finalizeCutoutResult(cutoutBlob, meta)
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
    createCutoutMask,
    removeBackgroundWithTimeout,
    ensureCutoutModelReady,
    isCutoutModelReady
  }
}
