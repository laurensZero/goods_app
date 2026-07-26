import { describe, it, expect, beforeEach } from 'vitest'
import {
  appLog,
  createLogger,
  getBufferedLogs,
  flushLogBuffer,
  redactSensitiveText
} from '../logger'

describe('logger 统一缓冲', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('appLog 写入缓冲并携带级别与数据', () => {
    const before = getBufferedLogs().length
    appLog('info', 'test-event', { count: 3 })
    const logs = getBufferedLogs()
    expect(logs.length).toBe(before + 1)
    const last = logs[logs.length - 1]
    expect(last.level).toBe('info')
    expect(last.scope).toBe('app')
    expect(last.message).toContain('test-event')
    expect(last.message).toContain('"count":3')
    expect(last.time).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('非法级别归一化为 info', () => {
    appLog('bogus', 'weird-level')
    const last = getBufferedLogs().at(-1)
    expect(last.level).toBe('info')
  })

  it('createLogger 的 warn/error 入缓冲，debug 不入', () => {
    const log = createLogger('test-scope')
    const before = getBufferedLogs().length
    log.warn('warn-event', { a: 1 })
    log.error('error-event', new Error('boom'))
    log.debug('debug-event')
    const logs = getBufferedLogs()
    const added = logs.slice(before)
    const levels = added.map((entry) => entry.level)
    expect(levels).toContain('warn')
    expect(levels).toContain('error')
    expect(added.some((entry) => entry.message.includes('debug-event'))).toBe(false)
    const errorEntry = added.find((entry) => entry.level === 'error' && entry.scope === 'test-scope')
    expect(errorEntry.message).toContain('error-event')
    expect(errorEntry.stack).toBeTruthy()
  })

  it('console.error 被劫持后入缓冲', () => {
    const before = getBufferedLogs().length
    console.error('hijack-check', new Error('from-console'))
    const logs = getBufferedLogs()
    expect(logs.length).toBeGreaterThan(before)
    const last = logs[logs.length - 1]
    expect(last.scope).toBe('console')
    expect(last.message).toContain('hijack-check')
  })

  it('缓冲内容脱敏 token 等敏感信息', () => {
    appLog('error', 'request failed token=abc123secret')
    const last = getBufferedLogs().at(-1)
    expect(last.message).not.toContain('abc123secret')
    expect(last.message).toContain('[redacted]')
  })

  it('flushLogBuffer 将缓冲落盘 localStorage', () => {
    appLog('info', 'persist-check')
    flushLogBuffer()
    const raw = localStorage.getItem('goods-app:log-buffer-v1')
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw)
    expect(Array.isArray(parsed.entries)).toBe(true)
    expect(parsed.entries.some((entry) => entry.message.includes('persist-check'))).toBe(true)
    expect(parsed.savedAt).toBeTruthy()
  })

  it('redactSensitiveText 仍可独立使用', () => {
    expect(redactSensitiveText('cookie: session=xyz')).toContain('[redacted]')
  })
})
