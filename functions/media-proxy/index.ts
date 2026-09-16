const ALLOWED_HOSTS = new Set([
  'zvqzicimowfqshgjsrri.supabase.co',
  'y.gtimg.cn',
  'p1.music.126.net',
  'p2.music.126.net',
  'p3.music.126.net',
  'p4.music.126.net'
])

const CACHE_TTL_SECONDS = 60 * 60 * 24 * 30

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

  if (target.protocol !== 'https:' || !ALLOWED_HOSTS.has(target.hostname)) {
    return new Response('Host not allowed', { status: 403 })
  }

  const cache = caches.default
  const cacheKey = new Request(target.toString(), { method: 'GET' })
  const cached = await cache.match(cacheKey)
  if (cached) {
    return new Response(cached.body, {
      status: cached.status,
      statusText: cached.statusText,
      headers: cached.headers
    })
  }

  try {
    const upstream = await fetch(target.toString(), {
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      },
      cf: { cacheTtl: CACHE_TTL_SECONDS, cacheEverything: true }
    })

    if (!upstream.ok) {
      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText
      })
    }

    const headers = new Headers(upstream.headers)
    headers.set('access-control-allow-origin', '*')
    headers.set('cache-control', `public, max-age=${CACHE_TTL_SECONDS}, immutable`)
    headers.delete('content-encoding')

    const response = new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers
    })

    context.waitUntil(cache.put(cacheKey, response.clone()))
    return response
  } catch {
    return new Response('Image proxy error', { status: 502 })
  }
}
