/**
 * Cloudflare Pages Function: 米游社 Passport（passport-api.mihoyo.com）代理
 *
 * stoken 换票通道：ma-cn-session/app/exchange（2026-11-20 改版后唯一可用）+
 * 两个旧 GET 换票接口（兜底）。生产网页端此前没有这个反代（只有 Vite dev 代理），
 * stoken 刷新在部署版网页上必然 proxy-unavailable，这里补齐。
 * 浏览器禁止设置 UA/Referer，由本函数按路径补齐（exchange 用 okhttp UA）。
 */

const TARGET_ORIGIN = 'https://passport-api.mihoyo.com'
const PREFIX = '/mihoyo-account-passport'

const EXCHANGE_PATH = '/account/ma-cn-session/app/exchange'
const LEGACY_GET_PATHS = new Set([
  '/account/auth/api/getCookieAccountInfoBySToken',
  '/account/auth/api/getLTokenBySToken',
])

const BBS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) miHoYoBBS/2.106.2'
const OKHTTP_UA = 'okhttp/4.9.3'

const RPC_HEADERS = [
  'x-rpc-app_id',
  'x-rpc-client_type',
  'x-rpc-device_id',
  'x-rpc-device_fp',
  'x-rpc-device_name',
  'x-rpc-device_model',
  'x-rpc-device_os',
  'x-rpc-sys_version',
  'x-rpc-game_biz',
  'x-rpc-app_version',
  'x-rpc-sdk_version',
  'x-rpc-account_version',
  'x-rpc-aigis',
]

function corsHeaders(origin) {
  return {
    'access-control-allow-origin': origin || '*',
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers':
      'content-type,x-cookie-forward,ds,x-rpc-app_id,x-rpc-client_type,x-rpc-device_id,x-rpc-device_fp,x-rpc-device_name,x-rpc-device_model,x-rpc-device_os,x-rpc-sys_version,x-rpc-game_biz,x-rpc-app_version,x-rpc-sdk_version,x-rpc-account_version,x-rpc-aigis',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-max-age': '86400',
  }
}

export async function onRequest(context) {
  const { request } = context
  const origin = request.headers.get('origin') || ''
  const cors = corsHeaders(origin)

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors })
  }
  if (!['GET', 'POST'].includes(request.method)) {
    return new Response(JSON.stringify({ retcode: -1, message: 'Method not allowed' }), {
      status: 405,
      headers: { ...cors, 'content-type': 'application/json;charset=utf-8', 'cache-control': 'no-store' },
    })
  }

  const url = new URL(request.url)
  const path = url.pathname.replace(/^\/mihoyo-account-passport/, '') || '/'
  const isExchange = request.method === 'POST' && path === EXCHANGE_PATH
  const isLegacyGet = request.method === 'GET' && LEGACY_GET_PATHS.has(path)
  if (!isExchange && !isLegacyGet) {
    return new Response(JSON.stringify({ retcode: -1, message: 'Path not allowed' }), {
      status: 403,
      headers: { ...cors, 'content-type': 'application/json;charset=utf-8', 'cache-control': 'no-store' },
    })
  }

  const target = new URL(path + url.search, TARGET_ORIGIN)
  const headers = new Headers()
  headers.set('Accept', 'application/json')
  // UA 按路径补齐：exchange 是 passport SDK（okhttp），旧 GET 是米游社 BBS 包
  headers.set('User-Agent', isExchange ? OKHTTP_UA : BBS_UA)
  if (!isExchange) {
    headers.set('Referer', 'https://webstatic.mihoyo.com')
  }

  // 旧 GET 接口需要登录态 Cookie：浏览器用 x-cookie-forward 转发
  const forwardedCookie = request.headers.get('x-cookie-forward') || ''
  if (forwardedCookie) {
    try {
      headers.set('Cookie', decodeURIComponent(forwardedCookie))
    } catch {
      headers.set('Cookie', forwardedCookie)
    }
  }

  const contentType = request.headers.get('content-type')
  if (contentType) headers.set('Content-Type', contentType)
  headers.set('DS', request.headers.get('ds') || request.headers.get('DS') || '')
  for (const name of RPC_HEADERS) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }

  try {
    const bodyText = request.method === 'POST' ? await request.text() : ''
    const upstream = await fetch(target.toString(), {
      method: request.method,
      headers,
      ...(request.method === 'POST' ? { body: bodyText || '{}' } : {}),
    })
    const text = await upstream.text()
    return new Response(text, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: {
        ...cors,
        'content-type': 'application/json;charset=utf-8',
        'cache-control': 'no-store',
      },
    })
  } catch {
    return new Response(JSON.stringify({ retcode: -1, message: 'MiHoYo passport proxy error' }), {
      status: 502,
      headers: { ...cors, 'content-type': 'application/json;charset=utf-8', 'cache-control': 'no-store' },
    })
  }
}
