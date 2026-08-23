import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/utils/neteaseMusic', () => ({
  searchNeteaseSongs: vi.fn(),
  fetchNeteaseLyrics: vi.fn()
}))

vi.mock('@/utils/qqMusic', () => ({
  searchQQSongs: vi.fn(),
  fetchQQLyrics: vi.fn()
}))

import { searchNeteaseSongs, fetchNeteaseLyrics } from '@/utils/neteaseMusic'
import { searchQQSongs, fetchQQLyrics } from '@/utils/qqMusic'
import { extractCoreTitle, matchLyricsByTitle } from '@/utils/musicLyricMatch'

const makeLine = (timeMs, text) => ({ timeMs, text })

describe('extractCoreTitle', () => {
  it('prefers the guillemet title', () => {
    expect(extractCoreTitle('【4K修复】《孤勇者》官方MV')).toBe('孤勇者')
  })

  it('strips bracket blocks when no guillemet exists', () => {
    expect(extractCoreTitle('【官方MV】Never Gonna Give You Up [4K]')).toBe('Never Gonna Give You Up')
  })

  it('returns empty for blank input', () => {
    expect(extractCoreTitle('   ')).toBe('')
    expect(extractCoreTitle(undefined)).toBe('')
  })
})

describe('matchLyricsByTitle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null immediately without a usable title', async () => {
    expect(await matchLyricsByTitle({ title: '', artist: '某人' })).toBeNull()
    expect(searchNeteaseSongs).not.toHaveBeenCalled()
  })

  it('matches only when both title and artist hit, qq first', async () => {
    searchQQSongs.mockResolvedValue([
      { title: '晴天', artist: '周杰伦', durationMs: 269000, qqSongId: '0039MnYb0qxYhV' }
    ])
    fetchQQLyrics.mockResolvedValue({ lines: [makeLine(0, '故事的小黄花')] })

    const result = await matchLyricsByTitle({
      title: '【高清】周杰伦《晴天》官方MV',
      artist: '周杰伦',
      durationMs: 270000
    })

    expect(result.source).toBe('qq')
    expect(result.matchedTitle).toBe('晴天')
    expect(result.matchedDurationMs).toBe(269000)
    expect(result.lines).toEqual([makeLine(0, '故事的小黄花')])
    // 搜索词：歌名+作者，随后是纯歌名兜底
    expect(searchQQSongs).toHaveBeenNthCalledWith(1, '晴天 周杰伦', 10)
    expect(searchNeteaseSongs).not.toHaveBeenCalled()
  })

  it('rejects candidates whose artist does not match any hint', async () => {
    searchQQSongs
      .mockResolvedValueOnce([{ title: '晴天', artist: '某翻唱歌手', durationMs: 269000, qqSongId: '999' }])
      .mockResolvedValue([])
    searchNeteaseSongs.mockResolvedValue([])

    const result = await matchLyricsByTitle({
      title: '晴天 - 周杰伦',
      artist: '音乐搬运站',
      durationMs: 269000
    })

    expect(result).toBeNull()
    expect(fetchQQLyrics).not.toHaveBeenCalled()
    expect(fetchNeteaseLyrics).not.toHaveBeenCalled()
    expect(searchNeteaseSongs).toHaveBeenCalled()
  })

  it('falls back to netease when qq has no valid match or empty lyric', async () => {
    searchQQSongs
      .mockResolvedValueOnce([])
      .mockResolvedValue([])
    fetchQQLyrics.mockResolvedValue({ lines: [] })
    searchNeteaseSongs.mockResolvedValue([
      { title: '晴天', artist: '周杰伦', durationMs: 269000, neteaseSongId: '186016' }
    ])
    fetchNeteaseLyrics.mockResolvedValue({ lines: [makeLine(1000, '故事的小黄花')] })

    const result = await matchLyricsByTitle({
      title: '周杰伦 - 晴天',
      artist: '周杰伦',
      durationMs: 269000
    })

    expect(result.source).toBe('netease')
    expect(result.lines).toEqual([makeLine(1000, '故事的小黄花')])
  })

  it('prefers candidates with closer duration among valid matches', async () => {
    searchQQSongs.mockResolvedValue([])
    searchNeteaseSongs.mockResolvedValue([
      { title: '晴天', artist: '周杰伦', durationMs: 400000, neteaseSongId: '1' },
      { title: '晴天', artist: '周杰伦', durationMs: 271000, neteaseSongId: '2' }
    ])
    fetchNeteaseLyrics.mockImplementation(async (songId) => ({
      lines: [makeLine(0, `lyric of ${songId}`)]
    }))

    const result = await matchLyricsByTitle({
      title: '晴天',
      artist: '周杰伦',
      durationMs: 270000
    })

    expect(result.matchedTitle).toBe('晴天')
    expect(fetchNeteaseLyrics).toHaveBeenCalledWith('2')
  })
})
