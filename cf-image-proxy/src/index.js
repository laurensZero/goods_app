// Cloudflare Worker — Supabase Storage 图片 CDN 代理
const SUPABASE_URL = 'https://zvqzicimowfqshgjsrri.supabase.co'

const ALLOWED_BUCKETS = new Set([
  'goods-images',
  'event-photos',
  'avatars',
  'feedback-attachments'
])

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() })
    }

    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    const parts = url.pathname.slice(1).split('/')
    if (parts.length < 2) {
      return new Response('Not found', { status: 404, headers: corsHeaders() })
    }

    const bucket = parts[0]
    if (!ALLOWED_BUCKETS.has(bucket)) {
      return new Response('Bucket not allowed', { status: 403, headers: corsHeaders() })
    }

    const filePath = parts.slice(1).join('/')
    const upstreamUrl = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${filePath}`

    const cache = caches.default
    const cacheKey = new Request(upstreamUrl, { method: 'GET' })
    const cached = await cache.match(cacheKey)
    if (cached) {
      const resp = new Response(cached.body, cached)
      resp.headers.set('X-Cache', 'HIT')
      return resp
    }

    const upstreamResp = await fetch(upstreamUrl, { method: 'GET' })

    if (!upstreamResp.ok) {
      return new Response(upstreamResp.body, {
        status: upstreamResp.status,
        headers: corsHeaders()
      })
    }

    const resp = new Response(upstreamResp.body, {
      status: upstreamResp.status,
      headers: {
        ...corsHeaders(),
        'Content-Type': upstreamResp.headers.get('Content-Type') || 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'ETag': upstreamResp.headers.get('ETag') || '',
        'X-Cache': 'MISS'
      }
    })

    ctx.waitUntil(cache.put(cacheKey, resp.clone()))
    return resp
  }
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': '*'
  }
}
