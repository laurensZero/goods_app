import { DEFAULT_SUPABASE_URL } from '../config/sections'
import { getSupabaseConfig } from './supabase'

/**
 * 备份管理服务：与 backup-api Edge Function 交互。
 * 链路：管理台 → Edge Function(backup-api) → VPS webhook。
 * 鉴权：每次请求携带 Authorization: Bearer <serviceKey>（登录会话下发的 service key）。
 */

async function callBackupApi(action, options = {}) {
  const { serviceKey } = getSupabaseConfig()
  if (!serviceKey) throw new Error('缺少管理凭据，请重新登录。')

  const { method = 'GET', body, params } = options
  const url = new URL(`/functions/v1/backup-api/${action}`, DEFAULT_SUPABASE_URL)
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v)
  })

  const res = await fetch(url.href, {
    method,
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : null
  })

  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }

  if (!res.ok) {
    const message = data?.message || (typeof data === 'string' ? data : '')
    throw new Error(message || `请求失败（${res.status}）`)
  }
  return data
}

export function backupHealth() {
  return callBackupApi('health')
}

export function triggerBackup(kind = 'all') {
  return callBackupApi('trigger', { method: 'POST', body: { kind } })
}

export function imageExport() {
  return callBackupApi('image-export', { method: 'POST', body: {} })
}

export function restoreBackup(archive, includeImages = false, password = '') {
  return callBackupApi('restore', {
    method: 'POST',
    body: { archive, includeImages, password }
  })
}

export function listArchives() {
  return callBackupApi('files')
}

export function deleteBackup(archive) {
  return callBackupApi('delete', { method: 'POST', body: { archive } })
}

export async function getDownloadUrl(archive) {
  const data = await callBackupApi('download', { params: { archive } })
  return data?.url || ''
}

export function listLogs(limit = 50) {
  return callBackupApi('logs', { params: { limit } })
}
