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

  it('非预设脏域不会顺带推送预设和背景行', async () => {
    const pushAll = vi.fn(async () => ({ syncedAt: '2026-10-17T00:00:00.000Z' }))
    const backend = { pushAll }

    await writeRemoteData(backend, baseArgs({ shouldWritePresets: false }))

    const pushed = pushAll.mock.calls[0][0]
    expect(pushed.presetRows).toEqual([])
    expect(pushed.collectionProfileRows).toEqual([])
  })
})
