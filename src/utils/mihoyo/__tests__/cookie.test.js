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
  clearMihoyoCookieState
} from '../cookie'
import { removeSecret, writeSecret } from '@/utils/platform/storage'

const STORAGE_KEY = 'mihoyo_cookie_state'
const NATIVE_STORAGE_KEY = 'mihoyo_native_session'

beforeEach(() => {
  state.native = false
  state.secrets.clear()
  state.prefs.clear()
  vi.clearAllMocks()
})

describe('saveMihoyoCookie / loadMihoyoCookieState', () => {
  it('保存后读取往返，状态被规范化', async () => {
    const saved = await saveMihoyoCookie('  abc=1; def=2  ')
    expect(saved.cookie).toBe('abc=1; def=2')
    expect(saved.updatedAt).toBeTruthy()
    expect(saved.invalidAt).toBe('')
    expect(saved.invalidReason).toBe('')

    const loaded = await loadMihoyoCookieState()
    expect(loaded).toEqual(saved)
    expect(writeSecret).toHaveBeenCalledWith(STORAGE_KEY, expect.any(String))
  })

  it('保存空 Cookie 等同于清除', async () => {
    await saveMihoyoCookie('abc=1')
    const result = await saveMihoyoCookie('')
    expect(result).toEqual({ cookie: '', updatedAt: '', invalidAt: '', invalidReason: '' })
    expect(removeSecret).toHaveBeenCalledWith(STORAGE_KEY)
    expect(state.secrets.has(STORAGE_KEY)).toBe(false)
  })

  it('存储内容损坏（非 JSON）时返回默认状态', async () => {
    state.secrets.set(STORAGE_KEY, '{broken json')
    const loaded = await loadMihoyoCookieState()
    expect(loaded).toEqual({ cookie: '', updatedAt: '', invalidAt: '', invalidReason: '' })
  })
})

describe('markMihoyoCookieInvalid', () => {
  it('保留 updatedAt 并写入 invalidAt/invalidReason', async () => {
    const saved = await saveMihoyoCookie('abc=1')
    const marked = await markMihoyoCookieInvalid('abc=1', '登录过期')
    expect(marked.cookie).toBe('abc=1')
    expect(marked.updatedAt).toBe(saved.updatedAt)
    expect(marked.invalidAt).toBeTruthy()
    expect(marked.invalidReason).toBe('登录过期')

    const loaded = await loadMihoyoCookieState()
    expect(loaded).toEqual(marked)
  })
})

describe('clearMihoyoCookieState', () => {
  it('调用 removeSecret 清除存储', async () => {
    await saveMihoyoCookie('abc=1')
    await clearMihoyoCookieState()
    expect(removeSecret).toHaveBeenCalledWith(STORAGE_KEY)
    const loaded = await loadMihoyoCookieState()
    expect(loaded.cookie).toBe('')
  })

  it('原生端同时清理旧版 mihoyo_native_session 回捞 key', async () => {
    state.native = true
    state.prefs.set(NATIVE_STORAGE_KEY, JSON.stringify({ cookie: 'ck=1' }))
    await clearMihoyoCookieState()
    expect(state.prefs.has(NATIVE_STORAGE_KEY)).toBe(false)
    // fallback 不会再复活已清除的 Cookie
    const loaded = await loadMihoyoCookieState()
    expect(loaded.cookie).toBe('')
  })
})

describe('原生端旧版回捞 fallback', () => {
  it('主存储缺失时回捞 JSON 形式的 mihoyo_native_session', async () => {
    state.native = true
    state.prefs.set(NATIVE_STORAGE_KEY, JSON.stringify({ cookie: 'ck=native', updated_at: '2024-01-01T00:00:00.000Z' }))
    const loaded = await loadMihoyoCookieState()
    expect(loaded.cookie).toBe('ck=native')
    expect(loaded.updatedAt).toBe('2024-01-01T00:00:00.000Z')
  })

  it('主存储缺失时回捞裸字符串形式的 mihoyo_native_session', async () => {
    state.native = true
    state.prefs.set(NATIVE_STORAGE_KEY, 'raw-cookie-string')
    const loaded = await loadMihoyoCookieState()
    expect(loaded.cookie).toBe('raw-cookie-string')
    expect(loaded.updatedAt).toBe('')
  })

  it('主存储命中时优先于原生回捞 key', async () => {
    state.native = true
    await saveMihoyoCookie('ck=primary')
    state.prefs.set(NATIVE_STORAGE_KEY, 'raw-cookie-string')
    const loaded = await loadMihoyoCookieState()
    expect(loaded.cookie).toBe('ck=primary')
  })
})
