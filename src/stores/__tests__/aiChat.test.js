import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const { runChatCompletionMock } = vi.hoisted(() => ({ runChatCompletionMock: vi.fn() }))

vi.mock('@/services/ai/chatClient', () => ({
  runChatCompletion: runChatCompletionMock,
  DEFAULT_AI_CONFIG: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', apiKey: '' }
}))

// send() 不会真正执行工具，但模块顶层会 import，mock 掉重依赖链
vi.mock('@/utils/db', () => ({
  getItems: vi.fn(),
  getTrashedItems: vi.fn(),
  getEvents: vi.fn(),
  getRechargeRecords: vi.fn()
}))
vi.mock('../goods', () => ({ useGoodsStore: vi.fn() }))

import { useAiChatStore } from '../aiChat'

const FULL_CONFIG = { baseUrl: 'https://api.x.com/v1', model: 'test-model', apiKey: 'sk-test' }

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  runChatCompletionMock.mockReset()
  runChatCompletionMock.mockImplementation(async ({ messages }) => ({
    content: '好的',
    steps: [],
    convo: [...messages, { role: 'assistant', content: '好的' }]
  }))
})

describe('aiChat store', () => {
  it('用户消息必须进入发给模型的对话（回归：此前只进 UI 列表，模型看不到新问题）', async () => {
    const store = useAiChatStore()
    store.updateConfig({ ...FULL_CONFIG })

    await store.send('我这个月花了多少钱？')

    expect(runChatCompletionMock).toHaveBeenCalledTimes(1)
    const options = runChatCompletionMock.mock.calls[0][0]
    expect(options.messages.at(-1)).toEqual({ role: 'user', content: '我这个月花了多少钱？' })
    expect(options.messages[0].role).toBe('system')

    // UI 列表：用户消息 + 助手回复
    expect(store.messages.map((/** @type {any} */ m) => m.role)).toEqual(['user', 'assistant'])
    expect(store.messages[1].content).toBe('好的')
    expect(store.sending).toBe(false)
  })

  it('连续两轮发送时，模型历史按顺序累积全部用户消息', async () => {
    const store = useAiChatStore()
    store.updateConfig({ ...FULL_CONFIG })

    await store.send('第一问')
    await store.send('第二问')

    const secondCallMessages = runChatCompletionMock.mock.calls[1][0].messages
    expect(
      secondCallMessages
        .filter((/** @type {any} */ m) => m.role === 'user')
        .map((/** @type {any} */ m) => m.content)
    ).toEqual(['第一问', '第二问'])
  })

  it('配置缺失时不发请求并标记 no-config', async () => {
    const store = useAiChatStore()
    await store.send('hi')
    expect(runChatCompletionMock).not.toHaveBeenCalled()
    expect(store.lastError).toBe('no-config')
    expect(store.messages).toHaveLength(0)
  })

  it('clearMessages 重置 UI 列表与模型对话', async () => {
    const store = useAiChatStore()
    store.updateConfig({ ...FULL_CONFIG })
    await store.send('第一问')
    store.clearMessages()

    await store.send('第二问')
    const messages = runChatCompletionMock.mock.calls[1][0].messages
    expect(messages.filter((/** @type {any} */ m) => m.role === 'user').map((/** @type {any} */ m) => m.content))
      .toEqual(['第二问'])
  })
})
