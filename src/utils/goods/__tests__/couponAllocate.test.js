import { describe, it, expect } from 'vitest'
import { allocateCouponByListedPrice, allocateCentsByWeights, splitUnitPrices } from '../couponAllocate'

describe('allocateCentsByWeights', () => {
  it('按权重分摊且合计精确', () => {
    const result = allocateCentsByWeights([1200, 4900, 27900], 10729)
    expect(result.reduce((a, b) => a + b, 0)).toBe(10729)
  })

  it('同权重时分位余数分给靠前项', () => {
    const result = allocateCentsByWeights([1500, 1500], 100)
    expect(result.reduce((a, b) => a + b, 0)).toBe(100)
    expect(result[0]).toBeGreaterThanOrEqual(result[1])
  })
})

describe('splitUnitPrices', () => {
  it('qty=1 不写逐份价', () => {
    expect(splitUnitPrices(1020, 1)).toEqual([])
  })

  it('整件价按份数均摊，末份吸收分位余数', () => {
    const units = splitUnitPrices(1000, 3)
    expect(units).toHaveLength(3)
    const sumCents = units.reduce((s, u) => s + Math.round(Number(u) * 100), 0)
    expect(sumCents).toBe(1000)
  })
})

describe('allocateCouponByListedPrice', () => {
  const items = [
    { id: 'a', name: '徽章', price: '12', quantity: 1 },
    { id: 'b', name: '立牌', price: '49', quantity: 1 },
    { id: 'c', name: '玩偶', price: '279', quantity: 1 },
    { id: 'd', name: '挂件', price: '38', quantity: 1 },
    { id: 'e', name: '马口铁', price: '15', quantity: 1 },
    { id: 'f', name: '盲盒', price: '15', quantity: 1 }
  ]

  it('按标价比例分摊，优惠合计等于输入金额', () => {
    const result = allocateCouponByListedPrice(items, 107.29)
    expect(result.ok).toBe(true)
    expect(result.totalListed).toBe(408)
    expect(result.totalAllocated).toBeCloseTo(107.29, 2)

    const paid = result.rows.reduce((s, r) => s + r.actualTotal, 0)
    expect(paid).toBeCloseTo(300.71, 2)
  })

  it('支持两位小数与极小金额（如金币抵扣）', () => {
    const result = allocateCouponByListedPrice(items, '47.23')
    expect(result.ok).toBe(true)
    expect(result.totalAllocated).toBeCloseTo(47.23, 2)

    const coin = allocateCouponByListedPrice(items, 0.06)
    expect(coin.ok).toBe(true)
    expect(coin.totalAllocated).toBeCloseTo(0.06, 2)
    expect(coin.couponAmount).toBeCloseTo(0.06, 2)
  })

  it('多件商品均摊到逐份入手价', () => {
    const result = allocateCouponByListedPrice(
      [{ id: 'm', name: '套组', price: '100', quantity: 3 }],
      30
    )
    expect(result.ok).toBe(true)
    const row = result.rows[0]
    // 单价 100 × 3 = 标价 300，优惠 30 → 摊后 270
    expect(row.listedTotal).toBeCloseTo(300, 2)
    expect(row.actualTotal).toBeCloseTo(270, 2)
    expect(row.unitActualPriceList).toHaveLength(3)
    const unitSum = row.unitActualPriceList.reduce((s, u) => s + Number(u), 0)
    expect(unitSum).toBeCloseTo(270, 2)
  })

  it('无标价商品不参与分摊', () => {
    const result = allocateCouponByListedPrice(
      [
        { id: 'x', name: '无价', price: '', quantity: 1 },
        { id: 'y', name: '有价', price: '50', quantity: 2 }
      ],
      20
    )
    expect(result.ok).toBe(true)
    expect(result.rows[0].eligible).toBe(false)
    expect(result.rows[0].actualPrice).toBe('0.00')
    expect(result.rows[1].discount).toBeCloseTo(20, 2)
  })

  it('金额非法或无有效标价时返回失败', () => {
    expect(allocateCouponByListedPrice(items, 0).ok).toBe(false)
    expect(allocateCouponByListedPrice([{ id: 'z', price: '0' }], 10).reason).toBe('noEligiblePrice')
  })

  it('优惠超过标价合计时按标价封顶', () => {
    const result = allocateCouponByListedPrice([{ id: 'a', price: '30', quantity: 1 }], 99)
    expect(result.ok).toBe(true)
    expect(result.rows[0].actualPrice).toBe('0.00')
    expect(result.totalAllocated).toBeCloseTo(30, 2)
  })
})

describe('allocateCouponByListedPrice 幽灵谷子（已退款）', () => {
  const real = [
    { id: 'a', name: '徽章', price: '100', quantity: 1 },
    { id: 'b', name: '立牌', price: '100', quantity: 1 }
  ]

  it('退掉的那件按幽灵参与分摊，剩余谷子维持整单比例', () => {
    // 满 300 减 50：三件各 100 → 幽灵 C 仍占 16.66 优惠，A/B 维持 83.33
    const result = allocateCouponByListedPrice(real, 50, [
      { id: 'ghost-c', name: '退款挂件', price: '100', quantity: 1 }
    ])
    expect(result.ok).toBe(true)
    expect(result.totalListed).toBeCloseTo(300, 2)
    expect(result.totalAllocated).toBeCloseTo(50, 2)
    expect(result.rows).toHaveLength(3)
    expect(result.rows[0].actualPrice).toBe('83.33')
    expect(result.rows[1].actualPrice).toBe('83.33')
    expect(result.rows[2].ghost).toBe(true)
    expect(result.rows[2].discount).toBeCloseTo(16.66, 2)
    expect(result.ghostListed).toBeCloseTo(100, 2)
    expect(result.ghostAllocated).toBeCloseTo(16.66, 2)
  })

  it('幽灵与真实谷子同权：退款额越大，剩余谷子分摊越少', () => {
    const result = allocateCouponByListedPrice(real, 50, [{ price: '300' }])
    // 标价合计 500，A/B 各 100/500 → 各摊 10，入手价 90
    expect(result.rows[0].actualPrice).toBe('90.00')
    expect(result.rows[1].actualPrice).toBe('90.00')
  })

  it('无标价的幽灵不参与分摊，也不占优惠份额', () => {
    const result = allocateCouponByListedPrice(real, 50, [{ price: '' }, { price: '0' }])
    expect(result.totalListed).toBeCloseTo(200, 2)
    expect(result.ghostListed).toBe(0)
    expect(result.rows[0].eligible).toBe(true)
    expect(result.rows[2].eligible).toBe(false)
    expect(result.rows[0].actualPrice).toBe('75.00')
  })

  it('幽灵与真实谷子一起封顶：优惠不超过含幽灵的标价合计', () => {
    const result = allocateCouponByListedPrice(real, 999, [{ price: '100' }])
    expect(result.totalListed).toBeCloseTo(300, 2)
    expect(result.totalAllocated).toBeCloseTo(300, 2)
    expect(result.rows[0].actualPrice).toBe('0.00')
    expect(result.rows[2].actualPrice).toBe('0.00')
  })

  it('不传幽灵谷子时行为与旧版一致', () => {
    const result = allocateCouponByListedPrice(real, 50)
    expect(result.totalListed).toBeCloseTo(200, 2)
    expect(result.rows).toHaveLength(2)
    expect(result.rows.every((row) => row.ghost === false)).toBe(true)
    expect(result.ghostListed).toBe(0)
  })
})
