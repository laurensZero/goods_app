// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zhMy from '@/locales/zh-CN/my.json'

// 目录数据 mock 掉，不碰 Supabase
const catalog = vi.hoisted(() => ({ loadPendantCatalog: vi.fn() }))
vi.mock('@/services/mhyDecor/catalog', () => ({
  loadPendantCatalog: catalog.loadPendantCatalog
}))

// MhyAvatarFrame 内部走图片缓存管线，桩掉只关心 tile 数量/交互
vi.mock('@/components/common/MhyAvatarFrame.vue', () => ({
  default: {
    name: 'MhyAvatarFrame',
    props: ['avatar', 'frame', 'frameMirror', 'frameThumb', 'size', 'animated', 'playAnimation'],
    template: '<span class="stub-frame">{{ frame }}</span>'
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

import MhyDecorPickerSheet from '../MhyDecorPickerSheet.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: { 'zh-CN': zhMy },
  missingWarn: false,
  fallbackWarn: false
})

const ITEMS = [
  {
    i: 'ms:1', s: 'miyoushe', g: '原神', n: '温迪头像框', d: '',
    u: 'https://bbs-static.miyoushe.com/a.png',
    m: 'https://abc.supabase.co/storage/v1/object/public/mhy-decor/mirror/a.png',
    t: 'https://abc.supabase.co/storage/v1/object/public/mhy-decor/thumb/a.webp',
    a: false
  },
  {
    i: 'ms:2', s: 'miyoushe', g: '原神', n: '派蒙挂件', d: '',
    u: 'https://bbs-static.miyoushe.com/b.png', m: '', t: '', a: true
  },
  {
    i: 'hy:9', s: 'hoyolab', g: '绝区零', n: '德巴拉', d: '',
    u: 'https://upload-os-bbs.hoyolab.com/c.png', m: '', t: '', a: false
  }
]

function mountSheet(props = {}) {
  return mount(MhyDecorPickerSheet, {
    props: { modelValue: false, pendant: null, ...props },
    global: { plugins: [i18n] }
  })
}

async function openSheet(props = {}) {
  catalog.loadPendantCatalog.mockResolvedValue(ITEMS)
  const wrapper = mountSheet(props)
  await wrapper.setProps({ modelValue: true })
  await flushPromises()
  return wrapper
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('MhyDecorPickerSheet', () => {
  it('打开时拉目录并按 canonical 顺序渲染 IP chips 与网格（含「无挂件」tile）', async () => {
    const wrapper = await openSheet()
    expect(catalog.loadPendantCatalog).toHaveBeenCalledTimes(1)

    const chips = wrapper.findAll('.pendant-chip').map((c) => c.text())
    // 目录里出现过的 IP 按 constants/mhyDecor.js 的顺序排，头部固定「全部」
    expect(chips).toEqual(['全部', '原神', '绝区零'])

    const tiles = wrapper.findAll('.pendant-tile')
    expect(tiles).toHaveLength(4) // 无挂件 + 3 条
    expect(tiles[0].text()).toContain('无挂件')
    expect(wrapper.find('.pendant-sheet__count').text()).toBe('3 件')
  })

  it('动图 tile 带「动」角标，并在预览里直接播动画', async () => {
    const wrapper = await openSheet()
    const badges = wrapper.findAll('.pendant-tile__badge').map((b) => b.text())
    expect(badges).toEqual(['动'])

    // 列表里也播动图：动图 tile 传 play-animation，静态 tile 保持压平
    const frames = wrapper.findAllComponents({ name: 'MhyAvatarFrame' })
    const animated = frames.filter((f) => f.props('animated'))
    expect(animated).toHaveLength(1)
    expect(animated[0].props('playAnimation')).toBe(true)
  })

  it('搜索实时过滤：查询带后缀时靠归一化命中', async () => {
    const wrapper = await openSheet()
    const input = wrapper.find('.pendant-sheet__search input')
    // 「温迪挂件」原文匹配不到「温迪头像框」，去掉后缀归一化后命中
    await input.setValue('温迪挂件')
    expect(wrapper.findAll('.pendant-tile')).toHaveLength(2) // 无挂件 + 命中项
    expect(wrapper.find('.pendant-sheet__count').text()).toBe('1 件')

    // 搜「挂件」归一化后为空串，退回原文匹配
    await input.setValue('挂件')
    expect(wrapper.findAll('.pendant-tile')).toHaveLength(2) // 无挂件 + 派蒙挂件
  })

  it('点 IP chip 过滤对应条目', async () => {
    const wrapper = await openSheet()
    await wrapper.findAll('.pendant-chip')[2].trigger('click') // 绝区零
    const tiles = wrapper.findAll('.pendant-tile')
    expect(tiles).toHaveLength(2) // 无挂件 + hy:9
    expect(tiles[1].text()).toContain('德巴拉')
  })

  it('点 tile 立即 emit select（紧凑项字段齐全），点「无挂件」emit null', async () => {
    const wrapper = await openSheet()
    const tiles = wrapper.findAll('.pendant-tile')

    await tiles[1].trigger('click')
    expect(wrapper.emitted('select')).toEqual([[
      {
        i: 'ms:1',
        u: 'https://bbs-static.miyoushe.com/a.png',
        t: 'https://abc.supabase.co/storage/v1/object/public/mhy-decor/thumb/a.webp',
        m: 'https://abc.supabase.co/storage/v1/object/public/mhy-decor/mirror/a.png',
        a: false,
        n: '温迪头像框'
      }
    ]])
    expect(tiles[1].classes()).toContain('pendant-tile--active')

    // 重复点同一个 tile 不重复 emit
    await tiles[1].trigger('click')
    expect(wrapper.emitted('select')).toHaveLength(1)

    // 切到「无挂件」→ emit null
    await tiles[0].trigger('click')
    expect(wrapper.emitted('select')[1]).toEqual([null])
    expect(tiles[0].classes()).toContain('pendant-tile--active')
  })

  it('已选挂件回显选中态，点「完成」关闭弹窗', async () => {
    const wrapper = await openSheet({ pendant: { i: 'hy:9' } })
    const tiles = wrapper.findAll('.pendant-tile')
    expect(tiles[3].classes()).toContain('pendant-tile--active')

    await wrapper.find('.pendant-sheet__done').trigger('click')
    expect(wrapper.emitted('update:modelValue')[0]).toEqual([false])
  })

  it('目录拉取失败时展示空态', async () => {
    catalog.loadPendantCatalog.mockResolvedValue([])
    const wrapper = mountSheet()
    await wrapper.setProps({ modelValue: true })
    await flushPromises()
    expect(wrapper.find('.pendant-sheet__empty').exists()).toBe(true)
    expect(wrapper.findAll('.pendant-tile')).toHaveLength(0)
  })

  it('刷新按钮：force 触发参数传递，成功轻提示', async () => {
    const wrapper = await openSheet()
    catalog.loadPendantCatalog.mockClear()
    catalog.loadPendantCatalog.mockResolvedValueOnce([{ ...ITEMS[0], n: '温迪头像框（新）' }, ITEMS[1], ITEMS[2]])

    await wrapper.find('.pendant-sheet__refresh').trigger('click')
    await flushPromises()

    expect(catalog.loadPendantCatalog).toHaveBeenCalledWith({ force: true })
    expect(wrapper.find('.stub-toast').text()).toContain('挂件列表已更新')
    expect(wrapper.findAll('.pendant-tile')[1].text()).toContain('温迪头像框（新）')
    expect(wrapper.find('.pendant-sheet__refresh').attributes('disabled')).toBeUndefined()
  })

  it('刷新中置灰防连点（in-flight 只打一次 force）', async () => {
    const wrapper = await openSheet()
    catalog.loadPendantCatalog.mockClear()
    let resolveRefresh
    catalog.loadPendantCatalog.mockImplementation(
      () => new Promise((resolve) => { resolveRefresh = resolve })
    )

    await wrapper.find('.pendant-sheet__refresh').trigger('click')
    const btn = wrapper.find('.pendant-sheet__refresh')
    expect(btn.attributes('disabled')).toBeDefined()

    // in-flight 期间连点：防抖早退，不再触发第二次 force
    await btn.trigger('click')
    expect(catalog.loadPendantCatalog).toHaveBeenCalledTimes(1)

    resolveRefresh(ITEMS)
    await flushPromises()
    expect(wrapper.find('.pendant-sheet__refresh').attributes('disabled')).toBeUndefined()
  })

  it('刷新失败：报错提示「已显示缓存内容」，旧列表保持不动', async () => {
    const wrapper = await openSheet()
    catalog.loadPendantCatalog.mockClear()
    catalog.loadPendantCatalog.mockRejectedValueOnce(new Error('boom'))

    await wrapper.find('.pendant-sheet__refresh').trigger('click')
    await flushPromises()

    expect(wrapper.find('.stub-toast').text()).toContain('已显示缓存内容')
    expect(wrapper.findAll('.pendant-tile')).toHaveLength(4) // 无挂件 + 3 条旧数据
    expect(wrapper.find('.pendant-sheet__refresh').attributes('disabled')).toBeUndefined()
  })
})
