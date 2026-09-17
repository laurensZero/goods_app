import { SUPABASE_URL } from '@/config/supabase'

// 与图片使用同一个 Cloudflare Worker，代理公开 Storage 资源并做边缘缓存。
export const MEDIA_PROXY_ORIGIN = 'https://img.goodsapp.de5.net'

export const IMAGE_SOURCE_STORAGE_KEY = 'goods_image_source_mode'

/** @typedef {'proxy' | 'direct'} SourceMode */

/** 图片 / OTA 共用源选项：默认 Cloudflare 边缘代理，可切换 Supabase 直连 */
export const IMAGE_SOURCE_OPTIONS = Object.freeze([
  {
    id: 'proxy',
    origin: MEDIA_PROXY_ORIGIN
  },
  {
    id: 'direct',
    origin: SUPABASE_URL
  }
])

export function isImageSourceMode(value) {
  return value === 'proxy' || value === 'direct'
}

export function getImageSourceMode() {
  try {
    const raw = String(localStorage.getItem(IMAGE_SOURCE_STORAGE_KEY) || '').trim()
    if (isImageSourceMode(raw)) return raw
  } catch {
    // ignore storage failures
  }
  return 'proxy'
}

export function setImageSourceMode(mode) {
  const next = isImageSourceMode(mode) ? mode : 'proxy'
  try {
    localStorage.setItem(IMAGE_SOURCE_STORAGE_KEY, next)
  } catch {
    // ignore storage failures
  }
  return next
}

export function toDirectStorageUrl(storagePath) {
  const path = String(storagePath || '').trim().replace(/^\/+/, '')
  if (!path || path.includes('..')) return ''
  return `${SUPABASE_URL}/storage/v1/object/public/ota-releases/${path}`
}

export function toProxiedStorageUrl(storagePath) {
  const path = String(storagePath || '').trim().replace(/^\/+/, '')
  if (!path || path.includes('..')) return ''
  return `${MEDIA_PROXY_ORIGIN}/ota-releases/${path}`
}

/**
 * OTA 包下载 URL：与图片共用同一源偏好；另一源自动作 fallback。
 * @param {string} storagePath ota-releases 桶内相对路径
 * @param {SourceMode} [sourceId]
 * @returns {{ primary: string, fallback: string }}
 */
export function resolveOtaStorageUrls(storagePath, sourceId = getImageSourceMode()) {
  const preferred = sourceId === 'direct' ? 'direct' : 'proxy'
  const secondary = preferred === 'direct' ? 'proxy' : 'direct'
  const toUrl = preferred === 'direct' ? toDirectStorageUrl : toProxiedStorageUrl
  const toFallback = secondary === 'direct' ? toDirectStorageUrl : toProxiedStorageUrl
  return {
    primary: toUrl(storagePath),
    fallback: toFallback(storagePath)
  }
}

/**
 * 把 Supabase 公开 Storage 的 path 映射到指定图片源 URL。
 * @param {string} storagePath
 * @param {SourceMode} [sourceId]
 */
export function buildImageSourceUrl(storagePath, sourceId = getImageSourceMode()) {
  const path = String(storagePath || '').trim().replace(/^\/+/, '')
  if (!path || path.includes('..')) return ''

  if (sourceId === 'direct') {
    return `${SUPABASE_URL}/storage/v1/object/public/${path}`
  }
  return `${MEDIA_PROXY_ORIGIN}/${path}`
}
