vi.mock('@/utils/platform/storage', () => {
  const store = new Map()
  return {
    readPersisted: async (key, fallback = null) => store.get(key) ?? fallback,
    writePersisted: async (key, value) => { store.set(key, value) },
    removePersisted: async (key) => { store.delete(key) },
    _store: store
  }
})

import { describe, it, expect, beforeEach } from 'vitest'
import { readSyncKey, writeSyncKey, readOrCreateDeviceId } from '../storage'
import { _store } from '@/utils/platform/storage'

describe('readSyncKey', () => {
  beforeEach(() => {
    _store.clear()
  })

  it('reads existing value', async () => {
    _store.set('test-key', 'test-value')
    expect(await readSyncKey('test-key')).toBe('test-value')
  })

  it('returns null for missing key', async () => {
    expect(await readSyncKey('missing')).toBeNull()
  })
})

describe('writeSyncKey', () => {
  beforeEach(() => {
    _store.clear()
  })

  it('writes value', async () => {
    await writeSyncKey('key', 'value')
    expect(_store.get('key')).toBe('value')
  })

  it('writes empty string for null value', async () => {
    await writeSyncKey('key', null)
    expect(_store.get('key')).toBe('')
  })
})

describe('readOrCreateDeviceId', () => {
  beforeEach(() => {
    _store.clear()
  })

  it('returns existing id', async () => {
    _store.set('device-id', 'existing-id')
    const result = await readOrCreateDeviceId('device-id', () => 'new-id')
    expect(result).toBe('existing-id')
  })

  it('creates and stores new id when missing', async () => {
    const result = await readOrCreateDeviceId('device-id', () => 'generated-id')
    expect(result).toBe('generated-id')
    expect(_store.get('device-id')).toBe('generated-id')
  })

  it('calls generateDeviceId only when needed', async () => {
    const generator = () => 'should-not-be-called'
    _store.set('device-id', 'existing')
    await readOrCreateDeviceId('device-id', generator)
    // generator was not called, id came from storage
    expect(_store.get('device-id')).toBe('existing')
  })
})
