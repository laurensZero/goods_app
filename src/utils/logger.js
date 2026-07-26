const DEBUG_LOGS_STORAGE_KEY = 'goods-app:debug-logs'
const DEBUG_SCOPES_STORAGE_KEY = 'goods-app:debug-scopes'

const DEBUG_TRUE_VALUES = new Set(['1', 'true', 'yes', 'on', '*'])
const SENSITIVE_KEY_PATTERN = /(token|cookie|password|secret|authorization|anon[-_]?key|api[-_]?key|apikey|access[-_]?token|refresh[-_]?token|encryption[-_]?key|private[-_]?key)/i
const SENSITIVE_STRING_PATTERNS = [
  /(authorization\s*[:=]\s*bearer\s+)[^\s,;]+/gi,
  /(token\s*[:=]\s*)[^\s,;]+/gi,
  /(access_token\s*[:=]\s*)[^\s,;]+/gi,
  /(refresh_token\s*[:=]\s*)[^\s,;]+/gi,
  /(cookie\s*[:=]\s*)[^\n\r]+/gi,
  /(api[-_]?key\s*[:=]\s*)[^\s,;]+/gi,
  /(anon[-_]?key\s*[:=]\s*)[^\s,;]+/gi
]
const MAX_DEPTH = 6
const MAX_ARRAY_ITEMS = 50
const MAX_OBJECT_KEYS = 80
const MAX_STRING_LENGTH = 1000

function isObjectLike(value) {
  return value !== null && typeof value === 'object'
}

function readLocalStorage(key) {
  try {
    return globalThis.localStorage?.getItem(key) || ''
  } catch {
    return ''
  }
}

function parseScopeFilter(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function isDebugLoggingEnabled(scope = '') {
  const isDev = Boolean(import.meta.env?.DEV)
  const flag = readLocalStorage(DEBUG_LOGS_STORAGE_KEY).trim().toLowerCase()
  const hasRuntimeDebug = DEBUG_TRUE_VALUES.has(flag)

  if (!isDev && !hasRuntimeDebug) return false

  const scopes = parseScopeFilter(readLocalStorage(DEBUG_SCOPES_STORAGE_KEY))
  if (scopes.length === 0) return true
  if (scopes.includes('*')) return true

  const normalizedScope = String(scope || '').trim()
  return scopes.some((item) => (
    item === normalizedScope
    || normalizedScope.startsWith(`${item}:`)
    || normalizedScope.startsWith(`${item}.`)
    || normalizedScope.startsWith(`${item}-`)
  ))
}

function sanitizeError(error) {
  return {
    name: error.name,
    message: sanitizeString(error.message),
    stack: sanitizeString(error.stack)
  }
}

function sanitizeString(value) {
  let result = String(value)
  for (const pattern of SENSITIVE_STRING_PATTERNS) {
    result = result.replace(pattern, '$1[redacted]')
  }
  if (result.length > MAX_STRING_LENGTH) {
    return `${result.slice(0, MAX_STRING_LENGTH)}...[truncated ${result.length - MAX_STRING_LENGTH} chars]`
  }
  return result
}

// 供外部模块复用的敏感文本脱敏（Cookie/token/password 等）
export function redactSensitiveText(value) {
  return sanitizeString(String(value ?? ''))
}

function sanitizeValue(value, seen = new WeakSet(), depth = 0) {
  if (typeof value === 'string') return sanitizeString(value)
  if (!isObjectLike(value)) return value
  if (value instanceof Error) return sanitizeError(value)
  if (value instanceof Date) return value.toISOString()
  if (depth >= MAX_DEPTH) return '[MaxDepth]'

  if (seen.has(value)) return '[Circular]'
  seen.add(value)

  if (Array.isArray(value)) {
    const result = value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeValue(item, seen, depth + 1))
    if (value.length > MAX_ARRAY_ITEMS) {
      result.push(`[${value.length - MAX_ARRAY_ITEMS} more items]`)
    }
    return result
  }

  if (ArrayBuffer.isView(value)) {
    return `[${value.constructor?.name || 'TypedArray'} length=${value.length}]`
  }

  if (value instanceof ArrayBuffer) {
    return `[ArrayBuffer byteLength=${value.byteLength}]`
  }

  if (typeof File !== 'undefined' && value instanceof File) {
    return { name: value.name, size: value.size, type: value.type }
  }

  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    return { size: value.size, type: value.type }
  }

  const entries = Object.entries(value)
  const result = {}

  for (const [key, entryValue] of entries.slice(0, MAX_OBJECT_KEYS)) {
    result[key] = SENSITIVE_KEY_PATTERN.test(key)
      ? '[redacted]'
      : sanitizeValue(entryValue, seen, depth + 1)
  }

  if (entries.length > MAX_OBJECT_KEYS) {
    result.__truncatedKeys = entries.length - MAX_OBJECT_KEYS
  }

  return result
}

function sanitizeArgs(args) {
  return args.map((item) => sanitizeValue(item))
}

function writeConsole(method, scope, event, args) {
  const consoleRef = globalThis.console
  const target = consoleRef?.[method] || consoleRef?.log
  if (typeof target !== 'function') return

  const prefix = `[${scope}] ${event}`
  target.call(consoleRef, prefix, ...sanitizeArgs(args))
}

export function createLogger(scope) {
  const normalizedScope = String(scope || 'app').trim() || 'app'

  return {
    debug(event, ...args) {
      if (!isDebugLoggingEnabled(normalizedScope)) return
      writeConsole('debug', normalizedScope, event, args)
    },

    info(event, ...args) {
      if (!isDebugLoggingEnabled(normalizedScope)) return
      writeConsole('info', normalizedScope, event, args)
    },

    warn(event, ...args) {
      writeConsole('warn', normalizedScope, event, args)
    },

    error(event, ...args) {
      writeConsole('error', normalizedScope, event, args)
    }
  }
}

export const loggerStorageKeys = {
  debugLogs: DEBUG_LOGS_STORAGE_KEY,
  debugScopes: DEBUG_SCOPES_STORAGE_KEY
}
