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
