/**
 * 淘宝请求传输层（PC 详情页 SSR HTML / mtop）
 *
 * 与米游铺同构的双路径：
 *   - 原生：CapacitorHttp 直连 item.taobao.com，Cookie/UA/Referer 头原样发送；
 *     被 _____tmd_____ 硬拦时（搜索网关针对 OkHttp TLS 指纹）自动改走
 *     远程代理兜底（goodsapp.de5.net/taobao-page，Cloudflare Pages Function）
 *   - Web：走同源 /taobao-page 代理（dev 为 Vite 中间件，生产为 Pages Function），
 *     Cookie 转成 x-cookie-forward，UA/Referer 由代理补齐（浏览器禁止 JS 设置这些头）
 */
import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { createLogger } from '@/utils/logger'
import { AUTH_WEB_ORIGIN } from '@/config/supabase'
import { getTaobaoCookie } from './cookie'

const logger = createLogger('taobao:req')

export const TAOBAO_DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
export const TAOBAO_REFERER = 'https://www.taobao.com/'
const PAGE_PROXY_PREFIX = '/taobao-page'
const DEFAULT_TIMEOUT_MS = 20000

/**
 * 原生端传输层是 CapacitorHttp（OkHttp），其 TLS 指纹会被淘宝 tmd 风控拦下
 * （docs/taobao-mtop-api.md §8），SSR 详情页在原生端不可用——服务层据此选 mtop 通道。
 */
export function isNativeTransport() {
  return Capacitor.isNativePlatform()
}

export class TaobaoRequestError extends Error {
  constructor(code, message) {
    super(message || code)
    this.name = 'TaobaoRequestError'
    this.code = code
  }
}

function buildHeaders(cookie, referer, contentType, extra = {}) {
  const headers = {
    'User-Agent': TAOBAO_DESKTOP_UA,
    'Referer': referer || TAOBAO_REFERER,
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  }
  if (contentType) headers['Content-Type'] = contentType
  if (cookie) headers.Cookie = cookie
  if (extra.origin) headers.Origin = extra.origin
  if (extra.accept) headers.Accept = extra.accept
  return headers
}

function toWebHeaders(cookie, referer, target, extra = {}) {
  const headers = {
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    // 目标源（如 h5api.m.taobao.com）：浏览器只能同源请求，由代理回填真实地址
    'x-taobao-origin': target.origin,
  }
  // 浏览器禁止 JS 设置 Cookie/UA/Referer/Origin → 交给 Vite 代理补齐
  if (cookie) headers['x-cookie-forward'] = encodeURIComponent(cookie)
  if (referer) headers['x-referer-forward'] = encodeURIComponent(referer)
  if (extra.origin) headers['x-origin-forward'] = encodeURIComponent(extra.origin)
  if (extra.accept) headers['x-accept-forward'] = encodeURIComponent(extra.accept)
  return headers
}

/** 诊断日志：主机/路径（不含 query，避免记录签名与载荷）+ 状态码 + 风控信号 */
function logPageResponse(transport, url, startedAt, status, body) {
  let host = ''
  let path = ''
  try {
    const parsed = new URL(url)
    host = parsed.host
    path = parsed.pathname
  } catch {
    host = String(url).slice(0, 60)
  }
  const text = String(body || '')
  logger.info('page', {
    transport,
    host,
    path,
    status,
    ms: Date.now() - startedAt,
    len: text.length,
    tmd: text.includes('_____tmd_____'),
    ssr: text.includes('var b = '),
    jsonp: text.includes('mtopjsonp'),
  })
}

/**
 * 请求一个淘宝地址，返回文本与响应头（GET 或 POST）
 * @param {string} url 绝对地址（item.taobao.com 详情页、h5api.m.taobao.com mtop 接口、qrlogin/login 扫码）
 * @param {{cookie?:string, timeoutMs?:number, referer?:string, preferProxy?:boolean, method?:'GET'|'POST', body?:string, contentType?:string, origin?:string, accept?:string}} [options]
 *   referer 覆盖默认 www.taobao.com（mtop 搜索需 s.taobao.com）
 *   preferProxy：原生端优先走远程代理（搜索/交易网关必拦 OkHttp，先直连必失败一次）；
 *   代理失败仍回落直连，不会直接失败
 *   method/body：POST 时 body 为请求体原文（mtop 订单 / newlogin 扫码登录用 form-urlencoded）
 *   origin/accept：扫码 newlogin 等接口需要的 Origin / Accept（Web 经代理头补齐）
 * @returns {Promise<{status:number, body:string, headers:Record<string,string>}>}
 *   headers：原生为 CapacitorHttp 响应头；Web 为代理回传的 x-upstream-set-cookie(-json)（mtop 换 token / 扫码合并罐用）
 */
export async function taobaoPageGet(url, options = {}) {
  return taobaoPageRequest(url, { ...options, method: 'GET' })
}

/**
 * POST 一个淘宝地址（mtop 订单 / newlogin 扫码登录 form 接口），协议与 taobaoPageGet 一致
 * @param {string} url
 * @param {{cookie?:string, timeoutMs?:number, referer?:string, preferProxy?:boolean, body?:string, contentType?:string, origin?:string, accept?:string}} options
 * @returns {Promise<{status:number, body:string, headers:Record<string,string>}>}
 */
export async function taobaoPagePost(url, options = {}) {
  return taobaoPageRequest(url, {
    ...options,
    method: 'POST',
    body: options.body ?? '',
    contentType: options.contentType || 'application/x-www-form-urlencoded',
  })
}

async function taobaoPageRequest(url, options = {}) {
  const cookie = options.cookie ?? (await getTaobaoCookie())
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS
  const referer = options.referer || ''
  const method = (options.method || 'GET').toUpperCase()
  const body = options.body ?? ''
  const contentType = options.contentType || ''
  const extra = { origin: options.origin || '', accept: options.accept || '' }
  const startedAt = Date.now()
  const transport = Capacitor.isNativePlatform() ? 'native' : 'proxy'
  const requestHeaders = buildHeaders(cookie, referer, contentType, extra)

  if (Capacitor.isNativePlatform()) {
    // 已知必拦的接口（搜索/订单列表）优先走代理，代理挂了才回落直连
    if (options.preferProxy) {
      const viaProxy = await remoteProxyRequest(url, cookie, referer, timeoutMs, method, body, contentType, extra)
      if (viaProxy) return viaProxy
    }
    let timer
    try {
      const response = await Promise.race([
        CapacitorHttp.request({
          url,
          method,
          headers: requestHeaders,
          data: method === 'POST' ? body : undefined,
          connectTimeout: timeoutMs,
          readTimeout: timeoutMs,
        }),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new TaobaoRequestError('NETWORK', '请求超时')), timeoutMs + 500)
        }),
      ])
      const status = Number(response.status || 0)
      const respBody = responseBodyToText(response.data)
      logPageResponse(transport, url, startedAt, status, respBody)
      if (respBody.includes('_____tmd_____')) {
        // OkHttp TLS 指纹可能被搜索/交易网关硬拦 → 先直连试一次，被拦再改走自家 CF 代理
        const fallback = await remoteProxyRequest(url, cookie, referer, timeoutMs, method, body, contentType, extra)
        if (fallback) return fallback
      }
      return { status, body: respBody, headers: response.headers || {} }
    } catch (error) {
      // 直连本身失败（超时/连接被掐）→ 也走 CF 代理兜底
      const fallback = await remoteProxyRequest(url, cookie, referer, timeoutMs, method, body, contentType, extra)
      if (fallback) return fallback
      if (error instanceof TaobaoRequestError) {
        logger.warn('page-error', { transport, host: safeHost(url), code: error.code, message: error.message })
        throw error
      }
      const wrapped = new TaobaoRequestError('NETWORK', error?.message || '网络请求失败')
      logger.warn('page-error', { transport, host: safeHost(url), code: wrapped.code, message: wrapped.message })
      throw wrapped
    } finally {
      clearTimeout(timer)
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const target = new URL(url)
    const localUrl = `${PAGE_PROXY_PREFIX}${target.pathname}${target.search}`
    const webHeaders = toWebHeaders(cookie, referer, target, extra)
    if (contentType) webHeaders['content-type'] = contentType
    const response = await fetch(localUrl, {
      method,
      headers: webHeaders,
      body: method === 'POST' ? body : undefined,
      signal: controller.signal,
    })
    const respBody = await response.text()
    logPageResponse(transport, url, startedAt, response.status, respBody)
    return {
      status: response.status,
      body: respBody,
      headers: {
        'x-upstream-set-cookie': response.headers.get('x-upstream-set-cookie') || '',
        'x-upstream-set-cookie-json': response.headers.get('x-upstream-set-cookie-json') || '',
      },
    }
  } catch (error) {
    if (error?.name === 'AbortError') {
      logger.warn('page-error', { transport, host: safeHost(url), code: 'NETWORK', message: '请求超时' })
      throw new TaobaoRequestError('NETWORK', '请求超时')
    }
    logger.warn('page-error', { transport, host: safeHost(url), code: 'NETWORK', message: error?.message || '网络请求失败' })
    throw new TaobaoRequestError('NETWORK', error?.message || '网络请求失败')
  } finally {
    clearTimeout(timer)
  }
}

function safeHost(url) {
  try {
    return new URL(url).host
  } catch {
    return String(url).slice(0, 60)
  }
}

/**
 * CapacitorHttp 在响应 Content-Type 为 application/json 时会把 body 解析成对象；
 * 必须再 JSON.stringify 还原原文，否则 `String(obj)` = "[object Object]"，mtop 解析必炸。
 */
export function responseBodyToText(data) {
  if (typeof data === 'string') return data
  if (data == null) return ''
  if (typeof data === 'object') {
    try {
      return JSON.stringify(data)
    } catch {
      return String(data)
    }
  }
  return String(data)
}

/**
 * 原生端 tmd 硬拦兜底：把请求转给自家 Cloudflare Pages Function 代理
 * （goodsapp.de5.net/taobao-page，协议同 Vite 中间件）。
 * 代理不可用/仍被拦时返回 null，由调用方回落直连响应。
 */
async function remoteProxyRequest(url, cookie, referer, timeoutMs, method = 'GET', body = '', contentType = '', extra = {}) {
  const startedAt = Date.now()
  const transport = 'native-cf'
  let timer
  try {
    const target = new URL(url)
    const headers = toWebHeaders(cookie, referer, target, extra)
    if (contentType) headers['content-type'] = contentType
    const response = await Promise.race([
      CapacitorHttp.request({
        url: `${AUTH_WEB_ORIGIN}/taobao-page${target.pathname}${target.search}`,
        method,
        headers,
        data: method === 'POST' ? body : undefined,
        connectTimeout: timeoutMs,
        readTimeout: timeoutMs,
      }),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new TaobaoRequestError('NETWORK', '请求超时')), timeoutMs + 500)
      }),
    ])
    const status = Number(response.status || 0)
    const respBody = responseBodyToText(response.data)
    logPageResponse(transport, url, startedAt, status, respBody)
    // 代理自身报错/上游仍硬拦 → 交给调用方回落直连响应
    if (status >= 400 || respBody.includes('_____tmd_____')) return null
    return { status, body: respBody, headers: response.headers || {} }
  } catch (error) {
    logger.warn('page-error', {
      transport,
      host: safeHost(url),
      code: error?.code || 'NETWORK',
      message: error?.message || '网络请求失败',
    })
    return null
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
