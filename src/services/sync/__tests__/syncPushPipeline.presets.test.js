import { describe, expect, it, vi } from 'vitest'

import { writeRemoteData } from '../syncPushPipeline'

function baseArgs(overrides = {}) {
  return {
    syncData: {
      goods: [],
      trash: [],
      goodsGroups: [],
      goodsGroupsTrash: [],
      goodsGroupItems: [],
      goodsGroupItemsTrash: [],
      presets: {
        categories: [
          { name: 'A' },
          { name: 'B' },
          { name: 'C' }
        ],
        ips: [],
        characters: [],
        storageLocations: [],
        eventTypes: [],
        customFieldDefs: [],
        presetRowTombstones: [],
        collectionProfiles: {
          ipProfiles: {
            ip1: { items: [{ id: 'old', kind: 'image', cloudFileName: 'old.webp' }], rotation: {}, theme: {}, updatedAt: 1 },
            ip2: { items: [{ id: 'new', kind: 'image', cloudFileName: 'new.webp' }], rotation: {}, theme: {}, updatedAt: 2 }
          },
          characterProfiles: {}
        }
      }
    },
    rechargeSyncData: { recharge: [], rechargeTrash: [] },
    eventSyncData: { events: [], eventsTrash: [] },
    batchDraftSyncData: { batchDrafts: [], batchDraftsTrash: [] },
    manifest: { deviceId: 'device-a' },
    remoteData: {},
    shouldWriteData: false,
    shouldWriteRecharge: false,
    shouldWriteEvent: false,
    shouldWriteBatchDrafts: false,
    shouldWritePresets: true,
    ...overrides
  }
}

describe('row-level preset/profile push diff', () => {
  it('只推送发生变化的预设行和背景行', async () => {
    const pushAll = vi.fn(async () => ({ syncedAt: '2026-10-17T00:00:00.000Z' }))
    const backend = {
      pushAll,
      pullPresetRows: vi.fn(async () => ({
        active: [
          { domain: 'category', id: 'A', payload: { name: 'A' }, sortOrder: 0, deleted: 0 },
          { domain: 'category', id: 'B', payload: { name: '旧B' }, sortOrder: 1, deleted: 0 },
          { domain: 'category', id: 'C', payload: { name: 'C' }, sortOrder: 2, deleted: 0 }
        ],
        trash: []
      })),
      pullCollectionProfiles: vi.fn(async () => ({
        active: [{ id: 'ip1', kind: 'ip', items: [{ id: 'old', kind: 'image', cloudFileName: 'old.webp' }], rotation: {}, theme: {}, deleted: 0 }],
        trash: []
      }))
    }

    await writeRemoteData(backend, baseArgs())

    const pushed = pushAll.mock.calls[0][0]
    expect(pushed.presetRows).toEqual([
      expect.objectContaining({ domain: 'category', id: 'B', sort_order: 1, deleted: 0 })
    ])
    expect(pushed.collectionProfileRows).toEqual([
      expect.objectContaining({ id: 'ip2', kind: 'ip', deleted: 0 })
    ])
  })

  it('删除墓碑即使本机时钟慢于服务器也会推 deleted=1，并对齐历史未规范化的 id', async () => {
    const pushAll = vi.fn(async () => ({ syncedAt: '2026-10-17T00:00:00.000Z' }))
    const remoteUpdatedAt = Date.parse('2026-10-17T00:00:10.000Z')
    const backend = {
      pushAll,
      pullPresetRows: vi.fn(async () => ({
        active: [
          { domain: 'character', id: '角色A', payload: { name: '角色A', ip: 'IP' }, sortOrder: 0, deleted: 0, updatedAt: remoteUpdatedAt }
        ],
        trash: []
      })),
      pullCollectionProfiles: vi.fn(async () => ({ active: [], trash: [] }))
    }
    const args = baseArgs()
    args.syncData.presets.characters = []
    args.syncData.presets.presetRowTombstones = [
      { key: 'character:角色', domain: 'character', id: '角色', updatedAt: Date.now() - 60_000 }
    ]

    await writeRemoteData(backend, args)

    const pushed = pushAll.mock.calls[0][0]
    const tombstone = pushed.presetRows.find((row) => row.domain === 'character' && Number(row.deleted) === 1)
    expect(tombstone).toBeTruthy()
    // 历史云端行 id 是「角色A」：墓碑必须对齐到同一条，否则原行永远删不掉
    expect(tombstone.id).toBe('角色A')
    expect(Date.parse(tombstone.updated_at)).toBeGreaterThan(remoteUpdatedAt)
  })

  it('非预设脏域不会顺带推送预设和背景行', async () => {
    const pushAll = vi.fn(async () => ({ syncedAt: '2026-10-17T00:00:00.000Z' }))
    const backend = { pushAll }

    await writeRemoteData(backend, baseArgs({ shouldWritePresets: false }))

    const pushed = pushAll.mock.calls[0][0]
    expect(pushed.presetRows).toEqual([])
    expect(pushed.collectionProfileRows).toEqual([])
  })

  it('本机列表较短时，新增 IP 追加到云端已有行之后（而不是排在默认排序最前面）', async () => {
    const pushAll = vi.fn(async () => ({ syncedAt: '2026-10-17T00:00:00.000Z' }))
    const backend = {
      pushAll,
      // 云端已有 3 个 IP，本机此时只有刚快速新增的「洛天依」
      pullPresetRows: vi.fn(async () => ({
        active: [
          { domain: 'ip', id: '旧1', payload: { name: '旧1' }, sortOrder: 0, deleted: 0 },
          { domain: 'ip', id: '旧2', payload: { name: '旧2' }, sortOrder: 1, deleted: 0 },
          { domain: 'ip', id: '旧3', payload: { name: '旧3' }, sortOrder: 2, deleted: 0 }
        ],
        trash: []
      })),
      pullCollectionProfiles: vi.fn(async () => ({ active: [], trash: [] }))
    }
    const args = baseArgs()
    args.syncData.presets.ips = [{ name: '洛天依', fav: false }]

    await writeRemoteData(backend, args)

    const pushed = pushAll.mock.calls[0][0]
    expect(pushed.presetRows.filter((row) => row.domain === 'ip')).toEqual([
      expect.objectContaining({ domain: 'ip', id: '洛天依', sort_order: 3, deleted: 0 })
    ])
  })

  it('本机列表完整时新增 IP 仍排在最后，已有行 sort_order 不变', async () => {
    const pushAll = vi.fn(async () => ({ syncedAt: '2026-10-17T00:00:00.000Z' }))
    const backend = {
      pushAll,
      pullPresetRows: vi.fn(async () => ({
        active: [
          { domain: 'ip', id: '旧1', payload: { name: '旧1' }, sortOrder: 0, deleted: 0 },
          { domain: 'ip', id: '旧2', payload: { name: '旧2' }, sortOrder: 1, deleted: 0 },
          { domain: 'ip', id: '旧3', payload: { name: '旧3' }, sortOrder: 2, deleted: 0 }
        ],
        trash: []
      })),
      pullCollectionProfiles: vi.fn(async () => ({ active: [], trash: [] }))
    }
    const args = baseArgs()
    args.syncData.presets.ips = [{ name: '旧1' }, { name: '旧2' }, { name: '旧3' }, { name: '洛天依' }]

    await writeRemoteData(backend, args)

    const pushed = pushAll.mock.calls[0][0]
    expect(pushed.presetRows.filter((row) => row.domain === 'ip')).toEqual([
      expect.objectContaining({ domain: 'ip', id: '洛天依', sort_order: 3, deleted: 0 })
    ])
  })

  it('云端 sort_order 脏数据（新增行排在最前）会在下次推送时被纠正回来', async () => {
    const pushAll = vi.fn(async () => ({ syncedAt: '2026-10-17T00:00:00.000Z' }))
    const backend = {
      pushAll,
      // 云端历史脏数据：洛天依 sort_order=0，把它顶到了最前面
      pullPresetRows: vi.fn(async () => ({
        active: [
          { domain: 'ip', id: '洛天依', payload: { name: '洛天依' }, sortOrder: 0, deleted: 0 },
          { domain: 'ip', id: '旧1', payload: { name: '旧1' }, sortOrder: 1, deleted: 0 },
          { domain: 'ip', id: '旧2', payload: { name: '旧2' }, sortOrder: 2, deleted: 0 },
          { domain: 'ip', id: '旧3', payload: { name: '旧3' }, sortOrder: 3, deleted: 0 }
        ],
        trash: []
      })),
      pullCollectionProfiles: vi.fn(async () => ({ active: [], trash: [] }))
    }
    const args = baseArgs()
    // 本机顺序是正确的插入顺序：洛天依在最后
    args.syncData.presets.ips = [{ name: '旧1' }, { name: '旧2' }, { name: '旧3' }, { name: '洛天依' }]

    await writeRemoteData(backend, args)

    const pushed = pushAll.mock.calls[0][0]
    expect(pushed.presetRows.filter((row) => row.domain === 'ip')).toEqual([
      expect.objectContaining({ domain: 'ip', id: '旧1', sort_order: 0 }),
      expect.objectContaining({ domain: 'ip', id: '旧2', sort_order: 1 }),
      expect.objectContaining({ domain: 'ip', id: '旧3', sort_order: 2 }),
      expect.objectContaining({ domain: 'ip', id: '洛天依', sort_order: 3 })
    ])
  })

  it('已有预设的本机重排仍会随 sort_order 同步出去', async () => {
    const pushAll = vi.fn(async () => ({ syncedAt: '2026-10-17T00:00:00.000Z' }))
    const backend = {
      pushAll,
      pullPresetRows: vi.fn(async () => ({
        active: [
          { domain: 'ip', id: '旧1', payload: { name: '旧1' }, sortOrder: 0, deleted: 0 },
          { domain: 'ip', id: '旧2', payload: { name: '旧2' }, sortOrder: 1, deleted: 0 }
        ],
        trash: []
      })),
      pullCollectionProfiles: vi.fn(async () => ({ active: [], trash: [] }))
    }
    const args = baseArgs()
    args.syncData.presets.ips = [{ name: '旧2' }, { name: '旧1' }]

    await writeRemoteData(backend, args)

    const pushed = pushAll.mock.calls[0][0]
    expect(pushed.presetRows.filter((row) => row.domain === 'ip')).toEqual([
      expect.objectContaining({ domain: 'ip', id: '旧2', sort_order: 0 }),
      expect.objectContaining({ domain: 'ip', id: '旧1', sort_order: 1 })
    ])
  })
})
