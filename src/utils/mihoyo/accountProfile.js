import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { fetchWithPlatformBridge } from '@/utils/platform/http'
import { isMihoyoAuthHttpStatus, isMihoyoAuthRetcode } from '@/utils/mihoyo/authError'

/**
 * 米游铺用户信息。
 * GET https://api-mall.mihoyogift.com/common/homeishop/v1/user/info
 * → { retcode:0, data:{ uid, nickname, avatar_url, ... } }
 */
const USER_INFO = {
  base: 'https://api-mall.mihoyogift.com',
  path: '/common/homeishop/v1/user/info',
  proxy: '/mihoyo-api'
}

/** 解析 user/info 响应 → { nickname, avatarUrl, uid }；无效返回 null */
export function pickProfile(json) {
  const data = json?.data && typeof json.data === 'object' ? json.data : json
  const userInfo = data?.user_info || data?.userInfo || data
  const nickname = String(
    userInfo?.nickname ||
    userInfo?.nick_name ||
    userInfo?.name ||
    ''
  ).trim()
  const avatar = String(
    userInfo?.avatar_url ||
    userInfo?.avatarUrl ||
    userInfo?.avatar ||
    ''
  ).trim()
  const uid = String(userInfo?.uid || userInfo?.user_id || userInfo?.userId || '').trim()
  if (!nickname && !avatar && !uid) return null
  return { nickname, avatarUrl: avatar, uid }
}

async function requestJson(url, proxyBase, path, cookie) {
  const headers = {
    Cookie: cookie,
    Referer: 'https://mihoyogift.com/',
    'x-rpc-language': 'zh-cn',
    'x-rpc-client_type': '5',
  }

  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.request({
      url,
      method: 'GET',
      headers,
      connectTimeout: 8000,
      readTimeout: 8000,
    })
    if (Number(res.status) >= 400) {
      const error = new Error(`请求失败（${res.status}）`)
      error.status = Number(res.status)
      throw error
    }
    return typeof res.data === 'string' ? JSON.parse(res.data) : (res.data || {})
  }

  const webHeaders = { ...headers }
  webHeaders['x-cookie-forward'] = encodeURIComponent(cookie)
  delete webHeaders.Cookie

  const res = await fetchWithPlatformBridge(`${proxyBase}${path}`, {
    method: 'GET',
    headers: webHeaders,
    timeoutMs: 8000,
  })
  if (!res.ok) {
    const error = new Error(`请求失败（${res.status}）`)
    error.status = Number(res.status)
    throw error
  }
  return res.json()
}

/**
 * 用 Cookie 读取米游社用户资料（昵称/头像）。
 * @param {string} cookie
 * @returns {Promise<{ nickname: string, avatarUrl: string, uid: string }>}
 */
export async function fetchMihoyoAccountProfile(cookie) {
  const value = String(cookie || '').trim()
  if (!value) return { nickname: '', avatarUrl: '', uid: '' }

  try {
    const json = await requestJson(
      `${USER_INFO.base}${USER_INFO.path}`,
      USER_INFO.proxy,
      USER_INFO.path,
      value
    )
    if (json && json.retcode != null && Number(json.retcode) !== 0) {
      return { nickname: '', avatarUrl: '', uid: '' }
    }
    return pickProfile(json) || { nickname: '', avatarUrl: '', uid: '' }
  } catch {
    return { nickname: '', avatarUrl: '', uid: '' }
  }
}

/**
 * 严格校验 Cookie：返回完整结果，供 stoken 刷新流程判断是否允许替换旧 Cookie。
 * 网络/代理失败归为 transient，只有明确鉴权错误才归为 auth。
 * @param {string} cookie
 * @returns {Promise<{ ok: boolean, kind: 'auth'|'transient'|'invalid', retcode: number|null, message: string, profile: object|null }>}
 */
export async function probeMihoyoUserInfo(cookie) {
  const value = String(cookie || '').trim()
  if (!value) {
    return { ok: false, kind: 'auth', retcode: null, message: 'empty cookie', profile: null }
  }

  try {
    const json = await requestJson(
      `${USER_INFO.base}${USER_INFO.path}`,
      USER_INFO.proxy,
      USER_INFO.path,
      value
    )
    const retcode = json?.retcode == null ? null : Number(json.retcode)
    if (retcode != null && retcode !== 0) {
      return {
        ok: false,
        kind: isMihoyoAuthRetcode(retcode) ? 'auth' : 'transient',
        retcode,
        message: String(json?.message || ''),
        profile: null,
      }
    }

    const profile = pickProfile(json)
    if (!profile) {
      return {
        ok: false,
        kind: 'invalid',
        retcode,
        message: 'user/info 返回为空',
        profile: null,
      }
    }
    return { ok: true, kind: 'ok', retcode, message: '', profile }
  } catch (error) {
    return {
      ok: false,
      kind: isMihoyoAuthHttpStatus(error?.status) ? 'auth' : 'transient',
      retcode: null,
      message: String(error?.message || error || '网络请求失败'),
      profile: null,
    }
  }
}

/** 仅取昵称 */
export async function fetchMihoyoAccountNickname(cookie) {
  const profile = await fetchMihoyoAccountProfile(cookie)
  return profile.nickname
}
