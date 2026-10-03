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

const groups = [
  {
    defId: 'cf_rarity',
    name: '稀有度',
    options: [
      { label: '限定', value: '限定' },
      { label: '通贩', value: '通贩' }
    ]
  }
]

function clickOn(element) {
  element?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

/** AppSheet 用 Teleport 挂到 body，所以这里查 document 而不是 wrapper */
function chipNodes() {
  return [...document.querySelectorAll('.filter-card .chip')]
}

async function mountPopup(props = {}) {
  const wrapper = mount(SearchFilterPopup, {
    props: {
      visible: true,
      filters: { ...baseFilters },
      customFieldFilterGroups: groups,
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

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('SearchFilterPopup 自定义字段筛选', () => {
  it('按 select 型字段渲染 chip 组并带上字段名', async () => {
    const wrapper = await mountPopup()
    const labels = [...document.querySelectorAll('.filter-card .field-label')].map((node) => node.textContent.trim())
    expect(labels).toContain('稀有度')

    const chips = chipNodes().map((node) => node.textContent.trim())
    expect(chips).toContain('限定')
    expect(chips).toContain('通贩')
    wrapper.unmount()
  })

  it('点击 chip 抛出 toggle-custom-field（含 defId 与值）', async () => {
    const wrapper = await mountPopup()
    clickOn(chipNodes().find((node) => node.textContent.trim() === '限定'))
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('toggle-custom-field')).toEqual([[{ defId: 'cf_rarity', value: '限定' }]])
    wrapper.unmount()
  })

  it('已选中的值高亮', async () => {
    const wrapper = await mountPopup({ filters: { ...baseFilters, customFields: { cf_rarity: ['通贩'] } } })
    const selected = chipNodes().find((node) => node.textContent.trim() === '通贩')
    const other = chipNodes().find((node) => node.textContent.trim() === '限定')
    expect(selected.classList.contains('chip--active')).toBe(true)
    expect(other.classList.contains('chip--active')).toBe(false)
    wrapper.unmount()
  })

  it('没有 select 字段时不渲染任何分组', async () => {
    const wrapper = await mountPopup({ customFieldFilterGroups: [] })
    const labels = [...document.querySelectorAll('.filter-card .field-label')].map((node) => node.textContent.trim())
    expect(labels).not.toContain('稀有度')
    expect(chipNodes().map((node) => node.textContent.trim())).not.toContain('限定')
    wrapper.unmount()
  })
})
