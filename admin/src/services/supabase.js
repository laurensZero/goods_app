import { DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_KEY } from '../config/sections'
import { getSession } from './auth'

// ── GitHub ──

export function getGithubToken() {
  return getSession()?.tokens?.github || ''
}

// ── Supabase 配置 ──

export function getSupabaseConfig() {
  const tokens = getSession()?.tokens
  // 旧版本登录会话缓存的是 legacy anon JWT（2027 年初退役），忽略之退回新默认 key，
  // 避免旧缓存覆盖新 key（serviceKey 的 legacy JWT 仍在服役，不受此判断影响）
  const cachedKey = typeof tokens?.supabaseKey === 'string' && !tokens.supabaseKey.startsWith('eyJ')
    ? tokens.supabaseKey
    : ''
  return {
    url: tokens?.supabaseUrl || DEFAULT_SUPABASE_URL,
    key: cachedKey || DEFAULT_SUPABASE_KEY,
    serviceKey: tokens?.serviceKey || ''
  }
}

// ── Supabase REST 封装（与原 ota-bundle-manager 的 supabaseRequest 一致）──
//
// privileged（serviceKey）调用统一经 admin-api Edge Function 代理转发：
// legacy service_role JWT 2027 年初退役，而新版 sb_secret_ key 会被 Supabase
// 数据面网关对浏览器请求一律 401，因此浏览器只把共享口令发给代理，
// 由代理在服务端用平台注入的 service role 转发（见 supabase/functions/admin-api）。
const ADMIN_API_PROXY_PREFIX = '/functions/v1/admin-api'

export async function supabaseRequest(
  path,
  { method = 'GET', body = null, params = {}, useServiceKey = true, returnCount = false } = {}
) {
  const config = getSupabaseConfig()
  const useProxy = useServiceKey && !!config.serviceKey
  const authKey = (useServiceKey && config.serviceKey) ? config.serviceKey : config.key
  const url = new URL(useProxy ? `${ADMIN_API_PROXY_PREFIX}${path}` : path, config.url)
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v)
  })
  const headers = {
    Authorization: `Bearer ${authKey}`,
    Prefer: returnCount ? 'count=exact' : 'return=representation'
  }
  // 直连数据面时才需要 apikey 头；走代理时 Authorization 即共享口令
  if (!useProxy) headers.apikey = authKey
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
