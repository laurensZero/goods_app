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
import { readRemoteData, diffLocalRemote } from '../syncPullPipeline'
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
    presets: null,
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
})
