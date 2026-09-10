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
      '联网搜索（Tavily）。仅在需要训练数据之外或有时效性的信息时调用，例如新番/动画播出、谷子发售与再版、市价行情、冷门作品/角色设定、近期活动。常识性术语（吧唧/痛包是什么等）不要搜。query 用简洁关键词；返回 title/url/content 摘要，回答时可附来源链接。',
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

/**
 * POST JSON。原生 CapacitorHttp 直连；Web 走 fetch（Tavily 支持浏览器 CORS）。
 * @param {string} url
 * @param {Record<string, string>} headers
 * @param {unknown} body
 * @returns {Promise<any>}
 */
async function postJson(url, headers, body) {
  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.request({
      url,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      data: body,
      connectTimeout: HTTP_TIMEOUT_MS,
      readTimeout: HTTP_TIMEOUT_MS
    })
    const status = Number(response?.status || 0)
    const data = typeof response?.data === 'string' ? tryParseJson(response.data) : response?.data
    if (status >= 400) throw new Error(searchErrorDetail(status, data))
    return data
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS)
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
      throw new Error(`搜索超时（${HTTP_TIMEOUT_MS / 1000}s）`)
    }
    throw e
  } finally {
    clearTimeout(timer)
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
 */
export function createWebSearchToolHandlers({ getConfig }) {
  /** @param {Record<string, any>} args */
  async function web_search(args) {
    const query = asText(args?.query).trim()
    if (!query) throw new Error('query 必填')

    const apiKey = asText(getConfig()?.searchApiKey).trim()
    if (!apiKey) {
      throw new Error('未配置搜索 API Key：请在 AI 设置里填写 Tavily Key（tvly-…），或改用不需要联网的问题')
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
      }
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
