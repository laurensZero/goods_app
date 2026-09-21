import { describe, it, expect, vi, beforeEach } from 'vitest'

// 共享可变状态：native 开关 + 内存版 secret 存储 + 内存版 Preferences
const state = vi.hoisted(() => ({
  native: false,
  secrets: new Map(),
  prefs: new Map()
}))

vi.mock('@/utils/platform/storage', () => ({
  readSecret: vi.fn(async (key, fallback = null) => (state.secrets.has(key) ? state.secrets.get(key) : fallback)),
  writeSecret: vi.fn(async (key, value) => { state.secrets.set(key, value) }),
  removeSecret: vi.fn(async (key) => { state.secrets.delete(key) })
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => state.native }
}))

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(async ({ key }) => ({ value: state.prefs.has(key) ? state.prefs.get(key) : null })),
    set: vi.fn(async ({ key, value }) => { state.prefs.set(key, value) }),
    remove: vi.fn(async ({ key }) => { state.prefs.delete(key) })
  }
}))

import {
  loadMihoyoCookieState,
  saveMihoyoCookie,
  markMihoyoCookieInvalid,
  clearMihoyoCookieState,
  listMihoyoAccounts,
  getActiveMihoyoAccount
} from '../cookie'
import { removeSecret, writeSecret } from '@/utils/platform/storage'

const STORAGE_KEY = 'mihoyo_cookie_state'
const ACCOUNTS_KEY = 'mihoyo_accounts'
const NATIVE_STORAGE_KEY = 'mihoyo_native_session'
const COOKIE = 'account_id_v2=1111222233334444; ltoken_v2=tok; cookie_token_v2=tok'

beforeEach(() => {
  state.native = false
  state.secrets.clear()
  state.prefs.clear()
  vi.clearAllMocks()
})

describe('saveMihoyoCookie / loadMihoyoCookieState（多账号）', () => {
  it('保存后读取往返，并写入账号列表与激活状态', async () => {
    const saved = await saveMihoyoCookie(`  ${COOKIE}  `)
    expect(saved.cookie).toBe(COOKIE)
    expect(saved.updatedAt).toBeTruthy()
    expect(saved.invalidAt).toBe('')
    expect(saved.accountId).toBe('1111222233334444')

    const loaded = await loadMihoyoCookieState()
    expect(loaded.cookie).toBe(saved.cookie)
    expect(loaded.updatedAt).toBe(saved.updatedAt)
    expect(writeSecret).toHaveBeenCalledWith(STORAGE_KEY, expect.any(String))
    expect(writeSecret).toHaveBeenCalledWith(ACCOUNTS_KEY, expect.any(String))

    const accounts = await listMihoyoAccounts()
    expect(accounts).toHaveLength(1)
    const active = await getActiveMihoyoAccount()
    expect(active.cookie).toBe(COOKIE)
  })

  it('保存空 Cookie 清除当前会话但保留账号列表', async () => {
    await saveMihoyoCookie(COOKIE)
    const result = await saveMihoyoCookie('')
    expect(result.cookie).toBe('')
    expect(state.secrets.has(STORAGE_KEY)).toBe(false)
    expect(await listMihoyoAccounts()).toHaveLength(1)
  })

  it('无账号且存储损坏时返回默认状态', async () => {
    state.secrets.set(STORAGE_KEY, '{broken json')
    state.secrets.set(ACCOUNTS_KEY, '{also broken')
    const loaded = await loadMihoyoCookieState()
    expect(loaded.cookie).toBe('')
  })
})

describe('markMihoyoCookieInvalid', () => {
  it('标记失效并保留 updatedAt', async () => {
    const saved = await saveMihoyoCookie(COOKIE)
    const marked = await markMihoyoCookieInvalid(COOKIE, '登录过期')
    expect(marked.cookie).toBe(COOKIE)
    expect(marked.updatedAt).toBe(saved.updatedAt)
    expect(marked.invalidAt).toBeTruthy()
    expect(marked.invalidReason).toBe('登录过期')

    const loaded = await loadMihoyoCookieState()
    expect(loaded.invalidAt).toBeTruthy()
  })
})

describe('clearMihoyoCookieState', () => {
  it('默认保留账号列表，仅清当前会话', async () => {
    await saveMihoyoCookie(COOKIE)
    await clearMihoyoCookieState()
    expect(removeSecret).toHaveBeenCalledWith(STORAGE_KEY)
    const loaded = await loadMihoyoCookieState()
    expect(loaded.cookie).toBe('')
    expect(await listMihoyoAccounts()).toHaveLength(1)
    expect(await getActiveMihoyoAccount()).toBe(null)
  })

  it('原生端同时清理旧版 mihoyo_native_session 回捞 key', async () => {
    state.native = true
    state.prefs.set(NATIVE_STORAGE_KEY, JSON.stringify({ cookie: 'ck=1' }))
    await clearMihoyoCookieState({ keepAccounts: false })
    expect(state.prefs.has(NATIVE_STORAGE_KEY)).toBe(false)
  })
})

describe('原生端旧版回捞 fallback', () => {
  it('主存储缺失时回捞 JSON 形式的 mihoyo_native_session 并迁移为账号', async () => {
    state.native = true
    state.prefs.set(NATIVE_STORAGE_KEY, JSON.stringify({ cookie: 'account_id_v2=9999; ltoken_v2=x', updated_at: '2024-01-01T00:00:00.000Z' }))
    const loaded = await loadMihoyoCookieState()
    expect(loaded.cookie).toContain('9999')
    expect(loaded.updatedAt).toBe('2024-01-01T00:00:00.000Z')
  })

  it('主存储命中时优先于原生回捞 key', async () => {
    state.native = true
    await saveMihoyoCookie(COOKIE)
    state.prefs.set(NATIVE_STORAGE_KEY, 'raw-cookie-string')
    const loaded = await loadMihoyoCookieState()
    expect(loaded.cookie).toBe(COOKIE)
  })
})
