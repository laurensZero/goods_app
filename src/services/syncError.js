import i18n from '@/locales'

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

// Phase i18n key mapping
const PHASE_KEY_MAP = {
  [PHASE_ENSURE_GIST]: 'sync.phase.ensureGist',
  [PHASE_READ_MANIFEST]: 'sync.phase.readManifest',
  [PHASE_READ_REMOTE]: 'sync.phase.readRemote',
  [PHASE_DIFF]: 'sync.phase.diff',
  [PHASE_PULL]: 'sync.phase.pull',
  [PHASE_PUSH]: 'sync.phase.push',
  [PHASE_UPLOAD_IMAGES]: 'sync.phase.uploadImages',
  [PHASE_WRITE_DATA]: 'sync.phase.writeData'
}

// Cause i18n key mapping
const CAUSE_KEY_MAP = {
  [CAUSE_NETWORK]: { nameKey: 'sync.cause.network', suggestionKey: 'sync.cause.networkSuggestion' },
  [CAUSE_RATE_LIMIT]: { nameKey: 'sync.cause.rateLimit', suggestionKey: 'sync.cause.rateLimitSuggestion' },
  [CAUSE_AUTH]: { nameKey: 'sync.cause.auth', suggestionKey: 'sync.cause.authSuggestion' },
  [CAUSE_SERVER]: { nameKey: 'sync.cause.server', suggestionKey: 'sync.cause.serverSuggestion' },
  [CAUSE_DATA_FORMAT]: { nameKey: 'sync.cause.dataFormat', suggestionKey: 'sync.cause.dataFormatSuggestion' },
  [CAUSE_UNKNOWN]: { nameKey: 'sync.cause.unknown', suggestionKey: 'sync.cause.unknownSuggestion' }
}

function getPhaseName(phase) {
  const key = PHASE_KEY_MAP[phase]
  return key ? i18n.global.t(key) : phase
}

function getCauseInfo(cause) {
  const mapping = CAUSE_KEY_MAP[cause] || CAUSE_KEY_MAP[CAUSE_UNKNOWN]
  return {
    name: i18n.global.t(mapping.nameKey),
    suggestion: i18n.global.t(mapping.suggestionKey)
  }
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
    msg.includes('enotfound') || msg.includes('unable to resolve') ||
    msg.includes('resolve host') || msg.includes('failed to fetch')
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
  const phaseName = getPhaseName(phase)
  const causeInfo = getCauseInfo(cause)

  throw new SyncError({
    message: i18n.global.t('sync.phaseFailed', { phase: phaseName, error: error?.message || i18n.global.t('sync.cause.unknown') }),
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
  const phaseName = getPhaseName(syncError.phase)
  const causeInfo = getCauseInfo(syncError.cause)
  return i18n.global.t('sync.causeStatus', { phase: phaseName, cause: causeInfo.name, suggestion: syncError.suggestion })
}
