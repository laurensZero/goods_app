// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zhCommon from '@/locales/zh-CN/common.json'

// 图片缓存/缩略图/Referer 策略全部桩掉：这里只验证失败降级与 fallbackEnabled
vi.mock('@/utils/image/cache', () => ({
  getCachedImage: vi.fn(async (url) => url),
  peekCachedImage: vi.fn(() => null),
  invalidateCachedImage: vi.fn(async () => {}),
  isFileBackedUri: vi.fn(() => false),
  markImageDecoded: vi.fn(),
  refreshCachedImage: vi.fn(async (url) => url)
}))
vi.mock('@/utils/image/thumb', () => ({
  getCachedImageThumb: vi.fn(async (url) => url),
  peekImageThumb: vi.fn(() => null),
  refreshCachedImageThumb: vi.fn(async (url) => url)
}))
vi.mock('@/utils/image/imageRequestPolicy', () => ({
  resolveImageRequestReferrerPolicy: vi.fn(() => '')
}))

import LazyCachedImage from '../LazyCachedImage.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: { 'zh-CN': zhCommon },
  missingWarn: false,
  fallbackWarn: false
})

function mountImage(props = {}) {
  return mount(LazyCachedImage, {
    props: { src: 'https://example.com/a.png', lazy: false, ...props },
    global: { plugins: [i18n] }
  })
}

/** 内置重试上限是 3 次，连续触发 error 直到组件放弃 */
async function exhaustRetries(wrapper) {
  for (let i = 0; i < 6; i += 1) {
    const img = wrapper.find('img')
    if (!img.exists()) break
    await img.trigger('error')
    await flushPromises()
  }
}

describe('LazyCachedImage fallbackEnabled', () => {
  it('默认保留内置「加载失败」占位（现有调用方行为不变）', async () => {
    const wrapper = mountImage()
    await flushPromises()
    await exhaustRetries(wrapper)
    expect(wrapper.find('.lazy-image-fallback').exists()).toBe(true)
  })

  it('fallbackEnabled=false 时失败不渲染占位，并抛出 error 事件', async () => {
    const wrapper = mountImage({ fallbackEnabled: false })
    await flushPromises()
    await exhaustRetries(wrapper)

    expect(wrapper.emitted('error')).toBeTruthy()
    expect(wrapper.find('.lazy-image-fallback').exists()).toBe(false)
    expect(wrapper.find('img').exists()).toBe(false)
  })
})
