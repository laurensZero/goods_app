import { describe, expect, it } from 'vitest'
import { buildBilibiliWebUrl, md5, parseBilibiliVideoId, selectBilibiliAudioStream } from '@/utils/bilibiliMusic'

describe('Bilibili music helpers', () => {
  it('parses BV ids from URLs and direct values', () => {
    expect(parseBilibiliVideoId('https://www.bilibili.com/video/BV1xx411c7mD')).toBe('BV1xx411c7mD')
    expect(parseBilibiliVideoId('BV1xx411c7mD')).toBe('BV1xx411c7mD')
  })

  it('builds a Bilibili video URL', () => {
    expect(buildBilibiliWebUrl('BV1xx411c7mD')).toBe('https://www.bilibili.com/video/BV1xx411c7mD')
  })

  it('calculates the MD5 used by Bilibili WBI signing', () => {
    expect(md5('')).toBe('d41d8cd98f00b204e9800998ecf8427e')
    expect(md5('abc')).toBe('900150983cd24fb0d6963f7d28e17f72')
  })

  it('prefers browser-friendly AAC/MP4 audio over unsupported high-quality streams', () => {
    expect(selectBilibiliAudioStream([
      { id: 30251, bandwidth: 900000, mimeType: 'audio/flac' },
      { id: 30280, bandwidth: 600000, mimeType: 'audio/mp4; codecs="mp4a.40.2"' },
      { id: 30232, bandwidth: 300000, mimeType: 'audio/mp4; codecs="mp4a.40.2"' }
    ])?.id).toBe(30232)
  })
})
