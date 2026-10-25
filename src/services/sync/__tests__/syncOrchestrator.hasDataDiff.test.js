// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/utils/platform/storage', () => ({
  readPersisted: vi.fn(),
  writePersisted: vi.fn(),
  removePersisted: vi.fn()
}))
vi.mock('@/utils/db', () => ({
  getAllBatchDrafts: vi.fn(async () => []),
  flushDbWrites: vi.fn(async () => {}),
  saveItems: vi.fn(),
  saveEvents: vi.fn(),
  saveGroups: vi.fn(),
  saveGroupItems: vi.fn(),
  saveRechargeRecords: vi.fn()
}))
vi.mock('@/utils/logger', () => ({ createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }) }))
vi.mock('@/locales', () => ({ default: { global: { t: (k) => k } } }))

vi.mock('../syncPullPipeline', () => ({
  readRemoteData: vi.fn(),
  diffLocalRemote: vi.fn(),
  hydrateRemoteImages: vi.fn(),
  mergeToLocal: vi.fn()
}))
vi.mock('../syncPushPipeline', () => ({
  buildPayloadAndUploadImages: vi.fn(),
  buildManifest: vi.fn(),
  writeRemoteData: vi.fn(),
  updateLocalRefs: vi.fn()
}))

import { createSyncOrchestrator } from '../syncOrchestrator'
import { readRemoteData, diffLocalRemote, hydrateRemoteImages, mergeToLocal } from '../syncPullPipeline'
import { buildPayloadAndUploadImages, buildManifest, writeRemoteData, updateLocalRefs } from '../syncPushPipeline'

const LOCAL_SYNC_TIME = '2026-07-01T00:00:00.000Z'
const REMOTE_SYNC_TIME = '2026-07-15T00:00:00.000Z'

function makeStores() {
  return {
    goodsStore: {
      list: [{ id: 'g1', name: 'local-newer', updatedAt: Date.parse('2026-07-20T00:00:00.000Z'), isWishlist: 1, images: [] }],
      trashList: []
    },
    rechargeStore: { exportBackup: () => [], purgeSyncedDeleted: vi.fn(async () => {}) },
    eventsStore: { list: [], purgeSyncedDeleted: vi.fn(async () => {}) },
    goodsGroupStore: { groupList: [], groupItemList: [], purgeSyncedDeleted: vi.fn(async () => {}) },
    presetsStore: {}
  }
}

function makeConflict(localChanges) {
  return {
    getLocalChangesSince: vi.fn(() => ({
      updatedGoods: 0,
      updatedTrash: 0,
      updatedRecharge: 0,
      updatedEvents: 0,
      updatedGroups: 0,
      updatedGroupItems: 0,
      hasChanges: false,
      ...localChanges
    }))
  }
}

function makeOrchestrator(backend, stores, conflict) {
  return createSyncOrchestrator({
    backend,
    payload: {},
    image: {},
    conflict,
    useGoodsStore: () => stores.goodsStore,
    useRechargeStore: () => stores.rechargeStore,
    useEventsStore: () => stores.eventsStore,
    usePresetsStore: () => stores.presetsStore,
    useGoodsGroupStore: () => stores.goodsGroupStore,
    useCollectionProfileStore: () => stores.collectionProfileStore || null,
    trackSyncStep: (title, fn) => fn(),
    userIdRef: () => 'u1'
  })
}

function makeCtx(overrides = {}) {
  return {
    deviceId: 'dev-a',
    lastSyncedAt: LOCAL_SYNC_TIME,
    lastServerSyncedAt: REMOTE_SYNC_TIME,
    pendingPush: null,
    ensureEventsStoreReady: vi.fn(async () => {}),
    buildPresetsData: async () => null,
    saveLastSyncedAt: vi.fn(async () => {}),
    saveEventLastSyncedAt: vi.fn(async () => {}),
    saveLastServerSyncedAt: vi.fn(async () => {}),
    saveImageCloudId: vi.fn(async () => {}),
    savePendingPush: vi.fn(async () => {}),
    clearPendingPush: vi.fn(async () => {}),
    getDirtyGoodsIds: () => null,
    getLatestLocalModifiedAt: () => '2026-07-20T00:00:00.000Z',
    ...overrides
  }
}

function stubPushPipeline() {
  buildPayloadAndUploadImages.mockResolvedValue({
    syncData: {
      goods: [{ id: 'g1', name: 'local-newer', isWishlist: 1 }],
      trash: [],
      goodsGroups: [],
      goodsGroupsTrash: [],
      goodsGroupItems: [],
      goodsGroupItemsTrash: [],
      presets: null
    },
    rechargeSyncData: { recharge: [], rechargeTrash: [] },
    eventSyncData: { events: [], eventsTrash: [], updatedAt: null },
    batchDraftSyncData: { batchDrafts: [], batchDraftsTrash: [] },
    imageStats: { imageFileCount: 0, uploadedImages: 0 },
    imageUpdates: {}
  })
  buildManifest.mockReturnValue({ lastSyncAt: '2026-07-20T12:00:00.000Z', deviceId: 'dev-a' })
  writeRemoteData.mockResolvedValue({ serverSyncedAt: '2026-07-20T12:00:00.000Z' })
  updateLocalRefs.mockResolvedValue(undefined)
}

function stubRemote(manifest, remoteData = {}) {
  readRemoteData.mockResolvedValue({
    manifest,
    goods: [],
    trash: [],
    events: [],
    eventsTrash: [],
    recharge: [],
    rechargeTrash: [],
    groups: [],
    groupsTrash: [],
    groupItems: [],
    groupItemsTrash: [],
    batchDrafts: [],
    batchDraftsTrash: [],
    presetRows: [], presetRowsTrash: [],
    collectionProfileRows: [], collectionProfileRowsTrash: [],
    isIncremental: true,
    ...remoteData
  })
}

describe('fullSync hasDataDiff 水位线兜底', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubPushPipeline()
    // 模拟增量 diff 漏检：远端旧行不在增量 remoteData 里，localOnly 不计数
    diffLocalRemote.mockReturnValue({ hasChanges: false, changedGoodsIds: new Set(), changedTrashIds: new Set() })
  })

  it('脏标记被清 + 增量 diff 漏检本地较新行时，手动同步不得报 no_changes，应推送', async () => {
    // 云端不领先（watermark 已对齐），本地 g1 updatedAt > 行域水位线
    stubRemote({ lastSyncAt: REMOTE_SYNC_TIME, deviceId: 'dev-b' })
    const stores = makeStores()
    const conflict = makeConflict({ updatedGoods: 1, hasChanges: true })
    const orchestrator = makeOrchestrator(
      {
        readManifest: async () => ({ lastSyncAt: REMOTE_SYNC_TIME, deviceId: 'dev-b' }),
        getExistingImageCloud: async () => ({ id: 'cloud', files: {} }),
        pushAll: async () => ({ syncedAt: '2026-07-20T12:00:00.000Z' })
      },
      stores,
      conflict
    )
    const ctx = makeCtx()

    // 脏标记已被误清：空 Set 仍是 truthy，isGoodsDirty=false，不会走 diffLocalRemote
    const result = await orchestrator.sync(ctx, {
      dirtyDomains: new Set(),
      dirtyGoodsIds: new Set(),
      source: 'manual'
    })

    expect(result.action).toBe('pushed')
    expect(result.action).not.toBe('no_changes')
    expect(writeRemoteData).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ shouldWriteData: true })
    )
  })

  it('groups 本地较新同样触发 hasDataDiff，不误报 no_changes', async () => {
    stubRemote({ lastSyncAt: REMOTE_SYNC_TIME, deviceId: 'dev-b' })
    const stores = makeStores()
    stores.goodsStore.list = []
    const conflict = makeConflict({ updatedGroups: 1, hasChanges: true })
    const orchestrator = makeOrchestrator(
      {
        readManifest: async () => ({ lastSyncAt: REMOTE_SYNC_TIME, deviceId: 'dev-b' }),
        getExistingImageCloud: async () => ({ id: 'cloud', files: {} }),
        pushAll: async () => ({ syncedAt: '2026-07-20T12:00:00.000Z' })
      },
      stores,
      conflict
    )
    const ctx = makeCtx()

    const result = await orchestrator.sync(ctx, {
      dirtyDomains: new Set(),
      dirtyGoodsIds: new Set(),
      source: 'manual'
    })

    expect(result.action).toBe('pushed')
    expect(writeRemoteData).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ shouldWriteData: true })
    )
  })

  it('水位线之后无任何本地变更且 diff 为空时，仍返回 no_changes（不误推）', async () => {
    stubRemote({ lastSyncAt: REMOTE_SYNC_TIME, deviceId: 'dev-b' })
    const stores = makeStores()
    stores.goodsStore.list = []
    const conflict = makeConflict({})
    const orchestrator = makeOrchestrator(
      {
        readManifest: async () => ({ lastSyncAt: REMOTE_SYNC_TIME, deviceId: 'dev-b' }),
        getExistingImageCloud: async () => ({ id: 'cloud', files: {} }),
        pushAll: async () => ({ syncedAt: '2026-07-20T12:00:00.000Z' })
      },
      stores,
      conflict
    )
    const ctx = makeCtx()

    const result = await orchestrator.sync(ctx, {
      dirtyDomains: new Set(),
      dirtyGoodsIds: new Set(),
      source: 'manual'
    })

    expect(result.action).toBe('no_changes')
    expect(writeRemoteData).not.toHaveBeenCalled()
  })

  it('本地较新 + 云端也领先时走 conflict，而不是 no_changes', async () => {
    const newerRemote = '2026-07-25T00:00:00.000Z'
    stubRemote({ lastSyncAt: newerRemote, deviceId: 'dev-b' })
    const stores = makeStores()
    const conflict = makeConflict({ updatedGoods: 1, hasChanges: true })
    const orchestrator = makeOrchestrator(
      {
        readManifest: async () => ({ lastSyncAt: newerRemote, deviceId: 'dev-b' }),
        getExistingImageCloud: async () => ({ id: 'cloud', files: {} }),
        pushAll: async () => ({ syncedAt: newerRemote })
      },
      stores,
      conflict
    )
    // 服务器水位线仍停在旧值 → remoteTime > serverSyncTime
    const ctx = makeCtx({ lastServerSyncedAt: REMOTE_SYNC_TIME })

    const result = await orchestrator.sync(ctx, {
      dirtyDomains: new Set(),
      dirtyGoodsIds: new Set(),
      source: 'manual'
    })

    expect(result.action).toBe('conflict')
    expect(result.action).not.toBe('no_changes')
    expect(writeRemoteData).not.toHaveBeenCalled()
  })

  it('远端清单领先但最后写入者就是本机时，不弹冲突而走推送，并自愈服务器水位线', async () => {
    // 远端 synced_at 比本地服务器水位线新，但 deviceId 与本机相同：
    // 这是本机上一次推送的清单（服务器时间/网络延迟差），不是其他设备更新
    const newerRemote = '2026-07-25T00:00:00.000Z'
    stubRemote({ lastSyncAt: newerRemote, deviceId: 'dev-a' })
    const stores = makeStores()
    const conflict = makeConflict({ updatedGoods: 1, hasChanges: true })
    const orchestrator = makeOrchestrator(
      {
        readManifest: async () => ({ lastSyncAt: newerRemote, deviceId: 'dev-a' }),
        getExistingImageCloud: async () => ({ id: 'cloud', files: {} }),
        pushAll: async () => ({ syncedAt: newerRemote })
      },
      stores,
      conflict
    )
    const ctx = makeCtx({ deviceId: 'dev-a', lastServerSyncedAt: REMOTE_SYNC_TIME })

    const result = await orchestrator.sync(ctx, {
      dirtyDomains: new Set(),
      dirtyGoodsIds: new Set(),
      source: 'manual'
    })

    expect(result.action).toBe('pushed')
    expect(result.action).not.toBe('conflict')
    expect(writeRemoteData).toHaveBeenCalled()
    // 自愈：服务器水位线对齐本机 manifest 时间
    expect(ctx.saveLastServerSyncedAt).toHaveBeenCalled()
  })

  it('只有远端 presets/收藏馆背景变化（数据行无 diff、本机无脏标记）时也要走 pull', async () => {
    // 远端清单比本机服务器水位线新 = 另一台设备刚推过背景/预设
    const newerRemote = '2026-07-25T00:00:00.000Z'
    stubRemote(
      { lastSyncAt: newerRemote, deviceId: 'dev-b' },
      {
        presetRows: [{ domain: 'category', id: '远端分类', payload: { name: '远端分类' }, sortOrder: 0, deleted: 0 }],
        presetRowsTrash: [],
        collectionProfileRows: [],
        collectionProfileRowsTrash: []
      }
    )
    hydrateRemoteImages.mockResolvedValue({ restoredImages: 0 })
    mergeToLocal.mockResolvedValue({ counts: { importedGoods: 0, updatedGoods: 0, importedTrash: 0 } })
    const stores = makeStores()
    stores.goodsStore.list = []
    const conflict = makeConflict({})
    const orchestrator = makeOrchestrator(
      {
        readManifest: async () => ({ lastSyncAt: newerRemote, deviceId: 'dev-b' }),
        getExistingImageCloud: async () => ({ id: 'cloud', files: {} }),
        getImagePublicUrl: (name) => `https://cdn/${name}`
      },
      stores,
      conflict
    )
    const ctx = makeCtx({
      lastServerSyncedAt: REMOTE_SYNC_TIME,
      buildPresetsData: async () => ({ categories: [], collectionProfiles: null })
    })

    const result = await orchestrator.sync(ctx, {
      dirtyDomains: new Set(),
      dirtyGoodsIds: new Set(),
      source: 'manual'
    })

    expect(result.action).not.toBe('no_changes')
    expect(result.action).toBe('pulled')
    expect(mergeToLocal).toHaveBeenCalled()
    expect(mergeToLocal.mock.calls[0][1].presetRows).toBeTruthy()
  })

  it('本机无脏标记且水位线已与远端持平时，仍要应用远端 presets/收藏馆背景', async () => {
    stubRemote(
      { lastSyncAt: REMOTE_SYNC_TIME, deviceId: 'dev-b' },
      {
        presetRows: [{ domain: 'category', id: '远端分类', payload: { name: '远端分类' }, sortOrder: 0, deleted: 0 }],
        presetRowsTrash: [],
        collectionProfileRows: [],
        collectionProfileRowsTrash: []
      }
    )
    const stores = makeStores()
    stores.goodsStore.list = []
    stores.presetsStore = { replacePresetsSnapshot: vi.fn(async () => {}) }
    stores.collectionProfileStore = { applyRemoteProfiles: vi.fn(async () => {}) }
    const conflict = makeConflict({})
    const orchestrator = makeOrchestrator(
      {
        readManifest: async () => ({ lastSyncAt: REMOTE_SYNC_TIME, deviceId: 'dev-b' }),
        getExistingImageCloud: async () => ({ id: 'cloud', files: {} }),
        getImagePublicUrl: (name) => `https://cdn/${name}`
      },
      stores,
      conflict
    )
    // 远端清单与服务器水位线持平：正常不会走 pull 分支
    const ctx = makeCtx({
      lastServerSyncedAt: REMOTE_SYNC_TIME,
      buildPresetsData: async () => ({ categories: [], collectionProfiles: null })
    })

    const result = await orchestrator.sync(ctx, {
      dirtyDomains: new Set(),
      dirtyGoodsIds: new Set(),
      source: 'manual'
    })

    expect(result.action).toBe('pulled')
    expect(stores.presetsStore.replacePresetsSnapshot).not.toHaveBeenCalled()
    expect(stores.collectionProfileStore.applyRemoteProfiles).not.toHaveBeenCalled()
    expect(writeRemoteData).not.toHaveBeenCalled()
  })

  it('冲突里选择「保留本地」时必须全量读远端，否则会把旧行当 local-only 整库重推', async () => {
    readRemoteData.mockResolvedValue({
      manifest: null,
      goods: [{ id: 'g1', name: 'remote-copy', updatedAt: Date.parse('2026-07-25T00:00:00.000Z'), images: [] }],
      trash: [], events: [], eventsTrash: [], recharge: [], rechargeTrash: [],
      groups: [], groupsTrash: [], groupItems: [], groupItemsTrash: [],
      batchDrafts: [], batchDraftsTrash: [], presetRows: [], presetRowsTrash: [],
      collectionProfileRows: [], collectionProfileRowsTrash: [],
      isIncremental: false
    })
    const stores = makeStores()
    const conflict = makeConflict({ updatedGoods: 1, hasChanges: true })
    const orchestrator = makeOrchestrator(
      {
        readManifest: async () => ({ lastSyncAt: REMOTE_SYNC_TIME, deviceId: 'dev-b' }),
        getExistingImageCloud: async () => ({ id: 'cloud', files: {} }),
        pushAll: async () => ({ syncedAt: REMOTE_SYNC_TIME })
      },
      stores,
      conflict
    )
    const ctx = makeCtx({ conflictData: { remoteTime: '2026-07-25T00:00:00.000Z' } })

    const result = await orchestrator.resolveConflict(ctx, false)

    expect(result.action).toBe('pushed')
    expect(readRemoteData).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ since: 0 })
    )
    expect(writeRemoteData).toHaveBeenCalled()
  })

  it('远端只领先时钟容差（旧版水位线残差）且设备不同时，也自愈对齐而不弹冲突', async () => {
    // 旧版 sync_push 把客户端时间存成水位线，manifest 只领先几百毫秒~几秒；
    // 重装后 device_id 不再匹配，靠容差判定为残差 → 对齐水位线继续推送
    const remoteTwoSecondsAhead = '2026-07-15T00:00:02.000Z'
    stubRemote({ lastSyncAt: remoteTwoSecondsAhead, deviceId: 'dev-b' })
    const stores = makeStores()
    const conflict = makeConflict({ updatedGoods: 1, hasChanges: true })
    const orchestrator = makeOrchestrator(
      {
        readManifest: async () => ({ lastSyncAt: remoteTwoSecondsAhead, deviceId: 'dev-b' }),
        getExistingImageCloud: async () => ({ id: 'cloud', files: {} }),
        pushAll: async () => ({ syncedAt: remoteTwoSecondsAhead })
      },
      stores,
      conflict
    )
    const ctx = makeCtx({ lastServerSyncedAt: REMOTE_SYNC_TIME })

    const result = await orchestrator.sync(ctx, {
      dirtyDomains: new Set(),
      dirtyGoodsIds: new Set(),
      source: 'manual'
    })

    expect(result.action).toBe('pushed')
    expect(result.action).not.toBe('conflict')
    expect(writeRemoteData).toHaveBeenCalled()
    expect(ctx.saveLastServerSyncedAt).toHaveBeenCalled()
  })

  it('只由行级预设新行触发的「远端领先」+ 本地改动时，走推送而不是冲突', async () => {
    // 回归：sync_push_rows 的 updated_at 晚于 manifest，客户端行水位曾被 manifest 钳住，
    // 导致刚推的预设行每次同步都被当成远端新行；叠加本地改动就误报冲突（单设备死循环）。
    const remotePresetRow = { domain: 'category', id: 'cat-1', payload: { name: '分类' }, sortOrder: 0, deleted: 0 }
    stubRemote(
      { lastSyncAt: REMOTE_SYNC_TIME, deviceId: 'dev-b' },
      { presetRows: [remotePresetRow] }
    )
    const stores = makeStores()
    const conflict = makeConflict({ updatedGoods: 1, hasChanges: true })
    const orchestrator = makeOrchestrator(
      {
        readManifest: async () => ({ lastSyncAt: REMOTE_SYNC_TIME, deviceId: 'dev-b' }),
        getExistingImageCloud: async () => ({ id: 'cloud', files: {} }),
        pushAll: async () => ({ syncedAt: REMOTE_SYNC_TIME })
      },
      stores,
      conflict
    )
    // 清单时间与服务器水位线持平：只有行级预设有新行
    const ctx = makeCtx({ lastServerSyncedAt: REMOTE_SYNC_TIME })

    const result = await orchestrator.sync(ctx, {
      dirtyDomains: new Set(['goods']),
      dirtyGoodsIds: null,
      source: 'manual'
    })

    expect(result.action).toBe('pushed')
    expect(result.action).not.toBe('conflict')
    expect(writeRemoteData).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ shouldWritePresets: true })
    )
  })
})
