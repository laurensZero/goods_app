// @ts-check
/**
 * OpenAI 兼容聊天客户端（非流式 + 工具调用循环）
 *
 * - 通过 CapacitorHttp 发请求：走原生网络栈，不受 WebView CORS 限制，
 *   用户可填任意 OpenAI 兼容端点（one-api / 本地 LLM 网关 / 官方 API）。
 * - 工具循环：带 tools 请求 → 执行 tool_calls → 结果以 role:tool 回填 →
 *   重复，直到模型给出纯文本；轮数用尽后做一次不带 tools 的收尾请求强制回答。
 */

import { Capacitor, CapacitorHttp } from '@capacitor/core'

const HTTP_TIMEOUT_MS = 120000
export const MAX_TOOL_ROUNDS = 6

export const DEFAULT_AI_CONFIG = Object.freeze({
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  apiKey: ''
})

/** HTTP/服务端错误，带状态码与原始响应文本便于排障 */
export class AiRequestError extends Error {
  /**
   * @param {number} status
   * @param {string} detail
   */
  constructor(status, detail) {
    super(`AI 请求失败（HTTP ${status}）：${detail}`)
    this.name = 'AiRequestError'
    this.status = status
    this.detail = detail
  }
}

/** @param {string} url */
export function normalizeBaseUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '')
}

/**
 * 从常见错误响应里提取可读信息（OpenAI 风格 {error:{message}} 或纯文本）。
 * @param {unknown} data
 */
function extractErrorDetail(data) {
  if (typeof data === 'string') return data.slice(0, 300) || '(空响应)'
  const message = data?.error?.message || data?.message
  if (typeof message === 'string') return message
  try {
    return JSON.stringify(data).slice(0, 300)
  } catch {
    return '(无法解析的响应)'
  }
}

/** @param {string} text 尝试 JSON.parse，失败则原样返回 */
function tryParseJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/**
 * POST JSON 并解析响应。原生走 CapacitorHttp.request（不受 WebView CORS 限制，
 * 返回 {status,data}）；Web 走 fetch（CapacitorHttp 在 Web 上无 fetch 方法）。
 * @param {string} url
 * @param {Record<string, string>} headers
 * @param {unknown} body
 * @returns {Promise<any>}
 */
async function postJsonNative(url, headers, body) {
  // readTimeout 在 Android 上每收到一段数据就会重置，LLM 慢速滴流可能拖过上限，
  // 因此再套一层 Promise.race 看门狗保证总时长有界（与 mihoyo/request.js 同策略）
  let timeoutId
  try {
    const response = await Promise.race([
      CapacitorHttp.request({
        url,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        data: body,
        connectTimeout: HTTP_TIMEOUT_MS,
        readTimeout: HTTP_TIMEOUT_MS
      }),
      new Promise((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error(`AI 请求超时（${HTTP_TIMEOUT_MS / 1000}s）`)),
          HTTP_TIMEOUT_MS
        )
      })
    ])
    const status = Number(response?.status || 0)
    const data = typeof response?.data === 'string' ? tryParseJson(response.data) : response?.data
    if (status >= 400) throw new AiRequestError(status, extractErrorDetail(data))
    return data
  } finally {
    clearTimeout(timeoutId)
  }
}

async function postJsonWeb(url, headers, body) {
  // 浏览器直连常被 CORS 拦截：dev 下经 Vite 中间件 /ai-proxy 转发到目标地址
  let requestUrl = url
  /** @type {Record<string, string>} */
  const requestHeaders = { 'Content-Type': 'application/json', ...headers }
  if (import.meta.env.DEV) {
    const base = url.replace(/\/chat\/completions$/, '')
    if (base !== url) {
      requestUrl = `${window.location.origin}/ai-proxy/chat/completions`
      requestHeaders['x-ai-target'] = base
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS)
  try {
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify(body),
      signal: controller.signal
    })
    return await parseWebResponse(response)
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error(`AI 请求超时（${HTTP_TIMEOUT_MS / 1000}s）`)
    }
    if (e instanceof TypeError) {
      throw new Error('网络请求失败：请检查接口地址是否可达（或 dev server 的 /ai-proxy 是否可用）')
    }
    throw e
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 解析标准 Response 形状（Web fetch）。
 * @param {Response} response
 * @returns {Promise<any>}
 */
async function parseWebResponse(response) {
  const text = await response.text()
  if (!response.ok) throw new AiRequestError(response.status, extractErrorDetail(text))
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/** 按运行平台选择传输：原生 CapacitorHttp 直连；Web 走 fetch（dev 经 /ai-proxy） */
function postJson(url, headers, body) {
  return Capacitor.isNativePlatform()
    ? postJsonNative(url, headers, body)
    : postJsonWeb(url, headers, body)
}

/**
 * MCP 工具定义 → OpenAI tools 参数
 * @param {Array<{ name: string, description: string, inputSchema: Record<string, unknown> }>} definitions
 */
export function toOpenAiTools(definitions) {
  return definitions.map((def) => ({
    type: 'function',
    function: {
      name: def.name,
      description: def.description,
      parameters: def.inputSchema
    }
  }))
}

/**
 * @typedef {Object} RunChatOptions
 * @property {{ baseUrl: string, model: string, apiKey: string }} config
 * @property {Array<Record<string, unknown>>} messages 已含 system 的 OpenAI 消息数组
 * @property {Array<{ name: string, description: string, inputSchema: Record<string, unknown> >}} tools
 * @property {(name: string, args: Record<string, any>) => Promise<unknown>} executor
 * @property {(step: { name: string, args: Record<string, any>, ok: boolean, error?: string }) => void} [onStep]
 * @property {number} [maxToolRounds]
 */

/**
 * 执行一次「可能含多轮工具调用」的完整对话请求。
 * @param {RunChatOptions} options
 * @returns {Promise<{ content: string, steps: Array<{ name: string, args: Record<string, any>, ok: boolean, error?: string }>, convo: Array<Record<string, unknown>> }>}
 */
export async function runChatCompletion(options) {
  const { config, messages, tools, executor, onStep, maxToolRounds = MAX_TOOL_ROUNDS } = options
  const baseUrl = normalizeBaseUrl(config.baseUrl)
  if (!baseUrl) throw new Error('未配置 AI 接口地址')
  if (!config.model) throw new Error('未配置模型名称')
  if (!config.apiKey) throw new Error('未配置 API Key')

  const url = `${baseUrl}/chat/completions`
  const headers = { Authorization: `Bearer ${config.apiKey}` }
  const toolsPayload = toOpenAiTools(tools)

  /** @type {Array<Record<string, unknown>>} */
  const convo = [...messages]
  /** @type {Array<{ name: string, args: Record<string, any>, ok: boolean, error?: string }>} */
  const steps = []

  for (let round = 0; round <= maxToolRounds; round++) {
    const finalRound = round === maxToolRounds
    const payload = finalRound
      ? { model: config.model, messages: [...convo] }
      : { model: config.model, messages: [...convo], tools: toolsPayload }

    const data = await postJson(url, headers, payload)
    const choice = data?.choices?.[0]?.message
    if (!choice || typeof choice !== 'object') {
      throw new Error('AI 响应格式异常：缺少 choices[0].message')
    }
    convo.push(choice)

    /** @type {Array<any>} */
    const toolCalls = Array.isArray(choice.tool_calls) ? choice.tool_calls : []
    if (toolCalls.length === 0) {
      return { content: String(choice.content || ''), steps, convo }
    }

    for (const call of toolCalls) {
      const name = String(call?.function?.name || '')
      /** @type {Record<string, any>} */
      let args = {}
      try {
        args = call?.function?.arguments ? JSON.parse(call.function.arguments) : {}
      } catch {
        args = {}
      }

      let ok = true
      /** @type {string | undefined} */
      let errorText
      let resultPayload
      try {
        if (!name) throw new Error('工具名为空')
        resultPayload = await executor(name, args)
      } catch (e) {
        ok = false
        errorText = e instanceof Error ? e.message : String(e)
        resultPayload = { error: errorText }
      }

      const step = { name, args, ok, error: errorText }
      steps.push(step)
      onStep?.(step)

      convo.push({
        role: 'tool',
        tool_call_id: String(call?.id || ''),
        content: JSON.stringify(resultPayload ?? null)
      })
    }
  }

  // 理论到不了这里（最后一轮不带 tools 必然返回文本或抛错）
  throw new Error('工具调用轮数超限')
}

/** 会话标题最长保留字符数（超出截断，CJK 12 字 ≈ 12 chars，留余量给英日文） */
const TITLE_MAX_CHARS = 24

/**
 * 用一次轻量补全为会话生成简短标题（不带工具，低 temperature）。
 * 失败由调用方兜底（保留首条消息截断标题），本函数只负责把文案收拾干净。
 * @param {{ baseUrl: string, model: string, apiKey: string }} config
 * @param {string} userText 首条用户消息
 * @param {string} replyText 首条助手回复（摘要用）
 * @returns {Promise<string>}
 */
export async function generateChatTitle(config, userText, replyText) {
  const baseUrl = normalizeBaseUrl(config.baseUrl)
  if (!baseUrl) throw new Error('未配置 AI 接口地址')
  if (!config.model) throw new Error('未配置模型名称')
  if (!config.apiKey) throw new Error('未配置 API Key')

  const data = await postJson(`${baseUrl}/chat/completions`, { Authorization: `Bearer ${config.apiKey}` }, {
    model: config.model,
    messages: [
      {
        role: 'system',
        content: '你是聊天会话的命名器。根据对话内容起一个简短标题概括主题，不超过12个字。只输出标题文本本身：不要引号、句末标点、任何前缀（如「标题：」）或解释。'
      },
      {
        role: 'user',
        content: `用户消息：${String(userText || '').slice(0, 500)}\n助手回复摘要：${String(replyText || '').slice(0, 300)}`
      }
    ],
    temperature: 0.3,
    max_tokens: 32
  })

  const raw = String(data?.choices?.[0]?.message?.content || '').trim()
  // 只取第一行非空文本，剥掉首尾配对引号
  const title = raw
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean) || ''
  const cleaned = title.replace(/^["'“”「『]+|["'“”」』。.]+$/g, '').trim()
  if (!cleaned) throw new Error('AI 未返回有效标题')
  return cleaned.slice(0, TITLE_MAX_CHARS)
}
