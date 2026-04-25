import { invoke } from '@tauri-apps/api/core'

const DEFAULT_TIMEOUT_MS = 30000

const DESKTOP_PROXY_RULES = Object.freeze([
  { prefix: '/mihoyo-api', target: 'https://api-mall.mihoyogift.com' },
  { prefix: '/mihoyo-static', target: 'https://sdk-webstatic.mihoyo.com' },
  { prefix: '/netease-api', target: 'https://music.163.com' },
  { prefix: '/github-oauth', target: 'https://github.com' }
])

function isAbortError(error) {
  return error?.name === 'AbortError' || String(error?.message || '').includes('aborted')
}

export function isPlatformBridgeAvailable() {
  return typeof window !== 'undefined' && typeof window.__TAURI_INTERNALS__?.invoke === 'function'
}

function normalizeHeaders(headers = {}) {
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries())
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers)
  }

  return Object.entries(headers || {}).reduce((result, [key, value]) => {
    if (value == null) return result
    result[key] = String(value)
    return result
  }, {})
}

function normalizeNativeHeaders(headers = {}) {
  const normalized = { ...normalizeHeaders(headers) }
  const forwardedCookie = String(normalized['x-cookie-forward'] || normalized['X-Cookie-Forward'] || '').trim()

  if (forwardedCookie && !normalized.Cookie && !normalized.cookie) {
    normalized.Cookie = decodeURIComponent(forwardedCookie)
  }

  delete normalized['x-cookie-forward']
  delete normalized['X-Cookie-Forward']
  return normalized
}

function normalizeBody(body) {
  if (body == null) return null
  if (typeof body === 'string') return body
  if (body instanceof URLSearchParams) return body.toString()
  return String(body)
}

function resolveDesktopProxyUrl(url) {
  const rawUrl = String(url || '').trim()
  if (!rawUrl.startsWith('/')) return rawUrl

  for (const rule of DESKTOP_PROXY_RULES) {
    if (rawUrl === rule.prefix || rawUrl.startsWith(`${rule.prefix}/`)) {
      return `${rule.target}${rawUrl.slice(rule.prefix.length)}`
    }
  }

  return rawUrl
}

function shouldUseNativeHttp(url) {
  if (!isPlatformBridgeAvailable()) return false

  const rawUrl = String(url || '').trim()
  if (!rawUrl) return false
  if (/^https:\/\//i.test(rawUrl)) return true
  return DESKTOP_PROXY_RULES.some((rule) => rawUrl === rule.prefix || rawUrl.startsWith(`${rule.prefix}/`))
}

function createNativeResponse({ status = 0, headers = {}, body = '', url = '' }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    url,
    headers: {
      get(name) {
        return headers[String(name || '').toLowerCase()] ?? null
      }
    },
    async json() {
      if (!body) return {}
      return JSON.parse(body)
    },
    async text() {
      return String(body || '')
    }
  }
}

export async function fetchWithPlatformBridge(input, init = {}) {
  const requestUrl = typeof input === 'string' ? input : String(input?.url || '')
  if (!shouldUseNativeHttp(requestUrl)) {
    return fetch(input, init)
  }

  const method = String(init?.method || 'GET').toUpperCase()
  const headers = normalizeNativeHeaders(init?.headers)
  const body = normalizeBody(init?.body)
  const resolvedUrl = resolveDesktopProxyUrl(requestUrl)
  const timeoutMs = Math.max(1000, Number(init?.timeoutMs) || DEFAULT_TIMEOUT_MS)

  if (init?.signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError')
  }

  let abortHandler = null
  let timeoutId = null
  const requestPromise = invoke('native_http_request', {
    payload: {
      method,
      url: resolvedUrl,
      headers,
      body
    }
  })

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('请求超时，请检查网络连接'))
    }, timeoutMs)

    abortHandler = () => {
      clearTimeout(timeoutId)
      reject(new DOMException('The operation was aborted.', 'AbortError'))
    }

    init?.signal?.addEventListener('abort', abortHandler, { once: true })
  })

  try {
    const response = await Promise.race([requestPromise, timeoutPromise])
    const normalizedHeaders = Object.entries(response?.headers || {}).reduce((result, [key, value]) => {
      result[String(key || '').toLowerCase()] = String(value || '')
      return result
    }, {})

    return createNativeResponse({
      status: Number(response?.status || 0),
      headers: normalizedHeaders,
      body: String(response?.body || ''),
      url: resolvedUrl
    })
  } catch (error) {
    if (isAbortError(error)) {
      throw error
    }
    throw new Error(String(error?.message || '网络请求失败'))
  } finally {
    clearTimeout(timeoutId)
    if (abortHandler) {
      init?.signal?.removeEventListener('abort', abortHandler)
    }
  }
}

export async function requestPlatformJson(url, options = {}) {
  const response = await fetchWithPlatformBridge(url, options)
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    const message = String(
      payload?.error_description
      || payload?.message
      || payload?.error
      || `请求失败（${response.status}）`
    ).trim()
    throw new Error(message || `请求失败（${response.status}）`)
  }

  return payload
}

export async function requestPlatformText(url, options = {}) {
  const response = await fetchWithPlatformBridge(url, options)
  const text = await response.text()

  if (!response.ok) {
    throw new Error(text || `请求失败（${response.status}）`)
  }

  return text
}
