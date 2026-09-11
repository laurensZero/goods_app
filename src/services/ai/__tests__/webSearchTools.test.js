import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createWebSearchToolHandlers, WEB_SEARCH_TOOL_DEFINITIONS } from '../webSearchTools'

const { capacitorHttpMock } = vi.hoisted(() => ({
  capacitorHttpMock: { request: vi.fn() }
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
  CapacitorHttp: capacitorHttpMock
}))

describe('webSearchTools', () => {
  beforeEach(() => {
    capacitorHttpMock.request.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('导出 web_search 工具定义', () => {
    expect(WEB_SEARCH_TOOL_DEFINITIONS).toHaveLength(1)
    expect(WEB_SEARCH_TOOL_DEFINITIONS[0].name).toBe('web_search')
    expect(WEB_SEARCH_TOOL_DEFINITIONS[0].inputSchema.required).toEqual(['query'])
  })

  it('未配置 searchApiKey 时返回 needsSetup 引导（不抛错）', async () => {
    const handlers = createWebSearchToolHandlers({ getConfig: () => ({ searchApiKey: '' }) })
    const result = await handlers.web_search({ query: '初音' })
    expect(result.unavailable).toBe(true)
    expect(result.needsSetup).toBe(true)
    expect(result.resultCount).toBe(0)
    expect(result.guide).toMatch(/Tavily|ai_service/)
    expect(capacitorHttpMock.request).not.toHaveBeenCalled()
  })

  it('query 为空时抛错', async () => {
    const handlers = createWebSearchToolHandlers({ getConfig: () => ({ searchApiKey: 'tvly-x' }) })
    await expect(handlers.web_search({ query: '  ' })).rejects.toThrow('query 必填')
  })

  it('调用 Tavily 并映射结果字段', async () => {
    capacitorHttpMock.request.mockResolvedValue({
      status: 200,
      data: {
        results: [
          { title: '初音未来 15 周年', url: 'https://example.com/a', content: '发售情报…', score: 0.9 },
          { title: '无关结果', url: 'https://example.com/b', content: 'x'.repeat(1000) }
        ]
      }
    })
    const handlers = createWebSearchToolHandlers({ getConfig: () => ({ searchApiKey: 'tvly-secret' }) })
    const result = await handlers.web_search({ query: '初音未来 谷子 发售' })

    expect(result.query).toBe('初音未来 谷子 发售')
    expect(result.resultCount).toBe(2)
    expect(result.results[0]).toEqual({
      title: '初音未来 15 周年',
      url: 'https://example.com/a',
      content: '发售情报…'
    })
    // 内容截断
    expect(result.results[1].content.length).toBe(800)

    const call = capacitorHttpMock.request.mock.calls[0][0]
    expect(call.url).toBe('https://api.tavily.com/search')
    expect(call.headers.Authorization).toBe('Bearer tvly-secret')
    expect(call.data.query).toBe('初音未来 谷子 发售')
    expect(call.data.max_results).toBe(5)
  })

  it('HTTP 错误透出可读信息', async () => {
    capacitorHttpMock.request.mockResolvedValue({
      status: 401,
      data: { detail: 'Invalid API key' }
    })
    const handlers = createWebSearchToolHandlers({ getConfig: () => ({ searchApiKey: 'bad' }) })
    await expect(handlers.web_search({ query: 'x' })).rejects.toThrow(/HTTP 401.*Invalid API key/)
  })
})
