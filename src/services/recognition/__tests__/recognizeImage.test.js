import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  resolveImageForVision: vi.fn(),
  runStructuredExtraction: vi.fn(),
  hasVisionRecognitionConfig: vi.fn(),
  readAiConfig: vi.fn()
}))

vi.mock('@/services/ai/visionImage', () => ({
  resolveImageForVision: mocks.resolveImageForVision
}))

vi.mock('@/services/ai/structuredExtraction', () => ({
  runStructuredExtraction: mocks.runStructuredExtraction
}))

vi.mock('@/utils/ai/assistantPrefs', () => ({
  hasVisionRecognitionConfig: mocks.hasVisionRecognitionConfig,
  readAiConfig: mocks.readAiConfig
}))

import { recognizeImage } from '../recognizeImage'

const IMAGE = { uri: 'file:///tmp/a.jpg' }
const DATA_URL = 'data:image/jpeg;base64,AAA'
const VOCABULARY = {
  categories: ['立牌', '吧唧'],
  ips: ['VOCALOID'],
  characters: ['初音未来']
}

function makeRaw({ transcript, fields, evidence = {}, confidence = {} }) {
  return { transcript, fields, evidence, confidence }
}

describe('recognizeImage', () => {
  beforeEach(() => {
    mocks.resolveImageForVision.mockReset().mockResolvedValue(DATA_URL)
    mocks.runStructuredExtraction.mockReset()
    mocks.hasVisionRecognitionConfig.mockReset().mockReturnValue(true)
    mocks.readAiConfig.mockReset().mockReturnValue({
      baseUrl: 'https://api.x.com/v1',
      model: 'text-model',
      visionModel: 'vision-model',
      apiKey: 'sk-test'
    })
  })

  it('没有可用后端时给出可操作的报错', async () => {
    mocks.hasVisionRecognitionConfig.mockReturnValue(false)

    await expect(recognizeImage({ image: IMAGE })).rejects.toThrow('还没有可用的识别模型')
    expect(mocks.runStructuredExtraction).not.toHaveBeenCalled()
  })

  it('完整链路：图片压缩 → 抽取 → 出处校验 → 词表对齐 → 类型收敛', async () => {
    const transcript = 'VOCALOID 初音未来 亚克力立牌 标价 ¥158 实付 ¥128 下单 2026-10-12'
    mocks.runStructuredExtraction.mockResolvedValue(makeRaw({
      transcript,
      fields: {
        name: '初音未来 亚克力立牌',
        category: '立牌',
        ip: 'VOCALOID',
        characters: ['初音未来'],
        price: '158',
        actualPrice: '128',
        acquiredAt: '2026-10-12'
      },
      evidence: {
        name: '初音未来 亚克力立牌',
        category: '立牌',
        ip: 'VOCALOID',
        characters: '初音未来',
        price: '标价 ¥158',
        actualPrice: '实付 ¥128',
        acquiredAt: '2026-10-12'
      },
      confidence: {
        name: 'high',
        category: 'high',
        ip: 'high',
        characters: 'high',
        price: 'high',
        actualPrice: 'high',
        acquiredAt: 'high'
      }
    }))

    const result = await recognizeImage({ image: IMAGE, vocabulary: VOCABULARY })

    // 交给后端的确实是压缩后的 data URL + 用户词表 + 视觉模型
    expect(mocks.runStructuredExtraction).toHaveBeenCalledWith(expect.objectContaining({
      imageUrl: DATA_URL,
      visionModel: 'vision-model',
      vocabulary: VOCABULARY
    }))

    expect(result.transcript).toBe(transcript)
    expect(result.warnings).toEqual([])
    expect(result.fields).toEqual({
      name: { value: '初音未来 亚克力立牌', confidence: 'high', verified: true },
      category: { value: '立牌', confidence: 'high', verified: true },
      ip: { value: 'VOCALOID', confidence: 'high', verified: true },
      characters: { value: ['初音未来'], confidence: 'high', verified: true },
      price: { value: '158', confidence: 'high', verified: true },
      actualPrice: { value: '128', confidence: 'high', verified: true },
      acquiredAt: { value: '2026-10-12', confidence: 'high', verified: true }
    })
  })

  it('出处对不上的字段被丢弃（防编造）', async () => {
    mocks.runStructuredExtraction.mockResolvedValue(makeRaw({
      transcript: '吧唧 30 元',
      fields: { name: '吧唧', price: '99' },
      evidence: { name: '吧唧', price: '99 元' },
      confidence: { name: 'high', price: 'high' }
    }))

    const result = await recognizeImage({ image: IMAGE })

    expect(result.fields.name.value).toBe('吧唧')
    expect(result.fields).not.toHaveProperty('price')
    expect(result.warnings).toContainEqual({ code: 'grounding_failed', field: 'price' })
  })

  it('模型没给出处 → 保留但降级为未验证（不超过 medium）', async () => {
    mocks.runStructuredExtraction.mockResolvedValue(makeRaw({
      transcript: '吧唧 30 元',
      fields: { name: '吧唧' },
      confidence: { name: 'high' }
    }))

    const result = await recognizeImage({ image: IMAGE })

    expect(result.fields.name).toEqual({ value: '吧唧', confidence: 'medium', verified: null })
    expect(result.warnings).toContainEqual({ code: 'evidence_missing', field: 'name' })
  })

  it('词表未命中：保留原值、降为 medium 并提示确认', async () => {
    mocks.runStructuredExtraction.mockResolvedValue(makeRaw({
      transcript: '凯亚 吧唧',
      fields: { characters: ['凯亚'] },
      evidence: { characters: '凯亚' },
      confidence: { characters: 'high' }
    }))

    const result = await recognizeImage({ image: IMAGE, vocabulary: VOCABULARY })

    expect(result.fields.characters).toEqual({ value: ['凯亚'], confidence: 'medium', verified: true })
    expect(result.warnings).toContainEqual({ code: 'vocabulary_mismatch', field: 'characters' })
  })

  it('词表同音/繁简变体命中：采用词表写法并降为 medium', async () => {
    mocks.runStructuredExtraction.mockResolvedValue(makeRaw({
      transcript: '納西妲 吧唧',
      fields: { characters: ['納西妲'] },
      evidence: { characters: '納西妲' },
      confidence: { characters: 'high' }
    }))

    const result = await recognizeImage({
      image: IMAGE,
      vocabulary: { ...VOCABULARY, characters: ['纳西妲'] }
    })

    expect(result.fields.characters).toEqual({ value: ['纳西妲'], confidence: 'medium', verified: true })
    expect(result.warnings).toEqual([])
  })

  it('模型自评 low 的字段一律留空', async () => {
    mocks.runStructuredExtraction.mockResolvedValue(makeRaw({
      transcript: '吧唧 30 元',
      fields: { name: '吧唧', price: '30' },
      evidence: { name: '吧唧', price: '30 元' },
      confidence: { name: 'low', price: 'high' }
    }))

    const result = await recognizeImage({ image: IMAGE })

    expect(result.fields).not.toHaveProperty('name')
    expect(result.fields.price.value).toBe('30')
    expect(result.warnings).toContainEqual({ code: 'low_confidence', field: 'name' })
  })

  it('日期格式不可识别 → 丢弃并告警（与表格导入同一套规则）', async () => {
    mocks.runStructuredExtraction.mockResolvedValue(makeRaw({
      transcript: '吧唧 昨天买的',
      fields: { name: '吧唧', acquiredAt: '昨天' },
      evidence: { name: '吧唧', acquiredAt: '昨天' },
      confidence: { name: 'high', acquiredAt: 'high' }
    }))

    const result = await recognizeImage({ image: IMAGE })

    expect(result.fields).not.toHaveProperty('acquiredAt')
    expect(result.warnings).toContainEqual({ code: 'invalid_value', field: 'acquiredAt' })
  })

  it('转写为空时给出 transcript_empty 提示', async () => {
    mocks.runStructuredExtraction.mockResolvedValue(makeRaw({ transcript: '', fields: {} }))

    const result = await recognizeImage({ image: IMAGE })

    expect(result.fields).toEqual({})
    expect(result.warnings).toContainEqual({ code: 'transcript_empty', field: '' })
  })

  it('evidence / confidence 整个缺失时不炸，全部按未验证处理', async () => {
    mocks.runStructuredExtraction.mockResolvedValue({ transcript: '吧唧', fields: { name: '吧唧' } })

    const result = await recognizeImage({ image: IMAGE })

    expect(result.fields.name).toEqual({ value: '吧唧', confidence: 'medium', verified: null })
  })
})
