import {
  DEFAULT_SUPABASE_URL,
  DEFAULT_SUPABASE_KEY,
  SUPABASE_CONFIG_STORAGE_KEY,
  GITHUB_TOKEN_STORAGE_KEY
} from '../config/sections'

// ── GitHub ──

export function getGithubToken() {
  try {
    return localStorage.getItem(GITHUB_TOKEN_STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

export function setGithubToken(token) {
  localStorage.setItem(GITHUB_TOKEN_STORAGE_KEY, String(token || '').trim())
}

export function clearGithubToken() {
  localStorage.removeItem(GITHUB_TOKEN_STORAGE_KEY)
}

// ── Supabase 配置 ──

export function getSupabaseConfig() {
  try {
    const saved = localStorage.getItem(SUPABASE_CONFIG_STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      return {
        url: parsed.url || DEFAULT_SUPABASE_URL,
        key: parsed.key || DEFAULT_SUPABASE_KEY,
        serviceKey: parsed.serviceKey || ''
      }
    }
  } catch {
    /* ignore */
  }
  return { url: DEFAULT_SUPABASE_URL, key: DEFAULT_SUPABASE_KEY, serviceKey: '' }
}

export function saveSupabaseConfigToStorage({ url, key, serviceKey }) {
  const config = {
    url: String(url || '').trim() || DEFAULT_SUPABASE_URL,
    key: String(key || '').trim() || DEFAULT_SUPABASE_KEY,
    serviceKey: String(serviceKey || '').trim()
  }
  localStorage.setItem(SUPABASE_CONFIG_STORAGE_KEY, JSON.stringify(config))
  return config
}

export function clearSupabaseConfig() {
  localStorage.removeItem(SUPABASE_CONFIG_STORAGE_KEY)
}

export async function testSupabaseConnection(config = getSupabaseConfig()) {
  const testKey = config.serviceKey || config.key
  const res = await fetch(`${config.url}/rest/v1/feedbacks?select=id&limit=1`, {
    headers: { apikey: testKey, Authorization: `Bearer ${testKey}` }
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`连接失败（${res.status}）${detail ? '：' + detail : ''}`)
  }
  return config.serviceKey ? 'Service Role Key（绕过 RLS）' : 'Anon Key（受 RLS 限制）'
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