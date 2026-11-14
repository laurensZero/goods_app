import { describe, it, expect } from 'vitest'
import { filterGoodsList } from '../filters'

function makeItem(overrides = {}) {
  return {
    id: 'g1',
    name: '谷子',
    category: '',
    ip: '',
    variant: '',
    note: '',
    storageLocation: '',
    characters: [],
    tags: [],
    priceNumber: 0,
    acquiredTime: 0,
    ...overrides
  }
}

describe('filterGoodsList 关键词的绑定变体补充命中', () => {
  const items = [
    makeItem({ id: 'a', characters: ['星神★阿哈'] }),
    makeItem({ id: 'b', characters: ['虚照'] }),
    makeItem({ id: 'c', characters: ['无关角色'] })
  ]

  it('关键词精确命中绑定名时，同组其它名字的商品也算命中', () => {
    const result = filterGoodsList(items, { keyword: '虚照' }, {
      keywordVariants: ['星神★阿哈', '虚照']
    })
    expect(result.map((item) => item.id).sort()).toEqual(['a', 'b'])
  })

  it('反向同样成立：搜主名也能命中变体名商品', () => {
    const result = filterGoodsList(items, { keyword: '星神★阿哈' }, {
      keywordVariants: ['星神★阿哈', '虚照']
    })
    expect(result.map((item) => item.id).sort()).toEqual(['a', 'b'])
  })

  it('不传 keywordVariants 时保持原行为（变体名商品不命中）', () => {
    const result = filterGoodsList(items, { keyword: '虚照' })
    expect(result.map((item) => item.id)).toEqual(['b'])
  })

  it('其余筛选条件仍需同时满足', () => {
    const result = filterGoodsList(items, { keyword: '虚照', ips: ['原神'] }, {
      keywordVariants: ['星神★阿哈', '虚照']
    })
    expect(result).toEqual([])
  })
})
