import { describe, it, expect, vi, beforeEach } from 'vitest'

const fetchNeteaseSongMeta = vi.fn()
const fetchQQSongMeta = vi.fn()
const fetchBilibiliVideoMeta = vi.fn()

vi.mock('@/utils/music/neteaseMusic', () => ({
  fetchNeteaseSongMeta: (...args) => fetchNeteaseSongMeta(...args)
}))
vi.mock('@/utils/music/qqMusic', () => ({
  fetchQQSongMeta: (...args) => fetchQQSongMeta(...args)
}))
vi.mock('@/utils/music/bilibiliMusic', () => ({
  fetchBilibiliVideoMeta: (...args) => fetchBilibiliVideoMeta(...args)
}))

import { fetchTrackMetaBySource } from '@/utils/music/trackMeta'

describe('fetchTrackMetaBySource', () => {
  beforeEach(() => {
    fetchNeteaseSongMeta.mockReset()
    fetchQQSongMeta.mockReset()
    fetchBilibiliVideoMeta.mockReset()
  })

  it('按 source 路由到对应音源接口', async () => {
    fetchNeteaseSongMeta.mockResolvedValue({ title: 'Melt', artist: '宫野真守' })
    fetchQQSongMeta.mockResolvedValue({ title: '晴天', artist: '周杰伦' })
    fetchBilibiliVideoMeta.mockResolvedValue({ title: '翻唱', artist: 'UP主' })

    await expect(fetchTrackMetaBySource('netease', '123')).resolves.toMatchObject({ artist: '宫野真守' })
    await expect(fetchTrackMetaBySource('qq', '003')).resolves.toMatchObject({ artist: '周杰伦' })
    await expect(fetchTrackMetaBySource('bilibili', 'BV1')).resolves.toMatchObject({ artist: 'UP主' })
  })

  it('source/id 为空时返回 null 且不发请求', async () => {
    await expect(fetchTrackMetaBySource('', '1')).resolves.toBeNull()
    await expect(fetchTrackMetaBySource('netease', '')).resolves.toBeNull()
    expect(fetchNeteaseSongMeta).not.toHaveBeenCalled()
  })

  it('补拉失败时返回 null，不影响播放', async () => {
    fetchQQSongMeta.mockRejectedValue(new Error('网络错误'))
    await expect(fetchTrackMetaBySource('qq', 'mid')).resolves.toBeNull()
  })
})
