import { SUPABASE_URL } from '@/config/supabase'

export const AVAILABLE_UPDATE_LEVELS = Object.freeze(['force', 'prompt', 'silent'])

export const AVAILABLE_UPDATE_SOURCES = Object.freeze(['auto', 'github'])

export function normalizeUpdateLevel(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (AVAILABLE_UPDATE_LEVELS.includes(normalized)) return normalized
  return 'prompt'
}

export function resolveSourceCandidates(source) {
  if (source === 'auto') return ['github']
  return [source]
}

// 从 release body 文本解析 apk_sha256 元数据行，返回小写 64 位十六进制或空串
export function parseApkSha256FromText(text) {
  const match = String(text || '').match(/apk[_-]?sha256\s*[:=]\s*(?:sha256:)?([a-fA-F0-9]{64})\b/i)
  return match?.[1]?.toLowerCase() || ''
}

/** OTA 包 Supabase 公开 Storage 直连地址 */
export function toDirectStorageUrl(storagePath) {
  const path = String(storagePath || '').trim().replace(/^\/+/, '')
  if (!path || path.includes('..')) return ''
  return `${SUPABASE_URL}/storage/v1/object/public/ota-releases/${path}`
}
