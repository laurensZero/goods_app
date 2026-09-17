// @ts-check
import { fetchNeteaseSongMeta } from '@/utils/music/neteaseMusic'
import { fetchQQSongMeta } from '@/utils/music/qqMusic'
import { fetchBilibiliVideoMeta } from '@/utils/music/bilibiliMusic'

/**
 * 按音源 + id 拉取试听曲目元数据。
 * AI 试听链接 app://play_music/<source>/<id> 文案可能只有歌名，
 * 播放器缺歌手时用它补全，避免显示「未知歌手」。
 * @param {'netease' | 'qq' | 'bilibili'} source
 * @param {string} id
 * @returns {Promise<{ title?: string, artist?: string, album?: string, coverUrl?: string, durationMs?: number } | null>}
 */
export async function fetchTrackMetaBySource(source, id) {
  const src = String(source || '').trim()
  const trackId = String(id || '').trim()
  if (!src || !trackId) return null
  try {
    if (src === 'netease') return await fetchNeteaseSongMeta(trackId)
    if (src === 'qq') return await fetchQQSongMeta(trackId)
    if (src === 'bilibili') return await fetchBilibiliVideoMeta(trackId)
  } catch {
    // 补全失败不影响播放本身
  }
  return null
}
