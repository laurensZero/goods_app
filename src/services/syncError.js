// Sync phase constants
export const PHASE_ENSURE_GIST = 'ensure_gist'
export const PHASE_READ_MANIFEST = 'read_manifest'
export const PHASE_READ_REMOTE = 'read_remote'
export const PHASE_DIFF = 'diff'
export const PHASE_PULL = 'pull'
export const PHASE_PUSH = 'push'
export const PHASE_UPLOAD_IMAGES = 'upload_images'
export const PHASE_WRITE_DATA = 'write_data'

// Sync cause constants
export const CAUSE_NETWORK = 'network'
export const CAUSE_RATE_LIMIT = 'rate_limit'
export const CAUSE_AUTH = 'auth'
export const CAUSE_SERVER = 'server'
export const CAUSE_DATA_FORMAT = 'data_format'
export const CAUSE_UNKNOWN = 'unknown'

// Phase display names (Chinese)
const PHASE_NAMES = {
  [PHASE_ENSURE_GIST]: '初始化同步空间',
  [PHASE_READ_MANIFEST]: '读取同步摘要',
  [PHASE_READ_REMOTE]: '读取云端数据',
  [PHASE_DIFF]: '对比数据差异',
  [PHASE_PULL]: '拉取云端数据',
  [PHASE_PUSH]: '上传本地数据',
  [PHASE_UPLOAD_IMAGES]: '上传图片',
  [PHASE_WRITE_DATA]: '写入数据文件'
}

// Cause display names and suggestions (Chinese)
const CAUSE_INFO = {
  [CAUSE_NETWORK]: { name: '网络异常', suggestion: '请检查网络连接后重试' },
  [CAUSE_RATE_LIMIT]: { name: '请求过于频繁', suggestion: '请求过于频繁，请稍后再试' },
  [CAUSE_AUTH]: { name: '认证失败', suggestion: '认证已过期，请重新登录' },
  [CAUSE_SERVER]: { name: '服务端异常', suggestion: '云端服务异常，请稍后再试' },
  [CAUSE_DATA_FORMAT]: { name: '数据格式错误', suggestion: '数据格式异常，请联系开发者' },
  [CAUSE_UNKNOWN]: { name: '未知错误', suggestion: '未知错误，请稍后再试' }
}

export class SyncError extends Error {
  constructor({ message, phase, cause, retryable, suggestion }) {
    super(message)
    this.name = 'SyncError'
    this.phase = phase
    this.cause = cause
    this.retryable = retryable
    this.suggestion = suggestion
  }
}

/**
 * Infer cause and retryable from an error object.
 */
function inferCause(error) {
  const msg = String(error?.message || '').toLowerCase()
  const status = error?.status || error?.statusCode || 0

  // 401/403 → auth
  if (status === 401 || status === 403 || msg.includes('401') || msg.includes('403') || msg.includes('token')) {
    return { cause: CAUSE_AUTH, retryable: false }
  }

  // 429 → rate limit
  if (status === 429 || msg.includes('429') || msg.includes('rate limit')) {
    return { cause: CAUSE_RATE_LIMIT, retryable: true }
  }

  // 5xx → server
  if ((status >= 500 && status < 600) || msg.includes('500') || msg.includes('502') || msg.includes('503')) {
    return { cause: CAUSE_SERVER, retryable: true }
  }

  // Network / timeout
  if (
    error?.name === 'AbortError' ||
    error?.name === 'TypeError' ||
    msg.includes('timeout') || msg.includes('超时') ||
    msg.includes('network') || msg.includes('网络') ||
    msg.includes('fetch') || msg.includes('连接') ||
    msg.includes('econnrefused') || msg.includes('econnreset') ||
    msg.includes('enotfound') || msg.includes('failed to fetch')
  ) {
    return { cause: CAUSE_NETWORK, retryable: true }
  }

  // JSON parse → data format
  if (msg.includes('json') || msg.includes('解析') || msg.includes('parse')) {
    return { cause: CAUSE_DATA_FORMAT, retryable: false }
  }

  return { cause: CAUSE_UNKNOWN, retryable: false }
}

/**
 * Wrap an error as a SyncError with phase context.
 * If already a SyncError, re-throws as-is.
 */
export function wrapSyncError(error, phase) {
  if (error instanceof SyncError) throw error

  const { cause, retryable } = inferCause(error)
  const phaseName = PHASE_NAMES[phase] || phase
  const causeInfo = CAUSE_INFO[cause] || CAUSE_INFO[CAUSE_UNKNOWN]

  throw new SyncError({
    message: `${phaseName}失败：${error?.message || '未知错误'}`,
    phase,
    cause,
    retryable,
    suggestion: causeInfo.suggestion
  })
}

/**
 * Build a human-readable status string from a SyncError.
 * Used for syncStatus in the store.
 */
export function buildSyncErrorStatus(syncError) {
  const phaseName = PHASE_NAMES[syncError.phase] || syncError.phase
  const causeInfo = CAUSE_INFO[syncError.cause] || CAUSE_INFO[CAUSE_UNKNOWN]
  return `${phaseName}${causeInfo.name}：${syncError.suggestion}`
}
