const TARGET_ORIGIN = 'https://api-mall.mihoyogift.com'

export async function onRequest(context) {
  const { request } = context
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204 })
  }

  const url = new URL(request.url)
  const path = url.pathname.replace(/^\/mihoyo-api/, '') || '/'
  const target = new URL(path + url.search, TARGET_ORIGIN)

  const headers = new Headers()
  headers.set('Accept', 'application/json, text/plain, */*')
  headers.set('Accept-Language', 'zh-CN,zh;q=0.9')

  // 浏览器禁止 JS 设置 Cookie；业务侧用 x-cookie-forward，这里转回真正的 Cookie
  const forwardedCookie = request.headers.get('x-cookie-forward')
  if (forwardedCookie) {
    try {
      headers.set('Cookie', decodeURIComponent(forwardedCookie))
    } catch {
      headers.set('Cookie', forwardedCookie)
    }
  }

  const contentType = request.headers.get('content-type')
  if (contentType) headers.set('Content-Type', contentType)

  // 积分商城列表要求移动端请求特征
  if (path.includes('/common/hm_app/v1/goods/point_goods_list')) {
    headers.set(
      'User-Agent',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'
    )
    headers.set('Referer', 'https://mihoyogift.com/m/point')
  } else {
    headers.set(
      'User-Agent',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'
    )
  }

  const init = {
    method: request.method,
    headers,
    redirect: 'follow'
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body
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
    return new Response(JSON.stringify({ message: 'MiHoYo proxy error' }), {
      status: 502,
      headers: { 'content-type': 'application/json;charset=utf-8' }
    })
  }
}
