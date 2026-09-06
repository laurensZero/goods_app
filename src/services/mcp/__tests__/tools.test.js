import { describe, it, expect, vi } from 'vitest'
import { createMcpToolHandlers, createMcpServer } from '../tools'
import { MCP_TOOL_DEFINITIONS } from '../toolDefinitions'

/** 内存假 db：固定数据集，覆盖单位价、多币种、愿望单、回收站等分支 */
function createFakeDb() {
  const items = [
    {
      id: 'g1', name: '初音未来 吧唧', category: '吧唧', ip: '初音未来', goodsId: '',
      characters: ['初音未来'], tags: ['2025 夏活'], storageLocation: 'A 柜一层',
      isWishlist: false, collectStatus: '已拥有', quantity: 2,
      price: '30', actualPrice: '25', actualPriceCurrency: 'CNY', currency: 'CNY',
      unitActualPriceList: ['25', '26'], unitAcquiredAtList: ['2025-07-01', '2025-07-01'],
      unitCharacterList: ['初音未来', '初音未来'], unitCollectStatusList: ['已拥有', '已拥有'],
      acquiredAt: '2025-07-01', saleAt: '', note: '夏活限定', updatedAt: 100,
      trashed: false, images: ['a.png'], statusTimeline: [{ date: '2025-07-01', text: '下单' }]
    },
    {
      id: 'g2', name: '明日方舟 立牌', category: '立牌', ip: '明日方舟', goodsId: 'HG-001',
      characters: ['阿米娅'], tags: [], storageLocation: 'B 柜',
      isWishlist: false, collectStatus: '已拥有', quantity: 1,
      price: '50', actualPrice: '', actualPriceCurrency: 'CNY', currency: 'CNY',
      unitActualPriceList: [], acquiredAt: '2024-11-20', saleAt: '', note: '', updatedAt: 200,
      trashed: false, images: [], statusTimeline: []
    },
    {
      id: 'g3', name: '愿望：辉夜手办', category: '手办', ip: '辉夜大小姐', goodsId: '',
      characters: ['四宫辉夜'], tags: ['心愿'], storageLocation: '',
      isWishlist: true, collectStatus: '未入手', quantity: 1,
      price: '599', actualPrice: '', actualPriceCurrency: 'CNY', currency: 'CNY',
      unitActualPriceList: [], acquiredAt: '', saleAt: '', note: '等再版', updatedAt: 300,
      trashed: false, images: [], statusTimeline: []
    },
    {
      id: 'g4', name: '旧吧唧（已丢）', category: '吧唧', ip: '初音未来', goodsId: '',
      characters: [], tags: [], storageLocation: '',
      isWishlist: false, collectStatus: '已拥有', quantity: 1,
      price: '10', actualPrice: '10', actualPriceCurrency: 'CNY', currency: 'CNY',
      unitActualPriceList: [], acquiredAt: '2023-01-01', saleAt: '', note: '', updatedAt: 50,
      trashed: true, images: [], statusTimeline: []
    }
  ]
  const events = [
    {
      id: 'e1', name: 'CP 春季展', type: '漫展', startDate: '2025-05-01', endDate: '2025-05-02',
      city: '上海', location: '世博展览馆', ticketPrice: '80', ticketType: '单日票', seatInfo: '',
      tags: ['线下'], linkedGoodsIds: ['g1'], photos: ['p1'], description: '两天都去了',
      deleted: false
    },
    { id: 'e2', name: '已删活动', type: '', startDate: '', endDate: '', city: '', location: '', ticketPrice: '', ticketType: '', seatInfo: '', tags: [], linkedGoodsIds: [], photos: [], description: '', deleted: true }
  ]
  const recharge = [
    { id: 'r1', game: '明日方舟', itemName: '648 源石', amount: 648, chargedAt: '2025-01-15', note: '', deleted: false },
    { id: 'r2', game: '初音速报', itemName: '月卡', amount: 30, chargedAt: '2024-12-01', note: '连续包月', deleted: false },
    { id: 'r3', game: '已删', itemName: '', amount: 999, chargedAt: '2025-02-01', note: '', deleted: true }
  ]
  return {
    getItems: vi.fn(async () => items.filter((item) => !item.trashed)),
    getTrashedItems: vi.fn(async () => items.filter((item) => item.trashed)),
    getEvents: vi.fn(async () => events),
    getRechargeRecords: vi.fn(async () => recharge)
  }
}

describe('mcp tool handlers', () => {
  it('goods_search 关键词跨字段模糊匹配并按更新时间倒序分页', async () => {
    const db = createFakeDb()
    const handlers = createMcpToolHandlers(db)

    const result = await handlers.goods_search({ query: '初音' })
    // 命中 g1（名称/IP/角色），排除回收站 g4 与愿望单外的 g3
    expect(result.items.map((/** @type {any} */ i) => i.id)).toEqual(['g1'])
    expect(result.total).toBe(1)

    // 分页参数
    const paged = await handlers.goods_search({ limit: 1, offset: 1 })
    expect(paged.total).toBe(3)
    expect(paged.items).toHaveLength(1)
    expect(paged.hasMore).toBe(true)
    // g3 更新时间最新，offset=1 应取到 g2
    expect(paged.items[0].id).toBe('g2')

    expect(db.getItems).toHaveBeenCalled()
  })

  it('goods_search 支持类别/角色/存放位置精确过滤与愿望单过滤', async () => {
    const handlers = createMcpToolHandlers(createFakeDb())

    const byCharacter = await handlers.goods_search({ character: '阿米娅' })
    expect(byCharacter.items.map((/** @type {any} */ i) => i.id)).toEqual(['g2'])

    const byCategory = await handlers.goods_search({ category: '吧唧' })
    expect(byCategory.items.map((/** @type {any} */ i) => i.id)).toEqual(['g1'])

    const byLocation = await handlers.goods_search({ storageLocation: 'B 柜' })
    expect(byLocation.items.map((/** @type {any} */ i) => i.id)).toEqual(['g2'])

    const wishlist = await handlers.goods_search({ wishlistOnly: true })
    expect(wishlist.items.map((/** @type {any} */ i) => i.id)).toEqual(['g3'])
  })

  it('goods_detail 返回完整字段，回收站条目也可查', async () => {
    const handlers = createMcpToolHandlers(createFakeDb())

    const detail = await handlers.goods_detail({ id: 'g1' })
    expect(detail.name).toBe('初音未来 吧唧')
    expect(detail.unitActualPriceList).toEqual(['25', '26'])
    expect(detail.imagesCount).toBe(1)
    expect(detail.trashed).toBe(false)

    const trashed = await handlers.goods_detail({ id: 'g4' })
    expect(trashed.trashed).toBe(true)
    expect(trashed.note).toBe('')

    await expect(handlers.goods_detail({ id: 'nope' })).rejects.toThrow('未找到')
  })

  it('collection_overview 汇总数量/估算花费/分布', async () => {
    const handlers = createMcpToolHandlers(createFakeDb())
    const overview = await handlers.collection_overview()

    // 活跃非愿望单：g1、g2
    expect(overview.totalItems).toBe(2)
    expect(overview.wishlistCount).toBe(1)
    // g1 有逐件价格 → 25+26=51；g2 无实付价按 0 计
    const cny = overview.estimatedSpend.find((/** @type {any} */ s) => s.currency === 'CNY')
    expect(cny.amount).toBe(51)
    // 类别分布按条数排序
    expect(overview.byCategory[0]).toEqual({ name: '吧唧', count: 1, quantity: 2 })
    expect(overview.byAcquiredYear).toEqual([
      { year: '2024', count: 1 },
      { year: '2025', count: 1 }
    ])
    expect(overview.acquiredDateRange).toEqual({ earliest: '2024-11-20', latest: '2025-07-01' })
  })

  it('events_list 过滤已删活动并输出关联统计', async () => {
    const handlers = createMcpToolHandlers(createFakeDb())
    const result = await handlers.events_list({})

    expect(result.total).toBe(1)
    expect(result.events[0]).toMatchObject({
      id: 'e1',
      name: 'CP 春季展',
      linkedGoodsCount: 1,
      photosCount: 1
    })
  })

  it('recharge_summary 汇总金额、按游戏/年份分组，可按年份过滤', async () => {
    const handlers = createMcpToolHandlers(createFakeDb())

    const all = await handlers.recharge_summary({})
    expect(all.totalAmount).toBe(678)
    expect(all.count).toBe(2)
    expect(all.byGame[0]).toEqual({ name: '明日方舟', total: 648, count: 1 })
    expect(all.recent[0].game).toBe('明日方舟')

    const y2024 = await handlers.recharge_summary({ year: 2024 })
    expect(y2024.totalAmount).toBe(30)
    expect(y2024.count).toBe(1)
  })

  it('spending_summary 按月汇总谷子消费与充值，支持年份过滤', async () => {
    const db = createFakeDb()
    db.getItems = vi.fn(async () => [
      { id: 'a1', name: 'x', isWishlist: false, acquiredAt: '2026-01-10', unitActualPriceList: ['25', '26'], actualPrice: '', actualPriceCurrency: 'CNY', currency: 'CNY', quantity: 1, updatedAt: 1 },
      { id: 'a2', name: 'y', isWishlist: false, acquiredAt: '2026-01-20', unitActualPriceList: [], actualPrice: '40', actualPriceCurrency: 'CNY', currency: 'CNY', quantity: 2, updatedAt: 2 },
      { id: 'a3', name: 'z', isWishlist: false, acquiredAt: '2025-12-05', unitActualPriceList: [], actualPrice: '99', actualPriceCurrency: 'CNY', currency: 'CNY', quantity: 1, updatedAt: 3 },
      { id: 'a4', name: 'wish', isWishlist: true, acquiredAt: '2026-01-01', unitActualPriceList: [], actualPrice: '999', actualPriceCurrency: 'CNY', currency: 'CNY', quantity: 1, updatedAt: 4 }
    ])
    db.getRechargeRecords = vi.fn(async () => [
      { id: 'r1', amount: 328, chargedAt: '2026-01-15', deleted: false },
      { id: 'r2', amount: 30, chargedAt: '2026-02-01', deleted: false },
      { id: 'r3', amount: 999, chargedAt: '2026-03-01', deleted: true }
    ])

    const handlers = createMcpToolHandlers(db)
    const result = await handlers.spending_summary({})

    const cny = result.goods.find((/** @type {any} */ g) => g.currency === 'CNY')
    expect(cny.total).toBe(230) // 25+26 + 40×2 + 99（未过滤年份，含 2025-12）
    expect(cny.byMonth).toEqual([
      { month: '2025-12', amount: 99, count: 1 },
      { month: '2026-01', amount: 131, count: 2 } // 51 + 80
    ])
    expect(result.recharge.total).toBe(358)
    expect(result.recharge.byMonth).toEqual([
      { month: '2026-01', amount: 328, count: 1 },
      { month: '2026-02', amount: 30, count: 1 }
    ])

    const y2025 = await handlers.spending_summary({ year: 2025 })
    expect(y2025.goods[0].total).toBe(99)
    expect(y2025.recharge.total).toBe(0)
  })

  it('createMcpServer 组装协议层：未知工具抛 McpUnknownToolError 由协议层转 -32602', async () => {
    const server = createMcpServer({ dbApi: createFakeDb() })
    const { body } = await server.handleRaw(JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'not_a_tool' }
    }))
    expect(body.error.code).toBe(-32602)

    // 注册的工具数量与定义一致
    const list = await server.handleRaw(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }))
    expect(list.body.result.tools).toHaveLength(MCP_TOOL_DEFINITIONS.length)
  })

  it('collection_overview 多币种分别累计', async () => {
    const db = createFakeDb()
    db.getItems = vi.fn(async () => [
      { id: 'j1', name: 'a', category: '', ip: '', characters: [], tags: [], isWishlist: false, quantity: 1, actualPrice: '10', actualPriceCurrency: 'JPY', currency: 'JPY', unitActualPriceList: [], updatedAt: 1 },
      { id: 'j2', name: 'b', category: '', ip: '', characters: [], tags: [], isWishlist: false, quantity: 2, actualPrice: '20', actualPriceCurrency: 'CNY', currency: 'CNY', unitActualPriceList: [], updatedAt: 2 }
    ])
    const overview = await createMcpToolHandlers(db).collection_overview()
    const byCurrency = Object.fromEntries(overview.estimatedSpend.map((/** @type {any} */ s) => [s.currency, s.amount]))
    expect(byCurrency.JPY).toBe(10)
    expect(byCurrency.CNY).toBe(40)
  })
})
