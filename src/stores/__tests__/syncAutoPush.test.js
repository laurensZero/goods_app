import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// 这些 mock 都在 vi.mock 工厂里引用，必须用 vi.hoisted 提前构造
const { orchestratorSync, backendStub, storageState, authState, goodsState } = vi.hoisted(() => ({
  orchestratorSync: vi.fn(),
  backendStub: {},
  storageState: new Map(),
  authState: { isLoggedIn: true, user: { id: 'u1' } },
  goodsState: { list: [], trashList: [], loadFailed: false }
}))

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }))
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn() } }))
vi.mock('@capgo/capacitor-updater', () => ({ CapacitorUpdater: {} }))

vi.mock('@/stores/goods', () => ({ useGoodsStore: () => goodsState }))
vi.mock('@/stores/events', () => ({ useEventsStore: () => ({ list: [], trashList: [] }) }))
vi.mock('@/stores/presets', () => ({
  usePresetsStore: () => ({}),
  normalizeCharacterName: (name) => String(name || '').trim()
}))
vi.mock('@/stores/recharge', () => ({ useRechargeStore: () => ({ records: [], exportBackup: () => [] }) }))
vi.mock('@/stores/goods/goodsGroup', () => ({
  useGoodsGroupStore: () => ({ groupList: [], groupItemList: [] })
}))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => authState }))

vi.mock('@/services/sync/syncOrchestrator', () => ({
  createSyncOrchestrator: () => ({
    sync: (...args) => orchestratorSync(...args),
    pull: vi.fn(async () => ({ action: 'no_changes' })),
    resolveConflict: vi.fn(async () => ({ action: 'no_changes' })),
    resolvePullConflict: vi.fn(async () => ({ action: 'no_changes' }))
  })
}))
vi.mock('@/services/sync/syncConflictService', () => ({
  createSyncConflictService: () => ({ getLocalChangesSince: () => ({ hasChanges: false }) })
}))
vi.mock('@/services/sync/syncImageService', () => ({ createSyncImageService: () => ({}) }))
vi.mock('@/services/sync/syncPayloadService', () => ({
  createSyncPayloadService: () => ({ buildRechargeSyncData: () => null, buildEventSyncData: () => null })
}))
vi.mock('@/services/sync/syncRetry', () => ({ withRetry: (fn) => fn() }))
vi.mock('@/services/sync/syncError', () => ({
  SyncError: class SyncError extends Error {},
  buildSyncErrorStatus: () => ''
}))
vi.mock('@/services/supabaseAdapter/index', () => ({
  createSupabaseBackendAdapter: () => backendStub
}))
vi.mock('@/services/maintenanceModeService', () => ({
  isFeatureBlocked: () => false,
  FEATURE_KEYS: { SYNC_ALL: 'sync_all' }
}))

vi.mock('@/utils/sync/supabaseClient', () => ({
  initSupabaseClient: vi.fn(),
  testSupabaseConnection: vi.fn(async () => ({ ok: true })),
  reconnectSupabase: vi.fn(async () => {}),
  isSupabaseConfigured: () => true,
  loadEndpointPreference: vi.fn(async () => {})
}))
vi.mock('@/utils/sync/storage', () => ({
  readOrCreateDeviceId: vi.fn(async () => 'dev-a'),
  readSyncKey: vi.fn(async (key) => storageState.get(key) || ''),
  writePersisted: vi.fn(async () => {}),
  writeSyncKey: vi.fn(async (key, value) => { storageState.set(key, value) }),
  removeSyncKey: vi.fn(async (key) => { storageState.delete(key) })
}))
vi.mock('@/utils/sync/shared', () => ({
  getItemTimestamp: (item) => Number(item?.updatedAt) || 0,
  resolveGoodsTrashMaps: (goods = [], trash = []) => ({
    goodsMap: new Map(goods.map((g) => [g.id, g])),
    trashMap: new Map(trash.map((t) => [t.id, t]))
  })
}))
vi.mock('@/utils/image/localImage', () => ({ readLocalImageAsDataUrl: vi.fn() }))
vi.mock('@/utils/platform/deviceInfo', () => ({ getDeviceInfo: vi.fn(async () => ({ model: 'test' })) }))
vi.mock('@/composables/image/useImageExport', () => ({ compressImageToBlob: vi.fn() }))
vi.mock('@/utils/logger', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  appLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))
vi.mock('@/locales', () => ({ default: { global: { t: (key) => key } } }))

import { useSyncStore } from '@/stores/sync'

function deferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe('autoPush 调度（丢唤醒回归）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    storageState.clear()
    authState.isLoggedIn = true
    goodsState.loadFailed = false
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('防抖到点时被在途同步占位：不得把这次触发吞掉，同步结束后必须补推', async () => {
    const first = deferred()
    orchestratorSync.mockReturnValueOnce(first.promise).mockResolvedValue({ action: 'no_changes' })

    backendStub.readManifest = async () => ({ lastSyncAt: null })
    backendStub.pushAll = async () => ({ syncedAt: null })

    const store = useSyncStore()

    // t=0：新增改动，排 500ms 防抖
    store.autoPushGoods('presets')
    expect(orchestratorSync).not.toHaveBeenCalled()

    // t=0：另一条同步（启动拉取 / 手动同步）先占住 isSyncing
    const inflight = store.sync({ source: 'manual' })
    await vi.advanceTimersByTimeAsync(1)
    expect(store.isSyncing).toBe(true)

    // t=500：防抖到点，撞上在途同步 → 这次触发必须回填 pending，而不是静默丢弃
    await vi.advanceTimersByTimeAsync(500)
    expect(orchestratorSync).toHaveBeenCalledTimes(1)

    first.resolve({ action: 'no_changes' })
    await inflight
    await vi.advanceTimersByTimeAsync(10)

    expect(orchestratorSync).toHaveBeenCalledTimes(2)
    // 补推必须仍带着 presets 脏标记，否则这次改动永远推不上去
    const secondCallOpts = orchestratorSync.mock.calls[1][1]
    expect(secondCallOpts.dirtyDomains).toBeInstanceOf(Set)
    expect([...secondCallOpts.dirtyDomains]).toContain('presets')
  })

  it('没有在途同步时防抖照常只推一次', async () => {
    orchestratorSync.mockResolvedValue({ action: 'pushed' })
    backendStub.readManifest = async () => ({ lastSyncAt: null })

    const store = useSyncStore()
    store.autoPushGoods('goods')
    await vi.advanceTimersByTimeAsync(600)

    expect(orchestratorSync).toHaveBeenCalledTimes(1)
  })

  it('同步进行中新增：pending 置位，同步结束后补推', async () => {
    const first = deferred()
    orchestratorSync.mockReturnValueOnce(first.promise).mockResolvedValue({ action: 'no_changes' })
    backendStub.readManifest = async () => ({ lastSyncAt: null })

    const store = useSyncStore()
    const inflight = store.sync({ source: 'manual' })
    await vi.advanceTimersByTimeAsync(1)
    expect(store.isSyncing).toBe(true)

    store.autoPushGoods('presets')
    await vi.advanceTimersByTimeAsync(600)
    expect(orchestratorSync).toHaveBeenCalledTimes(1)

    first.resolve({ action: 'pushed' })
    await inflight
    await vi.advanceTimersByTimeAsync(10)

    expect(orchestratorSync).toHaveBeenCalledTimes(2)
  })

  it('上一会话遗留的脏标记：resumePendingAutoPush 补发一次自动推送', async () => {
    orchestratorSync.mockResolvedValue({ action: 'no_changes' })
    backendStub.readManifest = async () => ({ lastSyncAt: null })

    const store = useSyncStore()
    store.markGoodsIdsDirty(['legacy-1'])
    store.autoPushGoods('goods')
    // 推送没成功就退出了：防抖定时器与 pending 都不会自己恢复
    await vi.advanceTimersByTimeAsync(600)
    expect(orchestratorSync).toHaveBeenCalledTimes(1)

    // 模拟重启后 init 恢复脏标记（此处直接标记等价），启动拉取结束补一次
    store.resumePendingAutoPush()
    await vi.advanceTimersByTimeAsync(10)

    expect(orchestratorSync).toHaveBeenCalledTimes(2)
  })

  it('没有遗留脏标记时 resumePendingAutoPush 不空推', async () => {
    orchestratorSync.mockResolvedValue({ action: 'pushed' })
    const store = useSyncStore()

    store.resumePendingAutoPush()
    await vi.advanceTimersByTimeAsync(10)

    expect(orchestratorSync).not.toHaveBeenCalled()
  })
})
