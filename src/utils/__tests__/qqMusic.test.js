import { describe, expect, it } from 'vitest'
import { resolveQQCoverUrl } from '@/utils/qqMusic'

describe('QQ Music cover resolution', () => {
  it('uses a song-level cover when the song has no album', () => {
    const coverUrl = 'https://y.gtimg.cn/music/photo_new/T002R800x800M000song-cover.jpg'

    expect(resolveQQCoverUrl({ cover: coverUrl, album: {} })).toBe(coverUrl)
  })

  it('supports song detail payloads with a direct picture field', () => {
    const coverUrl = 'https://example.com/song-cover.jpg'

    expect(resolveQQCoverUrl({
      track_info: {
        picUrl: coverUrl,
        album: {}
      }
    })).toBe(coverUrl)
  })

  it('uses the T062 song cover MID from track_info.vs for songs without albums', () => {
    expect(resolveQQCoverUrl({
      name: '我的猫狂奔了一整夜',
      album: { mid: '' },
      vs: ['', '003JfB6d0ZJQXE']
    })).toBe(
      'https://y.qq.com/music/photo_new/T062R300x300M000003JfB6d0ZJQXE.jpg?max_age=2592000'
    )
  })

  it('falls back to the album MID when no direct cover is present', () => {
    expect(resolveQQCoverUrl({ album: { mid: '003abcXYZ123' } })).toBe(
      'https://y.gtimg.cn/music/photo_new/T002R300x300M000003abcXYZ123.jpg'
    )
  })
})
