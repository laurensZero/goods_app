import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  canUseNativeMihoyoImport: vi.fn(() => false),
  applyNativeMihoyoCookie: vi.fn(),
  getNativeMihoyoCookie: vi.fn(async () => ''),
  loginMihoyoNativeNewAccount: vi.fn(),
  logoutMihoyoNativeSession: vi.fn(),
  setNativeMihoyoCookie: vi.fn(async () => true),
  saveMihoyoCookie: vi.fn(async () => ({})),
  listMihoyoAccounts: vi.fn(async () => []),
  getActiveMihoyoAccount: vi.fn(async () => null),
  clearMihoyoCookieState: vi.fn(async () => {}),
  loadMihoyoCookieState: vi.fn(async () => ({ cookie: '', invalidAt: '' })),
  markMihoyoCookieInvalid: vi.fn(async () => {}),
  removeMihoyoAccount: vi.fn(async () => {}),
  renameMihoyoAccount: vi.fn(async () => {}),
  switchMihoyoAccount: vi.fn(async () => ({ ok: true })),
  isAutoMihoyoAccountLabel: vi.fn(() => true),
  upsertMihoyoAccountProfile: vi.fn(async () => true),
  fetchMihoyoAccountProfile: vi.fn(async () => ({ nickname: '', avatarUrl: '', uid: '' })),
}))

vi.mock('@/utils/mihoyo/nativeImport', () => ({
  canUseNativeMihoyoImport: mocks.canUseNativeMihoyoImport,
  applyNativeMihoyoCookie: mocks.applyNativeMihoyoCookie,
  getNativeMihoyoCookie: mocks.getNativeMihoyoCookie,
  loginMihoyoNativeNewAccount: mocks.loginMihoyoNativeNewAccount,
  logoutMihoyoNativeSession: mocks.logoutMihoyoNativeSession,
  setNativeMihoyoCookie: mocks.setNativeMihoyoCookie,
}))

vi.mock('@/utils/mihoyo/cookie', () => ({
  saveMihoyoCookie: mocks.saveMihoyoCookie,
  listMihoyoAccounts: mocks.listMihoyoAccounts,
  getActiveMihoyoAccount: mocks.getActiveMihoyoAccount,
  clearMihoyoCookieState: mocks.clearMihoyoCookieState,
  loadMihoyoCookieState: mocks.loadMihoyoCookieState,
  markMihoyoCookieInvalid: mocks.markMihoyoCookieInvalid,
  removeMihoyoAccount: mocks.removeMihoyoAccount,
  renameMihoyoAccount: mocks.renameMihoyoAccount,
  switchMihoyoAccount: mocks.switchMihoyoAccount,
  isAutoMihoyoAccountLabel: mocks.isAutoMihoyoAccountLabel,
  upsertMihoyoAccountProfile: mocks.upsertMihoyoAccountProfile,
}))

vi.mock('@/utils/mihoyo/accountProfile', () => ({
  fetchMihoyoAccountProfile: mocks.fetchMihoyoAccountProfile,
}))

vi.mock('@/utils/mihoyo/index', () => ({
  validateMihoyoCookie: () => true,
  isMihoyoCookieExpiredError: () => false,
}))

import { useMihoyoCookieState } from '../useMihoyoCookieState'

const COOKIE = 'ltuid_v2=1001; ltoken_v2=abc; cookie_token_v2=def'

describe('useMihoyoCookieState（安卓端粘贴 Cookie 同步原生会话）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.canUseNativeMihoyoImport.mockReturnValue(false)
    mocks.getNativeMihoyoCookie.mockResolvedValue('')
    mocks.setNativeMihoyoCookie.mockResolvedValue(true)
    mocks.applyNativeMihoyoCookie.mockResolvedValue({ ok: true, unsupported: false })
    mocks.listMihoyoAccounts.mockResolvedValue([])
    mocks.getActiveMihoyoAccount.mockResolvedValue(null)
    mocks.loadMihoyoCookieState.mockResolvedValue({ cookie: '', invalidAt: '' })
  })

  it('网页端提交 Cookie 不碰原生会话', async () => {
    const state = useMihoyoCookieState()
    const result = await state.submitNewAccountCookie(COOKIE, true)

    expect(result).toMatchObject({ ok: true, cookie: COOKIE, nativeApplied: true })
    expect(mocks.applyNativeMihoyoCookie).not.toHaveBeenCalled()
    expect(mocks.saveMihoyoCookie).toHaveBeenCalledWith(COOKIE, expect.any(Object))
  })

  it('安卓端提交 Cookie 会写入原生会话', async () => {
    mocks.canUseNativeMihoyoImport.mockReturnValue(true)

    const state = useMihoyoCookieState()
    const result = await state.submitNewAccountCookie(COOKIE, true)

    expect(mocks.applyNativeMihoyoCookie).toHaveBeenCalledWith(COOKIE)
    expect(result).toMatchObject({
      ok: true,
      cookie: COOKIE,
      nativeApplied: true,
      nativeUnsupported: false,
    })
  })

  it('安卓端旧插件不支持写入时返回 nativeApplied=false', async () => {
    mocks.canUseNativeMihoyoImport.mockReturnValue(true)
    mocks.applyNativeMihoyoCookie.mockResolvedValue({ ok: false, unsupported: true })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const state = useMihoyoCookieState()
    const result = await state.submitNewAccountCookie(COOKIE, true)

    expect(result).toMatchObject({
      ok: true,
      nativeApplied: false,
      nativeUnsupported: true,
    })
    // Cookie 仍会留在本机账号列表，便于用户改用网页登录
    expect(mocks.saveMihoyoCookie).toHaveBeenCalledWith(COOKIE, expect.any(Object))
    warn.mockRestore()
  })

  it('安卓端校验成功后落盘也会同步原生会话', async () => {
    mocks.canUseNativeMihoyoImport.mockReturnValue(true)

    const state = useMihoyoCookieState()
    const result = await state.persistCookieAfterSuccess(COOKIE)

    expect(mocks.applyNativeMihoyoCookie).toHaveBeenCalledWith(COOKIE)
    expect(result).toMatchObject({ saved: true, nativeApplied: true })
  })

  it('未记住 Cookie 时只清会话，不写原生', async () => {
    mocks.canUseNativeMihoyoImport.mockReturnValue(true)

    const state = useMihoyoCookieState()
    const result = await state.persistCookieAfterSuccess()

    expect(mocks.clearMihoyoCookieState).toHaveBeenCalledWith({ keepAccounts: true })
    expect(mocks.applyNativeMihoyoCookie).not.toHaveBeenCalled()
    expect(result).toMatchObject({ saved: false })
  })

  it('安卓端未勾「记住」时不写入账号列表', async () => {
    mocks.canUseNativeMihoyoImport.mockReturnValue(true)
    mocks.getNativeMihoyoCookie.mockResolvedValue(COOKIE)

    const state = useMihoyoCookieState()
    await state.persistNativeCookieAfterSuccess({ remember: false })

    expect(mocks.saveMihoyoCookie).not.toHaveBeenCalled()
  })

  it('安卓端勾了「记住」时把原生会话写入账号列表', async () => {
    mocks.canUseNativeMihoyoImport.mockReturnValue(true)
    mocks.getNativeMihoyoCookie.mockResolvedValue(COOKIE)

    const state = useMihoyoCookieState()
    await state.persistNativeCookieAfterSuccess({ remember: true })

    expect(mocks.saveMihoyoCookie).toHaveBeenCalledWith(COOKIE, expect.any(Object))
  })
})

describe('useMihoyoCookieState 对外状态', () => {
  it('暴露 savedCookieValue / savedCookieInvalid 供结算页读取', () => {
    const state = useMihoyoCookieState()

    // 结算页会用 savedCookieValue.value 自动带入已保存 Cookie；
    // 忘记从 composable 返回会直接抛 "reading 'value'"。
    expect(state.savedCookieValue?.value).toBe('')
    expect(state.savedCookieInvalid?.value).toBe(false)
  })
})
