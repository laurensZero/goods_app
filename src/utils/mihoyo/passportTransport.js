/**
 * 米游社通行证（passport）接口传输层。
 * api-mall 商城接口走 request.js 的 mihoyoRequest；其余 mihoyo 域名
 * （passport-api.mihoyogift.com / passport-api.mihoyo.com）统一走这里：
 *   - 原生：CapacitorHttp 直连 base
 *   - Web：走对应 Vite / Pages 代理；需要登录态时 Cookie 头转 x-cookie-forward，
 *     UA / Referer 浏览器禁止设置，由代理补齐
 * 返回 { json, status, headers }，retcode 检查仍由调用方处理（两个接口语义不同）。
 */
import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { fetchWithPlatformBridge } from '@/utils/platform/http'

/** 生产网页缺少对应反代时，代理回退返回 SPA index.html 的哨兵错误码 */
export const PROXY_UNAVAILABLE_CODE = 'proxy-unavailable'

function isHtmlPayload(text, contentType = '') {
  const head = String(text || '').trimStart().slice(0, 200).toLowerCase()
  return /text\/html/i.test(String(contentType || '')) ||
    head.startsWith('<!doctype html') ||
    head.startsWith('<html')
}

function createProxyUnavailableError() {
  const error = new Error('当前环境没有可用的通行证接口代理')
  error.code = PROXY_UNAVAILABLE_CODE
  return error
}

function parseJsonBody(data) {
  if (data == null || data === '') return {}
  try {
    return typeof data === 'string' ? JSON.parse(data) : data
  } catch {
    return {}
  }
}

/**
 * @param {Object} options
 * @param {string} options.base - 原生直连域名（含协议）
 * @param {string} options.proxy - Web 代理前缀（如 /mihoyo-passport）
 * @param {string} options.path - 接口相对路径
 * @param {string} [options.query=''] - 已编码的查询串（不含 ?）
 * @param {Object} [options.headers={}]
 * @param {Object|null} [options.data=null] - POST 请求体
 * @param {number} [options.timeoutMs=10000] - 原生 connect/read 超时与 Web fetch 超时
 * @param {boolean} [options.forwardCookie=false] - Web 端把 Cookie 头转成 x-cookie-forward
 * @param {boolean} [options.detectHtmlPayload=false] - 代理回退成 HTML 时抛 proxy-unavailable
 * @returns {Promise<{ json: Object, status: number, headers: Object|Headers }>}
 */
export async function passportRequest({
  base,
  proxy,
  path,
  query = '',
  headers = {},
  data = null,
  timeoutMs = 10000,
  forwardCookie = false,
  detectHtmlPayload = false,
}) {
  const suffix = query ? `?${query}` : ''

  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.request({
      url: `${base}${path}${suffix}`,
      method: data != null ? 'POST' : 'GET',
      headers,
      ...(data != null ? { data } : {}),
      connectTimeout: timeoutMs,
      readTimeout: timeoutMs,
    })
    if (Number(res.status) >= 400) {
      const error = new Error(`请求失败（${res.status}）`)
      error.status = Number(res.status)
      throw error
    }
    if (detectHtmlPayload) {
      const contentType = res.headers?.['content-type'] || res.headers?.['Content-Type'] || ''
      if (typeof res.data === 'string' && isHtmlPayload(res.data, contentType)) {
        throw createProxyUnavailableError()
      }
    }
    return {
      json: parseJsonBody(res.data),
      status: Number(res.status || 0),
      headers: res.headers || {},
    }
  }

  let webHeaders = { ...headers }
  if (forwardCookie) {
    webHeaders['x-cookie-forward'] = encodeURIComponent(webHeaders.Cookie || '')
    delete webHeaders.Cookie
    // 浏览器禁止设置 UA / Referer，由 Vite 代理补齐
    delete webHeaders['User-Agent']
    delete webHeaders.Referer
  }

  const res = await fetchWithPlatformBridge(`${proxy}${path}${suffix}`, {
    method: data != null ? 'POST' : 'GET',
    headers: webHeaders,
    ...(data != null ? { body: JSON.stringify(data) } : {}),
    timeoutMs,
  })
  if (!res.ok) {
    const error = new Error(`请求失败（${res.status}）`)
    error.status = res.status
    throw error
  }

  const contentType = res.headers?.get?.('content-type') || ''
  const text = await res.text()
  if (detectHtmlPayload && isHtmlPayload(text, contentType)) {
    throw createProxyUnavailableError()
  }
  let json
  try {
    json = text ? JSON.parse(text) : {}
  } catch {
    throw new Error(`响应不是 JSON：${text.slice(0, 120)}`)
  }
  return { json, status: res.status, headers: res.headers }
}
