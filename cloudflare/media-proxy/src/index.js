// Cloudflare Worker：Supabase Storage 资源边缘缓存代理（图片、视频、OTA 更新包）
// 部署：npx wrangler deploy
// 用法：
//   https://<worker>/goods-images/xxx.jpg
//     → https://zvqzicimowfqshgjsrri.supabase.co/storage/v1/object/public/goods-images/xxx.jpg
//   https://<worker>/?url=<encoded absolute https url>
//     → 仅允许白名单 host（见 ALLOWED_HOSTS）

const SUPABASE_ORIGIN = 'https://zvqzicimowfqshgjsrri.supabase.co'
const STORAGE_PREFIX = '/storage/v1/object/public'

const ALLOWED_HOSTS = new Set([
  'zvqzicimowfqshgjsrri.supabase.co'
])

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,HEAD,OPTIONS',
  'access-control-allow-headers': '*'
}

function jsonError(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...CORS_HEADERS,
      'cache-control': 'no-store'
    }
  })
}

function resolveTarget(url) {
  // 模式 1：/?url=https%3A%2F%2F...
  const q = url.searchParams.get('url')
  if (q) {
    let parsed
    try {
      parsed = new URL(q)
    } catch {
      return null
    }
    if (parsed.protocol !== 'https:') return null
    if (!ALLOWED_HOSTS.has(parsed.hostname)) return null
    return parsed.toString()
  }

  // 模式 2：/goods-images/xxx.jpg → Supabase public storage
  const path = url.pathname.replace(/^\/+/, '')
  if (!path || path.includes('..')) return null
  return `${SUPABASE_ORIGIN}${STORAGE_PREFIX}/${path}`
}

function withCors(headers) {
  const h = new Headers(headers)
  for (const [k, v] of Object.entries(CORS_HEADERS)) h.set(k, v)
  return h
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return jsonError(405, 'method not allowed')
    }

    // 健康检查
    if (url.pathname === '/' && !url.searchParams.get('url')) {
      return new Response('ok', {
        headers: { 'content-type': 'text/plain', ...CORS_HEADERS, 'cache-control': 'no-store' }
      })
    }

    // 1x1 PNG 演示缓存（仅用于验证 edge cache，可随时删）
    if (url.pathname === '/__demo.png') {
      const png = Uint8Array.from(atob(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
      ), (c) => c.charCodeAt(0))
      const demo = new Response(png, {
        headers: {
          'content-type': 'image/png',
          'cache-control': 'public, max-age=60',
          'content-length': String(png.length),
          ...CORS_HEADERS
        }
      })
      // 与其它 GET 相同：走 cache.match / waitUntil put
      const cache = caches.default
      const demoKey = new Request(new URL('/__demo.png', url).toString(), { method: 'GET' })
      const hit = await cache.match(demoKey)
      if (hit) {
        const h = withCors(hit.headers)
        h.set('x-cache', 'HIT')
        return new Response(hit.body, { status: hit.status, headers: h })
      }
      const headers = withCors(demo.headers)
      headers.set('x-cache', 'MISS')
      const toCache = demo.clone()
      ctx.waitUntil(cache.put(demoKey, toCache))
      return new Response(demo.body, { status: 200, headers })
    }

    const target = resolveTarget(url)
    if (!target) return jsonError(400, 'invalid storage path')

    const cache = caches.default
    const cacheKey = new Request(target, { method: 'GET' })

    const cached = await cache.match(cacheKey)
    if (cached) {
      const headers = withCors(cached.headers)
      headers.set('x-cache', 'HIT')
      return new Response(cached.body, {
        status: cached.status,
        headers
      })
    }

    let upstream
    try {
      upstream = await fetch(target, {
        method: 'GET',
        redirect: 'follow',
        headers: {
          'user-agent': request.headers.get('user-agent') || 'cf-media-proxy',
          accept: request.headers.get('accept') || 'image/*,*/*'
        }
      })
    } catch {
      return jsonError(502, 'upstream fetch failed')
    }

    const contentType = upstream.headers.get('content-type') || ''
    const isOtaAsset = url.pathname.startsWith('/ota-releases/')
    const cacheable =
      upstream.ok &&
      (contentType.startsWith('image/') ||
        contentType.startsWith('video/') ||
        contentType === 'application/octet-stream' ||
        contentType === 'application/zip' ||
        contentType === 'application/vnd.android.package-archive' ||
        isOtaAsset)

    const headers = withCors(upstream.headers)
    if (cacheable) {
      if (isOtaAsset) {
        // OTA 路径按版本命名，发布后内容不会变，适合长期边缘缓存。
        headers.set('cache-control', 'public, max-age=31536000, immutable')
      } else if (!headers.has('cache-control')) {
        headers.set('cache-control', 'public, max-age=31536000, immutable')
      }
      headers.set('x-cache', 'MISS')
      // clone 一份给 Cache API，避免消费掉返回给客户端的 body
      const toCache = upstream.clone()
      ctx.waitUntil(
        cache.put(
          cacheKey,
          new Response(toCache.body, {
            status: toCache.status,
            headers: toCache.headers
          })
        )
      )
    } else {
      headers.set('x-cache', 'BYPASS')
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers
    })
  }
}
