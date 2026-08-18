import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { AppLauncher } from '@capacitor/app-launcher'
import { fetchWithPlatformBridge } from '@/utils/platform/http'

const QQ_MUSIC_API_BASE = 'https://u.y.qq.com/cgi-bin'
const QQ_MUSIC_C_BASE = 'https://c.y.qq.com'
const WEB_PROXY_PREFIX = '/qqmusic-api'
const WEB_PROXY_PREFIX_C = '/qqmusic-c'
const QQ_ANDROID_PACKAGE = 'com.tencent.qqmusic'
const REQUEST_HEADERS = {
  Referer: 'https://y.qq.com/'
}

function buildTrackId() {
  return `track_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function normalizeArtists(list) {
  const artists = Array.isArray(list) ? list : []
  return artists
    .map((item) => String(item?.name || item || '').trim())
    .filter(Boolean)
    .join(' / ')
}

function buildQQCoverUrl(mid, size = 300) {
  const normalizedMid = String(mid || '').trim()
  if (!normalizedMid) return ''
  return `https://y.gtimg.cn/music/photo_new/T002R${size}x${size}M000${normalizedMid}.jpg`
}

function buildQQSongCoverUrl(mid, size = 300) {
  const normalizedMid = String(mid || '').trim()
  if (!normalizedMid) return ''
  return `https://y.qq.com/music/photo_new/T062R${size}x${size}M000${normalizedMid}.jpg?max_age=2592000`
}

function firstNonEmptyString(...values) {
  return values
    .map((value) => String(value || '').trim())
    .find(Boolean) || ''
}

/**
 * QQ 的歌曲详情页不一定把封面放在 album 中。
 * 搜索结果和详情接口的字段名也不完全一致，因此先使用歌曲自身的图片，
 * 再回退到 album MID 拼接的传统封面地址。
 */
export function resolveQQCoverUrl(song = {}, size = 300) {
  const track = song?.track_info || song?.trackInfo || song
  const album = track?.album || {}
  const directCover = firstNonEmptyString(
    track?.coverUrl,
    track?.cover_url,
    track?.cover,
    track?.picUrl,
    track?.picurl,
    track?.pic_url,
    track?.albumPic,
    track?.album_pic,
    track?.album_pic_url,
    album?.picUrl,
    album?.picurl,
    album?.coverUrl,
    album?.cover_url,
    album?.cover,
    album?.pic_url
  )
  if (directCover) return directCover

  const albumMid = firstNonEmptyString(
    album?.mid,
    album?.albummid,
    track?.albummid,
    track?.albumMid
  )
  if (albumMid) return buildQQCoverUrl(albumMid, size)

  // 无专辑歌曲的详情页封面来自 track_info.vs，而不是 album.mid。
  const songCoverMid = Array.isArray(track?.vs)
    ? track.vs.map((item) => String(item || '').trim()).find((item) => /^[a-zA-Z0-9]{10,}$/.test(item))
    : ''
  if (songCoverMid) return buildQQSongCoverUrl(songCoverMid, size)

  return ''
}

function mapSongToTrack(song = {}) {
  const songMid = String(song?.mid || song?.songmid || '').trim()
  const songId = String(song?.id || song?.songid || '').trim()
  const albumMid = String(song?.album?.mid || song?.albummid || '').trim()
  const singerList = Array.isArray(song?.singer) ? song.singer : []
  const durationSec = Number(song?.interval || song?.dt || 0)

  return {
    id: buildTrackId(),
    title: String(song?.name || song?.songname || '').trim(),
    artist: normalizeArtists(singerList),
    album: String(song?.album?.name || song?.albumname || '').trim(),
    coverUrl: resolveQQCoverUrl(song),
    durationMs: durationSec > 0 ? durationSec * 1000 : 0,
    source: songMid ? 'qq' : 'manual',
    qqSongId: songMid || songId
  }
}

async function requestJson(url) {
  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.get({
      url,
      headers: REQUEST_HEADERS
    })
    if (typeof response.data === 'string') {
      try {
        return JSON.parse(response.data)
      } catch {
        throw new Error('QQ 音乐接口返回的数据格式异常')
      }
    }
    return response.data
  }

  const proxyUrl = url.replace(/^https:\/\/u\.y\.qq\.com/, WEB_PROXY_PREFIX)
  const response = await fetchWithPlatformBridge(proxyUrl, {
    headers: {}
  })
  if (!response.ok) {
    throw new Error(`请求失败（${response.status}）`)
  }
  return response.json()
}

async function requestCUrl(path) {
  const fullUrl = `${QQ_MUSIC_C_BASE}${path}`

  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.get({
      url: fullUrl,
      headers: REQUEST_HEADERS
    })
    if (typeof response.data === 'string') {
      return response.data
    }
    return JSON.stringify(response.data)
  }

  const proxyUrl = `${WEB_PROXY_PREFIX_C}${path}`
  const response = await fetchWithPlatformBridge(proxyUrl, {
    headers: {}
  })
  if (!response.ok) {
    throw new Error(`请求失败（${response.status}）`)
  }
  return response.text()
}

function ensureSongList(payload) {
  const songs = Array.isArray(payload?.req_0?.data?.body?.song?.list)
    ? payload.req_0.data.body.song.list
    : Array.isArray(payload?.data?.song?.list)
      ? payload.data.song.list
      : Array.isArray(payload?.songlist)
        ? payload.songlist
        : []

  return songs.map(mapSongToTrack).filter((item) => item.title)
}

function parseLyricTimeTag(rawTag) {
  const match = String(rawTag || '').trim().match(/^(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?$/)
  if (!match) return null

  const minutes = Number(match[1]) || 0
  const seconds = Number(match[2]) || 0
  const fractionRaw = String(match[3] || '')
  const fraction = fractionRaw
    ? Number(fractionRaw.padEnd(3, '0').slice(0, 3)) || 0
    : 0

  return (minutes * 60 * 1000) + (seconds * 1000) + fraction
}

function parseLrcText(text) {
  const lines = String(text || '').split(/\r?\n/)
  const parsed = []

  for (const rawLine of lines) {
    const line = String(rawLine || '')
    const timeTags = [...line.matchAll(/\[(\d{1,2}:\d{2}(?:\.\d{1,3})?)\]/g)]
    if (!timeTags.length) continue

    const content = line.replace(/\[(\d{1,2}:\d{2}(?:\.\d{1,3})?)\]/g, '').trim()
    if (!content) continue

    for (const tag of timeTags) {
      const timeMs = parseLyricTimeTag(tag[1])
      if (timeMs == null) continue
      parsed.push({
        timeMs,
        text: content
      })
    }
  }

  return parsed
    .sort((left, right) => left.timeMs - right.timeMs)
    .filter((line, index, list) => index === 0 || line.timeMs !== list[index - 1].timeMs || line.text !== list[index - 1].text)
}

export async function searchQQSongs(keyword, limit = 30, page = 1) {
  const trimmed = String(keyword || '').trim()
  if (!trimmed) return []

  const reqData = {
    req_0: {
      module: 'music.search.SearchCgiService',
      method: 'DoSearchForQQMusicDesktop',
      param: {
        query: trimmed,
        page_num: Math.max(1, Number(page) || 1),
        num_per_page: Math.max(1, Math.min(100, Number(limit) || 30))
      }
    }
  }

  const params = new URLSearchParams({
    format: 'json',
    data: JSON.stringify(reqData)
  })

  const payload = await requestJson(`${QQ_MUSIC_API_BASE}/musicu.fcg?${params.toString()}`)
  return ensureSongList(payload)
}

export function extractQQSongMid(input) {
  const raw = String(input || '').trim()
  if (!raw) return ''

  // Direct mid format: alphanumeric string like "001qvvgF3g3iFk"
  if (/^[a-zA-Z0-9]{10,}$/.test(raw)) return raw

  // URL with songmid param
  const midMatch = raw.match(/songmid=([a-zA-Z0-9]+)/i)
  if (midMatch) return midMatch[1]

  // URL path format: /song/xxxxx
  const pathMatch = raw.match(/song\/([a-zA-Z0-9]+)/i)
  if (pathMatch) return pathMatch[1]

  return ''
}

export async function fetchQQPlayableUrl(songMid) {
  const normalizedMid = String(songMid || '').trim()
  if (!normalizedMid) {
    throw new Error('缺少 QQ 音乐歌曲 MID')
  }

  const reqData = {
    req_0: {
      module: 'vkey.GetVkeyServer',
      method: 'CgiGetVkey',
      param: {
        guid: String(Math.floor(Math.random() * 10000000000)),
        songmid: [normalizedMid],
        songtype: [0],
        uin: '0',
        loginflag: 1,
        platform: '20'
      }
    }
  }

  const params = new URLSearchParams({
    format: 'json',
    data: JSON.stringify(reqData)
  })

  const payload = await requestJson(`${QQ_MUSIC_API_BASE}/musicu.fcg?${params.toString()}`)

  const midurlinfo = payload?.req_0?.data?.midurlinfo
  const purl = Array.isArray(midurlinfo) && midurlinfo.length > 0
    ? String(midurlinfo[0]?.purl || '').trim()
    : ''

  if (!purl) {
    throw new Error('这首歌当前不支持内嵌播放（可能需要 VIP 或版权限制）')
  }

  const sip = Array.isArray(payload?.req_0?.data?.sip) ? payload.req_0.data.sip : []
  const baseUrl = sip.length > 0 ? String(sip[0] || '').trim() : 'https://dl.stream.qqmusic.qq.com/'

  return {
    url: `${baseUrl}${purl}`,
    code: 0
  }
}

function base64DecodeUtf8(encoded) {
  try {
    const binary = atob(encoded)
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0))
    return new TextDecoder('utf-8').decode(bytes)
  } catch {
    return encoded
  }
}

function parseLyricJsonPayload(payload) {
  // Try musicu.fcg response format first
  const rawLyricFromApi = String(payload?.req_0?.data?.lyric || '').trim()
  if (rawLyricFromApi) {
    return base64DecodeUtf8(rawLyricFromApi)
  }

  // Try JSON format from c.y.qq.com
  const rawLyricFromJson = String(payload?.lyric || '').trim()
  if (rawLyricFromJson) {
    return base64DecodeUtf8(rawLyricFromJson)
  }

  return ''
}

export async function fetchQQLyrics(songMid) {
  const normalizedMid = String(songMid || '').trim()
  if (!normalizedMid) {
    throw new Error('缺少 QQ 音乐歌曲 MID')
  }

  // Try the well-known c.y.qq.com lyrics endpoint (returns JSON with base64 fields)
  try {
    const query = new URLSearchParams({
      songmid: normalizedMid,
      format: 'json',
      inCharset: 'utf-8',
      outCharset: 'utf-8'
    })
    const rawText = await requestCUrl(`/lyric/fcgi-bin/fcg_query_lyric_new.fcg?${query.toString()}`)
    const payload = JSON.parse(rawText)
    const decoded = parseLyricJsonPayload(payload)
    if (decoded) {
      return {
        rawLyric: decoded,
        lines: parseLrcText(decoded),
        hasLyric: parseLrcText(decoded).length > 0
      }
    }
  } catch {
    // fall through to musicu.fcg
  }

  // Fallback: use musicu.fcg endpoint
  try {
    const reqData = {
      req_0: {
        module: 'music.musichallSong.PlayLyricInfo',
        method: 'GetPlayLyricInfo',
        param: {
          songMID: normalizedMid,
          songID: 0
        }
      }
    }

    const params = new URLSearchParams({
      format: 'json',
      data: JSON.stringify(reqData)
    })

    const payload = await requestJson(`${QQ_MUSIC_API_BASE}/musicu.fcg?${params.toString()}`)
    const decoded = parseLyricJsonPayload(payload)
    if (decoded) {
      return {
        rawLyric: decoded,
        lines: parseLrcText(decoded),
        hasLyric: parseLrcText(decoded).length > 0
      }
    }
  } catch {
    // both methods failed
  }

  return { rawLyric: '', lines: [], hasLyric: false }
}

export async function fetchQQSongCoverMap(songMids) {
  const normalizedMids = Array.from(new Set(
    (Array.isArray(songMids) ? songMids : [])
      .map((item) => String(item || '').trim())
      .filter(Boolean)
  ))

  if (!normalizedMids.length) return {}

  // The legacy c.y.qq.com track-info endpoint now returns 404 for this request.
  // Use the current musicu.fcg song-detail endpoint instead.
  const coverMap = {}
  for (const mid of normalizedMids) {
    try {
      const requestData = {
        songinfo: {
          module: 'music.pf_song_detail_svr',
          method: 'get_song_detail_yqq',
          param: {
            song_mid: mid
          }
        }
      }
      const params = new URLSearchParams({
        format: 'json',
        data: JSON.stringify(requestData)
      })
      const payload = await requestJson(`${QQ_MUSIC_API_BASE}/musicu.fcg?${params.toString()}`)
      const data = payload?.songinfo?.data || payload?.data || payload
      const coverUrl = resolveQQCoverUrl(data?.track_info || data)
      if (coverUrl) coverMap[mid] = coverUrl
    } catch {
      // skip this track
    }
  }

  return coverMap
}

export function extractQQPlaylistId(input) {
  const raw = String(input || '').trim()
  if (!raw) return ''

  // URL format: y.qq.com/n/ryqq/playlist/xxxxx or y.qq.com/xyz/playlist/xxxxx
  const pathMatch = raw.match(/playlist\/(\d{3,})/i)
  if (pathMatch) return pathMatch[1]

  // URL with id param
  const idMatch = raw.match(/(?:^|[?&])id=(\d{3,})/i)
  if (idMatch) return idMatch[1]

  // Direct numeric ID
  return /^\d{3,}$/.test(raw) ? raw : ''
}

export function extractQQAlbumMid(input) {
  const raw = String(input || '').trim()
  if (!raw) return ''

  // URL format: y.qq.com/n/ryqq/albumDetail/xxxxx or y.qq.com/n/ryqq_v2/albumDetail/xxxxx
  const pathMatch = raw.match(/albumDetail\/([a-zA-Z0-9]+)/i)
  if (pathMatch) return pathMatch[1]

  // URL with mid param
  const midMatch = raw.match(/(?:^|[?&])mid=([a-zA-Z0-9]+)/i)
  if (midMatch) return midMatch[1]

  // Direct MID format (10+ alphanumeric)
  if (/^[a-zA-Z0-9]{10,}$/.test(raw)) return raw

  return ''
}

function detectQQCollectionTarget(input) {
  const albumMid = extractQQAlbumMid(input)
  if (albumMid) return { type: 'album', id: albumMid }

  return { type: '', id: '' }
}

export async function fetchQQPlaylistTracks() {
  throw new Error('QQ 音乐歌单导入暂不支持，请使用专辑链接')
}

export async function fetchQQAlbumTracks(input) {
  const albumMid = extractQQAlbumMid(input)
  if (!albumMid) {
    throw new Error('请输入 QQ 音乐专辑链接或专辑 MID')
  }

  const reqData = {
    req_0: {
      module: 'music.musichallAlbum.AlbumSongList',
      method: 'GetAlbumSongList',
      param: {
        albumMid,
        begin: 0,
        num: 100
      }
    }
  }

  const params = new URLSearchParams({
    format: 'json',
    data: JSON.stringify(reqData)
  })

  const payload = await requestJson(`${QQ_MUSIC_API_BASE}/musicu.fcg?${params.toString()}`)

  const songList = Array.isArray(payload?.req_0?.data?.songList)
    ? payload.req_0.data.songList
    : []

  const tracks = songList
    .map((item) => mapSongToTrack(item?.songInfo || item))
    .filter((item) => item.title)

  return {
    albumMid,
    albumName: String(payload?.req_0?.data?.albumName || '').trim(),
    tracks
  }
}

export async function fetchQQCollectionTracks(input) {
  const target = detectQQCollectionTarget(input)
  if (!target.id) {
    throw new Error('请输入 QQ 音乐歌单/专辑链接或对应 ID')
  }

  if (target.type === 'album') {
    const result = await fetchQQAlbumTracks(input)
    return {
      type: 'album',
      id: result.albumMid,
      name: result.albumName,
      tracks: result.tracks
    }
  }

  const result = await fetchQQPlaylistTracks(input)
  return {
    type: 'playlist',
    id: result.playlistId,
    name: result.playlistName,
    tracks: result.tracks
  }
}

export function buildQQSongWebUrl(songMid) {
  const normalizedMid = String(songMid || '').trim()
  return normalizedMid ? `https://y.qq.com/n/ryqq/songDetail/${normalizedMid}` : ''
}

export async function openQQSong(songMid) {
  const normalizedMid = String(songMid || '').trim()
  if (!normalizedMid) {
    throw new Error('缺少 QQ 音乐歌曲 MID')
  }

  const webUrl = buildQQSongWebUrl(normalizedMid)

  if (!Capacitor.isNativePlatform()) {
    window.open(webUrl, '_blank', 'noopener,noreferrer')
    return
  }

  if (Capacitor.getPlatform() === 'android') {
    try {
      const installed = await AppLauncher.canOpenUrl({ url: QQ_ANDROID_PACKAGE })
      if (installed?.value) {
        const appUrl = `qqmusic://song/${normalizedMid}`
        const result = await AppLauncher.openUrl({ url: appUrl })
        if (result?.completed) return
      }
    } catch {
      // fall through to web fallback
    }
  }

  window.open(webUrl, '_blank', 'noopener,noreferrer')
}

export { buildQQCoverUrl }

export function formatTrackDuration(durationMs) {
  const totalSeconds = Math.floor((Number(durationMs) || 0) / 1000)
  if (totalSeconds <= 0) return ''

  const minutes = Math.floor(totalSeconds / 60)
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  return `${minutes}:${seconds}`
}
