// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zhCN from '@/locales/zh-CN/import.json'

vi.mock('@/utils/mihoyo/nativeImport', () => ({
  canUseNativeMihoyoImport: vi.fn(() => false),
}))

import MihoyoAccountSheet from '../MihoyoAccountSheet.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
  missingWarn: false,
  fallbackWarn: false,
})

function findButton(label) {
  return Array.from(document.body.querySelectorAll('button'))
    .find((item) => item.textContent.includes(label))
}

const ACCOUNT = {
  id: '301532617',
  accountId: '301532617',
  label: 'laurensZero',
  cookie: 'account_id=301532617; account_mid_v2=0ppobignrz_mhy; ltoken=old; cookie_token=old',
  hasStoken: false,
}

async function openAndSubmit({ saveStoken, stokenErrorMessage = null }) {
  const wrapper = mount(MihoyoAccountSheet, {
    attachTo: document.body,
    props: {
      modelValue: true,
      accounts: [ACCOUNT],
      saveStoken,
      stokenErrorMessage,
    },
    global: { plugins: [i18n] },
  })
  await nextTick()
  await nextTick()

  const edit = findButton(i18n.global.t('import.stokenSet'))
  expect(edit).toBeTruthy()
  edit.click()
  await nextTick()
  await nextTick()

  const textarea = document.body.querySelector('.stoken-textarea')
  expect(textarea).toBeTruthy()
  textarea.value = 'stoken=v2_abcDEF123=; mid=0ppobignrz_mhy; stuid=301532617'
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
  await nextTick()

  const save = document.body.querySelector('.mihoyo-stoken-sheet .sheet-primary')
  expect(save).toBeTruthy()
  save.click()
  await flushPromises()

  return wrapper
}

describe('MihoyoAccountSheet stoken 保存', () => {
  let wrapper = null

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    document.body.innerHTML = ''
  })

  it('点击保存并刷新会直接调用 saveStoken', async () => {
    const saveStoken = vi.fn(async () => ({ ok: true }))
    wrapper = await openAndSubmit({ saveStoken })

    expect(saveStoken).toHaveBeenCalledWith(
      '301532617',
      'stoken=v2_abcDEF123=; mid=0ppobignrz_mhy; stuid=301532617'
    )
  })

  it('保存失败时展示 stokenErrorMessage 的文案', async () => {
    const saveStoken = vi.fn(async () => ({ ok: false, kind: 'auth' }))
    wrapper = await openAndSubmit({
      saveStoken,
      stokenErrorMessage: () => 'stoken 已失效，请重新获取',
    })

    expect(saveStoken).toHaveBeenCalled()
    expect(document.body.textContent).toContain('stoken 已失效，请重新获取')
  })
})
