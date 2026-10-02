// @ts-check

/** @returns {string} */
function buildTrackId(index = 0) {
  return `track_${Date.now()}_${index}`
}

/**
 * @param {unknown} tracks
 * @returns {import('@/types/models').TrackItem[]}
 */
export function normalizeTracks(tracks) {
  if (!Array.isArray(tracks)) return []

  return tracks
    .map((item, index) => ({
      id: String(item?.id || buildTrackId(index)),
      title: String(item?.title || '').trim(),
      artist: String(item?.artist || '').trim(),
      album: String(item?.album || '').trim(),
      coverUrl: String(item?.coverUrl || '').trim(),
      durationMs: Math.max(0, Number(item?.durationMs) || 0),
      source: String(item?.source || (item?.neteaseSongId ? 'netease' : item?.qqSongId ? 'qq' : item?.bilibiliVideoId ? 'bilibili' : 'manual')).trim() || 'manual',
      neteaseSongId: String(item?.neteaseSongId || '').trim(),
      qqSongId: String(item?.qqSongId || '').trim(),
      bilibiliVideoId: String(item?.bilibiliVideoId || '').trim(),
      lyricSource: String(item?.lyricSource || '').trim(),
      lyricSongId: String(item?.lyricSongId || '').trim(),
      note: String(item?.note || '').trim()
    }))
    .filter((item) => item.title || item.artist || item.album || item.neteaseSongId || item.qqSongId || item.bilibiliVideoId)
}

/**
 * @param {unknown} tracks
 * @param {Record<string, string>} coverMap
 * @returns {import('@/types/models').TrackItem[]}
 */
export function mergeNeteaseTrackCovers(tracks, coverMap) {
  return normalizeTracks(tracks).map((track) => {
    if (track.coverUrl || track.source !== 'netease' || !track.neteaseSongId) return track
    const coverUrl = String(coverMap?.[track.neteaseSongId] || '').trim()
    return coverUrl ? { ...track, coverUrl } : track
  })
}

/**
 * 把音源元数据整理成曲目的「音源字段补丁」。
 * 三个音源 id 一次性写全：绑定新音源时另外两个会被清空，避免留下互相矛盾的 id。
 * @param {'netease' | 'qq' | 'bilibili' | string} source
 * @param {string} id
 * @param {{ title?: string, artist?: string, album?: string, coverUrl?: string, durationMs?: number }} [meta]
 * @returns {object | null}
 */
export function buildTrackSourcePatch(source, id, meta = {}) {
  const src = String(source || '').trim()
  const sourceId = String(id || '').trim()
  if (!src || !sourceId) return null

  return {
    source: src,
    neteaseSongId: src === 'netease' ? sourceId : '',
    qqSongId: src === 'qq' ? sourceId : '',
    bilibiliVideoId: src === 'bilibili' ? sourceId : '',
    title: String(meta?.title || '').trim(),
    artist: String(meta?.artist || '').trim(),
    // B 站没有专辑字段，沿用搜索结果里的占位值，保持展示一致
    album: String(meta?.album || (src === 'bilibili' ? 'Bilibili' : '')).trim(),
    coverUrl: String(meta?.coverUrl || '').trim(),
    durationMs: Math.max(0, Number(meta?.durationMs) || 0)
  }
}

/**
 * 把音源补丁合并进已有曲目（手动添加的曲目升级为在线音源）。
 *
 * - `source` 与三个音源 id 一律以补丁为准
 * - 标题 / 歌手 / 专辑 / 封面 / 时长只在原本为空时补全，不覆盖用户手写的内容
 *
 * @param {object} track
 * @param {object | null} patch
 * @returns {object}
 */
export function mergeTrackSourcePatch(track = {}, patch = null) {
  const merged = { ...track }
  if (!patch || !String(patch.source || '').trim()) return merged

  for (const key of ['title', 'artist', 'album', 'coverUrl']) {
    const current = String(merged[key] || '').trim()
    merged[key] = current || String(patch[key] || '').trim()
  }

  const currentDuration = Math.max(0, Number(merged.durationMs) || 0)
  merged.durationMs = currentDuration || Math.max(0, Number(patch.durationMs) || 0)

  merged.source = String(patch.source).trim()
  merged.neteaseSongId = String(patch.neteaseSongId || '').trim()
  merged.qqSongId = String(patch.qqSongId || '').trim()
  merged.bilibiliVideoId = String(patch.bilibiliVideoId || '').trim()

  return merged
}
