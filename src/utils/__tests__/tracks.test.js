import { describe, it, expect } from 'vitest'
import { mergeNeteaseTrackCovers, normalizeTracks } from '../tracks'

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

  it('handles multiple tracks', () => {
    const result = normalizeTracks([
      { title: 'Song A' },
      { title: 'Song B' },
      { title: 'Song C' }
    ])
    expect(result).toHaveLength(3)
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
