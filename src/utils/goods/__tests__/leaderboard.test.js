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
    expect(raiden.totalValue).toBeCloseTo(110)
    expect(zhongli.totalValue).toBeCloseTo(110)
  })

  it('逐份角色部分填写：已填份数精确归属，空份数按商品级角色均摊', () => {
    const result = buildLeaderboardEntries([
      makeItem({
        quantityNumber: 2,
        quantity: 2,
        characters: ['雷电将军', '钟离'],
        unitCharacterList: ['雷电将军', ''],
        actualPrice: '200',
        actualPriceCNYNumber: 200,
        shippingFee: '20',
        shippingFeeCNYNumber: 20,
        officialPriceCNYNumber: 90,
        unitActualPriceCNYList: [140, 60],
        totalValueNumber: 220
      })
    ], 'character')

    const raiden = entryOf(result, '雷电将军')
    const zhongli = entryOf(result, '钟离')
    // 逐份值 [150, 70]：第 1 份归雷电将军，第 2 份未标角色 → 70 均摊成各 35
    expect(raiden.totalValue).toBeCloseTo(185)
    expect(zhongli.totalValue).toBeCloseTo(35)
    expect(raiden.quantity).toBeCloseTo(1.5)
    expect(zhongli.quantity).toBeCloseTo(0.5)
    // 金额守恒：合计仍为整件总值
    expect(raiden.totalValue + zhongli.totalValue).toBeCloseTo(220)
  })

  it('逐份角色只填了 1 项（长度不足份数）时同样按份归属', () => {
    const result = buildLeaderboardEntries([
      makeItem({
        quantityNumber: 2,
        quantity: 2,
        characters: ['雷电将军', '钟离'],
        unitCharacterList: ['雷电将军'],
        actualPrice: '200',
        actualPriceCNYNumber: 200,
        officialPriceCNYNumber: 90,
        totalValueNumber: 200
      })
    ], 'character')

    const raiden = entryOf(result, '雷电将军')
    const zhongli = entryOf(result, '钟离')
    expect(raiden.totalValue).toBeCloseTo(150)
    expect(zhongli.totalValue).toBeCloseTo(50)
    expect(raiden.quantity).toBeCloseTo(1.5)
    expect(zhongli.quantity).toBeCloseTo(0.5)
  })

  it('逐份角色含商品级以外的角色时回退整件均摊', () => {
    const result = buildLeaderboardEntries([
      makeItem({
        quantityNumber: 2,
        quantity: 2,
        characters: ['雷电将军', '钟离'],
        unitCharacterList: ['温迪', '钟离'],
        actualPrice: '200',
        actualPriceCNYNumber: 200,
        totalValueNumber: 200
      })
    ], 'character')

    const raiden = entryOf(result, '雷电将军')
    const zhongli = entryOf(result, '钟离')
    expect(raiden.totalValue).toBeCloseTo(100)
    expect(zhongli.totalValue).toBeCloseTo(100)
    expect(raiden.quantity).toBeCloseTo(1)
    expect(zhongli.quantity).toBeCloseTo(1)
  })
})

describe('buildLeaderboardEntries 角色按 (ip, name) 拆行', () => {
  function entriesOfLabel(result, label) {
    return result.entries.filter((entry) => entry.label === label)
  }

  it('不同 IP 下的同名角色各自成一行，meta 标注各自 IP', () => {
    const result = buildLeaderboardEntries([
      makeItem({ id: 'a', ip: 'IP-A', characters: ['小樱'], quantityNumber: 2, quantity: 2, totalValueNumber: 200 }),
      makeItem({ id: 'b', ip: 'IP-B', characters: ['小樱'], quantityNumber: 1, quantity: 1, totalValueNumber: 100 })
    ], 'character')

    const entries = entriesOfLabel(result, '小樱')
    expect(entries).toHaveLength(2)

    const byIp = new Map(entries.map((entry) => [entry.meta, entry]))
    expect(byIp.get('IP-A').quantity).toBeCloseTo(2)
    expect(byIp.get('IP-A').totalValue).toBeCloseTo(200)
    expect(byIp.get('IP-B').quantity).toBeCloseTo(1)
    expect(byIp.get('IP-B').totalValue).toBeCloseTo(100)
  })

  it('同一 IP 下的同名角色仍然合并成一行', () => {
    const result = buildLeaderboardEntries([
      makeItem({ id: 'a', ip: 'IP-A', characters: ['小樱'], quantityNumber: 1, quantity: 1, totalValueNumber: 100 }),
      makeItem({ id: 'b', ip: 'IP-A', characters: ['小樱'], quantityNumber: 1, quantity: 1, totalValueNumber: 50 })
    ], 'character')

    const entries = entriesOfLabel(result, '小樱')
    expect(entries).toHaveLength(1)
    expect(entries[0].meta).toBe('IP-A')
    expect(entries[0].quantity).toBeCloseTo(2)
    expect(entries[0].totalValue).toBeCloseTo(150)
  })

  it('逐份角色分摊同样按 (ip, name) 拆行', () => {
    const result = buildLeaderboardEntries([
      makeItem({
        id: 'a', ip: 'IP-A', characters: ['小樱'], unitCharacterList: ['小樱'], quantityNumber: 1, quantity: 1, totalValueNumber: 100
      }),
      makeItem({
        id: 'b', ip: 'IP-B', characters: ['小樱'], unitCharacterList: ['小樱'], quantityNumber: 1, quantity: 1, totalValueNumber: 70
      })
    ], 'character')

    const entries = entriesOfLabel(result, '小樱')
    expect(entries).toHaveLength(2)
    const byIp = new Map(entries.map((entry) => [entry.meta, entry]))
    expect(byIp.get('IP-A').totalValue).toBeCloseTo(100)
    expect(byIp.get('IP-B').totalValue).toBeCloseTo(70)
  })

  it('商品没填 IP 时退回预设里该角色的 IP', () => {
    const presetMap = new Map([['小樱', 'IP-A']])
    const result = buildLeaderboardEntries([
      makeItem({ ip: '', characters: ['小樱'], quantityNumber: 1, quantity: 1, totalValueNumber: 10 })
    ], 'character', presetMap)

    const entries = entriesOfLabel(result, '小樱')
    expect(entries).toHaveLength(1)
    expect(entries[0].meta).toBe('IP-A')
  })

  it('非角色维度不受影响，key 仍是标签本身', () => {
    const result = buildLeaderboardEntries([
      makeItem({ ip: '原神', quantityNumber: 1, quantity: 1, totalValueNumber: 10 })
    ], 'ip')

    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].key).toBe('原神')
    expect(result.entries[0].meta).toBe('')
  })
})
