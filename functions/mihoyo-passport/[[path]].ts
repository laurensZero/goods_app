/**
 * Cloudflare Pages Function: 米游铺通行证扫码登录代理
 *
 * 生产网页版与开发 Vite 代理同路径 /mihoyo-passport/*。
 * Confirmed 时上游 Set-Cookie（HttpOnly）写入 JSON body data.mihoyo_set_cookie，
 * 供前端 qrLogin 读取（浏览器 JS 读不到跨域 Set-Cookie）。
 *
 * 仅放行扫码登录两个接口，避免做成开放代理。
 */

const TARGET_ORIGIN = 'https://passport-api.mihoyogift.com'
const PREFIX = '/mihoyo-passport'
const ALLOWED_PATHS = new Set([
  '/account/ma-cn-passport/web/createQRLogin',
  '/account/ma-cn-passport/web/queryQRLoginStatus',
])

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

function corsHeaders(origin) {
  return {
    'access-control-allow-origin': origin || '*',
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers':
      'content-type,x-rpc-app_id,x-rpc-client_type,x-rpc-game_biz,x-rpc-device_id,x-rpc-device_fp,x-rpc-device_name,x-rpc-device_model,x-rpc-device_os,x-rpc-sdk_version,x-rpc-lifecycle_id,x-rpc-mi_referrer',
    'access-control-allow-methods': 'POST,OPTIONS',
    'access-control-expose-headers': 'X-Mihoyo-Set-Cookie,X-Rpc-Aigis,X-Trace-Id',
    'access-control-max-age': '86400',
  }
}

function readSetCookies(headers) {
  if (typeof headers.getSetCookie === 'function') {
    try {
      return headers.getSetCookie()
    } catch {
      // fall through
    }
  }
  const single = headers.get('set-cookie')
  return single ? [single] : []
}

function parseSetCookiePairs(input) {
  const raw = Array.isArray(input)
    ? input.map((item) => String(item || '')).join('\n')
    : String(input || '').trim()
  if (!raw) return []

  const segments = raw
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
      if (AUTH_COOKIE_KEYS.has(name)) {
        pairs.push(`${name}=${value}`)
      }
    }
  }
  return pairs
}

export async function onRequest(context) {
  const { request } = context
  const origin = request.headers.get('origin') || ''
  const cors = corsHeaders(origin)

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors })
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ retcode: -1, message: 'Method not allowed' }), {
      status: 405,
      headers: { ...cors, 'content-type': 'application/json;charset=utf-8', 'cache-control': 'no-store' },
    })
  }

  const url = new URL(request.url)
  const path = url.pathname.replace(/^\/mihoyo-passport/, '') || '/'
  if (!ALLOWED_PATHS.has(path)) {
    return new Response(JSON.stringify({ retcode: -1, message: 'Path not allowed' }), {
      status: 403,
      headers: { ...cors, 'content-type': 'application/json;charset=utf-8', 'cache-control': 'no-store' },
    })
  }

  const target = new URL(path + url.search, TARGET_ORIGIN)
  const headers = new Headers()
  headers.set('Accept', 'application/json, text/plain, */*')
  headers.set('Accept-Language', 'zh-CN,zh;q=0.9')
  headers.set('Origin', 'https://user.mihoyogift.com')
  headers.set('Referer', 'https://user.mihoyogift.com/')

  const contentType = request.headers.get('content-type')
  if (contentType) headers.set('Content-Type', contentType)

  const rpcHeaders = [
    'x-rpc-app_id',
    'x-rpc-client_type',
    'x-rpc-game_biz',
    'x-rpc-device_id',
    'x-rpc-device_fp',
    'x-rpc-device_name',
    'x-rpc-device_model',
    'x-rpc-device_os',
    'x-rpc-sdk_version',
    'x-rpc-lifecycle_id',
    'x-rpc-mi_referrer',
  ]
  for (const name of rpcHeaders) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }
  if (!headers.get('x-rpc-app_id')) headers.set('x-rpc-app_id', 'cll1n7kjjwu8')
  if (!headers.get('x-rpc-client_type')) headers.set('x-rpc-client_type', '4')
  if (!headers.get('x-rpc-game_biz')) headers.set('x-rpc-game_biz', 'mall_cn')

  try {
    const bodyText = await request.text()
    const upstream = await fetch(target.toString(), {
      method: 'POST',
      headers,
      body: bodyText || '{}',
      redirect: 'follow',
    })

    const setCookies = readSetCookies(upstream.headers)
    const cookieStr = parseSetCookiePairs(setCookies).join('; ')

    let bodyTextOut = await upstream.text()
    if (cookieStr) {
      try {
        const json = JSON.parse(bodyTextOut)
        if (json && typeof json === 'object') {
          if (json.data && typeof json.data === 'object') {
            json.data.mihoyo_set_cookie = cookieStr
          } else {
            json.mihoyo_set_cookie = cookieStr
          }
          bodyTextOut = JSON.stringify(json)
        }
      } catch {
        // keep original body
      }
    }

    const responseHeaders = new Headers(cors)
    responseHeaders.set('content-type', 'application/json;charset=utf-8')
    responseHeaders.set('cache-control', 'no-store')
    if (cookieStr) {
      responseHeaders.set('x-mihoyo-set-cookie', encodeURIComponent(cookieStr))
    }

    return new Response(bodyTextOut, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    })
  } catch {
    return new Response(JSON.stringify({ retcode: -1, message: 'MiHoYo passport proxy error' }), {
      status: 502,
      headers: { ...cors, 'content-type': 'application/json;charset=utf-8', 'cache-control': 'no-store' },
    })
  }
}
