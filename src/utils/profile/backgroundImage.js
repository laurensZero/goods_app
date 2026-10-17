// @ts-check
/**
 * 收藏馆背景图导入：单张图，不生成多档变体。
 *
 * 背景图可能是方形图，也可能是一张很长的横幅图；展示侧按宽高自动决定
 * cover 还是「完整居中 + 同图模糊铺底」（见 ProfileHero）。这里负责：
 * 1. 读文件头得到宽高，按最长边 2560 归一化；尺寸/体积都达标的图**原样保存**，不重新编码；
 * 2. 记录宽高；
 * 3. 从缩略图提取「主题色」accent（深浅色仍跟随 App 主题）。
 *
 * 性能要点（1MB 图也可能很慢的根因）：
 * - 调用方传 File，避免大图先转 base64；
 * - **不整图解码**：尺寸从 JPEG/PNG/WebP/GIF 文件头解析，取色/缩放都用
 *   `createImageBitmap(blob, { resizeWidth, resizeHeight })` 直接解码到目标尺寸。
 *   1MB 的纯色 PNG 可能是 8000×8000，整图解码等于几十亿像素，慢且可能 OOM；
 *   按目标尺寸解码可以从根上避开。
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
const ACCENT_SAMPLE_EDGE = 32
const QUALITY_STEPS = [0.9, 0.84, 0.78, 0.72, 0.66, 0.6]

const ORIGINAL_PASSTHROUGH_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
// 文件头解析最多读 512KB（部分照片 EXIF 很大，足够覆盖常见 SOF 位置）
const HEADER_READ_BYTES = 512 * 1024

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

/* ── 文件头解析：不解码图片也能拿到宽高 ── */

function readExifOrientation(bytes, dataStart, dataEnd) {
  try {
    if (dataEnd - dataStart < 14) return 1
    if (bytes[dataStart] !== 0x45 || bytes[dataStart + 1] !== 0x78 || bytes[dataStart + 2] !== 0x69 || bytes[dataStart + 3] !== 0x66) {
      return 1
    }
    const tiff = dataStart + 6
    const littleEndian = bytes[tiff] === 0x49 && bytes[tiff + 1] === 0x49
    const read16 = (offset) => (littleEndian
      ? bytes[offset] | (bytes[offset + 1] << 8)
      : (bytes[offset] << 8) | bytes[offset + 1])
    const read32 = (offset) => (littleEndian
      ? bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)
      : (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3])
    const ifdOffset = read32(tiff + 4)
    const ifd = tiff + ifdOffset
    if (ifd + 2 > dataEnd) return 1
    const count = read16(ifd)
    for (let index = 0; index < count; index += 1) {
      const entry = ifd + 2 + index * 12
      if (entry + 12 > dataEnd) break
      if (read16(entry) === 0x0112) return read16(entry + 8) || 1
    }
  } catch {
    // ignore
  }
  return 1
}

function parseJpegSize(bytes, dataEnd) {
  let offset = 2
  let orientation = 1
  while (offset + 4 < dataEnd) {
    if (bytes[offset] !== 0xff) {
      offset += 1
      continue
    }
    const marker = bytes[offset + 1]
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2
      continue
    }
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3]
    if (length < 2) break
    if (marker === 0xe1) {
      orientation = readExifOrientation(bytes, offset + 4, Math.min(offset + 2 + length, dataEnd))
    }
    // SOF0-SOF15（排除 DHT/JPG/DAC）
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (offset + 9 > dataEnd) break
      const height = (bytes[offset + 5] << 8) | bytes[offset + 6]
      const width = (bytes[offset + 7] << 8) | bytes[offset + 8]
      return { width, height, orientation }
    }
    offset += 2 + length
  }
  return { width: 0, height: 0, orientation }
}

function parseWebpSize(bytes, dataEnd) {
  const chunk = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15])
  if (chunk === 'VP8X' && dataEnd > 30) {
    const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16))
    const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16))
    return { width, height, orientation: 1 }
  }
  if (chunk === 'VP8L' && dataEnd > 25) {
    const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24)
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff), orientation: 1 }
  }
  if (chunk === 'VP8 ' && dataEnd > 30) {
    return {
      width: (bytes[26] | (bytes[27] << 8)) & 0x3fff,
      height: (bytes[28] | (bytes[29] << 8)) & 0x3fff,
      orientation: 1
    }
  }
  return { width: 0, height: 0, orientation: 1 }
}

/**
 * 从文件头取（已按 EXIF 方向校正的）显示宽高。失败返回 0×0，由调用方回退整图解码。
 * 导出给「先显示预览、后台再处理」的导入流程用，读文件头几乎无耗时。
 * @param {Blob} blob
 */
export async function readProfileImageDimensions(blob) {
  return await readImageDimensions(blob)
}

/**
 * 从文件头取（已按 EXIF 方向校正的）显示宽高。失败返回 0×0，由调用方回退整图解码。
 * @param {Blob} blob
 */
async function readImageDimensions(blob) {
  try {
    const buffer = await blob.slice(0, Math.min(blob.size, HEADER_READ_BYTES)).arrayBuffer()
    const bytes = new Uint8Array(buffer)
    const end = bytes.length
    if (end < 16) return { width: 0, height: 0 }

    let parsed = { width: 0, height: 0, orientation: 1 }
    if (bytes[0] === 0xff && bytes[1] === 0xd8) {
      parsed = parseJpegSize(bytes, end)
    } else if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
      const view = new DataView(buffer)
      parsed = { width: view.getUint32(16), height: view.getUint32(20), orientation: 1 }
    } else if (end > 30 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
      parsed = parseWebpSize(bytes, end)
    } else if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
      parsed = { width: bytes[6] | (bytes[7] << 8), height: bytes[8] | (bytes[9] << 8), orientation: 1 }
    }

    if (!parsed.width || !parsed.height) return { width: 0, height: 0 }
    // EXIF 6/8 是旋转 90°，显示宽高互换
    if (parsed.orientation === 6 || parsed.orientation === 8) {
      return { width: parsed.height, height: parsed.width }
    }
    return { width: parsed.width, height: parsed.height }
  } catch {
    return { width: 0, height: 0 }
  }
}

/* ── 解码 / 取色 / 编码 ── */

 /**
 * 按目标尺寸直接解码（WebView 支持缩略解码时不会分配整图位图）。
 * 不支持 resize 参数的旧内核会返回原尺寸，由调用方再画到目标画布。
 * @param {Blob} blob
 * @param {number} targetWidth
 * @param {number} targetHeight
 */
async function decodeScaled(blob, targetWidth, targetHeight) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob, {
        resizeWidth: targetWidth,
        resizeHeight: targetHeight,
        resizeQuality: 'high'
      })
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close?.()
      }
    } catch {
      // 旧内核不支持 resize 参数：退回原尺寸解码
      const bitmap = await createImageBitmap(blob)
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close?.()
      }
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

function extractAccentFromCanvas(canvas) {
  try {
    const edge = Math.min(ACCENT_SAMPLE_EDGE, canvas.width, canvas.height)
    const sample = document.createElement('canvas')
    sample.width = edge
    sample.height = edge
    const context = sample.getContext('2d', { willReadFrequently: true })
    if (!context) return ''
    context.drawImage(canvas, 0, 0, edge, edge)
    const { data } = context.getImageData(0, 0, edge, edge)
    return extractAccentFromPixels(data)
  } catch {
    return ''
  }
}

/** 原图直接保存时：用 32×32 缩略解码取色（不整图解码） */
async function sampleAccentFromBlob(blob) {
  try {
    const decoded = await decodeScaled(blob, ACCENT_SAMPLE_EDGE, ACCENT_SAMPLE_EDGE)
    try {
      return extractAccentFromCanvas(drawToCanvas(decoded.source, ACCENT_SAMPLE_EDGE, ACCENT_SAMPLE_EDGE))
    } finally {
      decoded.close()
    }
  } catch {
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

  await yieldToUi()

  /** @type {Blob} */
  let file
  if (typeof input === 'string') {
    if (!input.startsWith('data:image/')) throw new Error('图片格式不支持')
    file = await (await fetch(input)).blob()
  } else {
    file = input
  }

  const type = String(file.type || '').toLowerCase()

  let { width, height } = await readImageDimensions(file)

  // 文件头解析失败时才整图解码取尺寸（正常 JPEG/PNG/WebP/GIF 不会走到这里）
  if (!width || !height) {
    const decoded = await decodeScaled(file, 1, 1)
    try {
      width = decoded.width
      height = decoded.height
    } finally {
      decoded.close()
    }
  }
  if (!width || !height) throw new Error('图片尺寸无效')

  const scale = Math.min(1, MAX_EDGE / Math.max(width, height))
  const targetWidth = Math.max(1, Math.round(width * scale))
  const targetHeight = Math.max(1, Math.round(height * scale))
  const needsResize = scale < 1
  const canPassthrough = !needsResize
    && file.size <= MAX_BYTES
    && ORIGINAL_PASSTHROUGH_TYPES.has(type)

  if (canPassthrough) {
    // 尺寸/体积都达标：原样保存，不重新编码、不整图解码
    const accent = await sampleAccentFromBlob(file)
    const saved = await saveManagedLocalImageDataUrl(await readBlobAsDataUrl(file))
    return normalizeProfileItem({
      id: makeProfileItemId(),
      kind: 'image',
      uri: saved.uri,
      localPath: saved.localPath,
      width,
      height,
      mimeType: type || 'image/jpeg',
      fileSize: file.size,
      accent
    })
  }

  // 需要缩尺寸 / 重新编码：按目标尺寸直接解码，避免整图位图
  await yieldToUi()
  const decoded = await decodeScaled(file, targetWidth, targetHeight)
  try {
    let canvas = drawToCanvas(decoded.source, targetWidth, targetHeight)
    const accent = extractAccentFromCanvas(canvas)
    await yieldToUi()
    const encoded = await encodeUnderLimit(canvas)
    canvas = encoded.canvas
    const saved = await saveManagedLocalImageDataUrl(await readBlobAsDataUrl(encoded.blob))
    return normalizeProfileItem({
      id: makeProfileItemId(),
      kind: 'image',
      uri: saved.uri,
      localPath: saved.localPath,
      width: canvas.width,
      height: canvas.height,
      mimeType: 'image/jpeg',
      fileSize: encoded.blob.size,
      accent
    })
  } finally {
    decoded.close()
  }
}
