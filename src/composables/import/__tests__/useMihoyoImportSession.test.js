// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import { useMihoyoImportSession } from '../useMihoyoImportSession'

const state = vi.hoisted(() => ({
  native: false,
  applyNativeThrows: false,
  canAuto: false,
  savedCookieInvalid: false,
  calls: { initialize: 0, native: 0, web: 0, refresh: 0 },
  initDeferred: null,
  webDeferred: null,
  webErrors: [],
  nativeErrors: [],
  refreshResult: { ok: false, kind: 'no-active-account' },
  cookieInput: null,
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key }),
}))

vi.mock('@/composables/import/useMihoyoCookieState', async () => {
  const { ref: vueRef, computed } = await import('vue')
  return {
    useMihoyoCookieState: () => {
      const cookieInput = vueRef('cookie-value')
      state.cookieInput = cookieInput
      return {
        cookieInput,
        rememberCookie: vueRef(false),
        hasSavedCookie: vueRef(false),
        cookieValid: computed(() => true),
        cookieWarningMessage: vueRef(''),
        canAutoSubmitSavedCookie: computed(() => state.canAuto),
        savedCookieInvalid: vueRef(state.savedCookieInvalid),
        accounts: vueRef([]),
        activeAccountId: vueRef(''),
        activeAccountLabel: vueRef(''),
        activeAccountAvatar: vueRef(''),
        refreshingAccountId: vueRef(''),
        initializeCookieState: async () => {
          state.calls.initialize += 1
          if (state.initDeferred) await state.initDeferred
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
        refreshCookieAfterExpiry: async () => {
          state.calls.refresh += 1
          const result = state.refreshResult
          if (result?.ok && result.cookie) cookieInput.value = result.cookie
          return result
        },
        saveStokenForAccount: vi.fn(),
        loginNewAccountNative: vi.fn(),
        submitNewAccountCookie: vi.fn(),
      }
    },
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

  function expiredError() {
    return Object.assign(new Error('登录状态已失效'), { code: 'COOKIE_EXPIRED' })
  }

  beforeEach(() => {
    state.native = false
    state.applyNativeThrows = false
    state.canAuto = false
    state.savedCookieInvalid = false
    state.calls = { initialize: 0, native: 0, web: 0, refresh: 0 }
    state.initDeferred = null
    state.webDeferred = null
    state.webErrors = []
    state.nativeErrors = []
    state.refreshResult = { ok: false, kind: 'no-active-account' }
    state.cookieInput = null
    active = ref(false)
    onList = vi.fn()
    session = null
  })

  function mountHarness(onSession) {
    return mount({
      setup() {
        session = useMihoyoImportSession({
          fetchNative: async () => {
            state.calls.native += 1
            const error = state.nativeErrors.shift()
            if (error) throw error
            return [{ shop_code: 'native' }]
          },
          fetchWeb: async () => {
            state.calls.web += 1
            if (state.webDeferred) await state.webDeferred
            const error = state.webErrors.shift()
            if (error) throw error
            return [{ shop_code: 'web' }]
          },
          onList,
          listStepName: 'list',
          isEmbedded: () => true,
          isEmbeddedActive: () => active.value,
        })
        onSession?.(session)
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

  it('Web 拉取 Cookie 失效：stoken 静默换票后自动重试一次', async () => {
    state.webErrors.push(expiredError())
    state.refreshResult = { ok: true, cookie: 'fresh-cookie' }
    const wrapper = mountHarness()

    await session.startFetch()

    expect(state.calls.refresh).toBe(1)
    expect(state.calls.web).toBe(2)
    expect(state.cookieInput.value).toBe('fresh-cookie')
    expect(session.step.value).toBe('list')
    expect(session.fetchRunning.value).toBe(false)
    expect(onList).toHaveBeenCalledWith([{ shop_code: 'web' }], {})

    wrapper.unmount()
  })

  it('安卓原生拉取 Cookie 失效：stoken 静默换票后自动重试一次', async () => {
    state.native = true
    state.nativeErrors.push(expiredError())
    state.refreshResult = { ok: true, cookie: 'fresh-cookie' }
    const wrapper = mountHarness()

    await session.startFetch()

    expect(state.calls.refresh).toBe(1)
    expect(state.calls.native).toBe(2)
    expect(state.cookieInput.value).toBe('fresh-cookie')
    expect(session.step.value).toBe('list')
    expect(session.fetchRunning.value).toBe(false)

    wrapper.unmount()
  })

  it('stoken 也换不到新 Cookie 时回 Cookie 步，不重复换票', async () => {
    state.native = true
    state.nativeErrors.push(expiredError())
    state.refreshResult = { ok: false, kind: 'no-stoken' }
    const wrapper = mountHarness()

    await session.startFetch()

    expect(state.calls.refresh).toBe(1)
    expect(state.calls.native).toBe(1)
    expect(session.step.value).toBe('cookie')

    wrapper.unmount()
  })

  it('安卓端已标记失效的 Cookie：bootstrap 先用 stoken 换票再拉取', async () => {
    state.native = true
    state.savedCookieInvalid = true
    state.refreshResult = { ok: true, cookie: 'fresh-cookie' }
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb()
      return 1
    })
    active.value = true
    const wrapper = mountHarness()

    await vi.waitFor(() => {
      expect(session.step.value).toBe('list')
    })

    expect(state.calls.refresh).toBe(1)
    expect(state.calls.native).toBe(1)
    expect(state.cookieInput.value).toBe('fresh-cookie')

    rafSpy.mockRestore()
    wrapper.unmount()
  })

  it('安卓端已标记失效且 stoken 换票失败：bootstrap 停在 Cookie 步', async () => {
    state.native = true
    state.savedCookieInvalid = true
    state.refreshResult = { ok: false, kind: 'no-stoken' }
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb()
      return 1
    })
    active.value = true
    const wrapper = mountHarness()

    await vi.waitFor(() => {
      expect(state.calls.refresh).toBe(1)
    })

    expect(state.calls.native).toBe(0)
    expect(session.step.value).toBe('cookie')

    rafSpy.mockRestore()
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

  it('切离内嵌 tab 时关闭会话弹层（AppSheet 会 Teleport 到 body，不跟 tab 隐藏）', async () => {
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb()
      return 1
    })
    active.value = true
    const wrapper = mountHarness()

    session.showQrLogin.value = true
    session.showAccountSheet.value = true
    session.showErrorDialog.value = true

    active.value = false
    await nextTick()

    expect(session.showQrLogin.value).toBe(false)
    expect(session.showAccountSheet.value).toBe(false)
    expect(session.showErrorDialog.value).toBe(false)

    rafSpy.mockRestore()
    wrapper.unmount()
  })

  it('加载中卸载：到达的拉取结果不再回调 onList（避免在别的页面做整表规整）', async () => {
    const wrapper = mountHarness()
    let resolveWeb
    state.webDeferred = new Promise((resolve) => {
      resolveWeb = resolve
    })

    const pending = session.startFetch()
    expect(session.step.value).toBe('loading')

    wrapper.unmount()
    resolveWeb()
    await pending

    expect(onList).not.toHaveBeenCalled()
    expect(session.step.value).not.toBe('list')
    expect(session.fetchRunning.value).toBe(false)
  })

  it('加载中卸载：未完成的激活 bootstrap 不再发起原生拉取', async () => {
    state.native = true
    active.value = true
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb()
      return 1
    })
    let resolveInit
    state.initDeferred = new Promise((resolve) => {
      resolveInit = resolve
    })

    const wrapper = mountHarness()
    expect(state.calls.initialize).toBe(1)

    wrapper.unmount()
    resolveInit()
    await nextTick()
    await Promise.resolve()

    expect(state.calls.native).toBe(0)
    expect(session.step.value).toBe('cookie')

    rafSpy.mockRestore()
  })

  it('另一个导入正在拉取时，激活的 tab 不并发发起第二次自动拉取', async () => {
    state.canAuto = true
    let resolveWeb
    state.webDeferred = new Promise((resolve) => {
      resolveWeb = resolve
    })

    // 第一个视图：手动拉取，挂起中（模拟购物车还在加载）
    const wrapperA = mountHarness()
    const pending = session.startFetch()
    expect(state.calls.web).toBe(1)

    // 第二个视图被激活：bootstrap 读到已保存 Cookie，但不该并发再拉
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb()
      return 1
    })
    let second = null
    const wrapperB = mountHarness((s) => {
      second = s
    })
    active.value = true
    await nextTick()
    await Promise.resolve()
    await Promise.resolve()

    expect(state.calls.web).toBe(1)
    expect(second.step.value).toBe('cookie')

    // 第一次拉取结束后，自动拉取不再被拦（下一次激活可正常开始）
    resolveWeb()
    await pending
    expect(session.fetchRunning.value).toBe(false)

    rafSpy.mockRestore()
    wrapperA.unmount()
    wrapperB.unmount()
  })
})
