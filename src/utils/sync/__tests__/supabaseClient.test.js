import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const PRIMARY = 'https://zvqzicimowfqshgjsrri.supabase.co'
const BACKUP = 'https://api.goodsapp.de5.net'
const CF = 'https://cf.goodsapp.de5.net'
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
  SUPABASE_CF_URL: 'https://cf.goodsapp.de5.net',
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
    expect(mod.getPublicBaseUrlCandidates()).toEqual([PRIMARY, BACKUP, CF])
    expect(mod.getPublicImageDisplayCandidates('https://act-webstatic.mihoyo.com/a.jpg')).toEqual([
      'https://act-webstatic.mihoyo.com/a.jpg'
    ])
    expect(mod.getFileDownloadBaseUrls()).toEqual([PRIMARY, BACKUP, CF])
  })

  it('init with builtin url follows persisted backup preference', async () => {
    const mod = await freshClient()
    readSyncKeyMock.mockResolvedValue('backup')
    await mod.loadEndpointPreference()
    createClientMock.mockImplementation((url) => mockClient(url))
    const client = mod.initSupabaseClient(PRIMARY, KEY)
    expect(client.supabaseUrl).toBe(BACKUP)
    expect(mod.getDataPlaneUrl()).toBe(BACKUP)
    expect(mod.getPublicBaseUrl()).toBe(BACKUP)
    expect(mod.getPublicBaseUrlCandidates()).toEqual([BACKUP, PRIMARY, CF])
    expect(mod.getPublicImageDisplayCandidates(`${PRIMARY}/storage/v1/object/public/goods-images/a.jpg`)).toEqual([
      `${BACKUP}/storage/v1/object/public/goods-images/a.jpg`,
      `${PRIMARY}/storage/v1/object/public/goods-images/a.jpg`,
      `${CF}/storage/v1/object/public/goods-images/a.jpg`
    ])
    expect(mod.getFileDownloadBaseUrls()).toEqual([BACKUP, PRIMARY, CF])
  })

  it('custom instance locks and does not participate in failover', async () => {
    const mod = await freshClient()
    createClientMock.mockImplementation((url) => mockClient(url))
    const custom = 'https://my-custom.supabase.co'
    mod.initSupabaseClient(custom, KEY, { custom: true })
    expect(mod.getDataPlaneUrl()).toBe(custom)
    expect(mod.getPublicBaseUrl()).toBe(custom)
    expect(mod.getPublicBaseUrlCandidates()).toEqual([custom])
    expect(mod.getFileDownloadBaseUrls()).toEqual([custom])

    mockProbeReachable([custom])
    const ok = await mod.reconnectSupabase({ force: true })
    expect(ok).toBe(true)
    expect(mod.getDataPlaneUrl()).toBe(custom)
    expect(fetchMock.mock.calls.every(([u]) => String(u).startsWith(custom))).toBe(true)
  })

  it('auto-detects non-builtin url as custom', async () => {
    const mod = await freshClient()
    createClientMock.mockImplementation((url) => mockClient(url))
    mod.initSupabaseClient('https://other.example.com', KEY)
    expect(mod.getPublicBaseUrl()).toBe('https://other.example.com')
  })

  it('does not auto-failover when primary unreachable', async () => {
    const mod = await freshClient()
    createClientMock.mockImplementation((url) => mockClient(url))
    mod.initSupabaseClient(PRIMARY, KEY)

    mockProbeReachable([BACKUP])
    const ok = await mod.reconnectSupabase({ force: true })
    expect(ok).toBe(false)
    expect(mod.getDataEndpointId()).toBe('primary')
    expect(writeSyncKeyMock).not.toHaveBeenCalledWith('sync_data_endpoint', 'backup')
  })

  it('stays on preferred when preferred down (no auto switch)', async () => {
    const mod = await freshClient()
    createClientMock.mockImplementation((url) => mockClient(url))
    mod.initSupabaseClient(PRIMARY, KEY)

    mockProbeReachable([BACKUP])
    const ok = await mod.reconnectSupabase({ force: true })
    expect(ok).toBe(false)
    expect(mod.getDataEndpointId()).toBe('primary')
  })

  it('does not auto-switch even with parallelProbe flag', async () => {
    const mod = await freshClient()
    createClientMock.mockImplementation((url) => mockClient(url))
    mod.initSupabaseClient(PRIMARY, KEY)

    mockProbeReachable([BACKUP])
    const ok = await mod.reconnectSupabase({ force: true, parallelProbe: true })
    expect(ok).toBe(false)
    expect(mod.getDataEndpointId()).toBe('primary')
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
    fetchMock.mockResolvedValue({ ok: false, status: 403 })
    const ok = await mod.reconnectSupabase({ force: true })
    expect(ok).toBe(true)
    expect(mod.getDataPlaneUrl()).toBe(PRIMARY)
  })

  it('throttles repeated probes within window unless force', async () => {
    const mod = await freshClient()
    createClientMock.mockImplementation((url) => mockClient(url))
    mod.initSupabaseClient(PRIMARY, KEY)
    mockProbeReachable([PRIMARY])

    await mod.reconnectSupabase({ force: true })
    const callsAfterFirst = fetchMock.mock.calls.length
    expect(callsAfterFirst).toBeGreaterThan(0)

    const ok = await mod.reconnectSupabase()
    expect(ok).toBe(true)
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst)

    await mod.reconnectSupabase({ force: true })
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsAfterFirst)
  })
})

describe('manual endpoint stickiness', () => {
  it('manual switch does not auto-failover on first outage', async () => {
    const mod = await freshClient()
    createClientMock.mockImplementation((url) => mockClient(url))
    mod.initSupabaseClient(PRIMARY, KEY)
    expect(await mod.switchDataEndpoint('backup')).toBe(true)
    expect(mod.getDataEndpointId()).toBe('backup')

    // 只有主站通、备用不通：手动锁定备用时不应立刻切回主站
    mockProbeReachable([PRIMARY])
    const ok = await mod.reconnectSupabase({ force: true })
    expect(ok).toBe(false)
    expect(mod.getDataEndpointId()).toBe('backup')
  })

  it('never auto-switches after manual selection', async () => {
    const mod = await freshClient()
    createClientMock.mockImplementation((url) => mockClient(url))
    mod.initSupabaseClient(PRIMARY, KEY)
    expect(await mod.switchDataEndpoint('backup')).toBe(true)

    mockProbeReachable([PRIMARY])
    await mod.reconnectSupabase({ force: true })
    expect(mod.getDataEndpointId()).toBe('backup')

    // 模拟持续不通超过 30s 后允许切换
    const nowSpy = vi.spyOn(Date, 'now')
    nowSpy.mockReturnValue(Date.now() + 31_000)
    const ok = await mod.reconnectSupabase({ force: true })
    nowSpy.mockRestore()
    expect(ok).toBe(false)
    expect(mod.getDataEndpointId()).toBe('backup')
  })
})
describe('cloudflare proxy endpoint', () => {
  it('lists primary/backup/cf and switches manually without auto-failover', async () => {
    const mod = await freshClient()
    createClientMock.mockImplementation((url) => mockClient(url))
    mod.initSupabaseClient(PRIMARY, KEY)

    const ids = mod.listDataEndpoints().map((ep) => ep.id)
    expect(ids).toEqual(['primary', 'backup', 'cf'])
    expect(mod.getPublicBaseUrlCandidates()).toEqual([PRIMARY, BACKUP, CF])
    expect(mod.getFileDownloadBaseUrls()).toEqual([PRIMARY, BACKUP, CF])

    expect(await mod.switchDataEndpoint('cf')).toBe(true)
    expect(mod.getDataEndpointId()).toBe('cf')
    expect(mod.getDataPlaneUrl()).toBe(CF)
    expect(mod.getPublicBaseUrlCandidates()).toEqual([CF, PRIMARY, BACKUP])
    expect(mod.getFileDownloadBaseUrls()).toEqual([CF, PRIMARY, BACKUP])

    // 主站通、CF 不通：手动粘住 CF，不自动切走
    mockProbeReachable([PRIMARY])
    const ok = await mod.reconnectSupabase({ force: true })
    expect(ok).toBe(false)
    expect(mod.getDataEndpointId()).toBe('cf')
  })

  it('restores persisted cf preference on load', async () => {
    const mod = await freshClient()
    readSyncKeyMock.mockImplementation(async (k) => (k === 'sync_data_endpoint' ? 'cf' : ''))
    await mod.loadEndpointPreference()
    createClientMock.mockImplementation((url) => mockClient(url))
    mod.initSupabaseClient(PRIMARY, KEY)
    expect(mod.getDataEndpointId()).toBe('cf')
    expect(mod.getDataPlaneUrl()).toBe(CF)
  })
})
