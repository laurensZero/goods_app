// src/utils/auth/authDeepLink.js
// 邮件验证回调：构建/解析 goodsapp://auth/* 深链

export const AUTH_DEEP_LINK_PREFIX = 'goodsapp://auth/'

/**
 * App 内注册后，邮件验证落地页用于拉起 App 的深链。
 * @param {{accessToken:string,refreshToken?:string,expiresIn?:string|number,tokenType?:string}} session
 * @returns {string}
 */
export function buildAuthCallbackDeepLink(session = {}) {
  const params = new URLSearchParams({
    access_token: session.accessToken || '',
    refresh_token: session.refreshToken || '',
    expires_in: String(session.expiresIn || 3600),
    token_type: session.tokenType || 'bearer'
  })
  return `${AUTH_DEEP_LINK_PREFIX}callback?${params.toString()}`
}

/**
 * 网页版回退：把 token 交给主应用 handleAuthCallback（hash 形式）。
 * @param {{accessToken:string,refreshToken?:string,expiresIn?:string|number,tokenType?:string,type?:string}} session
 * @param {string} origin 例：https://goodsapp.de5.net
 * @returns {string}
 */
export function buildAuthWebFallbackUrl(session = {}, origin = '') {
  const base = String(origin || '').replace(/\/+$/, '')
  const params = new URLSearchParams({
    access_token: session.accessToken || '',
    refresh_token: session.refreshToken || '',
    expires_in: String(session.expiresIn || 3600),
    token_type: session.tokenType || 'bearer',
    type: session.type || 'signup'
  })
  return `${base}/#${params.toString()}`
}

/**
 * 解析 goodsapp://auth/callback?access_token=... 形式的深链。
 * @param {string} url
 * @returns {{accessToken:string,refreshToken:string,expiresIn:string,tokenType:string}|null}
 */
export function parseAuthCallbackDeepLink(url) {
  const raw = String(url || '').trim()
  if (!raw.toLowerCase().startsWith(AUTH_DEEP_LINK_PREFIX)) return null
  if (!raw.toLowerCase().startsWith(`${AUTH_DEEP_LINK_PREFIX}callback`)) return null

  const queryIndex = raw.indexOf('?')
  const query = new URLSearchParams(queryIndex >= 0 ? raw.slice(queryIndex + 1) : '')
  const accessToken = query.get('access_token') || ''
  if (!accessToken) return null

  return {
    accessToken,
    refreshToken: query.get('refresh_token') || '',
    expiresIn: query.get('expires_in') || '3600',
    tokenType: query.get('token_type') || 'bearer'
  }
}

/**
 * 从任意 URL（hash + query）提取邮件验证回调参数。
 * Supabase 一般把 token 放在 hash，redirect_to 自带的 src 可能在 search。
 * @param {string} [href]
 * @returns {{accessToken:string,refreshToken:string,expiresIn:string,tokenType:string,src:string,type:string}|null}
 */
export function parseAuthLandingParams(href = '') {
  let url
  try {
    url = new URL(href || 'https://example.com/', 'https://example.com/')
  } catch {
    return null
  }

  const search = new URLSearchParams(url.search.replace(/^\?/, ''))
  const hashRaw = url.hash.replace(/^#\/?/, '')
  const hash = new URLSearchParams(hashRaw)

  const pick = (key) => hash.get(key) || search.get(key) || ''
  const accessToken = pick('access_token')
  if (!accessToken) {
    return {
      accessToken: '',
      refreshToken: '',
      expiresIn: '',
      tokenType: '',
      src: search.get('src') || hash.get('src') || '',
      type: pick('type') || ''
    }
  }

  return {
    accessToken,
    refreshToken: pick('refresh_token'),
    expiresIn: pick('expires_in') || '3600',
    tokenType: pick('token_type') || 'bearer',
    src: search.get('src') || hash.get('src') || '',
    type: pick('type') || 'signup'
  }
}
