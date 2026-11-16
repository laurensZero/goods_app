// @ts-check
/**
 * utils/events/eventCoverImport.js
 * 活动分享链接解析：支持 B 站会员购（含 b23.tv 短链）/ 大麦 / 猫眼演出。
 * 返回活动名、地点、封面（平台图床 CDN 链接，直接存进 coverImage，与谷子
 * 导入同策略，不下载落盘）。
 *
 * 传输策略（回答「为什么不都走代理」）：
 *   - 原生端一律 CapacitorHttp 直连：OkHttp 无 CORS 限制，设备家宽 IP 也能
 *     避开猫眼/大麦对数据中心 IP 的风控；b23.tv 短链用 disableRedirects 手动
 *     跟跳拿落地 URL。
 *   - Web 端走 Cloudflare Pages Function /event-cover（functions/event-cover）：
 *     猫眼 h5 接口无 ACAO、会员购 API 对带 Origin 的请求 403、大麦 mtop 需要
 *     服务端代签，浏览器只能代理。原生直连失败也回落到该函数兜底。
 */

import { Capacitor } from '@capacitor/core'
import { CapacitorHttp } from '@capacitor/core'
import { md5 } from '@/utils/md5'
import { AUTH_WEB_ORIGIN } from '@/config/supabase'

const EVENT_COVER_PROXY_PATH = '/event-cover/parse'
const TIMEOUT_MS = 20000
const NATIVE_TIMEOUT_MS = 20000
const MAX_REDIRECT_HOPS = 5

const SHARE_URL_PATTERN = /https?:\/\/[^\s"'，。《》【】（）()<>]+/i

// 手机 UA：三平台 h5 接口对移动 UA 最宽松
const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'

// 短链跟跳只允许在票务平台域内，防止被当开放代理用
const ALLOWED_SUFFIXES = ['.bilibili.com', '.damai.cn', '.taobao.com', '.maoyan.com', '.meituan.com']
const SHORT_LINK_HOSTS = ['b23.tv']

const DAMAI_APP_KEY = '12574478'
const DAMAI_API = 'mtop.alibaba.damai.detail.getdetail'
const DAMAI_VERSION = '1.2'

const MAOYAN_AJAX_PARAMS = {
  buyInstructionType: '1',
  optimus_risk_level: '71',
  optimus_code: '10',
  sellChannel: '7',
  cityId: '30',
  yodaReady: 'h5',
  csecplatform: '4',
  csecversion: '2.3.0'
}

/**
 * 从分享文本中提取第一个 http(s) 链接。
 * @param {string} text
 * @returns {string} 无链接时返回空串
 */
export function extractShareUrl(text) {
  const match = String(text || '').match(SHARE_URL_PATTERN)
  return match ? match[0].replace(/[)，。；;]+$/, '') : ''
}

/**
 * 快速判断链接是否属于支持的平台域（含短链域）。
 * @param {string} url
 * @returns {boolean}
 */
export function isSupportedShareHost(url) {
  try {
    const host = new URL(url).hostname.toLowerCase()
    if (SHORT_LINK_HOSTS.includes(host)) return true
    return ['.bilibili.com', '.damai.cn', '.maoyan.com'].some(
      (suffix) => host.endsWith(suffix) || host === suffix.slice(1)
    )
  } catch {
    return false
  }
}

function isAllowedHost(hostname) {
  const host = String(hostname || '').toLowerCase()
  if (SHORT_LINK_HOSTS.includes(host)) return true
  return ALLOWED_SUFFIXES.some((suffix) => host.endsWith(suffix))
}

/** 清洗标题：去掉开头连续的【…】/ […] 标签组和「城市·」前缀（会员购/大麦的城市前缀） */
function cleanTitle(raw) {
  return String(raw || '')
    .trim()
    .replace(/^((?:【[^】]*】|\[[^\]]*\]|[\u4e00-\u9fa5]{2,4}·)\s*)+/, '')
    .trim()
}

// ── 场次/票档（sessions，仅会员购） ───────────────────────────────────────

// 统一模型：{ date: 'YYYY-MM-DD', name, tickets: [{ name, price }] }
// price 为元数字（平台提取时换算）；客户端在此统一做归一化（去重/排序/封顶/价格格式化），
// 服务端 Function 与 dev 中间件只做各平台字段映射，逻辑与它们保持同构。

export const EVENT_SESSIONS_MAX = 31

function normalizeSessionDate(raw) {
  const text = String(raw || '').trim()
  if (!text) return ''
  const match = text.match(/(\d{4})[.\-\/年](\d{1,2})[.\-\/月](\d{1,2})/)
  if (match) {
    return `${match[1]}-${String(Number(match[2])).padStart(2, '0')}-${String(Number(match[3])).padStart(2, '0')}`
  }
  const num = Number(text)
  if (Number.isFinite(num) && num > 0) {
    const ms = num > 1e12 ? num : num * 1000
    return new Date(ms + 8 * 3600 * 1000).toISOString().slice(0, 10)
  }
  return ''
}

/** 会员购 screen_list → 统一场次模型（原生直连与 Function/中间件同构） */
function extractBilibiliSessions(data) {
  const screens = Array.isArray(data?.screen_list) ? data.screen_list : []
  const sessions = []
  for (const screen of screens) {
    const date = normalizeSessionDate(String(screen?.start_time_str || '')) || normalizeSessionDate(screen?.start_time)
    if (!date) continue
    const tickets = (Array.isArray(screen?.ticket_list) ? screen.ticket_list : [])
      .map((ticket) => ({
        name: String(ticket?.desc || '').trim(),
        price: Number(ticket?.price) > 0 ? Number(ticket.price) / 100 : 0,
      }))
      .filter((ticket) => ticket.price > 0)
    sessions.push({ date, name: String(screen?.name || '').trim(), tickets })
  }
  return sessions
}

/**
 * 场次归一化：无效日期丢弃、同日合并（票种并列）、按日期升序、封顶 31、
 * 价格格式化为两位小数字符串。
 * @param {Array} sessions
 * @returns {Array<{date: string, name: string, tickets: Array<{name: string, price: string}>}>}
 */
export function normalizeSessions(sessions) {
  const byDate = new Map()
  for (const session of Array.isArray(sessions) ? sessions : []) {
    const date = normalizeSessionDate(session?.date)
    if (!date) continue
    const tickets = (Array.isArray(session?.tickets) ? session.tickets : [])
      .map((ticket) => ({
        name: String(ticket?.name || '').trim(),
        price: Number(ticket?.price) > 0 ? Number(ticket.price) : 0
      }))
      .filter((ticket) => ticket.price > 0)
      .map((ticket) => ({ name: ticket.name, price: ticket.price.toFixed(2) }))
    const merged = byDate.get(date)
    if (merged) {
      if (!merged.name && session?.name) merged.name = String(session.name).trim()
      merged.tickets.push(...tickets)
    } else {
      byDate.set(date, { date, name: String(session?.name || '').trim(), tickets })
    }
  }
  return Array.from(byDate.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, EVENT_SESSIONS_MAX)
}

/**
 * 平台识别。覆盖已确认的真实分享格式：
 *   - 会员购：show.bilibili.com/platform/detail.html?id= / mall.bilibili.com/neul-next/...detail.html?id=
 *   - 会员购短链：b23.tv/xxx（跳到 mall.bilibili.com）
 *   - 大麦：m.damai.cn/shows/item.html?itemId= / m.damai.cn/damai/detail/item.html?itemId= / detail.damai.cn/item.htm?id=
 *   - 猫眼：show.maoyan.com/qqw?share=...#/detail/265844?...（hash 路由）
 * @param {URL} url
 * @returns {{ platform: 'bilibili'|'damai'|'maoyan', id: string } | null}
 */
function detectPlatform(url) {
  const host = url.hostname.toLowerCase()
  if (host.endsWith('.bilibili.com') || host === 'bilibili.com') {
    const id = url.searchParams.get('id') || url.searchParams.get('projectId') || ''
    if (id && /^\d+$/.test(id)) return { platform: 'bilibili', id }
    return null
  }
  if (host.endsWith('.damai.cn') || host === 'damai.cn') {
    const id = url.searchParams.get('itemId') || url.searchParams.get('id') || ''
    if (id && /^\d+$/.test(id)) return { platform: 'damai', id }
    return null
  }
  if (host.endsWith('.maoyan.com') || host === 'maoyan.com') {
    // 猫眼 App 分享是 hash 路由：/qqw?share=...#/detail/265844?fromTag=...
    const hashMatch = String(url.hash || '').match(/\/(?:detail|performance)\/(\d+)/)
    if (hashMatch) return { platform: 'maoyan', id: hashMatch[1] }
    const pathMatch = url.pathname.match(/\/(?:detail|performance)\/(\d+)/)
    if (pathMatch) return { platform: 'maoyan', id: pathMatch[1] }
    const paramId = url.searchParams.get('performanceId') || ''
    if (/^\d+$/.test(paramId)) return { platform: 'maoyan', id: paramId }
    return null
  }
  return null
}

// ── 原生直连传输 ──────────────────────────────────────────────────────────

function isNative() {
  return Capacitor.isNativePlatform()
}

function headerValue(headers, name) {
  const target = String(name).toLowerCase()
  for (const [key, value] of Object.entries(headers || {})) {
    if (String(key).toLowerCase() === target) return String(value || '')
  }
  return ''
}

/**
 * CapacitorHttp 会在 Content-Type 为 application/json 时把 body 自动解析成
 * 对象；需要原文/统一处理时先还原成字符串。
 */
function responseBodyToText(data) {
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

function responseToJson(response) {
  if (response?.data && typeof response.data === 'object') return response.data
  const text = responseBodyToText(response?.data)
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

async function nativeGetText(url, headers = {}) {
  const response = await CapacitorHttp.request({
    url,
    method: 'GET',
    headers: { 'User-Agent': MOBILE_UA, ...headers },
    connectTimeout: NATIVE_TIMEOUT_MS,
    readTimeout: NATIVE_TIMEOUT_MS,
    disableRedirects: true
  })
  const status = Number(response?.status || 0)
  if (status >= 400) throw new Error(`http ${status}`)
  return response
}

/** 从响应的 Set-Cookie 头（可能多条合并）提取 name=value 对，合并进 cookie 罐 */
function mergeNativeCookies(response, jar) {
  const raw = headerValue(response?.headers, 'set-cookie')
  if (!raw) return
  // CapacitorHttp 把多条 Set-Cookie 合并进一个头，按逗号切分有误伤风险，
  // 但 mtop 的 cookie（_m_h5_tk / cookie2 等）值不含裸逗号，够用
  for (const part of raw.split(/,(?=[^;]+?=)/)) {
    const pair = part.split(';')[0].trim()
    const eq = pair.indexOf('=')
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim())
  }
}

// ── 三平台解析（原生直连） ────────────────────────────────────────────────

async function parseBilibiliDirect(id) {
  const api = `https://show.bilibili.com/api/ticket/project/get?version=134&id=${id}&project_id=${id}`
  const payload = responseToJson(await nativeGetText(api, {
    Accept: 'application/json',
    Referer: `https://show.bilibili.com/platform/detail.html?id=${id}`
  }))
  if (payload?.errno !== 0 || !payload?.data) throw new Error('bilibili api failed')
  const data = payload.data
  const cover = String(data.cover || '').trim()
  const venueName = String(data.venue_info?.name || '').trim()
  return {
    title: String(data.name || '').trim(),
    location: venueName,
    coverUrl: cover ? (cover.startsWith('//') ? `https:${cover}` : cover) : '',
    sessions: extractBilibiliSessions(data)
  }
}

function damaiMtopNative(itemId, token, jar) {  const data = JSON.stringify({ itemId: String(itemId) })
  const t = Date.now().toString()
  const sign = md5(`${token}&${t}&${DAMAI_APP_KEY}&${data}`)
  const url =
    `https://acs.m.taobao.com/h5/${DAMAI_API}/${DAMAI_VERSION}/?jsv=2.7.2&appKey=${DAMAI_APP_KEY}` +
    `&t=${t}&sign=${sign}&api=${DAMAI_API}&v=${DAMAI_VERSION}` +
    `&type=originaljson&dataType=json&timeout=20000&data=${encodeURIComponent(data)}`
  const headers = { Accept: '*/*', Referer: `https://m.damai.cn/damai/detail/item.html?itemId=${itemId}` }
  const cookie = Array.from(jar.entries()).map(([name, value]) => `${name}=${value}`).join('; ')
  if (cookie) headers.Cookie = cookie
  return nativeGetText(url, headers)
}

function readMtopToken(response) {
  const raw = headerValue(response?.headers, 'set-cookie')
  const match = raw.match(/(?:^|[,\s;])_m_h5_tk=([^;\s,]+)/)
  return match ? decodeURIComponent(match[1]).split('_')[0] : ''
}

async function parseDamaiDirect(id) {
  // 第一步：不带 token，mtop 返回 FAIL_SYS_TOKEN_EMPTY 并种 _m_h5_tk / cookie2；
  // 签名请求必须把这些 cookie 原样带回，否则仍报令牌为空
  const jar = new Map()
  const first = await damaiMtopNative(id, '', jar)
  mergeNativeCookies(first, jar)
  let token = readMtopToken(first)
  if (!token) throw new Error('damai mtop token missing')

  let response = await damaiMtopNative(id, token, jar)
  mergeNativeCookies(response, jar)
  let payload = responseToJson(response)
  let ret = Array.isArray(payload?.ret) ? payload.ret.join(';') : String(payload?.ret || '')
  if (ret.includes('FAIL_SYS_TOKEN_EXPIRED') || ret.includes('FAIL_SYS_TOKEN_EMPTY')) {
    // token 失效重试：mtop 会在本次响应重种 _m_h5_tk
    response = await damaiMtopNative(id, token, jar)
    mergeNativeCookies(response, jar)
    token = readMtopToken(response) || token
    payload = responseToJson(response)
    ret = Array.isArray(payload?.ret) ? payload.ret.join(';') : String(payload?.ret || '')
  }
  if (!ret.includes('SUCCESS')) throw new Error(`damai mtop ${ret || 'failed'}`)

  const result = payload?.data?.result
  let detail
  try {
    detail = typeof result === 'string' ? JSON.parse(result) : result
  } catch {
    throw new Error('damai detail parse failed')
  }
  const itemBase = detail?.detailViewComponentMap?.item?.staticData?.itemBase || detail?.itemBase || null
  if (!itemBase) throw new Error('damai itemBase missing')

  const coverUrl =
    String(itemBase.itemPic || '').trim() ||
    String(itemBase.itemPics?.itemPicList?.[0]?.picUrl || '').trim()
  // 场馆在 staticData.venue（venueName + venueAddr），itemBase 里没有；缺失时退回城市名
  const venue = detail?.detailViewComponentMap?.item?.staticData?.venue || null
  const location = [
    String(venue?.venueName || '').trim(),
    String(venue?.venueAddr || '').trim()
  ].filter(Boolean).join(' ') || String(itemBase.cityName || '').trim()

  return {
    title: String(itemBase.itemName || '').trim(),
    location,
    coverUrl
  }
}

async function parseMaoyanDirect(id) {
  const params = new URLSearchParams(MAOYAN_AJAX_PARAMS)
  const api = `https://wx.maoyan.com/maoyansh/myshow/ajax/v2/performance/${id}?${params}`
  const payload = responseToJson(await nativeGetText(api, {
    Accept: 'application/json',
    Referer: 'https://show.maoyan.com/qqw'
  }))
  if (payload?.success === false || (payload?.code && payload.code !== 200)) {
    throw new Error(String(payload?.msg || 'maoyan api failed'))
  }
  const data = payload?.data
  if (!data) throw new Error('maoyan data missing')

  const location = [String(data.shopName || '').trim(), String(data.address || '').trim()]
    .filter(Boolean)
    .join(' ')
  return {
    title: String(data.name || '').trim(),
    location,
    coverUrl: String(data.posterUrl || '').trim()
  }
}

// ── 短链解析（原生手动跟跳） ──────────────────────────────────────────────

function sniffIdFromHtml(html) {
  const patterns = [
    /itemId["'=:\s]+(\d{6,})/,
    /performanceId["'=:\s]+(\d{6,})/,
    /[?&](?:itemId|id|projectId)=(\d{6,})/,
    /\/(?:detail|performance)\/(\d{6,})/
  ]
  for (const pattern of patterns) {
    const match = String(html || '').match(pattern)
    if (match) return match[1]
  }
  return ''
}

async function resolveShortLinkNative(rawUrl) {
  /** @type {URL} */
  let url = new URL(rawUrl)
  let result = detectPlatform(url)
  let body = ''

  for (let hop = 0; hop < MAX_REDIRECT_HOPS && !result; hop += 1) {
    if (!isAllowedHost(url.hostname)) return { url, result: null }
    let response
    try {
      response = await nativeGetText(url.toString())
    } catch {
      return { url, result: null }
    }

    const location = headerValue(response?.headers, 'location')
    if (location) {
      try {
        url = new URL(location, url)
      } catch {
        return { url, result: null }
      }
      if (!isAllowedHost(url.hostname)) return { url, result: null }
      result = detectPlatform(url)
      continue
    }

    // 非 302：嗅探落地页里的 id（短链可能用 JS/meta 跳转）
    body = responseBodyToText(response?.data)
    const id = sniffIdFromHtml(body)
    if (!id) break
    const host = url.hostname.toLowerCase()
    if (host.endsWith('.damai.cn') || host === 'damai.cn') {
      result = { platform: 'damai', id }
    } else if (host.endsWith('.maoyan.com') || host === 'maoyan.com') {
      result = { platform: 'maoyan', id }
    } else if (host.endsWith('.bilibili.com') || host === 'bilibili.com') {
      result = { platform: 'bilibili', id }
    }
    // 页面里只有无特征数字 id 时没有宿主可归属，停止
    break
  }
  return { url, result }
}

// ── Web / 兜底：Pages Function 代理 ───────────────────────────────────────

function eventCoverProxyUrls() {
  // 生产 Web / 原生 WebView 同源命中 Pages Function；
  // dev（localhost）本地没有该 Function，回落到线上站点绝对地址
  const urls = [`${window.location.origin}${EVENT_COVER_PROXY_PATH}`]
  if (window.location.origin !== AUTH_WEB_ORIGIN) {
    urls.push(`${AUTH_WEB_ORIGIN}${EVENT_COVER_PROXY_PATH}`)
  }
  return urls
}

/**
 * @param {string} url 分享链接
 * @returns {Promise<{platform: string, id: string, title: string, coverUrl: string, location?: string}>}
 */
async function requestCoverParseViaProxy(url) {
  const targets = eventCoverProxyUrls()
  let lastError = null
  for (const base of targets) {
    const target = `${base}?url=${encodeURIComponent(url)}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const response = await fetch(target, { signal: controller.signal })
      // 非 JSON 响应（如 Function 未部署时网关/SPA fallback 返回 HTML）视为
      // 代理不可用，换下一个目标而不是误判业务结果
      let payload = null
      try {
        payload = await response.json()
      } catch {
        payload = null
      }
      if (!response.ok) {
        const error = payload?.error || 'network'
        throw new Error(error === 'unsupported' ? 'unsupported' : 'network')
      }
      if (!payload || typeof payload !== 'object' || !payload.platform) {
        throw new Error('proxyBad')
      }
      if (!payload.coverUrl) throw new Error('noCover')
      return payload
    } catch (e) {
      lastError = e
      if (e instanceof Error && (e.message === 'unsupported' || e.message === 'noCover')) throw e
      // 网络/404/非函数响应：换下一个代理地址（dev 回落线上）
      continue
    } finally {
      clearTimeout(timer)
    }
  }
  throw new Error(lastError instanceof Error && lastError.message === 'unsupported' ? 'unsupported' : 'network')
}

// ── 对外入口 ─────────────────────────────────────────────────────────────

/**
 * 解析分享文本，返回活动名 / 地点 / 封面 CDN 链接。
 * 原生直连失败时回落 Pages Function；Web 直接走 Pages Function。
 * @param {string} text 用户粘贴的分享文本 / 链接
 * @returns {Promise<{ ok: true, platform: string, title: string, location: string, coverUrl: string }
 *   | { ok: false, reason: 'noUrl' | 'unsupported' | 'noCover' | 'network' }>}
 */
export async function parseEventCoverFromShareText(text) {
  const url = extractShareUrl(text)
  if (!url) return { ok: false, reason: 'noUrl' }
  if (!isSupportedShareHost(url)) return { ok: false, reason: 'unsupported' }

  // 标题清洗统一在客户端出口做（原生直连 / 代理两条路径共用一套）
  const normalize = (result) => ({
    ...result,
    title: cleanTitle(result.title),
    sessions: normalizeSessions(result.sessions)
  })

  if (isNative()) {
    try {
      const parsed = await parseViaNative(url)
      if (parsed) return normalize(parsed)
    } catch (e) {
      const message = e instanceof Error ? e.message : ''
      if (message === 'noCover') return { ok: false, reason: 'noCover' }
      // 直连失败（风控/网络/协议变化）→ 落到代理兜底
    }
  }

  try {
    const payload = await requestCoverParseViaProxy(url)
    return normalize({
      ok: true,
      platform: String(payload.platform || ''),
      title: String(payload.title || '').trim(),
      location: String(payload.location || '').trim(),
      coverUrl: String(payload.coverUrl || ''),
      sessions: Array.isArray(payload.sessions) ? payload.sessions : []
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : ''
    if (message === 'unsupported') return { ok: false, reason: 'unsupported' }
    if (message === 'noCover') return { ok: false, reason: 'noCover' }
    return { ok: false, reason: 'network' }
  }
}

/**
 * 原生直连解析：识别平台 → 直连对应 API；短链先手动跟跳。
 * 无法识别（短链落地无 id 等）返回 null，由调用方回落代理。
 * @param {string} url
 * @returns {Promise<{ ok: true, platform: string, title: string, location: string, coverUrl: string } | null>}
 */
async function parseViaNative(url) {
  let detected = detectPlatform(new URL(url))
  if (!detected) {
    const { result } = await resolveShortLinkNative(url)
    detected = result
  }
  if (!detected) return null

  let parsed
  if (detected.platform === 'bilibili') parsed = await parseBilibiliDirect(detected.id)
  else if (detected.platform === 'damai') parsed = await parseDamaiDirect(detected.id)
  else parsed = await parseMaoyanDirect(detected.id)

  return {
    ok: true,
    platform: detected.platform,
    title: parsed.title,
    location: parsed.location,
    coverUrl: parsed.coverUrl,
    sessions: Array.isArray(parsed.sessions) ? parsed.sessions : []
  }
}
