// @ts-check
/**
 * 收藏馆背景图导入：单张图，不生成多档变体。
 *
 * 背景图可能是方形图，也可能是一张很长的横幅图；展示侧按宽高自动决定
 * cover 还是「完整居中 + 同图模糊铺底」（见 ProfileHero）。这里负责：
 * 1. 图片按最长边 2560 归一化，超出体积上限才重新编码（15MB 原图也只做一次解码 + 一次编码）；
 * 2. 记录宽高；
 * 3. 从缩略图提取「主题色」accent（深浅色仍跟随 App 主题）。
 *
 * 性能要点：调用方传 **File**（不是 data URL）——避免大图先做一遍 base64；
 * 整条管线只解码一次，取色直接从缩放后的画布采样，不再二次解码原图。
 */

import { Capacitor } from '@capacitor/core'
import { saveManagedLocalImageDataUrl } from '@/utils/image/localImage'
import { hexToHsl } from '@/utils/color'
import { ensureReadableAccent, makeProfileItemId, normalizeProfileItem } from './collectionProfile'

const IS_NATIVE = Capacitor.isNativePlatform()

// 单图体积上限：原生端贴着同步上限（4MB）留一点余量；Web 端背景图是 data URL
// 直接写 localStorage，压小一档避免多张图撑爆存储配额。
const MAX_BYTES = IS_NATIVE ? 3.75 * 1024 * 1024 : 1.5 * 1024 * 1024
const MAX_EDGE = 2560
const MAX_ACCENT_SAMPLE_EDGE = 32
const QUALITY_STEPS = [0.9, 0.84, 0.78, 0.72, 0.66, 0.6]

const ORIGINAL_PASSTHROUGH_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function yieldToUi() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function readBlobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(/** @type {string} */ (reader.result))
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.readAsDataURL(blob)
  })
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('图片编码失败'))
    }, 'image/jpeg', quality)
  })
}

function rgbToHex(r, g, b) {
  const toHex = (value) => Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

/**
 * 从缩略像素里提取主题色：按色相分桶，用「饱和度 × 中间亮度权重」投票，
 * 取票数最高的桶的颜色；整张图都灰时返回空串（展示层回落到 App 主题）。
 */
function extractAccentFromPixels(pixels) {
  const buckets = new Map()
  let sampled = 0

  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3]
    if (alpha < 128) continue
    sampled += 1
    const r = pixels[index]
    const g = pixels[index + 1]
    const b = pixels[index + 2]
    const { h, s, l } = hexToHsl(rgbToHex(r, g, b))
    if (s < 14 || l < 8 || l > 95) continue

    const weight = s * (1 - Math.min(1, Math.abs(l - 50) / 70))
    if (weight <= 0) continue
    const bucketIndex = Math.floor(h / 20)
    const bucket = buckets.get(bucketIndex) || { r: 0, g: 0, b: 0, weight: 0 }
    bucket.r += r * weight
    bucket.g += g * weight
    bucket.b += b * weight
    bucket.weight += weight
    buckets.set(bucketIndex, bucket)
  }

  let best = null
  for (const bucket of buckets.values()) {
    if (!best || bucket.weight > best.weight) best = bucket
  }
  // 彩色像素总量太少（黑白 / 灰阶图）→ 不用背景取色
  if (!best || best.weight < sampled * 6) return ''

  return ensureReadableAccent(rgbToHex(
    best.r / best.weight,
    best.g / best.weight,
    best.b / best.weight
  ))
}

/**
 * 把图片解码成可绘制的源（只解码一次）。
 * @param {Blob} blob
 */
async function decodeImage(blob) {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob)
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close?.()
    }
  }
  const url = URL.createObjectURL(blob)
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('图片解码失败'))
      element.src = url
    })
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => URL.revokeObjectURL(url)
    }
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
}

function drawToCanvas(source, width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('画布不可用')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(source, 0, 0, width, height)
  return canvas
}

/**
 * @param {HTMLCanvasElement} canvas
 */
function extractAccentFromCanvas(canvas) {
  try {
    const edge = Math.min(MAX_ACCENT_SAMPLE_EDGE, canvas.width, canvas.height)
    const sample = document.createElement('canvas')
    sample.width = edge
    sample.height = edge
    const context = sample.getContext('2d', { willReadFrequently: true })
    if (!context) return ''
    context.drawImage(canvas, 0, 0, edge, edge)
    const { data } = context.getImageData(0, 0, edge, edge)
    return extractAccentFromPixels(data)
  } catch {
    // 画布取色失败（极端环境）时回落到 App 主题
    return ''
  }
}

/**
 * 体积超限时逐步降质量；仍超限就等比缩尺寸再试。
 * @param {HTMLCanvasElement} sourceCanvas
 */
async function encodeUnderLimit(sourceCanvas) {
  let canvas = sourceCanvas
  let lastBlob = null

  for (let round = 0; round < 4; round += 1) {
    for (const quality of QUALITY_STEPS) {
      const blob = await canvasToBlob(canvas, quality)
      lastBlob = blob
      if (blob.size <= MAX_BYTES) return { blob, canvas }
    }
    const nextWidth = Math.max(1, Math.round(canvas.width * 0.85))
    const nextHeight = Math.max(1, Math.round(canvas.height * 0.85))
    canvas = drawToCanvas(canvas, nextWidth, nextHeight)
  }

  return { blob: lastBlob, canvas }
}

/**
 * 生成可直接写进背景集的图片条目（单张）。
 * @param {File|Blob|string} input 用户选择的图片（优先 File；兼容 data URL）
 */
export async function createProfileBackgroundImageItem(input) {
  if (!input) throw new Error('没有选择图片')

  // 先让出一帧，保证「导入中」状态能先渲染出来
  await yieldToUi()

  /** @type {Blob} */
  let file
  if (typeof input === 'string') {
    if (!input.startsWith('data:image/')) throw new Error('图片格式不支持')
    const response = await fetch(input)
    file = await response.blob()
  } else {
    file = input
  }

  const decoded = await decodeImage(file)
  let width = decoded.width
  let height = decoded.height
  let accent = ''

  try {
    if (!width || !height) throw new Error('图片尺寸无效')
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height))
    const targetWidth = Math.max(1, Math.round(width * scale))
    const targetHeight = Math.max(1, Math.round(height * scale))
    const needsResize = scale < 1
    const sourceCanvas = drawToCanvas(decoded.source, targetWidth, targetHeight)

    // 取主题色只依赖缩放后的画布，不再二次解码原图
    accent = extractAccentFromCanvas(sourceCanvas)

    const type = String(file.type || '').toLowerCase()
    const canPassthrough = !needsResize
      && file.size <= MAX_BYTES
      && ORIGINAL_PASSTHROUGH_TYPES.has(type)

    let saved
    if (canPassthrough) {
      // 尺寸和体积都达标：原样保存，不重新编码（绝大多数 1–3MB 图片走这里）
      saved = await saveManagedLocalImageDataUrl(await readBlobAsDataUrl(file))
    } else {
      await yieldToUi()
      const { blob } = await encodeUnderLimit(sourceCanvas)
      saved = await saveManagedLocalImageDataUrl(await readBlobAsDataUrl(blob))
      file = blob
    }

    width = targetWidth
    height = targetHeight
    return normalizeProfileItem({
      id: makeProfileItemId(),
      kind: 'image',
      uri: saved.uri,
      localPath: saved.localPath,
      width,
      height,
      mimeType: String(file.type || 'image/jpeg'),
      fileSize: Number(file.size) || 0,
      accent
    })
  } finally {
    decoded.close()
  }
}
