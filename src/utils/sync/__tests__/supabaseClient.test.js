import { describe, it, expect, vi, beforeEach } from 'vitest'

const PRIMARY = 'https://zvqzicimowfqshgjsrri.supabase.co'
const BACKUP = 'https://api.goodsapp.de5.net'
const KEY = 'test-anon-key'

const createClientMock = vi.fn()
const readSyncKeyMock = vi.fn()
const writeSyncKeyMock = vi.fn()

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

function mockClient(url, reachable = true) {
  return {
    supabaseUrl: url,
    supabaseKey: KEY,
    from: () => ({
      select: () => ({
        limit: async () => {
          if (!reachable) throw new TypeError('Failed to fetch')
          return { error: null }
        }
      })
    })
  }
}

async function freshClient() {
  vi.resetModules()
  return await import('@/utils/sync/supabaseClient')
}

beforeEach(() => {
  createClientMock.mockReset()
  readSyncKeyMock.mockReset()
  writeSyncKeyMock.mockReset()
  readSyncKeyMock.mockResolvedValue('')
  writeSyncKeyMock.mockResolvedValue(undefined)
})

describe('supabaseClient failover', () => {
  it('uses primary by default', async () => {
    const mod = await freshClient()
    createClientMock.mockImplementation((url, key) => mockClient(url))
    const client = mod.initSupabaseClient(PRIMARY, KEY)
    expect(client.supabaseUrl).toBe(PRIMARY)
    expect(mod.getDataPlaneUrl()).toBe(PRIMARY)
    expect(mod.getPublicBaseUrl()).toBe(PRIMARY)
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
  })

  it('custom instance locks and does not participate in failover', async () => {
    const mod = await freshClient()
    const custom = 'https://my-custom.supabase.co'
    createClientMock.mockImplementation((url) => mockClient(url))
    mod.initSupabaseClient(custom, KEY, { custom: true })
    expect(mod.getDataPlaneUrl()).toBe(custom)
    expect(mod.getPublicBaseUrl()).toBe(custom)

    // reconnect keeps custom url even if probe "fails over"
    createClientMock.mockImplementation((url) => mockClient(url, true))
    const ok = await mod.reconnectSupabase()
    expect(ok).toBe(true)
    expect(mod.getDataPlaneUrl()).toBe(custom)
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

    createClientMock.mockImplementation((url) =>
      mockClient(url, url === BACKUP)
    )
    const ok = await mod.reconnectSupabase()
    expect(ok).toBe(true)
    expect(mod.getDataPlaneUrl()).toBe(BACKUP)
    expect(mod.getPublicBaseUrl()).toBe(PRIMARY)
    expect(writeSyncKeyMock).toHaveBeenCalledWith('sync_data_endpoint', 'backup')
  })

  it('reconnect stays on primary when reachable', async () => {
    const mod = await freshClient()
    createClientMock.mockImplementation((url) => mockClient(url))
    mod.initSupabaseClient(PRIMARY, KEY)
    const ok = await mod.reconnectSupabase()
    expect(ok).toBe(true)
    expect(mod.getDataPlaneUrl()).toBe(PRIMARY)
    expect(writeSyncKeyMock).not.toHaveBeenCalled()
  })

  it('returns false when both endpoints unreachable', async () => {
    const mod = await freshClient()
    createClientMock.mockImplementation((url) => mockClient(url))
    mod.initSupabaseClient(PRIMARY, KEY)
    createClientMock.mockImplementation((url) => mockClient(url, false))
    const ok = await mod.reconnectSupabase()
    expect(ok).toBe(false)
  })

  it('probe treats business error as reachable', async () => {
    const mod = await freshClient()
    createClientMock.mockImplementation((url) => ({
      ...mockClient(url),
      from: () => ({
        select: () => ({
          limit: async () => ({ error: { message: 'permission denied' } })
        })
      })
    }))
    mod.initSupabaseClient(PRIMARY, KEY)
    const ok = await mod.reconnectSupabase()
    expect(ok).toBe(true)
    expect(mod.getDataPlaneUrl()).toBe(PRIMARY)
  })
})
