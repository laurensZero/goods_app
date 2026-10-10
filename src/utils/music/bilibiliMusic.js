import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { fetchWithPlatformBridge } from '@/utils/platform/http'
import { md5 } from '@/utils/md5'

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
        const text = await response.text()
        const trimmed = text.trim()
        if (!trimmed || trimmed.startsWith('<')) {
          throw new Error('Bilibili 接口被风控拦截，请稍后重试或改用其他音乐源')
        }
        payload = JSON.parse(trimmed)
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
  const text = await response.text()
  const trimmed = text.trim()
  if (!trimmed || trimmed.startsWith('<')) {
    throw new Error('Bilibili 接口被风控拦截，请稍后重试或改用其他音乐源')
  }
  return JSON.parse(trimmed)
}

async function prepareBilibiliMediaUrl(url) {
  const normalizedUrl = toHttpsUrl(url)
  if (!normalizedUrl) return ''
  if (!Capacitor.isNativePlatform()) {
    return `/bilibili-media?url=${encodeURIComponent(normalizedUrl)}`
  }
  return normalizedUrl
}

// 开发代理 /bilibili-media 需能识别的 B 站媒体域名（与 vite.config.js 白名单保持一致）。
const BILIBILI_MEDIA_HOST_PATTERNS = [
  /(^|\.)bilivideo\.com$/i,
  /(^|\.)bilivideo\.cn$/i,
  /(^|\.)mountaintoys\.cn$/i
]

function isBilibiliMediaHost(hostname) {
  return BILIBILI_MEDIA_HOST_PATTERNS.some((pattern) => pattern.test(String(hostname || '')))
}

/**
 * 在多个候选播放地址里挑一条：
 * 1) 优先 https
 * 2) 优先 bilivideo.com（相对更稳的官方备份 CDN）
 * 3) 其次其它可识别的 B 站媒体域
 * 4) 其余原样保留（原生端可播任意域名）
 */
export function pickBilibiliMediaUrl(candidates = []) {
  const urls = Array.isArray(candidates) ? candidates : [candidates]
  const normalized = []
  const seen = new Set()
  for (const candidate of urls) {
    const url = toHttpsUrl(candidate)
    if (!url || seen.has(url)) continue
    seen.add(url)
    let host = ''
    try {
      host = new URL(url).hostname
    } catch {
      continue
    }
    normalized.push({ url, host })
  }
  if (!normalized.length) return ''

  const score = ({ url, host }) => {
    let value = url.startsWith('https://') ? 2 : 1
    if (/(^|\.)bilivideo\.com$/i.test(host)) value += 4
    else if (isBilibiliMediaHost(host)) value += 2
    return value
  }
  return normalized.sort((left, right) => score(right) - score(left))[0].url
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

/**
 * 按 BV 号批量取封面（view 接口的 pic）。
 * 补救历史写入时丢了 coverUrl 的 B 站曲目（B 站没有像网易/QQ 那样的 songId 封面接口）。
 * @param {string[]} bvids
 * @returns {Promise<Record<string, string>>} bvid → coverUrl
 */
export async function fetchBilibiliCoverMap(bvids) {
  const ids = Array.from(new Set((Array.isArray(bvids) ? bvids : []).map((id) => String(id || '').trim()).filter(Boolean))).slice(0, 12)
  if (!ids.length) return {}
  const entries = await Promise.all(
    ids.map(async (bvid) => {
      try {
        const detail = await biliJson('/x/web-interface/view', { bvid })
        const cover = toHttpsUrl(detail?.pic)
        return cover ? [bvid, cover] : null
      } catch {
        return null
      }
    })
  )
  return Object.fromEntries(entries.filter(Boolean))
}

/**
 * 按 bvid 拉取视频元数据（UP 主/标题/封面等），附带分P明细 pages。
 * AI 试听链接文案可能只有歌名，播放器缺歌手时用它补全。
 * @param {string} bvid
 * @param {number} [page] 指定分P时按该分P的时长返回 durationMs
 * @returns {Promise<{ title: string, artist: string, coverUrl: string, durationMs: number, pages: Array<{ page: number, part: string, durationMs: number }> } | null>}
 */
export async function fetchBilibiliVideoMeta(bvid, page = 0) {
  const normalizedBvid = String(bvid || '').trim()
  if (!normalizedBvid) return null
  const detail = await biliJson('/x/web-interface/view', { bvid: normalizedBvid })
  if (!detail) return null
  const pages = (Array.isArray(detail?.pages) ? detail.pages : [])
    .map((item) => ({
      page: Math.max(0, Math.floor(Number(item?.page) || 0)),
      part: String(item?.part || '').trim(),
      durationMs: Number(item?.duration) > 0 ? Number(item.duration) * 1000 : 0
    }))
    .filter((item) => item.page > 0)
  const requestedPage = Math.max(0, Math.floor(Number(page) || 0))
  const pageMeta = requestedPage > 1 ? pages.find((item) => item.page === requestedPage) : null
  const topDurationMs = Number(detail?.duration) > 0 ? Number(detail.duration) * 1000 : 0
  return {
    title: String(detail?.title || '').replace(/<[^>]+>/g, '').trim(),
    artist: String(detail?.owner?.name || detail?.author || '').trim(),
    coverUrl: toHttpsUrl(detail?.pic),
    durationMs: pageMeta?.durationMs || topDurationMs,
    pages
  }
}

export async function fetchBilibiliPlayableUrl(bvid, page = 0) {
  const normalizedBvid = String(bvid || '').trim()
  if (!normalizedBvid) throw new Error('缺少 Bilibili 视频 BV 号')
  const detail = await biliJson('/x/web-interface/view', { bvid: normalizedBvid })
  // 多P视频第1P用顶层 cid；page>1 用 pages 里的对应 cid，越界/缺失回落顶层
  const pages = Array.isArray(detail?.pages) ? detail.pages : []
  const requestedPage = Math.max(0, Math.floor(Number(page) || 0))
  const pageEntry = requestedPage > 1 ? pages.find((item) => Number(item?.page) === requestedPage) : null
  const cid = pageEntry?.cid ?? detail?.cid
  if (!Capacitor.isNativePlatform()) {
    const webPlayData = await biliJson('/x/player/playurl', {
      bvid: normalizedBvid,
      cid,
      qn: 0,
      fnver: 0,
      fnval: 0,
      fourk: 1
    })
    // backup_url 是数组；primary 缺失时不能直接 String(backup_url)
    const durlItem = webPlayData?.durl?.[0] || {}
    const legacyCandidates = [
      durlItem.url,
      ...(Array.isArray(durlItem.backup_url) ? durlItem.backup_url : [])
    ]
    const legacyUrl = pickBilibiliMediaUrl(legacyCandidates)
    if (legacyUrl) return { url: await prepareBilibiliMediaUrl(legacyUrl), code: 0 }
  }
  const playData = await biliJson('/x/player/playurl', {
    bvid: normalizedBvid,
    cid,
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
  const backupUrls = (Array.isArray(bestAudio?.backupUrl) ? bestAudio.backupUrl
    : Array.isArray(bestAudio?.backup_url) ? bestAudio.backup_url
      : [])
    .map((candidate) => toHttpsUrl(candidate))
    .filter(Boolean)
  // mcdn/bilivideo.cn 与 mountaintoys 有时可用但不稳；优先 bilivideo.com 备份
  const candidates = [baseUrl, ...backupUrls].map((candidate) => toHttpsUrl(candidate)).filter(Boolean)
  const url = pickBilibiliMediaUrl(candidates)
  if (!url) throw new Error('Bilibili 音频流地址为空')
  return {
    url: await prepareBilibiliMediaUrl(url),
    fallbackUrls: candidates.filter((candidate) => candidate !== url),
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

export function buildBilibiliWebUrl(bvid, page = 0) {
  const normalizedBvid = String(bvid || '').trim()
  if (!normalizedBvid) return ''
  const pageNumber = Math.max(0, Math.floor(Number(page) || 0))
  return pageNumber > 1
    ? `https://www.bilibili.com/video/${normalizedBvid}?p=${pageNumber}`
    : `https://www.bilibili.com/video/${normalizedBvid}`
}

export function parseBilibiliVideoId(input) {
  const raw = String(input || '').trim()
  // BV 号固定为 BV + 10 位字符。旧的 BV[a-zA-Z0-9]+ 会把 "BVx" 这样的输入也当成视频号，
  // 让「粘贴 BV/链接添加」在输入笔误时去请求接口报错，而不是回落成普通搜索。
  const match = raw.match(/BV[0-9A-Za-z]{10}/i)
  return match ? match[0] : ''
}

export { md5 }
