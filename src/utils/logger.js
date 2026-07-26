const DEBUG_LOGS_STORAGE_KEY = 'goods-app:debug-logs'
const DEBUG_SCOPES_STORAGE_KEY = 'goods-app:debug-scopes'
const LOG_BUFFER_STORAGE_KEY = 'goods-app:log-buffer-v1'

// 统一日志缓冲：createLogger 的 info/warn/error、appLog、以及被劫持的
// console.error/warn 都写入这里，供反馈时导出（collectDeviceLog）。
const MAX_BUFFER_ENTRIES = 400
const MAX_PERSISTED_ENTRIES = 150
const MAX_ENTRY_MESSAGE_LENGTH = 400
const MAX_ENTRY_STACK_LENGTH = 500
const PERSIST_THROTTLE_MS = 2000

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

// ── 统一日志缓冲 ──

const _logBuffer = []
let _previousSessionLogs = []
let _persistTimer = null
// 劫持前的原始 console 方法；logger 自己的输出走原始方法，避免被劫持后重复入缓冲
const _origConsole = {}

function stringifyForBuffer(value) {
  if (typeof value === 'string') return value
  if (value === undefined) return 'undefined'
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function pushLogEntry(level, scope, message, stack) {
  const entry = {
    time: new Date().toISOString(),
    level,
    scope,
    message: sanitizeString(String(message ?? '')).slice(0, MAX_ENTRY_MESSAGE_LENGTH)
  }
  if (stack) {
    entry.stack = sanitizeString(String(stack)).slice(0, MAX_ENTRY_STACK_LENGTH)
  }
  _logBuffer.push(entry)
  if (_logBuffer.length > MAX_BUFFER_ENTRIES) _logBuffer.shift()
  schedulePersist()
}

function bufferFromArgs(level, scope, event, args) {
  const sanitized = sanitizeArgs(args)
  const message = [event, ...sanitized.map(stringifyForBuffer)].join(' ')
  const errorArg = args.find((item) => item instanceof Error)
  pushLogEntry(level, scope, message, errorArg?.stack)
}

function schedulePersist() {
  if (_persistTimer) return
  const setTimer = globalThis.setTimeout
  if (typeof setTimer !== 'function') return
  _persistTimer = setTimer(() => {
    _persistTimer = null
    persistLogBuffer()
  }, PERSIST_THROTTLE_MS)
}

function persistLogBuffer() {
  try {
    globalThis.localStorage?.setItem(LOG_BUFFER_STORAGE_KEY, JSON.stringify({
      savedAt: new Date().toISOString(),
      entries: _logBuffer.slice(-MAX_PERSISTED_ENTRIES)
    }))
  } catch {
    // localStorage 不可用或配额不足时放弃落盘，不影响内存缓冲
  }
}

function loadPreviousSessionLogs() {
  try {
    const raw = globalThis.localStorage?.getItem(LOG_BUFFER_STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed?.entries)) {
      _previousSessionLogs = parsed.entries.slice(-MAX_PERSISTED_ENTRIES)
    }
  } catch {
    _previousSessionLogs = []
  }
}

/**
 * 记录一条应用操作日志（进入统一缓冲，随反馈日志上传）。
 * appLog('info', 'Sync completed', { pulled: 3 })
 */
export function appLog(level, message, data) {
  const normalizedLevel = ['debug', 'info', 'warn', 'error'].includes(level) ? level : 'info'
  const suffix = data === undefined ? '' : ` ${stringifyForBuffer(sanitizeValue(data))}`
  pushLogEntry(normalizedLevel, 'app', `${message}${suffix}`, data instanceof Error ? data.stack : undefined)
}

/** 当前会话的缓冲日志（时间升序）。 */
export function getBufferedLogs() {
  return [..._logBuffer]
}

/** 上一会话落盘的日志（用于闪退/重启后的 bug 分析）。 */
export function getPreviousSessionLogs() {
  return [..._previousSessionLogs]
}

/** 立即把缓冲写入 localStorage（页面隐藏/卸载时调用）。 */
export function flushLogBuffer() {
  if (_persistTimer) {
    globalThis.clearTimeout?.(_persistTimer)
    _persistTimer = null
  }
  persistLogBuffer()
}

/**
 * 初始化全局捕获：劫持 console.error/warn、监听 window error 与
 * unhandledrejection、页面隐藏时落盘。幂等，在模块加载时自动执行。
 */
export function initLogCapture() {
  const g = globalThis
  if (g.__goodsAppLogCaptureInstalled) {
    // HMR / 重复加载：console 已被旧模块实例劫持，取回原始引用避免重复入缓冲
    Object.assign(_origConsole, g.__goodsAppOrigConsole || {})
    return
  }
  g.__goodsAppLogCaptureInstalled = true

  loadPreviousSessionLogs()

  const consoleRef = g.console
  if (consoleRef) {
    for (const method of ['error', 'warn']) {
      const original = consoleRef[method]
      if (typeof original !== 'function') continue
      _origConsole[method] = original.bind(consoleRef)
      consoleRef[method] = (...args) => {
        _origConsole[method](...args)
        const message = args.map((a) => (a instanceof Error ? a.message : stringifyForBuffer(sanitizeValue(a)))).join(' ')
        const errorArg = args.find((a) => a instanceof Error)
        pushLogEntry(method === 'error' ? 'error' : 'warn', 'console', message, errorArg?.stack)
      }
    }
    g.__goodsAppOrigConsole = { ..._origConsole }
  }

  if (typeof g.addEventListener === 'function') {
    g.addEventListener('error', (e) => {
      pushLogEntry('error', 'window', e?.message || 'Unknown error', `${e?.filename || ''}:${e?.lineno || 0}:${e?.colno || 0}`)
    })

    g.addEventListener('unhandledrejection', (e) => {
      const reason = e?.reason
      pushLogEntry(
        'error',
        'promise',
        reason instanceof Error ? reason.message : stringifyForBuffer(sanitizeValue(reason)),
        reason instanceof Error ? reason.stack : undefined
      )
    })

    g.addEventListener('pagehide', flushLogBuffer)
  }

  if (typeof g.document?.addEventListener === 'function') {
    g.document.addEventListener('visibilitychange', () => {
      if (g.document.visibilityState === 'hidden') flushLogBuffer()
    })
  }
}

function writeConsole(method, scope, event, args) {
  const consoleRef = globalThis.console
  const target = _origConsole[method] || consoleRef?.[method] || consoleRef?.log
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

    // info 始终入缓冲（生产环境的操作轨迹），仅 console 输出受调试开关控制
    info(event, ...args) {
      bufferFromArgs('info', normalizedScope, event, args)
      if (!isDebugLoggingEnabled(normalizedScope)) return
      writeConsole('info', normalizedScope, event, args)
    },

    warn(event, ...args) {
      bufferFromArgs('warn', normalizedScope, event, args)
      writeConsole('warn', normalizedScope, event, args)
    },

    error(event, ...args) {
      bufferFromArgs('error', normalizedScope, event, args)
      writeConsole('error', normalizedScope, event, args)
    }
  }
}

initLogCapture()

export const loggerStorageKeys = {
  debugLogs: DEBUG_LOGS_STORAGE_KEY,
  debugScopes: DEBUG_SCOPES_STORAGE_KEY
}
