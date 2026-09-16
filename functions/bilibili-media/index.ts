const MEDIA_HOST_RE = /(^|\.)(bilivideo\.(com|cn)|mountaintoys\.cn)$/i
const PRIVATE_HOST_RE =
  /^(localhost|127\.|0\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\])/i

export async function onRequest(context) {
  const { request } = context
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204 })
  }

  const url = new URL(request.url)
  const targetParam = url.searchParams.get('url')
  if (!targetParam) {
    return new Response('Missing url', { status: 400 })
  }

  let target
  try {
    target = new URL(targetParam)
  } catch {
    return new Response('Invalid url', { status: 400 })
  }

  if (
    target.protocol !== 'https:' ||
    PRIVATE_HOST_RE.test(target.hostname) ||
    !MEDIA_HOST_RE.test(target.hostname)
  ) {
    return new Response('Invalid Bilibili media URL', { status: 400 })
  }

  const headers = new Headers()
  headers.set('Referer', 'https://www.bilibili.com/')
  headers.set('User-Agent', String(request.headers.get('user-agent') || 'Mozilla/5.0'))
  const range = request.headers.get('range')
  if (range) headers.set('Range', range)

  try {
    const upstream = await fetch(target.toString(), {
      method: 'GET',
      headers,
      redirect: 'follow'
    })

    const responseHeaders = new Headers()
    for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
      const value = upstream.headers.get(name)
      if (value) responseHeaders.set(name, value)
    }
    responseHeaders.set('access-control-allow-origin', '*')

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders
    })
  } catch {
    return new Response('Bilibili media proxy failed', { status: 502 })
  }
}
