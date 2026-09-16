const TARGET_ORIGIN = 'https://api.bilibili.com'
const REFERER = 'https://www.bilibili.com/'
const USER_AGENT =
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36'

export async function onRequest(context) {
  const { request } = context
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204 })
  }

  const url = new URL(request.url)
  const path = url.pathname.replace(/^\/bilibili-api/, '') || '/'
  const target = new URL(path + url.search, TARGET_ORIGIN)

  const headers = new Headers()
  headers.set('Referer', REFERER)
  headers.set('Origin', 'https://www.bilibili.com')
  headers.set('User-Agent', USER_AGENT)
  headers.set('Accept', '*/*')

  try {
    const upstream = await fetch(target.toString(), {
      method: request.method,
      headers,
      redirect: 'follow'
    })
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
