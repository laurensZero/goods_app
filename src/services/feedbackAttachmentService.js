// src/services/feedbackAttachmentService.js
// Upload feedback attachments to Supabase Storage

import { getSupabaseClient } from '@/utils/sync/supabaseClient'
import { getBufferedLogs, getPreviousSessionLogs } from '@/utils/logger'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import { isFeatureBlocked, FEATURE_KEYS, MaintenanceModeError } from '@/services/maintenanceModeService'

// appLog 与错误捕获已迁移到 utils/logger（统一缓冲 + localStorage 落盘），保留兼容导出
export { appLog } from '@/utils/logger'

const BUCKET = 'feedback-attachments'

function db() {
  return getSupabaseClient()
}

/**
 * Upload a file and return attachment metadata.
 * Bucket must be pre-created in Supabase Dashboard.
 */
export async function uploadAttachment(file, feedbackId) {
  // 检查维护模式（从 sync store 缓存读取，零额外网络请求）
  try {
    const { useSyncStore } = await import('@/stores/sync')
    const syncStore = useSyncStore()
    if (isFeatureBlocked(syncStore.maintenanceMode, FEATURE_KEYS.FEEDBACK_ATTACHMENT)) {
      const msg = syncStore.maintenanceMode?.message || '反馈附件上传功能正在维护中，请稍后再试'
      throw new MaintenanceModeError('feedback_attachment', msg)
    }
  } catch (e) {
    if (e instanceof MaintenanceModeError) throw e
    // 导入失败时允许上传（不阻塞）
  }

  const ext = file.name.split('.').pop() || 'bin'
  const path = `fb-${feedbackId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

const { error } = await db().storage
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
 * Remove uploaded attachment files by path (best-effort compensation cleanup).
 */
export async function removeAttachments(paths) {
  const list = (paths || []).filter(Boolean)
  if (list.length === 0) return
  try {
    // remove() 对 RLS 拒绝的对象不报错——返回 200 + 已删列表，被拒对象直接跳过，
    // 必须显式核对 error 与已删数量，否则缺 DELETE policy 时清理是不可观测的 no-op
    const { data, error } = await db().storage.from(BUCKET).remove(list)
    if (error) {
      console.warn('[feedback] attachment cleanup failed:', error.message)
    } else if ((data?.length || 0) < list.length) {
      const removed = new Set((data || []).map(o => o.name))
      const skipped = list.filter(p => !removed.has(p))
      console.warn(`[feedback] attachment cleanup incomplete: ${removed.size}/${list.length} removed, skipped (missing DELETE policy on "${BUCKET}"?):`, skipped.join(', '))
    }
  } catch (e) {
    console.warn('[feedback] attachment cleanup failed:', e.message)
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
      // 中途失败时清理本批已上传的文件，避免留下孤儿附件
      await removeAttachments(results.map(r => r.path))
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
    lines.push(`Vite App Version: ${import.meta.env.VITE_APP_VERSION || 'unknown'}`)
  } catch { lines.push('Vite App Version: unknown') }
  try {
    lines.push(`Android Version (build): ${import.meta.env.VITE_ANDROID_VERSION_NAME || 'N/A'}`)
  } catch {}
  // 运行时原生版本号
  if (Capacitor.isNativePlatform()) {
    try {
      const info = await CapacitorApp.getInfo()
      lines.push(`Native App Version: ${info?.version || '?'} (build ${info?.build || '?'})`)
    } catch { lines.push('Native App Version: unavailable') }
  }
  // OTA bundle 版本
  try {
    const updater = await CapacitorUpdater.current()
    lines.push(`Bundle Version: ${updater?.bundle?.version || 'none'}`)
    if (updater?.bundle?.id) lines.push(`Bundle ID: ${updater.bundle.id}`)
  } catch { lines.push('Bundle Version: N/A') }
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

  // ── 错误速览（当前会话的 error 级日志） ──
  lines.push('')
  lines.push('=== Recent Errors ===')
  const currentLogs = getBufferedLogs()
  const errors = currentLogs.filter((entry) => entry.level === 'error')
  if (errors.length === 0) {
    lines.push('(none)')
  } else {
    errors.forEach((entry, i) => {
      lines.push(`[${i + 1}] ${entry.time} [${entry.scope}]`)
      lines.push(`    ${entry.message}`)
      if (entry.stack) lines.push(`    ${entry.stack}`)
    })
  }

  // ── 当前会话完整日志（操作轨迹 + 警告 + 错误） ──
  lines.push('')
  lines.push('=== App Logs (current session) ===')
  if (currentLogs.length === 0) {
    lines.push('(none)')
  } else {
    currentLogs.forEach((entry, i) => {
      lines.push(`[${i + 1}] ${entry.time} [${entry.level}] [${entry.scope}] ${entry.message}`)
      if (entry.stack) lines.push(`    ${entry.stack}`)
    })
  }

  // ── 上一会话日志（闪退/重启前的最后痕迹） ──
  const previousLogs = getPreviousSessionLogs()
  if (previousLogs.length > 0) {
    lines.push('')
    lines.push('=== App Logs (previous session) ===')
    previousLogs.forEach((entry, i) => {
      lines.push(`[${i + 1}] ${entry.time} [${entry.level}] [${entry.scope}] ${entry.message}`)
      if (entry.stack) lines.push(`    ${entry.stack}`)
    })
  }

  const content = lines.join('\n')
  // Prepend UTF-8 BOM so tools that rely on BOM-sniffing (e.g. older Windows
  // Notepad on Chinese Windows defaulting to GBK) correctly detect the encoding.
  const bytes = new TextEncoder().encode('﻿' + content)
  return new File([bytes], 'device-log.txt', { type: 'text/plain;charset=utf-8' })
}
