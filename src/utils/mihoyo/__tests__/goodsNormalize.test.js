import { describe, expect, it } from 'vitest'
import { ensurePinyin } from '@/utils/pinyin'
import {
  matchVariantsByHint,
  normalizeMihoyoGoodsSummary,
  normalizeMihoyoVariantEntry,
  normalizeMihoyoVariantList,
  normalizeSearchHintText,
} from '../goodsNormalize'

const VARIANTS = [
  { text: '昔涟B', key: 'a', cover_url: 'cover-a', price: 10 },
  { text: '「花火」生日款', key: 'b', cover_url: 'cover-b', price: 20 },
  { text: '流萤', key: 'c', cover_url: '', img_url: 'img-c' },
]

describe('normalizeSearchHintText', () => {
  it('去掉书名号与首尾引号', () => {
    expect(normalizeSearchHintText(' 「花火」 ')).toBe('花火')
    expect(normalizeSearchHintText('"昔涟"')).toBe('昔涟')
    expect(normalizeSearchHintText('')).toBe('')
  })
})

describe('normalizeMihoyoGoodsSummary', () => {
  it('snake_case 与 camelCase 字段统一为 camelCase 输出', () => {
    expect(normalizeMihoyoGoodsSummary({ goods_id: '1', name: '商品', cover_url: 'a.png', price: 1000 }))
      .toEqual({ goodsId: '1', name: '商品', coverUrl: 'a.png', price: 1000 })
    expect(normalizeMihoyoGoodsSummary({ goodsId: '2', name: '商品2', image: 'b.png' }))
      .toEqual({ goodsId: '2', name: '商品2', coverUrl: 'b.png', price: null })
  })

  it('_goodsId 兜底与非法价格', () => {
    expect(normalizeMihoyoGoodsSummary({ _goodsId: '3' }).goodsId).toBe('3')
    expect(normalizeMihoyoGoodsSummary({ price: 'abc' }).price).toBeNull()
  })
})

describe('normalizeMihoyoVariantEntry', () => {
  it('补齐 text、回退 img_url 与 fallbackCover、price 规整', () => {
    expect(normalizeMihoyoVariantEntry({ key: 'c', img_url: 'img-c' }))
      .toEqual({ text: 'c', key: 'c', cover_url: 'img-c', price: null })
    expect(normalizeMihoyoVariantEntry({ key: 'd' }, { fallbackCover: 'default.png' }))
      .toEqual({ text: 'd', key: 'd', cover_url: 'default.png', price: null })
    expect(normalizeMihoyoVariantEntry({ key: 'e', price: '12.5' }).price).toBe(12.5)
  })

  it('key 缺失视为无效', () => {
    expect(normalizeMihoyoVariantEntry({ text: 'x' })).toBeNull()
    expect(normalizeMihoyoVariantEntry(null)).toBeNull()
  })

  it('normalizeMihoyoVariantList 过滤无效项', () => {
    expect(normalizeMihoyoVariantList([{ key: 'a' }, null, { text: 'no-key' }]).length).toBe(1)
    expect(normalizeMihoyoVariantList('not-array')).toEqual([])
  })
})

describe('matchVariantsByHint（三级匹配）', () => {
  it('第一级：角色名精确匹配优先于包含匹配', () => {
    // 「流萤」同时是 c 的精确角色名与 b 的包含文本，必须只命中 c
    expect(matchVariantsByHint(VARIANTS, '流萤').map((v) => v.key)).toEqual(['c'])
  })

  it('第二级：展示文本/原始文本包含匹配', () => {
    expect(matchVariantsByHint(VARIANTS, '花火').map((v) => v.key)).toEqual(['b'])
    expect(matchVariantsByHint(VARIANTS, '昔涟B').map((v) => v.key)).toEqual(['a'])
  })

  it('第三级：拼音匹配仅在 pinyin 开关下生效', async () => {
    await ensurePinyin()
    // xi lian 拼音命中「昔涟B」
    expect(matchVariantsByHint(VARIANTS, 'xilian')).toEqual([])
    expect(matchVariantsByHint(VARIANTS, 'xilian', { pinyin: true }).map((v) => v.key)).toEqual(['a'])
  })

  it('空提示词或空列表返回空数组', () => {
    expect(matchVariantsByHint(VARIANTS, '')).toEqual([])
    expect(matchVariantsByHint([], '花火')).toEqual([])
  })
})
