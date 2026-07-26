// src/services/feedbackAttachmentService.js
// Upload feedback attachments to Supabase Storage

import { getSupabaseClient } from '@/utils/sync/supabaseClient'
import { redactSensitiveText } from '@/utils/logger'

const BUCKET = 'feedback-attachments'

function db() {
  return getSupabaseClient()
}

/**
 * Upload a file and return attachment metadata.
 * Bucket must be pre-created in Supabase Dashboard.
 */
export async function uploadAttachment(file, feedbackId) {
  const ext = file.name.split('.').pop() || 'bin'
  const path = `fb-${feedbackId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

  const { data, error } = await db().storage
    .from(BUCKET)
    .upload(path, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false
    })

  if (error) {
    const msg = String(error.message || '')
    if (msg.includes('not found') || msg.includes('does not exist')) {
      throw new Error('Storage bucket "feedback-attachments" not found. Please create it in Supabase Dashboard → Storage.')
    }
    if (msg.includes('row-level security') || msg.includes('permission denied')) {
      throw new Error('Storage permission denied. Add an INSERT policy on the "feedback-attachments" bucket in Supabase Dashboard → Storage → Policies.')
    }
    throw new Error(msg)
  }

  // Try to get public URL first, fall back to signed URL
  const { data: pubData } = db().storage
    .from(BUCKET)
    .getPublicUrl(path)

  if (pubData?.publicUrl) {
    return {
      name: file.name,
      path,
      type: file.type || 'application/octet-stream',
      size: file.size,
      url: pubData.publicUrl
    }
  }

  // Fallback: signed URL (1 hour)
  const { data: urlData, error: urlError } = await db().storage
    .from(BUCKET)
    .createSignedUrl(path, 3600)

  if (urlError) throw new Error(urlError.message)

  return {
    name: file.name,
    path,
    type: file.type || 'application/octet-stream',
    size: file.size,
    url: urlData.signedUrl
  }
}

/**
 * Upload multiple files. Returns successful uploads only.
 */
export async function uploadAttachments(files, feedbackId) {
  const results = []
  for (const file of files) {
    try {
      const meta = await uploadAttachment(file, feedbackId)
      results.push(meta)
    } catch (e) {
      console.error('[feedback] upload failed:', file.name, e.message)
      // Re-throw so caller knows — don't silently swallow
      throw new Error(`Upload failed for "${file.name}": ${e.message}`)
    }
  }
  return results
}

/**
 * Generate a device log snapshot as a text file.
 */
export async function collectDeviceLog() {
  const lines = []
  const now = new Date()

  // ── 基础信息 ──
  lines.push('=== Device Info ===')
  lines.push(`Time: ${now.toISOString()}`)
  lines.push(`Platform: ${navigator.platform}`)
  lines.push(`User Agent: ${navigator.userAgent}`)
  lines.push(`Language: ${navigator.language}`)
  lines.push(`Screen: ${screen.width}x${screen.height} (DPR: ${window.devicePixelRatio || 1})`)
  lines.push(`Viewport: ${window.innerWidth}x${window.innerHeight}`)

  // ── 应用版本 ──
  lines.push('')
  lines.push('=== App Info ===')
  try {
    lines.push(`App Version: ${import.meta.env.VITE_APP_VERSION || 'unknown'}`)
  } catch { lines.push('App Version: unknown') }
  try {
    lines.push(`Android Version: ${import.meta.env.VITE_ANDROID_VERSION_NAME || 'N/A'}`)
  } catch {}
  try {
    const perf = performance.getEntriesByType('navigation')[0]
    if (perf) {
      lines.push(`Page Load: ${Math.round(perf.loadEventEnd - perf.startTime)}ms`)
      lines.push(`DOM Ready: ${Math.round(perf.domContentLoadedEventEnd - perf.startTime)}ms`)
    }
  } catch {}

  // ── 网络状态 ──
  lines.push('')
  lines.push('=== Network ===')
  try {
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection
    if (conn) {
      lines.push(`Type: ${conn.effectiveType || 'unknown'}`)
      lines.push(`Downlink: ${conn.downlink || '?'} Mbps`)
      lines.push(`RTT: ${conn.rtt || '?'} ms`)
      lines.push(`Save Data: ${conn.saveData}`)
    } else {
      lines.push(`Online: ${navigator.onLine}`)
    }
  } catch { lines.push(`Online: ${navigator.onLine}`) }

  // ── 存储使用 ──
  lines.push('')
  lines.push('=== Storage ===')
  try {
    let totalSize = 0
    let itemCount = 0
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      const val = localStorage.getItem(key) || ''
      totalSize += key.length + val.length
      itemCount++
    }
    lines.push(`localStorage: ${itemCount} items, ~${(totalSize / 1024).toFixed(1)} KB`)
  } catch { lines.push('localStorage: unavailable') }

  try {
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate()
      lines.push(`Storage API: ${(est.usage / 1024 / 1024).toFixed(2)} MB used / ${(est.quota / 1024 / 1024).toFixed(0)} MB quota`)
    }
  } catch {}

  // ── 内存信息 ──
  try {
    if (performance.memory) {
      lines.push('')
      lines.push('=== Memory ===')
      lines.push(`Used: ${(performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(1)} MB`)
      lines.push(`Total: ${(performance.memory.totalJSHeapSize / 1024 / 1024).toFixed(1)} MB`)
      lines.push(`Limit: ${(performance.memory.jsHeapSizeLimit / 1024 / 1024).toFixed(0)} MB`)
    }
  } catch {}

  // ── Supabase 连接状态 ──
  lines.push('')
  lines.push('=== Supabase ===')
  try {
    const { getSupabaseClient } = await import('@/utils/sync/supabaseClient')
    const client = getSupabaseClient()
    lines.push(`URL: ${client?.supabaseUrl || 'N/A'}`)
    const { error } = await client.from('feedbacks').select('id').limit(1)
    lines.push(`Connection: ${error ? 'FAILED (' + error.message + ')' : 'OK'}`)
  } catch (e) {
    lines.push(`Connection: ERROR (${e.message})`)
  }

  // ── 路由信息 ──
  lines.push('')
  lines.push('=== Route ===')
  try {
    lines.push(`Path: ${window.location.hash || window.location.pathname}`)
    lines.push(`Full: ${window.location.href}`)
  } catch {}

  // ── Console Errors ──
  lines.push('')
  lines.push('=== Console Errors ===')
  const errors = getConsoleErrors()
  if (errors.length === 0) {
    lines.push('(none)')
  } else {
    errors.forEach((e, i) => {
      lines.push(`[${i + 1}] ${e.time}`)
      lines.push(`    ${e.message}`)
      if (e.stack) lines.push(`    ${e.stack}`)
    })
  }

  // ── 前端日志（可选：最近操作） ──
  const appLogs = getAppLogs()
  if (appLogs.length > 0) {
    lines.push('')
    lines.push('=== App Logs ===')
    appLogs.forEach((log, i) => {
      lines.push(`[${i + 1}] ${log.time} [${log.level}] ${log.message}`)
    })
  }

  return new File([lines.join('\n')], 'device-log.txt', { type: 'text/plain' })
}

// In-memory console error buffer
const _consoleErrors = []
const MAX_ERRORS = 50

// App-level log buffer (for structured app logs)
const _appLogs = []
const MAX_APP_LOGS = 100

/**
 * Log an app-level event for inclusion in device logs.
 * Usage: import { appLog } from '@/services/feedbackAttachmentService'
 *        appLog('info', 'Sync completed')
 *        appLog('error', 'Upload failed', { detail: '...' })
 */
export function appLog(level, message, data) {
  _appLogs.push({
    time: new Date().toISOString(),
    level,
    // 脱敏后再入缓冲区，防止 Cookie/token 随反馈日志上传
    message: redactSensitiveText(data ? `${message} ${JSON.stringify(data)}` : message)
  })
  if (_appLogs.length > MAX_APP_LOGS) _appLogs.shift()
}

function getAppLogs() {
  return [..._appLogs]
}

function initErrorCollector() {
  if (_consoleErrors._initialized) return
  _consoleErrors._initialized = true

  const origError = console.error
  console.error = (...args) => {
    origError.apply(console, args)
    const msg = args.map(a => (a instanceof Error ? a.message : String(a))).join(' ')
    const stack = args.find(a => a instanceof Error)?.stack || ''
    _consoleErrors.push({
      time: new Date().toISOString(),
      // 脱敏后再入缓冲区，防止 Cookie/token 随反馈日志上传
      message: redactSensitiveText(msg).slice(0, 500),
      stack: redactSensitiveText(stack).slice(0, 500)
    })
    if (_consoleErrors.length > MAX_ERRORS) _consoleErrors.shift()
  }

  window.addEventListener('error', (e) => {
    _consoleErrors.push({
      time: new Date().toISOString(),
      message: redactSensitiveText(e.message || 'Unknown error'),
      stack: `${e.filename}:${e.lineno}:${e.colno}`
    })
    if (_consoleErrors.length > MAX_ERRORS) _consoleErrors.shift()
  })

  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason
    _consoleErrors.push({
      time: new Date().toISOString(),
      message: redactSensitiveText(reason instanceof Error ? reason.message : String(reason)),
      stack: reason instanceof Error ? redactSensitiveText(reason.stack || '').slice(0, 500) : ''
    })
    if (_consoleErrors.length > MAX_ERRORS) _consoleErrors.shift()
  })
}

function getConsoleErrors() {
  return [..._consoleErrors]
}

initErrorCollector()
