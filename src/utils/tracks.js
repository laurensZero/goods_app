function buildTrackId(index = 0) {
  return `track_${Date.now()}_${index}`
}

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
      source: String(item?.source || (item?.neteaseSongId ? 'netease' : 'manual')).trim() || 'manual',
      neteaseSongId: String(item?.neteaseSongId || '').trim()
    }))
    .filter((item) => item.title || item.artist || item.album || item.neteaseSongId)
}
