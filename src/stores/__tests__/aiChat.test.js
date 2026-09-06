import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick, watchEffect } from 'vue'

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

  it('助手回复写入必须触发视图响应（回归：闭包原始对象赋值绕过 Proxy 不更新 UI）', async () => {
    /** @type {(value: any) => void} */
    let resolveRun
    runChatCompletionMock.mockImplementation(async ({ messages }) => {
      await new Promise((resolve) => { resolveRun = resolve })
      return { content: 'done', steps: [], convo: [...messages, { role: 'assistant', content: 'done' }] }
    })

    const store = useAiChatStore()
    store.updateConfig({ ...FULL_CONFIG })

    const sendPromise = store.send('问题')
    await new Promise((resolve) => setTimeout(resolve)) // 等 messages 推送完成

    let runs = 0
    const stop = watchEffect(() => {
      runs += 1
      void store.messages.at(-1)?.content
    })
    const runsWhilePending = runs
    expect(store.messages.at(-1)?.pending).toBe(true)

    resolveRun()
    await sendPromise
    await nextTick()

    expect(runs).toBeGreaterThan(runsWhilePending)
    expect(store.messages.at(-1)?.content).toBe('done')
    expect(store.messages.at(-1)?.pending).toBe(false)
    stop()
  })

  it('会话持久化到 localStorage，新实例（模拟刷新）恢复', async () => {
    runChatCompletionMock.mockImplementation(async ({ messages }) => ({
      content: 'done',
      steps: [],
      convo: [...messages, { role: 'assistant', content: 'done' }]
    }))

    const store = useAiChatStore()
    store.updateConfig({ ...FULL_CONFIG })
    await store.send('记住我')
    await new Promise((resolve) => setTimeout(resolve, 450)) // 等防抖持久化落盘

    const saved = JSON.parse(localStorage.getItem('goods_ai_chat_sessions'))
    expect(saved.sessions).toHaveLength(1)
    expect(saved.sessions[0].messages.at(-1).content).toBe('done')
    expect(saved.sessions[0].title).toBe('记住我')
    expect(saved.activeId).toBe(store.activeSessionId)

    // 模拟刷新：新建 pinia + store 实例
    setActivePinia(createPinia())
    const reloaded = useAiChatStore()
    expect(reloaded.messages.at(-1).content).toBe('done')
    expect(reloaded.sessions).toHaveLength(1)

    // 恢复后的对话继续可用：上下文包含历史用户消息
    await reloaded.send('第二问')
    const secondCall = runChatCompletionMock.mock.calls.at(-1)[0]
    expect(
      secondCall.messages.filter((/** @type {any} */ m) => m.role === 'user').map((/** @type {any} */ m) => m.content)
    ).toEqual(['记住我', '第二问'])
  })

  it('多会话：新建/切换/删除，各会话上下文独立', async () => {
    const store = useAiChatStore()
    store.updateConfig({ ...FULL_CONFIG })

    await store.send('第一场对话')
    const firstId = store.activeSessionId
    const firstMessageCount = store.messages.length

    store.newSession()
    expect(store.activeSessionId).not.toBe(firstId)
    expect(store.messages).toHaveLength(0)

    await store.send('第二场对话')
    const secondId = store.activeSessionId
    expect(secondId).not.toBe(firstId)

    // 切回第一场：历史消息与上下文都在
    expect(store.switchSession(firstId)).toBe(true)
    expect(store.messages).toHaveLength(firstMessageCount)
    await store.send('回到第一场继续')
    let call = runChatCompletionMock.mock.calls.at(-1)[0]
    expect(call.messages.filter((/** @type {any} */ m) => m.role === 'user').map((/** @type {any} */ m) => m.content))
      .toEqual(['第一场对话', '回到第一场继续'])

    // 删除当前会话 → 自动落到剩余会话
    store.deleteSession(firstId)
    expect(store.activeSessionId).toBe(secondId)
    expect(store.sessions).toHaveLength(1)

    // 切换到不存在的会话返回 false
    expect(store.switchSession('nope')).toBe(false)
  })

  it('旧版单会话数据（goods_ai_chat_history）自动迁移为会话', async () => {
    localStorage.setItem('goods_ai_chat_history', JSON.stringify({
      messages: [
        { id: 'm1', role: 'user', content: '旧消息' },
        { id: 'm2', role: 'assistant', content: '旧回复', steps: [] }
      ],
      convo: [
        { role: 'user', content: '旧消息' },
        { role: 'assistant', content: '旧回复' }
      ]
    }))

    setActivePinia(createPinia())
    const store = useAiChatStore()
    expect(store.sessions).toHaveLength(1)
    expect(store.messages.at(-1).content).toBe('旧回复')
    expect(localStorage.getItem('goods_ai_chat_sessions')).toBeNull() // 未落盘前不写新 key
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
