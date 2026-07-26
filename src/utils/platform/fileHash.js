/**
 * utils/platform/fileHash.js
 * 文件哈希计算工具
 *
 * 用于 APK 下载后的 SHA-256 完整性校验（OTA 更新链路防篡改）。
 * crypto.subtle 在 Capacitor WebView（安全上下文）中可用。
 */
import { Capacitor } from '@capacitor/core'
import { Filesystem } from '@capacitor/filesystem'

/**
 * 计算 ArrayBuffer（或 TypedArray）的 SHA-256，返回小写十六进制字符串
 * @param {ArrayBuffer|Uint8Array} buffer
 * @returns {Promise<string>}
 */
export async function sha256Hex(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * 将 base64 字符串解码为 ArrayBuffer（逐字节线性填充，避免 O(n²) 字符串拼接）
 * @param {string} base64
 * @returns {ArrayBuffer}
 */
export function base64ToArrayBuffer(base64) {
  const binary = atob(String(base64 || ''))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

/**
 * 计算本地文件的 SHA-256（小写十六进制）
 *
 * 优先通过 WebView 本地服务器以二进制流读取（fetch + convertFileSrc，
 * 避免 base64 内存翻倍，模式同 utils/image/localImage.js）；
 * 失败时回退到 Filesystem.readFile 的 base64 路径。
 *
 * @param {string} path - 文件相对路径
 * @param {string} directory - Capacitor Directory 枚举值
 * @returns {Promise<string>}
 */
export async function computeFileSha256(path, directory) {
  let buffer = null

  try {
    const { uri } = await Filesystem.getUri({ path, directory })
    const response = await fetch(Capacitor.convertFileSrc(uri))
    if (response.ok) {
      buffer = await response.arrayBuffer()
    }
  } catch {
    // 忽略，走 base64 回退路径
  }

  if (!buffer) {
    const { data } = await Filesystem.readFile({ path, directory })
    buffer = base64ToArrayBuffer(String(data || ''))
  }

  return sha256Hex(buffer)
}
