import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  draftStore: new Map(),
  saveBatchDrafts: vi.fn(),
  refreshActive: vi.fn()
}))

vi.mock('@/utils/db', () => ({
  getAllBatchDrafts: vi.fn(async () => [...mocks.draftStore.values()]),
  saveBatchDrafts: vi.fn(async (drafts) => {
    mocks.saveBatchDrafts(drafts)
    for (const d of drafts) {
      mocks.draftStore.set(d.slot, { ...d })
    }
  })
}))

vi.mock('@/composables/batch/useBatchQueue', () => ({
  refreshActiveSlotFromDb: mocks.refreshActive
}))

import { mergeBatchDraftsFromRemote } from '../syncPullPipeline'

describe('mergeBatchDraftsFromRemote', () => {
  beforeEach(() => {
    mocks.draftStore.clear()
    mocks.saveBatchDrafts.mockClear()
    mocks.refreshActive.mockClear()
  })

  it('inserts missing remote draft', async () => {
    const applied = await mergeBatchDraftsFromRemote([
      { slot: 'collection', batchId: 'b1', isWishlist: false, items: [{ id: 'a' }], updatedAt: 100 }
    ])
    expect(applied).toBe(1)
    expect(mocks.draftStore.get('collection').items).toHaveLength(1)
    expect(mocks.draftStore.get('collection').deleted).toBe(false)
  })

  it('applies remote when newer (LWW)', async () => {
    mocks.draftStore.set('collection', {
      slot: 'collection', items: [{ id: 'old' }], deleted: false, updatedAt: 50
    })
    const applied = await mergeBatchDraftsFromRemote([
      { slot: 'collection', items: [{ id: 'new' }], deleted: false, updatedAt: 80 }
    ])
    expect(applied).toBe(1)
    expect(mocks.draftStore.get('collection').items[0].id).toBe('new')
  })

  it('keeps local when local is newer', async () => {
    mocks.draftStore.set('collection', {
      slot: 'collection', items: [{ id: 'local' }], deleted: false, updatedAt: 200
    })
    const applied = await mergeBatchDraftsFromRemote([
      { slot: 'collection', items: [{ id: 'remote' }], deleted: false, updatedAt: 100 }
    ])
    expect(applied).toBe(0)
    expect(mocks.draftStore.get('collection').items[0].id).toBe('local')
  })

  it('applies remote tombstone when remote deleted is newer', async () => {
    mocks.draftStore.set('collection', {
      slot: 'collection', items: [{ id: 'x' }], deleted: false, updatedAt: 50
    })
    const applied = await mergeBatchDraftsFromRemote([
      { slot: 'collection', items: [], deleted: true, updatedAt: 90 }
    ])
    expect(applied).toBe(1)
    expect(mocks.draftStore.get('collection').deleted).toBe(true)
    expect(mocks.draftStore.get('collection').items).toHaveLength(0)
  })

  it('skips identical tombstone timestamps (overlap window idempotent)', async () => {
    mocks.draftStore.set('collection', {
      slot: 'collection', items: [], deleted: true, updatedAt: 90
    })
    const applied = await mergeBatchDraftsFromRemote([
      { slot: 'collection', items: [], deleted: true, updatedAt: 90 }
    ])
    expect(applied).toBe(0)
  })
})
