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
/** 流式看门狗：数据持续到达证明链路存活，总时长上限放宽到 5 分钟 */
const STREAM_TIMEOUT_MS = 300000
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
  const { requestUrl, headers: proxyHeaders } = toProxyRequest(url, headers)
  /** @type {Record<string, string>} */
  const requestHeaders = { 'Content-Type': 'application/json', ...proxyHeaders }

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
 * dev 下经 Vite 中间件 /ai-proxy 转发（WebView 直连常被 CORS 拦截）。
 * @param {string} url
 * @param {Record<string, string>} headers
 * @returns {{ requestUrl: string, headers: Record<string, string> }}
 */
function toProxyRequest(url, headers) {
  if (import.meta.env.DEV) {
    const base = url.replace(/\/chat\/completions$/, '')
    if (base !== url) {
      return {
        requestUrl: `${window.location.origin}/ai-proxy/chat/completions`,
        headers: { ...headers, 'x-ai-target': base }
      }
    }
  }
  return { requestUrl: url, headers }
}

/**
 * 流式执行一轮对话补全（SSE），增量实时通过 onDelta 抛给调用方渲染。
 * WebView fetch 直连需要端点允许 CORS；传输类失败（CORS/网络/不支持流式）
 * 由调用方回退非流式，HTTP 4xx/5xx 原样抛 AiRequestError（避免双重请求）。
 * @param {string} url
 * @param {Record<string, string>} headers
 * @param {unknown} body
 * @param {(delta: { reasoning?: string, content?: string, reset?: boolean }) => void} [onDelta]
 * @returns {Promise<{ content: string, reasoning: string, toolCalls: Array<Record<string, any>> }>}
 */
async function streamChatRound(url, headers, body, onDelta) {
  if (typeof fetch !== 'function' || typeof window === 'undefined') {
    throw new Error('当前环境不支持流式请求')
  }
  const { requestUrl, headers: requestHeaders } = toProxyRequest(url, headers)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS)
  try {
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...requestHeaders },
      body: JSON.stringify(body),
      signal: controller.signal
    })
    if (!response.ok) {
      const text = await response.text()
      throw new AiRequestError(response.status, extractErrorDetail(text))
    }
    if (!response.body || typeof response.body.getReader !== 'function') {
      throw new Error('响应不可读（不支持流式）')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let content = ''
    let reasoning = ''
    /** @type {Array<Record<string, any>>} */
    const toolCalls = []
    let sawData = false

    /** @param {string} rawLine */
    const handleLine = (rawLine) => {
      const line = rawLine.trim()
      if (!line.startsWith('data:')) return
      const data = line.slice(5).trim()
      if (!data || data === '[DONE]') return
      sawData = true
      /** @type {any} */
      let json
      try {
        json = JSON.parse(data)
      } catch {
        return
      }
      const delta = json?.choices?.[0]?.delta
      if (!delta) return
      const reasoningDelta = String(delta.reasoning_content ?? delta.reasoning ?? '')
      const contentDelta = String(delta.content ?? '')
      if (reasoningDelta) {
        reasoning += reasoningDelta
        onDelta?.({ reasoning: reasoningDelta })
      }
      if (contentDelta) {
        content += contentDelta
        onDelta?.({ content: contentDelta })
      }
      for (const call of Array.isArray(delta.tool_calls) ? delta.tool_calls : []) {
        const index = Math.max(0, Number(call?.index) || 0)
        const existing = toolCalls[index] || (toolCalls[index] = { id: '', type: 'function', function: { name: '', arguments: '' } })
        if (call?.id) existing.id = String(call.id)
        if (call?.function?.name) existing.function.name += String(call.function.name)
        if (call?.function?.arguments) existing.function.arguments += String(call.function.arguments)
      }
    }

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let newlineIndex = buffer.indexOf('\n')
      while (newlineIndex >= 0) {
        handleLine(buffer.slice(0, newlineIndex))
        buffer = buffer.slice(newlineIndex + 1)
        newlineIndex = buffer.indexOf('\n')
      }
    }
    if (buffer.trim()) handleLine(buffer)

    if (!sawData && !content && !reasoning && toolCalls.length === 0) {
      throw new Error('流式响应为空')
    }

    return { content, reasoning, toolCalls: toolCalls.filter(Boolean) }
  } finally {
    clearTimeout(timer)
  }
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
 * @property {(delta: { reasoning?: string, content?: string, reset?: boolean }) => void} [onDelta]
 *   流式增量回调（reasoning/content 为增量片段，reset 表示放弃已流出的部分并回退非流式）；
 *   提供时优先走 SSE 流式，传输失败自动回退
 * @property {number} [maxToolRounds]
 */

/**
 * 执行一次「可能含多轮工具调用」的完整对话请求。
 * @param {RunChatOptions} options
 * @returns {Promise<{ content: string, steps: Array<{ name: string, args: Record<string, any>, ok: boolean, error?: string }>, convo: Array<Record<string, unknown>>, reasoning: string }>}
 */
export async function runChatCompletion(options) {
  const { config, messages, tools, executor, onStep, onDelta, maxToolRounds = MAX_TOOL_ROUNDS } = options
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
  /** @type {string[]} 各轮思维链（reasoning_content / reasoning），非流式下随最终消息一起返回 */
  const reasoningParts = []

  for (let round = 0; round <= maxToolRounds; round++) {
    const finalRound = round === maxToolRounds
    const payload = finalRound
      ? { model: config.model, messages: [...convo] }
      : { model: config.model, messages: [...convo], tools: toolsPayload }

    /** @type {Record<string, unknown> | null} */
    let choice = null
    if (onDelta) {
      try {
        const streamed = await streamChatRound(url, headers, { ...payload, stream: true }, onDelta)
        // 流式路径手工拼 message：不回传 reasoning 字段（部分端点拒绝回显）
        choice = { role: 'assistant', content: streamed.content }
        if (streamed.toolCalls.length > 0) choice.tool_calls = streamed.toolCalls
        if (streamed.reasoning) reasoningParts.push(streamed.reasoning)
      } catch (error) {
        if (error instanceof AiRequestError) throw error
        // CORS/网络/环境不支持流式 → 丢弃已流出片段，回退非流式
        onDelta?.({ reset: true })
      }
    }

    if (!choice) {
      const data = await postJson(url, headers, payload)
      choice = data?.choices?.[0]?.message
      if (!choice || typeof choice !== 'object') {
        throw new Error('AI 响应格式异常：缺少 choices[0].message')
      }
      const roundReasoning = String(choice.reasoning_content ?? choice.reasoning ?? '').trim()
      if (roundReasoning) reasoningParts.push(roundReasoning)
    }
    convo.push(choice)

    /** @type {Array<any>} */
    const toolCalls = Array.isArray(choice.tool_calls) ? choice.tool_calls : []
    if (toolCalls.length === 0) {
      const content = String(choice.content || '')
      const reasoning = reasoningParts.join('\n\n')
      // 部分模型/网关会把完整回答写进思维链而 content 为空——直接返回会让用户
      // 看到一条没有正文的空消息（观感即「卡住了」）。此时把思维链顶上当正文。
      if (!content.trim() && reasoning.trim()) {
        return { content: reasoning, steps, convo, reasoning: '' }
      }
      if (!content.trim()) {
        throw new Error('AI 返回了空回复，请重试')
      }
      return { content, steps, convo, reasoning }
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

/** 收拾模型输出成单行干净标题：剥推理段/前缀符号/配对引号 */
function cleanTitleText(raw) {
  const noThink = String(raw || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/i, '')
  const firstLine = noThink.split('\n').map((line) => line.trim()).find(Boolean) || ''
  return firstLine
    .replace(/^[#>*\-\s`]+/, '')
    .replace(/^(?:标题|题目|主题|name|title)\s*[:：]\s*/i, '')
    .replace(/^["'“”「『]+|["'“”」』。.]+$/g, '')
    .trim()
    .slice(0, TITLE_MAX_CHARS)
}

/**
 * 用一次轻量补全为会话生成简短标题（不带工具，fire-and-forget 场景）。
 * payload 刻意保持最小（只有 model + messages）：temperature/max_tokens 会被
 * 部分 OpenAI 兼容网关直接拒绝（o 系/gpt-5 只收 max_completion_tokens 且禁自定义
 * temperature），推理模型还会把 tiny max_tokens 整个烧在思考上返回空内容——
 * 这正是命名静默失败的根因。失败由调用方兜底（保留首条消息截断标题）。
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
    ]
  })

  const cleaned = cleanTitleText(data?.choices?.[0]?.message?.content)
  if (!cleaned) throw new Error('AI 未返回有效标题')
  return cleaned
}
