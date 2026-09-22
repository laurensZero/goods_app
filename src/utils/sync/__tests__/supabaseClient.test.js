import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const PRIMARY = 'https://zvqzicimowfqshgjsrri.supabase.co'
const BACKUP = 'https://api.goodsapp.de5.net'
const KEY = 'test-anon-key'

const createClientMock = vi.fn()
const readSyncKeyMock = vi.fn()
const writeSyncKeyMock = vi.fn()
const fetchMock = vi.fn()

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args) => createClientMock(...args)
}))
vi.mock('@/config/supabase', () => ({
  SUPABASE_URL: 'https://zvqzicimowfqshgjsrri.supabase.co',
  SUPABASE_BACKUP_URL: 'https://api.goodsapp.de5.net',
  SUPABASE_ANON_KEY: 'builtin-key'
}))
vi.mock('@/locales', () => ({
  default: { global: { t: (k) => k } }
}))
vi.mock('@/utils/feedback/feedbackDevice', () => ({
  getDeviceId: () => 'device-test'
}))
vi.mock('@/utils/sync/storage', () => ({
  readSyncKey: (...a) => readSyncKeyMock(...a),
  writeSyncKey: (...a) => writeSyncKeyMock(...a)
}))

function mockClient(url) {
  return {
    supabaseUrl: url,
    supabaseKey: KEY
  }
}

/** 让 probe 对列表内前缀可达，其余不可达 */
function mockProbeReachable(reachablePrefixes) {
  fetchMock.mockImplementation(async (input) => {
    const url = String(input)
    if (reachablePrefixes.some((p) => url.startsWith(p))) return { ok: true, status: 200 }
    throw new TypeError('Failed to fetch')
  })
}

async function freshClient() {
  vi.resetModules()
  return await import('@/utils/sync/supabaseClient')
}

beforeEach(() => {
  createClientMock.mockReset()
  readSyncKeyMock.mockReset()
  writeSyncKeyMock.mockReset()
  fetchMock.mockReset()
  readSyncKeyMock.mockResolvedValue('')
  writeSyncKeyMock.mockResolvedValue(undefined)
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('supabaseClient failover', () => {
  it('uses primary by default', async () => {
    const mod = await freshClient()
    createClientMock.mockImplementation((url) => mockClient(url))
    const client = mod.initSupabaseClient(PRIMARY, KEY)
    expect(client.supabaseUrl).toBe(PRIMARY)
    expect(mod.getDataPlaneUrl()).toBe(PRIMARY)
    expect(mod.getPublicBaseUrl()).toBe(PRIMARY)
    expect(mod.getFileDownloadBaseUrls()).toEqual([PRIMARY, BACKUP])
  })

  it('init with builtin url follows persisted backup preference', async () => {
    const mod = await freshClient()
    readSyncKeyMock.mockResolvedValue('backup')
    await mod.loadEndpointPreference()
    createClientMock.mockImplementation((url) => mockClient(url))
    const client = mod.initSupabaseClient(PRIMARY, KEY)
    expect(client.supabaseUrl).toBe(BACKUP)
    expect(mod.getDataPlaneUrl()).toBe(BACKUP)
    expect(mod.getPublicBaseUrl()).toBe(PRIMARY)
    // 下载候选与数据面一致：当前端点在前，主域名兜底
    expect(mod.getFileDownloadBaseUrls()).toEqual([BACKUP, PRIMARY])
  })

  it('custom instance locks and does not participate in failover', async () => {
    const mod = await freshClient()
    const custom = 'https://my-custom.supabase.co'
    createClientMock.mockImplementation((url) => mockClient(url))
    mod.initSupabaseClient(custom, KEY, { custom: true })
    expect(mod.getDataPlaneUrl()).toBe(custom)
    expect(mod.getPublicBaseUrl()).toBe(custom)
    expect(mod.getFileDownloadBaseUrls()).toEqual([custom])

    mockProbeReachable([custom])
    const ok = await mod.reconnectSupabase({ force: true })
    expect(ok).toBe(true)
    expect(mod.getDataPlaneUrl()).toBe(custom)
    // 自建实例只探自己，不探内置主/备
    expect(fetchMock.mock.calls.every(([u]) => String(u).startsWith(custom))).toBe(true)
  })

  it('auto-detects non-builtin url as custom', async () => {
    const mod = await freshClient()
    createClientMock.mockImplementation((url) => mockClient(url))
    mod.initSupabaseClient('https://other.example.com', KEY)
    expect(mod.getPublicBaseUrl()).toBe('https://other.example.com')
  })

  it('reconnect fails over to backup when primary unreachable and persists preference', async () => {
    const mod = await freshClient()
    createClientMock.mockImplementation((url) => mockClient(url))
    mod.initSupabaseClient(PRIMARY, KEY)

    mockProbeReachable([BACKUP])
    const ok = await mod.reconnectSupabase({ force: true })
    expect(ok).toBe(true)
    expect(mod.getDataPlaneUrl()).toBe(BACKUP)
    expect(mod.getPublicBaseUrl()).toBe(PRIMARY)
    expect(writeSyncKeyMock).toHaveBeenCalledWith('sync_data_endpoint', 'backup')
  })

  it('reconnect stays on primary when reachable', async () => {
    const mod = await freshClient()
    createClientMock.mockImplementation((url) => mockClient(url))
    mod.initSupabaseClient(PRIMARY, KEY)
    mockProbeReachable([PRIMARY, BACKUP])
    const ok = await mod.reconnectSupabase({ force: true })
    expect(ok).toBe(true)
    expect(mod.getDataPlaneUrl()).toBe(PRIMARY)
    expect(writeSyncKeyMock).not.toHaveBeenCalled()
  })

  it('returns false when both endpoints unreachable', async () => {
    const mod = await freshClient()
    createClientMock.mockImplementation((url) => mockClient(url))
    mod.initSupabaseClient(PRIMARY, KEY)
    mockProbeReachable([])
    const ok = await mod.reconnectSupabase({ force: true })
    expect(ok).toBe(false)
  })

  it('probe treats any HTTP response as reachable', async () => {
    const mod = await freshClient()
    createClientMock.mockImplementation((url) => mockClient(url))
    mod.initSupabaseClient(PRIMARY, KEY)
    // 403/401 也是「网络通」
    fetchMock.mockResolvedValue({ ok: false, status: 403 })
    const ok = await mod.reconnectSupabase({ force: true })
    expect(ok).toBe(true)
    expect(mod.getDataPlaneUrl()).toBe(PRIMARY)
  })

  it('default reconnect probes only preferred; backup only after preferred fails', async () => {
    const mod = await freshClient()
    createClientMock.mockImplementation((url) => mockClient(url))
    mod.initSupabaseClient(PRIMARY, KEY)

    mockProbeReachable([PRIMARY, BACKUP])
    const ok = await mod.reconnectSupabase({ force: true })
    expect(ok).toBe(true)
    expect(mod.getDataPlaneUrl()).toBe(PRIMARY)
    // 主站通时不打备用
    expect(fetchMock.mock.calls.every(([u]) => String(u).startsWith(PRIMARY))).toBe(true)
  })

  it('default reconnect fails over sequentially when preferred down', async () => {
    const mod = await freshClient()
    createClientMock.mockImplementation((url) => mockClient(url))
    mod.initSupabaseClient(PRIMARY, KEY)

    mockProbeReachable([BACKUP])
    const ok = await mod.reconnectSupabase({ force: true })
    expect(ok).toBe(true)
    expect(mod.getDataPlaneUrl()).toBe(BACKUP)
    const hosts = fetchMock.mock.calls.map(([u]) => String(u))
    expect(hosts.some((u) => u.startsWith(PRIMARY))).toBe(true)
    expect(hosts.some((u) => u.startsWith(BACKUP))).toBe(true)
    // 非并行：备用应在主站失败之后才发出
    const primaryIdx = hosts.findIndex((u) => u.startsWith(PRIMARY))
    const backupIdx = hosts.findIndex((u) => u.startsWith(BACKUP))
    expect(primaryIdx).toBeGreaterThanOrEqual(0)
    expect(backupIdx).toBeGreaterThan(primaryIdx)
  })

  it('parallelProbe probes primary and backup in parallel (backup fetch issued before primary resolves)', async () => {
    const mod = await freshClient()
    createClientMock.mockImplementation((url) => mockClient(url))
    mod.initSupabaseClient(PRIMARY, KEY)

    let primaryResolved = false
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.startsWith(PRIMARY)) {
        await new Promise((r) => setTimeout(r, 50))
        primaryResolved = true
        throw new TypeError('Failed to fetch')
      }
      // 备用在主站未决时就应已发出
      expect(primaryResolved).toBe(false)
      return { ok: true, status: 200 }
    })

    const ok = await mod.reconnectSupabase({ force: true, parallelProbe: true })
    expect(ok).toBe(true)
    expect(mod.getDataPlaneUrl()).toBe(BACKUP)
    const hosts = fetchMock.mock.calls.map(([u]) => String(u))
    expect(hosts.some((u) => u.startsWith(PRIMARY))).toBe(true)
    expect(hosts.some((u) => u.startsWith(BACKUP))).toBe(true)
  })

  it('throttles repeated probes within window unless force', async () => {
    const mod = await freshClient()
    createClientMock.mockImplementation((url) => mockClient(url))
    mod.initSupabaseClient(PRIMARY, KEY)
    mockProbeReachable([PRIMARY, BACKUP])

    await mod.reconnectSupabase({ force: true, parallelProbe: true })
    const callsAfterFirst = fetchMock.mock.calls.length
    expect(callsAfterFirst).toBeGreaterThan(0)

    // 非 force：10s 节流内直接短路，不再打 fetch
    const ok = await mod.reconnectSupabase()
    expect(ok).toBe(true)
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst)

    // force：跳过节流
    await mod.reconnectSupabase({ force: true })
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsAfterFirst)
  })
})
