// @ts-check
/**
 * MCP 原生 HTTP 服务桥（仅 Android 原生端运行）
 *
 * 原生插件 McpServerPlugin（NanoHTTPD）监听 HTTP 端口并做 Bearer 鉴权，
 * 收到 POST /mcp 后通过 `mcpRequest` 事件把请求体交给本模块，本模块用与
 * dev 桥（bridgeClient.js）同一套协议层 + 工具集执行，再把结果回执给插件。
 *
 *   生命周期：跟随设置开关；端口/令牌变化时自动重启服务。
 */

import { Capacitor, registerPlugin } from '@capacitor/core'
import { reactive, watch } from 'vue'
import { createLogger } from '@/utils/logger'
import { useMcpSettingsStore, generateMcpToken, MCP_DEFAULT_PORT } from '@/stores/mcpSettings'
import { createMcpServer } from './tools'
import { createMoneyEnrichers } from './moneyContext'
import * as db from '@/utils/db'

const log = createLogger('mcp-native')

/** 供设置页读取的服务状态 */
export const mcpNativeState = reactive({
  running: false,
  lastError: ''
})

const McpServerPlugin = Capacitor.isNativePlatform()
  ? registerPlugin('McpServer')
  : null

let initialized = false
let listenerRegistered = false
let mcpHandler = null
let restartTimer = null

/** @returns {Promise<{ status: number, body: Record<string, unknown> | null }>} */
function handleRawRequest(rawBody) {
  if (!mcpHandler) {
    mcpHandler = createMcpServer({ dbApi: db, money: createMoneyEnrichers() })
  }
  return mcpHandler.handleRaw(rawBody)
}

function registerRequestListener() {
  if (listenerRegistered || !McpServerPlugin) return
  listenerRegistered = true
  McpServerPlugin.addListener('mcpRequest', async ({ id, body }) => {
    try {
      const { status, body: responseBody } = await handleRawRequest(String(body || ''))
      // 202 通知无响应体
      const responseText = responseBody === null ? '' : JSON.stringify(responseBody)
      await McpServerPlugin.respond({ id, status, body: responseText })
    } catch (e) {
      log.error('bridge:request:failed', e)
      await McpServerPlugin.respond({
        id,
        status: 500,
        body: JSON.stringify({ error: e instanceof Error ? e.message : String(e) })
      })
    }
  })
}

async function start() {
  if (!McpServerPlugin) return
  const settingsStore = useMcpSettingsStore()
  const { port, token } = settingsStore.settings

  // 首次启用时生成并持久化随机令牌
  const effectiveToken = token || generateMcpToken()
  if (!token) {
    settingsStore.updateSetting('token', effectiveToken)
  }

  registerRequestListener()
  try {
    const result = await McpServerPlugin.start({
      port: Number(port) || MCP_DEFAULT_PORT,
      token: effectiveToken
    })
    mcpNativeState.running = true
    mcpNativeState.lastError = ''
    log.info('server:started', { port: result?.port })
  } catch (e) {
    mcpNativeState.running = false
    mcpNativeState.lastError = e instanceof Error ? e.message : String(e)
    log.error('server:start:failed', e)
  }
}

async function stop() {
  if (!McpServerPlugin) return
  try {
    await McpServerPlugin.stop()
  } catch (e) {
    log.warn('server:stop:failed', e)
  }
  mcpNativeState.running = false
}

/**
 * 在应用启动后调用（仅原生端生效）：跟随设置开关启停服务，
 * 端口/令牌变化时防抖重启。
 */
export function initMcpNativeServer() {
  if (!Capacitor.isNativePlatform() || initialized) return
  initialized = true

  const settingsStore = useMcpSettingsStore()
  if (settingsStore.settings.enabled) void start()

  settingsStore.$subscribe(() => {
    const { enabled } = settingsStore.settings
    if (restartTimer !== null) {
      clearTimeout(restartTimer)
      restartTimer = null
    }
    if (enabled) {
      // 开关、端口或令牌任一变化都防抖重启（start 内部幂等）
      restartTimer = setTimeout(() => {
        restartTimer = null
        void start()
      }, 600)
    } else {
      void stop()
    }
  })

  log.info('server:init', { enabled: Boolean(settingsStore.settings.enabled) })
}
