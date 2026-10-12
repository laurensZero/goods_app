/**
 * 淘宝 mtop H5 接口客户端（签名 / JSONP / token 刷新 / 频控）
 *
 * 协议与参数以 docs/taobao-mtop-api.md、docs/taobao_mtop_client.py 为准：
 *   sign = md5(token + "&" + t + "&" + appKey + "&" + payload)
 *   token = Cookie 中最后一个 _m_h5_tk 值的第一段（32 位十六进制）
 *   payload = 外层 {"appId":…,"params":<内层 JSON 字符串>}（紧凑分隔符，含中文原样 UTF-8）
 *   token 过期（FAIL_SYS_TOKEN*）→ 免签请求重领 _m_h5_tk → 合并 Cookie → 重签再试一次
 *   相邻请求 ≥500ms 间隔；_____tmd_____ = 风控挑战。
 *
 * 传输复用 request.js：原生 CapacitorHttp 直连 h5api.m.taobao.com，
 * Web 走 /taobao-page 代理（x-taobao-origin 指向目标源，Set-Cookie 经
 * x-upstream-set-cookie 回传以便换 token）。
 */
import { md5 } from '@/utils/md5'
import { createLogger } from '@/utils/logger'
import { getTaobaoCookie, setTaobaoCookie } from './cookie'
import { readUpstreamSetCookieList } from './setCookie'
import { TaobaoRequestError, taobaoPageGet, taobaoPagePost } from './request'

const logger = createLogger('taobao:mtop')

const MTOP_ORIGIN = 'https://h5api.m.taobao.com'
const APP_KEY = '12574478'
const CALLBACK = 'mtopjsonp1'
const MIN_INTERVAL_MS = 500
const RATE_RETRY_DELAY_MS = 1200

let lastCallAt = 0
let gate = Promise.resolve()

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 全局串行节流：保证相邻两次上游请求间隔 ≥ MIN_INTERVAL_MS */
function pace() {
  const run = gate.then(async () => {
    const wait = lastCallAt + MIN_INTERVAL_MS - Date.now()
    if (wait > 0) await sleep(wait)
    lastCallAt = Date.now()
  })
  gate = run.catch(() => {})
  return run
}

/**
 * 取 Cookie 中最后一个 _m_h5_tk 值（可能重复出现，取最新的）
 * @param {string} cookie
 * @returns {string} 形如 32hexhex_1234…；无则返回 ''
 */
export function tokenFromCookie(cookie) {
  const matches = String(cookie || '').match(/(?:^|;\s*)_m_h5_tk=([^;]+)/g)
  if (!matches || matches.length === 0) return ''
  const last = matches[matches.length - 1]
  return last.replace(/^(?:;\s*)_m_h5_tk=/, '').trim()
}

/**
 * 拼 mtop POST form 请求 URL（订单列表等交易接口）
 *
 * 真实 buyertrade.taobao.com「已买到的宝贝」页请求形态（2026-10-12 抓包）：
 *   POST h5api.m.taobao.com/h5/{api}/{v}/?jsv&appKey&t&sign&v&ecode=1&timeout
 *        &dataType=json&valueType=original&ttid=1@tbwang_windows_1.0.0#pc
 *        &needLogin=true&type=originaljson&isHttps=1&needRetry=true&api&preventFallback=true
 *   body: data=<紧凑 JSON>（application/x-www-form-urlencoded）
 *   响应为 originaljson（无 JSONP 包装）
 *
 * @param {string} api
 * @param {string} v
 * @param {string} payload 紧凑 JSON（未编码），放在 POST body 而非 query
 * @param {string} t 毫秒时间戳
 * @param {string} sign 无 token 领取时传 ''（免签）
 * @param {{ttid?:string, extraQuery?:Record<string,string>}} [options]
 * @returns {string}
 */
export function buildMtopFormUrl(api, v, payload, t, sign, options = {}) {
  const { ttid = '1@tbwang_windows_1.0.0#pc', extraQuery } = options
  const params = new URLSearchParams()
  params.set('jsv', '2.7.2')
  params.set('appKey', APP_KEY)
  params.set('t', t)
  if (sign) params.set('sign', sign)
  params.set('v', v)
  params.set('ecode', '1')
  params.set('timeout', '8000')
  params.set('dataType', 'json')
  params.set('valueType', 'original')
  params.set('ttid', ttid)
  params.set('needLogin', 'true')
  params.set('type', 'originaljson')
  params.set('isHttps', '1')
  params.set('needRetry', 'true')
  params.set('api', api)
  params.set('preventFallback', 'true')
  if (extraQuery) {
    for (const [key, value] of Object.entries(extraQuery)) {
      params.set(key, value)
    }
  }
  // data 只放 body，query 不带（与真实请求一致；sign 仍按 payload 原文计算）
  return `${MTOP_ORIGIN}/h5/${api}/${v}/?${params.toString()}`
}

/**
 * 拼 mtop 请求 URL（参数顺序与官方 H5 调用一致）
 *
 * lean=true 用于搜索接口：真实 s.taobao.com 的 recommend 请求
 * 不带 _bx-login / AntiFlood / AntiCreep / ttid，却带 bx-ua=fast-load；
 * 搜索网关对 AntiCreep 开启的请求会软拒（token 在手仍 FAIL_SYS_TOKEN*）。
 *
 * @param {string} api
 * @param {string} v
 * @param {string} payload 紧凑 JSON（未编码）
 * @param {string} t 毫秒时间戳
 * @param {string} sign 无 token 领取时传 ''（免签）
 * @param {{callback?:string, lean?:boolean, extraQuery?:Record<string,string>}} [options]
 * @returns {string}
 */
export function buildMtopUrl(api, v, payload, t, sign, options = {}) {
  const { callback = CALLBACK, lean = false, extraQuery } = options
  const params = new URLSearchParams()
  params.set('jsv', lean ? '2.7.4' : '2.7.5')
  params.set('appKey', APP_KEY)
  params.set('t', t)
  if (sign) params.set('sign', sign)
  if (!lean) {
    params.set('_bx-login', 'new')
    params.set('dangerouslySetWindvaneParams', '[object Object]')
  }
  params.set('api', api)
  params.set('v', v)
  if (!lean) {
    params.set('AntiFlood', 'true')
    params.set('AntiCreep', 'true')
  }
  params.set('timeout', '10000')
  if (!lean) params.set('ttid', '2022@tmall_litepc_9.17.0')
  params.set('type', 'jsonp')
  params.set('dataType', 'jsonp')
  params.set('callback', callback)
  if (extraQuery) {
    for (const [key, value] of Object.entries(extraQuery)) {
      params.set(key, value)
    }
  }
  params.set('data', payload)
  return `${MTOP_ORIGIN}/h5/${api}/${v}/?${params.toString()}`
}

/**
 * 去掉 JSONP 包装并解析（兼容 originaljson 纯 JSON 响应）
 * @param {string} text
 * @returns {Record<string, any>}
 */
export function unwrapMtopJsonp(text) {
  const raw = String(text || '').trim()
  // originaljson（订单 form 接口）：纯 JSON，不能按括号剥（JSON 字符串里可能含 '('）
  if (raw.startsWith('{') || raw.startsWith('[')) return JSON.parse(raw)
  const start = raw.indexOf('(')
  const end = raw.lastIndexOf(')')
  const json = start >= 0 && end > start ? raw.slice(start + 1, end) : raw
  return JSON.parse(json)
}

function extractSetCookieValue(text, name) {
  const match = String(text || '').match(new RegExp(`(?:^|[;,\\s])${name}=([^;,]+)`))
  return match ? match[1].trim() : ''
}

/**
 * 把上游 Set-Cookie 中的新 _m_h5_tk / _m_h5_tk_enc 合并进旧 Cookie
 * （替换成对出现的所有 _m_h5_tk*，其余键不动；token 键置尾与官方时序一致）
 * @param {string} baseCookie
 * @param {string} setCookieText 上游 set-cookie 原文（可能多条拼接）
 * @returns {string} 合并后的 Cookie；未拿到新 token 时返回 ''
 */
export function mergeMtopTokenCookie(baseCookie, setCookieText) {
  const token = extractSetCookieValue(setCookieText, '_m_h5_tk')
  if (!token) return ''
  const tokenEnc = extractSetCookieValue(setCookieText, '_m_h5_tk_enc')
  const kept = String(baseCookie || '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part && !part.startsWith('_m_h5_tk'))
  kept.push(`_m_h5_tk=${token}`)
  if (tokenEnc) kept.push(`_m_h5_tk_enc=${tokenEnc}`)
  return kept.join('; ')
}

function isRateLimited(ret) {
  return ret.includes('CALL_TOO_OFTEN') || ret.includes('FREQ') || ret.includes('TRAFFIC_LIMIT')
}

/**
 * 调一次 mtop 接口并返回解析后的 JSON（带诊断日志：结果 ret / 耗时进反馈日志缓冲）
 *
 * @param {{api:string, v:string, data:Record<string, any>, referer?:string, cookie?:string, lean?:boolean, form?:boolean, preferProxy?:boolean, extraQuery?:Record<string,string>}} options
 *   lean：精简 URL（搜索等严风控接口用，见 buildMtopUrl 注释）
 *   form：POST form + originaljson（订单列表等交易接口，见 buildMtopFormUrl）
 *   preferProxy：原生端优先走远程代理（交易网关常拦 OkHttp）
 * @returns {Promise<Record<string, any>>} 含 ret / data 的响应体（ret 以 SUCCESS 开头）
 * @throws {TaobaoRequestError} BLOCKED 风控 / TOKEN 领取失败 / HTTP / PARSE / FAIL 业务失败 / NETWORK
 */
export async function mtopCall(options) {
  const startedAt = Date.now()
  try {
    const result = await mtopCallInner(options)
    logger.info('ok', { api: options.api, ms: Date.now() - startedAt, form: Boolean(options.form) })
    return result
  } catch (error) {
    logger.warn('fail', {
      api: options?.api,
      ms: Date.now() - startedAt,
      code: error?.code || '',
      message: error?.message || '',
      form: Boolean(options?.form),
    })
    throw error
  }
}

async function mtopCallInner({ api, v, data, referer, cookie, lean = false, form = false, preferProxy, extraQuery }) {
  const payload = JSON.stringify(data)
  // lean 接口（搜索）与 form 交易接口在原生端常被 tmd 硬拦（OkHttp 指纹）→
  // 优先走远程代理，不再先付一次直连失败；详情等宽松接口保持直连
  const useProxy = preferProxy === true || lean || form
  const transportOptions = useProxy ? { preferProxy: true } : {}
  let attemptCookie = cookie ?? (await getTaobaoCookie())
  if (!attemptCookie) throw new TaobaoRequestError('NETWORK', 'cookie missing')

  let rateRetried = false
  for (let tries = 0; ; tries += 1) {
    await pace()
    const t = String(Date.now())
    const token = tokenFromCookie(attemptCookie)
    const sign = token ? md5(`${token.split('_')[0]}&${t}&${APP_KEY}&${payload}`) : ''

    const url = form
      ? buildMtopFormUrl(api, v, payload, t, sign, { extraQuery })
      : buildMtopUrl(api, v, payload, t, sign, { lean, extraQuery })
    const send = form
      ? (sendUrl, sendCookie) => taobaoPagePost(sendUrl, {
        cookie: sendCookie,
        referer,
        body: `data=${encodeURIComponent(payload)}`,
        contentType: 'application/x-www-form-urlencoded',
        ...transportOptions,
      })
      : (sendUrl, sendCookie) => taobaoPageGet(sendUrl, { cookie: sendCookie, referer, ...transportOptions })

    const response = await send(url, attemptCookie)

    const body = String(response.body || '')
    if (body.includes('_____tmd_____')) throw new TaobaoRequestError('BLOCKED', '风控挑战')
    if (response.status >= 400) throw new TaobaoRequestError('HTTP', `HTTP ${response.status}`)

    let parsed
    try {
      // form 通道响应是 originaljson；GET 通道是 JSONP。unwrap 对两者都兼容
      parsed = unwrapMtopJsonp(body)
    } catch {
      // 常见于 CapacitorHttp 把 JSON 解析成对象后又被字符串化成 [object Object]
      logger.warn('parse-fail', {
        api,
        form,
        len: body.length,
        head: body.slice(0, 120),
      })
      throw new TaobaoRequestError('PARSE', '响应不是合法 JSON')
    }
    const ret = String((parsed?.ret || [''])[0] || '')

    if (ret.startsWith('FAIL_SYS_TOKEN')) {
      // 诊断：token 在手却被判令牌为空 → 多为网关对该接口的风控软拦截（软拒），
      // 而非签名/令牌缺失；否则是 refresh 未拿到 Set-Cookie（原生端头部大小写等）
      logger.warn('token-rejected', {
        api,
        attempt: tries + 1,
        tokenLen: token.length,
        signed: Boolean(sign),
        form,
      })
      if (tries >= 1) throw new TaobaoRequestError('TOKEN', ret)
      // 免签请求重领 token：读 Set-Cookie 合并后重签再试
      await pace()
      const refreshUrl = form
        ? buildMtopFormUrl(api, v, payload, String(Date.now()), '', { extraQuery })
        : buildMtopUrl(api, v, payload, String(Date.now()), '', { lean, extraQuery })
      const refreshRes = form
        ? await taobaoPagePost(refreshUrl, {
          cookie: attemptCookie,
          referer,
          body: `data=${encodeURIComponent(payload)}`,
          contentType: 'application/x-www-form-urlencoded',
          ...transportOptions,
        })
        : await taobaoPageGet(refreshUrl, { cookie: attemptCookie, referer, ...transportOptions })
      const setCookieLines = readUpstreamSetCookieList(refreshRes.headers)
      const merged = mergeMtopTokenCookie(attemptCookie, setCookieLines.join('\n'))
      if (!merged) {
        logger.warn('token-refresh-empty', { api, headers: Object.keys(refreshRes.headers || {}).join(',') })
        throw new TaobaoRequestError('TOKEN', ret)
      }
      attemptCookie = merged
      await setTaobaoCookie(merged)
      continue
    }

    if (ret && !ret.startsWith('SUCCESS')) {
      if (isRateLimited(ret) && !rateRetried) {
        rateRetried = true
        await sleep(RATE_RETRY_DELAY_MS)
        continue
      }
      throw new TaobaoRequestError('FAIL', ret)
    }

    return parsed
  }
}
