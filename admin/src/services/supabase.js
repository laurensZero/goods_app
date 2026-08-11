import { DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_KEY } from '../config/sections'
import { getSession } from './auth'

// ── GitHub ──

export function getGithubToken() {
  return getSession()?.tokens?.github || ''
}

// ── Supabase 配置 ──

export function getSupabaseConfig() {
  const tokens = getSession()?.tokens
  return {
    url: tokens?.supabaseUrl || DEFAULT_SUPABASE_URL,
    key: tokens?.supabaseKey || DEFAULT_SUPABASE_KEY,
    serviceKey: tokens?.serviceKey || ''
  }
}

// ── Supabase REST 封装（与原 ota-bundle-manager 的 supabaseRequest 一致）──

export async function supabaseRequest(
  path,
  { method = 'GET', body = null, params = {}, useServiceKey = true, returnCount = false } = {}
) {
  const config = getSupabaseConfig()
  const authKey = (useServiceKey && config.serviceKey) ? config.serviceKey : config.key
  const url = new URL(path, config.url)
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v)
  })
  const headers = {
    apikey: authKey,
    Authorization: `Bearer ${authKey}`,
    Prefer: returnCount ? 'count=exact' : 'return=representation'
  }
  if (body !== null) headers['Content-Type'] = 'application/json'
  const res = await fetch(url.href, { method, headers, body: body ? JSON.stringify(body) : null })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Supabase 请求失败（${res.status}）${detail ? '：' + detail.substring(0, 300) : ''}`)
  }
  if (returnCount) {
    const contentRange = res.headers.get('Content-Range') || ''
    const match = contentRange.match(/\/(\d+)$/)
    return match ? Number(match[1]) : 0
  }
  const text = await res.text()
  if (!text) return null
  return JSON.parse(text)
}

export function buildStorageUrl(storagePath) {
  const config = getSupabaseConfig()
  if (!config.url || !storagePath) return ''
  return `${config.url}/storage/v1/object/public/ota-releases/${storagePath}`
}
