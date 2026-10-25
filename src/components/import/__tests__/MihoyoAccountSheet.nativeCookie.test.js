// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zhCN from '@/locales/zh-CN/import.json'

const mocks = vi.hoisted(() => ({
  canUseNativeMihoyoImport: vi.fn(() => false),
}))

vi.mock('@/utils/mihoyo/nativeImport', () => ({
  canUseNativeMihoyoImport: mocks.canUseNativeMihoyoImport,
}))

import MihoyoAccountSheet from '../MihoyoAccountSheet.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
  missingWarn: false,
  fallbackWarn: false,
})

const t = (key) => i18n.global.t(key)

function mountSheet() {
  return mount(MihoyoAccountSheet, {
    attachTo: document.body,
    props: { modelValue: true },
    global: { plugins: [i18n] },
  })
}

function findButton(label) {
  return Array.from(document.body.querySelectorAll('button'))
    .find((item) => item.textContent.includes(label))
}

describe('MihoyoAccountSheet（安卓端粘贴 Cookie 登录入口）', () => {
  let wrapper = null

  beforeEach(() => {
    mocks.canUseNativeMihoyoImport.mockReturnValue(false)
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    document.body.innerHTML = ''
  })

  it('网页端只保留扫码登录入口，不显示粘贴 Cookie 按钮', async () => {
    wrapper = mountSheet()
    await nextTick()

    expect(findButton(t('import.loginNewAccount'))).toBeTruthy()
    expect(findButton(t('import.loginWithCookie'))).toBeUndefined()
  })

  it('安卓端显示「粘贴 Cookie 登录」并能打开 Cookie 弹层', async () => {
    mocks.canUseNativeMihoyoImport.mockReturnValue(true)

    wrapper = mountSheet()
    await nextTick()

    const cookieEntry = findButton(t('import.loginWithCookie'))
    expect(cookieEntry).toBeTruthy()

    cookieEntry.click()
    await nextTick()

    // Cookie 弹层的输入框出现，账号面板仍留在下层
    expect(document.body.querySelector('#new-account-cookie')).toBeTruthy()
    expect(findButton(t('import.loginNewAccount'))).toBeTruthy()
  })
})
