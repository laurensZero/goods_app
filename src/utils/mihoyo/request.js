/**
 * 米游铺请求传输层
 * 统一封装原生（CapacitorHttp）与 Web / 桌面（fetch + Vite 代理）双路径请求：
 *   - 原生：直连 api-mall.mihoyogift.com，Cookie 头原样发送
 *   - Web：走 /mihoyo-api 代理，Cookie 头转换为 x-cookie-forward（浏览器禁止 JS 设置 Cookie 头）
 * 并为两条路径统一补齐超时控制（连接 + 读取 + 总时长看门狗）。
 * 注意：mihoyoRequest 只负责传输与 JSON 解析；业务调用统一走 mihoyoApi，
 * 由它做 retcode 检查并抛出带 retcode 的 MihoyoApiError。
 */
import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { fetchWithPlatformBridge } from '@/utils/platform/http'

export const MIHOYO_API_BASE = 'https://api-mall.mihoyogift.com'
export const MIHOYO_REFERER = 'https://www.mihoyogift.com/'
export const DEFAULT_CONNECT_TIMEOUT_MS = 15000
export const DEFAULT_READ_TIMEOUT_MS = 30000
// 与 platform/http.js 的超时提示保持一致；
// 该文案绝不能命中 isMihoyoCookieExpiredError 的正则，否则超时会误判为 Cookie 失效
export const MIHOYO_TIMEOUT_MESSAGE = '请求超时，请检查网络连接'
// 网关/风控限流时返回纯文本 "Too Many Requests"，不能直接 JSON.parse；
// 单独归一成带 status 的错误，调用方才能识别为可重试，而不是误判成登录失效
export const MIHOYO_RATE_LIMIT_MESSAGE = '请求过于频繁（429），请稍后重试'

/**
 * 米游铺 API 通用请求头。
 * @param {Object} [options]
 * @param {string} [options.cookie=''] - 登录态 Cookie；传入后附带 x-rpc-client_type: 5
 * @param {boolean} [options.authed=false] - 已登录接口（无 Cookie 也带 client_type 标记）
 * @param {Object} [options.extra={}] - 额外头（Content-Type / Origin 等），覆盖默认值
 */
export function buildMihoyoHeaders({ cookie = '', authed = false, extra = {} } = {}) {
  const headers = {
    'Referer': MIHOYO_REFERER,
    'x-rpc-language': 'zh-cn',
  }
  if (authed || cookie) {
    headers['x-rpc-client_type'] = '5'
    if (cookie) headers['Cookie'] = cookie
  }
  return { ...headers, ...extra }
}

/** 业务级错误：retcode 非 0（或 HTTP 4xx/5xx，带 status） */
export class MihoyoApiError extends Error {
  constructor(message, { retcode = null, status = null } = {}) {
    super(message)
    this.name = 'MihoyoApiError'
    this.retcode = retcode
    this.status = status
  }
}

/**
 * mihoyoRequest + 统一 retcode 检查。retcode 非 0 抛 MihoyoApiError（携带 retcode），
 * 成功返回完整 JSON（含 retcode/data/message）。
 */
export async function mihoyoApi(path, options = {}) {
  const json = await mihoyoRequest(path, options)
  if (!json || json.retcode !== 0) {
    throw new MihoyoApiError(
      json?.message || `接口错误 ${json?.retcode ?? 'unknown'}`,
      { retcode: json?.retcode ?? null },
    )
  }
  return json
}

function buildResponseLike({ status = 0, headers = {}, body = '', url = '' }) {
  const normalizedHeaders = Object.entries(headers || {}).reduce((result, [key, value]) => {
    result[String(key || '').toLowerCase()] = String(value || '')
    return result
  }, {})

  return {
    ok: status >= 200 && status < 300,
    status,
    url,
    headers: {
      get(name) {
        return normalizedHeaders[String(name || '').toLowerCase()] ?? null
      },
    },
    async json() {
      if (body == null || body === '') return {}
      return typeof body === 'string' ? JSON.parse(body) : body
    },
    async text() {
      return typeof body === 'string' ? body : JSON.stringify(body ?? {})
    },
  }
}

/** 判断错误是否为超时/中止类错误 */
function isTimeoutLikeError(error) {
  return error?.name === 'AbortError' || /timeout|timed\s*out|超时/i.test(String(error?.message || ''))
}

/**
 * Web 路径下的请求头转换：
 * 浏览器不允许 JS 设置 Cookie 头（Forbidden Header），
 * 改用自定义 x-cookie-forward，由 Vite 代理转换为真正的 Cookie
 */
function toWebHeaders(headers = {}) {
  if ('Cookie' in headers || 'cookie' in headers) {
    const next = { ...headers }
    next['x-cookie-forward'] = encodeURIComponent(next['Cookie'] ?? next['cookie'] ?? '')
    delete next['Cookie']
    delete next['cookie']
    return next
  }
  return { ...headers }
}

/**
 * 发起米游铺 API 请求并返回解析后的 JSON
 * @param {string} path - API 相对路径（以 / 开头）
 * @param {Object} [options]
 * @param {string} [options.method='GET']
 * @param {Object} [options.headers={}]
 * @param {Object|null} [options.data=null] - POST 请求体（对象，Web 端自动 JSON.stringify）
 * @param {number} [options.connectTimeoutMs=15000]
 * @param {number} [options.readTimeoutMs=30000]
 * @returns {Promise<Object>} 解析后的 JSON（不检查 retcode）
 */
export async function mihoyoRequest(path, {
  method = 'GET',
  headers = {},
  data = null,
  connectTimeoutMs = DEFAULT_CONNECT_TIMEOUT_MS,
  readTimeoutMs = DEFAULT_READ_TIMEOUT_MS,
} = {}) {
  const { json } = await mihoyoRequestWithResponse(path, {
    method,
    headers,
    data,
    connectTimeoutMs,
    readTimeoutMs,
  })
  return json
}

export async function mihoyoRequestWithResponse(path, {
  method = 'GET',
  headers = {},
  data = null,
  connectTimeoutMs = DEFAULT_CONNECT_TIMEOUT_MS,
  readTimeoutMs = DEFAULT_READ_TIMEOUT_MS,
} = {}) {
  const totalTimeoutMs = connectTimeoutMs + readTimeoutMs

  if (Capacitor.isNativePlatform()) {
    // 原生平台（Android / iOS）：CapacitorHttp 不受浏览器 CORS 限制
    // readTimeout 在 Android 上每收到一段数据就会重置，慢速滴流可能拖过上限，
    // 因此再套一层 Promise.race 看门狗保证总时长有界
    let timeoutId
    try {
      const res = await Promise.race([
        CapacitorHttp.request({
          url: `${MIHOYO_API_BASE}${path}`,
          method,
          headers,
          ...(data != null ? { data } : {}),
          connectTimeout: connectTimeoutMs,
          readTimeout: readTimeoutMs,
        }),
        new Promise((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error(MIHOYO_TIMEOUT_MESSAGE)), totalTimeoutMs)
        }),
      ])
      const status = Number(res.status || 0)
      const body = res.data
      const response = buildResponseLike({
        status,
        headers: res.headers || {},
        body,
        url: `${MIHOYO_API_BASE}${path}`,
      })

      // 原生端仍以 retcode 为准，但 429/网关纯文本必须先给出可读错误。
      // 直接 JSON.parse("Too Many Requests") 会抛 "Unexpected token 'T'..."，
      // 这个文案里的 token 会被上层鉴权正则误判成 Cookie 失效。
      if (status === 429) {
        throw new MihoyoApiError(MIHOYO_RATE_LIMIT_MESSAGE, { status })
      }
      if (typeof body !== 'string') return { json: body ?? {}, response }
      if (body === '') return { json: {}, response }
      try {
        return { json: JSON.parse(body), response }
      } catch {
        if (status === 429 || /too many requests/i.test(body)) {
          throw new MihoyoApiError(MIHOYO_RATE_LIMIT_MESSAGE, { status: status || 429 })
        }
        if (status && (status < 200 || status >= 300)) {
          throw new MihoyoApiError(`请求失败（${status}）`, { status })
        }
        throw new MihoyoApiError(`响应解析失败（${status || 'unknown'}）`, { status: status || null })
      }
    } catch (error) {
      if (isTimeoutLikeError(error)) throw new Error(MIHOYO_TIMEOUT_MESSAGE)
      throw error
    } finally {
      clearTimeout(timeoutId)
    }
  }

  // Web / 浏览器开发：通过 Vite proxy（/mihoyo-api → api-mall.mihoyogift.com）
  // AbortController 覆盖浏览器 fetch 路径；
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), totalTimeoutMs)
  try {
    const res = await fetchWithPlatformBridge(`/mihoyo-api${path}`, {
      method,
      headers: toWebHeaders(headers),
      ...(data != null ? { body: JSON.stringify(data) } : {}),
      signal: controller.signal,
      timeoutMs: totalTimeoutMs,
    })
    if (!res.ok) {
      const error = new Error(`请求失败（${res.status}）`)
      error.status = res.status
      throw error
    }
    try {
      return {
        json: await res.json(),
        response: res,
      }
    } catch {
      throw new MihoyoApiError(`响应解析失败（${res.status || 'unknown'}）`, { status: res.status || null })
    }
  } catch (error) {
    if (isTimeoutLikeError(error)) throw new Error(MIHOYO_TIMEOUT_MESSAGE)
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}
