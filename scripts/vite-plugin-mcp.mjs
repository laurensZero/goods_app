// @ts-check
/**
 * MCP dev server 插件（仅 Vite dev server 生效）
 *
 * WebView 里的 JS 无法监听端口，因此开发阶段由 dev server 充当 MCP 的
 * HTTP 入口：
 *
 *   AI 客户端 ──HTTP POST /mcp──▶ Vite dev server（本插件）
 *                                   │  initialize/tools/list 本地应答
 *                                   │  tools/call 经 WebSocket 桥转发
 *                                   ▼
 *                              App 页面（bridgeClient.js，持有真实 SQLite）
 *
 * - 传输：MCP Streamable HTTP（POST-only JSON，GET/DELETE 返回 405）
 * - 鉴权：Authorization: Bearer <token>，token 取 GOODS_MCP_TOKEN 环境变量，
 *   未设置时用默认值 goods-dev-token（dev server 绑定 0.0.0.0，务必改掉默认值再暴露到局域网）
 * - 桥接：页面连 ws://<host>/__mcp-bridge，hello 校验 token 后独占桥接位；
 *   tools/call 转发给页面执行并等待结果（超时 30s）
 *
 * Android 原生端上线后，将用 Capacitor 插件（NanoHTTPD）替换本文件的
 * HTTP 入口，页面侧协议处理逻辑（protocol.js / tools.js）保持不变。
 */

import { WebSocketServer, WebSocket } from 'ws'
import { getToolDefinitions, MCP_SERVER_INFO, MCP_SERVER_INSTRUCTIONS } from '../src/services/mcp/toolDefinitions.js'
import { createMcpRequestHandler, McpUnknownToolError } from '../src/services/mcp/protocol.js'

const DEFAULT_TOKEN = '<goods-dev-token></goods-dev-token>'
const BRIDGE_PATH = '/__mcp-bridge'
const MCP_PATH = '/mcp'
const MAX_BODY_BYTES = 2 * 1024 * 1024
const TOOL_CALL_TIMEOUT_MS = 30000

/**
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<string>}
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
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    req.on('error', reject)
  })
}

/**
 * @param {import('http').ServerResponse} res
 * @param {number} status
 * @param {unknown} body
 */
function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(body === undefined ? '' : JSON.stringify(body))
}

/**
 * @param {string | undefined} header
 * @param {string} expectedToken
 */
function isAuthorized(header, expectedToken) {
  if (typeof header !== 'string') return false
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return Boolean(match) && match[1] === expectedToken
}

/**
 * @param {string} [envToken]
 * @param {boolean} [allowWrites] 外部 MCP 写入开关（GOODS_MCP_ALLOW_WRITES=1）
 * @returns {import('vite').Plugin}
 */
export function mcpDevServerPlugin(envToken, allowWrites = false) {
  const token = envToken || DEFAULT_TOKEN
  const toolDefinitions = getToolDefinitions(Boolean(allowWrites))
  /** @type {Set<import('ws').WebSocket>} */
  const pageSockets = new Set()
  /** @type {Map<number, { resolve: (value: unknown) => void, reject: (error: Error) => void, timer: NodeJS.Timeout }>} */
  const pendingCalls = new Map()
  let callSeq = 0

  /**
   * 把 tools/call 经桥转发给 App 页面执行。
   * @param {string} name
   * @param {Record<string, unknown>} args
   */
  function forwardToolCall(name, args) {
    const page = [...pageSockets].find((socket) => socket.readyState === WebSocket.OPEN)
    if (!page) {
      throw new Error('谷子收纳 App 未连接：请打开应用页面（浏览器或手机）并确认 MCP 服务已开启')
    }
    callSeq += 1
    const id = callSeq
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingCalls.delete(id)
        reject(new Error(`工具 ${name} 执行超时（${TOOL_CALL_TIMEOUT_MS / 1000}s）`))
      }, TOOL_CALL_TIMEOUT_MS)
      pendingCalls.set(id, { resolve, reject, timer })
      page.send(JSON.stringify({ type: 'call', id, name, args }))
    })
  }

  const mcpHandler = createMcpRequestHandler({
    serverInfo: MCP_SERVER_INFO,
    instructions: MCP_SERVER_INSTRUCTIONS,
    listTools: () => toolDefinitions,
    callTool: (name, args) => {
      if (!toolDefinitions.some((tool) => tool.name === name)) {
        throw new McpUnknownToolError(name)
      }
      return forwardToolCall(name, args)
    }
  })

  /**
   * @param {import('http').IncomingMessage} req
   * @param {import('http').ServerResponse} res
   */
  async function handleMcpRequest(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*')
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type, mcp-protocol-version, mcp-session-id')
      res.setHeader('Access-Control-Max-Age', '86400')
      res.end()
      return
    }
    if (req.method !== 'POST') {
      // Streamable HTTP：不提供 SSE 流时对 GET/DELETE 回 405
      res.setHeader('Allow', 'POST, OPTIONS')
      sendJson(res, 405, { error: 'method not allowed（本服务仅支持 POST）' })
      return
    }
    if (!isAuthorized(req.headers.authorization, token)) {
      res.setHeader('WWW-Authenticate', 'Bearer')
      sendJson(res, 401, { error: 'unauthorized' })
      return
    }

    let rawBody
    try {
      rawBody = await readBody(req)
    } catch {
      sendJson(res, 413, { error: 'payload too large' })
      return
    }

    try {
      const { status, body } = await mcpHandler.handleRaw(rawBody)
      if (status === 202) {
        // 通知：接受但不回内容
        res.statusCode = 202
        res.end()
        return
      }
      sendJson(res, status, body)
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
    }
  }

  return {
    name: 'goods-app-mcp-dev',
    apply: 'serve',
    configureServer(server) {
      // 页面侧获取连接配置（同源读取；不带 CORS 头，跨源页面读不到）
      server.middlewares.use((req, res, next) => {
        const url = req.url || ''
        if (!url.startsWith(`${BRIDGE_PATH}/config`)) {
          next()
          return
        }
        sendJson(res, 200, { token, mcpPath: MCP_PATH })
      })

      server.middlewares.use(MCP_PATH, (req, res) => {
        void handleMcpRequest(req, res)
      })

      return () => {
        // post 钩子：httpServer 此刻已就绪；只接管自己的路径，
        // Vite HMR 的 upgrade（sec-websocket-protocol: vite-hmr）由其自行处理
        if (!server.httpServer) return
        const wss = new WebSocketServer({ noServer: true })

        server.httpServer.on('upgrade', (req, socket, head) => {
          let pathname = ''
          try {
            pathname = new URL(req.url || '/', 'http://localhost').pathname
          } catch {
            return
          }
          if (pathname !== BRIDGE_PATH) return
          wss.handleUpgrade(req, /** @type {any} */ (socket), head, (ws) => {
            /** @type {any} */
            let helloTimer = setTimeout(() => {
              ws.close(4001, 'hello timeout')
            }, 5000)

            ws.on('message', (data) => {
              /** @type {any} */
              let message
              try {
                message = JSON.parse(String(data))
              } catch {
                return
              }

              if (message?.type === 'hello') {
                clearTimeout(helloTimer)
                if (message.token !== token) {
                  ws.send(JSON.stringify({ type: 'hello-fail', message: 'token 校验失败' }))
                  ws.close(4003, 'bad token')
                  return
                }
                // 单桥接位：新页面挤掉旧连接（dev 场景多标签页少见，以最后连上的为准）
                for (const old of pageSockets) {
                  if (old !== ws) old.close(4000, 'replaced by another page')
                }
                pageSockets.add(ws)
                ws.send(JSON.stringify({ type: 'hello-ok' }))
                server.config.logger.info(`[mcp] App 页面已连接桥接（当前 ${pageSockets.size} 个）`)
                return
              }

              if (message?.type === 'result') {
                const pending = pendingCalls.get(Number(message.id))
                if (!pending) return
                clearTimeout(pending.timer)
                pendingCalls.delete(Number(message.id))
                if (message.ok) pending.resolve(message.result)
                else pending.reject(new Error(String(message.error || '工具执行失败')))
              }
            })

            ws.on('close', () => {
              clearTimeout(helloTimer)
              pageSockets.delete(ws)
              if (pageSockets.size === 0) {
                server.config.logger.info('[mcp] App 页面已断开桥接')
              }
            })
          })
        })

        server.config.logger.info(
          `[mcp] MCP dev 服务已就绪：POST http://localhost:${server.config.server.port || 5173}${MCP_PATH} ` +
          `（Bearer token: ${token}，可用 GOODS_MCP_TOKEN 环境变量覆盖；外部写入：${allowWrites ? '开启' : '关闭（GOODS_MCP_ALLOW_WRITES=1 开启）'}）`
        )
      }
    }
  }
}
