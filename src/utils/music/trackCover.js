// @ts-check
import { fetchBilibiliCoverMap } from '@/utils/music/bilibiliMusic'
import { fetchNeteaseSongCoverMap } from '@/utils/music/neteaseMusic'
import { fetchQQSongCoverMap } from '@/utils/music/qqMusic'

/**
 * 曲目封面的缓存 key（按音源 + 音源 id）。
 * 三种音源都没有 id（纯手写曲目）时返回空串。
 * @param {{ neteaseSongId?: string, qqSongId?: string, bilibiliVideoId?: string }} track
 * @returns {string}
 */
export function buildTrackCoverCacheKey(track = {}) {
  const neteaseSongId = String(track?.neteaseSongId || '').trim()
  if (neteaseSongId) return `netease:${neteaseSongId}`
  const qqSongId = String(track?.qqSongId || '').trim()
  if (qqSongId) return `qq:${qqSongId}`
  const bilibiliVideoId = String(track?.bilibiliVideoId || '').trim()
  if (bilibiliVideoId) return `bilibili:${bilibiliVideoId}`
  return ''
}

/**
 * 按曲目所属音源补拉封面。
 *
 * 事件等入口存的曲目不带封面（封面原本只是列表 UI 懒加载的），播放时要补齐供浮窗 /
 * 通知栏 / 锁屏显示。三种音源都要覆盖：早期实现只认网易云与 QQ，B 站曲目的封面
 * 因此一直是空的。
 *
 * @param {{ neteaseSongId?: string, qqSongId?: string, bilibiliVideoId?: string }} track
 * @returns {Promise<string>} 封面 URL；取不到（无 id / 音源没有封面 / 请求失败）返回 ''
 */
export async function fetchTrackCoverUrl(track = {}) {
  const neteaseSongId = String(track?.neteaseSongId || '').trim()
  const qqSongId = String(track?.qqSongId || '').trim()
  const bilibiliVideoId = String(track?.bilibiliVideoId || '').trim()

  try {
    if (neteaseSongId) {
      const map = await fetchNeteaseSongCoverMap([neteaseSongId])
      return String(map?.[neteaseSongId] || '').trim()
    }
    if (qqSongId) {
      const map = await fetchQQSongCoverMap([qqSongId])
      return String(map?.[qqSongId] || '').trim()
    }
    if (bilibiliVideoId) {
      const map = await fetchBilibiliCoverMap([bilibiliVideoId])
      return String(map?.[bilibiliVideoId] || '').trim()
    }
  } catch {
    // 取封面失败不影响播放本身
  }
  return ''
}
