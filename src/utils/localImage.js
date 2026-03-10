/**
 * localImage.js
 *
 * 将用户从相册或文件选择器选取的图片保存到 App 本地存储，
 * 返回 WebView 可访问的 URI 字符串。
 *
 * 平台处理策略：
 *   - Capacitor Native（Android/iOS）: 保存到 Directory.Data，使用 ConvertFileSrc 返回 capacitor:// URI
 *   - Web / 浏览器开发模式: 直接返回 data:image/... base64 Data URL
 */

import { Filesystem, Directory } from '@capacitor/filesystem'
import { Capacitor } from '@capacitor/core'

const IMAGE_FOLDER = 'user-images'

/**
 * 将 File 对象保存到 App 本地存储，返回可用于 <img src> 的 URI。
 * @param {File} file - 用户选取的图片文件
 * @returns {Promise<string>} 本地图片 URI
 */
export async function saveLocalImage(file) {
  const dataUrl = await _fileToDataUrl(file)

  if (Capacitor.isNativePlatform()) {
    // 原生平台：保存到 Data 目录，返回 capacitor:// 可访问 URI
    const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
    const filename = `${IMAGE_FOLDER}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`
    const base64Data = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl

    await Filesystem.writeFile({
      path: filename,
      data: base64Data,
      directory: Directory.Data,
      recursive: true,
    })

    const { uri } = await Filesystem.getUri({
      path: filename,
      directory: Directory.Data,
    })

    return Capacitor.convertFileSrc(uri)
  } else {
    // 浏览器开发模式：直接用 Data URL（方便预览，但体积较大）
    return dataUrl
  }
}

/**
 * 判断一个图片 URI 是否为本地图片（capacitor:// 原生 URI 或 data: base64 URL）。
 * @param {string} uri
 * @returns {boolean}
 */
export function isLocalImageUri(uri) {
  if (!uri || typeof uri !== 'string') return false
  return uri.startsWith('capacitor://') || uri.startsWith('data:image/')
}

/**
 * 从 capacitor:// URI 中提取相对于 Directory.Data 的文件路径。
 * URI 形如：capacitor://localhost/_capacitor_file_/data/.../files/user-images/xxx.jpg
 * @param {string} uri
 * @returns {string|null}
 */
function _extractLocalPath(uri) {
  const match = uri.match(/user-images\/[\w.\-]+/)
  return match ? match[0] : null
}

/**
 * 将本地 capacitor:// URI 读取为 data: URL（用于导出备份时嵌入图片）。
 * 若 URI 本身已是 data: URL，直接返回。
 * 读取失败时返回 null。
 * @param {string} uri
 * @returns {Promise<string|null>}
 */
export async function readLocalImageAsDataUrl(uri) {
  if (!uri) return null
  if (uri.startsWith('data:')) return uri

  if (!Capacitor.isNativePlatform()) return null

  const path = _extractLocalPath(uri)
  if (!path) return null

  try {
    const { data } = await Filesystem.readFile({ path, directory: Directory.Data })
    // data 是 base64 字符串，需要推断 MIME 类型
    const ext = path.split('.').pop().toLowerCase()
    const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif' }
    const mime = mimeMap[ext] || 'image/jpeg'
    return `data:${mime};base64,${data}`
  } catch (e) {
    console.warn('[localImage] 读取本地图片失败', path, e)
    return null
  }
}

/**
 * 将 data: URL 图片恢复保存到 App 本地存储（用于从 JSON 备份导入时还原图片）。
 * 非原生平台直接返回 data: URL 本身。
 * @param {string} dataUrl - data:image/...;base64,... 格式的 URL
 * @returns {Promise<string>} 还原后的本地 URI
 */
export async function restoreLocalImageFromDataUrl(dataUrl) {
  if (!dataUrl?.startsWith('data:image/')) return dataUrl

  if (!Capacitor.isNativePlatform()) {
    return dataUrl  // 浏览器模式直接保留 data: URL
  }

  const match = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/)
  if (!match) return dataUrl

  const rawExt = match[1]
  const ext = rawExt === 'jpeg' ? 'jpg' : rawExt
  const base64Data = match[2]
  const filename = `${IMAGE_FOLDER}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`

  try {
    await Filesystem.writeFile({
      path: filename,
      data: base64Data,
      directory: Directory.Data,
      recursive: true,
    })

    const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Data })
    return Capacitor.convertFileSrc(uri)
  } catch (e) {
    console.warn('[localImage] 还原图片失败', e)
    return dataUrl  // 回退：保留 data: URL
  }
}

/**
 * 将 File 对象读取为 base64 Data URL。
 * @param {File} file
 * @returns {Promise<string>}
 */
function _fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(/** @type {string} */ (e.target.result))
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.readAsDataURL(file)
  })
}
