import { Capacitor, CapacitorHttp } from '@capacitor/core'

const NETEASE_WEB_BASE = 'https://music.163.com'
const NETEASE_REFERER = `${NETEASE_WEB_BASE}/`
const WEB_PROXY_PREFIX = '/netease-api'
const NETEASE_COVER_SIZE = 720
const REQUEST_HEADERS = {
  Referer: NETEASE_REFERER
}

function buildTrackId() {
  return `track_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function normalizeArtists(list) {
  const artists = Array.isArray(list) ? list : []
  return artists
    .map((item) => String(item?.name || '').trim())
    .filter(Boolean)
    .join(' / ')
}

function normalizeAlbum(album) {
  return String(album?.name || '').trim()
}

function buildNeteaseCoverUrl(url, size = NETEASE_COVER_SIZE) {
  const normalizedUrl = String(url || '').trim()
  if (!normalizedUrl) return ''

  const baseUrl = normalizedUrl.replace(/\?.*$/, '')
  const normalizedSize = Math.max(128, Number(size) || NETEASE_COVER_SIZE)
  return `${baseUrl}?param=${normalizedSize}y${normalizedSize}`
}

function normalizeCoverUrl(song = {}) {
  return buildNeteaseCoverUrl(song?.album?.picUrl || song?.al?.picUrl || '')
}

function normalizeDuration(durationMs) {
  const value = Number(durationMs)
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0
}

function mapSongToTrack(song = {}) {
  const songId = String(song?.id || '').trim()
  return {
    id: buildTrackId(),
    title: String(song?.name || '').trim(),
    artist: normalizeArtists(song.artists || song.ar),
    album: normalizeAlbum(song.album || song.al),
    coverUrl: normalizeCoverUrl(song),
    durationMs: normalizeDuration(song.duration ?? song.dt),
    source: songId ? 'netease' : 'manual',
    neteaseSongId: songId
  }
}

async function requestJson(path) {
  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.get({
      url: `${NETEASE_WEB_BASE}${path}`,
      headers: REQUEST_HEADERS
    })
    return typeof response.data === 'string' ? JSON.parse(response.data) : response.data
  }

  const response = await fetch(`${WEB_PROXY_PREFIX}${path}`, {
    headers: {}
  })
  if (!response.ok) {
    throw new Error(`请求失败（${response.status}）`)
  }
  return response.json()
}

function ensureSongList(payload) {
  const songs = Array.isArray(payload?.result?.songs)
    ? payload.result.songs
    : Array.isArray(payload?.songs)
      ? payload.songs
      : []

  return songs.map(mapSongToTrack).filter((item) => item.title)
}

function chunkArray(list, size) {
  const normalized = Array.isArray(list) ? list : []
  const chunkSize = Math.max(1, Number(size) || 1)
  const chunks = []

  for (let index = 0; index < normalized.length; index += chunkSize) {
    chunks.push(normalized.slice(index, index + chunkSize))
  }

  return chunks
}

async function fetchNeteaseSongDetails(songIds) {
  const normalizedIds = Array.from(new Set((Array.isArray(songIds) ? songIds : []).map((item) => String(item || '').trim()).filter(Boolean)))
  if (!normalizedIds.length) return []

  const songs = []
  const chunks = chunkArray(normalizedIds, 200)

  for (const chunk of chunks) {
    const payload = await requestJson(`/api/song/detail/?ids=[${chunk.join(',')}]`)
    if (Number(payload?.code) !== 200) {
      throw new Error(payload?.message || '网易云歌曲详情读取失败')
    }
    songs.push(...(Array.isArray(payload?.songs) ? payload.songs : []))
  }

  return songs
}

export async function fetchNeteaseSongCoverMap(songIds) {
  const songs = await fetchNeteaseSongDetails(songIds)
  return songs.reduce((result, song) => {
    const songId = String(song?.id || '').trim()
    const coverUrl = normalizeCoverUrl(song)
    if (songId && coverUrl) {
      result[songId] = coverUrl
    }
    return result
  }, {})
}

export async function searchNeteaseSongs(keyword, limit = 30) {
  const trimmed = String(keyword || '').trim()
  if (!trimmed) return []

  const query = new URLSearchParams({
    csrf_token: '',
    s: trimmed,
    type: '1',
    offset: '0',
    total: 'true',
    limit: String(Math.max(1, Math.min(100, Number(limit) || 30)))
  })
  const payload = await requestJson(`/api/search/get/web?${query.toString()}`)
  if (Number(payload?.code) !== 200) {
    throw new Error(payload?.message || '网易云搜索失败')
  }
  return ensureSongList(payload)
}

export function extractNeteasePlaylistId(input) {
  const raw = String(input || '').trim()
  if (!raw) return ''

  const directMatch = raw.match(/(?:^|[?&])id=(\d{3,})/i)
  if (directMatch) return directMatch[1]

  const pathMatch = raw.match(/playlist\/(\d{3,})/i)
  if (pathMatch) return pathMatch[1]

  return /^\d{3,}$/.test(raw) ? raw : ''
}

export async function fetchNeteasePlaylistTracks(input) {
  const playlistId = extractNeteasePlaylistId(input)
  if (!playlistId) {
    throw new Error('请输入网易云歌单链接或歌单 ID')
  }

  const payload = await requestJson(`/api/v6/playlist/detail?id=${encodeURIComponent(playlistId)}`)
  if (Number(payload?.code) !== 200) {
    throw new Error(payload?.message || '网易云歌单读取失败')
  }

  const playlist = payload?.playlist || {}
  let sourceSongs = Array.isArray(playlist.tracks) ? playlist.tracks : []

  const fullTrackIds = Array.isArray(playlist.trackIds)
    ? playlist.trackIds.map((item) => String(item?.id || '').trim()).filter(Boolean)
    : []

  if (fullTrackIds.length > sourceSongs.length) {
    sourceSongs = await fetchNeteaseSongDetails(fullTrackIds)
  }

  const tracks = sourceSongs.map(mapSongToTrack).filter((item) => item.title)

  return {
    playlistId,
    playlistName: String(playlist.name || '').trim(),
    tracks
  }
}

export function formatTrackDuration(durationMs) {
  const totalSeconds = Math.floor((Number(durationMs) || 0) / 1000)
  if (totalSeconds <= 0) return ''

  const minutes = Math.floor(totalSeconds / 60)
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  return `${minutes}:${seconds}`
}

export async function fetchNeteasePlayableUrl(songId) {
  const normalizedId = String(songId || '').trim()
  if (!normalizedId) {
    throw new Error('缺少网易云歌曲 ID')
  }

  const query = new URLSearchParams({
    ids: `[${normalizedId}]`,
    level: 'standard',
    encodeType: 'mp3'
  })
  const payload = await requestJson(`/api/song/enhance/player/url/v1?${query.toString()}`)
  if (Number(payload?.code) !== 200) {
    throw new Error(payload?.message || '网易云音频地址读取失败')
  }

  const item = Array.isArray(payload?.data) ? payload.data[0] : null
  const url = String(item?.url || '').trim()
  if (!url) {
    const fee = Number(item?.fee) || 0
    const code = Number(item?.code) || 0
    const message = String(item?.message || '').trim()

    if (fee > 0 || code === 403 || code === -110) {
      throw new Error('这首歌需要网易云 VIP，暂不支持内嵌播放')
    }

    if (message.includes('版权') || code === 404) {
      throw new Error('这首歌当前没有可用版权，暂不支持内嵌播放')
    }

    throw new Error('这首歌当前不支持内嵌播放')
  }

  return {
    url,
    fee: Number(item?.fee) || 0,
    code: Number(item?.code) || 0
  }
}

export function buildNeteaseSongWebUrl(songId) {
  const normalizedId = String(songId || '').trim()
  return normalizedId ? `${NETEASE_WEB_BASE}/song?id=${normalizedId}` : ''
}

export async function openNeteaseSong(songId) {
  const normalizedId = String(songId || '').trim()
  if (!normalizedId) {
    throw new Error('缺少网易云歌曲 ID')
  }

  const appUrl = `orpheus://song/${normalizedId}`
  const webUrl = buildNeteaseSongWebUrl(normalizedId)

  if (!Capacitor.isNativePlatform()) {
    window.open(webUrl, '_blank', 'noopener,noreferrer')
    return
  }

  let handled = false
  const cancelFallback = () => {
    handled = true
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  }
  const handleVisibilityChange = () => {
    if (document.hidden) cancelFallback()
  }

  document.addEventListener('visibilitychange', handleVisibilityChange, { passive: true })
  window.location.href = appUrl

  window.setTimeout(() => {
    if (!handled) {
      cancelFallback()
      window.open(webUrl, '_blank', 'noopener,noreferrer')
    }
  }, 900)
}
