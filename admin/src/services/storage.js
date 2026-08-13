import { DEFAULT_SUPABASE_URL } from '../config/sections'
import { getSupabaseConfig } from './supabase'

/**
 * 图片存储管理服务：与 storage-admin Edge Function 交互。
 * 鉴权：每次请求携带 Authorization: Bearer <serviceKey>（登录会话下发的 service key）。
 */

async function callStorageAdmin(action, { method = 'GET', body } = {}) {
  const { serviceKey } = getSupabaseConfig()
  if (!serviceKey) throw new Error('缺少管理凭据，请重新登录。')

  const url = new URL(`/functions/v1/storage-admin/${action}`, DEFAULT_SUPABASE_URL)
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

/** 存储占用与对象数（分桶）。 */
export function listStorage() {
  return callStorageAdmin('list')
}

/** 计算孤儿图（dry-run，不删除）。 */
export function findOrphans() {
  return callStorageAdmin('orphans', { method: 'POST' })
}

/** 回收孤儿图（物理删除）。 */
export function runGc() {
  return callStorageAdmin('gc', { method: 'POST' })
}
