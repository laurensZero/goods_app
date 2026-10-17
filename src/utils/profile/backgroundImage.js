// @ts-check
/**
 * 收藏馆背景图导入：单张图，不再生成手机/平板两档变体。
 *
 * 背景图可能是方形图，也可能是一张很长的横幅图；展示侧按宽高自动决定
 * cover 还是「完整居中 + 同图模糊铺底」（见 ProfileHero）。这里只负责
 * 把用户选的图压到合理体积后落盘（同步单图上限 4MB，超过才压）。
 */

import { Capacitor } from '@capacitor/core'
import { compressImageToBlob } from '@/composables/image/useImageExport'
import { saveManagedLocalImageDataUrl } from '@/utils/image/localImage'
import { makeProfileItemId, normalizeProfileItem } from './collectionProfile'

const IS_NATIVE = Capacitor.isNativePlatform()

// 单图上限：原生端贴着同步上限（4MB）留一点余量；Web 端背景图是 data URL
// 直接写 localStorage，压小一档避免多张图撑爆存储配额。
const MAX_BYTES = IS_NATIVE ? 3.75 * 1024 * 1024 : 1.5 * 1024 * 1024

function readBlobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(/** @type {string} */ (reader.result))
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.readAsDataURL(blob)
  })
}

async function readImageSize(dataUrl) {
  try {
    const response = await fetch(dataUrl)
    const blob = await response.blob()
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(blob)
      const size = { width: bitmap.width, height: bitmap.height }
      bitmap.close?.()
      return size
    }
    const url = URL.createObjectURL(blob)
    const img = await new Promise((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('图片解码失败'))
      el.src = url
    })
    const size = { width: img.naturalWidth, height: img.naturalHeight }
    URL.revokeObjectURL(url)
    return size
  } catch {
    return { width: 0, height: 0 }
  }
}

function estimateFileSize(dataUrl) {
  const base64 = String(dataUrl || '').split(',')[1] || ''
  if (!base64) return 0
  const padding = base64.endsWith('==') ? 2 : (base64.endsWith('=') ? 1 : 0)
  return Math.floor((base64.length * 3) / 4) - padding
}

/**
 * 生成可直接写进背景集的图片条目（单张）。
 * @param {string} dataUrl 用户选择的原图（data URL）
 */
export async function createProfileBackgroundImageItem(dataUrl) {
  const text = String(dataUrl || '')
  if (!text.startsWith('data:image/')) throw new Error('图片格式不支持')

  let content = text
  let fileSize = estimateFileSize(content)
  let mimeType = (content.match(/^data:(image\/[\w.+-]+);base64,/) || [])[1] || 'image/jpeg'

  if (fileSize > MAX_BYTES) {
    const compressedBlob = await compressImageToBlob(content, {
      maxBytes: MAX_BYTES - 1024,
      maxEdge: 2560,
      format: 'image/jpeg'
    })
    if (!compressedBlob) throw new Error('图片压缩失败')
    content = await readBlobAsDataUrl(compressedBlob)
    mimeType = compressedBlob.type || 'image/jpeg'
    fileSize = compressedBlob.size
  }

  const { width, height } = await readImageSize(content)
  const saved = await saveManagedLocalImageDataUrl(content)

  return normalizeProfileItem({
    id: makeProfileItemId(),
    kind: 'image',
    uri: saved.uri,
    localPath: saved.localPath,
    width,
    height,
    mimeType,
    fileSize
  })
}
