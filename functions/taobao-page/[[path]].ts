// 淘宝页面 / mtop 远程代理（goodsapp.de5.net/taobao-page）
//
// 与 scripts/vite-plugin-taobao-page.mjs 同构，供两个场景复用：
//   - 生产 Web：request.js 同源 fetch('/taobao-page/…') 直接命中本函数（开发环境仍走 Vite 中间件）
//   - 原生 App：CapacitorHttp（OkHttp）直连被 _____tmd_____ 硬拦时（搜索网关
//     针对 OkHttp TLS 指纹），request.js 用本函数兜底重试，taobao 侧看到的是
//     Cloudflare 的出站连接而非设备指纹
//
// 协议（与 Vite 中间件一致）：
//   - 路径：/taobao-page{上游 pathname}{search}
//   - x-taobao-origin：目标源（默认 https://item.taobao.com，仅允许 .taobao.com/.tmall.com）
//   - x-cookie-forward：URL 编码的 Cookie（原生兜底也可直发 Cookie 头）
//   - x-referer-forward：URL 编码的 Referer（仅允许淘宝/天猫域）
//   - x-origin-forward：URL 编码的 Origin（newlogin 扫码登录等接口需要，仅允许淘宝/天猫域）
//   - x-accept-forward：URL 编码的 Accept（newlogin 返回 JSON 时需要）
//   - 响应头 x-upstream-set-cookie(-json)：上游 Set-Cookie 透传
//     （mtop 换 _m_h5_tk / 扫码登录合并 cookie 罐依赖它；json 为权威格式）
//
// 关键行为：**服务端跟随跳转**。天猫商品会 302 到 detail.tmall.com，手动逐跳重发
// （每跳带 Cookie、限制在淘宝/天猫域内），浏览器/客户端全程只与本站同源通信。

const MAX_HOPS = 5
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
// 跳转只允许留在淘宝/天猫域内，避免把用户 Cookie 带去无关站点
const ALLOWED_SUFFIXES = ['.taobao.com', '.tmall.com']

function isAllowedHost(hostname) {
  const host = String(hostname || '').toLowerCase()
  if (host === 'taobao.com' || host === 'tmall.com') return true
  return ALLOWED_SUFFIXES.some((suffix) => host.endsWith(suffix))
}

function errorResponse(status, message) {
  return new Response(`taobao page proxy: ${message}`, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
}

export async function onRequest(context) {
  const { request } = context
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'content-type, x-cookie-forward, x-taobao-origin, x-referer-forward, x-origin-forward, x-accept-forward',
        'access-control-max-age': '86400',
      },
    })
  }
  if (request.method !== 'GET' && request.method !== 'POST') {
    return errorResponse(405, 'method not allowed')
  }

  const url = new URL(request.url)
  const suffix = url.pathname.replace(/^\/taobao-page/, '') || '/'

  // 目标源：默认 PC 详情页；mtop 接口经 x-taobao-origin 指定 h5api.m.taobao.com
  let baseUrl = 'https://item.taobao.com'
  const originFwd = request.headers.get('x-taobao-origin')
  if (originFwd) {
    try {
      const origin = new URL(originFwd)
      if (origin.protocol === 'https:' && isAllowedHost(origin.hostname)) {
        baseUrl = origin.origin
      } else {
        return errorResponse(502, 'blocked target origin')
      }
    } catch {
      return errorResponse(502, 'invalid target origin')
    }
  }

  let referer = 'https://www.taobao.com/'
  const refererFwd = request.headers.get('x-referer-forward')
  if (refererFwd) {
    try {
      const ref = new URL(decodeURIComponent(refererFwd))
      if (isAllowedHost(ref.hostname)) referer = ref.href
    } catch {
      // 非法 Referer 回落默认值
    }
  }

  // Origin（newlogin 扫码登录等接口需要）：仅允许淘宝/天猫域
  let requestOrigin = ''
  const originForward = request.headers.get('x-origin-forward')
  if (originForward) {
    try {
      const parsed = new URL(decodeURIComponent(originForward))
      if (parsed.protocol === 'https:' && isAllowedHost(parsed.hostname)) requestOrigin = parsed.origin
    } catch {
      // 非法 Origin 忽略
    }
  }

  let accept = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
  const acceptForward = request.headers.get('x-accept-forward')
  if (acceptForward) {
    try {
      accept = decodeURIComponent(acceptForward)
    } catch {
      // 非法 Accept 用默认值
    }
  }

  // Cookie：优先 x-cookie-forward（Web/原生兜底统一走该头）；也接受直发 Cookie 头
  let cookie = ''
  const cookieFwd = request.headers.get('x-cookie-forward')
  if (cookieFwd) {
    try {
      cookie = decodeURIComponent(cookieFwd)
    } catch {
      cookie = cookieFwd
    }
  }
  if (!cookie) cookie = request.headers.get('cookie') || ''

  /** @type {Record<string, string>} */
  const headers = {
    'User-Agent': DESKTOP_UA,
    'Referer': referer,
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Accept': accept,
    // 不设 Accept-Encoding：Workers 侧自动解压，读 arrayBuffer 得到明文
  }
  if (requestOrigin) headers.Origin = requestOrigin
  if (cookie) headers.Cookie = cookie

  // POST（mtop 订单 form 接口）：透传 Content-Type 与请求体
  let reqBody: ArrayBuffer | undefined
  if (request.method === 'POST') {
    headers['Content-Type'] = request.headers.get('content-type') || 'application/x-www-form-urlencoded'
    reqBody = await request.arrayBuffer()
  }

  let currentUrl = `${baseUrl}${suffix}${url.search}`
  try {
    for (let hop = 0; ; hop += 1) {
      if (hop > MAX_HOPS) {
        return errorResponse(502, 'too many redirects')
      }
      const upstream = await fetch(currentUrl, {
        method: request.method,
        headers,
        body: reqBody,
        redirect: 'manual',
      })
      const location = upstream.headers.get('location')
      const isRedirect = upstream.status >= 300 && upstream.status < 400 && location
      if (!isRedirect) {
        const responseHeaders = new Headers()
        const contentType = upstream.headers.get('content-type')
        responseHeaders.set('content-type', String(contentType || 'text/html; charset=utf-8'))
        responseHeaders.set('cache-control', 'no-store')
        responseHeaders.set('access-control-allow-origin', '*')
        // mtop 换 token / 扫码登录合并罐依赖上游 Set-Cookie（客户端拿不到 HttpOnly 头，中转给客户端）
        // JSON 串为权威格式（Expires 含逗号时旧 join(', ') 会碎）；旧头保留兼容存量客户端
        const setCookie = upstream.headers.getSetCookie ? upstream.headers.getSetCookie() : []
        if (setCookie.length > 0) {
          responseHeaders.set('x-upstream-set-cookie', setCookie.join(', '))
          responseHeaders.set('x-upstream-set-cookie-json', JSON.stringify(setCookie))
          responseHeaders.set(
            'access-control-expose-headers',
            'x-upstream-set-cookie, x-upstream-set-cookie-json',
          )
        }
        const body = await upstream.arrayBuffer()
        return new Response(body, {
          status: upstream.status,
          statusText: upstream.statusText,
          headers: responseHeaders,
        })
      }
      const nextUrl = new URL(location, currentUrl)
      if (!isAllowedHost(nextUrl.hostname)) {
        return errorResponse(502, `blocked redirect to ${nextUrl.hostname}`)
      }
      // 跨域跳转后 Referer 跟随上一跳（与浏览器行为一致）
      headers.Referer = currentUrl
      currentUrl = nextUrl.href
    }
  } catch {
    return errorResponse(502, 'upstream request failed')
  }
}
