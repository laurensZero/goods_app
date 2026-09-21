/**
 * 米游铺扫码 Cookie 装配（纯函数，不依赖 Capacitor，供 Vite 代理与前端共用）
 */

const AUTH_COOKIE_KEYS = new Set([
  'cookie_token_v2',
  'ltoken_v2',
  'account_id_v2',
  'account_mid_v2',
  'ltuid_v2',
  'ltmid_v2',
  'account_id',
  'ltuid',
  'account_mid',
  'ltmid',
  'cookie_token',
  'ltoken',
  'login_uid',
  'stuid',
  'stoken',
  'mid',
])

const SET_COOKIE_ATTR_KEYS = new Set([
  'path',
  'domain',
  'max-age',
  'expires',
  'httponly',
  'secure',
  'samesite',
  'priority',
  'version',
])

/** 从 Set-Cookie 列表 / Cookie 串解析 name=value（忽略 Path/Domain 等属性） */
export function parseSetCookiePairs(input) {
  const raw = Array.isArray(input)
    ? input.map((item) => String(item || '')).join('\n')
    : String(input || '').trim()
  if (!raw) return []

  let text = raw
  try {
    if (raw.includes('%')) text = decodeURIComponent(raw)
  } catch {
    text = raw
  }

  const segments = text
    .split(/\n|,(?=\s*[A-Za-z0-9_!#$%&'*+.^`|~-]+=)/)
    .map((chunk) => String(chunk || '').trim())
    .filter(Boolean)

  const pairs = []
  const seen = new Set()
  for (const segment of segments) {
    for (const rawPart of segment.split(';')) {
      const part = rawPart.trim()
      if (!part) continue
      const eq = part.indexOf('=')
      if (eq <= 0) continue
      const name = part.slice(0, eq).trim()
      const value = part.slice(eq + 1).trim()
      if (!name || value === '') continue
      if (SET_COOKIE_ATTR_KEYS.has(name.toLowerCase())) continue
      if (seen.has(name)) continue
      seen.add(name)
      pairs.push({ name, value })
    }
  }
  return pairs
}

/** 装配现有 validateMihoyoCookie 可识别的 Cookie 字符串 */
export function buildMihoyoCookieFromPairs(pairs) {
  const list = Array.isArray(pairs) && pairs.length && typeof pairs[0] === 'object' && pairs[0] !== null
    ? pairs
    : parseSetCookiePairs(pairs)
  const map = new Map()
  for (const item of list) {
    const name = String(item?.name || '').trim()
    const value = String(item?.value || '').trim()
    if (!name || !value) continue
    if (!AUTH_COOKIE_KEYS.has(name)) continue
    map.set(name, value)
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
}

/** 从 Node/Capacitor 的 headers 对象或 fetch Headers 实例装配 Cookie */
export function buildMihoyoCookieFromHeaders(headers) {
  if (!headers || typeof headers !== 'object') return ''

  // fetch 的 res.headers 是 Headers，必须用 .get()；Object.entries 会得到 []
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

/**
 * 从 queryQRLoginStatus 的 JSON 里取代理注入的 Cookie。
 * 代理会把 Confirmed 时的 Set-Cookie 写入 data.mihoyo_set_cookie（body 比响应头可靠）。
 */
export function extractMihoyoCookieFromQrPayload(json, headers) {
  const bodyCookie = json?.data?.mihoyo_set_cookie
    || json?.mihoyo_set_cookie
    || json?.data?.set_cookie
    || ''
  if (bodyCookie) {
    return buildMihoyoCookieFromPairs(parseSetCookiePairs(bodyCookie))
  }
  return buildMihoyoCookieFromHeaders(headers)
}

/** 校验扫码拿到的 Cookie；通过则返回规范化字符串，否则空串 */
export function validateQrCookie(cookieStr) {
  const value = String(cookieStr || '').trim()
  if (!value) return ''
  const pairs = parseSetCookiePairs(value)
  const map = new Map(pairs.map((p) => [p.name, p.value]))
  const hasUid = !!(map.get('account_id_v2') || map.get('ltuid_v2') || map.get('account_id') || map.get('ltuid'))
  const hasToken = !!(map.get('cookie_token_v2') || map.get('ltoken_v2') || map.get('ltoken') || map.get('cookie_token'))
  if (!hasUid || !hasToken) return ''
  return buildMihoyoCookieFromPairs(pairs)
}

/** Vite 代理：把上游 Set-Cookie 数组装配成业务 Cookie 串 */
export function assembleCookieFromSetCookieList(setCookies) {
  if (!Array.isArray(setCookies) || setCookies.length === 0) return ''
  return buildMihoyoCookieFromPairs(parseSetCookiePairs(setCookies))
}
