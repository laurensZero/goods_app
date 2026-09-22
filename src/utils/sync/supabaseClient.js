// src/utils/supabaseClient.js
import i18n from '@/locales'
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_BACKUP_URL, SUPABASE_ANON_KEY } from '@/config/supabase'
import { getDeviceId } from '@/utils/feedback/feedbackDevice'
import { readSyncKey, writeSyncKey } from '@/utils/sync/storage'

let supabase = null

// 数据面端点选择：primary = 官方直连，backup = 自建反代；仅内置配置参与主备切换
// 持久化上次可用端点，弱网下次启动可直接走备用，省去首连超时
const DATA_ENDPOINT_KEY = 'sync_data_endpoint'
const PRIMARY_ENDPOINT = 'primary'
const BACKUP_ENDPOINT = 'backup'
let _dataEndpoint = PRIMARY_ENDPOINT
// 自建实例（同步设置手动填写）时锁定 URL，不参与主备切换
let _customLocked = false

// 所有请求携带设备 id，供 feedbacks 等 RLS 策略按 x-device-id 头做匿名归属匹配
function deviceHeaders() {
  try {
    return { 'x-device-id': getDeviceId() }
  } catch {
    return {}
  }
}

function hasBackup() {
  return !!SUPABASE_BACKUP_URL && SUPABASE_BACKUP_URL !== SUPABASE_URL
}

function resolveDataUrl() {
  if (_customLocked && _initUrl) return _initUrl
  if (_dataEndpoint === BACKUP_ENDPOINT && hasBackup()) return SUPABASE_BACKUP_URL
  return SUPABASE_URL
}

function alternateDataUrl(currentUrl) {
  if (_customLocked || !hasBackup()) return ''
  if (currentUrl === SUPABASE_BACKUP_URL) return SUPABASE_URL
  if (currentUrl === SUPABASE_URL) return SUPABASE_BACKUP_URL
  return ''
}

async function persistDataEndpoint(url) {
  if (_customLocked || !hasBackup()) return
  const next = url === SUPABASE_BACKUP_URL ? BACKUP_ENDPOINT : PRIMARY_ENDPOINT
  if (next === _dataEndpoint) return
  _dataEndpoint = next
  try {
    await writeSyncKey(DATA_ENDPOINT_KEY, next)
  } catch (e) {
    console.warn('[supabase] persist data endpoint failed:', e.message)
  }
}

/**
 * 恢复持久化的数据面端点偏好（sync store init 时调用，须在首次建 client 前）
 */
export async function loadEndpointPreference() {
  try {
    const saved = await readSyncKey(DATA_ENDPOINT_KEY)
    _dataEndpoint = saved === BACKUP_ENDPOINT && hasBackup() ? BACKUP_ENDPOINT : PRIMARY_ENDPOINT
  } catch {
    _dataEndpoint = PRIMARY_ENDPOINT
  }
}

/**
 * 当前数据面基础 URL（Edge Function / 手写 fetch 用；图片公链不要用这个）
 * @returns {string}
 */
export function getDataPlaneUrl() {
  return _initUrl || resolveDataUrl()
}

/**
 * 图片/OTA 等公开资源的基础 URL：内置配置固定走主域名（备用反代只扛数据面，
 * 避免图床流量打爆小水管 VPS）；自建实例用自建 URL。
 * @returns {string}
 */
export function getPublicBaseUrl() {
  if (_customLocked && _initUrl) return _initUrl
  return SUPABASE_URL
}

function buildClient(url, anonKey) {
  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      storageKey: 'sb-main-auth-token'
    },
    global: { headers: deviceHeaders() }
  })
}

/**
 * 初始化 Supabase Client
 * 非内置主/备 URL 视为自建实例并锁定（不参与主备切换）。
 * @param {string} url - Supabase 项目 URL
 * @param {string} anonKey - Supabase Anon Key
 * @param {{ custom?: boolean }} [options] - custom: 强制按自建实例处理
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
let _initUrl = ''
let _initKey = ''

function isBuiltinDataUrl(url) {
  return url === SUPABASE_URL || (hasBackup() && url === SUPABASE_BACKUP_URL)
}

export function initSupabaseClient(url, anonKey, options = {}) {
  if (!url || !anonKey) {
    throw new Error(i18n.global.t('sync.error.supabaseConfigEmpty'))
  }
  if (options.custom === true || (url && !isBuiltinDataUrl(url))) {
    _customLocked = true
    _dataEndpoint = PRIMARY_ENDPOINT
  } else if (_customLocked) {
    // 已锁定自建实例：忽略内置 URL，维持自建端点
    url = _initUrl || url
  } else {
    // 内置初始化：跟随持久化/当前数据面端点偏好
    url = resolveDataUrl()
  }
  if (supabase && _initUrl === url && _initKey === anonKey) {
    return supabase
  }
  _initUrl = url
  _initKey = anonKey
  supabase = buildClient(url, anonKey)
  return supabase
}

/**
 * 获取当前 Supabase Client 实例
 * 如果未初始化，自动使用内置配置初始化
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
export function getSupabaseClient() {
  if (!supabase) {
    if (_customLocked && _initUrl && _initKey) {
      return initSupabaseClient(_initUrl, _initKey, { custom: true })
    }
    if (SUPABASE_URL && SUPABASE_ANON_KEY) {
      return initSupabaseClient(resolveDataUrl(), SUPABASE_ANON_KEY)
    }
    throw new Error(i18n.global.t('sync.error.supabaseClientNotInit'))
  }
  return supabase
}

/**
 * 探测一个端点是否网络可达（业务错误也算可达，只有网络层失败才算失败）
 * @returns {Promise<boolean>} true = 网络可达
 */
async function probeEndpoint(url, anonKey) {
  try {
    const client = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false, storageKey: 'sb-probe-auth-token' }
    })
    const { error } = await client.from('goods').select('id').limit(1)
    // 有 error 但拿到了响应（表缺失/JWT 无效等）说明网络通；抛异常才是网络失败
    if (error) {
      console.warn('[supabase] probe got response (treated reachable):', error.message)
    }
    return true
  } catch (e) {
    const msg = String(e?.message || '')
    if (
      msg.includes('Failed to fetch') ||
      msg.includes('NetworkError') ||
      msg.includes('network') ||
      msg.includes('Failed to send request') ||
      msg.includes('ECONN') ||
      msg.includes('ENOTFOUND') ||
      e?.name === 'TypeError'
    ) {
      return false
    }
    // 其他异常（如 AbortError）按不可达处理，交给上层切换
    return false
  }
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
 * 用于 Android 后台回收后刷新 DNS 缓存和连接池；
 * 当前端点网络失败且启用备用反代时自动切换到另一端点并持久化。
 * @returns {Promise<boolean>} 是否重建成功
 */
export async function reconnectSupabase() {
  const key = _initKey || SUPABASE_ANON_KEY
  if (!key) return false

  const preferred = _customLocked && _initUrl ? _initUrl : resolveDataUrl()
  const alternate = alternateDataUrl(preferred)
  const candidates = alternate && alternate !== preferred ? [preferred, alternate] : [preferred]

  for (const url of candidates) {
    const reachable = await probeEndpoint(url, key)
    if (!reachable) {
      console.warn('[supabase] endpoint unreachable:', url)
      continue
    }
    supabase = buildClient(url, key)
    _initUrl = url
    _initKey = key
    await persistDataEndpoint(url)
    if (url !== preferred) {
      console.warn('[supabase] failed over to', url)
    }
    return true
  }

  supabase = null
  return false
}
