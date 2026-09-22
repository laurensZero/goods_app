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
// 探测硬超时：主站国内常 TCP 黑洞，不设超时会挂到系统级数十秒
const PROBE_TIMEOUT_MS = 1500
// 备用走 CF 回源，给稍宽一点
const BACKUP_PROBE_TIMEOUT_MS = 3000
// 数据面请求超时（storage 上传除外）
const DATA_FETCH_TIMEOUT_MS = 12_000
// 探测节流：同步/启动连续触发时不反复打两端
const PROBE_THROTTLE_MS = 10_000
let _dataEndpoint = PRIMARY_ENDPOINT
// 自建实例（同步设置手动填写）时锁定 URL，不参与主备切换
let _customLocked = false
let _lastProbeOk = false
let _lastProbeAt = 0
let _lastProbedUrl = ''

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

/**
 * 短超时 fetch：主站探测/数据面请求在弱网下不得干等 TCP 超时。
 * storage 上传可能较慢，调用方自行跳过。
 */
async function fetchWithTimeout(input, init = {}, timeoutMs = PROBE_TIMEOUT_MS) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const callerSignal = init?.signal
  const onAbort = () => controller.abort(callerSignal?.reason)
  if (callerSignal) {
    if (callerSignal.aborted) {
      clearTimeout(timer)
      throw callerSignal.reason || new DOMException('Aborted', 'AbortError')
    }
    callerSignal.addEventListener('abort', onAbort, { once: true })
  }
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
    callerSignal?.removeEventListener('abort', onAbort)
  }
}

function buildClient(url, anonKey) {
  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      storageKey: 'sb-main-auth-token'
    },
    global: {
      headers: deviceHeaders(),
      // 数据面 REST/auth：12s 硬超时，避免国内连主站时请求无限挂起；
      // storage 上传/下载走原生 fetch 不截断。
      fetch: (input, init) => {
        const raw = typeof input === 'string' ? input : input?.url || ''
        if (raw.includes('/storage/v1/')) return fetch(input, init)
        return fetchWithTimeout(input, init, DATA_FETCH_TIMEOUT_MS)
      }
    }
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
 * 探测一个端点是否网络可达（收到任意 HTTP 响应即算可达，含 4xx/5xx 业务错误）。
 * 用裸 fetch + AbortController 硬超时：弱网下主站可能一直不回包，不能交给 TCP 慢慢超时。
 * @param {string} url
 * @param {number} [timeoutMs]
 * @returns {Promise<boolean>} true = 网络可达
 */
async function probeEndpoint(url, timeoutMs = PROBE_TIMEOUT_MS) {
  try {
    await fetchWithTimeout(`${url}/auth/v1/health`, { method: 'GET' }, timeoutMs)
    return true
  } catch {
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
 *
 * 主备并行探测：主站 1.5s 硬超时，一失败立即采用备用结果，不再串行干等。
 * @param {{ force?: boolean }} [options] - force: 跳过探测节流（网络错误回调里用）
 * @returns {Promise<boolean>} 是否重建成功
 */
export async function reconnectSupabase({ force = false } = {}) {
  const key = _initKey || SUPABASE_ANON_KEY
  if (!key) return false

  const preferred = _customLocked && _initUrl ? _initUrl : resolveDataUrl()
  const alternate = alternateDataUrl(preferred)
  const now = Date.now()
  if (
    !force &&
    _lastProbeOk &&
    _lastProbedUrl === preferred &&
    now - _lastProbeAt < PROBE_THROTTLE_MS
  ) {
    return true
  }

  const apply = async (url) => {
    supabase = buildClient(url, key)
    _initUrl = url
    _initKey = key
    await persistDataEndpoint(url)
    return true
  }

  if (!alternate || alternate === preferred) {
    const reachable = await probeEndpoint(preferred, PROBE_TIMEOUT_MS)
    _lastProbeAt = Date.now()
    _lastProbeOk = reachable
    _lastProbedUrl = preferred
    if (!reachable) {
      console.warn('[supabase] endpoint unreachable:', preferred)
      supabase = null
      return false
    }
    return apply(preferred)
  }

  // 并行：两端同时探，主站先判；主站通则不等备用，主站挂则立刻用备用结果
  const preferredProbe = probeEndpoint(preferred, PROBE_TIMEOUT_MS)
  const alternateProbe = probeEndpoint(alternate, BACKUP_PROBE_TIMEOUT_MS)

  const preferredOk = await preferredProbe
  if (preferredOk) {
    _lastProbeAt = Date.now()
    _lastProbeOk = true
    _lastProbedUrl = preferred
    // 备用探测仍在飞行，不阻塞启动
    void alternateProbe
    return apply(preferred)
  }

  console.warn('[supabase] endpoint unreachable:', preferred)
  const alternateOk = await alternateProbe
  _lastProbeAt = Date.now()
  _lastProbeOk = alternateOk
  _lastProbedUrl = alternateOk ? alternate : preferred
  if (!alternateOk) {
    console.warn('[supabase] endpoint unreachable:', alternate)
    supabase = null
    return false
  }
  console.warn('[supabase] failed over to', alternate)
  return apply(alternate)
}
