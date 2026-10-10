/**
 * 淘宝请求传输层（PC 详情页 SSR HTML）
 *
 * 与米游铺同构的双路径：
 *   - 原生：CapacitorHttp 直连 item.taobao.com，Cookie/UA/Referer 头原样发送
 *   - Web：走 Vite 代理 /taobao-page，Cookie 转成 x-cookie-forward，
 *     UA/Referer 由代理补齐（浏览器禁止 JS 设置这些头）
 *
 * 注意：原生 OkHttp 的 TLS 指纹与 Chrome 不同，存在被 `_____tmd_____` 风控拦下的风险，
 * 失败时由 service 层识别并给出可读错误（见 docs/taobao-mtop-api.md 第 8 节）。
 */
import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { getTaobaoCookie } from './cookie'

export const TAOBAO_DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
export const TAOBAO_REFERER = 'https://www.taobao.com/'
const PAGE_PROXY_PREFIX = '/taobao-page'
const DEFAULT_TIMEOUT_MS = 20000

export class TaobaoRequestError extends Error {
  constructor(code, message) {
    super(message || code)
    this.name = 'TaobaoRequestError'
    this.code = code
  }
}

function buildHeaders(cookie, referer) {
  const headers = {
    'User-Agent': TAOBAO_DESKTOP_UA,
    'Referer': referer || TAOBAO_REFERER,
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  }
  if (cookie) headers.Cookie = cookie
  return headers
}

function toWebHeaders(cookie, referer, target) {
  const headers = {
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    // 目标源（如 h5api.m.taobao.com）：浏览器只能同源请求，由代理回填真实地址
    'x-taobao-origin': target.origin,
  }
  // 浏览器禁止 JS 设置 Cookie/UA/Referer → 交给 Vite 代理补齐
  if (cookie) headers['x-cookie-forward'] = encodeURIComponent(cookie)
  if (referer) headers['x-referer-forward'] = encodeURIComponent(referer)
  return headers
}

/**
 * GET 一个淘宝地址，返回文本与响应头
 * @param {string} url 绝对地址（item.taobao.com 详情页、h5api.m.taobao.com mtop 接口）
 * @param {{cookie?:string, timeoutMs?:number, referer?:string}} [options]
 *   referer 覆盖默认 www.taobao.com（mtop 搜索需 s.taobao.com）
 * @returns {Promise<{status:number, body:string, headers:Record<string,string>}>}
 *   headers：原生为 CapacitorHttp 响应头；Web 为代理回传的 x-upstream-set-cookie（mtop 换 token 用）
 */
export async function taobaoPageGet(url, options = {}) {
  const cookie = options.cookie ?? (await getTaobaoCookie())
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS
  const referer = options.referer || ''

  if (Capacitor.isNativePlatform()) {
    let timer
    try {
      const response = await Promise.race([
        CapacitorHttp.request({
          url,
          method: 'GET',
          headers: buildHeaders(cookie, referer),
          connectTimeout: timeoutMs,
          readTimeout: timeoutMs,
        }),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new TaobaoRequestError('NETWORK', '请求超时')), timeoutMs + 500)
        }),
      ])
      const status = Number(response.status || 0)
      const body = typeof response.data === 'string' ? response.data : String(response.data ?? '')
      return { status, body, headers: response.headers || {} }
    } catch (error) {
      if (error instanceof TaobaoRequestError) throw error
      throw new TaobaoRequestError('NETWORK', error?.message || '网络请求失败')
    } finally {
      clearTimeout(timer)
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const target = new URL(url)
    const localUrl = `${PAGE_PROXY_PREFIX}${target.pathname}${target.search}`
    const response = await fetch(localUrl, {
      method: 'GET',
      headers: toWebHeaders(cookie, referer, target),
      signal: controller.signal,
    })
    const body = await response.text()
    return {
      status: response.status,
      body,
      headers: { 'x-upstream-set-cookie': response.headers.get('x-upstream-set-cookie') || '' },
    }
  } catch (error) {
    if (error?.name === 'AbortError') throw new TaobaoRequestError('NETWORK', '请求超时')
    throw new TaobaoRequestError('NETWORK', error?.message || '网络请求失败')
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 按响应内容识别淘宝侧的失败原因
 * @param {{status:number, body:string}} response
 * @returns {'OK'|'LOGIN_REQUIRED'|'BLOCKED'|'HTTP'}
 */
export function classifyPageResponse(response) {
  const body = String(response?.body || '')
  if (body.includes('_____tmd_____')) return 'BLOCKED'
  if (body.length > 15000 && body.includes('var b = ')) return 'OK'
  if (body.includes('var b = ')) {
    // 有 SSR 数据但体积异常小：仍按成功处理，由调用方解析兜底
    return 'OK'
  }
  if (response?.status && response.status >= 400) return 'HTTP'
  // 5KB 壳 + 登录动作 = 没有登录态（Cookie 为空或已失效）
  return 'LOGIN_REQUIRED'
}
