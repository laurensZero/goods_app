import { describe, it, expect, vi } from 'vitest'

vi.mock('@/utils/platform/storage', () => ({
  readPersisted: vi.fn(),
  writePersisted: vi.fn(),
  removePersisted: vi.fn()
}))
vi.mock('@/utils/logger', () => ({ createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }) }))
vi.mock('@/locales', () => ({ default: { global: { t: (k) => k } } }))

vi.mock('../syncPullPipeline', () => ({
  readRemoteData: vi.fn(),
  diffLocalRemote: vi.fn(),
  hydrateRemoteImages: vi.fn(),
  mergeToLocal: vi.fn()
}))

import { createSyncOrchestrator } from '../syncOrchestrator'
import { readRemoteData, diffLocalRemote, hydrateRemoteImages, mergeToLocal } from '../syncPullPipeline'

const REMOTE_MANIFEST = { lastSyncAt: '2026-08-01T00:00:00.000Z' }

function makeStores() {
  return {
    goodsStore: { list: [], trashList: [] },
    rechargeStore: { exportBackup: () => [] },
    eventsStore: { list: [] },
    goodsGroupStore: { groupList: [], groupItemList: [] },
    presetsStore: {}
  }
}

function makeOrchestrator(backend, stores) {
  return createSyncOrchestrator({
    backend,
    payload: {},
    image: {},
    conflict: { getLocalChangesSince: () => ({ hasChanges: true }) },
    useGoodsStore: () => stores.goodsStore,
    useRechargeStore: () => stores.rechargeStore,
    useEventsStore: () => stores.eventsStore,
    usePresetsStore: () => stores.presetsStore,
    useGoodsGroupStore: () => stores.goodsGroupStore,
    trackSyncStep: (title, fn) => fn(),
    userIdRef: () => 'u1'
  })
}

function makeCtx() {
  return {
    lastSyncedAt: '2026-07-01T00:00:00.000Z',
    lastServerSyncedAt: '2026-07-01T00:00:00.000Z',
    pendingPush: null,
    saveLastSyncedAt: vi.fn(),
    saveEventLastSyncedAt: vi.fn(),
    saveLastServerSyncedAt: vi.fn(),
    saveImageCloudId: vi.fn(),
    getDirtyGoodsIds: () => null,
    getLatestLocalModifiedAt: () => '',
    buildPresetsData: async () => null
  }
}

beforeEach(() => {
  readRemoteData.mockReset()
  diffLocalRemote.mockReset()
  hydrateRemoteImages.mockReset()
  mergeToLocal.mockReset()
  diffLocalRemote.mockReturnValue({ hasChanges: false, changedGoodsIds: new Set(), changedTrashIds: new Set() })
  hydrateRemoteImages.mockResolvedValue({ restoredImages: 0 })
  mergeToLocal.mockResolvedValue({ counts: { updatedGoods: 1 }, remoteWatermark: 100 })
})

describe('pull schemaResync（同步格式版本升级回填）', () => {
  it('全量重拉 + forceReapply 重放相等时间戳行，跳过冲突并推进水位线', async () => {
    const remoteData = {
      manifest: REMOTE_MANIFEST,
      goods: [{ id: 'g1', name: 'remote', updatedAt: 100 }],
      trash: [],
      events: [], recharge: [], groups: [], groupItems: [],
      presets: null
    }
    readRemoteData.mockResolvedValue(remoteData)
    const backend = { pullAll: vi.fn().mockResolvedValue(remoteData), getExistingImageCloud: vi.fn().mockResolvedValue({ files: {} }) }
    const stores = makeStores()
    const orchestrator = makeOrchestrator(backend, stores)
    const ctx = makeCtx()

    const result = await orchestrator.pull(ctx, { silent: true, schemaResync: true })

    expect(result.action).toBe('pulled')
    expect(result.schemaResync).toBe(true)
    // 全部远端行进入图片水合（changedGoodsIds 被强制铺满），合并走 forceReapply 且不删本地独有行
    expect(hydrateRemoteImages).toHaveBeenCalledWith(
      {},
      backend,
      remoteData,
      expect.objectContaining({ hasChanges: true, changedGoodsIds: new Set(['g1']) })
    )
    expect(mergeToLocal).toHaveBeenCalledWith(
      stores,
      remoteData,
      expect.objectContaining({ forceReapply: true, reconcileMissing: false })
    )
    // 水位线推进到远端 manifest
    expect(ctx.saveLastSyncedAt).toHaveBeenCalledWith(REMOTE_MANIFEST.lastSyncAt)
    expect(ctx.saveLastServerSyncedAt).toHaveBeenCalledWith(REMOTE_MANIFEST.lastSyncAt)
  })

  it('本地有改动也不触发冲突（schemaResync 直接回填，conflict.getLocalChangesSince 返回 hasChanges=true）', async () => {
    const remoteData = {
      manifest: REMOTE_MANIFEST,
      goods: [{ id: 'g1', name: 'remote', updatedAt: 100 }],
      trash: [],
      events: [], recharge: [], groups: [], groupItems: [],
      presets: null
    }
    readRemoteData.mockResolvedValue(remoteData)
    const backend = { pullAll: vi.fn().mockResolvedValue(remoteData), getExistingImageCloud: vi.fn().mockResolvedValue({ files: {} }) }
    const orchestrator = makeOrchestrator(backend, makeStores())
    const ctx = makeCtx()

    const result = await orchestrator.pull(ctx, { silent: true, schemaResync: true })

    expect(result.action).toBe('pulled')
    expect(result.conflictData).toBeUndefined()
  })

  it('无 schemaResync 时时间戳相等仍按无变化处理，不调用 merge（默认行为不变）', async () => {
    const remoteData = {
      manifest: REMOTE_MANIFEST,
      goods: [{ id: 'g1', name: 'remote', updatedAt: 100 }],
      trash: [],
      events: [], recharge: [], groups: [], groupItems: [],
      presets: null
    }
    readRemoteData.mockResolvedValue(remoteData)
    const backend = { pullAll: vi.fn().mockResolvedValue(remoteData), getExistingImageCloud: vi.fn().mockResolvedValue({ files: {} }) }
    const orchestrator = makeOrchestrator(backend, makeStores())
    const ctx = makeCtx()

    const result = await orchestrator.pull(ctx, { silent: true })

    expect(result.action).toBe('no_changes')
    expect(hydrateRemoteImages).not.toHaveBeenCalled()
    expect(mergeToLocal).not.toHaveBeenCalled()
  })
})
