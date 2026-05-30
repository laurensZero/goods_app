import { describe, it, expect, vi } from 'vitest'
import { syncFieldValue, syncFieldValueNextFrame } from '../fieldValue'

describe('syncFieldValue', () => {
  it('assigns event value to target key', () => {
    const target = {}
    const event = { target: { value: 'hello' } }
    syncFieldValue(target, 'name', event)
    expect(target.name).toBe('hello')
  })

  it('trims value when trim option is true', () => {
    const target = {}
    const event = { target: { value: '  hello  ' } }
    syncFieldValue(target, 'name', event, { trim: true })
    expect(target.name).toBe('hello')
  })

  it('does not trim by default', () => {
    const target = {}
    const event = { target: { value: '  hello  ' } }
    syncFieldValue(target, 'name', event)
    expect(target.name).toBe('  hello  ')
  })

  it('converts value to string', () => {
    const target = {}
    const event = { target: { value: 42 } }
    syncFieldValue(target, 'name', event)
    expect(target.name).toBe('42')
  })

  it('handles null value', () => {
    const target = {}
    const event = { target: { value: null } }
    syncFieldValue(target, 'name', event)
    expect(target.name).toBe('')
  })

  it('does nothing when event has no target', () => {
    const target = { name: 'original' }
    syncFieldValue(target, 'name', {})
    expect(target.name).toBe('original')
  })

  it('does nothing for null event', () => {
    const target = { name: 'original' }
    syncFieldValue(target, 'name', null)
    expect(target.name).toBe('original')
  })
})

describe('syncFieldValueNextFrame', () => {
  it('calls syncFieldValue in next animation frame', () => {
    vi.useFakeTimers()
    const target = {}
    const event = { target: { value: 'delayed' } }

    // Mock requestAnimationFrame
    const originalRAF = globalThis.requestAnimationFrame
    globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0)

    syncFieldValueNextFrame(target, 'name', event)
    expect(target.name).toBeUndefined()

    vi.advanceTimersByTime(10)
    expect(target.name).toBe('delayed')

    globalThis.requestAnimationFrame = originalRAF
    vi.useRealTimers()
  })
})
