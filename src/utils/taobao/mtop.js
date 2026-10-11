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
import { TaobaoRequestError, taobaoPageGet } from './request'

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
 * 拼 mtop 请求 URL（参数顺序与官方 H5 调用一致）
 * @param {string} api
 * @param {string} v
 * @param {string} payload 紧凑 JSON（未编码）
 * @param {string} t 毫秒时间戳
 * @param {string} sign 无 token 领取时传 ''（免签）
 * @returns {string}
 */
export function buildMtopUrl(api, v, payload, t, sign, callback = CALLBACK) {
  const params = new URLSearchParams()
  params.set('jsv', '2.7.5')
  params.set('appKey', APP_KEY)
  params.set('t', t)
  if (sign) params.set('sign', sign)
  params.set('_bx-login', 'new')
  params.set('dangerouslySetWindvaneParams', '[object Object]')
  params.set('api', api)
  params.set('v', v)
  params.set('AntiFlood', 'true')
  params.set('AntiCreep', 'true')
  params.set('timeout', '10000')
  params.set('ttid', '2022@tmall_litepc_9.17.0')
  params.set('type', 'jsonp')
  params.set('dataType', 'jsonp')
  params.set('callback', callback)
  params.set('data', payload)
  return `${MTOP_ORIGIN}/h5/${api}/${v}/?${params.toString()}`
}

/**
 * 去掉 JSONP 包装并解析
 * @param {string} text
 * @returns {Record<string, any>}
 */
export function unwrapMtopJsonp(text) {
  const raw = String(text || '')
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

function readUpstreamSetCookie(headers) {
  const raw = headers?.['set-cookie'] ?? headers?.['x-upstream-set-cookie'] ?? ''
  return Array.isArray(raw) ? raw.join('\n') : String(raw)
}

function isRateLimited(ret) {
  return ret.includes('CALL_TOO_OFTEN') || ret.includes('FREQ') || ret.includes('TRAFFIC_LIMIT')
}

/**
 * 调一次 mtop 接口并返回解析后的 JSON（带诊断日志：结果 ret / 耗时进反馈日志缓冲）
 *
 * @param {{api:string, v:string, data:Record<string, any>, referer?:string, cookie?:string}} options
 * @returns {Promise<Record<string, any>>} 含 ret / data 的响应体（ret 以 SUCCESS 开头）
 * @throws {TaobaoRequestError} BLOCKED 风控 / TOKEN 领取失败 / HTTP / PARSE / FAIL 业务失败 / NETWORK
 */
export async function mtopCall(options) {
  const startedAt = Date.now()
  try {
    const result = await mtopCallInner(options)
    logger.info('ok', { api: options.api, ms: Date.now() - startedAt })
    return result
  } catch (error) {
    logger.warn('fail', {
      api: options?.api,
      ms: Date.now() - startedAt,
      code: error?.code || '',
      message: error?.message || '',
    })
    throw error
  }
}

async function mtopCallInner({ api, v, data, referer, cookie }) {
  const payload = JSON.stringify(data)
  let attemptCookie = cookie ?? (await getTaobaoCookie())
  if (!attemptCookie) throw new TaobaoRequestError('NETWORK', 'cookie missing')

  let rateRetried = false
  for (let tries = 0; ; tries += 1) {
    await pace()
    const t = String(Date.now())
    const token = tokenFromCookie(attemptCookie)
    const sign = token ? md5(`${token.split('_')[0]}&${t}&${APP_KEY}&${payload}`) : ''
    const url = buildMtopUrl(api, v, payload, t, sign)
    const response = await taobaoPageGet(url, { cookie: attemptCookie, referer })

    const body = String(response.body || '')
    if (body.includes('_____tmd_____')) throw new TaobaoRequestError('BLOCKED', '风控挑战')
    if (response.status >= 400) throw new TaobaoRequestError('HTTP', `HTTP ${response.status}`)

    let parsed
    try {
      parsed = unwrapMtopJsonp(body)
    } catch {
      throw new TaobaoRequestError('PARSE', '响应不是合法 JSONP')
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
      })
      if (tries >= 1) throw new TaobaoRequestError('TOKEN', ret)
      // 免签请求重领 token：读 Set-Cookie 合并后重签再试
      await pace()
      const refreshUrl = buildMtopUrl(api, v, payload, String(Date.now()), '')
      const refreshRes = await taobaoPageGet(refreshUrl, { cookie: attemptCookie, referer })
      const merged = mergeMtopTokenCookie(attemptCookie, readUpstreamSetCookie(refreshRes.headers))
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
