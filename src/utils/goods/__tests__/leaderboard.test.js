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
    quantity: 1,
    acquiredAt: '2026-01-15',
    actualPrice: '',
    shippingFee: '',
    unitAcquiredAtList: [],
    unitActualPriceList: [],
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
  it('入手价总价用官方花费口径（actualPrice 总价 + 运费）', () => {
    // actualPrice 为 3 份的总入手价 300，运费 10 → 官方花费 310
    const result = buildLeaderboardEntries([
      makeItem({
        quantityNumber: 3,
        quantity: 3,
        actualPrice: '300',
        actualPriceCNYNumber: 300,
        shippingFee: '10',
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

  it('未填入手价时回退到原价×数量', () => {
    const result = buildLeaderboardEntries([
      makeItem({
        quantityNumber: 2,
        quantity: 2,
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
      makeItem({ id: 'e', quantityNumber: 1, actualPrice: '66', actualPriceCNYNumber: 66, totalValueNumber: 66 })
    ], 'ip')

    const entry = entryOf(result, '原神')
    expect(entry.quantity).toBe(1)
    expect(entry.actualTotalValue).toBeCloseTo(66)
  })

  it('逐份角色分摊时入手价按官方明细/份数均摊', () => {
    const result = buildLeaderboardEntries([
      makeItem({
        quantityNumber: 2,
        quantity: 2,
        characters: ['雷电将军', '钟离'],
        unitCharacterList: ['雷电将军', '钟离'],
        actualPrice: '200',
        actualPriceCNYNumber: 200,
        shippingFee: '20',
        officialPriceCNYNumber: 90,
        totalValueNumber: 220
      })
    ], 'character')

    const raiden = entryOf(result, '雷电将军')
    const zhongli = entryOf(result, '钟离')
    // 无逐份日期时合并成 1 条总账 220，逐份均摊 110
    expect(raiden.actualTotalValue).toBeCloseTo(110)
    expect(zhongli.actualTotalValue).toBeCloseTo(110)
    expect(raiden.officialTotalValue).toBeCloseTo(90)
  })
})
