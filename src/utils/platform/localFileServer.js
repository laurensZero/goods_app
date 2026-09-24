/**
 * utils/platform/localFileServer.js
 * 本地 zip → 127.0.0.1 HTTP 直链，喂给 CapGo download()。
 *
 * CapGo 的 download 走 HttpURLConnection，只认 http/https；
 * file:// 与绝对路径都会 "Failed to download from"。
 * 云端安装同理是 HTTPS 直链；本地用回环 HTTP 复用同一条安装链路。
 */
import { Capacitor, registerPlugin } from '@capacitor/core'

const LocalFileServer = Capacitor.isNativePlatform()
  ? registerPlugin('LocalFileServer')
  : null

/**
 * 启动一次性文件服务，返回 CapGo 可下载的 http://127.0.0.1 URL。
 * @param {string} path 绝对路径或 file:// URI
 * @returns {Promise<string>} http://127.0.0.1:port/bundle.zip
 */
export async function startLocalFileServer(path) {
  if (!LocalFileServer) {
    throw new Error('仅原生环境支持本地资源包安装。')
  }
  const normalized = String(path || '').replace(/^file:\/\//, '')
  const result = await LocalFileServer.startFileServer({ path: normalized })
  const url = String(result?.url || '')
  if (!url.startsWith('http://127.0.0.1:')) {
    throw new Error('本地文件服务未返回可用地址。')
  }
  return url
}

/** 安装完成后关闭端口。 */
export async function stopLocalFileServer() {
  if (!LocalFileServer) return
  try {
    await LocalFileServer.stopFileServer()
  } catch {
    // ignore
  }
}
