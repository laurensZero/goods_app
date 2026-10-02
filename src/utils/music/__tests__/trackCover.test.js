import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/utils/music/neteaseMusic', () => ({
  fetchNeteaseSongCoverMap: vi.fn()
}))

vi.mock('@/utils/music/qqMusic', () => ({
  fetchQQSongCoverMap: vi.fn()
}))

vi.mock('@/utils/music/bilibiliMusic', () => ({
  fetchBilibiliCoverMap: vi.fn()
}))

import { fetchBilibiliCoverMap } from '@/utils/music/bilibiliMusic'
import { fetchNeteaseSongCoverMap } from '@/utils/music/neteaseMusic'
import { fetchQQSongCoverMap } from '@/utils/music/qqMusic'
import { buildTrackCoverCacheKey, fetchTrackCoverUrl } from '@/utils/music/trackCover'

describe('buildTrackCoverCacheKey', () => {
  it('按音源生成 key，优先级为网易云 → QQ → B站', () => {
    expect(buildTrackCoverCacheKey({ neteaseSongId: '186016' })).toBe('netease:186016')
    expect(buildTrackCoverCacheKey({ qqSongId: '0039MnYb0qxYhV' })).toBe('qq:0039MnYb0qxYhV')
    expect(buildTrackCoverCacheKey({ bilibiliVideoId: 'BV1xx411c7mD' })).toBe('bilibili:BV1xx411c7mD')
    expect(buildTrackCoverCacheKey({ neteaseSongId: '186016', bilibiliVideoId: 'BV1xx411c7mD' })).toBe('netease:186016')
  })

  it('纯手写曲目没有音源 id，返回空串（不发起请求）', () => {
    expect(buildTrackCoverCacheKey({})).toBe('')
    expect(buildTrackCoverCacheKey({ source: 'manual', title: '手写曲目' })).toBe('')
  })
})

describe('fetchTrackCoverUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('B 站曲目按 BV 号补封面', async () => {
    fetchBilibiliCoverMap.mockResolvedValue({ BV1xx411c7mD: 'https://i0.hdslb.com/bfs/archive/x.jpg' })

    await expect(fetchTrackCoverUrl({ bilibiliVideoId: 'BV1xx411c7mD' }))
      .resolves.toBe('https://i0.hdslb.com/bfs/archive/x.jpg')
    expect(fetchBilibiliCoverMap).toHaveBeenCalledWith(['BV1xx411c7mD'])
    expect(fetchNeteaseSongCoverMap).not.toHaveBeenCalled()
    expect(fetchQQSongCoverMap).not.toHaveBeenCalled()
  })

  it('网易云 / QQ 各走自己的封面接口', async () => {
    fetchNeteaseSongCoverMap.mockResolvedValue({ 186016: 'https://p1.music.126.net/x.jpg' })
    await expect(fetchTrackCoverUrl({ neteaseSongId: '186016' }))
      .resolves.toBe('https://p1.music.126.net/x.jpg')

    fetchQQSongCoverMap.mockResolvedValue({ '0039MnYb0qxYhV': 'https://y.gtimg.cn/x.jpg' })
    await expect(fetchTrackCoverUrl({ qqSongId: '0039MnYb0qxYhV' }))
      .resolves.toBe('https://y.gtimg.cn/x.jpg')
  })

  it('没有 id / 音源查不到封面 / 请求失败都返回空串而不是抛错', async () => {
    await expect(fetchTrackCoverUrl({})).resolves.toBe('')
    await expect(fetchTrackCoverUrl({ source: 'manual' })).resolves.toBe('')

    fetchBilibiliCoverMap.mockResolvedValue({})
    await expect(fetchTrackCoverUrl({ bilibiliVideoId: 'BV1xx411c7mD' })).resolves.toBe('')

    fetchBilibiliCoverMap.mockRejectedValue(new Error('network down'))
    await expect(fetchTrackCoverUrl({ bilibiliVideoId: 'BV1xx411c7mD' })).resolves.toBe('')
  })
})
