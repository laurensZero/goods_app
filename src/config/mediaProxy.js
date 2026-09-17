import { SUPABASE_URL } from '@/config/supabase'

// 与图片使用同一个 Cloudflare Worker，代理公开 Storage 资源并做边缘缓存。
export const MEDIA_PROXY_ORIGIN = 'https://img.goodsapp.de5.net'

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
