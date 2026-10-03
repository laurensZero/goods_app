import { describe, it, expect, vi, beforeEach } from 'vitest'
import { computed, effectScope, nextTick } from 'vue'

const presetsMock = vi.hoisted(() => ({ customFieldDefs: null }))

vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useI18n: () => ({ t: (key) => key })
  }
})

vi.mock('@/utils/platform/storage', () => ({
  writePersisted: () => {}
}))

vi.mock('@/stores/presets', async () => {
  const { reactive, ref } = await import('vue')
  const customFieldDefs = ref([])
  presetsMock.customFieldDefs = customFieldDefs
  // 真实 pinia store 会解包 ref；用 reactive 包一层才能让 composable 看到数组本体
  const store = reactive({
    customFieldDefs,
    storageLocationTree: [],
    categories: []
  })
  return {
    usePresetsStore: () => store
  }
})

vi.mock('@/stores/filterPresets', () => ({
  useFilterPresetsStore: () => ({
    getPresetsByScope: () => [],
    savePreset: vi.fn(),
    removePreset: vi.fn()
  })
}))

import { useGoodsSearch } from '../useGoodsSearch'

const DEF_RARITY = { id: 'cf_rarity', name: '稀有度', type: 'select', options: ['限定', '通贩'] }
const DEF_BOX = { id: 'cf_box', name: '有无盒', type: 'select', options: ['有盒', '无盒'] }
const DEF_TEXT = { id: 'cf_memo', name: '备注', type: 'text', options: [] }

const items = [
  { id: 'g1', name: 'A', customFields: { cf_rarity: '通贩', cf_box: '有盒' } },
  { id: 'g2', name: 'B', customFields: { cf_rarity: '限定' } },
  { id: 'g3', name: 'C', customFields: { cf_rarity: '场贩限定' } },
  { id: 'g4', name: 'D' }
]

/** 在独立 effectScope 里建 composable，避免 onScopeDispose 脱离 scope 告警 */
function setup(defs = []) {
  presetsMock.customFieldDefs.value = defs
  const scope = effectScope()
  const api = scope.run(() => useGoodsSearch(computed(() => items), { scope: 'collection' }))
  return { api, scope }
}

beforeEach(() => {
  presetsMock.customFieldDefs.value = []
  localStorage.clear()
})

describe('customFieldFilterGroups', () => {
  it('只做 select 型，text 型不进筛选面板', async () => {
    const { api, scope } = setup([DEF_RARITY, DEF_TEXT])
    await nextTick()
    expect(api.customFieldFilterGroups.value.map((group) => group.defId)).toEqual(['cf_rarity'])
    scope.stop()
  })

  it('只列条目里真实出现过的值，按预设 options 排序、未登记的值垫后', async () => {
    const { api, scope } = setup([DEF_RARITY])
    await nextTick()
    const [rarity] = api.customFieldFilterGroups.value
    expect(rarity.name).toBe('稀有度')
    expect(rarity.options.map((option) => option.value)).toEqual(['限定', '通贩', '场贩限定'])
    scope.stop()
  })

  it('没有任何条目录入该字段时不显示这一组', async () => {
    const { api, scope } = setup([DEF_RARITY, DEF_BOX])
    await nextTick()
    // 通贩/限定存在；有盒存在；无盒不存在
    const box = api.customFieldFilterGroups.value.find((group) => group.defId === 'cf_box')
    expect(box.options.map((option) => option.value)).toEqual(['有盒'])
    expect(api.customFieldFilterGroups.value).toHaveLength(2)
    scope.stop()
  })

  it('已选中但条目里已不存在的值仍保留（否则取消不掉）', async () => {
    const { api, scope } = setup([DEF_RARITY])
    await nextTick()
    api.toggleCustomFieldFilter('cf_rarity', '已下架')
    await nextTick()
    const [rarity] = api.customFieldFilterGroups.value
    expect(rarity.options.map((option) => option.value)).toContain('已下架')
    scope.stop()
  })
})

describe('toggleCustomFieldFilter', () => {
  it('整对象替换：加键、去重、再点取消后删键；同字段多值算一组条件', async () => {
    const { api, scope } = setup([DEF_RARITY, DEF_BOX])
    await nextTick()

    api.toggleCustomFieldFilter('cf_rarity', '限定')
    expect(api.filters.customFields).toEqual({ cf_rarity: ['限定'] })
    expect(api.activeFilterCount.value).toBe(1)

    api.toggleCustomFieldFilter('cf_rarity', '通贩')
    expect(api.filters.customFields).toEqual({ cf_rarity: ['限定', '通贩'] })
    expect(api.activeFilterCount.value).toBe(1)

    api.toggleCustomFieldFilter('cf_box', '有盒')
    expect(api.activeFilterCount.value).toBe(2)

    api.toggleCustomFieldFilter('cf_rarity', '限定')
    expect(api.filters.customFields).toEqual({ cf_rarity: ['通贩'], cf_box: ['有盒'] })
    expect(api.activeFilterCount.value).toBe(2)

    api.toggleCustomFieldFilter('cf_rarity', '通贩')
    api.toggleCustomFieldFilter('cf_box', '有盒')
    expect(api.filters.customFields).toEqual({})
    expect(api.activeFilterCount.value).toBe(0)
    scope.stop()
  })

  it('defId 为空时不做任何事', async () => {
    const { api, scope } = setup([DEF_RARITY])
    await nextTick()
    api.toggleCustomFieldFilter('', '限定')
    expect(api.filters.customFields).toEqual({})
    scope.stop()
  })

  it('重置筛选会清掉自定义字段条件', async () => {
    const { api, scope } = setup([DEF_RARITY])
    await nextTick()
    api.toggleCustomFieldFilter('cf_rarity', '限定')
    api.resetFilters()
    expect(api.filters.customFields).toEqual({})
    scope.stop()
  })
})

describe('filteredItems + preset summary', () => {
  it('按自定义字段筛选条目', async () => {
    const { api, scope } = setup([DEF_RARITY])
    await nextTick()
    api.toggleCustomFieldFilter('cf_rarity', '通贩')
    expect(api.filteredItems.value.map((item) => item.id)).toEqual(['g1'])
    scope.stop()
  })

  it('字段被删除后残留条件会被清掉', async () => {
    const { api, scope } = setup([DEF_RARITY])
    await nextTick()
    api.toggleCustomFieldFilter('cf_rarity', '限定')
    expect(api.filters.customFields).toEqual({ cf_rarity: ['限定'] })

    presetsMock.customFieldDefs.value = []
    await nextTick()
    expect(api.filters.customFields).toEqual({})
    scope.stop()
  })

  it('字段改成 text 后同样清掉残留条件', async () => {
    const { api, scope } = setup([DEF_RARITY])
    await nextTick()
    api.toggleCustomFieldFilter('cf_rarity', '限定')

    presetsMock.customFieldDefs.value = [{ ...DEF_RARITY, type: 'text' }]
    await nextTick()
    expect(api.filters.customFields).toEqual({})
    scope.stop()
  })

  it('预设摘要用字段名而不是 defId', async () => {
    const { api, scope } = setup([DEF_RARITY])
    await nextTick()
    const summary = api.formatPresetSummary({ customFields: { cf_rarity: ['限定', '通贩'] } })
    expect(summary).toBe('稀有度:限定/通贩')
    scope.stop()
  })
})
