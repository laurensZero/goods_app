/**
 * 米游铺通行证网页扫码登录
 *
 * 官方接口：
 *   POST /account/ma-cn-passport/web/createQRLogin
 *   POST /account/ma-cn-passport/web/queryQRLoginStatus
 * Confirmed 时会话在 Set-Cookie（cookie_token_v2 / ltoken_v2 等），JSON tokens 为空。
 * 浏览器 CORS 仅放行 user.mihoyogift.com，网页端必须经 /mihoyo-passport 代理。
 * 代理会把 Set-Cookie 写入响应体 data.mihoyo_set_cookie（及响应头 x-mihoyo-set-cookie）。
 */
import { Capacitor, CapacitorHttp } from '@capacitor/core'
import {
  buildMihoyoCookieFromPairs,
  extractMihoyoCookieFromQrPayload,
  parseSetCookiePairs,
  validateQrCookie,
} from '@/utils/mihoyo/qrLoginCookie'

export {
  buildMihoyoCookieFromPairs,
  parseSetCookiePairs,
  validateQrCookie,
}

export const MIHOYO_PASSPORT_BASE = 'https://passport-api.mihoyogift.com'
export const MIHOYO_PASSPORT_PROXY = '/mihoyo-passport'
const CREATE_PATH = '/account/ma-cn-passport/web/createQRLogin'
const QUERY_PATH = '/account/ma-cn-passport/web/queryQRLoginStatus'

export function createMihoyoDeviceId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/** 贴近官方网页客户端特征，降低被识别为第三方工具的概率 */
function buildWebDeviceProfile() {
  const ua = String(globalThis.navigator?.userAgent || '')
  const platform = String(globalThis.navigator?.platform || '')

  let deviceName = 'Chrome'
  let deviceModel = 'Chrome'
  let deviceOs = 'Windows'

  if (ua) {
    if (/Edg\//i.test(ua)) deviceName = 'Edge'
    else if (/Firefox\//i.test(ua)) deviceName = 'Firefox'
    else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) deviceName = 'Safari'
    else if (/Chrome\//i.test(ua)) deviceName = 'Chrome'

    const chrome = ua.match(/Chrome\/([\d.]+)/i)
    const firefox = ua.match(/Firefox\/([\d.]+)/i)
    const edge = ua.match(/Edg\/([\d.]+)/i)
    const safari = ua.match(/Version\/([\d.]+)/i)
    const version = edge?.[1] || chrome?.[1] || firefox?.[1] || safari?.[1]
    deviceModel = version ? `${deviceName} ${version}` : deviceName

    if (/Windows NT/i.test(ua)) deviceOs = 'Windows'
    else if (/Android/i.test(ua)) deviceOs = 'Android'
    else if (/iPhone|iPad|iPod/i.test(ua)) deviceOs = 'iOS'
    else if (/Mac OS X/i.test(ua)) deviceOs = 'macOS'
    else if (/Linux/i.test(ua)) deviceOs = 'Linux'
    else if (platform) deviceOs = platform
  } else if (platform) {
    deviceOs = platform
  }

  return { deviceName, deviceModel, deviceOs }
}

function buildPassportHeaders(deviceId) {
  const id = String(deviceId || '').trim() || createMihoyoDeviceId()
  const { deviceName, deviceModel, deviceOs } = buildWebDeviceProfile()
  return {
    'Content-Type': 'application/json',
    'x-rpc-app_id': 'cll1n7kjjwu8',
    'x-rpc-client_type': '4',
    'x-rpc-game_biz': 'mall_cn',
    'x-rpc-device_id': id,
    'x-rpc-device_fp': id.replace(/-/g, '').slice(0, 13),
    'x-rpc-device_name': deviceName,
    'x-rpc-device_model': encodeURIComponent(deviceModel),
    'x-rpc-device_os': encodeURIComponent(deviceOs),
    'x-rpc-sdk_version': '2.57.0',
  }
}

function safeJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}

/**
 * 从响应头装配 Cookie。
 * 注意：fetch 的 res.headers 是 Headers 实例，必须用 .get()，
 * Object.entries(Headers) 永远是空数组。
 */
function extractCookieFromHeaders(headers) {
  if (!headers || typeof headers !== 'object') return ''

  if (typeof headers.get === 'function') {
    const forwarded = headers.get('x-mihoyo-set-cookie')
    if (forwarded) {
      return buildMihoyoCookieFromPairs(parseSetCookiePairs(forwarded))
    }
    const setCookie = headers.get('set-cookie')
    if (setCookie) {
      return buildMihoyoCookieFromPairs(parseSetCookiePairs(setCookie))
    }
    return ''
  }

  const lower = {}
  for (const [key, value] of Object.entries(headers)) {
    lower[String(key).toLowerCase()] = value
  }
  const forwarded = lower['x-mihoyo-set-cookie']
  if (forwarded) {
    return buildMihoyoCookieFromPairs(parseSetCookiePairs(forwarded))
  }
  const setCookie = lower['set-cookie']
  if (setCookie) {
    return buildMihoyoCookieFromPairs(parseSetCookiePairs(setCookie))
  }
  return ''
}

async function postPassport(path, data, headers) {
  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.request({
      url: `${MIHOYO_PASSPORT_BASE}${path}`,
      method: 'POST',
      headers: {
        Origin: 'https://user.mihoyogift.com',
        Referer: 'https://user.mihoyogift.com/',
        ...headers,
      },
      data,
    })
    const body = typeof res.data === 'string' ? safeJson(res.data) : (res.data || {})
    return {
      json: body,
      cookie: extractMihoyoCookieFromQrPayload(body, res.headers) || extractCookieFromHeaders(res.headers),
    }
  }

  const res = await fetch(`${MIHOYO_PASSPORT_PROXY}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  })
  const json = await res.json()
  return {
    json,
    cookie: extractMihoyoCookieFromQrPayload(json, res.headers) || extractCookieFromHeaders(res.headers),
  }
}

/**
 * 创建扫码登录
 * @returns {Promise<{ticket: string, url: string, deviceId: string}>}
 */
export async function createMihoyoQrLogin() {
  const deviceId = createMihoyoDeviceId()
  const { json } = await postPassport(
    CREATE_PATH,
    { device: deviceId },
    buildPassportHeaders(deviceId),
  )
  if (Number(json?.retcode) !== 0 || !json?.data?.ticket || !json?.data?.url) {
    throw new Error(json?.message || `创建扫码登录失败（${json?.retcode ?? 'unknown'}）`)
  }
  return {
    ticket: String(json.data.ticket),
    url: String(json.data.url),
    deviceId,
  }
}

/**
 * 轮询扫码状态
 * @returns {Promise<{status: string, cookie: string, userInfo: object|null}>}
 * status: Init | Scanned | Confirmed | Canceled | Expired | unknown
 */
export async function queryMihoyoQrLoginStatus(ticket, deviceId) {
  const value = String(ticket || '').trim()
  if (!value) throw new Error('missing ticket')
  const { json, cookie } = await postPassport(
    QUERY_PATH,
    { ticket: value },
    buildPassportHeaders(deviceId),
  )
  const data = json?.data || null
  const status = String(data?.status || '').trim()
  return {
    status,
    cookie,
    userInfo: data?.user_info || null,
    retcode: json?.retcode,
    message: json?.message || '',
  }
}

export function isQrLoginConfirmed(status) {
  return String(status || '').toLowerCase() === 'confirmed'
}

export function isQrLoginTerminalFailure(status) {
  const s = String(status || '').toLowerCase()
  return s === 'canceled' || s === 'expired' || s === 'stopped' || s === 'timeout'
}
