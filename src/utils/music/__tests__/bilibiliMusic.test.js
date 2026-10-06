import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => true),
    getPlatform: vi.fn(() => 'android')
  },
  CapacitorHttp: {
    get: vi.fn()
  }
}))

import { Capacitor, CapacitorHttp } from '@capacitor/core'
import {
  buildBilibiliWebUrl,
  md5,
  parseBilibiliVideoId,
  pickBilibiliMediaUrl,
  selectBilibiliAudioStream,
  isTransientNetworkError,
  fetchBilibiliPlayableUrl,
  fetchBilibiliVideoMeta
} from '@/utils/music/bilibiliMusic'

const DETAIL_RESPONSE = { status: 200, data: JSON.stringify({ code: 0, data: { cid: '123456' } }) }
const PLAYURL_RESPONSE = {
  status: 200,
  data: JSON.stringify({
    code: 0,
    data: {
      dash: {
        audio: [{
          id: 30232,
          baseUrl: 'https://example.com/audio.m4s',
          backupUrl: [],
          mimeType: 'audio/mp4',
          bandwidth: 300000,
          codecs: 'mp4a.40.2'
        }]
      }
    }
  })
}
const makeDnsError = () => new Error('Unable to resolve host "api.bilibili.com": No address associated with hostname')

describe('Bilibili music helpers', () => {
  it('parses BV ids from URLs and direct values', () => {
    expect(parseBilibiliVideoId('https://www.bilibili.com/video/BV1xx411c7mD')).toBe('BV1xx411c7mD')
    expect(parseBilibiliVideoId('BV1xx411c7mD')).toBe('BV1xx411c7mD')
  })

  it('rejects incomplete BV input so it falls back to keyword search', () => {
    expect(parseBilibiliVideoId('BVx')).toBe('')
    expect(parseBilibiliVideoId('BV 号怎么用')).toBe('')
    expect(parseBilibiliVideoId('https://i0.hdslb.com/bfs/archive/x.jpg')).toBe('')
  })

  it('builds a Bilibili video URL', () => {
    expect(buildBilibiliWebUrl('BV1xx411c7mD')).toBe('https://www.bilibili.com/video/BV1xx411c7mD')
    expect(buildBilibiliWebUrl('BV1xx411c7mD', 0)).toBe('https://www.bilibili.com/video/BV1xx411c7mD')
    expect(buildBilibiliWebUrl('BV1xx411c7mD', 1)).toBe('https://www.bilibili.com/video/BV1xx411c7mD')
    expect(buildBilibiliWebUrl('BV1xx411c7mD', 2)).toBe('https://www.bilibili.com/video/BV1xx411c7mD?p=2')
  })

  it('returns page-aware meta with pages list', async () => {
    CapacitorHttp.get.mockResolvedValueOnce({
      status: 200,
      data: JSON.stringify({
        code: 0,
        data: {
          cid: '111',
          title: '演唱会全场',
          owner: { name: 'UP主' },
          pic: 'http://i0.hdslb.com/cover.jpg',
          duration: 600,
          pages: [
            { page: 1, part: '开场', duration: 300 },
            { page: 2, part: '压轴', duration: 300 }
          ]
        }
      })
    })
    const meta = await fetchBilibiliVideoMeta('BV1xx411c7mD', 2)
    expect(meta.title).toBe('演唱会全场')
    expect(meta.coverUrl).toBe('https://i0.hdslb.com/cover.jpg')
    expect(meta.durationMs).toBe(300000)
    expect(meta.pages).toEqual([
      { page: 1, part: '开场', durationMs: 300000 },
      { page: 2, part: '压轴', durationMs: 300000 }
    ])
  })

  it('uses the top-level duration when the requested page is missing', async () => {
    CapacitorHttp.get.mockResolvedValueOnce({
      status: 200,
      data: JSON.stringify({
        code: 0,
        data: { cid: '111', duration: 600, pages: [{ page: 1, part: '开场', duration: 300 }] }
      })
    })
    const meta = await fetchBilibiliVideoMeta('BV1xx411c7mD', 9)
    expect(meta.durationMs).toBe(600000)
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

  it('prefers bilivideo.com CDN over mcdn/mountaintoys candidates', () => {
    expect(pickBilibiliMediaUrl([
      'https://xy36x150x3x5xy.mcdn.bilivideo.cn/audio.m4s',
      'https://edge.example.edge.mountaintoys.cn/audio.m4s',
      'https://cn-hbwh-cm-01-01.bilivideo.com/audio.m4s'
    ])).toBe('https://cn-hbwh-cm-01-01.bilivideo.com/audio.m4s')
  })

  it('still accepts bilivideo.cn and mountaintoys.cn hosts when no .com is present', () => {
    expect(pickBilibiliMediaUrl([
      'https://edge.a.mountaintoys.cn/a.m4s',
      'https://xy.mcdn.bilivideo.cn/a.m4s'
    ])).toBe('https://edge.a.mountaintoys.cn/a.m4s')
    expect(pickBilibiliMediaUrl(['http://xy.mcdn.bilivideo.cn/a.m4s']))
      .toBe('https://xy.mcdn.bilivideo.cn/a.m4s')
  })

  it('normalizes protocol-relative and empty candidates', () => {
    expect(pickBilibiliMediaUrl(['//upos-sz-mirrorcos.bilivideo.com/a.m4s', '', null]))
      .toBe('https://upos-sz-mirrorcos.bilivideo.com/a.m4s')
    expect(pickBilibiliMediaUrl([])).toBe('')
  })
})

describe('isTransientNetworkError', () => {
  it('detects DNS resolution errors', () => {
    expect(isTransientNetworkError(makeDnsError())).toBe(true)
    expect(isTransientNetworkError(new Error('No address associated with hostname'))).toBe(true)
    expect(isTransientNetworkError(new Error('unable to resolve host'))).toBe(true)
  })

  it('detects TypeError (fetch network errors)', () => {
    expect(isTransientNetworkError(new TypeError('Failed to fetch'))).toBe(true)
  })

  it('detects timeout errors', () => {
    expect(isTransientNetworkError(new Error('timeout'))).toBe(true)
  })

  it('detects connection reset/refused', () => {
    expect(isTransientNetworkError(new Error('ECONNREFUSED'))).toBe(true)
    expect(isTransientNetworkError(new Error('ECONNRESET'))).toBe(true)
  })

  it('does not flag business errors as transient', () => {
    expect(isTransientNetworkError(new Error('Bilibili 请求失败（403）'))).toBe(false)
    expect(isTransientNetworkError(null)).toBe(false)
    expect(isTransientNetworkError(undefined)).toBe(false)
  })
})

describe('fetchBilibiliPlayableUrl retry', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false })
    Capacitor.isNativePlatform.mockReturnValue(true)
    CapacitorHttp.get.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('retries on DNS resolution failure then succeeds', async () => {
    CapacitorHttp.get
      .mockRejectedValueOnce(makeDnsError())
      .mockResolvedValueOnce(DETAIL_RESPONSE)
      .mockResolvedValueOnce(PLAYURL_RESPONSE)

    const promise = fetchBilibiliPlayableUrl('BV1xx411c7mD')
    await vi.advanceTimersByTimeAsync(2000)
    const result = await promise

    expect(CapacitorHttp.get).toHaveBeenCalledTimes(3)
    expect(result.url).toBe('https://example.com/audio.m4s')
    expect(result.code).toBe(0)
  })

  it('throws after max retries exhausted (DNS)', async () => {
    CapacitorHttp.get.mockRejectedValue(makeDnsError())

    const promise = fetchBilibiliPlayableUrl('BV1xx411c7mD')
    const assertion = expect(promise).rejects.toThrow(/Unable to resolve host/)
    await vi.advanceTimersByTimeAsync(10000)
    await assertion
    await expect(promise).rejects.toThrow(/Unable to resolve host/)
    expect(CapacitorHttp.get).toHaveBeenCalledTimes(3)
  })

  it('does not retry on non-transient errors', async () => {
    CapacitorHttp.get.mockRejectedValue(new Error('Bilibili 请求失败（403）'))

    await expect(fetchBilibiliPlayableUrl('BV1xx411c7mD')).rejects.toThrow(/403/)
    expect(CapacitorHttp.get).toHaveBeenCalledTimes(1)
  })

  it('resolves the cid of the requested page for multi-part videos', async () => {
    CapacitorHttp.get
      .mockResolvedValueOnce({
        status: 200,
        data: JSON.stringify({
          code: 0,
          data: {
            cid: '111',
            pages: [
              { page: 1, cid: '111', duration: 300 },
              { page: 2, cid: '222', duration: 300 }
            ]
          }
        })
      })
      .mockResolvedValueOnce(PLAYURL_RESPONSE)

    await fetchBilibiliPlayableUrl('BV1xx411c7mD', 2)

    expect(CapacitorHttp.get).toHaveBeenCalledTimes(2)
    const playurlUrl = String(CapacitorHttp.get.mock.calls[1][0].url)
    expect(playurlUrl).toContain('cid=222')
  })

  it('falls back to the top-level cid for out-of-range pages', async () => {
    CapacitorHttp.get
      .mockResolvedValueOnce({
        status: 200,
        data: JSON.stringify({
          code: 0,
          data: { cid: '111', pages: [{ page: 1, cid: '111' }] }
        })
      })
      .mockResolvedValueOnce(PLAYURL_RESPONSE)

    await fetchBilibiliPlayableUrl('BV1xx411c7mD', 5)

    const playurlUrl = String(CapacitorHttp.get.mock.calls[1][0].url)
    expect(playurlUrl).toContain('cid=111')
  })
})
