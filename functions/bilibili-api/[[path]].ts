const TARGET_ORIGIN = 'https://api.bilibili.com'
const REFERER = 'https://www.bilibili.com/'
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

function randomHex(length) {
  const bytes = new Uint8Array(Math.ceil(length / 2))
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').slice(0, length)
}

export async function onRequest(context) {
  const { request } = context
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204 })
  }

  const url = new URL(request.url)
  const path = url.pathname.replace(/^\/bilibili-api/, '') || '/'
  const target = new URL(path + url.search, TARGET_ORIGIN)

  // B 站对无 Cookie 的数据中心 IP 极易 412；补一个伪浏览器会话降低命中率
  const buvid3 = `${randomHex(16)}infoc`
  const headers = new Headers()
  headers.set('Referer', REFERER)
  headers.set('Origin', 'https://www.bilibili.com')
  headers.set('User-Agent', USER_AGENT)
  headers.set('Accept', 'application/json, text/plain, */*')
  headers.set('Accept-Language', 'zh-CN,zh;q=0.9,en;q=0.8')
  headers.set('Cookie', `buvid3=${buvid3}; b_nut=${Math.floor(Date.now() / 1000)}`)

  try {
    const upstream = await fetch(target.toString(), {
      method: request.method,
      headers,
      redirect: 'follow',
      cf: { cacheTtl: 0 }
    })

    const contentType = String(upstream.headers.get('content-type') || '')
    // 风控页是 text/html；原样透传会让前端 JSON.parse 炸掉
    if (upstream.status === 412 || contentType.includes('text/html')) {
      return new Response(
        JSON.stringify({
          code: -412,
          message: 'Bilibili 风控拦截，请稍后重试或改用网易云/QQ音乐源'
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json;charset=utf-8',
            'access-control-allow-origin': '*',
            'cache-control': 'no-store'
          }
        }
      )
    }

    const responseHeaders = new Headers()
    responseHeaders.set('access-control-allow-origin', '*')
    if (contentType) responseHeaders.set('content-type', contentType)
    responseHeaders.set('cache-control', 'no-store')

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders
    })
  } catch {
    return new Response(JSON.stringify({ code: -1, message: 'Bilibili proxy error' }), {
      status: 502,
      headers: { 'content-type': 'application/json;charset=utf-8' }
    })
  }
}
