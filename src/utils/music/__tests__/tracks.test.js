import { describe, it, expect } from 'vitest'
import { buildTrackSourcePatch, mergeNeteaseTrackCovers, mergeTrackSourcePatch, normalizeTracks } from '../tracks'

describe('normalizeTracks', () => {
  it('returns [] for null', () => {
    expect(normalizeTracks(null)).toEqual([])
  })

  it('returns [] for undefined', () => {
    expect(normalizeTracks(undefined)).toEqual([])
  })

  it('returns [] for non-array', () => {
    expect(normalizeTracks('not an array')).toEqual([])
  })

  it('returns [] for empty array', () => {
    expect(normalizeTracks([])).toEqual([])
  })

  it('normalizes a valid track', () => {
    const result = normalizeTracks([{ title: 'Song', artist: 'Artist', album: 'Album' }])
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Song')
    expect(result[0].artist).toBe('Artist')
    expect(result[0].album).toBe('Album')
  })

  it('assigns id when missing', () => {
    const result = normalizeTracks([{ title: 'Song' }])
    expect(result[0].id).toBeTruthy()
    expect(typeof result[0].id).toBe('string')
  })

  it('preserves existing id', () => {
    const result = normalizeTracks([{ id: 'my-id', title: 'Song' }])
    expect(result[0].id).toBe('my-id')
  })

  it('trims string fields', () => {
    const result = normalizeTracks([{ title: '  Song  ', artist: '  Artist  ' }])
    expect(result[0].title).toBe('Song')
    expect(result[0].artist).toBe('Artist')
  })

  it('defaults durationMs to 0 for invalid values', () => {
    const result = normalizeTracks([{ title: 'Song', durationMs: 'abc' }])
    expect(result[0].durationMs).toBe(0)
  })

  it('clamps negative durationMs to 0', () => {
    const result = normalizeTracks([{ title: 'Song', durationMs: -100 }])
    expect(result[0].durationMs).toBe(0)
  })

  it('preserves valid durationMs', () => {
    const result = normalizeTracks([{ title: 'Song', durationMs: 300000 }])
    expect(result[0].durationMs).toBe(300000)
  })

  it('defaults source to manual', () => {
    const result = normalizeTracks([{ title: 'Song' }])
    expect(result[0].source).toBe('manual')
  })

  it('detects netease source from neteaseSongId', () => {
    const result = normalizeTracks([{ title: 'Song', neteaseSongId: '123' }])
    expect(result[0].source).toBe('netease')
  })

  it('detects qq source from qqSongId', () => {
    const result = normalizeTracks([{ title: 'Song', qqSongId: 'abc123' }])
    expect(result[0].source).toBe('qq')
    expect(result[0].qqSongId).toBe('abc123')
  })

  it('defaults qqSongId to empty string', () => {
    const result = normalizeTracks([{ title: 'Song' }])
    expect(result[0].qqSongId).toBe('')
  })

  it('filters out tracks with no title, artist, album, neteaseSongId, or qqSongId', () => {
    const result = normalizeTracks([{ durationMs: 100 }])
    expect(result).toEqual([])
  })

  it('keeps tracks with neteaseSongId but no title', () => {
    const result = normalizeTracks([{ neteaseSongId: '123' }])
    expect(result).toHaveLength(1)
  })

  it('keeps tracks with qqSongId but no title', () => {
    const result = normalizeTracks([{ qqSongId: 'abc' }])
    expect(result).toHaveLength(1)
  })

  it('preserves note and trims whitespace', () => {
    const result = normalizeTracks([{ title: 'Song', note: '  encore!  ' }])
    expect(result[0].note).toBe('encore!')
  })

  it('defaults note to empty string', () => {
    const result = normalizeTracks([{ title: 'Song' }])
    expect(result[0].note).toBe('')
  })

  it('handles multiple tracks', () => {
    const result = normalizeTracks([
      { title: 'Song A' },
      { title: 'Song B' },
      { title: 'Song C' }
    ])
    expect(result).toHaveLength(3)
  })
})

describe('buildTrackSourcePatch', () => {
  it('写全三个音源 id，未命中的清空', () => {
    expect(buildTrackSourcePatch('bilibili', 'BV1xx411c7mD', {
      title: 'Never Gonna Give You Up',
      artist: '索尼音乐中国',
      coverUrl: 'https://i0.hdslb.com/bfs/archive/x.jpg',
      durationMs: 213000
    })).toEqual({
      source: 'bilibili',
      neteaseSongId: '',
      qqSongId: '',
      bilibiliVideoId: 'BV1xx411c7mD',
      title: 'Never Gonna Give You Up',
      artist: '索尼音乐中国',
      album: 'Bilibili',
      coverUrl: 'https://i0.hdslb.com/bfs/archive/x.jpg',
      durationMs: 213000
    })
  })

  it('缺少 source 或 id 时返回 null', () => {
    expect(buildTrackSourcePatch('', 'BV1xx411c7mD')).toBeNull()
    expect(buildTrackSourcePatch('netease', '')).toBeNull()
  })
})

describe('mergeTrackSourcePatch', () => {
  const manualTrack = () => ({
    id: 'manual_1',
    title: '',
    artist: '',
    album: '',
    coverUrl: '',
    durationMs: 0,
    source: 'manual',
    neteaseSongId: '',
    qqSongId: '',
    bilibiliVideoId: '',
    note: '安可曲'
  })

  it('手动曲目升级为在线音源时补全空字段', () => {
    const merged = mergeTrackSourcePatch(manualTrack(), buildTrackSourcePatch('netease', '186016', {
      title: '晴天',
      artist: '周杰伦',
      album: '叶惠美',
      coverUrl: 'https://p1.music.126.net/x.jpg',
      durationMs: 269000
    }))

    expect(merged).toMatchObject({
      id: 'manual_1',
      source: 'netease',
      neteaseSongId: '186016',
      qqSongId: '',
      bilibiliVideoId: '',
      title: '晴天',
      artist: '周杰伦',
      album: '叶惠美',
      coverUrl: 'https://p1.music.126.net/x.jpg',
      durationMs: 269000,
      note: '安可曲'
    })
  })

  it('不覆盖用户手写的曲名 / 专辑 / 时长，只补空位', () => {
    const merged = mergeTrackSourcePatch({
      ...manualTrack(),
      title: '我自己写的名字',
      album: '现场',
      durationMs: 1000
    }, buildTrackSourcePatch('qq', '0039MnYb0qxYhV', {
      title: '接口返回的曲名',
      artist: '接口返回的歌手',
      album: '接口返回的专辑',
      coverUrl: 'https://y.gtimg.cn/x.jpg',
      durationMs: 200000
    }))

    expect(merged.title).toBe('我自己写的名字')
    expect(merged.album).toBe('现场')
    expect(merged.durationMs).toBe(1000)
    expect(merged.artist).toBe('接口返回的歌手')
    expect(merged.coverUrl).toBe('https://y.gtimg.cn/x.jpg')
    expect(merged.qqSongId).toBe('0039MnYb0qxYhV')
  })

  it('换绑音源时清掉旧音源 id', () => {
    const merged = mergeTrackSourcePatch({
      source: 'netease',
      neteaseSongId: '186016',
      title: '晴天'
    }, buildTrackSourcePatch('bilibili', 'BV1xx411c7mD', { title: '晴天 MV' }))

    expect(merged.source).toBe('bilibili')
    expect(merged.bilibiliVideoId).toBe('BV1xx411c7mD')
    expect(merged.neteaseSongId).toBe('')
    expect(merged.title).toBe('晴天')
  })

  it('补丁为空时原样返回', () => {
    const track = { title: 'x', source: 'manual' }
    expect(mergeTrackSourcePatch(track, null)).toEqual(track)
    expect(mergeTrackSourcePatch(track, {})).toEqual(track)
  })
})

describe('mergeNeteaseTrackCovers', () => {
  it('fills missing Netease covers without replacing existing covers', () => {
    const result = mergeNeteaseTrackCovers([
      { id: 'netease-1', title: 'Song A', source: 'netease', neteaseSongId: '541750547' },
      { id: 'netease-2', title: 'Song B', source: 'netease', neteaseSongId: '1982798730', coverUrl: 'https://existing.example/cover.jpg' },
      { id: 'qq-1', title: 'Song C', source: 'qq', qqSongId: 'qq-song' }
    ], {
      '541750547': 'https://netease.example/song-a.jpg',
      '1982798730': 'https://netease.example/song-b.jpg',
      'qq-song': 'https://qq.example/song-c.jpg'
    })

    expect(result[0].coverUrl).toBe('https://netease.example/song-a.jpg')
    expect(result[1].coverUrl).toBe('https://existing.example/cover.jpg')
    expect(result[2].coverUrl).toBe('')
  })
})
