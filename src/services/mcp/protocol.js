// @ts-check
/**
 * MCP 协议层（传输无关）
 *
 * 实现 MCP Streamable HTTP 传输承载的 JSON-RPC 2.0 消息分发：
 *   initialize / notifications/* / ping / tools/list / tools/call
 *
 * 只做「一段 JSON 文本 → 一段 JSON-RPC 响应」的纯转换，不碰任何传输细节
 * （HTTP 头、WebSocket 帧由调用方处理），方便在 Node 侧（Vite 插件）与
 * WebView 侧（页面桥接）复用，也方便单测。
 *
 * 会话模型：无状态。不为 initialize 分配 Mcp-Session-Id，客户端每次 POST
 * 独立处理——这是规范允许的（session 为可选能力），也最贴合本应用「每次
 * 调用都打到当前设备实时数据」的定位。
 */

/** 服务端支持的协议版本，协商时取客户端请求与支持列表的交集，无交集则回退最新版 */
const SUPPORTED_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26']
const LATEST_PROTOCOL_VERSION = '2025-06-18'

/** tools/call 指定了未注册的工具名时抛出，由协议层转成 JSON-RPC -32602 */
export class McpUnknownToolError extends Error {
  /**
   * @param {string} toolName
   */
  constructor(toolName) {
    super(`Unknown tool: ${toolName}`)
    this.name = 'McpUnknownToolError'
  }
}

/**
 * @param {string | number | null} id
 * @param {number} code
 * @param {string} message
 */
function buildError(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } }
}

/**
 * @param {string | number | null} id
 * @param {Record<string, unknown>} result
 */
function buildResult(id, result) {
  return { jsonrpc: '2.0', id, result }
}

/**
 * @typedef {Object} McpHandlerOptions
 * @property {Record<string, unknown>} serverInfo
 * @property {string} [instructions]
 * @property {() => Promise<unknown[]> | unknown[]} listTools
 * @property {(name: string, args: Record<string, unknown>) => Promise<unknown>} callTool
 */

/**
 * 创建 MCP 请求处理器。
 * @param {McpHandlerOptions} options
 * @returns {{ handleRaw: (rawBody: string) => Promise<{ status: number, body: Record<string, unknown> | Array<Record<string, unknown>> | null }> }}
 */
export function createMcpRequestHandler(options) {
  const { serverInfo, instructions = '', listTools, callTool } = options
  if (typeof listTools !== 'function') throw new Error('[mcp] listTools is required')
  if (typeof callTool !== 'function') throw new Error('[mcp] callTool is required')

  /**
   * 处理单条 JSON-RPC 消息。通知（无 id）返回 null body，由传输层决定 HTTP 语义。
   * @param {any} message
   * @returns {Promise<{ status: number, body: Record<string, unknown> | null }>}
   */
  async function dispatchMessage(message) {
    if (!message || typeof message !== 'object' || Array.isArray(message)) {
      return { status: 400, body: buildError(null, -32600, 'Invalid Request') }
    }

    const isNotification = message.id === undefined
    const id = isNotification ? null : /** @type {any} */ (message.id)

    // 通知一律静默接受（202），即使方法未知也不回错误——JSON-RPC 2.0 规范要求
    if (isNotification) return { status: 202, body: null }

    try {
      switch (message.method) {
        case 'initialize': {
          const requested = String(message.params?.protocolVersion || '')
          const negotiated = SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
            ? requested
            : LATEST_PROTOCOL_VERSION
          return {
            status: 200,
            body: buildResult(id, {
              protocolVersion: negotiated,
              capabilities: { tools: { listChanged: false } },
              serverInfo,
              instructions
            })
          }
        }
        case 'ping':
          return { status: 200, body: buildResult(id, {}) }
        case 'tools/list': {
          const tools = await listTools()
          return { status: 200, body: buildResult(id, { tools }) }
        }
        case 'tools/call': {
          const name = message.params?.name
          if (typeof name !== 'string' || !name) {
            return { status: 200, body: buildError(id, -32602, 'Invalid params: tools/call requires a tool name') }
          }
          const args = message.params?.arguments
          if (args !== undefined && (typeof args !== 'object' || args === null || Array.isArray(args))) {
            return { status: 200, body: buildError(id, -32602, 'Invalid params: arguments must be an object') }
          }
          try {
            const output = await callTool(name, args || {})
            return {
              status: 200,
              body: buildResult(id, {
                content: [{ type: 'text', text: JSON.stringify(output) }],
                isError: false
              })
            }
          } catch (e) {
            // 工具执行失败按 MCP 规范返回 isError 结果（而非协议错误），让 AI 能读懂原因并重试
            if (e instanceof McpUnknownToolError) {
              return { status: 200, body: buildError(id, -32602, e.message) }
            }
            const messageText = e instanceof Error ? e.message : String(e)
            return {
              status: 200,
              body: buildResult(id, {
                content: [{ type: 'text', text: messageText }],
                isError: true
              })
            }
          }
        }
        default:
          return { status: 200, body: buildError(id, -32601, `Method not found: ${message.method}`) }
      }
    } catch (e) {
      const messageText = e instanceof Error ? e.message : String(e)
      return { status: 500, body: buildError(id, -32603, `Internal error: ${messageText}`) }
    }
  }

  /**
   * 处理一段原始 JSON 文本（单个消息或 JSON-RPC 批量数组）。
   * @param {string} rawBody
   */
  async function handleRaw(rawBody) {
    /** @type {any} */
    let parsed
    try {
      parsed = JSON.parse(rawBody)
    } catch {
      return { status: 400, body: buildError(null, -32700, 'Parse error') }
    }

    if (Array.isArray(parsed)) {
      const responses = []
      for (const message of parsed) {
        const dispatched = await dispatchMessage(message)
        if (dispatched.body !== null) responses.push(dispatched.body)
      }
      // 纯通知批处理不返回内容
      if (responses.length === 0) return { status: 202, body: null }
      return { status: 200, body: responses }
    }

    return dispatchMessage(parsed)
  }

  return { handleRaw }
}
