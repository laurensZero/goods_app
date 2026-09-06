// @ts-check
/**
 * AI 接口开发代理（仅 Vite dev server 生效）
 *
 * 浏览器直连任意 AI 端点常被 CORS 拦截（Authorization 头还会触发预检），
 * dev 阶段聊天请求改走 `/ai-proxy/chat/completions`，由 dev server 转发到
 * `x-ai-target` 头指定的目标地址，与服务端等价地绕开 CORS。
 *
 * 响应按流式透传（SSE chunk 到一段转发一段），支持聊天界面的实时思维链；
 * 仅监听本机 dev server，生产/原生端不经过此路径（原生走 CapacitorHttp 直连）。
 */

import { Readable } from 'node:stream'

const MAX_BODY_BYTES = 4 * 1024 * 1024

/**
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<Buffer>}
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    /** @type {Buffer[]} */
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('payload too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

export function aiProxyPlugin() {
  return {
    name: 'goods-app-ai-proxy',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/ai-proxy', async (req, res) => {
        try {
          const targetBase = String(req.headers['x-ai-target'] || '').replace(/\/+$/, '')
          if (!/^https?:\/\//i.test(targetBase)) {
            res.statusCode = 400
            res.end(JSON.stringify({ error: { message: 'missing or invalid x-ai-target header' } }))
            return
          }

          // connect 已剥离 /ai-proxy 前缀，req.url 形如 /chat/completions
          const suffix = req.url || ''
          const upstreamUrl = `${targetBase}${suffix}`
          const body = await readBody(req)

          /** @type {Record<string, string>} */
          const headers = { 'Content-Type': 'application/json' }
          if (req.headers.authorization) headers.Authorization = String(req.headers.authorization)

          const upstream = await fetch(upstreamUrl, { method: 'POST', headers, body })
          res.statusCode = upstream.status
          res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json; charset=utf-8')
          res.setHeader('Cache-Control', 'no-cache')
          // SSE 需要关掉缓冲并按块透传，不能先聚合再返回
          res.setHeader('X-Accel-Buffering', 'no')
          if (upstream.body) {
            Readable.fromWeb(/** @type {any} */ (upstream.body)).pipe(res)
          } else {
            res.end(await upstream.text())
          }
        } catch (error) {
          if (!res.headersSent) {
            res.statusCode = 502
          }
          res.end(JSON.stringify({
            error: { message: `AI 代理请求失败：${error instanceof Error ? error.message : String(error)}` }
          }))
        }
      })
    }
  }
}
