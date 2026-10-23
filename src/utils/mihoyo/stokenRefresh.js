/**
 * stoken → ltoken / cookie_token → 米游铺 Cookie 刷新。
 *
 * 背景：
 *   - 网页扫码只给 cookie_token_v2 / ltoken_v2，没有 stoken；
 *   - 用米游社 App 扫码脚本拿到的 stoken 可以换出 v1 ltoken / cookie_token；
 *   - 米游铺 user/info 已实测接受这套 v1 Cookie。
 *
 * 刷新原则：
 *   1. 先换票，再组装 Cookie；
 *   2. 用新 Cookie 请求 user/info 校验；
 *   3. 只有校验成功，调用方才允许替换旧 Cookie；
 *   4. 网络/代理失败不标记账号失效。
 */
import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { md5 } from '@/utils/md5'
import { readSecret, writeSecret } from '@/utils/platform/storage'
import { fetchWithPlatformBridge } from '@/utils/platform/http'
import { probeMihoyoUserInfo } from '@/utils/mihoyo/accountProfile'
import { isMihoyoAuthHttpStatus, isMihoyoAuthRetcode } from '@/utils/mihoyo/authError'

export const MIHOYO_ACCOUNT_PASSPORT_BASE = 'https://passport-api.mihoyo.com'
export const MIHOYO_ACCOUNT_PASSPORT_PROXY = '/mihoyo-account-passport'

const GET_COOKIE_TOKEN_PATH = '/account/auth/api/getCookieAccountInfoBySToken'
const GET_LTOKEN_PATH = '/account/auth/api/getLTokenBySToken'

const DS_SALT_X4 = 'xV8v4Qu54lUKrEYFZkJhB8cuOh9Asafs'
const BBS_VERSION = '2.106.2'
const BBS_UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) miHoYoBBS/${BBS_VERSION}`
const DEVICE_KEY = 'mihoyo_device_profile'
const REQUEST_TIMEOUT_MS = 10000

function md5Hex(input) {
  return md5(String(input))
}

/** Passport X4 签名；query/body 必须与实际参与签名的字符串一致 */
export function makeMihoyoDsX4({ query = '', body = '' } = {}, { t, r } = {}) {
  const timestamp = String(t || Math.floor(Date.now() / 1000))
  const random = String(r || Math.floor(100000 + Math.random() * 100001))
  const hash = md5Hex(`salt=${DS_SALT_X4}&t=${timestamp}&r=${random}&b=${body}&q=${query}`)
  return `${timestamp},${random},${hash}`
}

function createDeviceId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const value = (Math.random() * 16) | 0
    const next = char === 'x' ? value : (value & 0x3) | 0x8
    return next.toString(16)
  })
}

/** 稳定设备指纹：同一安装内复用，避免每次刷新都换设备 */
export async function getMihoyoDeviceProfile() {
  const raw = await readSecret(DEVICE_KEY)
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      const deviceId = String(parsed?.deviceId || '').trim()
      const deviceFp = String(parsed?.deviceFp || '').trim()
      if (deviceId && deviceFp) return { deviceId, deviceFp }
    } catch {
      // 旧数据损坏时重新生成
    }
  }

  const deviceId = createDeviceId()
  const deviceFp = deviceId.replace(/-/g, '').slice(0, 13)
  await writeSecret(DEVICE_KEY, JSON.stringify({ deviceId, deviceFp }))
  return { deviceId, deviceFp }
}

const STOKEN_ONLY_RE = /^v2_[A-Za-z0-9+/_.=-]+$/

/**
 * 从粘贴内容里单独提取 stoken。
 * 终端/聊天窗口复制时可能把长 stoken 折成多行，这里把折行空白去掉；
 * 如果换行后紧跟 mid= / stuid= 等下一个字段，则在那里截断。
 */
function extractStoken(raw) {
  const match = raw.match(/(?:^|[;\s])stoken(?:_v2)?\s*=\s*([^;]+)/i)
  if (!match) return ''
  return match[1]
    .replace(
      /\r?\n(?=(?:mid|stuid|uid|account_id(?:_v2)?|account_mid(?:_v2)?|ltuid(?:_v2)?|ltmid(?:_v2)?|login_uid|stoken(?:_v2)?)\s*=)[\s\S]*$/i,
      ''
    )
    .replace(/\s+/g, '')
}

/**
 * 解析粘贴内容。支持：
 *   - 只粘贴 v2_...
 *   - stoken=...; mid=...; stuid=...
 *   - 完整 Cookie（含 stoken / mid / account_id_v2 等）
 *   - 被换行折断的 stoken
 */
export function parseStokenInput(input) {
  const raw = String(input || '').trim()
  if (!raw) return { stoken: '', mid: '', stuid: '' }
  if (STOKEN_ONLY_RE.test(raw)) return { stoken: raw, mid: '', stuid: '' }

  const stoken = extractStoken(raw)
  const pairs = {}
  raw.split(/[;\n\r]+/).forEach((part) => {
    const index = part.indexOf('=')
    if (index === -1) return
    const key = part.slice(0, index).trim().toLowerCase()
    const value = part.slice(index + 1).replace(/\s+/g, '').trim()
    if (key && value) pairs[key] = value
  })
  const mid = String(
    pairs.mid
    || pairs.account_mid_v2
    || pairs.ltmid_v2
    || pairs.account_mid
    || pairs.ltmid
    || ''
  ).trim()
  const stuid = String(
    pairs.stuid
    || pairs.uid
    || pairs.account_id_v2
    || pairs.ltuid_v2
    || pairs.account_id
    || pairs.ltuid
    || pairs.login_uid
    || ''
  ).trim()

  return { stoken, mid, stuid }
}

/** 组装米游铺可直接使用的 v1 Cookie */
export function buildRefreshedMihoyoCookie({ stuid, mid, ltoken, cookieToken }) {
  const uid = String(stuid || '').trim()
  const midValue = String(mid || '').trim()
  const lt = String(ltoken || '').trim()
  const ct = String(cookieToken || '').trim()
  if (!uid || !midValue || !lt || !ct) return ''

  return [
    `account_id=${uid}`,
    `account_id_v2=${uid}`,
    `account_mid_v2=${midValue}`,
    `cookie_token=${ct}`,
    `ltmid_v2=${midValue}`,
    `ltoken=${lt}`,
    `ltuid=${uid}`,
    `ltuid_v2=${uid}`,
    `login_uid=${uid}`,
  ].join('; ')
}

function buildPassportHeaders({ query, stoken, mid, clientType, deviceId, deviceFp }) {
  const headers = {
    'User-Agent': BBS_UA,
    Referer: 'https://webstatic.mihoyo.com',
    'x-rpc-app_version': BBS_VERSION,
    'x-rpc-client_type': String(clientType),
    'x-requested-with': 'com.mihoyo.hyperion',
    'x-rpc-device_id': deviceId,
    'x-rpc-device_fp': deviceFp,
    DS: makeMihoyoDsX4({ query }),
    Cookie: `mid=${mid};stoken=${stoken}`,
  }
  if (String(clientType) === '2') headers['x-rpc-aigis'] = ''
  return headers
}

function parseJsonPayload(data) {
  if (data == null || data === '') return {}
  return typeof data === 'string' ? JSON.parse(data) : data
}

function isHtmlPayload(text, contentType = '') {
  const head = String(text || '').trimStart().slice(0, 200).toLowerCase()
  return /text\/html/i.test(String(contentType || '')) ||
    head.startsWith('<!doctype html') ||
    head.startsWith('<html')
}

function createProxyUnavailableError() {
  const error = new Error('当前环境没有可用的 stoken 换票代理')
  error.code = 'proxy-unavailable'
  return error
}

async function requestPassportJson(path, { query = '', headers = {} } = {}) {
  const suffix = query ? `?${query}` : ''

  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.request({
      url: `${MIHOYO_ACCOUNT_PASSPORT_BASE}${path}${suffix}`,
      method: 'GET',
      headers,
      connectTimeout: REQUEST_TIMEOUT_MS,
      readTimeout: REQUEST_TIMEOUT_MS,
    })
    if (Number(res.status) >= 400) {
      const error = new Error(`请求失败（${res.status}）`)
      error.status = Number(res.status)
      throw error
    }
    const contentType = res.headers?.['content-type'] || res.headers?.['Content-Type'] || ''
    if (typeof res.data === 'string' && isHtmlPayload(res.data, contentType)) {
      throw createProxyUnavailableError()
    }
    return parseJsonPayload(res.data)
  }

  const webHeaders = { ...headers }
  webHeaders['x-cookie-forward'] = encodeURIComponent(webHeaders.Cookie || '')
  delete webHeaders.Cookie
  // 浏览器禁止设置 UA / Referer，由 Vite 代理补齐
  delete webHeaders['User-Agent']
  delete webHeaders.Referer

  const res = await fetchWithPlatformBridge(`${MIHOYO_ACCOUNT_PASSPORT_PROXY}${path}${suffix}`, {
    method: 'GET',
    headers: webHeaders,
    timeoutMs: REQUEST_TIMEOUT_MS,
  })
  if (!res.ok) {
    const error = new Error(`请求失败（${res.status}）`)
    error.status = res.status
    throw error
  }

  const contentType = res.headers?.get?.('content-type') || ''
  const text = await res.text()
  if (isHtmlPayload(text, contentType)) {
    // 典型场景：生产网页没有 /mihoyo-account-passport 反代，Vite/SPA 回退成 index.html
    throw createProxyUnavailableError()
  }
  try {
    return text ? JSON.parse(text) : {}
  } catch {
    throw new Error(`响应不是 JSON：${text.slice(0, 120)}`)
  }
}

function classifyRequestError(error) {
  if (error?.code === 'proxy-unavailable') return 'proxy'
  return isMihoyoAuthHttpStatus(error?.status) ? 'auth' : 'transient'
}

function exchangeFailure(json, fallback) {
  const retcode = Number(json?.retcode)
  const message = String(json?.message || fallback || '')
  if (isMihoyoAuthRetcode(retcode)) return { ok: false, kind: 'auth', retcode, message }
  return { ok: false, kind: 'transient', retcode, message }
}

/**
 * 用 stoken 换 ltoken / cookie_token。
 * @returns {Promise<{ok: true, ltoken: string, cookieToken: string, uid: string} | {ok: false, kind: string, retcode?: number, message: string}>}
 */
export async function exchangeStokenForTokens({ stoken, mid, deviceId, deviceFp }) {
  const value = String(stoken || '').trim()
  const midValue = String(mid || '').trim()
  if (!value) return { ok: false, kind: 'auth', message: 'stoken 为空' }
  if (!midValue) return { ok: false, kind: 'missing-mid', message: '缺少 mid' }

  // 与已验证的 Node 脚本保持一致：DS 签未编码 query，URL 使用 URLSearchParams 编码。
  const dsQuery = `stoken=${value}`
  const urlQuery = new URLSearchParams({ stoken: value }).toString()

  try {
    const cookieJson = await requestPassportJson(GET_COOKIE_TOKEN_PATH, {
      query: urlQuery,
      headers: buildPassportHeaders({
        query: dsQuery,
        stoken: value,
        mid: midValue,
        clientType: '2',
        deviceId,
        deviceFp,
      }),
    })
    if (Number(cookieJson?.retcode) !== 0) {
      return exchangeFailure(cookieJson, 'cookie_token 获取失败')
    }
    const cookieToken = String(cookieJson?.data?.cookie_token || '').trim()
    const uid = String(cookieJson?.data?.uid || '').trim()

    const ltokenJson = await requestPassportJson(GET_LTOKEN_PATH, {
      query: urlQuery,
      headers: buildPassportHeaders({
        query: dsQuery,
        stoken: value,
        mid: midValue,
        clientType: '5',
        deviceId,
        deviceFp,
      }),
    })
    if (Number(ltokenJson?.retcode) !== 0) {
      return exchangeFailure(ltokenJson, 'ltoken 获取失败')
    }
    const ltoken = String(ltokenJson?.data?.ltoken || '').trim()

    if (!cookieToken || !ltoken) {
      return { ok: false, kind: 'invalid', message: '换票成功但返回的 token 为空' }
    }
    return { ok: true, ltoken, cookieToken, uid }
  } catch (error) {
    return {
      ok: false,
      kind: classifyRequestError(error),
      message: String(error?.message || error || '网络请求失败'),
    }
  }
}

/**
 * 完整刷新：换票 → 组装 Cookie → user/info 校验。
 * 只有 ok=true 时才允许调用方替换旧 Cookie。
 */
export async function refreshMihoyoCookieWithStoken({ stoken, mid, stuid } = {}) {
  const value = String(stoken || '').trim()
  if (!value) return { ok: false, kind: 'auth', message: 'stoken 为空' }

  const midValue = String(mid || '').trim()
  if (!midValue) return { ok: false, kind: 'missing-mid', message: '缺少 mid，请粘贴 stoken.txt 完整内容' }

  const { deviceId, deviceFp } = await getMihoyoDeviceProfile()
  const exchange = await exchangeStokenForTokens({
    stoken: value,
    mid: midValue,
    deviceId,
    deviceFp,
  })
  if (!exchange.ok) return exchange

  const uid = String(stuid || exchange.uid || '').trim()
  if (uid && exchange.uid && exchange.uid !== uid) {
    return {
      ok: false,
      kind: 'mismatch',
      message: `stoken 所属账号不一致（${exchange.uid} ≠ ${uid}）`,
    }
  }

  const cookie = buildRefreshedMihoyoCookie({
    stuid: uid,
    mid: midValue,
    ltoken: exchange.ltoken,
    cookieToken: exchange.cookieToken,
  })
  if (!cookie) {
    return { ok: false, kind: 'missing-mid', message: '缺少 mid/stuid，无法组装 Cookie' }
  }

  const probe = await probeMihoyoUserInfo(cookie)
  if (!probe.ok) {
    return {
      ok: false,
      kind: probe.kind === 'auth' ? 'auth' : 'transient',
      retcode: probe.retcode,
      message: probe.message || 'user/info 校验失败',
    }
  }

  const profileUid = String(probe.profile?.uid || '').trim()
  if (uid && profileUid && profileUid !== uid) {
    return {
      ok: false,
      kind: 'mismatch',
      message: `账号 UID 不一致（${profileUid} ≠ ${uid}）`,
    }
  }

  return {
    ok: true,
    cookie,
    profile: probe.profile,
    uid: profileUid || uid,
    ltoken: exchange.ltoken,
    cookieToken: exchange.cookieToken,
  }
}
