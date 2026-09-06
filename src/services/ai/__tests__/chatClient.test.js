import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runChatCompletion, toOpenAiTools, normalizeBaseUrl, AiRequestError } from '../chatClient'

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
})
