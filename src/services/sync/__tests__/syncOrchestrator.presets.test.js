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

const SYNC_TIME = '2026-07-15T00:00:00.000Z'
const LOCAL_PRESETS = { categories: [], ips: [], characters: [{ name: '星', ip: '' }], storageLocations: [], eventTypes: [], customFieldDefs: [] }

function makeStores() {
  return {
    goodsStore: { list: [], trashList: [] },
    rechargeStore: { exportBackup: () => [], purgeSyncedDeleted: vi.fn(async () => {}) },
    eventsStore: { list: [], purgeSyncedDeleted: vi.fn(async () => {}) },
    goodsGroupStore: { groupList: [], groupItemList: [], purgeSyncedDeleted: vi.fn(async () => {}) },
    presetsStore: {}
  }
}

function makeOrchestrator(backend, stores) {
  return createSyncOrchestrator({
    backend,
    payload: {},
    image: {},
    conflict: { getLocalChangesSince: () => ({ updatedGoods: 0, updatedTrash: 0, updatedRecharge: 0, updatedEvents: 0, updatedGroups: 0, updatedGroupItems: 0, hasChanges: false }) },
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
    lastSyncedAt: SYNC_TIME,
    lastServerSyncedAt: SYNC_TIME,
    pendingPush: null,
    ensureEventsStoreReady: vi.fn(async () => {}),
    buildPresetsData: async () => LOCAL_PRESETS,
    saveLastSyncedAt: vi.fn(async () => {}),
    saveEventLastSyncedAt: vi.fn(async () => {}),
    saveLastServerSyncedAt: vi.fn(async () => {}),
    saveImageCloudId: vi.fn(async () => {}),
    savePendingPush: vi.fn(async () => {}),
    clearPendingPush: vi.fn(async () => {}),
    saveMaintenanceMode: vi.fn(async () => {}),
    getDirtyGoodsIds: () => null,
    getLatestLocalModifiedAt: () => '',
    ...overrides
  }
}

function makeBackend() {
  return {
    readManifest: async () => ({ lastSyncAt: SYNC_TIME, deviceId: 'dev-b' }),
    getExistingImageCloud: async () => ({ id: 'cloud', files: {} }),
    pushAll: async () => ({ syncedAt: SYNC_TIME })
  }
}

function stubRemote(remoteOverrides = {}) {
  readRemoteData.mockResolvedValue({
    manifest: { lastSyncAt: SYNC_TIME, deviceId: 'dev-b' },
    goods: [], trash: [], events: [], eventsTrash: [],
    recharge: [], rechargeTrash: [], groups: [], groupsTrash: [],
    groupItems: [], groupItemsTrash: [], batchDrafts: [], batchDraftsTrash: [],
    presetRows: [], presetRowsTrash: [],
    collectionProfileRows: [], collectionProfileRowsTrash: [],
    isIncremental: true,
    ...remoteOverrides
  })
}

function stubPushPipeline() {
  buildPayloadAndUploadImages.mockResolvedValue({
    syncData: {
      goods: [], trash: [],
      goodsGroups: [], goodsGroupsTrash: [], goodsGroupItems: [], goodsGroupItemsTrash: [],
      presets: LOCAL_PRESETS
    },
    rechargeSyncData: { recharge: [], rechargeTrash: [] },
    eventSyncData: { events: [], eventsTrash: [], updatedAt: null },
    batchDraftSyncData: { batchDrafts: [], batchDraftsTrash: [] },
    imageStats: { imageFileCount: 0, uploadedImages: 0 },
    imageUpdates: {}
  })
  buildManifest.mockReturnValue({ lastSyncAt: SYNC_TIME, deviceId: 'dev-a' })
  writeRemoteData.mockResolvedValue({ serverSyncedAt: SYNC_TIME })
  updateLocalRefs.mockResolvedValue(undefined)
}

function stubPullPipeline() {
  diffLocalRemote.mockReturnValue({ hasChanges: false, changedGoodsIds: new Set(), changedTrashIds: new Set() })
  hydrateRemoteImages.mockResolvedValue({ restoredImages: 0 })
  mergeToLocal.mockResolvedValue({ counts: { updatedGoods: 1 }, remoteWatermark: Date.parse(SYNC_TIME) })
}

beforeEach(() => {
  vi.clearAllMocks()
  stubPushPipeline()
  stubPullPipeline()
})

describe('row-level presets', () => {
  it('只加角色时必须推送行级预设', async () => {
    stubRemote()
    const stores = makeStores()
    const orchestrator = makeOrchestrator(makeBackend(), stores)

    const result = await orchestrator.sync(makeCtx(), {
      dirtyDomains: new Set(['presets']),
      dirtyGoodsIds: null,
      source: 'auto'
    })

    expect(result.action).toBe('pushed')
    expect(writeRemoteData).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ shouldWritePresets: true, shouldWriteData: false })
    )
  })

  it('远端行级变更时走 pull', async () => {
    stubRemote({
      presetRows: [{ domain: 'category', id: '远端分类', payload: { name: '远端分类' }, sortOrder: 0, deleted: 0 }]
    })
    const orchestrator = makeOrchestrator(makeBackend(), makeStores())

    const result = await orchestrator.sync(makeCtx(), {
      dirtyDomains: new Set(),
      dirtyGoodsIds: new Set(),
      source: 'auto'
    })

    expect(result.action).toBe('pulled')
    expect(mergeToLocal).toHaveBeenCalled()
  })
})

describe('pull applies row-level presets', () => {
  it('增量拉取：预设行与背景行一起交给 merge', async () => {
    stubRemote()
    const backend = { pullAll: vi.fn(), getExistingImageCloud: vi.fn().mockResolvedValue({ files: {} }) }
    const stores = makeStores()
    const orchestrator = makeOrchestrator(backend, stores)

    await orchestrator.pull(makeCtx(), {
      tables: ['goods'],
      since: Date.parse(SYNC_TIME),
      dirtyDomains: new Set(['presets'])
    })

    expect(mergeToLocal).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything())
    expect(readRemoteData).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      since: expect.any(Number),
      // 本地 presets 脏 → 行表强制全量拉一次（用于推送 diff）
      presetSince: 0,
      profileSince: 0
    }))
  })

  it('本地干净时照常应用远端行', async () => {
    stubRemote()
    const backend = { pullAll: vi.fn(), getExistingImageCloud: vi.fn().mockResolvedValue({ files: {} }) }
    const orchestrator = makeOrchestrator(backend, makeStores())

    await orchestrator.pull(makeCtx(), {
      tables: ['goods'],
      since: Date.parse(SYNC_TIME),
      dirtyDomains: null
    })

    expect(mergeToLocal).toHaveBeenCalled()
  })

  it('全量拉取（schemaResync）同样应用远端行', async () => {
    stubRemote()
    const backend = { pullAll: vi.fn().mockResolvedValue({}), getExistingImageCloud: vi.fn().mockResolvedValue({ files: {} }) }
    const orchestrator = makeOrchestrator(backend, makeStores())

    await orchestrator.pull(makeCtx(), {
      silent: true,
      schemaResync: true,
      dirtyDomains: new Set(['presets'])
    })

    expect(mergeToLocal).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ forceReapply: true }))
  })

  it('未传 dirtyDomains 时仍使用行级合并', async () => {
    stubRemote()
    const backend = { pullAll: vi.fn().mockResolvedValue({}), getExistingImageCloud: vi.fn().mockResolvedValue({ files: {} }) }
    const orchestrator = makeOrchestrator(backend, makeStores())

    await orchestrator.pull(makeCtx(), { silent: true, schemaResync: true })

    expect(mergeToLocal).toHaveBeenCalled()
  })

  it('整库拉取（since=0，含强制全量/拉取远端）时必须全量拉预设行，不能沿用行水位', async () => {
    // 回归：数据 since=0 全量、但行表只拿增量行 → merge 用「远端全量」语义重建预设快照，
    // 未变更的分类/自定义字段/活动类型被清空；且强制全量拉取也补不回来。
    stubRemote()
    const backend = { pullAll: vi.fn().mockResolvedValue({}), getExistingImageCloud: vi.fn().mockResolvedValue({ files: {} }) }
    const orchestrator = makeOrchestrator(backend, makeStores())
    const ctx = makeCtx({ presetRowSince: 1_700_000_000_000, profileRowSince: 1_700_000_000_000 })

    await orchestrator.pull(ctx, { silent: true, forceAlign: true })

    expect(readRemoteData).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      presetSince: 0,
      profileSince: 0
    }))
  })

  it('增量拉取且本地干净时继续使用行水位增量', async () => {
    stubRemote()
    const backend = { pullAll: vi.fn(), getExistingImageCloud: vi.fn().mockResolvedValue({ files: {} }) }
    const orchestrator = makeOrchestrator(backend, makeStores())
    const ctx = makeCtx({ presetRowSince: 1_700_000_000_000, profileRowSince: 1_700_000_000_001 })

    await orchestrator.pull(ctx, { since: Date.parse(SYNC_TIME), dirtyDomains: null })

    expect(readRemoteData).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      presetSince: 1_700_000_000_000,
      profileSince: 1_700_000_000_001
    }))
  })

  it('本地预设快照被清空时，增量拉取也强制全量拉行表（自愈恢复）', async () => {
    stubRemote()
    const backend = { pullAll: vi.fn(), getExistingImageCloud: vi.fn().mockResolvedValue({ files: {} }) }
    const stores = makeStores()
    stores.presetsStore = {
      categories: [], ips: [], characters: [], storageLocations: [], eventTypes: [], customFieldDefs: [],
      replacePresetsSnapshot: vi.fn()
    }
    const orchestrator = makeOrchestrator(backend, stores)
    const ctx = makeCtx({ presetRowSince: 1_700_000_000_000, profileRowSince: 1_700_000_000_000 })

    await orchestrator.pull(ctx, { since: Date.parse(SYNC_TIME), dirtyDomains: null })

    expect(readRemoteData).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      presetSince: 0,
      profileSince: 0
    }))
  })
})
