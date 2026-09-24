// @ts-check
/**
 * 联网搜索工具：web_search（Tavily）
 *
 * 可选能力：用户在 AI 设置里填了 searchApiKey 才注册工具。
 * 原生走 CapacitorHttp（不受 WebView CORS 限制）；Web 走 fetch。
 */

import { Capacitor, CapacitorHttp } from '@capacitor/core'

const TAVILY_URL = 'https://api.tavily.com/search'
const HTTP_TIMEOUT_MS = 20000
/** 单条摘要上限，防止长文把上下文撑爆 */
const RESULT_CONTENT_MAX = 800
const MAX_RESULTS = 5

/** @type {import('@/services/mcp/toolDefinitions').McpToolDefinition[]} */
export const WEB_SEARCH_TOOL_DEFINITIONS = [
  {
    name: 'web_search',
    description:
      '联网搜索（Tavily）。仅搜时效/训练外信息（新番、发售、市价、冷门设定、近期活动）；常识术语勿搜。回答附 1-2 个来源链接。',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索关键词，建议带中文/英文作品名以便命中'
        }
      },
      required: ['query']
    }
  }
]

/** @param {unknown} value */
function asText(value) {
  return String(value ?? '')
}

/** @param {AbortSignal} [signal] */
function throwIfAborted(signal) {
  if (signal?.aborted) throw new DOMException('已停止生成', 'AbortError')
}

/**
 * 用户中止：立刻结束等待（原生 CapacitorHttp 无法真正 cancel 在途请求）。
 * @template T
 * @param {Promise<T>} promise
 * @param {AbortSignal} [signal]
 * @returns {Promise<T>}
 */
function raceWithAbort(promise, signal) {
  if (!signal) return promise
  throwIfAborted(signal)
  let onAbort
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      onAbort = () => reject(new DOMException('已停止生成', 'AbortError'))
      signal.addEventListener('abort', onAbort, { once: true })
    })
  ]).finally(() => {
    if (onAbort) signal.removeEventListener('abort', onAbort)
  })
}

/**
 * POST JSON。原生 CapacitorHttp 直连；Web 走 fetch（Tavily 支持浏览器 CORS）。
 * @param {string} url
 * @param {Record<string, string>} headers
 * @param {unknown} body
 * @param {AbortSignal} [externalSignal]
 * @returns {Promise<any>}
 */
async function postJson(url, headers, body, externalSignal) {
  throwIfAborted(externalSignal)

  if (Capacitor.isNativePlatform()) {
    const response = await raceWithAbort(
      CapacitorHttp.request({
        url,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        data: body,
        connectTimeout: HTTP_TIMEOUT_MS,
        readTimeout: HTTP_TIMEOUT_MS
      }),
      externalSignal
    )
    const status = Number(response?.status || 0)
    const data = typeof response?.data === 'string' ? tryParseJson(response.data) : response?.data
    if (status >= 400) throw new Error(searchErrorDetail(status, data))
    return data
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS)
  const onExternalAbort = () => controller.abort()
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort()
    else externalSignal.addEventListener('abort', onExternalAbort, { once: true })
  }
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal
    })
    const data = await response.json().catch(() => null)
    if (!response.ok) throw new Error(searchErrorDetail(response.status, data))
    return data
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      if (externalSignal?.aborted) throw new DOMException('已停止生成', 'AbortError')
      throw new Error(`搜索超时（${HTTP_TIMEOUT_MS / 1000}s）`)
    }
    throw e
  } finally {
    clearTimeout(timer)
    externalSignal?.removeEventListener('abort', onExternalAbort)
  }
}

/** @param {string} text */
function tryParseJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/**
 * @param {number} status
 * @param {unknown} data
 */
function searchErrorDetail(status, data) {
  const message = /** @type {any} */ (data)?.detail || /** @type {any} */ (data)?.error?.message || /** @type {any} */ (data)?.message
  if (typeof message === 'string' && message) {
    return `搜索失败（HTTP ${status}）：${message}`
  }
  if (typeof data === 'string' && data) {
    return `搜索失败（HTTP ${status}）：${data.slice(0, 200)}`
  }
  return `搜索失败（HTTP ${status}）`
}

/**
 * @param {Object} deps
 * @param {() => { searchApiKey?: string }} deps.getConfig
 * @param {() => AbortSignal | undefined} [deps.getSignal] 当前轮停止信号（用户点停止生成）
 */
export function createWebSearchToolHandlers({ getConfig, getSignal }) {
  /** @param {Record<string, any>} args */
  async function web_search(args) {
    const signal = typeof getSignal === 'function' ? getSignal() : undefined
    if (signal?.aborted) throw new DOMException('已停止生成', 'AbortError')

    const query = asText(args?.query).trim()
    if (!query) throw new Error('query 必填')

    const apiKey = asText(getConfig()?.searchApiKey).trim()
    if (!apiKey) {
      // 结构化返回而非抛错：让模型拿到 needsSetup 后引导用户去绑定 Key（app://ai_service）
      return {
        query,
        unavailable: true,
        needsSetup: true,
        results: [],
        resultCount: 0,
        guide:
          '本机未配置 Tavily 搜索 Key（searchApiKey），联网搜索不可用。' +
          '请如实告知用户：需要时可在「我的 → AI 服务设置」填写 Tavily Key（tvly-…）开启联网；' +
          '并附跳转按钮 [打开 AI 设置](app://ai_service)。不要编造搜索结果。'
      }
    }

    const data = await postJson(
      TAVILY_URL,
      { Authorization: `Bearer ${apiKey}` },
      {
        query,
        max_results: MAX_RESULTS,
        search_depth: 'basic',
        include_answer: false,
        include_raw_content: false
      },
      signal
    )

    const rawResults = Array.isArray(data?.results) ? data.results : []
    const results = rawResults.slice(0, MAX_RESULTS).map((/** @type {any} */ item) => ({
      title: asText(item?.title).slice(0, 200),
      url: asText(item?.url),
      content: asText(item?.content).slice(0, RESULT_CONTENT_MAX)
    }))

    return {
      query,
      results,
      resultCount: results.length
    }
  }

  return { web_search }
}
