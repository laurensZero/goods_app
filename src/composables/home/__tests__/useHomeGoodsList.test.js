// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { useHomeGoodsList } from '../useHomeGoodsList'

function makeList() {
  return [
    {
      id: 'a',
      name: '多份谷子',
      collectStatus: '已拥有',
      characters: ['雷电将军', '钟离'],
      unitCharacterList: ['雷电将军', '钟离'],
      quantity: 2,
      quantityNumber: 2,
      totalValueNumber: 220,
      acquiredTime: 2
    },
    {
      id: 'b',
      name: '单份谷子',
      collectStatus: '已拥有',
      characters: ['钟离'],
      quantity: 1,
      quantityNumber: 1,
      totalValueNumber: 50,
      acquiredTime: 1
    }
  ]
}

function setupList(list, filters = {}) {
  return useHomeGoodsList(
    {},
    ref('acquiredAt_desc'),
    ref('desc'),
    undefined,
    undefined,
    ref(list),
    ref(true),
    filters
  )
}

describe('useHomeGoodsList 角色筛选折算', () => {
  it('无角色筛选时整件计入', () => {
    const { totalValue, totalQuantity } = setupList(makeList(), { characters: [] })
    expect(totalValue.value).toBe('270.00')
    expect(totalQuantity.value).toBe(3)
  })

  it('按角色筛选时金额与件数只统计命中份数', () => {
    const { totalValue, totalQuantity } = setupList(makeList(), { characters: ['钟离'] })
    expect(totalValue.value).toBe('160.00')
    expect(totalQuantity.value).toBe(2)
  })

  it('筛选角色无任何命中份数时该条目不贡献金额', () => {
    const list = makeList().map((item) => (item.id === 'a'
      ? { ...item, unitCharacterList: ['雷电将军', '雷电将军'] }
      : item))
    const { totalValue, totalQuantity } = setupList(list, { characters: ['钟离'] })
    expect(totalValue.value).toBe('50.00')
    expect(totalQuantity.value).toBe(1)
  })

  it('未提供筛选参数时保持原口径', () => {
    const { totalValue, totalQuantity } = setupList(makeList())
    expect(totalValue.value).toBe('270.00')
    expect(totalQuantity.value).toBe(3)
  })

  it('关键词等于角色名时金额与件数按该角色折算', () => {
    const { totalValue, totalQuantity } = setupList(makeList(), { characters: [], keyword: '钟离' })
    expect(totalValue.value).toBe('160.00')
    expect(totalQuantity.value).toBe(2)
  })

  it('关键词非角色名时整件计入', () => {
    const { totalValue, totalQuantity } = setupList(makeList(), { characters: [], keyword: '吧唧' })
    expect(totalValue.value).toBe('270.00')
    expect(totalQuantity.value).toBe(3)
  })

  it('排除状态的条目不计入', () => {
    const list = makeList().map((item) => (item.id === 'b' ? { ...item, collectStatus: '已出' } : item))
    const { totalValue, totalQuantity } = setupList(list, { characters: ['钟离'] })
    expect(totalValue.value).toBe('110.00')
    expect(totalQuantity.value).toBe(1)
  })
})
