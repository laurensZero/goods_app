import { describe, it, expect } from 'vitest'
import {
  presetGroupKey,
  presetStoreOrderFromDisplay,
  sortPresetList
} from '../sort'

const counts = new Map()

function favoriteSetOf(...items) {
  return new Set(items)
}

describe('预设默认排序与拖动分组', () => {
  it('默认升序把收藏项排前、其他排最后', () => {
    const result = sortPresetList(
      ['A', 'B', 'C', '其他'],
      'default',
      'asc',
      counts,
      favoriteSetOf('B'),
      { alwaysLast: (item) => item === '其他' }
    )
    expect(result).toEqual(['B', 'A', 'C', '其他'])
  })

  it('预设分组 key 与排序规则一致', () => {
    const options = { favoriteSet: favoriteSetOf('A'), alwaysLast: (item) => item === '其他' }
    expect(presetGroupKey('A', options)).toBe('favorites')
    expect(presetGroupKey('B', options)).toBe('normal')
    expect(presetGroupKey('其他', options)).toBe('last')
  })

  it('降序展示顺序可以还原成存储顺序', () => {
    const display = sortPresetList(
      ['A', 'B', 'C', '其他'],
      'default',
      'desc',
      counts,
      favoriteSetOf('A'),
      { alwaysLast: (item) => item === '其他' }
    )
    expect(display).toEqual(['A', 'C', 'B', '其他'])

    const stored = presetStoreOrderFromDisplay(display, {
      sortDirection: 'desc',
      favoriteSet: favoriteSetOf('A'),
      alwaysLast: (item) => item === '其他'
    })
    expect(stored).toEqual(['A', 'B', 'C', '其他'])
  })
})
