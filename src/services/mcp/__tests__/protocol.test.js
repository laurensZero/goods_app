import { describe, it, expect } from 'vitest'
import { createMcpRequestHandler, McpUnknownToolError } from '../protocol'

/** 组装一个测试用 handler：两个工具（echo 成功 / boom 抛错） */
function createTestHandler() {
  return createMcpRequestHandler({
    serverInfo: { name: 'test-server', version: '0.0.1' },
    instructions: 'test instructions',
    listTools: () => [
      { name: 'echo', description: 'echo back', inputSchema: { type: 'object' } },
      { name: 'boom', description: 'always fails', inputSchema: { type: 'object' } }
    ],
    callTool: async (name, args) => {
      if (name === 'echo') return { name, ...args }
      if (name === 'boom') throw new Error('工具内部爆炸')
      throw new McpUnknownToolError(name)
    }
  })
}

describe('mcp protocol handler', () => {
  it('initialize 返回协议版本与能力，并协商客户端请求的版本', async () => {
    const handler = createTestHandler()
    const { status, body } = await handler.handleRaw(JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-03-26', clientInfo: { name: 'client', version: '1' } }
    }))
    expect(status).toBe(200)
    expect(body.result.protocolVersion).toBe('2025-03-26')
    expect(body.result.capabilities.tools).toEqual({ listChanged: false })
    expect(body.result.serverInfo).toEqual({ name: 'test-server', version: '0.0.1' })
    expect(body.result.instructions).toBe('test instructions')
  })

  it('initialize 版本不支持时回退到最新支持版本', async () => {
    const handler = createTestHandler()
    const { body } = await handler.handleRaw(JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '1999-01-01' }
    }))
    expect(body.result.protocolVersion).toBe('2025-06-18')
  })

  it('ping 返回空 result', async () => {
    const handler = createTestHandler()
    const { status, body } = await handler.handleRaw(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'ping' }))
    expect(status).toBe(200)
    expect(body.result).toEqual({})
  })

  it('tools/list 返回工具定义', async () => {
    const handler = createTestHandler()
    const { body } = await handler.handleRaw(JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/list' }))
    expect(body.result.tools).toHaveLength(2)
    expect(body.result.tools[0].name).toBe('echo')
  })

  it('tools/call 成功时返回 text content', async () => {
    const handler = createTestHandler()
    const { body } = await handler.handleRaw(JSON.stringify({
      jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'echo', arguments: { a: 1 } }
    }))
    expect(body.result.isError).toBe(false)
    expect(JSON.parse(body.result.content[0].text)).toEqual({ name: 'echo', a: 1 })
  })

  it('tools/call 工具抛错时返回 isError 结果而非协议错误', async () => {
    const handler = createTestHandler()
    const { status, body } = await handler.handleRaw(JSON.stringify({
      jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'boom' }
    }))
    expect(status).toBe(200)
    expect(body.result.isError).toBe(true)
    expect(body.result.content[0].text).toContain('工具内部爆炸')
  })

  it('tools/call 未知工具返回 -32602', async () => {
    const handler = createTestHandler()
    const { body } = await handler.handleRaw(JSON.stringify({
      jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'nope' }
    }))
    expect(body.error.code).toBe(-32602)
  })

  it('tools/call 缺少工具名返回 -32602', async () => {
    const handler = createTestHandler()
    const { body } = await handler.handleRaw(JSON.stringify({
      jsonrpc: '2.0', id: 7, method: 'tools/call', params: { arguments: {} }
    }))
    expect(body.error.code).toBe(-32602)
  })

  it('未知方法返回 -32601', async () => {
    const handler = createTestHandler()
    const { body } = await handler.handleRaw(JSON.stringify({ jsonrpc: '2.0', id: 8, method: 'resources/list' }))
    expect(body.error.code).toBe(-32601)
  })

  it('非 JSON 文本返回 -32700 解析错误', async () => {
    const handler = createTestHandler()
    const { status, body } = await handler.handleRaw('not-json')
    expect(status).toBe(400)
    expect(body.error.code).toBe(-32700)
  })

  it('通知（无 id）返回 202 且不携带 body，方法未知也不报错', async () => {
    const handler = createTestHandler()
    const initialized = await handler.handleRaw(JSON.stringify({
      jsonrpc: '2.0', method: 'notifications/initialized'
    }))
    expect(initialized).toEqual({ status: 202, body: null })

    const unknownNotice = await handler.handleRaw(JSON.stringify({
      jsonrpc: '2.0', method: 'notifications/whatever'
    }))
    expect(unknownNotice).toEqual({ status: 202, body: null })
  })

  it('批量请求返回响应数组，纯通知批量返回 202', async () => {
    const handler = createTestHandler()
    const { status, body } = await handler.handleRaw(JSON.stringify([
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 9, method: 'ping' }
    ]))
    expect(status).toBe(200)
    expect(body).toHaveLength(1)
    expect(body[0].id).toBe(9)

    const notices = await handler.handleRaw(JSON.stringify([
      { jsonrpc: '2.0', method: 'notifications/initialized' }
    ]))
    expect(notices).toEqual({ status: 202, body: null })
  })

  it('非法结构返回 -32600；无 id 的空对象按通知静默接受', async () => {
    const handler = createTestHandler()
    for (const raw of ['42', 'null', '"str"']) {
      const { body } = await handler.handleRaw(raw)
      expect(body.error.code).toBe(-32600)
    }
    // JSON-RPC 2.0：无 id 即通知，一律不回内容
    const emptyNotice = await handler.handleRaw('{}')
    expect(emptyNotice).toEqual({ status: 202, body: null })
  })
})
