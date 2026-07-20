import { describe, it, expect, vi, beforeEach } from 'vitest'

// Stub platform storage
vi.mock('@/utils/platform/storage', () => ({ writePersisted: vi.fn() }))

// Stub logger
vi.mock('@/utils/logger', () => ({ createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn() }) }))

import { mergeToLocal } from '../syncPullPipeline'

function makeItem(id, updatedAt) {
  return { id, name: `item-${id}`, updatedAt, quantity: 1 }
}

function makeStores(localGoods = [], localTrash = []) {
  return {
    goodsStore: {
      list: localGoods,
      trashList: localTrash,
      importGoodsBackup: vi.fn(),
      updateGoodsBackup: vi.fn(),
      importTrashBackup: vi.fn(),
      updateTrashBackup: vi.fn(),
      deleteGoodsPermanently: vi.fn(),
      deleteTrashItem: vi.fn()
    },
    rechargeStore: { importBackup: vi.fn() },
    eventsStore: { importEventsBackup: vi.fn() },
    goodsGroupStore: { updateGroupsBackup: vi.fn() },
    presetsStore: { replacePresetsSnapshot: vi.fn() }
  }
}

describe('mergeToLocal reconcile', () => {
  it('deletes local-only items whose updatedAt <= localSyncTime', async () => {
    const local = [makeItem('a', 100), makeItem('b', 200)]
    const remote = { goods: [makeItem('a', 150)], trash: [] }
    const stores = makeStores(local)

    await mergeToLocal(stores, remote, { reconcileMissing: true, localSyncTime: 200 })

    expect(stores.goodsStore.deleteGoodsPermanently).toHaveBeenCalledWith(
      expect.arrayContaining(['b'])
    )
  })

  it('preserves local-only items whose updatedAt > localSyncTime', async () => {
    const local = [makeItem('a', 100), makeItem('b', 300)]
    const remote = { goods: [makeItem('a', 150)], trash: [] }
    const stores = makeStores(local)

    await mergeToLocal(stores, remote, { reconcileMissing: true, localSyncTime: 200 })

    expect(stores.goodsStore.deleteGoodsPermanently).not.toHaveBeenCalled()
  })

  it('preserves all local items when localSyncTime is 0 (never synced)', async () => {
    const local = [makeItem('a', 100), makeItem('b', 50)]
    const remote = { goods: [makeItem('a', 200)], trash: [] }
    const stores = makeStores(local)

    await mergeToLocal(stores, remote, { reconcileMissing: true, localSyncTime: 0 })

    expect(stores.goodsStore.deleteGoodsPermanently).not.toHaveBeenCalled()
  })

  it('does not delete when reconcileMissing is false', async () => {
    const local = [makeItem('a', 100), makeItem('b', 50)]
    const remote = { goods: [makeItem('a', 200)], trash: [] }
    const stores = makeStores(local)

    await mergeToLocal(stores, remote, { reconcileMissing: false, localSyncTime: 200 })

    expect(stores.goodsStore.deleteGoodsPermanently).not.toHaveBeenCalled()
  })

  it('deletes local-only trash items whose updatedAt <= localSyncTime', async () => {
    const localGoods = [makeItem('a', 100)]
    const localTrash = [makeItem('t1', 100), makeItem('t2', 300)]
    const remote = { goods: [makeItem('a', 150)], trash: [] }
    const stores = makeStores(localGoods, localTrash)

    await mergeToLocal(stores, remote, { reconcileMissing: true, localSyncTime: 200 })

    expect(stores.goodsStore.deleteTrashItem).toHaveBeenCalledWith('t1')
    expect(stores.goodsStore.deleteTrashItem).not.toHaveBeenCalledWith('t2')
  })

  it('preserves local items not in remote when localSyncTime < item timestamp', async () => {
    const local = [makeItem('never-synced', 500)]
    const remote = { goods: [], trash: [] }
    const stores = makeStores(local)

    await mergeToLocal(stores, remote, { reconcileMissing: true, localSyncTime: 400 })

    expect(stores.goodsStore.deleteGoodsPermanently).not.toHaveBeenCalled()
  })
})
