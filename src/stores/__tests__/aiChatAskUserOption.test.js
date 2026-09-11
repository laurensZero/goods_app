import { describe, it, expect } from 'vitest'
import { normalizeAskUserOption } from '../aiChat'

describe('normalizeAskUserOption', () => {
  it('字符串选项只保留 label', () => {
    expect(normalizeAskUserOption('  离去之原  ')).toEqual({ label: '离去之原' })
    expect(normalizeAskUserOption('')).toBeNull()
  })

  it('标准字段直接透传', () => {
    const option = normalizeAskUserOption({
      label: '离去之原 · Hanser · 网易云',
      title: '离去之原',
      artist: 'Hanser',
      source: 'netease',
      neteaseSongId: '30569747',
      coverUrl: 'https://p1.music.net/a.jpg',
      durationMs: 267000
    })
    expect(option).toMatchObject({
      label: '离去之原 · Hanser · 网易云',
      title: '离去之原',
      artist: 'Hanser',
      source: 'netease',
      neteaseSongId: '30569747'
    })
  })

  it('songId 按 source 归到标准字段', () => {
    expect(normalizeAskUserOption({
      label: 'x',
      source: 'netease',
      songId: '123'
    })).toMatchObject({ source: 'netease', neteaseSongId: '123' })

    expect(normalizeAskUserOption({
      label: 'x',
      source: 'qq',
      songId: '001abc'
    })).toMatchObject({ source: 'qq', qqSongId: '001abc' })

    expect(normalizeAskUserOption({
      label: 'x',
      source: 'bilibili',
      songId: 'BV1xx'
    })).toMatchObject({ source: 'bilibili', bilibiliVideoId: 'BV1xx' })
  })

  it('无 source 时按 id 形态推断', () => {
    expect(normalizeAskUserOption({ label: 'x', id: '30569747' }))
      .toMatchObject({ source: 'netease', neteaseSongId: '30569747' })
    expect(normalizeAskUserOption({ label: 'x', bvid: 'BV1yy411c7mD' }))
      .toMatchObject({ source: 'bilibili', bilibiliVideoId: 'BV1yy411c7mD' })
  })

  it('source 与 id 冲突时清空错误音源 id', () => {
    const option = normalizeAskUserOption({
      label: 'x',
      source: '网易云',
      neteaseSongId: '1',
      qqSongId: '2',
      bilibiliVideoId: 'BV1'
    })
    expect(option).toMatchObject({ source: 'netease', neteaseSongId: '1' })
    expect(option?.qqSongId).toBeUndefined()
    expect(option?.bilibiliVideoId).toBeUndefined()
  })
})
