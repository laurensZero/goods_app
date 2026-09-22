// Cloudflare Worker：Supabase 数据面全量反代（与 VPS nginx 同级）
// 覆盖：表 REST（/rest）、Auth、Storage（图片公链 + ota-releases 更新包）、Functions、Realtime、GraphQL
// 部署：npx wrangler deploy
// 用法：把本 Worker 域名当作 Supabase URL 使用（路径原样透传）
//   https://<worker>/rest/v1/goods?select=*
//   https://<worker>/storage/v1/object/public/goods-images/a.jpg
//   https://<worker>/storage/v1/object/public/ota-releases/web/v1.2.3.zip

const SUPABASE_ORIGIN = 'https://zvqzicimowfqshgjsrri.supabase.co'
const SUPABASE_HOST = 'zvqzicimowfqshgjsrri.supabase.co'

// 与 scripts/vps 的 location 正则一致；根路径健康检查除外
const ALLOWED_PREFIXES = [
  '/rest/',
  '/auth/',
  '/storage/',
  '/functions/',
  '/realtime/',
  '/graphql/'
]

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS',
  'access-control-allow-headers': '*',
  'access-control-expose-headers': '*',
  'access-control-max-age': '86400'
}

function corsify(headers) {
  const h = new Headers(headers)
  for (const [k, v] of Object.entries(CORS_HEADERS)) h.set(k, v)
  return h
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

function isAllowedPath(pathname) {
  return ALLOWED_PREFIXES.some((p) => pathname === p.slice(0, -1) || pathname.startsWith(p))
}

function isPublicStorageGet(pathname, method) {
  return (method === 'GET' || method === 'HEAD') && pathname.startsWith('/storage/v1/object/public/')
}

/** OTA 路径按版本命名，发布后不变；其余公开对象给短 TTL，避免覆盖图长期脏缓存 */
function publicStorageCacheControl(pathname, upstreamHeaders) {
  if (pathname.startsWith('/storage/v1/object/public/ota-releases/')) {
    return 'public, max-age=31536000, immutable'
  }
  const existing = upstreamHeaders.get('cache-control')
  if (existing) return existing
  return 'public, max-age=3600'
}

function buildUpstreamRequest(request, url) {
  const target = new URL(url.pathname + url.search, SUPABASE_ORIGIN)
  const headers = new Headers(request.headers)
  // Supabase 按 Host/SNI 路由；fetch 会按 target 主机发送，这里显式对齐
  headers.set('Host', SUPABASE_HOST)
  // 去掉 hop-by-hop，避免透传失败
  for (const key of ['cf-connecting-ip', 'cf-ipcountry', 'cf-ray', 'cf-visitor', 'cdn-loop']) {
    headers.delete(key)
  }
  const init = {
    method: request.method,
    headers,
    redirect: 'manual'
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body
    // Workers 流式 body 需要 duplex
    init.duplex = 'half'
  }
  return { target, init }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    // 健康检查（探活用；业务探活走 /auth/v1/health）
    if (url.pathname === '/' && (request.method === 'GET' || request.method === 'HEAD')) {
      return new Response('ok', {
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          ...CORS_HEADERS,
          'cache-control': 'no-store'
        }
      })
    }

    if (!isAllowedPath(url.pathname)) {
      // 不回 HTML：避免 SPA 壳顶掉 API JSON
      return jsonError(404, 'not found')
    }

    // Realtime WebSocket：原样升级透传
    const upgrade = (request.headers.get('upgrade') || '').toLowerCase()
    if (upgrade === 'websocket') {
      const { target, init } = buildUpstreamRequest(request, url)
      try {
        return await fetch(target, init)
      } catch {
        return jsonError(502, 'upstream websocket failed')
      }
    }

    const cacheable = isPublicStorageGet(url.pathname, request.method)
    const cache = caches.default
    // 缓存 key 用 Worker URL，便于按路径失效/观察
    const cacheKey = new Request(url.toString(), { method: 'GET' })

    if (cacheable) {
      const hit = await cache.match(cacheKey)
      if (hit) {
        const headers = corsify(hit.headers)
        headers.set('x-cache', 'HIT')
        return new Response(request.method === 'HEAD' ? null : hit.body, {
          status: hit.status,
          headers
        })
      }
    }

    const { target, init } = buildUpstreamRequest(request, url)

    let upstream
    try {
      upstream = await fetch(target, init)
    } catch {
      return jsonError(502, 'upstream fetch failed')
    }

    const headers = corsify(upstream.headers)

    if (cacheable && upstream.ok) {
      headers.set('cache-control', publicStorageCacheControl(url.pathname, upstream.headers))
      headers.set('x-cache', 'MISS')
      if (request.method === 'GET') {
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
      }
    } else if (cacheable) {
      headers.set('x-cache', 'BYPASS')
    }

    return new Response(request.method === 'HEAD' ? null : upstream.body, {
      status: upstream.status,
      headers
    })
  }
}
