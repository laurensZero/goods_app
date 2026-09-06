import { describe, it, expect, vi, beforeEach } from 'vitest'

const { fetchNetease, fetchQQ, matchTitle } = vi.hoisted(() => ({
  fetchNetease: vi.fn(),
  fetchQQ: vi.fn(),
  matchTitle: vi.fn()
}))

vi.mock('@/utils/neteaseMusic', () => ({ fetchNeteaseLyrics: fetchNetease }))
vi.mock('@/utils/qqMusic', () => ({ fetchQQLyrics: fetchQQ }))
vi.mock('@/utils/musicLyricMatch', () => ({ matchLyricsByTitle: matchTitle }))

import { fetchTrackLyrics } from '../trackLyrics'

const LINES = [{ timeMs: 1000, text: '词' }]

beforeEach(() => {
  fetchNetease.mockReset()
  fetchQQ.mockReset()
  matchTitle.mockReset()
})

describe('fetchTrackLyrics 音源选择', () => {
  it('QQ 源曲目优先 QQ 直连，网易云 ID 走网易云', async () => {
    fetchQQ.mockResolvedValue({ lines: LINES })
    expect(await fetchTrackLyrics({ source: 'qq', qqSongId: 'q1', neteaseSongId: 'n1' }))
      .toEqual({ lines: LINES, source: 'qq', matched: false })
    expect(fetchQQ).toHaveBeenCalledWith('q1')
    expect(fetchNetease).not.toHaveBeenCalled()

    fetchNetease.mockResolvedValue({ lines: LINES })
    expect(await fetchTrackLyrics({ source: 'netease', neteaseSongId: 'n1' }))
      .toEqual({ lines: LINES, source: 'netease', matched: false })
    expect(fetchQQ).toHaveBeenCalledTimes(1)
  })

  it('播放源缺失时回退到写回的歌词 ID（matched=true）', async () => {
    fetchNetease.mockResolvedValue({ lines: LINES })
    const result = await fetchTrackLyrics({ source: 'manual', lyricSource: 'netease', lyricSongId: 'n2' })
    expect(result).toEqual({ lines: LINES, source: 'netease', matched: true })
    expect(fetchNetease).toHaveBeenCalledWith('n2')

    fetchQQ.mockResolvedValue({ lines: LINES })
    expect(await fetchTrackLyrics({ source: 'manual', lyricSource: 'qq', lyricSongId: 'q2' }))
      .toEqual({ lines: LINES, source: 'qq', matched: true })
  })

  it('B 站曲目按标题跨源匹配', async () => {
    matchTitle.mockResolvedValue({ lines: LINES, source: 'qq', songId: 'q9' })
    const result = await fetchTrackLyrics({
      source: 'bilibili', bilibiliVideoId: 'bv1', title: '歌名', artist: '歌手', durationMs: 30000
    })
    expect(result).toEqual({ lines: LINES, source: 'qq', matched: true })
    expect(matchTitle).toHaveBeenCalledWith({ title: '歌名', artist: '歌手', durationMs: 30000 })
  })

  it('无任何音源返回 null；B 站匹配失败返回空行', async () => {
    expect(await fetchTrackLyrics({ source: 'manual', title: 'x' })).toBeNull()
    expect(fetchNetease).not.toHaveBeenCalled()
    expect(fetchQQ).not.toHaveBeenCalled()
    expect(matchTitle).not.toHaveBeenCalled()

    matchTitle.mockResolvedValue(null)
    const result = await fetchTrackLyrics({ source: 'bilibili', bilibiliVideoId: 'bv1', title: 'x' })
    expect(result).toEqual({ lines: [], source: 'bilibili', matched: false })
  })
})
