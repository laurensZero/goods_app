// @ts-check
/**
 * 淘宝 PC 详情页 dev 代理（仅 Vite dev server 生效）
 *
 * 浏览器经 `/taobao-page/xxx` 请求，由 dev server 转发到 item.taobao.com，
 * 补齐浏览器禁止 JS 设置的 UA / Referer / Cookie（x-cookie-forward 转 Cookie）。
 *
 * 与 http-proxy 的关键差别：**服务端跟随跳转**。天猫商品会从
 * item.taobao.com 302 到 detail.tmall.com，若把 302 透传给浏览器，页面会被
 * 带着自定义头跨域跟进 → 触发预检 → "Redirect is not allowed for a preflight
 * request"（CORS 直接失败）。这里手动逐跳重发（Cookie 每跳都带上），
 * 最终把落地页 HTML 原样返回，浏览器全程只与 localhost 同源通信。
 *
 * 生产 Web 直接命中 Cloudflare Pages Function（functions/taobao-page，协议相同）；
 * 原生直连被 tmd 硬拦时也经该函数兜底，见 src/utils/taobao/request.js。
 */

import https from 'node:https'
import zlib from 'node:zlib'

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const MAX_HOPS = 5
const TIMEOUT_MS = 20000
// 跳转只允许留在淘宝/天猫域内，避免把用户 Cookie 带去无关站点
const ALLOWED_SUFFIXES = ['.taobao.com', '.tmall.com']

const agent = new https.Agent({ keepAlive: true, maxSockets: 32, maxFreeSockets: 8 })

function isAllowedHost(hostname) {
  const host = String(hostname || '').toLowerCase()
  if (host === 'taobao.com' || host === 'tmall.com') return true
  return ALLOWED_SUFFIXES.some((suffix) => host.endsWith(suffix))
}

/**
 * 单跳请求，返回完整缓冲（SSR HTML 数 MB，dev 场景可接受）
 * @param {string} urlString
 * @param {Record<string, string>} headers
 * @param {import('http').ServerResponse} clientRes
 * @returns {Promise<{status:number, headers:import('http').IncomingHttpHeaders, body:Buffer}>}
 */
function requestOnce(urlString, headers, clientRes) {
  return new Promise((resolve, reject) => {
    const request = https.request(urlString, { method: 'GET', headers, agent }, (upstream) => {
      /** @type {Buffer[]} */
      const chunks = []
      upstream.on('data', (chunk) => chunks.push(chunk))
      upstream.on('end', () => {
        resolve({
          status: upstream.statusCode || 0,
          headers: upstream.headers,
          body: Buffer.concat(chunks),
        })
      })
      upstream.on('error', reject)
    })
    request.setTimeout(TIMEOUT_MS, () => {
      request.destroy(new Error('taobao page request timeout'))
    })
    // 浏览器中途取消（组件卸载/AbortController）→ 断开上游，不白等
    clientRes.on('close', () => {
      if (!request.destroyed) request.destroy()
    })
    request.on('error', reject)
    request.end()
  })
}

export function taobaoPagePlugin() {
  return {
    name: 'goods-app-taobao-page-proxy',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/taobao-page', async (req, res) => {
        try {
          const fwd = req.headers['x-cookie-forward']
          const cookie = fwd ? decodeURIComponent(String(fwd)) : ''
          const suffix = req.url || '/'

          // 目标源：默认 PC 详情页；mtop 接口经 x-taobao-origin 指定 h5api.m.taobao.com
          let baseUrl = 'https://item.taobao.com'
          const originFwd = req.headers['x-taobao-origin']
          if (originFwd) {
            try {
              const origin = new URL(String(originFwd))
              if (origin.protocol === 'https:' && isAllowedHost(origin.hostname)) {
                baseUrl = origin.origin
              } else {
                res.statusCode = 502
                res.setHeader('Content-Type', 'text/plain; charset=utf-8')
                res.end('taobao page proxy: blocked target origin')
                return
              }
            } catch {
              res.statusCode = 502
              res.setHeader('Content-Type', 'text/plain; charset=utf-8')
              res.end('taobao page proxy: invalid target origin')
              return
            }
          }

          let referer = 'https://www.taobao.com/'
          const refererFwd = req.headers['x-referer-forward']
          if (refererFwd) {
            try {
              const ref = new URL(decodeURIComponent(String(refererFwd)))
              if (isAllowedHost(ref.hostname)) referer = ref.href
            } catch {
              // 非法 Referer 回落默认值
            }
          }

          /** @type {Record<string, string>} */
          const headers = {
            'User-Agent': DESKTOP_UA,
            'Referer': referer,
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            // 不设 Accept-Encoding：由 https 模块原样透传/按 content-encoding 解压
          }
          if (cookie) headers.Cookie = cookie

          let currentUrl = `${baseUrl}${suffix}`
          for (let hop = 0; ; hop++) {
            if (hop > MAX_HOPS) {
              res.statusCode = 502
              res.setHeader('Content-Type', 'text/plain; charset=utf-8')
              res.end('taobao page proxy: too many redirects')
              return
            }
            const upstream = await requestOnce(currentUrl, headers, res)
            const location = upstream.headers.location
            const isRedirect = upstream.status >= 300 && upstream.status < 400 && location
            if (!isRedirect) {
              res.statusCode = upstream.status
              const contentType = upstream.headers['content-type']
              res.setHeader('Content-Type', String(contentType || 'text/html; charset=utf-8'))
              res.setHeader('Cache-Control', 'no-store')
              // mtop 换 token 依赖上游 Set-Cookie（浏览器拿不到 HttpOnly 头，中转给客户端）
              const setCookie = upstream.headers['set-cookie']
              if (Array.isArray(setCookie) && setCookie.length > 0) {
                res.setHeader('x-upstream-set-cookie', setCookie.join(', '))
              }
              res.end(decompress(upstream.body, String(upstream.headers['content-encoding'] || '')))
              return
            }
            const nextUrl = new URL(location, currentUrl)
            if (!isAllowedHost(nextUrl.hostname)) {
              res.statusCode = 502
              res.setHeader('Content-Type', 'text/plain; charset=utf-8')
              res.end(`taobao page proxy: blocked redirect to ${nextUrl.hostname}`)
              return
            }
            // 跨域跳转后 Referer 跟随上一跳（与浏览器行为一致）
            headers.Referer = currentUrl
            currentUrl = nextUrl.href
          }
        } catch (error) {
          if (!res.headersSent) {
            res.statusCode = 502
            res.setHeader('Content-Type', 'text/plain; charset=utf-8')
          }
          res.end(`taobao page proxy error: ${error instanceof Error ? error.message : String(error)}`)
        }
      })
    },
  }
}

/**
 * @param {Buffer} body
 * @param {string} encoding
 * @returns {Buffer}
 */
function decompress(body, encoding) {
  if (!encoding || body.length === 0) return body
  try {
    if (encoding.includes('gzip')) return zlib.gunzipSync(body)
    if (encoding.includes('deflate')) return zlib.inflateSync(body)
    if (encoding.includes('br')) return zlib.brotliDecompressSync(body)
  } catch {
    // 解压失败时原样返回，交给调用方按文本处理
  }
  return body
}
