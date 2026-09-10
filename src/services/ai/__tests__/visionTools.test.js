import { describe, it, expect, vi, beforeEach } from 'vitest'

const { runVisionCompletionMock } = vi.hoisted(() => ({
  runVisionCompletionMock: vi.fn()
}))

vi.mock('../visionClient', () => ({
  runVisionCompletion: runVisionCompletionMock,
  DEFAULT_VISION_PROMPT: 'describe'
}))

const { resolveImageForVisionMock } = vi.hoisted(() => ({
  resolveImageForVisionMock: vi.fn()
}))

vi.mock('../visionImage', () => ({
  resolveImageForVision: resolveImageForVisionMock
}))

import { createVisionToolHandlers, VISION_TOOL_DEFINITIONS } from '../visionTools'

const CONFIG = { baseUrl: 'https://api.x.com/v1', model: 'gpt-4o', visionModel: 'gpt-4o-mini', apiKey: 'sk-t' }

describe('visionTools', () => {
  beforeEach(() => {
    runVisionCompletionMock.mockReset()
    resolveImageForVisionMock.mockReset()
    resolveImageForVisionMock.mockResolvedValue('data:image/jpeg;base64,AAA')
    runVisionCompletionMock.mockResolvedValue('一张初音未来吧唧')
  })

  it('导出 vision_analyze 工具定义', () => {
    expect(VISION_TOOL_DEFINITIONS).toHaveLength(1)
    expect(VISION_TOOL_DEFINITIONS[0].name).toBe('vision_analyze')
  })

  it('附件序号解析到 getAttachments 并走多模态补全', async () => {
    const handlers = createVisionToolHandlers({
      getConfig: () => CONFIG,
      getAttachments: () => [{ id: 'a1', uri: 'data:image/png;base64,BBB' }]
    })

    const result = await handlers.vision_analyze({ image: '1', question: '这是什么角色' })

    expect(result).toEqual({ description: '一张初音未来吧唧' })
    expect(resolveImageForVisionMock).toHaveBeenCalledWith(expect.objectContaining({
      uri: 'data:image/png;base64,BBB'
    }))
    expect(runVisionCompletionMock).toHaveBeenCalledWith(expect.objectContaining({
      config: CONFIG,
      visionModel: 'gpt-4o-mini',
      imageUrl: 'data:image/jpeg;base64,AAA',
      prompt: '这是什么角色'
    }))
  })

  it('自定义 resolveSource 优先于序号解析（att:<id>）', async () => {
    const handlers = createVisionToolHandlers({
      getConfig: () => CONFIG,
      getAttachments: () => [],
      resolveSource: (token) => {
        expect(token).toBe('att:xyz')
        return { uri: 'https://example.com/a.png' }
      }
    })

    await handlers.vision_analyze({ image: 'att:xyz' })
    expect(resolveImageForVisionMock).toHaveBeenCalledWith(expect.objectContaining({
      uri: 'https://example.com/a.png'
    }))
  })

  it('image 缺失时抛错', async () => {
    const handlers = createVisionToolHandlers({
      getConfig: () => CONFIG,
      getAttachments: () => []
    })
    await expect(handlers.vision_analyze({})).rejects.toThrow('image 必填')
  })

  it('序号越界时抛错', async () => {
    const handlers = createVisionToolHandlers({
      getConfig: () => CONFIG,
      getAttachments: () => []
    })
    await expect(handlers.vision_analyze({ image: '3' })).rejects.toThrow('附件 #3 不存在')
  })

  it('非序号入参直接当图片 URI', async () => {
    const handlers = createVisionToolHandlers({
      getConfig: () => CONFIG,
      getAttachments: () => []
    })
    await handlers.vision_analyze({ image: 'cloud-image://goods-image__a__1.jpg' })
    expect(resolveImageForVisionMock).toHaveBeenCalledWith(expect.objectContaining({
      uri: 'cloud-image://goods-image__a__1.jpg'
    }))
  })
})
