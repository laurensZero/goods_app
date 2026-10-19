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
    presetsStore: { replacePresetsSnapshot: vi.fn() },
    collectionProfileStore: { applyRemoteProfiles: vi.fn() }
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

    expect(stores.goodsStore.importGoodsBackup).toHaveBeenCalledWith(
      [makeItem('a', 100)],
      { forceAlign: false }
    )
    expect(stores.goodsStore.updateGoodsBackup).toHaveBeenCalledWith(
      [makeItem('a', 100)],
      { forceReapply: true, forceAlign: false }
    )
    expect(stores.goodsStore.importTrashBackup).toHaveBeenCalledWith(
      [makeItem('t', 100)],
      { forceAlign: false }
    )
    expect(stores.goodsStore.updateTrashBackup).toHaveBeenCalledWith(
      [makeItem('t', 100)],
      { forceReapply: true, forceAlign: false }
    )
    expect(stores.eventsStore.importEventsBackup).toHaveBeenCalledWith(
      [{ id: 'e1', updatedAt: 100 }],
      expect.objectContaining({ forceReapply: true, forceAlign: false })
    )
    expect(stores.goodsGroupStore.updateGroupsBackup).toHaveBeenCalledWith(
      [{ id: 'g1', updatedAt: 100 }],
      [{ id: 'gi1', updatedAt: 100 }],
      { forceReapply: true, forceAlign: false }
    )
    expect(stores.rechargeStore.importBackup).toHaveBeenCalledWith(
      [{ id: 'r1', updatedAt: 100 }],
      expect.objectContaining({ forceReapply: true, forceAlign: false })
    )
  })

  it('forceAlign=true 时把该标记透传给 goods/trash/events/groups 的更新入口', async () => {
    const stores = makeStores()
    const remote = {
      goods: [makeItem('a', 100)],
      trash: [makeItem('t', 100)],
      events: [{ id: 'e1', updatedAt: 100 }],
      recharge: [{ id: 'r1', updatedAt: 100 }],
      groups: [{ id: 'g1', updatedAt: 100 }],
      groupItems: [{ id: 'gi1', updatedAt: 100 }]
    }

    await mergeToLocal(stores, remote, { forceAlign: true, reconcileMissing: false })

    expect(stores.goodsStore.importGoodsBackup).toHaveBeenCalledWith(
      [makeItem('a', 100)],
      { forceAlign: true }
    )
    expect(stores.goodsStore.updateGoodsBackup).toHaveBeenCalledWith(
      [makeItem('a', 100)],
      { forceReapply: false, forceAlign: true }
    )
    expect(stores.goodsStore.importTrashBackup).toHaveBeenCalledWith(
      [makeItem('t', 100)],
      { forceAlign: true }
    )
    expect(stores.goodsStore.updateTrashBackup).toHaveBeenCalledWith(
      [makeItem('t', 100)],
      { forceReapply: false, forceAlign: true }
    )
    expect(stores.eventsStore.importEventsBackup).toHaveBeenCalledWith(
      [{ id: 'e1', updatedAt: 100 }],
      expect.objectContaining({ forceAlign: true })
    )
    expect(stores.goodsGroupStore.updateGroupsBackup).toHaveBeenCalledWith(
      [{ id: 'g1', updatedAt: 100 }],
      [{ id: 'gi1', updatedAt: 100 }],
      { forceReapply: false, forceAlign: true }
    )
    expect(stores.rechargeStore.importBackup).toHaveBeenCalledWith(
      [{ id: 'r1', updatedAt: 100 }],
      expect.objectContaining({ forceAlign: true })
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
      { forceReapply: false, forceAlign: false }
    )
    expect(stores.goodsGroupStore.updateGroupsBackup).toHaveBeenCalledWith(
      [{ id: 'g1', updatedAt: 100 }],
      [{ id: 'gi1', updatedAt: 100 }],
      { forceReapply: false, forceAlign: false }
    )
    expect(stores.eventsStore.importEventsBackup).toHaveBeenCalledWith(
      [{ id: 'e1', updatedAt: 100 }],
      expect.objectContaining({ forceReapply: false, forceAlign: false })
    )
    expect(stores.rechargeStore.importBackup).toHaveBeenCalledWith(
      [{ id: 'r1', updatedAt: 100 }],
      expect.objectContaining({ forceReapply: false, forceAlign: false })
    )
  })
})

describe('mergeToLocal row-level presets', () => {
  it('应用远端预设行并按 sortOrder 生成兼容快照', async () => {
    const stores = makeStores()
    const remote = {
      goods: [],
      trash: [],
      presetRows: [
        { domain: 'category', id: 'A', payload: { name: 'A' }, sortOrder: 0, deleted: 0 }
      ],
      presetRowsTrash: [],
      collectionProfileRows: [],
      collectionProfileRowsTrash: []
    }

    await mergeToLocal(stores, remote, { reconcileMissing: false })

    expect(stores.presetsStore.replacePresetsSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ categoryItems: [{ name: 'A' }] }),
      { updatedAt: expect.any(Number) }
    )
  })

  it('行级删除使用 tombstone 移除本地预设', async () => {
    const stores = makeStores()
    const remote = {
      goods: [],
      trash: [],
      presetRows: [],
      presetRowsTrash: [{ domain: 'category', id: 'A', sortOrder: 0, deleted: 1 }],
      collectionProfileRows: [],
      collectionProfileRowsTrash: []
    }

    await mergeToLocal(stores, remote, { reconcileMissing: false })

    expect(stores.presetsStore.replacePresetsSnapshot).toHaveBeenCalled()
  })

  it('角色行按 (ip,name) 复合 id 归并，不产生「本地一条 + 远端一条」的重复', async () => {
    const stores = makeStores()
    // 本地只有名字（角色条目本身不带 id），远端行 id 是 A::小樱
    stores.presetsStore.characterItems = [{ name: '小樱', ip: 'A', fav: false }]
    const remote = {
      goods: [],
      trash: [],
      presetRows: [
        { domain: 'character', id: 'A::小樱', payload: { name: '小樱', ip: 'A', fav: false }, sortOrder: 0, deleted: 0 }
      ],
      presetRowsTrash: [],
      collectionProfileRows: [],
      collectionProfileRowsTrash: []
    }

    await mergeToLocal(stores, remote, { reconcileMissing: false })

    expect(stores.presetsStore.replacePresetsSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        characterItems: [{ name: '小樱', ip: 'A', fav: false }]
      }),
      { updatedAt: expect.any(Number) }
    )
  })

  it('同名角色分属不同 IP 时各自成行', async () => {
    const stores = makeStores()
    stores.presetsStore.characterItems = [
      { name: '小樱', ip: 'A', fav: false },
      { name: '小樱', ip: 'B', fav: false }
    ]
    const remote = {
      goods: [],
      trash: [],
      presetRows: [
        { domain: 'character', id: 'A::小樱', payload: { name: '小樱', ip: 'A' }, sortOrder: 0, deleted: 0 },
        { domain: 'character', id: 'B::小樱', payload: { name: '小樱', ip: 'B' }, sortOrder: 1, deleted: 0 }
      ],
      presetRowsTrash: [],
      collectionProfileRows: [],
      collectionProfileRowsTrash: []
    }

    await mergeToLocal(stores, remote, { reconcileMissing: false })

    expect(stores.presetsStore.replacePresetsSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        characterItems: [
          { name: '小樱', ip: 'A', fav: false },
          { name: '小樱', ip: 'B', fav: false }
        ]
      }),
      { updatedAt: expect.any(Number) }
    )
  })

  it('reconcileMissing 但行表只拉到增量（rowDomainsComplete=false）时，叠加合并、不得清空本地预设', async () => {
    // 回归：拉取远端（since=0 数据全量）曾用「远端全量」语义重建预设快照，但行表只按
    // 行水位增量拉；未变更的分类/自定义字段/活动类型被当成远端已删而清空。
    const stores = makeStores()
    stores.presetsStore.categoryItems = [{ name: '旧分类', fav: false }]
    const remote = {
      goods: [],
      trash: [],
      presetRows: [
        { domain: 'category', id: 'B', payload: { name: 'B' }, sortOrder: 0, deleted: 0 }
      ],
      presetRowsTrash: [],
      collectionProfileRows: [],
      collectionProfileRowsTrash: [],
      rowDomainsComplete: false
    }

    await mergeToLocal(stores, remote, { reconcileMissing: true })

    expect(stores.presetsStore.replacePresetsSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        categoryItems: [{ name: '旧分类', fav: false }, expect.objectContaining({ name: 'B' })]
      }),
      { updatedAt: expect.any(Number) }
    )
  })

  it('行表增量且没有拉到任何行时，reconcileMissing 也不重建快照（避免清空本地预设）', async () => {
    const stores = makeStores()
    stores.presetsStore.categoryItems = [{ name: '旧分类', fav: false }]
    const remote = {
      goods: [],
      trash: [],
      presetRows: [],
      presetRowsTrash: [],
      collectionProfileRows: [],
      collectionProfileRowsTrash: [],
      rowDomainsComplete: false
    }

    await mergeToLocal(stores, remote, { reconcileMissing: true })

    expect(stores.presetsStore.replacePresetsSnapshot).not.toHaveBeenCalled()
  })

  it('行表完整（rowDomainsComplete=true）且 reconcileMissing 时，空远端才允许清空本地预设', async () => {
    const stores = makeStores()
    stores.presetsStore.categoryItems = [{ name: '旧分类', fav: false }]
    const remote = {
      goods: [],
      trash: [],
      presetRows: [],
      presetRowsTrash: [],
      collectionProfileRows: [],
      collectionProfileRowsTrash: [],
      rowDomainsComplete: true
    }

    await mergeToLocal(stores, remote, { reconcileMissing: true })

    expect(stores.presetsStore.replacePresetsSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ categoryItems: [] }),
      { updatedAt: expect.any(Number) }
    )
  })

  it('应用 collection_profiles 行并保留角色背景 key 与图片引用', async () => {
    const stores = makeStores()
    const remote = {
      goods: [],
      trash: [],
      presetRows: [],
      presetRowsTrash: [],
      collectionProfileRows: [{
        id: '原神::沃雅妮莎',
        kind: 'character',
        items: [{ id: 'bg-1', kind: 'image', cloudFileName: 'profile-bg__bg-1__main.jpg' }],
        rotation: { mode: 'visit' },
        theme: { source: 'background' },
        updatedAt: Date.parse('2026-10-17T08:39:07.078Z'),
        deleted: 0
      }],
      collectionProfileRowsTrash: []
    }

    await mergeToLocal(stores, remote, { reconcileMissing: false, resolveProfileImage: (name) => `https://cdn/${name}` })

    expect(stores.collectionProfileStore.applyRemoteProfiles).toHaveBeenCalledWith({
      ipProfiles: {},
      characterProfiles: {
        '原神::沃雅妮莎': expect.objectContaining({
          items: [expect.objectContaining({
            cloudFileName: 'profile-bg__bg-1__main.jpg'
          })],
          updatedAt: Date.parse('2026-10-17T08:39:07.078Z')
        })
      }
    }, {
      resolveImageUrl: expect.any(Function),
      forceReapply: false,
      forceAlign: false
    })
  })
})

describe('mergeToLocal 角色星标（fav 存在角色条目上）', () => {
  function makePresetStores({ characters = [] } = {}) {
    const stores = makeStores()
    stores.presetsStore = {
      characterItems: characters,
      replacePresetsSnapshot: vi.fn()
    }
    return stores
  }

  it('增量拉取只带回一个变更为收藏的角色时，不清掉其它本地星标', async () => {
    // 回归：加星后自动同步只拉到变更过的那一行；收藏必须是条目自身的字段，
    // 未出现在增量里的角色保留本地 fav，不能被远端增量「反推」清空。
    const stores = makePresetStores({
      characters: [
        { name: '小樱', ip: 'A', fav: true },
        { name: '雪', ip: 'A', fav: true }
      ]
    })
    const remote = {
      goods: [],
      trash: [],
      presetRows: [
        { domain: 'character', id: 'A::新角色', payload: { name: '新角色', ip: 'A', fav: true }, sortOrder: 0, deleted: 0 }
      ],
      presetRowsTrash: [],
      rowDomainsComplete: false,
      collectionProfileRows: [],
      collectionProfileRowsTrash: []
    }

    await mergeToLocal(stores, remote, { reconcileMissing: false })

    expect(stores.presetsStore.replacePresetsSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        characterItems: expect.arrayContaining([
          { name: '小樱', ip: 'A', fav: true },
          { name: '雪', ip: 'A', fav: true },
          { name: '新角色', ip: 'A', fav: true }
        ])
      }),
      { updatedAt: expect.any(Number) }
    )
  })

  it('完整行集合以远端为准：明确取消的星标会清掉', async () => {
    const stores = makePresetStores({
      characters: [{ name: '小樱', ip: 'A', fav: true }]
    })
    const remote = {
      goods: [],
      trash: [],
      presetRows: [
        { domain: 'character', id: 'A::小樱', payload: { name: '小樱', ip: 'A', fav: false }, sortOrder: 0, deleted: 0 }
      ],
      presetRowsTrash: [],
      rowDomainsComplete: true,
      collectionProfileRows: [],
      collectionProfileRowsTrash: []
    }

    await mergeToLocal(stores, remote, { reconcileMissing: true })

    expect(stores.presetsStore.replacePresetsSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        characterItems: [{ name: '小樱', ip: 'A', fav: false }]
      }),
      { updatedAt: expect.any(Number) }
    )
  })

  it('完整行集合里旧版角色行没有 fav 字段时，保留本地星标而不是当成取消收藏', async () => {
    const stores = makePresetStores({
      characters: [{ name: '小樱', ip: 'A', fav: true }]
    })
    const remote = {
      goods: [],
      trash: [],
      presetRows: [
        // 旧版云端 payload 没有 fav
        { domain: 'character', id: 'A::小樱', payload: { name: '小樱', ip: 'A' }, sortOrder: 0, deleted: 0 }
      ],
      presetRowsTrash: [],
      rowDomainsComplete: true,
      collectionProfileRows: [],
      collectionProfileRowsTrash: []
    }

    await mergeToLocal(stores, remote, { reconcileMissing: true })

    expect(stores.presetsStore.replacePresetsSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        characterItems: [{ name: '小樱', ip: 'A', fav: true }]
      }),
      { updatedAt: expect.any(Number) }
    )
  })

  it('本地预设未推送（dirty）时，拉取不覆盖本地星标', async () => {
    const stores = makePresetStores({
      characters: [{ name: '小樱', ip: 'A', fav: true }]
    })
    const remote = {
      goods: [],
      trash: [],
      presetRows: [
        { domain: 'character', id: 'A::小樱', payload: { name: '小樱', ip: 'A', fav: false }, sortOrder: 0, deleted: 0 }
      ],
      presetRowsTrash: [],
      rowDomainsComplete: true,
      collectionProfileRows: [],
      collectionProfileRowsTrash: []
    }

    await mergeToLocal(stores, remote, { reconcileMissing: true, presetsDirty: true })

    expect(stores.presetsStore.replacePresetsSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        characterItems: [{ name: '小樱', ip: 'A', fav: true }]
      }),
      { updatedAt: expect.any(Number) }
    )
  })

  it('增量墓碑会移除对应角色的星标', async () => {
    const stores = makePresetStores({
      characters: [{ name: '小樱', ip: 'A', fav: true }]
    })
    const remote = {
      goods: [],
      trash: [],
      presetRows: [],
      presetRowsTrash: [
        { domain: 'character', id: 'A::小樱', sortOrder: 0, deleted: 1 }
      ],
      rowDomainsComplete: false,
      collectionProfileRows: [],
      collectionProfileRowsTrash: []
    }

    await mergeToLocal(stores, remote, { reconcileMissing: false })

    expect(stores.presetsStore.replacePresetsSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ characterItems: [] }),
      { updatedAt: expect.any(Number) }
    )
  })

  it('分类/ip 的 fav 也随条目一起合并，dirty 时保留本地星标', async () => {
    const stores = makeStores()
    stores.presetsStore = {
      categoryItems: [{ name: '旧分类', fav: true }],
      ipItems: [{ name: '旧 IP', fav: true }],
      replacePresetsSnapshot: vi.fn()
    }
    const remote = {
      goods: [],
      trash: [],
      presetRows: [
        { domain: 'category', id: '旧分类', payload: { name: '旧分类', fav: false }, sortOrder: 0, deleted: 0 },
        { domain: 'ip', id: '旧 IP', payload: { name: '旧 IP', fav: false }, sortOrder: 0, deleted: 0 }
      ],
      presetRowsTrash: [],
      rowDomainsComplete: true,
      collectionProfileRows: [],
      collectionProfileRowsTrash: []
    }

    await mergeToLocal(stores, remote, { reconcileMissing: true, presetsDirty: true })

    expect(stores.presetsStore.replacePresetsSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        categoryItems: [{ name: '旧分类', fav: true }],
        ipItems: [{ name: '旧 IP', fav: true }]
      }),
      { updatedAt: expect.any(Number) }
    )
  })
})
