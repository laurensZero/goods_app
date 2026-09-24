import { describe, it, expect } from 'vitest'
import { compactConvo, serializeToolResult, estimateConvoChars } from '../contextCompact'

describe('contextCompact', () => {
  it('serializeToolResult 超长截断并标记', () => {
    const big = { items: Array.from({ length: 50 }, (_, i) => ({ id: i, name: 'x'.repeat(80) })) }
    const out = serializeToolResult(big, 200)
    expect(out.length).toBeLessThanOrEqual(220)
    expect(out).toContain('[已截断]')
  })

  it('serializeToolResult 短结果原样保留', () => {
    expect(serializeToolResult({ ok: true }, 200)).toBe('{"ok":true}')
    expect(serializeToolResult(null, 200)).toBe('null')
  })

  it('compactConvo 清空旧 tool 结果、保留最近一轮完整结果', () => {
    const convo = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'q1' },
      { role: 'assistant', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'a', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 'c1', content: 'OLD_RESULT_A' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'q2' },
      { role: 'assistant', tool_calls: [{ id: 'c2', type: 'function', function: { name: 'b', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 'c2', content: 'NEW_RESULT_B' },
      { role: 'assistant', content: 'a2' }
    ]
    const out = compactConvo(convo, { keepRecentToolRounds: 1 })
    const tools = out.filter((m) => m.role === 'tool')
    expect(tools[0].content).not.toContain('OLD_RESULT_A')
    expect(tools[0].content).toContain('已省略')
    expect(tools[1].content).toBe('NEW_RESULT_B')
    // 结构保持：assistant.tool_calls 仍在
    expect(out.some((m) => m.role === 'assistant' && Array.isArray(m.tool_calls))).toBe(true)
  })

  it('estimateConvoChars 统计 content+tool_calls 长度', () => {
    const chars = estimateConvoChars([
      { role: 'user', content: 'abcd' },
      { role: 'assistant', content: 'ef', tool_calls: [{ id: '1', type: 'function', function: { name: 'x', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: '1', content: 'ghi' }
    ])
    expect(chars).toBeGreaterThanOrEqual(4 + 2 + 3)
  })
})
