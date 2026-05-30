import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { withTimeout, withRetry } from '../syncRetry'
import { SyncError } from '../syncError'

// Suppress console.warn from withRetry's retry logging
let warnSpy
beforeEach(() => { warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {}) })
afterEach(() => { warnSpy.mockRestore() })

describe('withTimeout', () => {
  it('resolves when fn completes in time', async () => {
    const fn = () => Promise.resolve('ok')
    const result = await withTimeout(fn, 1000)
    expect(result).toBe('ok')
  })

  it('rejects when fn takes too long', async () => {
    vi.useFakeTimers()
    const fn = () => new Promise((resolve) => setTimeout(() => resolve('late'), 5000))
    const promise = withTimeout(fn, 1000)

    vi.advanceTimersByTime(1100)
    await expect(promise).rejects.toThrow('超时')

    vi.useRealTimers()
  })

  it('propagates fn rejection', async () => {
    const fn = () => Promise.reject(new Error('fn error'))
    await expect(withTimeout(fn, 1000)).rejects.toThrow('fn error')
  })
})

describe('withRetry', () => {
  it('returns result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    const result = await withRetry(fn, { maxRetries: 2 })
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries on retryable error then succeeds', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValue('ok')
    const result = await withRetry(fn, { maxRetries: 2, baseDelay: 1 })
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('throws immediately on non-retryable error', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('validation failed'))
    await expect(withRetry(fn, { maxRetries: 2, baseDelay: 1 })).rejects.toThrow('validation failed')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('throws after max retries exceeded', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('timeout'))
    await expect(withRetry(fn, { maxRetries: 2, baseDelay: 1 })).rejects.toThrow('timeout')
    expect(fn).toHaveBeenCalledTimes(3) // initial + 2 retries
  })

  it('retries on SyncError with retryable=true', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new SyncError({ message: 'fail', retryable: true, cause: 'network' }))
      .mockResolvedValue('ok')
    const result = await withRetry(fn, { maxRetries: 2, baseDelay: 1 })
    expect(result).toBe('ok')
  })

  it('does not retry on SyncError with retryable=false', async () => {
    const fn = vi.fn()
      .mockRejectedValue(new SyncError({ message: 'auth fail', retryable: false, cause: 'auth' }))
    await expect(withRetry(fn, { maxRetries: 2, baseDelay: 1 })).rejects.toThrow()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('respects abort signal', async () => {
    const controller = new AbortController()
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValue('ok')

    const promise = withRetry(fn, { maxRetries: 2, baseDelay: 10000, signal: controller.signal })
    controller.abort()

    await expect(promise).rejects.toThrow()
  })

  it('retries on 5xx error messages', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('502 Bad Gateway'))
      .mockResolvedValue('ok')
    const result = await withRetry(fn, { maxRetries: 2, baseDelay: 1 })
    expect(result).toBe('ok')
  })

  it('retries on rate limit errors', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('429 Too Many Requests'))
      .mockResolvedValue('ok')
    const result = await withRetry(fn, { maxRetries: 2, baseDelay: 1 })
    expect(result).toBe('ok')
  })
})
