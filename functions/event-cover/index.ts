// 活动封面分享链接解析代理（goodsapp.de5.net/event-cover）
//
// 支持从 B 站会员购 / 大麦 / 猫眼演出的分享链接解析活动标题与封面图。
// 客户端：src/utils/events/eventCoverImport.js（Web 同源 fetch / 原生 WebView
// fetch 同源命中本函数；dev 本地起不了 Pages Function 时经绝对地址兜底）。
//
// 为什么走服务端：三个平台均为 SPA 或 CORS 受限页面（猫眼 h5 接口无 ACAO、
// 大麦详情数据在 mtop 接口需 _m_h5_tk 签名、会员购 API 对带 Origin 的请求 403），
// 只有服务端请求才能拿到数据。
//
// 路由（GET）：
//   /event-cover/parse?url=<分享链接>
//     → 200 { platform: 'bilibili'|'damai'|'maoyan', id, title, coverUrl, finalUrl }
//     → 422 { error: 'unsupported' }   非三平台链接（含跟随跳转后仍不识别）
//     → 502 { error: 'upstream', message }  上游接口失败 / 风控拦截
//     → 400 { error: 'badRequest' }
//
// 解析逻辑：
//   - 短链（u.damai.cn 等）：服务端手动跟随跳转（最多 5 跳，白名单域内），
//     落地 URL 仍无 id 时回退嗅探页面里的 itemId= / performanceId=。
//   - 会员购：show.bilibili.com 项目详情 API（data.name / data.cover）。
//   - 大麦：mtop h5 两步流（先取 _m_h5_tk，再带 sign 调 detail.getdetail），
//     详情 result 内嵌 JSON，取 itemBase.itemName / itemPic。
//   - 猫眼：myshow ajax v2 performance 接口（微信侧 host，带 h5 风控参数）；
//     响应字段不固定，标题/封面用容错扫描提取。

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const TIMEOUT_MS = 15000
const MAX_HOPS = 5

// 跳转/嗅探只允许在票务平台域内，防止被当开放代理用
// （b23.tv 是 B 站票务短链域，u.damai.cn 由 .damai.cn 覆盖）
const ALLOWED_SUFFIXES = ['.bilibili.com', '.damai.cn', '.taobao.com', '.maoyan.com', '.meituan.com']
const SHORT_LINK_HOSTS = ['b23.tv']

const CORS_HEADERS = Object.freeze({
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'content-type',
})

function isAllowedHost(hostname) {
  const host = String(hostname || '').toLowerCase()
  if (SHORT_LINK_HOSTS.includes(host)) return true
  return ALLOWED_SUFFIXES.some((suffix) => host.endsWith(suffix))
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'content-type': 'application/json; charset=utf-8' },
  })
}

function errorResponse(error, status, message) {
  return json({ error, ...(message ? { message } : {}) }, status)
}

async function fetchWithTimeout(url, init = {}) {
  return fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) })
}

// ── 平台识别 ──────────────────────────────────────────────────────────────

type PlatformId = 'bilibili' | 'damai' | 'maoyan'

function detectPlatform(url: URL): { platform: PlatformId; id: string } | null {
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
  let body = ''

  for (let hop = 0; hop < MAX_HOPS && !platformResult; hop += 1) {
    if (!isAllowedHost(url.hostname)) return { url, platformResult: null, body: '' }
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
      return { url, platformResult: null, body: '' }
    }

    const location = response.headers.get('location')
    if (location) {
      let nextUrl
      try {
        nextUrl = new URL(location, url)
      } catch {
        return { url, platformResult: null, body: '' }
      }
      if (!isAllowedHost(nextUrl.hostname)) return { url, platformResult: null, body: '' }
      url = nextUrl
      platformResult = detectPlatform(url)
      continue
    }

    // 非 302：把落地页读出来嗅探 id（u.damai.cn 一类短链可能用 JS/meta 跳转）
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

  return { url, platformResult, body }
}

// ── 会员购 ────────────────────────────────────────────────────────────────

export async function parseBilibili(id) {
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
    coverUrl: cover ? (cover.startsWith('//') ? `https:${cover}` : cover) : ''
  }
}

// ── 大麦（mtop h5 两步流）────────────────────────────────────────────────

// 纯 JS MD5（UTF-8 输入），mtop sign 用；与 src/utils/md5.js 同实现（已测向量）。
function utf8Bytes(input) {
  const str = String(input)
  if (typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(str))
  const bytes = []
  for (let index = 0; index < str.length; index += 1) {
    let code = str.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff && index + 1 < str.length) {
      const next = str.charCodeAt(index + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = ((code - 0xd800) << 10) + (next - 0xdc00) + 0x10000
        index += 1
      }
    }
    if (code < 0x80) {
      bytes.push(code)
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f))
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
    } else {
      bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
    }
  }
  return bytes
}

function md5(input) {
  const bytes = utf8Bytes(input)
  const byteLen = bytes.length
  const rotate = (value, bits) => (value << bits) | (value >>> (32 - bits))
  const add = (x, y) => {
    const x4 = x & 0x40000000
    const y4 = y & 0x40000000
    const x8 = x & 0x80000000
    const y8 = y & 0x80000000
    const low = (x & 0x3fffffff) + (y & 0x3fffffff)
    if (x4 & y4) return low ^ 0x80000000 ^ x8 ^ y8
    if (x4 | y4) return (low & 0x40000000) ? low ^ 0xc0000000 ^ x8 ^ y8 : low ^ 0x40000000 ^ x8 ^ y8
    return low ^ x8 ^ y8
  }
  const f = (x, y, z) => (x & y) | (~x & z)
  const g = (x, y, z) => (x & z) | (y & ~z)
  const h = (x, y, z) => x ^ y ^ z
  const i = (x, y, z) => y ^ (x | ~z)
  const op = (fn, a, b, c, d, x, s, t) => add(rotate(add(a, add(add(fn(b, c, d), x), t)), s), b)
  const words = new Array((((byteLen + 8 - ((byteLen + 8) % 64)) / 64) + 1) * 16).fill(0)
  for (let index = 0; index < byteLen; index += 1) {
    words[index >> 2] |= bytes[index] << ((index % 4) * 8)
  }
  words[byteLen >> 2] |= 0x80 << ((byteLen % 4) * 8)
  words[words.length - 2] = byteLen << 3
  words[words.length - 1] = byteLen >>> 29

  let a = 0x67452301
  let b = 0xefcdab89
  let c = 0x98badcfe
  let d = 0x10325476
  for (let offset = 0; offset < words.length; offset += 16) {
    const aa = a; const bb = b; const cc = c; const dd = d
    a = op(f, a, b, c, d, words[offset], 7, 0xd76aa478); d = op(f, d, a, b, c, words[offset + 1], 12, 0xe8c7b756); c = op(f, c, d, a, b, words[offset + 2], 17, 0x242070db); b = op(f, b, c, d, a, words[offset + 3], 22, 0xc1bdceee)
    a = op(f, a, b, c, d, words[offset + 4], 7, 0xf57c0faf); d = op(f, d, a, b, c, words[offset + 5], 12, 0x4787c62a); c = op(f, c, d, a, b, words[offset + 6], 17, 0xa8304613); b = op(f, b, c, d, a, words[offset + 7], 22, 0xfd469501)
    a = op(f, a, b, c, d, words[offset + 8], 7, 0x698098d8); d = op(f, d, a, b, c, words[offset + 9], 12, 0x8b44f7af); c = op(f, c, d, a, b, words[offset + 10], 17, 0xffff5bb1); b = op(f, b, c, d, a, words[offset + 11], 22, 0x895cd7be)
    a = op(f, a, b, c, d, words[offset + 12], 7, 0x6b901122); d = op(f, d, a, b, c, words[offset + 13], 12, 0xfd987193); c = op(f, c, d, a, b, words[offset + 14], 17, 0xa679438e); b = op(f, b, c, d, a, words[offset + 15], 22, 0x49b40821)
    a = op(g, a, b, c, d, words[offset + 1], 5, 0xf61e2562); d = op(g, d, a, b, c, words[offset + 6], 9, 0xc040b340); c = op(g, c, d, a, b, words[offset + 11], 14, 0x265e5a51); b = op(g, b, c, d, a, words[offset], 20, 0xe9b6c7aa)
    a = op(g, a, b, c, d, words[offset + 5], 5, 0xd62f105d); d = op(g, d, a, b, c, words[offset + 10], 9, 0x02441453); c = op(g, c, d, a, b, words[offset + 15], 14, 0xd8a1e681); b = op(g, b, c, d, a, words[offset + 4], 20, 0xe7d3fbc8)
    a = op(g, a, b, c, d, words[offset + 9], 5, 0x21e1cde6); d = op(g, d, a, b, c, words[offset + 14], 9, 0xc33707d6); c = op(g, c, d, a, b, words[offset + 3], 14, 0xf4d50d87); b = op(g, b, c, d, a, words[offset + 8], 20, 0x455a14ed)
    a = op(g, a, b, c, d, words[offset + 13], 5, 0xa9e3e905); d = op(g, d, a, b, c, words[offset + 2], 9, 0xfcefa3f8); c = op(g, c, d, a, b, words[offset + 7], 14, 0x676f02d9); b = op(g, b, c, d, a, words[offset + 12], 20, 0x8d2a4c8a)
    a = op(h, a, b, c, d, words[offset + 5], 4, 0xfffa3942); d = op(h, d, a, b, c, words[offset + 8], 11, 0x8771f681); c = op(h, c, d, a, b, words[offset + 11], 16, 0x6d9d6122); b = op(h, b, c, d, a, words[offset + 14], 23, 0xfde5380c)
    a = op(h, a, b, c, d, words[offset + 1], 4, 0xa4beea44); d = op(h, d, a, b, c, words[offset + 4], 11, 0x4bdecfa9); c = op(h, c, d, a, b, words[offset + 7], 16, 0xf6bb4b60); b = op(h, b, c, d, a, words[offset + 10], 23, 0xbebfbc70)
    a = op(h, a, b, c, d, words[offset + 13], 4, 0x289b7ec6); d = op(h, d, a, b, c, words[offset], 11, 0xeaa127fa); c = op(h, c, d, a, b, words[offset + 3], 16, 0xd4ef3085); b = op(h, b, c, d, a, words[offset + 6], 23, 0x04881d05)
    a = op(h, a, b, c, d, words[offset + 9], 4, 0xd9d4d039); d = op(h, d, a, b, c, words[offset + 12], 11, 0xe6db99e5); c = op(h, c, d, a, b, words[offset + 15], 16, 0x1fa27cf8); b = op(h, b, c, d, a, words[offset + 2], 23, 0xc4ac5665)
    a = op(i, a, b, c, d, words[offset], 6, 0xf4292244); d = op(i, d, a, b, c, words[offset + 7], 10, 0x432aff97); c = op(i, c, d, a, b, words[offset + 14], 15, 0xab9423a7); b = op(i, b, c, d, a, words[offset + 5], 21, 0xfc93a039)
    a = op(i, a, b, c, d, words[offset + 12], 6, 0x655b59c3); d = op(i, d, a, b, c, words[offset + 3], 10, 0x8f0ccc92); c = op(i, c, d, a, b, words[offset + 10], 15, 0xffeff47d); b = op(i, b, c, d, a, words[offset + 1], 21, 0x85845dd1)
    a = op(i, a, b, c, d, words[offset + 8], 6, 0x6fa87e4f); d = op(i, d, a, b, c, words[offset + 15], 10, 0xfe2ce6e0); c = op(i, c, d, a, b, words[offset + 6], 15, 0xa3014314); b = op(i, b, c, d, a, words[offset + 13], 21, 0x4e0811a1)
    a = op(i, a, b, c, d, words[offset + 4], 6, 0xf7537e82); d = op(i, d, a, b, c, words[offset + 11], 10, 0xbd3af235); c = op(i, c, d, a, b, words[offset + 2], 15, 0x2ad7d2bb); b = op(i, b, c, d, a, words[offset + 9], 21, 0xeb86d391)
    a = add(a, aa); b = add(b, bb); c = add(c, cc); d = add(d, dd)
  }
  const hex = (value) => Array.from({ length: 4 }, (_, index) => ((value >>> (index * 8)) & 255).toString(16).padStart(2, '0')).join('')
  return `${hex(a)}${hex(b)}${hex(c)}${hex(d)}`
}

const DAMAI_APP_KEY = '12574478'
const DAMAI_API = 'mtop.alibaba.damai.detail.getdetail'
const DAMAI_VERSION = '1.2'

function readTokenFromSetCookie(response) {
  // Workers Response.headers.getSetCookie() 返回完整 Set-Cookie 数组
  const cookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : []
  for (const cookie of cookies) {
    const match = String(cookie).match(/(?:^|;\s*)_m_h5_tk=([^;\s]+)/)
    if (match) return decodeURIComponent(match[1]).split('_')[0]
  }
  // 兜底：合并头解析（getSetCookie 不可用时）
  const raw = response.headers.get('set-cookie') || ''
  const match = raw.match(/_m_h5_tk=([^;\s]+)/)
  return match ? decodeURIComponent(match[1]).split('_')[0] : ''
}

/** 把响应 Set-Cookie 合并进 cookie 罐（name=value，丢弃属性），返回 Cookie 头值 */
function mergeResponseCookies(response, jar) {
  const cookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : []
  const rawList = cookies.length ? cookies : String(response.headers.get('set-cookie') || '').split(/,(?=[^;]+?=)/)
  for (const cookie of rawList) {
    const pair = String(cookie).split(';')[0].trim()
    const name = pair.split('=')[0]
    if (name && pair.includes('=')) jar.set(name, pair.slice(name.length + 1))
  }
}

function cookieHeaderValue(jar) {
  return Array.from(jar.entries()).map(([name, value]) => `${name}=${value}`).join('; ')
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
  const cookie = cookieHeaderValue(jar)
  if (cookie) headers.cookie = cookie
  const response = await fetchWithTimeout(url, { headers })
  if (!response.ok) throw new Error(`damai mtop http ${response.status}`)
  mergeResponseCookies(response, jar)
  const payload = await response.json()
  return { payload, response }
}

export async function parseDamai(id) {
  // 第一步：不带 token，mtop 返回 FAIL_SYS_TOKEN_EMPTY 并种 _m_h5_tk / cookie2；
  // 签名请求必须把这些 cookie 原样带回，否则仍报令牌为空
  const jar = new Map()
  const first = await damaiMtopRequest(id, '', jar)
  let token = readTokenFromSetCookie(first.response)
  if (!token) {
    // 个别链路第一步不种 cookie：把第一响应的 ret 检查掉直接再试一次
    throw new Error('damai mtop token missing')
  }
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

  // 场馆在 staticData.venue（venueName + venueAddr），itemBase 里没有；
  // 缺失时退回城市名
  const venue = detail?.detailViewComponentMap?.item?.staticData?.venue || null
  const location = [
    String(venue?.venueName || '').trim(),
    String(venue?.venueAddr || '').trim(),
  ].filter(Boolean).join(' ') || String(itemBase.cityName || '').trim()

  return {
    title: String(itemBase.itemName || '').trim(),
    coverUrl,
    location,
    city: String(itemBase.cityName || '').trim(),
    showTime: String(itemBase.showTime || '').trim()
  }
}

// ── 猫眼演出 ──────────────────────────────────────────────────────────────

const MAOYAN_IMAGE_HOSTS = ['.meituan.net', '.maoyan.com', '.dianping.com']
const MAOYAN_TITLE_KEYS = ['name', 'showName', 'performanceName', 'title']
const MAOYAN_COVER_KEYS = [
  'verticalPicUrl', 'verticalPic', 'posterUrl', 'poster', 'picUrl', 'pic',
  'coverUrl', 'cover', 'mainImageUrl', 'headPortrait',
]

function pickString(obj, keys) {
  if (!obj || typeof obj !== 'object') return ''
  for (const key of keys) {
    const value = obj[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'object' && value?.url && typeof value.url === 'string') return value.url
  }
  return ''
}

function scanForImage(obj, depth = 0) {
  if (depth > 4 || !obj || typeof obj !== 'object') return ''
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const hit = scanForImage(item, depth + 1)
      if (hit) return hit
    }
    return ''
  }
  // 两轮扫描：先挑键名带图片语义的字段，再兜底任意图片 URL
  for (const pass of [0, 1]) {
    for (const [key, value] of Object.entries(obj)) {
      if (pass === 0 && !/pic|poster|cover|image|img/i.test(key)) continue
      if (typeof value === 'string') {
        const match = value.match(/^https?:\/\/[^\s"']+\.(?:jpe?g|png|webp)(?:[?#].*)?$/i)
        if (match && MAOYAN_IMAGE_HOSTS.some((suffix) => new URL(match[0]).hostname.endsWith(suffix))) {
          return match[0]
        }
      } else if (value && typeof value === 'object') {
        const hit = scanForImage(value, depth + 1)
        if (hit) return hit
      }
    }
  }
  return ''
}

export async function parseMaoyan(id) {
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

  const title = pickString(data, MAOYAN_TITLE_KEYS)
  const cover = String(data.posterUrl || '').trim()
    || pickString(data, MAOYAN_COVER_KEYS)
    || scanForImage(data)
  const location = [String(data.shopName || '').trim(), String(data.address || '').trim()]
    .filter(Boolean)
    .join(' ')
  return { title, coverUrl: cover, location }
}

function absoluteCover(url, platform) {
  const raw = String(url || '').trim()
  if (!raw) return ''
  if (raw.startsWith('//')) return `https:${raw}`
  if (/^https?:\/\//i.test(raw)) return raw
  // 会员购偶发返回 //xxx 协议相对；这里再兜一次根相对
  return raw.startsWith('/') ? `https://i0.hdslb.com${raw}` : raw
}

// ── 入口 ─────────────────────────────────────────────────────────────────

export async function onRequest(context) {
  const { request } = context
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }
  if (request.method !== 'GET') {
    return errorResponse('badRequest', 400)
  }

  const url = new URL(request.url)
  const target = String(url.searchParams.get('url') || '').trim()
  if (!target) return errorResponse('badRequest', 400)

  let shareUrl
  try {
    shareUrl = new URL(target)
  } catch {
    return errorResponse('badRequest', 400)
  }
  if (shareUrl.protocol !== 'https:' || !isAllowedHost(shareUrl.hostname)) {
    return errorResponse('unsupported', 422)
  }

  const { url: finalUrl, platformResult } = await resolveShareUrl(shareUrl.toString())
  if (!platformResult) return errorResponse('unsupported', 422)

  const { platform, id } = platformResult
  try {
    let parsed
    if (platform === 'bilibili') parsed = await parseBilibili(id)
    else if (platform === 'damai') parsed = await parseDamai(id)
    else parsed = await parseMaoyan(id)

    return json({
      platform,
      id,
      title: parsed.title || '',
      location: parsed.location || '',
      coverUrl: absoluteCover(parsed.coverUrl, platform),
      finalUrl: finalUrl.toString(),
    })
  } catch (error) {
    return errorResponse('upstream', 502, error instanceof Error ? error.message : String(error))
  }
}
