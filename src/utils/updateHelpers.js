export const AVAILABLE_UPDATE_LEVELS = Object.freeze(['force', 'prompt', 'silent'])

export const AVAILABLE_UPDATE_SOURCES = Object.freeze(['auto', 'gitee', 'github'])

export function normalizeUpdateLevel(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (AVAILABLE_UPDATE_LEVELS.includes(normalized)) return normalized
  return 'prompt'
}

export function resolveSourceCandidates(source) {
  if (source === 'auto') return ['gitee', 'github']
  return [source]
}
