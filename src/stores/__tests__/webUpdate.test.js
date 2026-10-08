import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// vi.mock 工厂里引用的 mock 必须用 vi.hoisted 提前构造
const h = vi.hoisted(() => {
  const state = { bundleRow: null }
  const cu = {
    current: vi.fn(),
    download: vi.fn(),
    next: vi.fn(),
    set: vi.fn(),
    reset: vi.fn(),
    notifyAppReady: vi.fn(),
    addListener: vi.fn()
  }
  return {
    state,
    cu,
    featurePerm: vi.fn(),
    from: vi.fn()
  }
})

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, registerPlugin: vi.fn() }
}))
vi.mock('@capgo/capacitor-updater', () => ({ CapacitorUpdater: h.cu }))
vi.mock('@capacitor/filesystem', () => ({ Filesystem: {}, Directory: {} }))
vi.mock('@/utils/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  appLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))
vi.mock('@/utils/dev/mockVersion', () => ({
  isDevVersionMockEnabled: () => false,
  resolveMockAppVersion: () => '',
  resolveMockBundleVersion: () => ''
}))
vi.mock('@/utils/platform/localFileServer', () => ({
  startLocalFileServer: vi.fn(),
  stopLocalFileServer: vi.fn()
}))
vi.mock('@/utils/platform/fileHash', () => ({ sha256Hex: vi.fn() }))
vi.mock('@/composables/permission/useFeaturePermission', () => ({
  checkFeaturePermission: (...args) => h.featurePerm(...args)
}))
vi.mock('@/utils/sync/supabaseClient', () => ({
  getSupabaseClient: () => ({ from: (...args) => h.from(...args) }),
  getFileDownloadBaseUrls: () => ['https://primary.test'],
  initSupabaseClient: vi.fn(),
  reconnectSupabase: vi.fn(async () => {}),
  loadEndpointPreference: vi.fn(async () => {})
}))

import { useWebUpdateStore } from '../webUpdate'

const VALID_SHA = 'a'.repeat(64)
const CHANNEL_KEY = 'goods_web_update_channel'

function makeRow(overrides = {}) {
  return {
    id: 1,
    channel: 'stable',
    type: 'web_bundle',
    version: '1.1.0',
    storage_path: 'stable/bundle-1.1.0.zip',
    file_size: 1024,
    sha256: VALID_SHA,
    update_level: 'prompt',
    notes: '- feat: test',
    published_at: '2026-01-01T00:00:00Z',
    min_native_version: '',
    ...overrides
  }
}

function makeChain(result) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(async () => result)
  }
  return chain
}

function setChannel(channel) {
  localStorage.setItem(CHANNEL_KEY, channel)
}

describe('webUpdate：silent 静默链路 + beta 白名单门限', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.clearAllMocks()

    h.state.bundleRow = makeRow()
    h.from.mockImplementation(() => makeChain({ data: [h.state.bundleRow], error: null }))
    h.featurePerm.mockResolvedValue(true)

    h.cu.current.mockResolvedValue({ bundle: { id: 'live-1', version: '1.0.0' }, native: '1.0.0' })
    h.cu.download.mockResolvedValue({ id: 'dl-1', version: '1.1.0' })
    h.cu.next.mockResolvedValue(undefined)
    h.cu.set.mockResolvedValue(undefined)
    h.cu.reset.mockResolvedValue(undefined)
    h.cu.notifyAppReady.mockResolvedValue(undefined)
    h.cu.addListener.mockResolvedValue({ remove: vi.fn(async () => {}) })
  })

  describe('silent 自动静默下载', () => {
    it('silent 可用：不弹对话框，自动后台下载并 next()，不调用 set() 立即 reload', async () => {
      setChannel('stable')
      h.state.bundleRow = makeRow({ update_level: 'silent' })
      const store = useWebUpdateStore()

      const result = await store.checkForUpdates()

      expect(result.status).toBe('available')
      expect(store.isSilentUpdate).toBe(true)
      expect(store.dialogVisible).toBe(false)

      await vi.waitFor(() => expect(h.cu.download).toHaveBeenCalledTimes(1))
      await vi.waitFor(() => expect(h.cu.next).toHaveBeenCalledWith({ id: 'dl-1' }))
      expect(h.cu.set).not.toHaveBeenCalled()
      expect(store.lastStatus).toBe('pending')
      expect(store.pendingBundleId).toBe('dl-1')
      expect(store.pendingVersion).toBe('1.1.0')
    })

    it('silent 下载失败：状态静默还原为 available 且无残留错误文案', async () => {
      setChannel('stable')
      h.state.bundleRow = makeRow({ update_level: 'silent' })
      h.cu.download.mockRejectedValue(new Error('network down'))
      const store = useWebUpdateStore()

      await store.checkForUpdates()
      await vi.waitFor(() => expect(h.cu.download).toHaveBeenCalled())
      await vi.waitFor(() => expect(store.isDownloading).toBe(false))
      await vi.waitFor(() => {
        expect(store.lastStatus).toBe('available')
        expect(store.lastError).toBe('')
      })
      expect(h.cu.next).not.toHaveBeenCalled()
      expect(h.cu.set).not.toHaveBeenCalled()
    })

    it('同版本已有待生效包：重复检查与手动下载均短路，不重复下载', async () => {
      setChannel('stable')
      h.state.bundleRow = makeRow({ update_level: 'silent' })
      const store = useWebUpdateStore()

      await store.checkForUpdates()
      await vi.waitFor(() => expect(store.lastStatus).toBe('pending'))
      expect(h.cu.download).toHaveBeenCalledTimes(1)

      // 手动再次下载：直接复用已就绪的 pending 包
      const ok = await store.downloadAndPrepareUpdate()
      expect(ok).toBe(true)
      expect(h.cu.download).toHaveBeenCalledTimes(1)

      // 再次检查（如前台冷却到期）：保持 pending，不重新进入下载
      const again = await store.checkForUpdates()
      expect(again.status).toBe('pending')
      expect(store.lastStatus).toBe('pending')
      expect(h.cu.download).toHaveBeenCalledTimes(1)
      expect(h.cu.set).not.toHaveBeenCalled()
    })

    it('prompt 可用：弹对话框且不自动下载（维持手动路径）', async () => {
      setChannel('stable')
      h.state.bundleRow = makeRow({ update_level: 'prompt' })
      const store = useWebUpdateStore()

      const result = await store.checkForUpdates()

      expect(result.status).toBe('available')
      expect(store.dialogVisible).toBe(true)
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(h.cu.download).not.toHaveBeenCalled()
    })
  })

  describe('beta feature_whitelist 门限', () => {
    it('stable 频道不经过白名单校验', async () => {
      setChannel('stable')
      const store = useWebUpdateStore()

      const result = await store.checkForUpdates()

      expect(h.featurePerm).not.toHaveBeenCalled()
      expect(h.from).toHaveBeenCalled()
      expect(result.status).toBe('available')
    })

    it('beta + 无权限：静默降级为「已是最新」，不查询 ota_releases 并退回 stable', async () => {
      setChannel('beta')
      h.featurePerm.mockResolvedValue(false)
      const store = useWebUpdateStore()

      const result = await store.checkForUpdates()

      expect(h.featurePerm).toHaveBeenCalledWith('beta')
      expect(result.status).toBe('gated')
      expect(store.lastStatus).toBe('latest')
      expect(store.dialogVisible).toBe(false)
      expect(h.from).not.toHaveBeenCalled()
      expect(h.cu.download).not.toHaveBeenCalled()
      // 门限命中也推进检查时间戳（供前台冷却复用）
      expect(store.lastCheckedAt).toBeTruthy()
      // 无权限用户退回 stable：切换器对其隐藏，不能困在被门限挡死的 beta 频道
      expect(store.selectedChannel).toBe('stable')
      expect(localStorage.getItem(CHANNEL_KEY)).toBe('stable')
    })

    it('beta + 有权限：正常拿到可用更新', async () => {
      setChannel('beta')
      h.state.bundleRow = makeRow({ update_level: 'prompt', channel: 'beta' })
      const store = useWebUpdateStore()

      const result = await store.checkForUpdates()

      expect(h.featurePerm).toHaveBeenCalledWith('beta')
      expect(h.from).toHaveBeenCalled()
      expect(result.status).toBe('available')
      expect(store.latestVersion).toBe('1.1.0')
      expect(store.dialogVisible).toBe(true)
    })

    it('beta + 有权限 + silent：照常走静默下载链路', async () => {
      setChannel('beta')
      h.state.bundleRow = makeRow({ update_level: 'silent', channel: 'beta' })
      const store = useWebUpdateStore()

      await store.checkForUpdates()

      await vi.waitFor(() => expect(h.cu.next).toHaveBeenCalledWith({ id: 'dl-1' }))
      expect(h.cu.set).not.toHaveBeenCalled()
      expect(store.dialogVisible).toBe(false)
    })
  })
})
