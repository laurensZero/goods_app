// src/utils/supabase/auth.js
// Supabase Auth wrapper — thin layer over @supabase/supabase-js auth API

import { getSupabaseClient } from '@/utils/sync/supabaseClient'

/**
 * 处理 OAuth / Magic Link 回调中的 token
 * 因为使用 hash 路由，需要手动从 URL 中提取 token
 * 支持 hash (#access_token=...) 和 query string (?access_token=...) 两种格式
 * @returns {Promise<boolean>} 是否成功处理了回调
 */
export async function handleAuthCallback() {
  // 优先从 hash 提取，其次从 search 提取，最后从 pathname 提取
  let rawParams = ''

  const hash = window.location.hash
  if (hash && hash.includes('access_token')) {
    rawParams = hash.replace(/^#\/?/, '')
  } else {
    const search = window.location.search
    if (search && search.includes('access_token')) {
      rawParams = search.replace(/^\?/, '')
    } else {
      // Supabase OAuth 有时把 token 放在 path 里: /access_token=...&refresh_token=...
      const pathname = window.location.pathname
      if (pathname.includes('access_token')) {
        rawParams = pathname.replace(/^\//, '')
      }
    }
  }

  if (!rawParams) return false

  const params = new URLSearchParams(rawParams)
  const accessToken = params.get('access_token')
  const refreshToken = params.get('refresh_token')
  const expiresIn = params.get('expires_in')
  const tokenType = params.get('token_type')

  if (!accessToken) return false

  const client = getSupabaseClient()

  try {
    const { data, error } = await client.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken || '',
      expires_in: Number(expiresIn) || 3600,
      token_type: tokenType || 'bearer'
    })

    if (error) {
      console.warn('[auth] handleAuthCallback setSession error:', error.message)
      return false
    }

    // 清理 URL，避免重复处理。file:// 下整体替换为 '/' 会把文档 URL
    // 指向文件系统根（部分 WebView 抛 SecurityError 或破坏后续 reload），
    // 因此 token 在 hash 时只重写 hash，其余场景仅在非 file:// 下整体替换
    if (hash && hash.includes('access_token')) {
      window.history.replaceState(
        window.history.state, document.title,
        window.location.pathname + window.location.search + '#/'
      )
    } else if (window.location.protocol !== 'file:') {
      window.history.replaceState(window.history.state, document.title, '/')
    }

    return true
  } catch (e) {
    console.warn('[auth] handleAuthCallback failed:', e.message)
    return false
  }
}

/**
 * Sign in with email and password
 */
export async function signInWithEmail(email, password) {
  const client = getSupabaseClient()
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

/**
 * Sign up with email and password
 */
export async function signUpWithEmail(email, password, options = {}) {
  const client = getSupabaseClient()
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      data: options.metadata || {},
      emailRedirectTo: options.emailRedirectTo
    }
  })
  if (error) throw error
  return data
}

/**
 * Send magic link (passwordless) login email
 */
export async function sendMagicLink(email, options = {}) {
  const client = getSupabaseClient()
  const { data, error } = await client.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: options.emailRedirectTo
    }
  })
  if (error) throw error
  return data
}

/**
 * Sign in with OAuth provider
 * @param {'google' | 'github' | 'azure'} provider
 */
export async function signInWithOAuth(provider, options = {}) {
  const client = getSupabaseClient()
  const { data, error } = await client.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: options.redirectTo,
      scopes: options.scopes
    }
  })
  if (error) throw error
  return data
}

/**
 * Sign out
 */
export async function signOut() {
  const client = getSupabaseClient()
  const { error } = await client.auth.signOut()
  if (error) throw error
}

/**
 * Send password reset email
 */
export async function resetPassword(email, options = {}) {
  const client = getSupabaseClient()
  const { data, error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: options.redirectTo
  })
  if (error) throw error
  return data
}

/**
 * Update user profile (display_name, avatar_url, etc.)
 */
export async function updateUserProfile(attributes) {
  const client = getSupabaseClient()
  const { data, error } = await client.auth.updateUser({ data: attributes })
  if (error) throw error
  return data
}

/**
 * Get current session
 */
export async function getSession() {
  const client = getSupabaseClient()
  const { data, error } = await client.auth.getSession()
  if (error) throw error
  return data.session
}

/**
 * Get current user (from session)
 */
export async function getUser() {
  const client = getSupabaseClient()
  const { data: { user }, error } = await client.auth.getUser()
  if (error) throw error
  return user
}

/**
 * Subscribe to auth state changes
 * @param {(event: string, session: object | null) => void} callback
 * @returns {object} subscription object (call .unsubscribe() to stop)
 */
export function onAuthStateChange(callback) {
  const client = getSupabaseClient()
  const { data } = client.auth.onAuthStateChange(callback)
  return data.subscription
}

/**
 * Update password for logged-in user
 */
export async function updatePassword(newPassword) {
  const client = getSupabaseClient()
  const { data, error } = await client.auth.updateUser({ password: newPassword })
  if (error) throw error
  return data
}

/**
 * Get linked OAuth identities for current user
 */
export async function getLinkedProviders() {
  const client = getSupabaseClient()
  const { data: { user }, error } = await client.auth.getUser()
  if (error) throw error
  return user?.identities || []
}

/**
 * Link a new OAuth provider to current user
 * @param {'google' | 'github' | 'azure'} provider
 */
export async function linkOAuthProvider(provider, options = {}) {
  const client = getSupabaseClient()
  const { data, error } = await client.auth.linkIdentity({
    provider,
    options: { redirectTo: options.redirectTo }
  })
  if (error) throw error
  return data
}

/**
 * Unlink an OAuth identity from current user
 * @param {string} identityId - The identity id to unlink
 */
export async function unlinkOAuthProvider(identityId) {
  const client = getSupabaseClient()
  const { data, error } = await client.auth.unlinkIdentity(identityId)
  if (error) throw error
  return data
}

/**
 * Delete current user account via Edge Function
 * @param {string} password - Current password for verification
 */
export async function deleteAccount(password) {
  const client = getSupabaseClient()
  const { data: { session } } = await client.auth.getSession()
  const { SUPABASE_URL } = await import('@/config/supabase')
  const response = await fetch(`${SUPABASE_URL}/functions/v1/delete-user`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ password })
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error || '注销失败')
  }
  return response.json()
}
