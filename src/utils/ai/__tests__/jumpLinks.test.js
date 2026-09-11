import { describe, it, expect } from 'vitest'
import { parseMusicPreviewHref, parseJumpHref } from '../jumpLinks'

describe('jumpLinks 音乐试听协议', () => {
  it('解析 app://play_music/<source>/<id>', () => {
    expect(parseMusicPreviewHref('app://play_music/netease/30569747')).toEqual({
      source: 'netease',
      id: '30569747'
    })
    expect(parseMusicPreviewHref('app://play_music/qq/0024BJXc0zhARE')).toEqual({
      source: 'qq',
      id: '0024BJXc0zhARE'
    })
    expect(parseMusicPreviewHref('app://play_music/bilibili/BV1xx411c7mD')).toEqual({
      source: 'bilibili',
      id: 'BV1xx411c7mD'
    })
    expect(parseMusicPreviewHref('app://play_music/NETEASE/30569747')?.source).toBe('netease')
  })

  it('非法音源/缺 id/非 play_music 返回 null', () => {
    expect(parseMusicPreviewHref('app://play_music/spotify/x')).toBeNull()
    expect(parseMusicPreviewHref('app://play_music/netease/')).toBeNull()
    expect(parseMusicPreviewHref('app://play_music/netease')).toBeNull()
    expect(parseMusicPreviewHref('app://goods_detail/g1')).toBeNull()
    expect(parseMusicPreviewHref('https://example.com')).toBeNull()
  })

  it('play_music 不会被 parseJumpHref 当成路由页', () => {
    expect(parseJumpHref('app://play_music/netease/123')).toBeNull()
  })
})
