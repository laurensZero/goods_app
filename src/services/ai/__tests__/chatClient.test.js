import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runChatCompletion, generateChatTitle, toOpenAiTools, normalizeBaseUrl, AiRequestError } from '../chatClient'

const platform = vi.hoisted(() => ({ native: true }))

vi.mock('@capacitor/core', () => ({
  // 平台标记可动态切换，覆盖原生 / Web 两条传输路径
  Capacitor: { isNativePlatform: () => platform.native },
  CapacitorHttp: { request: vi.fn() }
}))

import { CapacitorHttp } from '@capacitor/core'

const CONFIG = { baseUrl: 'https://api.example.com/v1/', model: 'test-model', apiKey: 'sk-test' }
const TOOLS = [
  { name: 'goods_search', description: 'search', inputSchema: { type: 'object', properties: {} } }
]

const EXECUTOR = vi.fn(async (name, args) => ({ tool: name, args }))

/** 模拟原生响应形状 { status, data } */
function nativeResponse(status, data) {
  return { status, data }
}

function completion(content, toolCalls) {
  const message = { role: 'assistant', content }
  if (toolCalls) message.tool_calls = toolCalls
  return { status: 200, data: { choices: [{ message }] } }
}

beforeEach(() => {
  CapacitorHttp.request.mockReset()
  EXECUTOR.mockClear()
})

describe('chatClient', () => {
  it('normalizeBaseUrl 去除尾部斜杠', () => {
    expect(normalizeBaseUrl('https://api.x.com/v1/')).toBe('https://api.x.com/v1')
  })

  it('toOpenAiTools 转换为 function calling 格式', () => {
    const tools = toOpenAiTools(TOOLS)
    expect(tools).toEqual([
      { type: 'function', function: { name: 'goods_search', description: 'search', parameters: { type: 'object', properties: {} } } }
    ])
  })

  it('缺少配置时直接抛错', async () => {
    await expect(runChatCompletion({
      config: { baseUrl: '', model: '', apiKey: '' },
      messages: [], tools: TOOLS, executor: EXECUTOR
    })).rejects.toThrow('未配置 AI 接口地址')
  })

  it('纯文本回答：一次请求完成，不带工具步骤', async () => {
    CapacitorHttp.request.mockResolvedValueOnce(completion('你好，这是回答'))

    const result = await runChatCompletion({
      config: CONFIG, messages: [{ role: 'user', content: 'hi' }], tools: TOOLS, executor: EXECUTOR
    })

    expect(result.content).toBe('你好，这是回答')
    expect(result.steps).toHaveLength(0)
    expect(EXECUTOR).not.toHaveBeenCalled()

    const options = CapacitorHttp.request.mock.calls[0][0]
    expect(options.url).toBe('https://api.example.com/v1/chat/completions')
    expect(options.headers.Authorization).toBe('Bearer sk-test')
    expect(options.data.tools).toHaveLength(1)
    expect(options.data.messages[0].content).toBe('hi')
  })

  it('工具调用循环：执行工具、回填 tool 消息、二轮拿到最终回答', async () => {
    CapacitorHttp.request
      .mockResolvedValueOnce(completion(null, [
        { id: 'call-1', function: { name: 'goods_search', arguments: '{"query":"初音"}' } }
      ]))
      .mockResolvedValueOnce(completion('找到了 2 条'))

    /** @type {Array<Record<string, any>>} */
    const sentPayloads = []
    const onStep = vi.fn()
    const result = await runChatCompletion({
      config: CONFIG,
      messages: [{ role: 'user', content: '搜初音' }],
      tools: TOOLS,
      executor: EXECUTOR,
      onStep
    })

    expect(result.content).toBe('找到了 2 条')
    expect(result.steps).toEqual([{ name: 'goods_search', args: { query: '初音' }, ok: true }])
    expect(EXECUTOR).toHaveBeenCalledWith('goods_search', { query: '初音' })
    expect(onStep).toHaveBeenCalledTimes(1)

    expect(CapacitorHttp.request).toHaveBeenCalledTimes(2)
    sentPayloads.push(CapacitorHttp.request.mock.calls[0][0].data)
    sentPayloads.push(CapacitorHttp.request.mock.calls[1][0].data)
    // 第二轮请求应包含 assistant.tool_calls 与 tool 结果消息
    const secondMessages = sentPayloads[1].messages
    expect(secondMessages.at(-2).tool_calls[0].id).toBe('call-1')
    expect(secondMessages.at(-1)).toEqual({
      role: 'tool',
      tool_call_id: 'call-1',
      content: JSON.stringify({ tool: 'goods_search', args: { query: '初音' } })
    })
  })

  it('工具执行失败时把错误交给模型继续回答', async () => {
    CapacitorHttp.request
      .mockResolvedValueOnce(completion(null, [
        { id: 'call-2', function: { name: 'goods_search', arguments: '不是JSON' } }
      ]))
      .mockResolvedValueOnce(completion('搜索出错了，抱歉'))

    const failingExecutor = vi.fn(async () => {
      throw new Error('数据库不可用')
    })

    const result = await runChatCompletion({
      config: CONFIG, messages: [], tools: TOOLS, executor: failingExecutor
    })

    expect(result.content).toBe('搜索出错了，抱歉')
    expect(result.steps[0]).toMatchObject({ name: 'goods_search', ok: false, error: '数据库不可用' })
    // arguments 非法时按空参数调用
    expect(failingExecutor).toHaveBeenCalledWith('goods_search', {})
    // 工具错误以 {error} 形式回填
    const toolMessage = CapacitorHttp.request.mock.calls[1][0].data.messages.at(-1)
    expect(JSON.parse(toolMessage.content)).toEqual({ error: '数据库不可用' })
  })

  it('HTTP 4xx 抛出 AiRequestError 并带上服务端错误信息', async () => {
    CapacitorHttp.request
      .mockResolvedValueOnce(nativeResponse(401, { error: { message: 'Incorrect API key' } }))
      .mockResolvedValueOnce(nativeResponse(401, { error: { message: 'Incorrect API key' } }))

    await expect(runChatCompletion({
      config: CONFIG, messages: [], tools: TOOLS, executor: EXECUTOR
    })).rejects.toMatchObject({
      status: 401,
      detail: 'Incorrect API key'
    })
    await expect(runChatCompletion({
      config: CONFIG, messages: [], tools: TOOLS, executor: EXECUTOR
    })).rejects.toBeInstanceOf(AiRequestError)
  })

  it('Web 端 dev 下经 /ai-proxy 转发，带 Content-Type 与 x-ai-target', async () => {
    platform.native = false
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'web ok' } }] })
    }))
    const originalFetch = globalThis.fetch
    globalThis.fetch = fetchMock
    try {
      const result = await runChatCompletion({
        config: { baseUrl: 'https://api.example.com/v1', model: 'test-model', apiKey: 'sk-test' },
        messages: [{ role: 'user', content: 'hi' }],
        tools: TOOLS,
        executor: EXECUTOR
      })
      expect(result.content).toBe('web ok')
      expect(CapacitorHttp.request).not.toHaveBeenCalled()

      const [url, options] = fetchMock.mock.calls[0]
      expect(url).toContain('/ai-proxy/chat/completions')
      expect(options.headers['x-ai-target']).toBe('https://api.example.com/v1')
      expect(options.headers['Content-Type']).toBe('application/json')
      expect(options.headers.Authorization).toBe('Bearer sk-test')
    } finally {
      globalThis.fetch = originalFetch
      platform.native = true
    }
  })

  it('超过工具轮数上限后强制发起无工具的收尾请求', async () => {
    // 前 6 轮（round 0..5）都要求调用工具
    for (let i = 0; i < 6; i += 1) {
      CapacitorHttp.request.mockResolvedValueOnce(completion(null, [
        { id: `call-${i}`, function: { name: 'goods_search', arguments: '{}' } }
      ]))
    }
    // 第 7 次是收尾请求（无 tools）返回文本
    CapacitorHttp.request.mockResolvedValueOnce(completion('不再调用工具了'))

    const result = await runChatCompletion({
      config: CONFIG, messages: [], tools: TOOLS, executor: EXECUTOR, maxToolRounds: 6
    })

    expect(result.content).toBe('不再调用工具了')
    expect(result.steps).toHaveLength(6)
    expect(CapacitorHttp.request).toHaveBeenCalledTimes(7)
    // 收尾请求不带 tools 参数
    const lastPayload = CapacitorHttp.request.mock.calls[6][0].data
    expect(lastPayload.tools).toBeUndefined()
  })

  it('捕获思维链：reasoning_content/reasoning 随结果返回，多轮按序拼接', async () => {
    // 第 1 轮：DeepSeek 风格 reasoning_content + 工具调用
    CapacitorHttp.request.mockResolvedValueOnce(nativeResponse(200, {
      choices: [{
        message: {
          role: 'assistant', content: null, reasoning_content: '先查一下收藏',
          tool_calls: [{ id: 'c1', function: { name: 'goods_search', arguments: '{}' } }]
        }
      }]
    }))
    EXECUTOR.mockResolvedValueOnce({ items: [] })
    // 第 2 轮：OpenRouter 风格 reasoning + 纯文本
    CapacitorHttp.request.mockResolvedValueOnce(nativeResponse(200, {
      choices: [{ message: { role: 'assistant', content: '你没有相关收藏', reasoning: '结果为空' } }]
    }))

    const result = await runChatCompletion({ config: CONFIG, messages: [], tools: TOOLS, executor: EXECUTOR })
    expect(result.content).toBe('你没有相关收藏')
    expect(result.reasoning).toBe('先查一下收藏\n\n结果为空')
  })

  it('无思维链时 reasoning 为空字符串', async () => {
    CapacitorHttp.request.mockResolvedValueOnce(completion('普通回答'))
    const result = await runChatCompletion({ config: CONFIG, messages: [], tools: TOOLS, executor: EXECUTOR })
    expect(result.reasoning).toBe('')
  })

  it('content 为空但思维链含完整回答时，思维链顶上当正文', async () => {
    // 部分模型会把整段回答写进思维链而 content 留空
    CapacitorHttp.request.mockResolvedValueOnce(nativeResponse(200, {
      choices: [{ message: { role: 'assistant', content: '', reasoning_content: '搜到 32 件千夏相关谷子，按状态分：已收藏约 12 件…' } }]
    }))
    const result = await runChatCompletion({ config: CONFIG, messages: [], tools: TOOLS, executor: EXECUTOR })
    expect(result.content).toContain('32 件千夏相关谷子')
    expect(result.reasoning).toBe('')
  })

  it('content 与思维链都为空时报错而非静默', async () => {
    CapacitorHttp.request.mockResolvedValueOnce(nativeResponse(200, {
      choices: [{ message: { role: 'assistant', content: '' } }]
    }))
    await expect(runChatCompletion({ config: CONFIG, messages: [], tools: TOOLS, executor: EXECUTOR }))
      .rejects.toThrow('空回复')
  })

  describe('流式（onDelta 提供 SSE 请求）', () => {
    const originalFetch = globalThis.fetch

    /** 构造可分块读取的 SSE 响应 */
    function sseFetch(chunksList) {
      const encoder = new TextEncoder()
      let callIndex = 0
      return vi.fn(async () => {
        const chunks = chunksList[Math.min(callIndex, chunksList.length - 1)]
        callIndex += 1
        let chunkIndex = 0
        return {
          ok: true,
          status: 200,
          body: {
            getReader: () => ({
              read: async () => (chunkIndex < chunks.length
                ? { done: false, value: encoder.encode(chunks[chunkIndex++]) }
                : { done: true, value: undefined })
            })
          }
        }
      })
    }

    afterEach(() => {
      globalThis.fetch = originalFetch
    })

    it('增量实时回调，reasoning/content 正确聚合', async () => {
      globalThis.fetch = sseFetch([[
        'data: {"choices":[{"delta":{"reasoning_content":"先想"}}]}\n\n',
        'data: {"choices":[{"delta":{"reasoning_content":"一下"}}]}\n\ndata: {"choices":[{"delta":{"content":"答案"}}]}\n\n',
        'data: [DONE]\n\n'
      ]])

      /** @type {string[]} */
      const deltas = []
      const result = await runChatCompletion({
        config: CONFIG, messages: [], tools: TOOLS, executor: EXECUTOR,
        onDelta: (/** @type {any} */ d) => {
          if (d.reasoning) deltas.push(d.reasoning)
          if (d.content) deltas.push(d.content)
        }
      })

      expect(deltas).toEqual(['先想', '一下', '答案'])
      expect(result.content).toBe('答案')
      expect(result.reasoning).toBe('先想一下')
      expect(CapacitorHttp.request).not.toHaveBeenCalled()
    })

    it('流式 tool_calls 增量聚合后执行工具，末轮给纯文本', async () => {
      globalThis.fetch = sseFetch([
        [
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c9","function":{"name":"goods_"}}]}}]}\n\n',
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"search","arguments":"{\\"a\\":"}}]}}]}\n\n',
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"1}"}}]}}]}\n\ndata: [DONE]\n\n'
        ],
        ['data: {"choices":[{"delta":{"content":"最终答案"}}]}\n\ndata: [DONE]\n\n']
      ])
      EXECUTOR.mockResolvedValueOnce({ items: [] })

      const result = await runChatCompletion({
        config: CONFIG, messages: [], tools: TOOLS, executor: EXECUTOR, onDelta: () => {}
      })

      expect(EXECUTOR).toHaveBeenCalledWith('goods_search', { a: 1 })
      expect(result.content).toBe('最终答案')
    })

    it('流式传输失败回退非流式并发出 reset', async () => {
      globalThis.fetch = vi.fn(async () => { throw new TypeError('Failed to fetch') })
      CapacitorHttp.request.mockResolvedValueOnce(completion('回退答案'))

      /** @type {any[]} */
      const deltas = []
      const result = await runChatCompletion({
        config: CONFIG, messages: [], tools: TOOLS, executor: EXECUTOR,
        onDelta: (/** @type {any} */ d) => deltas.push(d)
      })

      expect(result.content).toBe('回退答案')
      expect(deltas).toContainEqual({ reset: true })
    })

    it('流式收到 HTTP 401 直接抛错（不重复回退请求）', async () => {
      globalThis.fetch = vi.fn(async () => ({ ok: false, status: 401, text: async () => 'unauthorized' }))

      await expect(runChatCompletion({
        config: CONFIG, messages: [], tools: TOOLS, executor: EXECUTOR, onDelta: () => {}
      })).rejects.toThrow('HTTP 401')
      expect(CapacitorHttp.request).not.toHaveBeenCalled()
    })
  })

  describe('generateChatTitle', () => {
    it('轻量补全生成标题并清理引号/换行，payload 只含 model+messages（兼容严格网关）', async () => {
      CapacitorHttp.request.mockResolvedValueOnce(nativeResponse(200, {
        choices: [{ message: { content: '「游戏充值统计」\n' } }]
      }))

      const title = await generateChatTitle(CONFIG, '这个月充了多少钱', '一共 678 元')

      expect(title).toBe('游戏充值统计')
      const payload = CapacitorHttp.request.mock.calls[0][0]
      expect(payload.url).toBe('https://api.example.com/v1/chat/completions')
      expect(payload.data.messages[0].role).toBe('system')
      expect(payload.data.messages[1].content).toContain('这个月充了多少钱')
      expect(payload.data.tools).toBeUndefined()
      // temperature/max_tokens 不随请求发送：o 系/gpt-5 会 400，推理模型会烧光 max_tokens 返回空
      expect(payload.data.temperature).toBeUndefined()
      expect(payload.data.max_tokens).toBeUndefined()
    })

    it('兼容推理模型输出：剥掉 think 段与「标题：」前缀', async () => {
      CapacitorHttp.request.mockResolvedValueOnce(nativeResponse(200, {
        choices: [{ message: { content: '<think>用户想问充值…</think>标题：游戏充值统计' } }]
      }))
      expect(await generateChatTitle(CONFIG, '充值', '678 元')).toBe('游戏充值统计')

      CapacitorHttp.request.mockResolvedValueOnce(nativeResponse(200, {
        choices: [{ message: { content: '<think>未闭合的思考段…' } }]
      }))
      await expect(generateChatTitle(CONFIG, '充值', '678 元')).rejects.toThrow('有效标题')
    })

    it('空回复与缺配置分别抛错', async () => {
      CapacitorHttp.request.mockResolvedValueOnce(nativeResponse(200, {
        choices: [{ message: { content: '   ' } }]
      }))
      await expect(generateChatTitle(CONFIG, 'hi', 'hello')).rejects.toThrow('有效标题')

      await expect(generateChatTitle({ baseUrl: '', model: 'm', apiKey: 'k' }, 'hi', '')).rejects.toThrow('接口地址')
    })
  })
})
