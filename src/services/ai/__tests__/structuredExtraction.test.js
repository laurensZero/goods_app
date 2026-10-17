import { describe, it, expect, vi, beforeEach } from 'vitest'

const { CapacitorHttpMock } = vi.hoisted(() => ({
  CapacitorHttpMock: vi.fn()
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
  CapacitorHttp: { request: CapacitorHttpMock }
}))

import {
  runStructuredExtraction,
  buildExtractionPrompt,
  buildExtractionTool,
  parseJsonLoose,
  STRUCTURED_TOOL_NAME
} from '../structuredExtraction'

const CONFIG = { baseUrl: 'https://api.x.com/v1', model: 'vision-model', apiKey: 'sk-test' }
const IMAGE = 'data:image/jpeg;base64,AAA'

function toolCallResponse(payload) {
  return {
    status: 200,
    data: {
      choices: [{
        message: {
          role: 'assistant',
          tool_calls: [{
            id: 'call_1',
            type: 'function',
            function: { name: STRUCTURED_TOOL_NAME, arguments: JSON.stringify(payload) }
          }]
        }
      }]
    }
  }
}

function contentResponse(text) {
  return { status: 200, data: { choices: [{ message: { role: 'assistant', content: text } }] } }
}

describe('structuredExtraction', () => {
  beforeEach(() => {
    CapacitorHttpMock.mockReset()
  })

  it('缺少配置时抛错且不发请求', async () => {
    await expect(runStructuredExtraction({
      config: { baseUrl: '', model: '', apiKey: '' },
      imageUrl: IMAGE
    })).rejects.toThrow('未配置 AI 接口地址')
    expect(CapacitorHttpMock).not.toHaveBeenCalled()
  })

  it('首选 json_object：形状贴紧已验证可用的普通补全（不传 tools / tool_choice / temperature）', async () => {
    CapacitorHttpMock.mockResolvedValueOnce(contentResponse(JSON.stringify({
      transcript: '初音未来 亚克力立牌 标价 ¥158 实付 ¥128 2026-10-12 闲鱼',
      fields: {
        name: '初音未来 亚克力立牌',
        category: '立牌',
        characters: ['初音未来'],
        price: '158',
        actualPrice: '128',
        acquiredAt: '2026-10-12',
        unknownField: '应被丢弃'
      },
      evidence: { price: '标价 ¥158', actualPrice: '实付 ¥128', acquiredAt: '2026-10-12' },
      confidence: { price: 'high', actualPrice: 'high', acquiredAt: 'high' }
    })))

    const result = await runStructuredExtraction({
      config: CONFIG,
      imageUrl: IMAGE,
      vocabulary: { categories: ['吧唧'], ips: ['VOCALOID'], characters: ['初音未来'] }
    })

    const body = CapacitorHttpMock.mock.calls[0][0].data
    expect(body.model).toBe('vision-model')
    expect(body.response_format).toEqual({ type: 'json_object' })
    // 每多一个参数就多一个网关会拒/会卡的地方，所以这些一律不传
    expect(body.tools).toBeUndefined()
    expect(body.tool_choice).toBeUndefined()
    expect(body.temperature).toBeUndefined()
    // 提示词里注入了用户词表
    const promptText = body.messages[0].content[0].text
    expect(promptText).toContain('用户已有品类：吧唧')
    expect(promptText).toContain('VOCALOID')

    expect(CapacitorHttpMock).toHaveBeenCalledTimes(1)
    expect(result.transcript).toContain('初音未来')
    expect(result.fields).toMatchObject({
      name: '初音未来 亚克力立牌',
      category: '立牌',
      characters: ['初音未来'],
      price: '158',
      actualPrice: '128',
      acquiredAt: '2026-10-12'
    })
    expect(result.fields).not.toHaveProperty('unknownField')
    expect(result.evidence).toEqual({ price: '标价 ¥158', actualPrice: '实付 ¥128', acquiredAt: '2026-10-12' })
    expect(result.confidence).toEqual({ price: 'high', actualPrice: 'high', acquiredAt: 'high' })
  })

  it('空字符串 / 全空白数组视为未识别，不进 fields', async () => {
    CapacitorHttpMock.mockResolvedValueOnce(toolCallResponse({
      transcript: '某商品',
      fields: { name: '某商品', category: '', characters: ['  ', ''], price: '   ' },
      evidence: {},
      confidence: {}
    }))

    const result = await runStructuredExtraction({ config: CONFIG, imageUrl: IMAGE })
    expect(result.fields).toEqual({ name: '某商品' })
  })

  it('无 tool_calls 时从正文 JSON 解析（含 ```json 围栏）', async () => {
    CapacitorHttpMock.mockResolvedValueOnce(contentResponse(
      '```json\n{"transcript":"吧唧 30元","fields":{"name":"吧唧","price":"30"}}\n```'
    ))

    const result = await runStructuredExtraction({ config: CONFIG, imageUrl: IMAGE })
    expect(result.fields).toEqual({ name: '吧唧', price: '30' })
  })

  it('正文带前后废话时抓第一个 JSON 对象', async () => {
    CapacitorHttpMock.mockResolvedValueOnce(contentResponse(
      '识别结果如下：{"transcript":"立牌","fields":{"name":"立牌"}} 仅供参考'
    ))

    const result = await runStructuredExtraction({ config: CONFIG, imageUrl: IMAGE })
    expect(result.fields).toEqual({ name: '立牌' })
  })

  it('端点不认 response_format 时改用 tools 形状强制提交', async () => {
    CapacitorHttpMock
      .mockResolvedValueOnce({
        status: 400,
        data: { error: { message: 'response_format is not supported by this gateway' } }
      })
      .mockResolvedValueOnce(toolCallResponse({ transcript: '吧唧', fields: { name: '吧唧' } }))

    const result = await runStructuredExtraction({ config: CONFIG, imageUrl: IMAGE })

    expect(CapacitorHttpMock).toHaveBeenCalledTimes(2)
    expect(CapacitorHttpMock.mock.calls[0][0].data.response_format).toEqual({ type: 'json_object' })
    const retryBody = CapacitorHttpMock.mock.calls[1][0].data
    expect(retryBody.response_format).toBeUndefined()
    expect(retryBody.tools[0].function.name).toBe(STRUCTURED_TOOL_NAME)
    expect(retryBody.tool_choice).toEqual({ type: 'function', function: { name: STRUCTURED_TOOL_NAME } })
    expect(result.fields).toEqual({ name: '吧唧' })
  })

  it('超时不换形状重试：那不是形状问题，重试只会让用户多等一遍', async () => {
    CapacitorHttpMock.mockRejectedValueOnce(new Error('视觉请求超时（120s）'))

    await expect(runStructuredExtraction({ config: CONFIG, imageUrl: IMAGE }))
      .rejects.toThrow('视觉请求超时')
    expect(CapacitorHttpMock).toHaveBeenCalledTimes(1)
  })

  it('非形状相关的 HTTP 错误直接透出，不重试', async () => {
    CapacitorHttpMock.mockResolvedValueOnce({
      status: 401,
      data: { error: { message: 'invalid api key' } }
    })

    await expect(runStructuredExtraction({ config: CONFIG, imageUrl: IMAGE }))
      .rejects.toThrow('HTTP 401')
    expect(CapacitorHttpMock).toHaveBeenCalledTimes(1)
  })

  it('既无工具调用正文也不是 JSON 时给出可操作报错', async () => {
    CapacitorHttpMock.mockResolvedValueOnce(contentResponse('这张图里是一个吧唧'))

    await expect(runStructuredExtraction({ config: CONFIG, imageUrl: IMAGE }))
      .rejects.toThrow('结构化抽取失败')
  })

  it('工具参数不是合法 JSON 时报错', async () => {
    CapacitorHttpMock.mockResolvedValueOnce({
      status: 200,
      data: {
        choices: [{
          message: {
            tool_calls: [{
              type: 'function',
              function: { name: STRUCTURED_TOOL_NAME, arguments: '{不是 JSON' }
            }]
          }
        }]
      }
    })

    await expect(runStructuredExtraction({ config: CONFIG, imageUrl: IMAGE }))
      .rejects.toThrow('不是合法 JSON')
  })

  it('signal 已中止时不发请求', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(runStructuredExtraction({
      config: CONFIG,
      imageUrl: IMAGE,
      signal: controller.signal
    })).rejects.toThrow('已停止生成')
    expect(CapacitorHttpMock).not.toHaveBeenCalled()
  })

  describe('parseJsonLoose', () => {
    it('纯 JSON / 围栏 / 包装文本都能解析', () => {
      expect(parseJsonLoose('{"a":1}')).toEqual({ a: 1 })
      expect(parseJsonLoose('```json\n{"a":1}\n```')).toEqual({ a: 1 })
      expect(parseJsonLoose('结果：{"a":{"b":2}} 完')).toEqual({ a: { b: 2 } })
    })

    it('字符串里的花括号不会干扰片段切分', () => {
      expect(parseJsonLoose('{"note":"含 } 括号"}')).toEqual({ note: '含 } 括号' })
    })

    it('空串 / 数组 / 无法解析返回 null', () => {
      expect(parseJsonLoose('')).toBeNull()
      expect(parseJsonLoose('[1,2]')).toBeNull()
      expect(parseJsonLoose('没有 JSON')).toBeNull()
    })
  })

  describe('buildExtractionTool', () => {
    it('数组字段来自 fieldCoercion，金额拆成标价与实付两个字符串字段', () => {
      const tool = buildExtractionTool({})
      const props = tool.function.parameters.properties.fields.properties
      expect(props.characters.type).toBe('array')
      expect(props.name.type).toBe('string')
      expect(props.price.type).toBe('string')
      expect(props.actualPrice.type).toBe('string')
      expect(props.acquiredAt.type).toBe('string')
      expect(tool.function.parameters.required).toEqual(['transcript', 'fields'])
    })
  })

  describe('buildExtractionPrompt', () => {
    it('无词表时不含词汇段落，有词表时列出', () => {
      expect(buildExtractionPrompt({})).not.toContain('用户已有词汇')
      const withVocab = buildExtractionPrompt({ vocabulary: { ips: ['原神'] }, extraInstructions: '这是订单截图' })
      expect(withVocab).toContain('用户已有词汇')
      expect(withVocab).toContain('原神')
      expect(withVocab).toContain('这是订单截图')
    })
  })
})
