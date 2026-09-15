import { describe, it, expect, vi, beforeEach } from 'vitest'

const capacitorMock = vi.hoisted(() => ({
  isNativePlatform: vi.fn(() => false)
}))
const capacitorHttpMock = vi.hoisted(() => ({
  request: vi.fn()
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: capacitorMock,
  CapacitorHttp: capacitorHttpMock
}))

import { transcribeAudio, pickAudioExtension, buildTranscriptionsUrl } from '../asrClient'

describe('asrClient helpers', () => {
  it('pickAudioExtension 按 MIME 映射扩展名', () => {
    expect(pickAudioExtension('audio/webm;codecs=opus')).toBe('.webm')
    expect(pickAudioExtension('audio/mp4')).toBe('.m4a')
    expect(pickAudioExtension('')).toBe('.webm')
  })

  it('buildTranscriptionsUrl 去掉末尾斜杠', () => {
    expect(buildTranscriptionsUrl('https://api.example.com/v1/')).toBe(
      'https://api.example.com/v1/audio/transcriptions'
    )
  })
})

describe('transcribeAudio', () => {
  beforeEach(() => {
    capacitorMock.isNativePlatform.mockReset()
    capacitorHttpMock.request.mockReset()
    // Web 路径会打 window.location.origin + /ai-proxy；happy-dom 已有 origin
    globalThis.fetch = vi.fn()
  })

  it('缺 baseUrl/apiKey 时直接报错', async () => {
    await expect(
      transcribeAudio({ config: { baseUrl: '', apiKey: '' }, blob: new Blob(['x']) })
    ).rejects.toThrow('接口地址')
  })

  it('空录音报错', async () => {
    await expect(
      transcribeAudio({
        config: { baseUrl: 'https://api.example.com', apiKey: 'k' },
        blob: new Blob([])
      })
    ).rejects.toThrow('录音为空')
  })

  it('原生走 CapacitorHttp，返回 text', async () => {
    capacitorMock.isNativePlatform.mockReturnValue(true)
    capacitorHttpMock.request.mockResolvedValue({
      status: 200,
      data: { text: '你好世界' }
    })

    const text = await transcribeAudio({
      config: { baseUrl: 'https://api.example.com/v1', apiKey: 'k', asrModel: 'whisper-1' },
      blob: new Blob(['fake-audio'], { type: 'audio/webm' }),
      mimeType: 'audio/webm'
    })
    expect(text).toBe('你好世界')
    expect(capacitorHttpMock.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.example.com/v1/audio/transcriptions',
        method: 'POST'
      })
    )
    const call = capacitorHttpMock.request.mock.calls[0][0]
    expect(call.data).toBeInstanceOf(FormData)
    expect(call.data.get('model')).toBe('whisper-1')
    expect(call.headers.Authorization).toBe('Bearer k')
  })

  it('Web 走 fetch + /ai-proxy，解析 text 字段', async () => {
    capacitorMock.isNativePlatform.mockReturnValue(false)
    globalThis.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ text: '买了吧唧' })
    })

    const text = await transcribeAudio({
      config: { baseUrl: 'https://api.example.com/v1', apiKey: 'k' },
      blob: new Blob(['fake'], { type: 'audio/webm' })
    })
    expect(text).toBe('买了吧唧')
    const [url, init] = globalThis.fetch.mock.calls[0]
    expect(String(url)).toContain('/ai-proxy/audio/transcriptions')
    expect(init.headers['x-ai-target']).toBe('https://api.example.com/v1')
    expect(init.body).toBeInstanceOf(FormData)
  })

  it('端点返回空 text 时给出明确错误', async () => {
    capacitorMock.isNativePlatform.mockReturnValue(true)
    capacitorHttpMock.request.mockResolvedValue({ status: 200, data: { text: '  ' } })
    await expect(
      transcribeAudio({
        config: { baseUrl: 'https://api.example.com', apiKey: 'k' },
        blob: new Blob(['x'])
      })
    ).rejects.toThrow('未返回文字')
  })

  it('HTTP 4xx 带状态码', async () => {
    capacitorMock.isNativePlatform.mockReturnValue(true)
    capacitorHttpMock.request.mockResolvedValue({
      status: 404,
      data: { error: { message: 'no route' } }
    })
    await expect(
      transcribeAudio({
        config: { baseUrl: 'https://api.example.com', apiKey: 'k' },
        blob: new Blob(['x'])
      })
    ).rejects.toThrow('404')
  })
})
