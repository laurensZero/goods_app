import { describe, it, expect } from 'vitest'
import { buildLeaderboardEntries } from '../leaderboard'

function makeItem(overrides = {}) {
  return {
    id: 'g1',
    ip: '原神',
    characters: [],
    collectStatus: '已拥有',
    isWishlist: false,
    quantityNumber: 1,
    totalValueNumber: 0,
    officialPriceCNYNumber: 0,
    actualPriceCNYNumber: 0,
    acquiredTime: 0,
    ...overrides
  }
}

function entryOf(result, label) {
  return result.entries.find((entry) => entry.label === label)
}

describe('buildLeaderboardEntries 价格口径', () => {
  it('入手价总价直接取 totalValueNumber，不按数量重复计算', () => {
    // actualPrice 为 3 份的总入手价 300，运费 10 → totalValueNumber 310
    const result = buildLeaderboardEntries([
      makeItem({
        quantityNumber: 3,
        actualPriceCNYNumber: 300,
        officialPriceCNYNumber: 120,
        totalValueNumber: 310
      })
    ], 'ip')

    const entry = entryOf(result, '原神')
    expect(entry.quantity).toBe(3)
    expect(entry.actualTotalValue).toBeCloseTo(310)
    // 原价是单价，总价按数量累计
    expect(entry.officialTotalValue).toBeCloseTo(360)
  })

  it('未填入手价时回退到 totalValueNumber（原价×数量+运费）', () => {
    const result = buildLeaderboardEntries([
      makeItem({
        quantityNumber: 2,
        officialPriceCNYNumber: 50,
        totalValueNumber: 100
      })
    ], 'ip')

    const entry = entryOf(result, '原神')
    expect(entry.actualTotalValue).toBeCloseTo(100)
    expect(entry.officialTotalValue).toBeCloseTo(100)
  })

  it('排除已赠出/已出/丢失与心愿单商品', () => {
    const result = buildLeaderboardEntries([
      makeItem({ id: 'a', collectStatus: '已出', quantityNumber: 1, totalValueNumber: 100 }),
      makeItem({ id: 'b', collectStatus: '已赠出', quantityNumber: 1, totalValueNumber: 100 }),
      makeItem({ id: 'c', collectStatus: '丢失', quantityNumber: 1, totalValueNumber: 100 }),
      makeItem({ id: 'd', isWishlist: true, quantityNumber: 1, totalValueNumber: 100 }),
      makeItem({ id: 'e', quantityNumber: 1, actualPriceCNYNumber: 66, totalValueNumber: 66 })
    ], 'ip')

    const entry = entryOf(result, '原神')
    expect(entry.quantity).toBe(1)
    expect(entry.actualTotalValue).toBeCloseTo(66)
  })

  it('逐份角色分摊时入手价按每份均摊 totalValueNumber', () => {
    const result = buildLeaderboardEntries([
      makeItem({
        quantityNumber: 2,
        characters: ['雷电将军', '钟离'],
        unitCharacterList: ['雷电将军', '钟离'],
        actualPriceCNYNumber: 200,
        officialPriceCNYNumber: 90,
        totalValueNumber: 220
      })
    ], 'character')

    const raiden = entryOf(result, '雷电将军')
    const zhongli = entryOf(result, '钟离')
    expect(raiden.actualTotalValue).toBeCloseTo(110)
    expect(zhongli.actualTotalValue).toBeCloseTo(110)
    expect(raiden.officialTotalValue).toBeCloseTo(90)
  })
})
