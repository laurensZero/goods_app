const TARGET_ORIGIN = 'https://sdk-webstatic.mihoyo.com'

export async function onRequest(context) {
  const { request } = context
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204 })
  }

  const url = new URL(request.url)
  const path = url.pathname.replace(/^\/mihoyo-static/, '') || '/'
  const target = new URL(path + url.search, TARGET_ORIGIN)

  try {
    const upstream = await fetch(target.toString(), {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      },
      redirect: 'follow',
      cf: { cacheTtl: 86400, cacheEverything: true }
    })

    const headers = new Headers()
    for (const name of ['content-type', 'content-length', 'cache-control', 'etag']) {
      const value = upstream.headers.get(name)
      if (value) headers.set(name, value)
    }
    headers.set('access-control-allow-origin', '*')
    if (!headers.get('cache-control')) {
      headers.set('cache-control', 'public, max-age=86400')
    }

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers
    })
  } catch {
    return new Response('Static proxy error', { status: 502 })
  }
}
