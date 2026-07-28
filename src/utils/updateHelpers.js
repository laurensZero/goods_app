export const AVAILABLE_UPDATE_LEVELS = Object.freeze(['force', 'prompt', 'silent'])

export const AVAILABLE_UPDATE_SOURCES = Object.freeze(['auto', 'gitee', 'github'])

export const AVAILABLE_WEB_UPDATE_SOURCES = Object.freeze(['auto', 'jsdelivr', 'github', 'gitee'])

export function normalizeUpdateLevel(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (AVAILABLE_UPDATE_LEVELS.includes(normalized)) return normalized
  return 'prompt'
}

export function resolveSourceCandidates(source) {
  if (source === 'auto') return ['gitee', 'github']
  return [source]
}

export function resolveWebSourceCandidates(source) {
  if (source === 'auto') return ['jsdelivr', 'gitee', 'github']
  return [source]
}

// 从 release body 文本解析 apk_sha256 元数据行，返回小写 64 位十六进制或空串
export function parseApkSha256FromText(text) {
  const match = String(text || '').match(/apk[_-]?sha256\s*[:=]\s*(?:sha256:)?([a-fA-F0-9]{64})\b/i)
  return match?.[1]?.toLowerCase() || ''
}
