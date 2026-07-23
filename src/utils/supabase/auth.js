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

    // 清理 URL，避免重复处理
    window.history.replaceState({}, document.title, '/')

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
