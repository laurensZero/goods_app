// src/utils/supabaseClient.js
import i18n from '@/locales'
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/config/supabase'
import { getDeviceId } from '@/utils/feedbackDevice'

let supabase = null

// 所有请求携带设备 id，供 feedbacks 等 RLS 策略按 x-device-id 头做匿名归属匹配
function deviceHeaders() {
  try {
    return { 'x-device-id': getDeviceId() }
  } catch {
    return {}
  }
}

/**
 * 初始化 Supabase Client
 * @param {string} url - Supabase 项目 URL
 * @param {string} anonKey - Supabase Anon Key
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
let _initUrl = ''
let _initKey = ''

export function initSupabaseClient(url, anonKey) {
  if (!url || !anonKey) {
    throw new Error(i18n.global.t('sync.error.supabaseConfigEmpty'))
  }
  if (supabase && _initUrl === url && _initKey === anonKey) {
    return supabase
  }
  _initUrl = url
  _initKey = anonKey
  supabase = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      storageKey: 'sb-main-auth-token'
    },
    global: { headers: deviceHeaders() }
  })
  return supabase
}

/**
 * 获取当前 Supabase Client 实例
 * 如果未初始化，自动使用内置配置初始化
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
export function getSupabaseClient() {
  if (!supabase) {
    // Auto-initialize with built-in config
    if (SUPABASE_URL && SUPABASE_ANON_KEY) {
      return initSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    }
    throw new Error(i18n.global.t('sync.error.supabaseClientNotInit'))
  }
  return supabase
}

/**
 * 测试 Supabase 连接
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function testSupabaseConnection(url, anonKey) {
  try {
    const client = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false, storageKey: 'sb-test-auth-token' }
    })
    const { error } = await client.from('goods').select('id').limit(1)
    if (error) {
      if (error.message.includes('does not exist') || error.code === '42P01') {
        return { ok: false, error: i18n.global.t('sync.error.supabaseTableMissing') }
      }
      if (error.code === 'PGRST301' || error.message.includes('JWT')) {
        return { ok: false, error: i18n.global.t('sync.error.supabaseKeyInvalid') }
      }
      if (error.code === '406' || error.message.includes('Not Acceptable')) {
        return { ok: false, error: i18n.global.t('sync.error.supabasePermissionDenied') }
      }
      return { ok: false, error: error.message }
    }
    return { ok: true }
  } catch (e) {
    if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')) {
      return { ok: false, error: i18n.global.t('sync.error.supabaseNetworkFailed') }
    }
    return { ok: false, error: e.message }
  }
}

/**
 * 清除 Supabase Client 实例
 */
export function clearSupabaseClient() {
  supabase = null
}

/**
 * 检查 Supabase 是否已配置（内置配置或手动配置）
 */
export function isSupabaseConfigured() {
  return (!!_initUrl && !!_initKey) || (!!SUPABASE_URL && !!SUPABASE_ANON_KEY)
}

/**
 * 重建 Supabase Client 连接
 * 用于 Android 后台回收后刷新 DNS 缓存和连接池
 * @returns {Promise<boolean>} 是否重建成功
 */
export async function reconnectSupabase() {
  const url = _initUrl || SUPABASE_URL
  const key = _initKey || SUPABASE_ANON_KEY
  if (!url || !key) return false
  supabase = null
  supabase = createClient(url, key, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      storageKey: 'sb-main-auth-token'
    },
    global: { headers: deviceHeaders() }
  })
  try {
    const { error } = await supabase.from('goods').select('id').limit(1)
    if (error) {
      console.warn('[supabase] reconnect probe failed:', error.message)
      return false
    }
    return true
  } catch (e) {
    console.warn('[supabase] reconnect failed:', e.message)
    supabase = null
    return false
  }
}
