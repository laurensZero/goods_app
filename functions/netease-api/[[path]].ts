const TARGET_ORIGIN = 'https://music.163.com'
const REFERER = 'https://music.163.com/'
const USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'

export async function onRequest(context) {
  const { request } = context
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204 })
  }

  const url = new URL(request.url)
  const path = url.pathname.replace(/^\/netease-api/, '') || '/'
  const target = new URL(path + url.search, TARGET_ORIGIN)

  const headers = new Headers()
  headers.set('Referer', REFERER)
  headers.set('User-Agent', USER_AGENT)
  headers.set('Accept', '*/*')

  const contentType = request.headers.get('content-type')
  if (contentType) headers.set('Content-Type', contentType)

  const init = {
    method: request.method,
    headers,
    redirect: 'follow'
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body
    init.cf = { cacheTtl: 0 }
  }

  try {
    const upstream = await fetch(target.toString(), init)
    return passthrough(upstream)
  } catch {
    return new Response('Proxy upstream error', { status: 502 })
  }
}

function passthrough(upstream) {
  const headers = new Headers(upstream.headers)
  headers.delete('content-encoding')
  headers.delete('content-security-policy')
  headers.delete('x-frame-options')
  headers.set('access-control-allow-origin', '*')
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers
  })
}
