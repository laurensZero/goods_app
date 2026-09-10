import { describe, it, expect, vi, beforeEach } from 'vitest'

const { CapacitorHttpMock } = vi.hoisted(() => ({
  CapacitorHttpMock: vi.fn()
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
  CapacitorHttp: { request: CapacitorHttpMock }
}))

import { runVisionCompletion } from '../visionClient'

const CONFIG = { baseUrl: 'https://api.x.com/v1', model: 'vision-model', apiKey: 'sk-test' }

describe('visionClient', () => {
  beforeEach(() => {
    CapacitorHttpMock.mockReset()
  })

  it('缺少配置时抛错', async () => {
    await expect(runVisionCompletion({
      config: { baseUrl: '', model: '', apiKey: '' },
      imageUrl: 'data:image/png;base64,AA'
    })).rejects.toThrow('未配置 AI 接口地址')
  })

  it('原生路径：发送多模态 messages 并返回 content', async () => {
    CapacitorHttpMock.mockResolvedValueOnce({
      status: 200,
      data: { choices: [{ message: { role: 'assistant', content: '这是吧唧' } }] }
    })

    const text = await runVisionCompletion({
      config: CONFIG,
      imageUrl: 'data:image/jpeg;base64,AAA',
      prompt: '角色是谁'
    })

    expect(text).toBe('这是吧唧')
    const body = CapacitorHttpMock.mock.calls[0][0]
    expect(body.url).toBe('https://api.x.com/v1/chat/completions')
    expect(body.data.model).toBe('vision-model')
    expect(body.data.messages[0].content[0]).toEqual({ type: 'text', text: '角色是谁' })
    expect(body.data.messages[0].content[1]).toEqual({
      type: 'image_url',
      image_url: { url: 'data:image/jpeg;base64,AAA' }
    })
  })

  it('visionModel 覆盖主模型', async () => {
    CapacitorHttpMock.mockResolvedValueOnce({
      status: 200,
      data: { choices: [{ message: { content: 'ok' } }] }
    })

    await runVisionCompletion({
      config: CONFIG,
      visionModel: 'gpt-4o-mini',
      imageUrl: 'data:image/jpeg;base64,AAA'
    })

    expect(CapacitorHttpMock.mock.calls[0][0].data.model).toBe('gpt-4o-mini')
  })

  it('HTTP 错误透出状态码', async () => {
    CapacitorHttpMock.mockResolvedValueOnce({
      status: 400,
      data: { error: { message: 'model does not support image' } }
    })

    await expect(runVisionCompletion({
      config: CONFIG,
      imageUrl: 'data:image/jpeg;base64,AAA'
    })).rejects.toThrow('HTTP 400')
  })

  it('content 为空但有 reasoning 时回退思维链文本', async () => {
    CapacitorHttpMock.mockResolvedValueOnce({
      status: 200,
      data: {
        choices: [{
          message: { content: '', reasoning_content: '这是一张初音未来吧唧的特写' }
        }]
      }
    })

    const text = await runVisionCompletion({
      config: CONFIG,
      imageUrl: 'data:image/jpeg;base64,AAA'
    })
    expect(text).toBe('这是一张初音未来吧唧的特写')
  })

  it('完全空回复时提示更换视觉模型', async () => {
    CapacitorHttpMock.mockResolvedValueOnce({
      status: 200,
      data: { choices: [{ message: { content: '', reasoning: '' }, finish_reason: 'stop' }] }
    })

    await expect(runVisionCompletion({
      config: CONFIG,
      imageUrl: 'data:image/jpeg;base64,AAA'
    })).rejects.toThrow('视觉模型返回了空回复')
  })
})
