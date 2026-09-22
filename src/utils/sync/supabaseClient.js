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
const DATA_ENDPOINT_MANUAL_KEY = 'sync_data_endpoint_manual'
// 手动选定后粘住该端点：仅当持续不通超过此时长才允许自动切走
const MANUAL_FAILOVER_AFTER_MS = 30_000
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
let _manualEndpoint = false
let _manualFailSince = 0
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
  try {
    _manualEndpoint = (await readSyncKey(DATA_ENDPOINT_MANUAL_KEY)) === '1'
  } catch {
    _manualEndpoint = false
  }
  _manualFailSince = 0
}

async function persistManualEndpointFlag(manual) {
  _manualEndpoint = !!manual
  try {
    await writeSyncKey(DATA_ENDPOINT_MANUAL_KEY, manual ? '1' : '')
  } catch (e) {
    console.warn('[supabase] persist manual endpoint flag failed:', e.message)
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
 * 图片等公开展示资源的基础 URL：跟随数据面端点偏好（用户在同步设置里切主站/备用反代）。
 * 自建实例用自建 URL。OTA/APK 下载请用 getFileDownloadBaseUrls。
 * @returns {string}
 */
export function getPublicBaseUrl() {
  return resolveDataUrl()
}

/**
 * 公开图片 URL 的候选 base（按尝试顺序）：当前端点优先，另一端兜底。
 * 主站抽风时列表/详情可切到备用反代继续出图。
 * @returns {string[]}
 */
export function getPublicBaseUrlCandidates() {
  if (_customLocked && _initUrl) return [_initUrl]
  const primary = SUPABASE_URL
  const backup = hasBackup() ? SUPABASE_BACKUP_URL : ''
  const current = resolveDataUrl()
  if (!backup) return [primary]
  if (current === backup) return [backup, primary]
  return [primary, backup]
}

/**
 * 把已存的公开图片 URL 改写到指定 base（主站 ↔ 备用反代同路径）。
 * 非内置 Supabase 公链（米游铺 CDN、本地文件等）原样返回。
 * @param {string} url
 * @param {string} baseUrl
 * @returns {string}
 */
export function rebasePublicImageUrl(url, baseUrl) {
  const raw = String(url || '').trim()
  const target = String(baseUrl || '').trim().replace(/\/+$/, '')
  if (!raw || !target) return raw
  const bases = [SUPABASE_URL, SUPABASE_BACKUP_URL, _customLocked ? _initUrl : '']
    .filter(Boolean)
    .map((b) => b.replace(/\/+$/, ''))
  for (const base of bases) {
    if (raw === base) continue
    if (raw.startsWith(`${base}/`)) {
      return `${target}${raw.slice(base.length)}`
    }
  }
  return raw
}

/**
 * 展示用候选 URL 列表（按顺序尝试）。第一项是当前偏好端点上的地址。
 * @param {string} url
 * @returns {string[]}
 */
export function getPublicImageDisplayCandidates(url) {
  const raw = String(url || '').trim()
  if (!raw) return []
  const bases = getPublicBaseUrlCandidates()
  const seen = new Set()
  const list = []
  for (const base of bases) {
    const next = rebasePublicImageUrl(raw, base)
    if (!next || seen.has(next)) continue
    seen.add(next)
    list.push(next)
  }
  if (list.length === 0) list.push(raw)
  return list
}

/**
 * OTA/APK 等大文件下载的基础 URL 列表（按尝试顺序）。
 * 与数据面主备一致：当前数据面端点在前，另一端内置点兜底；
 * 自建实例只有自己。图片公链不要用这个。
 * @returns {string[]}
 */
export function getFileDownloadBaseUrls() {
  if (_customLocked && _initUrl) return [_initUrl]
  const primary = SUPABASE_URL
  const backup = hasBackup() ? SUPABASE_BACKUP_URL : ''
  if (!backup) return [primary]
  // 与数据面端点一致：当前端点优先，另一端回退
  const current = resolveDataUrl()
  if (current === backup) return [backup, primary]
  return [primary, backup]
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

function isSpaWebHost(url) {
  try {
    const host = new URL(url).hostname
    return host === 'goodsapp.de5.net' || host.endsWith('.pages.dev')
  } catch {
    return false
  }
}

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
 * 数据面端点候选（主站 / 备用反代 / 自建锁定）。
 * @returns {Array<{ id: string, url: string, active: boolean, canSwitch: boolean }>}
 */
export function listDataEndpoints() {
  if (_customLocked && _initUrl) {
    return [{ id: 'custom', url: _initUrl, active: true, canSwitch: false }]
  }
  const current = resolveDataUrl()
  const list = [{
    id: PRIMARY_ENDPOINT,
    url: SUPABASE_URL,
    active: current === SUPABASE_URL,
    canSwitch: hasBackup()
  }]
  if (hasBackup()) {
    list.push({
      id: BACKUP_ENDPOINT,
      url: SUPABASE_BACKUP_URL,
      active: current === SUPABASE_BACKUP_URL,
      canSwitch: true
    })
  }
  return list
}

/**
 * 当前数据面端点 id：primary / backup / custom
 * @returns {string}
 */
export function getDataEndpointId() {
  if (_customLocked && _initUrl) return 'custom'
  return resolveDataUrl() === SUPABASE_BACKUP_URL ? BACKUP_ENDPOINT : PRIMARY_ENDPOINT
}

/**
 * 测量端点 health 探测延迟（任意 HTTP 响应视为可达）。
 * @param {string} url
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<{ ok: boolean, ms: number }>}
 */
export async function measureEndpoint(url, options = {}) {
  const target = String(url || '').trim()
  if (!target) return { ok: false, ms: 0 }
  const timeoutMs = options.timeoutMs
    || (hasBackup() && target === SUPABASE_BACKUP_URL ? BACKUP_PROBE_TIMEOUT_MS : PROBE_TIMEOUT_MS)
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
  const started = now()
  try {
    await fetchWithTimeout(`${target}/auth/v1/health`, { method: 'GET' }, timeoutMs)
    return { ok: true, ms: Math.max(0, Math.round(now() - started)) }
  } catch {
    return { ok: false, ms: Math.max(0, Math.round(now() - started)) }
  }
}

/**
 * 手动切换数据面端点（primary / backup），并持久化偏好。
 * 自建锁定实例不参与切换。
 * @param {'primary'|'backup'} target
 * @returns {Promise<boolean>} 是否切换成功
 */
export async function switchDataEndpoint(target) {
  if (_customLocked || !hasBackup()) return false
  const next = target === BACKUP_ENDPOINT ? BACKUP_ENDPOINT : PRIMARY_ENDPOINT
  const url = next === BACKUP_ENDPOINT ? SUPABASE_BACKUP_URL : SUPABASE_URL
  const key = _initKey || SUPABASE_ANON_KEY
  if (!key) return false
  supabase = buildClient(url, key)
  _initUrl = url
  _initKey = key
  await persistDataEndpoint(url)
  await persistManualEndpointFlag(true)
  _manualFailSince = 0
  _lastProbeOk = true
  _lastProbedUrl = url
  _lastProbeAt = Date.now()
  return true
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
 * 只探当前端点；失败也不自动切备用（主站可能只是慢）。仅手动 switchDataEndpoint 切换。
 * @param {{ force?: boolean, parallelProbe?: boolean }} [options]
 *   - force: 跳过探测节流（网络错误回调里用）
 *   - parallelProbe: 主备同时探测（仅冷启动）
 * @returns {Promise<boolean>} 是否重建成功
 */
export async function reconnectSupabase({ force = false, parallelProbe = false } = {}) {
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

  const markPreferredOk = async () => {
    _manualFailSince = 0
    _lastProbeAt = Date.now()
    _lastProbeOk = true
    _lastProbedUrl = preferred
    return apply(preferred)
  }

  const failoverToAlternate = async () => {
    // 不自动切反代：主站可能只是慢/在加载。仅 switchDataEndpoint 手动切换。
    console.warn('[supabase] endpoint unreachable (no auto-failover):', preferred)
    _lastProbeAt = Date.now()
    _lastProbeOk = false
    _lastProbedUrl = preferred
    return false
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
    _manualFailSince = 0
    return apply(preferred)
  }

  if (parallelProbe) {
    // 已废弃自动并行切换：只探 preferred，不切备用
    const preferredOk = await probeEndpoint(preferred, PROBE_TIMEOUT_MS)
    if (preferredOk) return markPreferredOk()
    return failoverToAlternate()
  }

  // 非启动：只探当前端点；通了不碰备用，挂了再探备用
  const preferredOk = await probeEndpoint(preferred, PROBE_TIMEOUT_MS)
  if (preferredOk) return markPreferredOk()
  return failoverToAlternate()
}
