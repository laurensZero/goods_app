import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { fetchWithPlatformBridge } from '@/utils/platform/http'

const BILIBILI_API_BASE = 'https://api.bilibili.com'
const BILIBILI_PROXY_PREFIX = '/bilibili-api'
const BILIBILI_REFERER = 'https://www.bilibili.com/'
export const BILIBILI_MEDIA_HEADERS = {
  Referer: BILIBILI_REFERER,
  Origin: 'https://www.bilibili.com',
  Accept: '*/*',
  'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36'
}
const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43,
  5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7,
  16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21,
  56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52
]

let wbiKeyCache = null

function md5(input) {
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
  const words = new Array((((input.length + 8 - ((input.length + 8) % 64)) / 64) + 1) * 16).fill(0)
  for (let index = 0; index < input.length; index += 1) {
    words[index >> 2] |= (input.charCodeAt(index) & 0xff) << ((index % 4) * 8)
  }
  words[input.length >> 2] |= 0x80 << ((input.length % 4) * 8)
  words[words.length - 2] = input.length << 3
  words[words.length - 1] = input.length >>> 29

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

function toHttpsUrl(url) {
  const raw = String(url || '').trim()
  if (raw.startsWith('//')) return `https:${raw}`
  if (raw.startsWith('http://')) return `https://${raw.slice(7)}`
  return raw
}

function isTransientNetworkError(error) {
  const msg = String(error?.message || '').toLowerCase()
  return (
    error?.name === 'TypeError' ||
    msg.includes('unable to resolve host') ||
    msg.includes('no address associated with hostname') ||
    msg.includes('failed to fetch') ||
    msg.includes('timeout') ||
    msg.includes('econnrefused') ||
    msg.includes('econnreset') ||
    msg.includes('network')
  )
}

export { isTransientNetworkError }

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function biliJson(path, params = {}, options = {}) {
  const query = new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)]))
  const requestUrl = `${BILIBILI_API_BASE}${path}?${query.toString()}`
  let payload
  let status = 200

  const maxRetries = 2
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      if (Capacitor.isNativePlatform()) {
        const response = await CapacitorHttp.get({ url: requestUrl, headers: { Referer: BILIBILI_REFERER } })
        payload = typeof response.data === 'string' ? JSON.parse(response.data) : response.data
        status = Number(response.status || 0)
      } else {
        const response = await fetchWithPlatformBridge(`${BILIBILI_PROXY_PREFIX}${path}?${query.toString()}`, { headers: { Referer: BILIBILI_REFERER } })
        payload = await response.json()
        status = response.status
      }
      break
    } catch (error) {
      if (!isTransientNetworkError(error) || attempt >= maxRetries) throw error
      const jitter = Math.random() * 200 + 300
      const delay = jitter * Math.pow(2, attempt)
      console.warn(`[bilibili] API 请求失败，第 ${attempt + 1} 次重试，等待 ${Math.round(delay)}ms:`, error.message)
      await sleep(delay)
    }
  }

  if (status < 200 || status >= 300 || (!options.allowApiError && payload?.code !== 0)) {
    throw new Error(payload?.message || `Bilibili 请求失败（${status}）`)
  }
  return payload.data
}

async function biliSearchJson(query) {
  const requestUrl = `${BILIBILI_API_BASE}/x/web-interface/wbi/search/type?${query}`
  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.get({ url: requestUrl, headers: { Referer: BILIBILI_REFERER } })
    return typeof response.data === 'string' ? JSON.parse(response.data) : response.data
  }
  const response = await fetchWithPlatformBridge(`${BILIBILI_PROXY_PREFIX}/x/web-interface/wbi/search/type?${query}`, { headers: { Referer: BILIBILI_REFERER } })
  return response.json()
}

async function prepareBilibiliMediaUrl(url) {
  const normalizedUrl = toHttpsUrl(url)
  if (!normalizedUrl) return ''
  if (!Capacitor.isNativePlatform()) {
    return `/bilibili-media?url=${encodeURIComponent(normalizedUrl)}`
  }
  return normalizedUrl
}

async function getWbiQuery(params) {
  if (!wbiKeyCache || Date.now() - wbiKeyCache.time > 6 * 60 * 60 * 1000) {
    // 未登录时 nav 可能返回 code=-101（账号未登录），但 data.wbi_img 仍可用于搜索签名。
    const nav = await biliJson('/x/web-interface/nav', {}, { allowApiError: true })
    const imgUrl = String(nav?.wbi_img?.img_url || '')
    const subUrl = String(nav?.wbi_img?.sub_url || '')
    const imgKey = imgUrl.slice(imgUrl.lastIndexOf('/') + 1).split('.')[0]
    const subKey = subUrl.slice(subUrl.lastIndexOf('/') + 1).split('.')[0]
    if (!imgKey || !subKey) throw new Error('无法获取 Bilibili 搜索签名密钥')
    wbiKeyCache = { key: MIXIN_KEY_ENC_TAB.map((index) => `${imgKey}${subKey}`[index]).join('').slice(0, 32), time: Date.now() }
  }
  const signed = { ...params, wts: Math.floor(Date.now() / 1000) }
  const query = Object.keys(signed).sort().map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(signed[key]).replace(/[!'()*]/g, ''))}`).join('&')
  return `${query}&w_rid=${md5(query + wbiKeyCache.key)}`
}

function parseDuration(raw) {
  const match = String(raw || '').match(/^(\d+):([0-5]?\d)(?::([0-5]?\d))?$/)
  if (!match) return Number(raw) > 0 ? Number(raw) * 1000 : 0
  return ((Number(match[3] || 0) * 60 + Number(match[1])) * 60 + Number(match[2])) * 1000
}

function mapVideoToTrack(video = {}) {
  const bvid = String(video?.bvid || '').trim()
  return {
    id: `bili_${bvid || Date.now()}`,
    title: String(video?.title || '').replace(/<[^>]+>/g, '').trim(),
    artist: String(video?.author || video?.owner?.name || '').trim(),
    album: 'Bilibili',
    coverUrl: toHttpsUrl(video?.pic),
    durationMs: parseDuration(video?.duration),
    source: 'bilibili',
    bilibiliVideoId: bvid,
    neteaseSongId: '',
    qqSongId: ''
  }
}

export async function searchBilibiliVideos(keyword, limit = 20, page = 1) {
  const trimmed = String(keyword || '').trim()
  if (!trimmed) return []
  const query = await getWbiQuery({ search_type: 'video', keyword: trimmed, page, page_size: limit })
  const payload = await biliSearchJson(query)
  if (payload?.code !== 0) throw new Error(payload?.message || 'Bilibili 搜索失败')
  return (Array.isArray(payload?.data?.result) ? payload.data.result : []).map(mapVideoToTrack).filter((item) => item.bilibiliVideoId && item.title)
}

export async function fetchBilibiliPlayableUrl(bvid) {
  const normalizedBvid = String(bvid || '').trim()
  if (!normalizedBvid) throw new Error('缺少 Bilibili 视频 BV 号')
  const detail = await biliJson('/x/web-interface/view', { bvid: normalizedBvid })
  if (!Capacitor.isNativePlatform()) {
    const webPlayData = await biliJson('/x/player/playurl', {
      bvid: normalizedBvid,
      cid: detail?.cid,
      qn: 0,
      fnver: 0,
      fnval: 0,
      fourk: 1
    })
    const legacyUrl = toHttpsUrl(webPlayData?.durl?.[0]?.url || webPlayData?.durl?.[0]?.backup_url)
    if (legacyUrl) return { url: await prepareBilibiliMediaUrl(legacyUrl), code: 0 }
  }
  const playData = await biliJson('/x/player/playurl', {
    bvid: normalizedBvid,
    cid: detail?.cid,
    qn: 0,
    fnver: 0,
    fnval: 16,
    fourk: 1
  })
  const dashData = playData?.dash
  const audioStreams = Array.isArray(dashData?.audio) ? dashData.audio : []
  if (!audioStreams.length) throw new Error('该 Bilibili 视频没有可用音频流')
  const bestAudio = selectBilibiliAudioStream(audioStreams)
  const baseUrl = bestAudio?.baseUrl || bestAudio?.base_url
  const backupUrls = (bestAudio?.backupUrl || bestAudio?.backup_url || [])
    .map((candidate) => toHttpsUrl(candidate))
    .filter(Boolean)
  const url = toHttpsUrl(baseUrl || backupUrls[0])
  if (!url) throw new Error('Bilibili 音频流地址为空')
  return {
    url: await prepareBilibiliMediaUrl(url),
    fallbackUrls: backupUrls.filter((candidate) => candidate !== url),
    code: 0
  }
}

export function selectBilibiliAudioStream(audioStreams = []) {
  const streams = Array.isArray(audioStreams) ? audioStreams.filter(Boolean) : []
  const browserFriendly = streams.filter((stream) => {
    const descriptor = `${stream?.mimeType || stream?.mime_type || ''} ${stream?.codecs || ''}`.toLowerCase()
    return !/(flac|opus|webm|dolby)/i.test(descriptor)
  })
  // 30250/30251/30280 等高规格流可能需要登录或额外权限；
  // 30232、30216 是普通账号更稳定可用的 AAC 流。
  const guestFriendly = browserFriendly.filter((stream) => [30232, 30216].includes(Number(stream?.id)))
  return [...(guestFriendly.length ? guestFriendly : browserFriendly.length ? browserFriendly : streams)]
    .sort((left, right) => Number(right?.bandwidth || 0) - Number(left?.bandwidth || 0))[0] || null
}

export function buildBilibiliWebUrl(bvid) {
  const normalizedBvid = String(bvid || '').trim()
  return normalizedBvid ? `https://www.bilibili.com/video/${normalizedBvid}` : ''
}

export function parseBilibiliVideoId(input) {
  const raw = String(input || '').trim()
  const match = raw.match(/(?:video\/)?(BV[a-zA-Z0-9]+)/i)
  return match ? match[1] : ''
}

export { md5 }
