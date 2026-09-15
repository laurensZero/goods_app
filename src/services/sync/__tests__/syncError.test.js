vi.mock('@/locales', () => ({
  default: {
    global: {
      locale: { value: 'zh-CN' },
      t: (key, params) => params ? `${key}:${JSON.stringify(params)}` : key
    }
  }
}))

import { describe, it, expect, vi } from 'vitest'
import {
  SyncError,
  wrapSyncError,
  buildSyncErrorStatus,
  PHASE_PULL,
  PHASE_PUSH,
  CAUSE_NETWORK,
  CAUSE_AUTH,
  CAUSE_RATE_LIMIT,
  CAUSE_SERVER,
  CAUSE_DATA_FORMAT,
  CAUSE_UNKNOWN
} from '../syncError'

describe('SyncError', () => {
  it('creates error with all fields', () => {
    const err = new SyncError({
      message: 'test error',
      phase: PHASE_PULL,
      cause: CAUSE_NETWORK,
      retryable: true,
      suggestion: 'check network'
    })
    expect(err.message).toBe('test error')
    expect(err.phase).toBe(PHASE_PULL)
    expect(err.cause).toBe(CAUSE_NETWORK)
    expect(err.retryable).toBe(true)
    expect(err.suggestion).toBe('check network')
    expect(err.name).toBe('SyncError')
    expect(err).toBeInstanceOf(Error)
  })
})

describe('wrapSyncError', () => {
  it('re-throws SyncError as-is', () => {
    const original = new SyncError({ message: 'original', phase: PHASE_PULL, cause: CAUSE_AUTH, retryable: false })
    expect(() => wrapSyncError(original, PHASE_PUSH)).toThrow(original)
  })

  it('classifies auth errors (401)', () => {
    try {
      wrapSyncError({ message: '401 unauthorized', status: 401 }, PHASE_PULL)
    } catch (err) {
      expect(err).toBeInstanceOf(SyncError)
      expect(err.cause).toBe(CAUSE_AUTH)
      expect(err.retryable).toBe(false)
      expect(err.phase).toBe(PHASE_PULL)
      return
    }
    throw new Error('should have thrown')
  })

  it('classifies auth errors (token)', () => {
    try {
      wrapSyncError({ message: 'bad token' }, PHASE_PUSH)
    } catch (err) {
      expect(err.cause).toBe(CAUSE_AUTH)
      return
    }
    throw new Error('should have thrown')
  })

  it('classifies rate limit errors', () => {
    try {
      wrapSyncError({ message: '429 rate limit exceeded' }, PHASE_PUSH)
    } catch (err) {
      expect(err.cause).toBe(CAUSE_RATE_LIMIT)
      expect(err.retryable).toBe(true)
      return
    }
    throw new Error('should have thrown')
  })

  it('classifies server errors (500)', () => {
    try {
      wrapSyncError({ message: '500 internal server error' }, PHASE_PUSH)
    } catch (err) {
      expect(err.cause).toBe(CAUSE_SERVER)
      expect(err.retryable).toBe(true)
      return
    }
    throw new Error('should have thrown')
  })

  it('classifies network errors', () => {
    try {
      wrapSyncError({ name: 'TypeError', message: 'Failed to fetch' }, PHASE_PULL)
    } catch (err) {
      expect(err.cause).toBe(CAUSE_NETWORK)
      expect(err.retryable).toBe(true)
      return
    }
    throw new Error('should have thrown')
  })

  it('classifies timeout errors', () => {
    try {
      wrapSyncError({ message: 'timeout exceeded' }, PHASE_PULL)
    } catch (err) {
      expect(err.cause).toBe(CAUSE_NETWORK)
      return
    }
    throw new Error('should have thrown')
  })

  it('classifies JSON errors as data format', () => {
    try {
      wrapSyncError({ message: 'JSON parse error' }, PHASE_PULL)
    } catch (err) {
      expect(err.cause).toBe(CAUSE_DATA_FORMAT)
      expect(err.retryable).toBe(false)
      return
    }
    throw new Error('should have thrown')
  })

  it('classifies unknown errors', () => {
    try {
      wrapSyncError({ message: 'something weird' }, PHASE_PULL)
    } catch (err) {
      expect(err.cause).toBe(CAUSE_UNKNOWN)
      expect(err.retryable).toBe(false)
      return
    }
    throw new Error('should have thrown')
  })
})

describe('buildSyncErrorStatus', () => {
  it('builds status string from SyncError', () => {
    const err = new SyncError({
      message: 'fail',
      phase: PHASE_PULL,
      cause: CAUSE_NETWORK,
      retryable: true,
      suggestion: 'check network'
    })
    const status = buildSyncErrorStatus(err)
    expect(typeof status).toBe('string')
    expect(status.length).toBeGreaterThan(0)
  })
})
