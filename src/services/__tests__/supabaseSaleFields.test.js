import { describe, it, expect } from 'vitest'
import { toGoodsRows } from '../supabaseAdapter/helpers'
import { toCamelCase } from '@/utils/sync/columnMapping'
import { normalizeGoodsInput } from '@/stores/goodsHelpers'

// 模拟 Supabase 同步回环:本地 item → 上传行(snake_case) → 拉取转换(camelCase) → 归一化入库
describe('supabase sync round-trip preserves sale fields in statusTimeline', () => {
  const localItem = {
    id: 'g1',
    name: '吧唧',
    isWishlist: false,
    quantity: 2,
    actualPrice: '50',
    collectStatus: '在售',
    unitCollectStatusList: ['已出', '在售'],
    statusTimeline: [
      { status: '已拥有', at: '2026-01-01' },
      { status: '已出', at: '2026-06-01', unitIndex: 0, price: '120', platform: '闲鱼', fee: '5' },
      { status: '在售', at: '2026-07-01', unitIndex: 1, price: '90', platform: '千岛' }
    ],
    updatedAt: 1753500000000
  }

  it('upload row keeps sale fields inside status_timeline', () => {
    const [row] = toGoodsRows([localItem], () => 'device-1', false, 'user-1')
    expect(row.status_timeline).toBeDefined()
    const soldEntry = row.status_timeline.find((e) => e.status === '已出')
    expect(soldEntry).toMatchObject({ price: '120', platform: '闲鱼', fee: '5', unitIndex: 0 })
  })

  it('pull conversion + normalizeGoodsInput keeps sale fields intact', () => {
    const [row] = toGoodsRows([localItem], () => 'device-1', false, 'user-1')
    // 模拟 reader.mapGoods:jsonb 列由 supabase-js 直接返回数组/对象
    const pulled = toCamelCase(row)
    pulled.isWishlist = Number(pulled.isWishlist) === 1
    pulled.quantity = Number(pulled.quantity) || 1

    const normalized = normalizeGoodsInput(pulled, 'g1')
    expect(normalized.statusTimeline).toContainEqual(
      { status: '已出', at: '2026-06-01', unitIndex: 0, price: '120', platform: '闲鱼', fee: '5' }
    )
    expect(normalized.statusTimeline).toContainEqual(
      { status: '在售', at: '2026-07-01', unitIndex: 1, price: '90', platform: '千岛' }
    )
  })

  it('tolerates status_timeline arriving as a JSON string (text column fallback)', () => {
    const [row] = toGoodsRows([localItem], () => 'device-1', false, 'user-1')
    const pulled = toCamelCase({ ...row, status_timeline: JSON.stringify(row.status_timeline) })
    const normalized = normalizeGoodsInput(pulled, 'g1')
    // 字符串形态下 normalizeStatusTimeline 会返回空数组 — 记录此行为以防列类型不是 jsonb
    expect(Array.isArray(normalized.statusTimeline)).toBe(true)
  })
})
