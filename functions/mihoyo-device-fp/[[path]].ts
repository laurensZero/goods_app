// 设备指纹签发代理：public-data-api.mihoyo.com 的 CORS 仅放行米哈游自家 origin，
// web 端借道 Pages Function 转发 /mihoyo-device-fp/device-fp/api/getFp。
// 纯透传，无鉴权与 Cookie 处理（getFp 不需要登录态）。

const TARGET_ORIGIN = 'https://public-data-api.mihoyo.com'

export async function onRequest(context: any) {
  const { request } = context
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204 })
  }

  const url = new URL(request.url)
  const path = url.pathname.replace(/^\/mihoyo-device-fp/, '') || '/'
  const target = new URL(path + url.search, TARGET_ORIGIN)

  const headers = new Headers()
  headers.set('Content-Type', 'application/json;charset=UTF-8')

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: 'follow'
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body
    // @ts-expect-error duplex 为流式请求体所需的非标准属性
    init.duplex = 'half'
  }

  try {
    const upstream = await fetch(target.toString(), init)
    const responseHeaders = new Headers()
    const contentTypeOut = upstream.headers.get('content-type')
    if (contentTypeOut) responseHeaders.set('content-type', contentTypeOut)
    responseHeaders.set('access-control-allow-origin', '*')
    responseHeaders.set('cache-control', 'no-store')

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders
    })
  } catch {
    return new Response(JSON.stringify({ message: 'device-fp proxy error' }), {
      status: 502,
      headers: { 'content-type': 'application/json;charset=utf-8' }
    })
  }
}
