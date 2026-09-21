import { describe, it, expect, vi, beforeEach } from 'vitest'

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
  clearMihoyoCookieState,
  formatMihoyoAccountLabel,
  getActiveMihoyoAccount,
  listMihoyoAccounts,
  loadMihoyoCookieState,
  markMihoyoCookieInvalid,
  parseMihoyoAccountId,
  removeMihoyoAccount,
  renameMihoyoAccount,
  saveMihoyoCookie,
  switchMihoyoAccount,
  upsertMihoyoAccountProfile
} from '../cookie'
import { removeSecret } from '@/utils/platform/storage'

const STORAGE_KEY = 'mihoyo_cookie_state'
const ACCOUNTS_KEY = 'mihoyo_accounts'
const ACTIVE_ID_KEY = 'mihoyo_active_account_id'
const NATIVE_STORAGE_KEY = 'mihoyo_native_session'

const COOKIE_A = 'account_id_v2=1111222233334444; ltoken_v2=aaa; cookie_token_v2=aaa'
const COOKIE_B = 'ltuid_v2=5555666677778888; ltoken_v2=bbb; cookie_token_v2=bbb'

beforeEach(() => {
  state.native = false
  state.secrets.clear()
  state.prefs.clear()
  vi.clearAllMocks()
})

describe('parseMihoyoAccountId / label', () => {
  it('解析 account_id_v2 / ltuid_v2', () => {
    expect(parseMihoyoAccountId(COOKIE_A)).toBe('1111222233334444')
    expect(parseMihoyoAccountId(COOKIE_B)).toBe('5555666677778888')
  })

  it('长 UID 展示为前 4…后 4', () => {
    expect(formatMihoyoAccountLabel('1111222233334444')).toBe('账号 1111…4444')
    expect(formatMihoyoAccountLabel('')).toBe('未命名账号')
  })
})

describe('save / list / switch 多账号', () => {
  it('保存两个账号并切换，列表保持保存顺序（当前号不提前）', async () => {
    const a = await saveMihoyoCookie(COOKIE_A)
    expect(a.accountId).toBe('1111222233334444')

    const b = await saveMihoyoCookie(COOKIE_B, { label: '小号' })
    expect(b.accountLabel).toBe('小号')

    const list = await listMihoyoAccounts()
    expect(list).toHaveLength(2)
    // 固定保存顺序，避免选择时当前号跳来跳去
    expect(list.map((item) => item.id)).toEqual(['1111222233334444', '5555666677778888'])

    const switched = await switchMihoyoAccount('1111222233334444')
    expect(switched.cookie).toBe(COOKIE_A)
    const active = await getActiveMihoyoAccount()
    expect(active.id).toBe('1111222233334444')
    expect((await listMihoyoAccounts()).map((item) => item.id)).toEqual(['1111222233334444', '5555666677778888'])

    const stateLoaded = await loadMihoyoCookieState()
    expect(stateLoaded.cookie).toBe(COOKIE_A)
  })

  it('同 accountId 再次保存为 upsert，昵称可覆盖自动 UID 标签', async () => {
    await saveMihoyoCookie(COOKIE_A)
    await saveMihoyoCookie(COOKIE_A.replace('aaa', 'aaa2'), { label: '星穹小号' })
    const list = await listMihoyoAccounts()
    expect(list).toHaveLength(1)
    expect(list[0].label).toBe('星穹小号')
    expect(list[0].cookie).toContain('aaa2')

    // 用户改过备注后，无 label 的再次保存不会冲掉
    await saveMihoyoCookie(COOKIE_A.replace('aaa2', 'aaa3'))
    const after = await listMihoyoAccounts()
    expect(after[0].label).toBe('星穹小号')
  })

  it('退出会话保留账号列表；removeAccount 才删除', async () => {
    await saveMihoyoCookie(COOKIE_A)
    await saveMihoyoCookie(COOKIE_B)
    await clearMihoyoCookieState({ keepAccounts: true })
    expect(await listMihoyoAccounts()).toHaveLength(2)
    const loaded = await loadMihoyoCookieState()
    expect(loaded.cookie).toBe('')
    expect(await getActiveMihoyoAccount()).toBe(null)

    await removeMihoyoAccount('1111222233334444')
    const after = await listMihoyoAccounts()
    expect(after).toHaveLength(1)
    expect(after[0].id).toBe('5555666677778888')
  })

  it('save 时可写入头像 URL', async () => {
    await saveMihoyoCookie(COOKIE_A, {
      label: 'laurensZero',
      avatarUrl: 'https://bbs-static.miyoushe.com/static/demo.png'
    })
    const list = await listMihoyoAccounts()
    expect(list[0].label).toBe('laurensZero')
    expect(list[0].avatarUrl).toBe('https://bbs-static.miyoushe.com/static/demo.png')
  })

  it('旧账号自动 UID 标签可被 user/info 昵称覆盖，手改备注不覆盖', async () => {
    await saveMihoyoCookie(COOKIE_A)
    const autoLabel = formatMihoyoAccountLabel('1111222233334444')
    expect((await listMihoyoAccounts())[0].label).toBe(autoLabel)

    await upsertMihoyoAccountProfile('1111222233334444', {
      label: 'laurensZero',
      avatarUrl: 'https://bbs-static.miyoushe.com/static/a.png'
    })
    expect((await listMihoyoAccounts())[0].label).toBe('laurensZero')
    expect((await listMihoyoAccounts())[0].avatarUrl).toContain('a.png')

    await upsertMihoyoAccountProfile('1111222233334444', { label: '另一个名字' })
    expect((await listMihoyoAccounts())[0].label).toBe('laurensZero')
  })

  it('rename 账号备注', async () => {
    await saveMihoyoCookie(COOKIE_A)
    const updated = await renameMihoyoAccount('1111222233334444', '大号')
    expect(updated.label).toBe('大号')
  })

  it('markInvalid 只标记对应账号', async () => {
    await saveMihoyoCookie(COOKIE_A)
    await saveMihoyoCookie(COOKIE_B)
    await markMihoyoCookieInvalid(COOKIE_B, '过期')
    const list = await listMihoyoAccounts()
    const b = list.find((item) => item.id === '5555666677778888')
    expect(b.invalidAt).toBeTruthy()
  })
})

describe('旧版单账号迁移', () => {
  it('仅有 mihoyo_cookie_state 时迁移为账号列表', async () => {
    state.secrets.set(STORAGE_KEY, JSON.stringify({
      cookie: COOKIE_A,
      updatedAt: '2024-01-01T00:00:00.000Z',
      invalidAt: '',
      invalidReason: ''
    }))
    const list = await listMihoyoAccounts()
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe('1111222233334444')
    const active = await getActiveMihoyoAccount()
    expect(active.cookie).toBe(COOKIE_A)
  })
})

describe('clearMihoyoCookieState', () => {
  it('keepAccounts=false 清空账号列表', async () => {
    await saveMihoyoCookie(COOKIE_A)
    await clearMihoyoCookieState({ keepAccounts: false })
    expect(state.secrets.has(ACCOUNTS_KEY)).toBe(false)
    expect(state.secrets.has(ACTIVE_ID_KEY)).toBe(false)
    expect(state.secrets.has(STORAGE_KEY)).toBe(false)
  })

  it('原生端同时清理旧版回捞 key', async () => {
    state.native = true
    state.prefs.set(NATIVE_STORAGE_KEY, JSON.stringify({ cookie: 'ck=1' }))
    await clearMihoyoCookieState({ keepAccounts: true })
    expect(state.prefs.has(NATIVE_STORAGE_KEY)).toBe(false)
    expect(removeSecret).toHaveBeenCalledWith(STORAGE_KEY)
  })
})
