import { describe, it, expect } from 'vitest'
import { resolveCharacterFilterShare, resolveGoodsShare, resolveUnitValuesCNY } from '../characterShare'

function makeItem(overrides = {}) {
  return {
    id: 'g1',
    isWishlist: false,
    quantity: 2,
    quantityNumber: 2,
    characters: ['雷电将军'],
    unitCharacterList: [],
    unitActualPriceCNYList: [],
    shippingFeeCNYNumber: 0,
    totalValueNumber: 200,
    ...overrides
  }
}

describe('resolveCharacterFilterShare 角色筛选按份折算', () => {
  it('未选角色时整件计入', () => {
    const item = makeItem({ unitCharacterList: ['雷电将军', '钟离'] })
    expect(resolveCharacterFilterShare(item, [])).toEqual({ units: 2, value: 200 })
  })

  it('逐份角色未启用时整件计入', () => {
    const item = makeItem({ unitCharacterList: [] })
    expect(resolveCharacterFilterShare(item, ['雷电将军'])).toEqual({ units: 2, value: 200 })
  })

  it('逐份角色长度不足份数时，未标角色的份数不计入', () => {
    const item = makeItem({
      unitCharacterList: ['雷电将军'],
      shippingFeeCNYNumber: 20,
      totalValueNumber: 220
    })
    expect(resolveCharacterFilterShare(item, ['雷电将军'])).toEqual({ units: 1, value: 110 })
  })

  it('无逐份价时按份数均摊（含运费）', () => {
    const item = makeItem({
      unitCharacterList: ['雷电将军', '钟离'],
      shippingFeeCNYNumber: 20,
      totalValueNumber: 220
    })
    expect(resolveUnitValuesCNY(item)).toEqual([110, 110])
    expect(resolveCharacterFilterShare(item, ['雷电将军'])).toEqual({ units: 1, value: 110 })
  })

  it('逐份入手价精确折算（运费均摊到每份）', () => {
    const item = makeItem({
      unitCharacterList: ['雷电将军', '钟离'],
      unitActualPriceCNYList: [150, 50],
      shippingFeeCNYNumber: 20,
      totalValueNumber: 220
    })
    expect(resolveUnitValuesCNY(item)).toEqual([160, 60])
    expect(resolveCharacterFilterShare(item, ['雷电将军'])).toEqual({ units: 1, value: 160 })
    expect(resolveCharacterFilterShare(item, ['钟离'])).toEqual({ units: 1, value: 60 })
  })

  it('逐份价只填一部分时，缺价份数用剩余总价补齐', () => {
    const item = makeItem({
      unitCharacterList: ['雷电将军', '钟离'],
      unitActualPriceCNYList: [150],
      shippingFeeCNYNumber: 20,
      totalValueNumber: 220
    })
    expect(resolveUnitValuesCNY(item)).toEqual([160, 60])
  })

  it('逐份价与总价不符时回退均摊', () => {
    const item = makeItem({
      unitCharacterList: ['雷电将军', '钟离'],
      unitActualPriceCNYList: [100, 100],
      totalValueNumber: 180
    })
    expect(resolveUnitValuesCNY(item)).toEqual([90, 90])
    expect(resolveCharacterFilterShare(item, ['雷电将军'])).toEqual({ units: 1, value: 90 })
  })

  it('全部份数命中时按整件原值计入', () => {
    const item = makeItem({ unitCharacterList: ['雷电将军', '雷电将军'], totalValueNumber: 220 })
    expect(resolveCharacterFilterShare(item, ['雷电将军'])).toEqual({ units: 2, value: 220 })
  })

  it('无份数命中时金额与件数为 0', () => {
    const item = makeItem({
      characters: ['雷电将军', '钟离'],
      unitCharacterList: ['钟离', '钟离']
    })
    expect(resolveCharacterFilterShare(item, ['雷电将军'])).toEqual({ units: 0, value: 0 })
  })

  it('单件商品不受逐份角色影响', () => {
    const item = makeItem({ quantity: 1, quantityNumber: 1, unitCharacterList: ['雷电将军'], totalValueNumber: 100 })
    expect(resolveCharacterFilterShare(item, ['雷电将军'])).toEqual({ units: 1, value: 100 })
  })

  it('心愿单条目不含运费折算', () => {
    const item = makeItem({
      isWishlist: true,
      unitCharacterList: ['雷电将军', '钟离'],
      shippingFeeCNYNumber: 20,
      totalValueNumber: 100
    })
    expect(resolveUnitValuesCNY(item)).toEqual([50, 50])
    expect(resolveCharacterFilterShare(item, ['雷电将军'])).toEqual({ units: 1, value: 50 })
  })
})

describe('resolveGoodsShare 关键词等于角色名时按份折算', () => {
  it('勾选角色时与 resolveCharacterFilterShare 一致', () => {
    const item = makeItem({ unitCharacterList: ['雷电将军', '钟离'], unitActualPriceCNYList: [150, 50] })
    expect(resolveGoodsShare(item, { characters: ['钟离'], keyword: '' })).toEqual({ units: 1, value: 50 })
  })

  it('关键词恰好等于角色名时按该角色折算', () => {
    const item = makeItem({ characters: ['雷电将军', '钟离'], unitCharacterList: ['雷电将军', '钟离'], unitActualPriceCNYList: [150, 50] })
    expect(resolveGoodsShare(item, { characters: [], keyword: '钟离' })).toEqual({ units: 1, value: 50 })
  })

  it('关键词不是角色名时整件计入', () => {
    const item = makeItem({ characters: ['雷电将军', '钟离'], unitCharacterList: ['雷电将军', '钟离'] })
    expect(resolveGoodsShare(item, { characters: [], keyword: '吧唧' })).toEqual({ units: 2, value: 200 })
  })

  it('关键词只是角色名的前缀时整件计入（避免误归属）', () => {
    const item = makeItem({ characters: ['雷电将军', '钟离'], unitCharacterList: ['雷电将军', '钟离'] })
    expect(resolveGoodsShare(item, { characters: [], keyword: '钟' })).toEqual({ units: 2, value: 200 })
  })

  it('角色筛选与关键词并存时以角色筛选为准', () => {
    const item = makeItem({ characters: ['雷电将军', '钟离'], unitCharacterList: ['雷电将军', '钟离'], unitActualPriceCNYList: [150, 50] })
    expect(resolveGoodsShare(item, { characters: ['雷电将军'], keyword: '钟离' })).toEqual({ units: 1, value: 150 })
  })

  it('关键词命中但条目角色列表为空时整件计入', () => {
    const item = makeItem({ characters: [], unitCharacterList: ['雷电将军', '钟离'] })
    expect(resolveGoodsShare(item, { characters: [], keyword: '雷电将军' })).toEqual({ units: 2, value: 200 })
  })
})
