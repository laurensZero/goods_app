// src/utils/supabase/auth.js
// Supabase Auth wrapper — thin layer over @supabase/supabase-js auth API

import { getSupabaseClient } from '@/utils/sync/supabaseClient'

/**
 * 处理 OAuth / Magic Link 回调中的 token
 * 因为使用 hash 路由，需要手动从 URL hash 中提取 token
 * @returns {Promise<boolean>} 是否成功处理了回调
 */
export async function handleAuthCallback() {
  const hash = window.location.hash
  if (!hash || !hash.includes('access_token')) return false

  const client = getSupabaseClient()

  // 从 hash 中解析参数（支持 #/access_token=... 和 #access_token=... 两种格式）
  const hashContent = hash.replace(/^#\/?/, '')
  const params = new URLSearchParams(hashContent)
  const accessToken = params.get('access_token')
  const refreshToken = params.get('refresh_token')
  const expiresIn = params.get('expires_in')
  const tokenType = params.get('token_type')
  const type = params.get('type') // 'signup', 'magiclink', 'recovery', etc.

  if (!accessToken) return false

  try {
    // 使用 access_token 和 refresh_token 设置 session
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

    // 清理 URL hash，避免重复处理
    window.history.replaceState({}, document.title, window.location.pathname + window.location.search)

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
 * @param {'google' | 'github'} provider
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
