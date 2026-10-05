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
    presets: null,
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

describe('presets 首推死锁（云端还没有 sync_presets 行）', () => {
  it('只加角色、远端 presets 为 null 时不得判 no_changes，必须推送 presets', async () => {
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

  it('远端 presets 与本地一致时仍判无差异，不空推', async () => {
    stubRemote({ presets: { ...LOCAL_PRESETS } })
    const stores = makeStores()
    const orchestrator = makeOrchestrator(makeBackend(), stores)

    const result = await orchestrator.sync(makeCtx(), {
      dirtyDomains: new Set(['presets']),
      dirtyGoodsIds: null,
      source: 'auto'
    })

    expect(result.action).toBe('no_changes')
    expect(writeRemoteData).not.toHaveBeenCalled()
  })

  it('远端 presets 有差异时正常推送', async () => {
    stubRemote({ presets: { ...LOCAL_PRESETS, characters: [] } })
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
      expect.objectContaining({ shouldWritePresets: true })
    )
  })
})

describe('pull 不得用远端快照覆盖未推送的本地 presets', () => {
  it('增量拉取：本地 presets 脏时 preserveLocalPresets=true', async () => {
    stubRemote()
    const backend = { pullAll: vi.fn(), getExistingImageCloud: vi.fn().mockResolvedValue({ files: {} }) }
    const stores = makeStores()
    const orchestrator = makeOrchestrator(backend, stores)

    await orchestrator.pull(makeCtx(), {
      tables: ['goods'],
      since: Date.parse(SYNC_TIME),
      dirtyDomains: new Set(['presets'])
    })

    expect(mergeToLocal).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ preserveLocalPresets: true })
    )
  })

  it('增量拉取：本地 presets 干净时照常应用远端（否则跨设备新增角色拉不下来）', async () => {
    stubRemote()
    const backend = { pullAll: vi.fn(), getExistingImageCloud: vi.fn().mockResolvedValue({ files: {} }) }
    const orchestrator = makeOrchestrator(backend, makeStores())

    await orchestrator.pull(makeCtx(), {
      tables: ['goods'],
      since: Date.parse(SYNC_TIME),
      dirtyDomains: null
    })

    expect(mergeToLocal).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ preserveLocalPresets: false })
    )
  })

  it('全量拉取（schemaResync 强制合并）同样保护本地 presets', async () => {
    stubRemote()
    const backend = { pullAll: vi.fn().mockResolvedValue({}), getExistingImageCloud: vi.fn().mockResolvedValue({ files: {} }) }
    const orchestrator = makeOrchestrator(backend, makeStores())

    await orchestrator.pull(makeCtx(), {
      silent: true,
      schemaResync: true,
      dirtyDomains: new Set(['presets'])
    })

    expect(mergeToLocal).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ preserveLocalPresets: true, forceReapply: true })
    )
  })

  it('未传 dirtyDomains 时默认不保留（保持旧行为：远端快照覆盖本地）', async () => {
    stubRemote()
    const backend = { pullAll: vi.fn().mockResolvedValue({}), getExistingImageCloud: vi.fn().mockResolvedValue({ files: {} }) }
    const orchestrator = makeOrchestrator(backend, makeStores())

    await orchestrator.pull(makeCtx(), { silent: true, schemaResync: true })

    expect(mergeToLocal).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ preserveLocalPresets: false })
    )
  })
})
