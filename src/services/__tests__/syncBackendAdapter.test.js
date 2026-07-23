import { describe, it, expect } from 'vitest'
import { createSyncBackendAdapter } from '../syncBackendAdapter'

describe('createSyncBackendAdapter', () => {
  const fullImpl = {
    ensureImageCloud: () => {},
    getExistingImageCloud: () => {},
    readImage: () => {},
    writeImages: () => {},
    getImagePublicUrl: () => {},
    pushAll: () => {},
    pullAll: () => {},
    getDb: () => {}
  }

  it('returns impl when all methods are present', () => {
    const adapter = createSyncBackendAdapter(fullImpl)
    expect(adapter).toBe(fullImpl)
  })

  it('throws when a required method is missing', () => {
    const { pushAll, ...incomplete } = fullImpl
    expect(() => createSyncBackendAdapter(incomplete)).toThrow('missing required method: pushAll')
  })

  it('throws when multiple methods are missing', () => {
    expect(() => createSyncBackendAdapter({})).toThrow()
  })

  it('throws when method is not a function', () => {
    expect(() => createSyncBackendAdapter({ ...fullImpl, pushAll: 'not a function' })).toThrow()
  })

  it('accepts extra methods beyond required ones', () => {
    const impl = { ...fullImpl, extraMethod: () => {} }
    const adapter = createSyncBackendAdapter(impl)
    expect(adapter.extraMethod).toBeDefined()
  })
})
