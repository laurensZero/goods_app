/**
 * 淘宝网页扫码登录（三段式，2026-10-12 实测）
 *
 * 流程（旧版「只到 GET 壳页」拿不到登录 Cookie，正确路径必须走 newlogin API）：
 *   1. GET qrlogin.taobao.com generateQRCode4Login.do（JSONP）→ lgToken（+ 淘宝自产二维码图地址）
 *      二维码内容 = buildQrScanUrl(lgToken)，手淘扫码后弹确认
 *      Set-Cookie：XSRF-TOKEN / cookie2 / t / _tb_token_ 等（进会话罐）
 *   2. GET qrcodeLoginCheck.do 轮询（JSONP）
 *      code：10000 等待 / 10001 已扫码 / 10006 成功（带 shell url）/ 400 过期
 *   3. GET shell（loginByIm.do HTML）→ 解析 window.viewData.loginFormData
 *      POST login.taobao.com/newlogin/token/loginByIm.do（表单 = loginFormData）
 *      → 26 条 Set-Cookie（unb/sgcookie/cookie1…）= 登录态；JSON content.data 指示跳转
 *
 * 会话期间的 Cookie 保存在内存罐里，不写入持久化存储；
 * 成功后调用方把 complete() 返回的 cookie 交给 saveTaobaoCookie。
 * 全程 preferProxy：qrlogin/login 域对 OkHttp 指纹敏感，Web/原生都走 /taobao-page 代理。
 */
import { createLogger } from '@/utils/logger'
import { TaobaoRequestError, taobaoPageGet, taobaoPagePost } from './request'
import { readUpstreamSetCookieList, mergeSetCookieIntoJar } from './setCookie'
import { buildMtopUrl, mergeMtopTokenCookie } from './mtop'

const logger = createLogger('taobao:qr')

const QR_ORIGIN = 'https://qrlogin.taobao.com'
const LOGIN_ORIGIN = 'https://login.taobao.com'
const LOGIN_JHTML = `${LOGIN_ORIGIN}/member/login.jhtml`
const GEN_PATH = '/qrcodelogin/generateQRCode4Login.do'
const CHECK_PATH = '/qrcodelogin/qrcodeLoginCheck.do'
const NEWLOGIN_PATH = '/newlogin/token/loginByIm.do'
const POLL_INTERVAL_MS = 1500

export const QR_CODE_WAITING = 10000
export const QR_CODE_SCANNED = 10001
export const QR_CODE_SUCCESS = 10006
export const QR_CODE_EXPIRED = 400

export class TaobaoQrLoginError extends Error {
  constructor(code, message) {
    super(message || code)
    this.name = 'TaobaoQrLoginError'
    this.code = code
  }
}

/** JSONP 剥壳：兼容 IIFE 包裹（jsonp1({...})），用平衡大括号定位对象 */
export function unwrapQrJsonp(text, callbackName) {
  const raw = String(text || '').trim()
  const cb = String(callbackName || '')
  let start = -1
  if (cb) {
    const idx = raw.indexOf(`${cb}(`)
    if (idx >= 0) start = raw.indexOf('{', idx)
  }
  if (start < 0) start = raw.indexOf('{')
  if (start < 0) throw new TaobaoQrLoginError('PARSE', 'QR 响应不是 JSONP')
  let depth = 0
  let inString = false
  let quote = ''
  for (let i = start; i < raw.length; i += 1) {
    const ch = raw[i]
    if (inString) {
      if (ch === '\\') {
        i += 1
        continue
      }
      if (ch === quote) inString = false
      continue
    }
    if (ch === '"' || ch === "'") {
      inString = true
      quote = ch
      continue
    }
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) {
        try {
          return JSON.parse(raw.slice(start, i + 1))
        } catch {
          throw new TaobaoQrLoginError('PARSE', 'QR 响应 JSON 解析失败')
        }
      }
    }
  }
  throw new TaobaoQrLoginError('PARSE', 'QR JSONP 括号不平衡')
}

/** 从 HTML 提取 window.viewData（扫码壳页的 loginFormData 来源） */
export function extractViewData(html) {
  const text = String(html || '')
  const match = text.match(/window\.viewData\s*=\s*(\{[\s\S]*?\});/)
  if (!match) throw new TaobaoQrLoginError('PARSE', '壳页缺少 viewData')
  try {
    return JSON.parse(match[1])
  } catch {
    throw new TaobaoQrLoginError('PARSE', 'viewData JSON 解析失败')
  }
}

/** 协议相对 URL 补全 https */
export function ensureHttpsUrl(url) {
  const value = String(url || '').trim()
  if (!value) return ''
  if (value.startsWith('//')) return `https:${value}`
  return value
}

/**
 * 扫码内容 URL：淘宝自产二维码图（img.alicdn.com …xcode.png）里编码的就是这个地址
 * （2026-10-12 实测解码），手淘 App 扫到才会弹确认，不能拿图片地址二次生成二维码。
 */
export function buildQrScanUrl(lgToken) {
  return `https://login.m.taobao.com/qrcodeCheck.htm?lgToken=${encodeURIComponent(String(lgToken || ''))}&tbScanOpenType=Notification`
}

function absShellUrl(url) {
  const value = ensureHttpsUrl(url)
  if (!value) return ''
  try {
    return new URL(value, LOGIN_ORIGIN).href
  } catch {
    return value
  }
}

/**
 * 一次扫码登录会话：generate → poll* → complete。
 * 中止/失败后 jar 清空；成功返回完整登录 Cookie（含 _m_h5_tk 之外的登录字段）。
 */
export function createTaobaoQrLoginSession() {
  let jar = ''
  let lgToken = ''
  let adToken = ''
  let disposed = false

  function applySetCookie(headers) {
    const list = readUpstreamSetCookieList(headers)
    if (list.length > 0) jar = mergeSetCookieIntoJar(jar, list)
  }

  function assertNotDisposed() {
    if (disposed) throw new TaobaoQrLoginError('DISPOSED', '会话已中止')
  }

  async function generate() {
    assertNotDisposed()
    jar = ''
    lgToken = ''
    adToken = ''
    const ts = String(Date.now())
    const url = `${QR_ORIGIN}${GEN_PATH}`
      + '?adUrl=&adImage=&adText=&viewFd4PC=&viewFd4Mobile=&from=tb'
      + '&appkey=00000000&umid_token='
      + `&_ksTS=${ts}_1&callback=jsonp1`
    const response = await taobaoPageGet(url, {
      cookie: jar,
      referer: LOGIN_JHTML,
      accept: '*/*',
      preferProxy: true,
    })
    if (response.status >= 400) {
      throw new TaobaoQrLoginError('HTTP', `HTTP ${response.status}`)
    }
    if (String(response.body || '').includes('_____tmd_____')) {
      throw new TaobaoQrLoginError('BLOCKED', '风控挑战')
    }
    applySetCookie(response.headers)
    const data = unwrapQrJsonp(response.body, 'jsonp1')
    if (!data?.success || !data?.lgToken) {
      throw new TaobaoQrLoginError('GENERATE', data?.message || '生成二维码失败')
    }
    lgToken = String(data.lgToken)
    adToken = String(data.adToken || '')
    const qrUrl = buildQrScanUrl(lgToken)
    logger.info('qr-generate', { hasJar: Boolean(jar), lgTokenLen: lgToken.length })
    return { lgToken, adToken, qrUrl, cookieJar: jar }
  }

  /**
   * 轮询一次扫码状态。
   * @returns {Promise<{code:number, status:'waiting'|'scanned'|'success'|'expired', shellUrl:string}>}
   */
  async function poll() {
    assertNotDisposed()
    if (!lgToken) throw new TaobaoQrLoginError('STATE', '未生成二维码')
    const ts = String(Date.now())
    const url = `${QR_ORIGIN}${CHECK_PATH}`
      + `?lgToken=${encodeURIComponent(lgToken)}`
      + `&defaulturl=${encodeURIComponent('https://www.taobao.com/')}`
      + `&_ksTS=${ts}_2&callback=jsonp2`
    const response = await taobaoPageGet(url, {
      cookie: jar,
      referer: LOGIN_JHTML,
      accept: '*/*',
      preferProxy: true,
    })
    if (response.status >= 400) {
      throw new TaobaoQrLoginError('HTTP', `HTTP ${response.status}`)
    }
    applySetCookie(response.headers)
    const data = unwrapQrJsonp(response.body, 'jsonp2')
    const code = Number(data?.code)
    if (code === QR_CODE_SUCCESS) {
      const shellUrl = absShellUrl(data?.url)
      if (!shellUrl) throw new TaobaoQrLoginError('PARSE', '成功响应缺少跳转地址')
      logger.info('qr-scanned-ok', { shellHost: safeHost(shellUrl) })
      return { code, status: 'success', shellUrl }
    }
    if (code === QR_CODE_SCANNED) return { code, status: 'scanned', shellUrl: '' }
    if (code === QR_CODE_EXPIRED) return { code, status: 'expired', shellUrl: '' }
    if (code === QR_CODE_WAITING) return { code, status: 'waiting', shellUrl: '' }
    // 未知 code：按失败处理，保留 message 便于排查
    throw new TaobaoQrLoginError('POLL', data?.message || `未知状态码 ${code || '∅'}`)
  }

  /**
   * 扫码确认后完成登录：壳页 → newlogin API → 合并 26 条 Set-Cookie。
   * @param {string} shellUrl poll 成功返回的 loginByIm.do 地址
   * @returns {Promise<string>} 完整登录 Cookie 罐
   */
  async function complete(shellUrl) {
    assertNotDisposed()
    const target = absShellUrl(shellUrl)
    if (!target) throw new TaobaoQrLoginError('STATE', '缺少壳页地址')

    const shellRes = await taobaoPageGet(target, {
      cookie: jar,
      referer: LOGIN_JHTML,
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      preferProxy: true,
    })
    if (shellRes.status >= 400) {
      throw new TaobaoQrLoginError('HTTP', `壳页 HTTP ${shellRes.status}`)
    }
    applySetCookie(shellRes.headers)
    const viewData = extractViewData(shellRes.body)
    const form = viewData?.loginFormData
    if (!form || typeof form !== 'object' || !form.token) {
      throw new TaobaoQrLoginError('PARSE', '壳页缺少 loginFormData')
    }

    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(form)) {
      if (value == null) continue
      params.set(String(key), String(value))
    }
    const apiUrl = `${LOGIN_ORIGIN}${NEWLOGIN_PATH}?_bx-v=2.5.37`
    const apiRes = await taobaoPagePost(apiUrl, {
      cookie: jar,
      referer: target,
      origin: LOGIN_ORIGIN,
      accept: 'application/json, text/plain, */*',
      body: params.toString(),
      contentType: 'application/x-www-form-urlencoded',
      preferProxy: true,
    })
    if (apiRes.status >= 400) {
      throw new TaobaoQrLoginError('HTTP', `newlogin HTTP ${apiRes.status}`)
    }
    applySetCookie(apiRes.headers)

    // 登录态以 Set-Cookie 为准；JSON 只用于确认成功
    if (!/(?:^|;\s*)unb=/.test(jar) && !/(?:^|;\s*)cookie2=/.test(jar)) {
      logger.warn('qr-newlogin-missing-auth', { jarKeys: jarKeys(jar) })
      throw new TaobaoQrLoginError('NO_COOKIE', 'newlogin 未返回登录 Cookie')
    }
    await primeMtopToken()
    logger.info('qr-complete', { jarKeys: jarKeys(jar) })
    return jar
  }

  /**
   * 预热 mtop 签名令牌：_m_h5_tk 只由 h5api.m.taobao.com 网关下发，
   * newlogin 不给，缺了它 isTaobaoCookieReady 会判 Cookie 无效。
   * 免签请求一次（预期 FAIL_SYS_TOKEN*），从 Set-Cookie 领令牌合并进罐。
   */
  async function primeMtopToken() {
    try {
      const primeUrl = buildMtopUrl('mtop.user.getUserSimple', '1.0', '{}', String(Date.now()), '')
      const primeRes = await taobaoPageGet(primeUrl, {
        cookie: jar,
        referer: `${LOGIN_ORIGIN}/`,
        preferProxy: true,
      })
      const lines = readUpstreamSetCookieList(primeRes.headers)
      const merged = mergeMtopTokenCookie(jar, lines.join('\n'))
      if (merged) jar = merged
      else logger.warn('qr-token-prime-empty', { jarKeys: jarKeys(jar) })
    } catch (error) {
      // 预热失败不阻断登录：mtop 调用自身还有免签重领兜底
      logger.warn('qr-token-prime-fail', { code: error?.code || '', message: error?.message || '' })
    }
  }

  function dispose() {
    disposed = true
    jar = ''
    lgToken = ''
    adToken = ''
  }

  return {
    generate,
    poll,
    complete,
    dispose,
    get cookieJar() {
      return jar
    },
  }
}

/** 按 1.5s 间隔轮询直到成功/过时/中止；供 UI 直接驱动 */
export async function runTaobaoQrPollLoop(session, { signal, onStatus } = {}) {
  for (;;) {
    if (signal?.aborted) return { status: 'aborted' }
    const result = await session.poll()
    if (typeof onStatus === 'function') onStatus(result)
    if (result.status === 'success') return result
    if (result.status === 'expired') return result
    await sleep(POLL_INTERVAL_MS)
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function jarKeys(jar) {
  return String(jar || '')
    .split(';')
    .map((part) => part.trim().split('=')[0])
    .filter(Boolean)
}

function safeHost(url) {
  try {
    return new URL(url).host
  } catch {
    return ''
  }
}

/** 将 TaobaoQrLoginError / TaobaoRequestError 归一为 UI 可用的 code */
export function qrLoginErrorCode(error) {
  if (error instanceof TaobaoQrLoginError) return error.code
  if (error instanceof TaobaoRequestError) return error.code || 'NETWORK'
  return 'NETWORK'
}
