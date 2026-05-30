import { describe, it, expect } from 'vitest'
import { createSyncBackendAdapter } from '../syncBackendAdapter'

describe('createSyncBackendAdapter', () => {
  const fullImpl = {
    ensureDataGist: () => {},
    ensureImageGist: () => {},
    ensureRechargeGist: () => {},
    ensureEventGist: () => {},
    getExistingImageGist: () => {},
    getExistingRechargeGist: () => {},
    getExistingEventGist: () => {},
    readJson: () => {},
    readImage: () => {},
    writeData: () => {},
    writeImages: () => {},
    getManifest: () => {}
  }

  it('returns impl when all methods are present', () => {
    const adapter = createSyncBackendAdapter(fullImpl)
    expect(adapter).toBe(fullImpl)
  })

  it('throws when a required method is missing', () => {
    const { readJson, ...incomplete } = fullImpl
    expect(() => createSyncBackendAdapter(incomplete)).toThrow('missing required method: readJson')
  })

  it('throws when multiple methods are missing', () => {
    expect(() => createSyncBackendAdapter({})).toThrow()
  })

  it('throws when method is not a function', () => {
    expect(() => createSyncBackendAdapter({ ...fullImpl, readJson: 'not a function' })).toThrow()
  })

  it('accepts extra methods beyond required ones', () => {
    const impl = { ...fullImpl, extraMethod: () => {} }
    const adapter = createSyncBackendAdapter(impl)
    expect(adapter.extraMethod).toBeDefined()
  })
})
