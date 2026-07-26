import { describe, it, expect } from 'vitest'
import { toGoodsRows } from '../supabaseAdapter/helpers'
import { toCamelCase } from '@/utils/sync/columnMapping'
import { normalizeGoodsInput } from '@/stores/goodsHelpers'

// 模拟 Supabase 同步回环:本地 item → 上传行(snake_case) → 拉取转换(camelCase) → 归一化入库
describe('supabase sync round-trip preserves sell* columns', () => {
  const localItem = {
    id: 'g1',
    name: '吧唧',
    isWishlist: false,
    quantity: 2,
    actualPrice: '50',
    collectStatus: '在售',
    unitCollectStatusList: ['已出', '在售'],
    sellPrice: '130',
    sellPlatform: '闲鱼',
    sellFee: '5',
    sellDate: '2026-06-01',
    unitSaleInfoList: [
      { price: '70', platform: '闲鱼', fee: '3', date: '2026-06-01' },
      { price: '90', platform: '千岛', date: '2026-07-01' }
    ],
    updatedAt: 1753500000000
  }

  it('upload row carries snake_case sell columns', () => {
    const [row] = toGoodsRows([localItem], () => 'device-1', false, 'user-1')
    expect(row.sell_price).toBe('130')
    expect(row.sell_platform).toBe('闲鱼')
    expect(row.sell_fee).toBe('5')
    expect(row.sell_date).toBe('2026-06-01')
    expect(row.unit_sale_info_list[0]).toMatchObject({ price: '70', fee: '3' })
  })

  it('pull conversion + normalizeGoodsInput keeps sale columns intact', () => {
    const [row] = toGoodsRows([localItem], () => 'device-1', false, 'user-1')
    const pulled = toCamelCase(row)
    pulled.isWishlist = Number(pulled.isWishlist) === 1
    pulled.quantity = Number(pulled.quantity) || 1

    const normalized = normalizeGoodsInput(pulled, 'g1')
    expect(normalized.sellPrice).toBe('130')
    expect(normalized.sellPlatform).toBe('闲鱼')
    expect(normalized.sellFee).toBe('5')
    expect(normalized.sellDate).toBe('2026-06-01')
    expect(normalized.unitSaleInfoList).toEqual([
      { price: '70', platform: '闲鱼', fee: '3', date: '2026-06-01' },
      { price: '90', platform: '千岛', date: '2026-07-01' }
    ])
  })
})
