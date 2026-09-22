import { getFileDownloadBaseUrls } from '@/utils/sync/supabaseClient'

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

/** OTA 包 Storage 地址候选（按数据面主备顺序；图片公链不用这个） */
export function toDirectStorageUrls(storagePath) {
  const path = String(storagePath || '').trim().replace(/^\/+/, '')
  if (!path || path.includes('..')) return []
  return getFileDownloadBaseUrls()
    .map((base) => `${String(base).replace(/\/+$/, '')}/storage/v1/object/public/ota-releases/${path}`)
    .filter(Boolean)
}

/** 首选直链（单 URL 场景，如浏览器下载入口） */
export function toDirectStorageUrl(storagePath) {
  return toDirectStorageUrls(storagePath)[0] || ''
}

/**
 * 读取最新安卓 APK 下载直链（Supabase ota_releases，type=apk）。
 * 供 Web 端安卓 UA 引流等场景使用；失败返回空串。
 */
export async function fetchLatestApkDownloadUrl() {
  try {
    const { getSupabaseClient } = await import('@/utils/sync/supabaseClient')
    const client = getSupabaseClient()
    const { data, error } = await client
      .from('ota_releases')
      .select('*')
      .eq('type', 'apk')
      .order('published_at', { ascending: false })
      .limit(1)
    if (error) throw error
    const storagePath = String(data?.[0]?.storage_path || '').trim()
    return toDirectStorageUrl(storagePath)
  } catch {
    return ''
  }
}
