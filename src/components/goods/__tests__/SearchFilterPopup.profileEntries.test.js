// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import i18n from '@/locales'
import SearchFilterPopup from '../SearchFilterPopup.vue'

vi.mock('@/composables/viewport/useTabletViewport', () => ({
  useTabletViewport: () => ({
    isTabletViewport: { value: false },
    updateViewport: async () => {}
  })
}))

vi.mock('@/utils/platform/storage', () => ({
  writePersisted: () => {}
}))

// 精确命中（rank 4）不会走到拼音；这里只是避免开着弹窗时异步加载词典
vi.mock('@/utils/pinyin', () => ({
  toPinyinSearchText: () => '',
  warmPinyinCache: async () => {}
}))

const baseFilters = {
  keyword: '',
  categories: [],
  ips: [],
  characters: [],
  storageLocations: [],
  priceMin: '',
  priceMax: '',
  acquiredPreset: 'all',
  acquiredFrom: '',
  acquiredTo: '',
  hasImage: 'any',
  hasNote: 'any',
  collectStatuses: [],
  customFields: {},
  sortBy: 'acquiredAt_desc',
  matchPinyin: true,
  matchCase: false,
  includeNote: true
}

function clickOn(element) {
  element?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

function entryNodes(scope = document) {
  return [...scope.querySelectorAll('.profile-entry')]
}

async function mountPopup(props = {}) {
  const wrapper = mount(SearchFilterPopup, {
    props: {
      visible: true,
      filters: { ...baseFilters },
      customFieldFilterGroups: [],
      categoryOptions: [],
      ipOptions: [],
      characterOptions: [],
      visibleCharacterOptions: [],
      storageLocationTree: [],
      hasUnassignedStorageLocation: false,
      activeFilterCount: 0,
      scope: 'collection',
      searchPresets: [],
      formatPresetSummary: () => '',
      ...props
    },
    global: { plugins: [i18n] },
    attachTo: document.body
  })
  await wrapper.vm.$nextTick()
  // 高级筛选默认折叠，展开后才渲染筛选卡片
  clickOn(document.querySelector('.advanced-toggle'))
  await wrapper.vm.$nextTick()
  return wrapper
}

const twoIps = [
  { name: '小樱', ip: 'IP-A' },
  { name: '小樱', ip: 'IP-B' }
]

const singleIp = [
  { name: '小樱', ip: 'IP-A' }
]

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('SearchFilterPopup 收藏馆入口（角色重名跨 IP）', () => {
  it('关键词命中角色时，每个 IP 各给一个入口并标注 IP', async () => {
    const wrapper = await mountPopup({
      filters: { ...baseFilters, keyword: '小樱' },
      characterProfileTargets: twoIps
    })

    const entries = entryNodes()
    expect(entries).toHaveLength(2)
    const texts = entries.map((node) => node.textContent)
    expect(texts.some((text) => text.includes('IP-A'))).toBe(true)
    expect(texts.some((text) => text.includes('IP-B'))).toBe(true)
    expect(texts.every((text) => text.includes('小樱'))).toBe(true)

    wrapper.unmount()
  })

  it('点击角色入口会带上所属 IP', async () => {
    const wrapper = await mountPopup({
      filters: { ...baseFilters, keyword: '小樱' },
      characterProfileTargets: twoIps
    })

    // 排序：同名时按 IP 升序
    clickOn(entryNodes()[0])
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('open-profile')[0]).toEqual([
      { kind: 'character', name: '小樱', ip: 'IP-A' }
    ])

    wrapper.unmount()
  })

  it('单选一个角色 chip 时，同样是每个 IP 一个入口', async () => {
    const wrapper = await mountPopup({
      filters: { ...baseFilters, characters: ['小樱'] },
      characterOptions: [{ label: '小樱', value: '小樱' }],
      visibleCharacterOptions: [{ label: '小樱', value: '小樱' }],
      characterProfileTargets: twoIps
    })

    const card = document.querySelector('.filter-card')
    const entries = entryNodes(card)
    expect(entries).toHaveLength(2)
    const texts = entries.map((node) => node.textContent)
    expect(texts.some((text) => text.includes('IP-A'))).toBe(true)
    expect(texts.some((text) => text.includes('IP-B'))).toBe(true)

    wrapper.unmount()
  })

  it('角色没有多 IP 重名时，入口只显示角色名、不标 IP', async () => {
    const wrapper = await mountPopup({
      filters: { ...baseFilters, keyword: '小樱' },
      characterProfileTargets: singleIp
    })

    const entries = entryNodes()
    expect(entries).toHaveLength(1)
    expect(entries[0].textContent).toContain('小樱')
    expect(entries[0].textContent).not.toContain('IP-A')

    clickOn(entries[0])
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('open-profile')[0]).toEqual([
      { kind: 'character', name: '小樱', ip: 'IP-A' }
    ])

    wrapper.unmount()
  })

  it('单选一个角色 chip 且没有多 IP 重名时，只给一个不带 IP 的角色入口', async () => {
    const wrapper = await mountPopup({
      filters: { ...baseFilters, characters: ['小樱'] },
      characterOptions: [{ label: '小樱', value: '小樱' }],
      visibleCharacterOptions: [{ label: '小樱', value: '小樱' }],
      characterProfileTargets: singleIp
    })

    const entries = entryNodes(document.querySelector('.filter-card'))
    expect(entries).toHaveLength(1)
    expect(entries[0].textContent).toContain('小樱')
    expect(entries[0].textContent).not.toContain('IP-A')

    wrapper.unmount()
  })

  it('单选一个 IP chip 时，入口带上对应的 IP 名字', async () => {
    const wrapper = await mountPopup({
      filters: { ...baseFilters, ips: ['原神'] },
      ipOptions: [{ label: '原神', value: '原神' }]
    })

    const card = document.querySelector('.filter-card')
    const entries = entryNodes(card)
    expect(entries).toHaveLength(1)
    expect(entries[0].textContent).toContain('原神')

    clickOn(entries[0])
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('open-profile')[0]).toEqual([
      { kind: 'ip', name: '原神' }
    ])

    wrapper.unmount()
  })

  it('未提供 (ip,name) 目标时退回按名字生成入口（ip 为空）', async () => {
    const wrapper = await mountPopup({
      filters: { ...baseFilters, keyword: '小樱' },
      characterOptions: [{ label: '小樱', value: '小樱' }]
    })

    const entries = entryNodes()
    expect(entries).toHaveLength(1)
    expect(entries[0].textContent).toContain('小樱')
    expect(entries[0].textContent).not.toContain('IP-')

    clickOn(entries[0])
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('open-profile')[0]).toEqual([
      { kind: 'character', name: '小樱', ip: '' }
    ])

    wrapper.unmount()
  })

  it('同一名字在不同 IP 下不会因为 (ip,name) 去重而互相顶掉', async () => {
    const wrapper = await mountPopup({
      filters: { ...baseFilters, keyword: '小樱' },
      characterProfileTargets: [...twoIps, ...twoIps]
    })

    expect(entryNodes()).toHaveLength(2)
    wrapper.unmount()
  })
})
