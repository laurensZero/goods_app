// @ts-check
/**
 * 活动封面分享链接解析 dev 代理（仅 Vite dev server 生效）
 *
 * 与 functions/event-cover/index.ts 同构（同协议、同解析逻辑）：
 * 生产 Web / 原生 WebView 命中 Cloudflare Pages Function，dev 下浏览器请求
 * /event-cover/parse 由本中间件承接，避免 SPA fallback 返回 HTML 导致解析误判。
 *
 * 协议：
 *   GET /event-cover/parse?url=<分享链接>
 *     → 200 { platform, id, title, location, coverUrl, finalUrl }
 *     → 422 { error: 'unsupported' }
 *     → 502 { error: 'upstream', message }
 *     → 400 { error: 'badRequest' }
 */

import { md5 } from '../src/utils/md5.js'

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const TIMEOUT_MS = 15000
const MAX_HOPS = 5

// 与 functions/event-cover/index.ts 保持一致：跳转/嗅探只允许票务平台域
const ALLOWED_SUFFIXES = ['.bilibili.com', '.damai.cn', '.taobao.com', '.maoyan.com', '.meituan.com']
const SHORT_LINK_HOSTS = ['b23.tv']

function isAllowedHost(hostname) {
  const host = String(hostname || '').toLowerCase()
  if (SHORT_LINK_HOSTS.includes(host)) return true
  return ALLOWED_SUFFIXES.some((suffix) => host.endsWith(suffix))
}

function json(res, body, status = 200) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.end(JSON.stringify(body))
}

async function fetchWithTimeout(url, init = {}) {
  return fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) })
}

// ── 平台识别（与 Pages Function 保持一致） ────────────────────────────────

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

// ── 短链跟随 + 页面嗅探 ───────────────────────────────────────────────────

function sniffIdFromHtml(html) {
  const patterns = [
    /itemId["'=:\s]+(\d{6,})/,
    /performanceId["'=:\s]+(\d{6,})/,
    /[?&](?:itemId|id|projectId)=(\d{6,})/,
    /\/(?:detail|performance)\/(\d{6,})/,
  ]
  for (const pattern of patterns) {
    const match = String(html || '').match(pattern)
    if (match) return match[1]
  }
  return ''
}

async function resolveShareUrl(rawUrl) {
  let url = new URL(rawUrl)
  let platformResult = detectPlatform(url)

  for (let hop = 0; hop < MAX_HOPS && !platformResult; hop += 1) {
    if (!isAllowedHost(url.hostname)) return { url, platformResult: null }
    let response
    try {
      response = await fetchWithTimeout(url.toString(), {
        redirect: 'manual',
        headers: {
          'user-agent': MOBILE_UA,
          accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        },
      })
    } catch {
      return { url, platformResult: null }
    }

    const location = response.headers.get('location')
    if (location) {
      try {
        url = new URL(location, url)
      } catch {
        return { url, platformResult: null }
      }
      if (!isAllowedHost(url.hostname)) return { url, platformResult: null }
      platformResult = detectPlatform(url)
      continue
    }

    // 非 302：嗅探落地页里的 id（u.damai.cn 一类短链可能用 JS/meta 跳转）
    let body = ''
    try {
      body = await response.text()
    } catch {
      body = ''
    }
    const id = sniffIdFromHtml(body)
    if (!id) break
    const host = url.hostname.toLowerCase()
    if (host.endsWith('.damai.cn') || host === 'damai.cn') {
      platformResult = { platform: 'damai', id }
    } else if (host.endsWith('.maoyan.com') || host === 'maoyan.com') {
      platformResult = { platform: 'maoyan', id }
    } else if (host.endsWith('.bilibili.com') || host === 'bilibili.com') {
      platformResult = { platform: 'bilibili', id }
    }
    // 页面里只有无特征数字 id 时没有宿主可归属，停止
    break
  }

  return { url, platformResult }
}

// ── 会员购 ────────────────────────────────────────────────────────────────

// 场次/票档提取（仅会员购）：与 functions/event-cover 保持一致。
// 去重/排序/价格格式化在客户端（eventCoverImport.js）统一做；大麦（场次接口
// 被 RGV587 风控）与猫眼（场次结构待在售演出验证）暂不提取，sessions 为空。
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

async function parseBilibili(id) {
  const api = `https://show.bilibili.com/api/ticket/project/get?version=134&id=${id}&project_id=${id}`
  const response = await fetchWithTimeout(api, {
    headers: {
      'user-agent': DESKTOP_UA,
      accept: 'application/json',
      referer: `https://show.bilibili.com/platform/detail.html?id=${id}`,
    },
  })
  if (!response.ok) throw new Error(`bilibili api http ${response.status}`)
  const payload = await response.json()
  if (payload?.errno !== 0 || !payload?.data) throw new Error('bilibili api errno != 0')

  const data = payload.data
  const cover = String(data.cover || '').trim()
  return {
    title: String(data.name || '').trim(),
    location: String(data.venue_info?.name || '').trim(),
    coverUrl: cover ? (cover.startsWith('//') ? `https:${cover}` : cover) : '',
    sessions: extractBilibiliSessions(data),
  }
}

// ── 大麦（mtop h5 两步流，与 Pages Function 保持一致） ────────────────────

const DAMAI_APP_KEY = '12574478'
const DAMAI_API = 'mtop.alibaba.damai.detail.getdetail'
const DAMAI_VERSION = '1.2'

function collectSetCookies(response) {
  if (typeof response.headers.getSetCookie === 'function') return response.headers.getSetCookie()
  return String(response.headers.get('set-cookie') || '').split(/,(?=[^;]+?=)/)
}

function readTokenFromSetCookie(response) {
  for (const cookie of collectSetCookies(response)) {
    const match = String(cookie).match(/(?:^|;\s*)_m_h5_tk=([^;\s]+)/)
    if (match) return decodeURIComponent(match[1]).split('_')[0]
  }
  return ''
}

function mergeResponseCookies(response, jar) {
  for (const cookie of collectSetCookies(response)) {
    const pair = String(cookie).split(';')[0].trim()
    const eq = pair.indexOf('=')
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim())
  }
}

async function damaiMtopRequest(itemId, token, jar) {
  const data = JSON.stringify({ itemId: String(itemId) })
  const t = Date.now().toString()
  const sign = md5(`${token}&${t}&${DAMAI_APP_KEY}&${data}`)
  const url =
    `https://acs.m.taobao.com/h5/${DAMAI_API}/${DAMAI_VERSION}/?jsv=2.7.2&appKey=${DAMAI_APP_KEY}` +
    `&t=${t}&sign=${sign}&api=${DAMAI_API}&v=${DAMAI_VERSION}` +
    `&type=originaljson&dataType=json&timeout=20000&data=${encodeURIComponent(data)}`
  const headers = {
    'user-agent': MOBILE_UA,
    accept: '*/*',
    referer: `https://m.damai.cn/damai/detail/item.html?itemId=${itemId}`,
  }
  const cookie = Array.from(jar.entries()).map(([name, value]) => `${name}=${value}`).join('; ')
  if (cookie) headers.cookie = cookie
  const response = await fetchWithTimeout(url, { headers })
  if (!response.ok) throw new Error(`damai mtop http ${response.status}`)
  mergeResponseCookies(response, jar)
  const payload = await response.json()
  return { payload, response }
}

async function parseDamai(id) {
  // 第一步：不带 token，mtop 返回 FAIL_SYS_TOKEN_EMPTY 并种 _m_h5_tk / cookie2；
  // 签名请求必须把这些 cookie 原样带回，否则仍报令牌为空
  const jar = new Map()
  const first = await damaiMtopRequest(id, '', jar)
  let token = readTokenFromSetCookie(first.response)
  if (!token) throw new Error('damai mtop token missing')

  let payload = (await damaiMtopRequest(id, token, jar)).payload
  let ret = Array.isArray(payload?.ret) ? payload.ret.join(';') : String(payload?.ret || '')
  if (ret.includes('FAIL_SYS_TOKEN_EXPIRED') || ret.includes('FAIL_SYS_TOKEN_EMPTY')) {
    // token 失效重试：mtop 会在本次响应重种 _m_h5_tk
    const retry = await damaiMtopRequest(id, token, jar)
    token = readTokenFromSetCookie(retry.response) || token
    payload = retry.payload
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
  const itemBase =
    detail?.detailViewComponentMap?.item?.staticData?.itemBase ||
    detail?.itemBase ||
    null
  if (!itemBase) throw new Error('damai itemBase missing')

  const coverUrl =
    String(itemBase.itemPic || '').trim() ||
    String(itemBase.itemPics?.itemPicList?.[0]?.picUrl || '').trim()

  // 场馆在 staticData.venue（venueName + venueAddr），itemBase 里没有；缺失时退回城市名
  const venue = detail?.detailViewComponentMap?.item?.staticData?.venue || null
  const location = [
    String(venue?.venueName || '').trim(),
    String(venue?.venueAddr || '').trim(),
  ].filter(Boolean).join(' ') || String(itemBase.cityName || '').trim()

  return {
    title: String(itemBase.itemName || '').trim(),
    coverUrl,
    location,
  }
}

// ── 猫眼演出 ──────────────────────────────────────────────────────────────

async function parseMaoyan(id) {
  const params = new URLSearchParams({
    buyInstructionType: '1',
    optimus_risk_level: '71',
    optimus_code: '10',
    sellChannel: '7',
    cityId: '30',
    yodaReady: 'h5',
    csecplatform: '4',
    csecversion: '2.3.0',
  })
  const api = `https://wx.maoyan.com/maoyansh/myshow/ajax/v2/performance/${id}?${params}`
  const response = await fetchWithTimeout(api, {
    headers: {
      'user-agent': DESKTOP_UA,
      accept: 'application/json',
      referer: 'https://show.maoyan.com/qqw',
    },
  })
  if (!response.ok) throw new Error(`maoyan api http ${response.status}`)
  const payload = await response.json()
  if (payload?.success === false || (payload?.code && payload.code !== 200)) {
    throw new Error(String(payload?.msg || 'maoyan api failed'))
  }
  const data = payload?.data
  if (!data) throw new Error('maoyan data missing')

  return {
    title: String(data.name || '').trim(),
    coverUrl: String(data.posterUrl || '').trim(),
    location: [String(data.shopName || '').trim(), String(data.address || '').trim()]
      .filter(Boolean)
      .join(' '),
  }
}

function absoluteCover(url) {
  const raw = String(url || '').trim()
  if (!raw) return ''
  if (raw.startsWith('//')) return `https:${raw}`
  if (/^https?:\/\//i.test(raw)) return raw
  return raw
}

// ── 中间件入口 ────────────────────────────────────────────────────────────

export async function handleEventCoverParse(rawQuery) {
  const target = String(rawQuery.get('url') || '').trim()
  if (!target) return { status: 400, body: { error: 'badRequest' } }

  let shareUrl
  try {
    shareUrl = new URL(target)
  } catch {
    return { status: 400, body: { error: 'badRequest' } }
  }
  if (shareUrl.protocol !== 'https:' || !isAllowedHost(shareUrl.hostname)) {
    return { status: 422, body: { error: 'unsupported' } }
  }

  const { url: finalUrl, platformResult } = await resolveShareUrl(shareUrl.toString())
  if (!platformResult) return { status: 422, body: { error: 'unsupported' } }

  const { platform, id } = platformResult
  try {
    let parsed
    if (platform === 'bilibili') parsed = await parseBilibili(id)
    else if (platform === 'damai') parsed = await parseDamai(id)
    else parsed = await parseMaoyan(id)

    return {
      status: 200,
      body: {
        platform,
        id,
        title: parsed.title || '',
        location: parsed.location || '',
        coverUrl: absoluteCover(parsed.coverUrl),
        sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
        finalUrl: finalUrl.toString(),
      },
    }
  } catch (error) {
    return {
      status: 502,
      body: { error: 'upstream', message: error instanceof Error ? error.message : String(error) },
    }
  }
}

export function eventCoverPlugin() {
  return {
    name: 'goods-app-event-cover-proxy',
    configureServer(server) {
      server.middlewares.use('/event-cover/parse', async (req, res) => {
        try {
          const requestUrl = new URL(req.originalUrl || req.url || '', 'http://localhost')
          const result = await handleEventCoverParse(requestUrl.searchParams)
          json(res, result.body, result.status)
        } catch (error) {
          json(res, { error: 'upstream', message: error instanceof Error ? error.message : String(error) }, 502)
        }
      })
    },
  }
}
