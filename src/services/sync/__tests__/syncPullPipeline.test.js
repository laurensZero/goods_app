import { describe, it, expect, vi } from 'vitest'

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
      purgedTrashIds: new Set(),
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

  it('does not re-import a locally purged remote trash tombstone after its updatedAt changes', async () => {
    const stores = makeStores([], [])
    stores.goodsStore.purgedTrashIds = new Set(['gone'])
    const remote = { goods: [], trash: [makeItem('gone', 500)] }

    await mergeToLocal(stores, remote, { reconcileMissing: true, localSyncTime: 400 })

    expect(stores.goodsStore.importTrashBackup).not.toHaveBeenCalled()
    expect(stores.goodsStore.updateTrashBackup).not.toHaveBeenCalled()
  })
})

describe('mergeToLocal forceReapply（同步格式版本升级回填）', () => {
  it('forceReapply=true 时把该标记透传给 goods/trash/events/groups 的更新入口', async () => {
    const stores = makeStores()
    const remote = {
      goods: [makeItem('a', 100)],
      trash: [makeItem('t', 100)],
      events: [{ id: 'e1', updatedAt: 100 }],
      recharge: [{ id: 'r1', updatedAt: 100 }],
      groups: [{ id: 'g1', updatedAt: 100 }],
      groupItems: [{ id: 'gi1', updatedAt: 100 }]
    }

    await mergeToLocal(stores, remote, { forceReapply: true, reconcileMissing: false })

    expect(stores.goodsStore.updateGoodsBackup).toHaveBeenCalledWith(
      [makeItem('a', 100)],
      { forceReapply: true }
    )
    expect(stores.goodsStore.updateTrashBackup).toHaveBeenCalledWith(
      [makeItem('t', 100)],
      { forceReapply: true }
    )
    expect(stores.eventsStore.importEventsBackup).toHaveBeenCalledWith(
      [{ id: 'e1', updatedAt: 100 }],
      expect.objectContaining({ forceReapply: true })
    )
    expect(stores.goodsGroupStore.updateGroupsBackup).toHaveBeenCalledWith(
      [{ id: 'g1', updatedAt: 100 }],
      [{ id: 'gi1', updatedAt: 100 }],
      { forceReapply: true }
    )
    expect(stores.rechargeStore.importBackup).toHaveBeenCalledWith(
      [{ id: 'r1', updatedAt: 100 }],
      expect.objectContaining({ forceReapply: true })
    )
  })

  it('默认不传 forceReapply（保持既有 LWW 行为）', async () => {
    const stores = makeStores()
    const remote = {
      goods: [makeItem('a', 100)],
      trash: [],
      events: [{ id: 'e1', updatedAt: 100 }],
      recharge: [{ id: 'r1', updatedAt: 100 }],
      groups: [{ id: 'g1', updatedAt: 100 }],
      groupItems: [{ id: 'gi1', updatedAt: 100 }]
    }

    await mergeToLocal(stores, remote, { reconcileMissing: false })

    expect(stores.goodsStore.updateGoodsBackup).toHaveBeenCalledWith(
      [makeItem('a', 100)],
      { forceReapply: false }
    )
    expect(stores.goodsGroupStore.updateGroupsBackup).toHaveBeenCalledWith(
      [{ id: 'g1', updatedAt: 100 }],
      [{ id: 'gi1', updatedAt: 100 }],
      { forceReapply: false }
    )
    expect(stores.eventsStore.importEventsBackup).toHaveBeenCalledWith(
      [{ id: 'e1', updatedAt: 100 }],
      expect.objectContaining({ forceReapply: false })
    )
    expect(stores.rechargeStore.importBackup).toHaveBeenCalledWith(
      [{ id: 'r1', updatedAt: 100 }],
      expect.objectContaining({ forceReapply: false })
    )
  })
})
