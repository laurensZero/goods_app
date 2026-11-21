// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zhMy from '@/locales/zh-CN/my.json'

// 目录数据 mock 掉，不碰 Supabase
const bubbles = vi.hoisted(() => ({ loadBubbleCatalog: vi.fn() }))
vi.mock('@/services/mhyDecor/bubbles', () => ({
  loadBubbleCatalog: bubbles.loadBubbleCatalog
}))

// LazyCachedImage 内部走图片缓存管线，桩掉只关心取图地址
vi.mock('@/components/image/LazyCachedImage.vue', () => ({
  default: {
    name: 'LazyCachedImage',
    props: ['src', 'alt'],
    template: '<span class="stub-lazy" :data-src="src" />'
  }
}))

// AppSheet 传送到 body + 动画层太多，桩成直渲染方便 find
vi.mock('@/components/common/AppSheet.vue', () => ({
  default: {
    name: 'AppSheet',
    props: ['modelValue', 'sheetClass'],
    emits: ['update:modelValue', 'opened', 'closed'],
    template: '<div v-if="modelValue" class="stub-sheet"><slot /></div>'
  }
}))

vi.mock('@/components/common/AppToast.vue', () => ({
  default: { name: 'AppToast', props: ['message'], template: '<div class="stub-toast">{{ message }}</div>' }
}))

import MhyBubblePickerSheet from '../MhyBubblePickerSheet.vue'
import { resolveBubbleSrc } from '@/utils/mhyDecor/cdn'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: { 'zh-CN': zhMy },
  missingWarn: false,
  fallbackWarn: false
})

const ITEMS = [
  {
    i: 'msb:1', s: 'miyoushe', g: '原神', n: '可莉气泡', d: '',
    u: 'https://bbs-static.miyoushe.com/a.png',
    bg: 'ffeeaa', gif: '',
    m: 'https://abc.supabase.co/storage/v1/object/public/mhy-decor/mirror/a.png',
    t: 'https://abc.supabase.co/storage/v1/object/public/mhy-decor/thumb/a.webp',
    a: false
  },
  {
    i: 'msb:2', s: 'miyoushe', g: '原神', n: '派蒙气泡', d: '',
    u: 'https://bbs-static.miyoushe.com/b.png',
    bg: '', gif: 'https://bbs-static.miyoushe.com/b.gif',
    m: '', t: '', a: true
  },
  {
    i: 'msb:9', s: 'miyoushe', g: '崩坏：星穹铁道', n: '三月七气泡', d: '',
    u: 'https://bbs-static.miyoushe.com/c.png',
    bg: '', gif: '', m: '', t: '', a: false
  }
]

function mountSheet(props = {}) {
  return mount(MhyBubblePickerSheet, {
    props: { modelValue: false, bubble: null, pageKey: 'home', ...props },
    global: { plugins: [i18n] }
  })
}

async function openSheet(props = {}) {
  bubbles.loadBubbleCatalog.mockResolvedValue(ITEMS)
  const wrapper = mountSheet(props)
  await wrapper.setProps({ modelValue: true })
  await flushPromises()
  return wrapper
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('MhyBubblePickerSheet', () => {
  it('打开时拉目录并按 canonical 顺序渲染 IP chips 与网格（含「无气泡」tile）', async () => {
    const wrapper = await openSheet()
    expect(bubbles.loadBubbleCatalog).toHaveBeenCalledTimes(1)

    const chips = wrapper.findAll('.bubble-chip').map((c) => c.text())
    expect(chips).toEqual(['全部', '原神', '崩坏：星穹铁道'])

    const tiles = wrapper.findAll('.bubble-tile')
    expect(tiles).toHaveLength(4) // 无装扮 + 3 条
    expect(tiles[0].text()).toContain('无装扮')
    expect(wrapper.find('.bubble-sheet__count').text()).toBe('3 件')
  })

  it('标题带页面名，区分正在编辑哪一页（App 内统一叫「装扮」）', async () => {
    const wrapper = await openSheet({ pageKey: 'wishlist' })
    expect(wrapper.find('.bubble-sheet__title').text()).toBe('编辑装扮 · 心愿单')
  })

  it('动图 tile 带「动」角标，预览直接播 gif', async () => {
    const wrapper = await openSheet()
    const badges = wrapper.findAll('.bubble-tile__badge').map((b) => b.text())
    expect(badges).toEqual(['动'])

    // 预览与主页一致：动图直出 gif，静态项走原图 CDN 现场缩 w_128
    const previews = wrapper.findAll('.stub-lazy').map((n) => n.attributes('data-src'))
    expect(previews[0]).toBe(`${ITEMS[0].u}?x-oss-process=image/resize,w_128/format,webp`)
    expect(previews[1]).toBe(ITEMS[1].gif)
    expect(previews[2]).toBe(resolveBubbleSrc(ITEMS[2], { preview: true }))
  })

  it('搜索实时过滤（按名称原文包含）', async () => {
    const wrapper = await openSheet()
    const input = wrapper.find('.bubble-sheet__search input')
    await input.setValue('派蒙')
    expect(wrapper.findAll('.bubble-tile')).toHaveLength(2) // 无气泡 + 命中项
    expect(wrapper.find('.bubble-sheet__count').text()).toBe('1 件')
  })

  it('点 IP chip 过滤对应条目', async () => {
    const wrapper = await openSheet()
    await wrapper.findAll('.bubble-chip')[2].trigger('click') // 崩坏：星穹铁道
    const tiles = wrapper.findAll('.bubble-tile')
    expect(tiles).toHaveLength(2) // 无气泡 + msb:9
    expect(tiles[1].text()).toContain('三月七气泡')
  })

  it('点 tile 立即 emit select（紧凑项字段齐全含 bg/gif），点「无气泡」emit null', async () => {
    const wrapper = await openSheet()
    const tiles = wrapper.findAll('.bubble-tile')

    await tiles[1].trigger('click')
    expect(wrapper.emitted('select')).toEqual([[
      {
        i: 'msb:1',
        u: 'https://bbs-static.miyoushe.com/a.png',
        bg: 'ffeeaa',
        gif: '',
        a: false,
        t: 'https://abc.supabase.co/storage/v1/object/public/mhy-decor/thumb/a.webp',
        m: 'https://abc.supabase.co/storage/v1/object/public/mhy-decor/mirror/a.png',
        n: '可莉气泡'
      }
    ]])
    expect(tiles[1].classes()).toContain('bubble-tile--active')

    // 重复点同一个 tile 不重复 emit
    await tiles[1].trigger('click')
    expect(wrapper.emitted('select')).toHaveLength(1)

    // 切到「无气泡」→ emit null
    await tiles[0].trigger('click')
    expect(wrapper.emitted('select')[1]).toEqual([null])
    expect(tiles[0].classes()).toContain('bubble-tile--active')
  })

  it('已选气泡回显选中态，点「完成」关闭弹窗', async () => {
    const wrapper = await openSheet({ bubble: { i: 'msb:9' } })
    const tiles = wrapper.findAll('.bubble-tile')
    expect(tiles[3].classes()).toContain('bubble-tile--active')

    await wrapper.find('.bubble-sheet__done').trigger('click')
    expect(wrapper.emitted('update:modelValue')[0]).toEqual([false])
  })

  it('目录拉取失败时展示空态', async () => {
    bubbles.loadBubbleCatalog.mockResolvedValue([])
    const wrapper = mountSheet()
    await wrapper.setProps({ modelValue: true })
    await flushPromises()
    expect(wrapper.find('.bubble-sheet__empty').exists()).toBe(true)
    expect(wrapper.findAll('.bubble-tile')).toHaveLength(0)
  })

  it('刷新按钮：force 触发参数传递，成功轻提示', async () => {
    const wrapper = await openSheet()
    bubbles.loadBubbleCatalog.mockClear()
    // 刷新返回新目录（第二条改名），网格同步更新
    bubbles.loadBubbleCatalog.mockResolvedValueOnce([
      { ...ITEMS[0], n: '可莉气泡（新）' },
      ITEMS[1],
      ITEMS[2]
    ])

    await wrapper.find('.bubble-sheet__refresh').trigger('click')
    await flushPromises()

    expect(bubbles.loadBubbleCatalog).toHaveBeenCalledWith({ force: true })
    expect(wrapper.find('.stub-toast').text()).toContain('装扮列表已更新')
    expect(wrapper.findAll('.bubble-tile')[1].text()).toContain('可莉气泡（新）')
    expect(wrapper.find('.bubble-sheet__refresh').attributes('disabled')).toBeUndefined()
  })

  it('刷新中置灰防连点（in-flight 只打一次 force）', async () => {
    const wrapper = await openSheet()
    bubbles.loadBubbleCatalog.mockClear()
    let resolveRefresh
    bubbles.loadBubbleCatalog.mockImplementation(
      () => new Promise((resolve) => { resolveRefresh = resolve })
    )

    await wrapper.find('.bubble-sheet__refresh').trigger('click')
    const btn = wrapper.find('.bubble-sheet__refresh')
    expect(btn.attributes('disabled')).toBeDefined()

    // in-flight 期间连点：防抖早退，不再触发第二次 force
    await btn.trigger('click')
    expect(bubbles.loadBubbleCatalog).toHaveBeenCalledTimes(1)

    resolveRefresh(ITEMS)
    await flushPromises()
    expect(wrapper.find('.bubble-sheet__refresh').attributes('disabled')).toBeUndefined()
  })

  it('刷新失败：报错提示「已显示缓存内容」，旧列表保持不动', async () => {
    const wrapper = await openSheet()
    bubbles.loadBubbleCatalog.mockClear()
    bubbles.loadBubbleCatalog.mockRejectedValueOnce(new Error('boom'))

    await wrapper.find('.bubble-sheet__refresh').trigger('click')
    await flushPromises()

    expect(wrapper.find('.stub-toast').text()).toContain('已显示缓存内容')
    // 服务层兜底旧缓存，网格还是原来的 4 个 tile（无装扮 + 3 条）
    expect(wrapper.findAll('.bubble-tile')).toHaveLength(4)
    expect(wrapper.find('.bubble-sheet__refresh').attributes('disabled')).toBeUndefined()
  })
})
