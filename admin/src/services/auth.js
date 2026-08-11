import { DEFAULT_SUPABASE_URL } from '../config/sections'

export const ADMIN_SESSION_STORAGE_KEY = 'goods_admin_session'

/**
 * 管理台会话。token 由 admin-login Edge Function 校验 goods app 账号
 * （Supabase Auth 邮箱+密码）并检查 feature_whitelist 的 'admin' 授权后下发，
 * 仅保存在本机浏览器 localStorage。
 * 会话结构：{ admin: { id, username, role }, tokens: { github, supabaseUrl, supabaseKey, serviceKey }, loggedInAt }
 */

export function getSession() {
  try {
    const raw = localStorage.getItem(ADMIN_SESSION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || !parsed.admin || !parsed.tokens) return null
    return parsed
  } catch {
    return null
  }
}

export function saveSession(session) {
  localStorage.setItem(ADMIN_SESSION_STORAGE_KEY, JSON.stringify(session))
}

export function clearSession() {
  localStorage.removeItem(ADMIN_SESSION_STORAGE_KEY)
}

export function isAuthenticated() {
  const session = getSession()
  if (!session) return false
  // 会话内持有 github 或 supabase 凭据任一套即视为有效
  return !!(session.tokens?.github || session.tokens?.serviceKey)
}

export async function login(username, password) {
  const res = await fetch(`${DEFAULT_SUPABASE_URL}/functions/v1/admin-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  })

  if (!res.ok) {
    const payload = await res.json().catch(() => null)
    const code = payload?.error
    if (code === 'invalid_credentials') {
      throw new Error('账号或密码错误，或该账号未获得管理员权限。')
    }
    if (code === 'rate_limited') {
      throw new Error('尝试次数过多，请稍后再试。')
    }
    throw new Error(`登录失败（${res.status}）。`)
  }

  const session = await res.json()
  if (!session?.tokens) throw new Error('登录响应缺少凭据数据。')
  const next = { ...session, loggedInAt: Date.now() }
  saveSession(next)
  return next
}

export function logout() {
  clearSession()
}
