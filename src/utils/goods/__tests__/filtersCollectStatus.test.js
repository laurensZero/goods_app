import { describe, it, expect } from 'vitest'

import { createDefaultGoodsFilters, filterGoodsList } from '../filters'

const base = {
  category: '',
  ip: '',
  variant: '',
  note: '',
  storageLocation: '',
  characters: [],
  tags: [],
  priceNumber: 0,
  acquiredTime: 0,
  images: []
}

const withStatus = (id, collectStatus, unitCollectStatusList = []) => ({
  ...base,
  id,
  name: id,
  collectStatus,
  unitCollectStatusList
})

const filterBy = (items, collectStatuses) =>
  filterGoodsList(items, { ...createDefaultGoodsFilters(), collectStatuses }).map((item) => item.id)

describe('收藏状态筛选 · 逐份状态', () => {
  it('商品级状态为「已拥有」、逐份含「待发货」时，筛「待发货」应命中', () => {
    const list = [withStatus('g1', '已拥有', ['已拥有', '待发货'])]
    expect(filterBy(list, ['待发货'])).toEqual(['g1'])
  })

  it('逐份状态里没有被筛状态时不命中', () => {
    const list = [withStatus('g1', '已拥有', ['已拥有', '待发货'])]
    expect(filterBy(list, ['待补款'])).toEqual([])
  })

  it('平票时主状态判定不影响逐份命中（筛「已拥有」与「待发货」都应命中）', () => {
    const list = [withStatus('g1', '已拥有', ['已拥有', '待发货'])]
    expect(filterBy(list, ['已拥有'])).toEqual(['g1'])
    expect(filterBy(list, ['待发货'])).toEqual(['g1'])
  })

  it('少数份为退出态时同样命中（保留原有退出态行为）', () => {
    const list = [withStatus('g1', '已拥有', ['已拥有', '已拥有', '已出'])]
    expect(filterBy(list, ['已出'])).toEqual(['g1'])
    expect(filterBy(list, ['丢失'])).toEqual([])
  })

  it('无逐份列表时按商品级状态命中', () => {
    const list = [withStatus('g1', '待发货'), withStatus('g2', '已拥有')]
    expect(filterBy(list, ['待发货'])).toEqual(['g1'])
  })

  it('多选状态任一命中即通过', () => {
    const list = [
      withStatus('g1', '已拥有', ['已拥有', '待发货']),
      withStatus('g2', '已拥有', ['已拥有', '待补邮']),
      withStatus('g3', '已拥有', ['已拥有'])
    ]
    expect(filterBy(list, ['待发货', '待补款'])).toEqual(['g1'])
  })
})
