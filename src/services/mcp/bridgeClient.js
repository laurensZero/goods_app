// @ts-check
/**
 * MCP 页面侧桥接客户端（仅开发环境运行）
 *
 * WebView 里的 JS 无法监听 TCP 端口，所以 dev 阶段的 HTTP 入口由 Vite dev
 * server 提供（见 scripts/vite-plugin-mcp.mjs）。AI 客户端请求打到 dev server
 * 的 /mcp 后，tools/call 会经 WebSocket 桥转发到本模块执行——本模块持有
 * 真实的本地 SQLite（utils/db），把工具结果递回 dev server 再响应给客户端。
 *
 * 消息协议（JSON）：
 *   页 → 服务  { type: 'hello', token }
 *   服务 → 页  { type: 'hello-ok' } | { type: 'hello-fail', message }
 *   服务 → 页  { type: 'call', id, name, args }
 *   页 → 服务  { type: 'result', id, ok: true, result } | { type: 'result', id, ok: false, error }
 */

import { reactive } from 'vue'
import { createLogger } from '@/utils/logger'
import { useMcpSettingsStore } from '@/stores/mcpSettings'
import { createMcpToolHandlers } from './tools'
import * as db from '@/utils/db'

const log = createLogger('mcp-bridge')

const RECONNECT_BASE_DELAY_MS = 2000
const RECONNECT_MAX_DELAY_MS = 15000

/** 供设置页读取的连接状态（reactive，跨模块共享同一份） */
export const mcpBridgeState = reactive({
  /** WebSocket 桥是否已连上 dev server */
  connected: false,
  /** 最近一次连接失败的说明（空串表示无异常） */
  lastError: ''
})

let socket = /** @type {WebSocket | null} */ (null)
let started = false
let stopped = true
let reconnectTimer = /** @type {ReturnType<typeof setTimeout> | null} */ (null)
let reconnectDelay = RECONNECT_BASE_DELAY_MS
let toolHandlers = /** @type {Record<string, (args: Record<string, any>) => Promise<unknown>> | null} */ (null)

/** @returns {Promise<string>} */
async function fetchBridgeToken() {
  const response = await fetch('/__mcp-bridge/config')
  if (!response.ok) throw new Error(`bridge config HTTP ${response.status}`)
  const config = await response.json()
  if (!config?.token) throw new Error('bridge config missing token')
  return String(config.token)
}

function clearReconnectTimer() {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
}

function scheduleReconnect() {
  if (stopped) return
  clearReconnectTimer()
  reconnectTimer = setTimeout(() => {
    void connect()
  }, reconnectDelay)
  reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_DELAY_MS)
}

async function connect() {
  if (stopped) return
  clearReconnectTimer()

  try {
    const token = await fetchBridgeToken()
    if (stopped) return
    openSocket(token)
  } catch (e) {
    mcpBridgeState.connected = false
    mcpBridgeState.lastError = e instanceof Error ? e.message : String(e)
    scheduleReconnect()
  }
}

/**
 * @param {string} token
 */
function openSocket(token) {
  socket = new WebSocket(`${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/__mcp-bridge`)

  socket.onopen = () => {
    socket?.send(JSON.stringify({ type: 'hello', token }))
  }

  socket.onmessage = (event) => {
    /** @type {any} */
    let message
    try {
      message = JSON.parse(String(event.data))
    } catch {
      return
    }
    if (message?.type === 'hello-ok') {
      reconnectDelay = RECONNECT_BASE_DELAY_MS
      mcpBridgeState.connected = true
      mcpBridgeState.lastError = ''
      log.info('bridge:connected')
      return
    }
    if (message?.type === 'hello-fail') {
      mcpBridgeState.connected = false
      mcpBridgeState.lastError = String(message.message || 'bridge rejected')
      socket?.close()
      return
    }
    if (message?.type === 'call') {
      void handleCall(message)
    }
  }

  socket.onclose = () => {
    mcpBridgeState.connected = false
    if (!stopped) scheduleReconnect()
  }

  socket.onerror = () => {
    // onclose 会随后触发并安排重连，这里只记录状态
    mcpBridgeState.connected = false
  }
}

/**
 * @param {{ id: number | string, name?: unknown, args?: unknown }} message
 */
async function handleCall(message) {
  if (!toolHandlers) {
    toolHandlers = /** @type {any} */ (createMcpToolHandlers(db))
  }
  const reply = { type: 'result', id: message.id }
  try {
    const name = String(message.name || '')
    const handler = toolHandlers[name]
    if (!handler) throw new Error(`Unknown tool: ${name}`)
    const args = (message.args && typeof message.args === 'object') ? message.args : {}
    const result = await handler(/** @type {Record<string, any>} */ (args))
    socket?.send(JSON.stringify({ ...reply, ok: true, result }))
  } catch (e) {
    socket?.send(JSON.stringify({ ...reply, ok: false, error: e instanceof Error ? e.message : String(e) }))
  }
}

function stop() {
  stopped = true
  clearReconnectTimer()
  if (socket) {
    socket.onclose = null
    socket.onerror = null
    socket.onmessage = null
    socket.close()
    socket = null
  }
  mcpBridgeState.connected = false
}

/**
 * 在应用启动后调用（仅 dev 环境生效）：根据设置开关启动/停止桥接，
 * 并跟随开关变化实时切换。
 */
export function initMcpBridge() {
  if (!import.meta.env.DEV || started) return
  started = true

  const settingsStore = useMcpSettingsStore()
  stopped = !settingsStore.settings.enabled
  if (!stopped) void connect()

  settingsStore.$subscribe(() => {
    const enabled = Boolean(settingsStore.settings.enabled)
    if (enabled && stopped) {
      stopped = false
      reconnectDelay = RECONNECT_BASE_DELAY_MS
      void connect()
    } else if (!enabled && !stopped) {
      stop()
    }
  })

  log.info('bridge:init', { enabled: !stopped })
}
