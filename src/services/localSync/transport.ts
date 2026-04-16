import { LOCAL_SYNC_ERROR_HINT, LOCAL_SYNC_TIMEOUT } from './constants'

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = String(baseUrl || '').trim().replace(/\/+$/, '')
  if (!trimmed) {
    throw new Error('目标地址为空')
  }
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
}

function classifyRequestError(error: unknown): string {
  const message = String((error as Error)?.message || '')
  if (message.includes('AbortError') || message.includes('timeout')) {
    return LOCAL_SYNC_ERROR_HINT.timeout
  }
  if (message.includes('413')) {
    return '请求体过大，已被接收端拒绝。请重试，或降低单次传输负载。'
  }
  if (message.includes('403')) {
    return LOCAL_SYNC_ERROR_HINT.forbidden
  }
  if (message.match(/^\d{3}\s/)) {
    return `接收端返回错误：${message}`
  }
  return LOCAL_SYNC_ERROR_HINT.network
}

export async function requestJson<T>(baseUrl: string, path: string, init: RequestInit = {}, timeoutMs = LOCAL_SYNC_TIMEOUT.requestMs): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs)

  try {
    const response = await fetch(`${normalizeBaseUrl(baseUrl)}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(init.headers || {})
      },
      signal: init.signal || controller.signal
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`${response.status} ${text || response.statusText}`)
    }

    return await response.json() as T
  } catch (error) {
    throw new Error(classifyRequestError(error))
  } finally {
    clearTimeout(timer)
  }
}

export async function requestGet<T>(baseUrl: string, path: string, timeoutMs = LOCAL_SYNC_TIMEOUT.requestMs): Promise<T> {
  return requestJson<T>(baseUrl, path, { method: 'GET' }, timeoutMs)
}

export { normalizeBaseUrl }
