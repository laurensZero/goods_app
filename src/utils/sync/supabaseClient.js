// src/utils/supabaseClient.js
import i18n from '@/locales'
import { createClient } from '@supabase/supabase-js'

let supabase = null

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
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  })
  return supabase
}

/**
 * 获取当前 Supabase Client 实例
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
export function getSupabaseClient() {
  if (!supabase) {
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
