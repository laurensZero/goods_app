// @ts-check
/**
 * 把各种图片来源（附件 data:/本地路径、http(s)、cloud-image://、content://）
 * 解析成可直接塞进多模态请求的 data URL。
 *
 * 视觉请求只在用户明确要求时触发；本模块不做「拿到图就分析」的副作用。
 */

import { readLocalImageAsDataUrl } from '@/utils/image/localImage'
import { parseCloudImageUri } from '@/utils/goods/images'
import { compressImageToBlob } from '@/composables/image/useImageExport'

/** 送入模型前的体积上限（字节）：超限则降采样压缩 */
const VISION_MAX_BYTES = 800 * 1024
const VISION_MAX_EDGE = 1280

/** @param {string} uri */
function isHttpUrl(uri) {
  return uri.startsWith('http://') || uri.startsWith('https://')
}

/**
 * 解析并压缩图片为 data URL。
 * @param {Object} source
 * @param {string} source.uri
 * @param {string} [source.localPath]
 * @param {(cloudFileName: string) => Promise<string | null>} [source.restoreCloud]
 * @returns {Promise<string>} data:image/...;base64,...
 */
export async function resolveImageForVision(source) {
  const uri = String(source?.uri || '').trim()
  const localPath = String(source?.localPath || '').trim()
  if (!uri && !localPath) throw new Error('缺少图片地址')

  let dataUrl = ''

  if (uri.startsWith('data:image/')) {
    dataUrl = uri
  } else if (uri.startsWith('cloud-image://') || uri.startsWith('gist-image://')) {
    const fileName = parseCloudImageUri(uri)
    if (!fileName) throw new Error('无法解析云端图片文件名')
    if (typeof source.restoreCloud !== 'function') {
      throw new Error('云端图片暂不可用（未登录或未配置同步）')
    }
    const restored = await source.restoreCloud(fileName)
    if (!restored || !String(restored).startsWith('data:image/')) {
      throw new Error('云端图片下载失败，请稍后重试')
    }
    dataUrl = restored
  } else {
    const fromLocal = await readLocalImageAsDataUrl(uri, localPath)
    if (fromLocal && fromLocal.startsWith('data:image/')) {
      dataUrl = fromLocal
    } else if (isHttpUrl(uri)) {
      // 公网 URL：拉回本地再压缩，避免把超大原图直塞网关
      const response = await fetch(uri)
      if (!response.ok) throw new Error(`图片下载失败（HTTP ${response.status}）`)
      const blob = await response.blob()
      dataUrl = await blobToDataUrl(blob)
    } else {
      throw new Error('无法读取该图片，请重新上传或改用可访问的图片链接')
    }
  }

  if (!dataUrl.startsWith('data:image/')) throw new Error('图片数据格式无效')
  return compressIfNeeded(dataUrl)
}

/**
 * 体积过大时 canvas 降采样压缩；失败则原样返回（不阻断分析）。
 * @param {string} dataUrl
 */
async function compressIfNeeded(dataUrl) {
  // 粗估 base64 长度：4/3 膨胀
  const approxBytes = Math.floor(dataUrl.length * 0.75)
  if (approxBytes <= VISION_MAX_BYTES) return dataUrl
  try {
    const blob = await compressImageToBlob(dataUrl, {
      maxBytes: VISION_MAX_BYTES,
      maxEdge: VISION_MAX_EDGE,
      format: 'image/jpeg'
    })
    if (!blob) return dataUrl
    return await blobToDataUrl(blob)
  } catch {
    return dataUrl
  }
}

/** @param {Blob} blob */
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(/** @type {string} */ (reader.result))
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.readAsDataURL(blob)
  })
}
