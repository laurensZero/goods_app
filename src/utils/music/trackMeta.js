// @ts-check
import { fetchNeteaseSongMeta } from '@/utils/music/neteaseMusic'
import { fetchQQSongMeta } from '@/utils/music/qqMusic'
import { fetchBilibiliVideoMeta } from '@/utils/music/bilibiliMusic'

/**
 * 按音源 + id 拉取试听曲目元数据。
 * AI 试听链接 app://play_music/<source>/<id> 文案可能只有歌名，
 * 播放器缺歌手时用它补全，避免显示「未知歌手」。
 * B 站传 page 时返回该分P的时长，并带回 pages 明细。
 * @param {'netease' | 'qq' | 'bilibili'} source
 * @param {string} id
 * @param {{ page?: number }} [options]
 * @returns {Promise<{ title?: string, artist?: string, album?: string, coverUrl?: string, durationMs?: number, pages?: Array<{ page: number, part: string, durationMs: number }> } | null>}
 */
export async function fetchTrackMetaBySource(source, id, options = {}) {
  const src = String(source || '').trim()
  const trackId = String(id || '').trim()
  if (!src || !trackId) return null
  try {
    if (src === 'netease') return await fetchNeteaseSongMeta(trackId)
    if (src === 'qq') return await fetchQQSongMeta(trackId)
    if (src === 'bilibili') return await fetchBilibiliVideoMeta(trackId, Math.max(0, Math.floor(Number(options?.page) || 0)))
  } catch {
    // 补全失败不影响播放本身
  }
  return null
}
