import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { fetchWithPlatformBridge } from '@/utils/platform/http'

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

/** 仅取昵称 */
export async function fetchMihoyoAccountNickname(cookie) {
  const profile = await fetchMihoyoAccountProfile(cookie)
  return profile.nickname
}
