// @ts-check
/**
 * 曲目歌词拉取（无状态，供 MCP music_lyrics 等非播放器场景使用）。
 *
 * 音源选择优先级与 mediaPlayer.resolveLyrics 保持一致：
 * QQ 源曲目直连 → 网易云 → QQ 兜底 → 已匹配写回的歌词 ID → B 站曲目按标题跨源匹配。
 * 播放器场景请继续用 mediaPlayer（带缓存与写回），这里不做缓存。
 */

import { fetchNeteaseLyrics } from '@/utils/neteaseMusic'
import { fetchQQLyrics } from '@/utils/qqMusic'
import { matchLyricsByTitle } from '@/utils/musicLyricMatch'

/**
 * @typedef {Object} TrackLyricsResult
 * @property {Array<{ timeMs: number, text: string }>} lines
 * @property {string} source 实际取到歌词的平台：netease / qq / bilibili
 * @property {boolean} matched 是否为标题跨源匹配命中（B 站曲目）
 */

/**
 * 按曲目拉取歌词；没有任何可用音源时返回 null。
 * @param {any} track
 * @returns {Promise<TrackLyricsResult | null>}
 */
export async function fetchTrackLyrics(track) {
  const source = String(track?.source || '').trim()
  const qqSongId = String(track?.qqSongId || '').trim()
  const bilibiliVideoId = String(track?.bilibiliVideoId || '').trim()
  const neteaseSongId = String(track?.neteaseSongId || '').trim()
  const lyricSource = String(track?.lyricSource || '').trim()
  const lyricSongId = String(track?.lyricSongId || '').trim()

  if (source === 'qq' && qqSongId) {
    return { lines: (await fetchQQLyrics(qqSongId)).lines, source: 'qq', matched: false }
  }
  if (neteaseSongId) {
    return { lines: (await fetchNeteaseLyrics(neteaseSongId)).lines, source: 'netease', matched: false }
  }
  if (qqSongId) {
    return { lines: (await fetchQQLyrics(qqSongId)).lines, source: 'qq', matched: false }
  }
  if (lyricSource === 'qq' && lyricSongId) {
    return { lines: (await fetchQQLyrics(lyricSongId)).lines, source: 'qq', matched: true }
  }
  if (lyricSource === 'netease' && lyricSongId) {
    return { lines: (await fetchNeteaseLyrics(lyricSongId)).lines, source: 'netease', matched: true }
  }
  if (bilibiliVideoId) {
    const result = await matchLyricsByTitle({
      title: track?.title,
      artist: track?.artist,
      durationMs: Number(track?.durationMs) || 0
    })
    return {
      lines: result?.lines || [],
      source: String(result?.source || 'bilibili'),
      matched: Boolean(result)
    }
  }
  return null
}
