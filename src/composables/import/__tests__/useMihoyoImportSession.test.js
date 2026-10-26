// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import { useMihoyoImportSession } from '../useMihoyoImportSession'

const state = vi.hoisted(() => ({
  native: false,
  applyNativeThrows: false,
  calls: { initialize: 0, native: 0, web: 0 },
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key }),
}))

vi.mock('@/composables/import/useMihoyoCookieState', async () => {
  const { ref: vueRef, computed } = await import('vue')
  return {
    useMihoyoCookieState: () => ({
      cookieInput: vueRef('cookie-value'),
      rememberCookie: vueRef(false),
      hasSavedCookie: vueRef(false),
      cookieValid: computed(() => true),
      cookieWarningMessage: vueRef(''),
      canAutoSubmitSavedCookie: computed(() => false),
      accounts: vueRef([]),
      activeAccountId: vueRef(''),
      activeAccountLabel: vueRef(''),
      activeAccountAvatar: vueRef(''),
      refreshingAccountId: vueRef(''),
      initializeCookieState: async () => {
        state.calls.initialize += 1
      },
      applySavedCookieToInput: () => {},
      applyCookieToNativeSession: async () => {
        if (state.applyNativeThrows) throw new Error('native session unavailable')
        return { applied: true, unsupported: false }
      },
      persistCookieAfterSuccess: async () => {},
      persistNativeCookieAfterSuccess: async () => {},
      handleCookieFailure: async () => false,
      switchAccount: vi.fn(),
      removeAccount: vi.fn(),
      refreshAccountProfiles: vi.fn(),
      refreshAccountWithStoken: vi.fn(),
      saveStokenForAccount: vi.fn(),
      loginNewAccountNative: vi.fn(),
      submitNewAccountCookie: vi.fn(),
    }),
  }
})

vi.mock('@/utils/mihoyo/nativeImport', () => ({
  canUseNativeMihoyoImport: () => state.native,
}))

vi.mock('@/utils/mihoyo/stokenMessages', () => ({
  stokenErrorMessage: () => '',
}))

describe('useMihoyoImportSession', () => {
  let active
  let onList
  let session

  beforeEach(() => {
    state.native = false
    state.applyNativeThrows = false
    state.calls = { initialize: 0, native: 0, web: 0 }
    active = ref(false)
    onList = vi.fn()
    session = null
  })

  function mountHarness() {
    return mount({
      setup() {
        session = useMihoyoImportSession({
          fetchNative: async () => {
            state.calls.native += 1
            return [{ shop_code: 'native' }]
          },
          fetchWeb: async () => {
            state.calls.web += 1
            return [{ shop_code: 'web' }]
          },
          onList,
          listStepName: 'list',
          isEmbedded: () => true,
          isEmbeddedActive: () => active.value,
        })
        return {}
      },
      template: '<div />',
    })
  }

  it('内嵌 tab 激活后才 bootstrap（预挂载不读本地状态）', async () => {
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb()
      return 1
    })
    const wrapper = mountHarness()

    expect(state.calls.initialize).toBe(0)
    active.value = true
    await nextTick()
    expect(state.calls.initialize).toBe(1)

    rafSpy.mockRestore()
    wrapper.unmount()
  })

  it('startFetch 更新会话门自己的 step（视图与拉取共用同一状态）', async () => {
    const wrapper = mountHarness()

    expect(session.step.value).toBe('cookie')
    const pending = session.startFetch()
    expect(session.step.value).toBe('loading')
    await pending

    expect(session.step.value).toBe('list')
    expect(onList).toHaveBeenCalledWith([{ shop_code: 'web' }], {})
    expect(session.fetchRunning.value).toBe(false)

    wrapper.unmount()
  })

  it('原生 Cookie 写入抛错时也会解锁并回到 cookie 步', async () => {
    state.native = true
    state.applyNativeThrows = true
    const wrapper = mountHarness()

    await session.startFetch()

    expect(session.fetchRunning.value).toBe(false)
    expect(session.step.value).toBe('cookie')
    expect(state.calls.native).toBe(0)

    wrapper.unmount()
  })
})
