// @vitest-environment happy-dom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zhMy from '@/locales/zh-CN/my.json'
import zhCommon from '@/locales/zh-CN/common.json'

// 气泡配置 store mock：byPage 由测试直接控制（配置读写逻辑在 store 测试里覆盖）
const bubblesStore = vi.hoisted(() => ({
  byPage: {},
  ensureLoaded: vi.fn(async () => {}),
  setPage: vi.fn(async () => {})
}))
vi.mock('@/stores/mhyBubbles', () => ({
  useMhyBubblesStore: () => bubblesStore
}))

// 选择器桩掉：只断言开/关与 select 透传
vi.mock('@/components/my/MhyBubblePickerSheet.vue', () => ({
  default: {
    name: 'MhyBubblePickerSheet',
    props: ['modelValue', 'bubble', 'pageKey'],
    emits: ['update:modelValue', 'select'],
    template: '<div v-if="modelValue" class="stub-picker" />'
  }
}))

vi.mock('@/components/common/AppToast.vue', () => ({
  default: { name: 'AppToast', props: ['message'], template: '<div class="stub-toast">{{ message }}</div>' }
}))

// 贴角画改用 LazyCachedImage（缓存/换图保留旧像素都在组件内部）：
// 这里桩成裸 <img>，并把 DOM error 转成组件 error 事件，方便测降级链
vi.mock('@/components/image/LazyCachedImage.vue', () => ({
  default: {
    name: 'LazyCachedImage',
    props: ['src', 'alt', 'skeletonEnabled', 'fallbackEnabled'],
    emits: ['error'],
    template: '<img :src="src" :alt="alt" @error="$emit(\'error\')" />'
  }
}))

import MhyBubbleDeco from '../MhyBubbleDeco.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: { 'zh-CN': { ...zhMy, ...zhCommon } },
  missingWarn: false,
  fallbackWarn: false
})

const GIF = 'https://bbs-static.miyoushe.com/anim.gif'
const STATIC_U = 'https://bbs-static.miyoushe.com/static.png'
const ANIMATED = { i: 'msb:1', u: STATIC_U, gif: GIF, a: true, bg: '', m: '', t: '', n: '动图气泡' }
const PLAIN = { i: 'msb:2', u: STATIC_U, gif: '', a: false, bg: '', m: '', t: '', n: '静态气泡' }

async function mountDeco(props = {}) {
  const wrapper = mount(MhyBubbleDeco, {
    props: { pageKey: 'home', ...props },
    global: { plugins: [i18n] }
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  localStorage.clear()
  bubblesStore.byPage = {}
  bubblesStore.ensureLoaded.mockClear()
  bubblesStore.setPage.mockClear()
  bubblesStore.setPage.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('MhyBubbleDeco', () => {
  it('挂载时触发 ensureLoaded（收敛配置 + 限频 refreshUser 在 store 内）', async () => {
    await mountDeco({ pageKey: 'events' })
    expect(bubblesStore.ensureLoaded).toHaveBeenCalledWith('events')
  })

  it('无配置时只渲染编辑按钮（门控由宿主调用点负责，组件始终渲染）', async () => {
    const wrapper = await mountDeco()
    await flushPromises()
    expect(wrapper.find('.mhy-bubble-deco').exists()).toBe(true)
    expect(wrapper.find('.mhy-bubble-deco__edit').exists()).toBe(true)
    expect(wrapper.find('.mhy-bubble-deco__bubble').exists()).toBe(false)
  })

  it('静态气泡：贴角画静态底图', async () => {
    bubblesStore.byPage = { home: PLAIN }
    const wrapper = await mountDeco()
    expect(wrapper.find('.mhy-bubble-deco__bubble img').attributes('src'))
      // 上屏永远是原图级：去参原图，不再拼 OSS 缩放参数
      .toBe(STATIC_U)
  })

  it('动图气泡默认播 gif；gif 加载失败退静态，静态也失败整体隐藏', async () => {
    bubblesStore.byPage = { home: ANIMATED }
    const wrapper = await mountDeco()
    const img = wrapper.find('.mhy-bubble-deco__bubble img')
    expect(img.attributes('src')).toBe(GIF)

    // gif 挂了 → 退静态底图
    await img.trigger('error')
    await flushPromises()
    expect(wrapper.find('.mhy-bubble-deco__bubble img').attributes('src'))
      // 上屏永远是原图级：去参原图，不再拼 OSS 缩放参数
      .toBe(STATIC_U)

    // 静态也挂了 → 装饰元素整体隐藏，不留破图占位
    await wrapper.find('.mhy-bubble-deco__bubble img').trigger('error')
    await flushPromises()
    expect(wrapper.find('.mhy-bubble-deco__bubble').exists()).toBe(false)
    // 编辑入口不受影响
    expect(wrapper.find('.mhy-bubble-deco__edit').exists()).toBe(true)
  })

  it('贴角画走 LazyCachedImage：关闭骨架和内置破图占位（降级交给 error 链）', async () => {
    bubblesStore.byPage = { home: PLAIN }
    const wrapper = await mountDeco()
    const img = wrapper.findComponent({ name: 'LazyCachedImage' })
    expect(img.exists()).toBe(true)
    expect(img.props('skeletonEnabled')).toBe(false)
    expect(img.props('fallbackEnabled')).toBe(false)
  })

  it('点编辑按钮打开选择器；选择器 select 透传 setPage(pageKey, item)', async () => {
    const wrapper = await mountDeco({ pageKey: 'wishlist' })
    expect(wrapper.find('.stub-picker').exists()).toBe(false)

    await wrapper.find('.mhy-bubble-deco__edit').trigger('click')
    expect(wrapper.find('.stub-picker').exists()).toBe(true)

    const picker = wrapper.findComponent({ name: 'MhyBubblePickerSheet' })
    await picker.vm.$emit('select', PLAIN)
    await flushPromises()
    expect(bubblesStore.setPage).toHaveBeenCalledWith('wishlist', PLAIN)

    // 「无气泡」清空该页
    await picker.vm.$emit('select', null)
    await flushPromises()
    expect(bubblesStore.setPage).toHaveBeenCalledWith('wishlist', null)
  })

  it('云端同步失败弹保存失败 toast，本地已即时生效不受影响', async () => {
    bubblesStore.setPage.mockRejectedValueOnce(new Error('offline'))
    const wrapper = await mountDeco()
    await wrapper.find('.mhy-bubble-deco__edit').trigger('click')

    const picker = wrapper.findComponent({ name: 'MhyBubblePickerSheet' })
    await picker.vm.$emit('select', PLAIN)
    await flushPromises()

    expect(wrapper.find('.stub-toast').text()).toContain('装扮保存失败')
  })
})
