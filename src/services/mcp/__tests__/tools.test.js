import { describe, it, expect, vi } from 'vitest'
import { createMcpToolHandlers, createMcpServer } from '../tools'
import { MCP_TOOL_DEFINITIONS } from '../toolDefinitions'

const { fetchTrackLyricsMock } = vi.hoisted(() => ({ fetchTrackLyricsMock: vi.fn() }))
vi.mock('@/utils/trackLyrics', () => ({ fetchTrackLyrics: fetchTrackLyricsMock }))

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
      trashed: false, images: ['a.png'], statusTimeline: [{ date: '2025-07-01', text: '下单' }],
      tracks: [
        { id: 'at1', title: '专辑曲 A', artist: '初音未来', album: 'X', durationMs: 200000, source: 'netease', neteaseSongId: 'n1', qqSongId: '', bilibiliVideoId: '' },
        { id: 'at2', title: '专辑曲 B', artist: '', album: '', durationMs: 0, source: 'manual', neteaseSongId: '', qqSongId: '', bilibiliVideoId: '' }
      ]
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
      tags: ['线下'], linkedGoodsIds: ['g1'], photos: ['p1', { uri: 'https://img.example/stage.jpg', caption: '舞台' }], description: '两天都去了',
      deleted: false,
      tracks: [
        { id: 't1', title: 'Melt', artist: '初音未来', album: 'Secret', durationMs: 250000, source: 'netease', neteaseSongId: 'n1', qqSongId: '', bilibiliVideoId: '' },
        { id: 't2', title: '手写曲', artist: '', album: '', durationMs: 0, source: 'manual', neteaseSongId: '', qqSongId: '', bilibiliVideoId: '' }
      ]
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

    const collectionOnly = await handlers.goods_search({ collectionOnly: true })
    expect(collectionOnly.items.map((/** @type {any} */ i) => i.id).sort()).toEqual(['g1', 'g2']) // 排除愿望单 g3
    const both = await handlers.goods_search({})
    expect(both.total).toBe(3) // 缺省混合返回
  })

  it('goods_detail 返回完整字段，回收站条目也可查', async () => {
    const handlers = createMcpToolHandlers(createFakeDb())

    const detail = await handlers.goods_detail({ id: 'g1' })
    expect(detail.name).toBe('初音未来 吧唧')
    expect(detail.unitActualPriceList).toEqual(['25', '26'])
    expect(detail.imagesCount).toBe(1)
    // 图片返回可直接展示的 uri（主图为 coverUrl），AI 可用 ![](uri) 嵌入回复
    expect(detail.coverUrl).toBe('a.png')
    expect(detail.images[0]).toMatchObject({ uri: 'a.png', isPrimary: true })
    expect(detail.trashed).toBe(false)

    const trashed = await handlers.goods_detail({ id: 'g4' })
    expect(trashed.trashed).toBe(true)
    expect(trashed.note).toBe('')

    await expect(handlers.goods_detail({ id: 'nope' })).rejects.toThrow('未找到')
  })

  it('goods_search hasTracks 筛选带曲目条目并输出 tracksSummary', async () => {
    const handlers = createMcpToolHandlers(createFakeDb())

    const result = await handlers.goods_search({ hasTracks: true })
    expect(result.items.map((/** @type {any} */ i) => i.id)).toEqual(['g1'])
    expect(result.items[0].tracksSummary).toEqual({ total: 2, playable: 1, manualOnly: 1 })
  })

  it('goods_detail 返回 CD/专辑曲目明细（含可播状态）', async () => {
    const handlers = createMcpToolHandlers(createFakeDb())

    const detail = await handlers.goods_detail({ id: 'g1' })
    expect(detail.tracks).toHaveLength(2)
    expect(detail.tracks[0]).toMatchObject({ id: 'at1', title: '专辑曲 A', source: 'netease', playable: true })
    expect(detail.tracks[1]).toMatchObject({ id: 'at2', source: 'manual', playable: false })

    // 无曲目条目输出空数组
    const plain = await handlers.goods_detail({ id: 'g2' })
    expect(plain.tracks).toEqual([])
  })

  it('music_lyrics 返回演出曲目歌词（结构化行 + 纯文本）', async () => {
    fetchTrackLyricsMock.mockResolvedValue({
      lines: [{ timeMs: 1000, text: '第一句' }, { timeMs: 5000, text: '第二句' }],
      source: 'netease',
      matched: false
    })
    const handlers = createMcpToolHandlers(createFakeDb())

    const result = await handlers.music_lyrics({ eventId: 'e1', trackId: 't1' })
    expect(result.lyricSource).toBe('netease')
    expect(result.matched).toBe(false)
    expect(result.linesCount).toBe(2)
    expect(result.text).toBe('第一句\n第二句')
    expect(result.lines[0]).toEqual({ timeMs: 1000, text: '第一句' })
    expect(fetchTrackLyricsMock).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }))
  })

  it('music_lyrics 支持 CD/专辑谷子并做参数/音源校验', async () => {
    fetchTrackLyricsMock.mockResolvedValue({ lines: [{ timeMs: 0, text: '词' }], source: 'qq', matched: true })
    const handlers = createMcpToolHandlers(createFakeDb())

    const result = await handlers.music_lyrics({ goodsId: 'g1', trackId: 'at1' })
    expect(result.from).toBe('初音未来 吧唧')
    expect(result.goodsId).toBe('g1')

    await expect(handlers.music_lyrics({ eventId: 'e1', trackId: 't2' })).rejects.toThrow('未关联在线音源')
    await expect(handlers.music_lyrics({ trackId: 't1' })).rejects.toThrow('eventId')
    await expect(handlers.music_lyrics({ eventId: 'e1', goodsId: 'g1', trackId: 't1' })).rejects.toThrow('二选一')
    await expect(handlers.music_lyrics({ eventId: 'nope', trackId: 't1' })).rejects.toThrow('未找到')
    await expect(handlers.music_lyrics({ eventId: 'e1', trackId: 'nope' })).rejects.toThrow('未找到')
  })

  it('collection_overview 汇总数量/估算花费/分布', async () => {
    const handlers = createMcpToolHandlers(createFakeDb())
    const overview = await handlers.collection_overview()

    // 活跃非愿望单：g1、g2；g3 为愿望单
    expect(overview.collectionCount).toBe(2)
    expect(overview.wishlistCount).toBe(1)
    expect(overview.grandTotal).toBe(3)
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
      photosCount: 2
    })
  })

  it('recharge_summary 汇总金额、按游戏/年份分组，可按年份过滤', async () => {
    const handlers = createMcpToolHandlers(createFakeDb())

    const all = await handlers.recharge_summary({})
    expect(all.totalAmount).toBe(678)
    expect(all.count).toBe(2)
    expect(all.byGame[0]).toEqual({ name: '明日方舟', total: 648, count: 1 })
    expect(all.recent[0].game).toBe('明日方舟')

    // 按充值项目细分（游戏·项目）
    expect(all.byItem[0]).toEqual({ name: '明日方舟·648 源石', total: 648, count: 1 })
    expect(all.byItem[1]).toEqual({ name: '初音速报·月卡', total: 30, count: 1 })

    const y2024 = await handlers.recharge_summary({ year: 2024 })
    expect(y2024.totalAmount).toBe(30)
    expect(y2024.count).toBe(1)
  })

  it('recharge_search 按游戏/项目/年份过滤并聚合 byItem/byMonth', async () => {
    const handlers = createMcpToolHandlers(createFakeDb())

    const byGame = await handlers.recharge_search({ game: '明日方舟' })
    expect(byGame.count).toBe(1)
    expect(byGame.totalAmount).toBe(648)
    expect(byGame.byItem[0]).toMatchObject({ item: '648 源石', game: '明日方舟', total: 648, count: 1 })
    expect(byGame.byMonth[0]).toEqual({ month: '2025-01', total: 648, count: 1 })
    expect(byGame.records[0].itemName).toBe('648 源石')

    const byItem = await handlers.recharge_search({ itemName: '月卡' })
    expect(byItem.count).toBe(1)
    expect(byItem.totalAmount).toBe(30)

    const byYear = await handlers.recharge_search({ year: 2024 })
    expect(byYear.count).toBe(1)
    // 已删记录不参与
    const deleted = await handlers.recharge_search({ query: '已删' })
    expect(deleted.count).toBe(0)

    await expect(handlers.recharge_search({ month: 3 })).rejects.toThrow('month 需与 year')
    await expect(handlers.recharge_search({ year: 2025, month: 13 })).rejects.toThrow('1-12')
  })

  it('budget_overview 输出预算进度与逐月/逐年超支标记（官方逐件口径）', async () => {
    const budgetApi = { read: vi.fn(async () => ({ monthly: 40, yearly: 45 })) }
    const handlers = createMcpToolHandlers(createFakeDb(), {}, budgetApi)

    const result = await handlers.budget_overview()
    expect(budgetApi.read).toHaveBeenCalled()
    expect(result.budget).toMatchObject({ monthly: 40, yearly: 45 })

    // byMonth 只覆盖当前年份的 12 个月
    expect(result.byMonth).toHaveLength(12)
    expect(result.byMonth.every((/** @type {any} */ m) => m.month.startsWith(result.current.year))).toBe(true)

    // 年度口径：g1 51 @2025、g2 未填实付回退标价 50 @2024，均超年度预算 45；g3 愿望单不计
    expect(result.byYear.find((/** @type {any} */ y) => y.year === '2025')).toMatchObject({ spent: 51, budget: 45, overBudget: true })
    expect(result.byYear.find((/** @type {any} */ y) => y.year === '2024')).toMatchObject({ spent: 50, budget: 45, overBudget: true })

    // 当前周期进度结构
    expect(result.current.month).toMatch(/^\d{4}-\d{2}$/)
    expect(result.current.year).toMatch(/^\d{4}$/)
    expect(result.current.monthProgress).toMatchObject({ budget: 40, hasBudget: true })
    expect(result.current.yearProgress.hasBudget).toBe(true)
  })

  it('budget_overview 未注入预算读取时视为未设置', async () => {
    const handlers = createMcpToolHandlers(createFakeDb())
    const result = await handlers.budget_overview()
    expect(result.budget).toMatchObject({ monthly: 0, yearly: 0 })
    expect(result.current.monthProgress.hasBudget).toBe(false)
  })

  it('spending_summary 按月汇总谷子消费与充值（官方逐件口径），支持年份过滤', async () => {
    const db = createFakeDb()
    db.getItems = vi.fn(async () => [
      { id: 'a1', name: 'x', isWishlist: false, acquiredAt: '2026-01-10', unitActualPriceList: ['25', '26'], unitAcquiredAtList: ['2026-01-10', '2026-01-10'], actualPrice: '', actualPriceCurrency: 'CNY', currency: 'CNY', quantity: 2, updatedAt: 1 },
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

    // 官方逐件口径：25 + 26（逐件）+ 40（整条实付价）+ 99；愿望单不计入
    expect(result.goods.total).toBe(190)
    expect(result.goods.currency).toBe('（混合，未折算）')
    expect(result.goods.byMonth).toEqual([
      { month: '2025-12', amount: 99, count: 1 },
      { month: '2026-01', amount: 91, count: 3 } // 25 + 26 + 40
    ])
    expect(result.recharge.total).toBe(358)
    expect(result.recharge.byMonth).toEqual([
      { month: '2026-01', amount: 328, count: 1 },
      { month: '2026-02', amount: 30, count: 1 }
    ])

    const y2025 = await handlers.spending_summary({ year: 2025 })
    expect(y2025.goods.total).toBe(99)
    expect(y2025.recharge.total).toBe(0)
  })

  it('character_leaderboard 按角色聚合条目数/花费，多角色条目计入每个角色', async () => {
    const db = createFakeDb()
    db.getItems = vi.fn(async () => [
      { id: 'a', name: 'x', isWishlist: false, characters: ['纳西妲', '芙宁娜'], quantity: 1, unitActualPriceList: ['50'], unitAcquiredAtList: ['2025-07-01'], actualPrice: '', actualPriceCurrency: 'CNY', currency: 'CNY', collectStatus: '已拥有', updatedAt: 1 },
      { id: 'b', name: 'y', isWishlist: false, characters: ['纳西妲'], quantity: 2, unitActualPriceList: [], actualPrice: '30', actualPriceCurrency: 'CNY', currency: 'CNY', collectStatus: '已拥有', acquiredAt: '2025-08-01', updatedAt: 2 },
      { id: 'c', name: 'wish', isWishlist: true, characters: ['芙宁娜'], quantity: 1, unitActualPriceList: [], actualPrice: '', price: '199', currency: 'CNY', collectStatus: '未入手', updatedAt: 3 },
      { id: 'd', name: 'none', isWishlist: false, characters: [], quantity: 1, unitActualPriceList: [], actualPrice: '10', actualPriceCurrency: 'CNY', currency: 'CNY', collectStatus: '已拥有', updatedAt: 4 }
    ])

    const result = await createMcpToolHandlers(db).character_leaderboard({})
    expect(result.total).toBe(3)
    // 纳西妲：已收藏 2 条；芙宁娜：已收藏 1 条 + 愿望单 1 条
    const nahida = result.characters.find((/** @type {any} */ c) => c.character === '纳西妲')
    const funina = result.characters.find((/** @type {any} */ c) => c.character === '芙宁娜')
    expect(nahida).toMatchObject({ count: 2, quantity: 3, wishlistCount: 0, soldCount: 0 })
    expect(nahida.spend[0]).toEqual({ currency: 'CNY', amount: 80 }) // 50（逐件）+ 30（整条实付价）
    expect(funina).toMatchObject({ count: 1, wishlistCount: 1 })
    expect(funina.spend[0].amount).toBe(50) // 只计已收藏条目 x 的 50，愿望单条目计 0
    // 无角色条目归入占位桶
    expect(result.characters.at(-1).character).toBe('（未标注角色）')
  })

  it('storage_locations 按位置聚合并排除愿望单，空位置归「未收纳」', async () => {
    const db = createFakeDb()
    db.getItems = vi.fn(async () => [
      { id: 'a', name: 'A1', isWishlist: false, storageLocation: 'A 柜', quantity: 2, unitActualPriceList: [], actualPrice: '20', actualPriceCurrency: 'CNY', currency: 'CNY', updatedAt: 1 },
      { id: 'b', name: 'A2', isWishlist: false, storageLocation: 'A 柜', quantity: 1, unitActualPriceList: [], actualPrice: '10', actualPriceCurrency: 'CNY', currency: 'CNY', updatedAt: 2 },
      { id: 'c', name: 'loose', isWishlist: false, storageLocation: '', quantity: 1, unitActualPriceList: [], actualPrice: '5', actualPriceCurrency: 'CNY', currency: 'CNY', updatedAt: 3 },
      { id: 'd', name: 'wish', isWishlist: true, storageLocation: 'A 柜', quantity: 1, unitActualPriceList: [], actualPrice: '', currency: 'CNY', updatedAt: 4 }
    ])

    const result = await createMcpToolHandlers(db).storage_locations({})
    expect(result.total).toBe(2)
    const cab = result.locations.find((/** @type {any} */ l) => l.location === 'A 柜')
    expect(cab).toMatchObject({ count: 2, quantity: 3, spend: 50 })
    expect(cab.samples).toEqual(['A1', 'A2'])
    expect(result.locations.at(-1).location).toBe('（未收纳）')
  })

  it('wishlist_overview 汇总期望花费与最近条目', async () => {
    const db = createFakeDb()
    db.getItems = vi.fn(async () => [
      { id: 'w1', name: '手办', isWishlist: true, ip: '初音未来', category: '手办', price: '599', currency: 'CNY', quantity: 1, updatedAt: 10 },
      { id: 'w2', name: '吧唧', isWishlist: true, ip: '初音未来', category: '吧唧', price: '30', currency: 'CNY', quantity: 2, updatedAt: 20 },
      { id: 'w3', name: '挂件', isWishlist: true, ip: '原神', category: '挂件', price: '500', currency: 'JPY', quantity: 1, updatedAt: 30 },
      { id: 'own', name: '已拥有', isWishlist: false, price: '1', currency: 'CNY', quantity: 1, updatedAt: 1 }
    ])

    const result = await createMcpToolHandlers(db).wishlist_overview({})
    expect(result.total).toBe(3)
    const cny = result.expectedSpend.find((/** @type {any} */ s) => s.currency === 'CNY')
    const jpy = result.expectedSpend.find((/** @type {any} */ s) => s.currency === 'JPY')
    expect(cny.amount).toBe(659) // 599 + 30×2
    expect(jpy.amount).toBe(500)
    expect(result.byIp[0]).toEqual({ name: '初音未来', count: 2 })
    expect(result.recent[0].id).toBe('w3') // updatedAt 最新
  })

  it('sale_ledger 复用 saleStats 口径：回血=成交价-手续费，盈亏计入成本', async () => {
    const db = createFakeDb()
    db.getItems = vi.fn(async () => [
      {
        id: 's1', name: '旧吧唧', isWishlist: false, collectStatus: '已出',
        sellPrice: '30', sellFee: '2', sellDate: '2026-01-05', sellPlatform: '闲鱼',
        actualPrice: '20', shippingFee: '0', quantity: 1, unitCollectStatusList: [], unitSaleInfoList: [],
        currency: 'CNY', updatedAt: 1
      },
      {
        id: 's2', name: '在售立牌', isWishlist: false, collectStatus: '在售',
        sellPrice: '80', sellFee: '', sellDate: '', sellPlatform: '',
        actualPrice: '60', shippingFee: '0', quantity: 1, unitCollectStatusList: [], unitSaleInfoList: [],
        currency: 'CNY', updatedAt: 2
      }
    ])

    const result = await createMcpToolHandlers(db).sale_ledger({})
    expect(result.summary).toMatchObject({
      recoveredTotal: 28, // 30 - 2
      listingTotal: 80,
      profitTotal: 8, // 30 - 2 - 20（成本）
      soldCount: 1,
      listingCount: 1
    })
    expect(result.summary.soldCount).toBe(1)
    expect(result.recentSold[0]).toMatchObject({ name: '旧吧唧', price: 30, fee: 2, profit: 8, hasPrice: true })
    expect(result.listing[0]).toMatchObject({ name: '在售立牌', price: 80 })

    // 年份过滤后 summary 同步过滤（回归：此前 summary 恒为全量数字）
    const y2025 = await createMcpToolHandlers(db).sale_ledger({ year: 2025 })
    expect(y2025.soldCount).toBeUndefined()
    expect(y2025.summary).toMatchObject({ recoveredTotal: 0, profitTotal: 0, soldCount: 0 })
    expect(y2025.recentSold).toHaveLength(0)
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

  it('goods_search 支持入手日期与价格区间过滤', async () => {
    const db = createFakeDb()
    db.getItems = vi.fn(async () => [
      { id: 'r1', name: '六月的谷子', isWishlist: false, acquiredAt: '2026-06-15', actualPrice: '200', price: '', currency: 'CNY', updatedAt: 1 },
      { id: 'r2', name: '一月的手办', isWishlist: false, acquiredAt: '2026-01-05', actualPrice: '', price: '600', currency: 'CNY', updatedAt: 2 },
      { id: 'r3', name: '没填日期和价格', isWishlist: false, acquiredAt: '', actualPrice: '', price: '', currency: 'CNY', updatedAt: 3 }
    ])
    const handlers = createMcpToolHandlers(db)

    const june = await handlers.goods_search({ acquiredAfter: '2026-06-01', acquiredBefore: '2026-06-30' })
    expect(june.items.map((/** @type {any} */ i) => i.id)).toEqual(['r1'])

    const expensive = await handlers.goods_search({ priceMin: 100 })
    // 命中 r1/r2；结果按更新时间倒序
    expect(expensive.items.map((/** @type {any} */ i) => i.id)).toEqual(['r2', 'r1']) // 实付价优先，r2 回退标价 600

    const cheap = await handlers.goods_search({ priceMax: 100 })
    expect(cheap.items.map((/** @type {any} */ i) => i.id)).toEqual(['r3']) // 未填价格按 0

    await expect(handlers.goods_search({ acquiredAfter: '2026/06/01' })).rejects.toThrow('acquiredAfter')
    await expect(handlers.goods_search({ priceMin: 'abc' })).rejects.toThrow('priceMin')
  })

  it('events_list 输出活动花费汇总（票价+逐日票+其他开支）', async () => {
    const db = createFakeDb()
    db.getEvents = vi.fn(async () => [
      {
        id: 'e1', name: 'CP 展', type: '漫展', startDate: '2026-08-01', endDate: '2026-08-02',
        city: '上海', location: '展馆', ticketPrice: '80', ticketType: '单日票', seatInfo: '',
        dayTicketList: [{ price: '80', ticketType: '单日票' }, { price: '100', ticketType: '内场票' }],
        otherExpenses: [{ id: 'o1', name: '来回高铁', amount: '300' }, { id: 'o2', name: '住宿', amount: '250' }],
        tags: [], linkedGoodsIds: [], photos: [], description: '', deleted: false
      }
    ])

    const result = await createMcpToolHandlers(db).events_list({})
    expect(result.events[0].expenseSummary).toEqual({
      ticket: 80,
      dayTicketsTotal: 180,
      otherTotal: 550,
      total: 810
    })
    expect(result.events[0].otherExpenses).toEqual([
      { name: '来回高铁', amount: '300' },
      { name: '住宿', amount: '250' }
    ])
  })

  it('event_tracks 默认只给曲目概况与演出基本信息，过滤无曲单/已删活动', async () => {
    const handlers = createMcpToolHandlers(createFakeDb())

    const result = await handlers.event_tracks({})
    expect(result.total).toBe(1)
    expect(result.events[0].id).toBe('e1')
    // 基础信息要够 AI 介绍演出用
    expect(result.events[0]).toMatchObject({
      name: 'CP 春季展',
      city: '上海',
      location: '世博展览馆',
      ticketPrice: '80',
      ticketType: '单日票'
    })
    // 现场照片：uri 可直接展示（字符串/对象两种存法都兼容）
    expect(result.events[0].photos).toEqual([
      { uri: 'p1', caption: '' },
      { uri: 'https://img.example/stage.jpg', caption: '舞台' }
    ])
    // 默认不返回曲目明细，只有概况
    expect(result.events[0].tracks).toBeUndefined()
    expect(result.events[0].tracksSummary).toEqual({ total: 2, playable: 1, manualOnly: 1 })
    expect(result.hint).toContain('includeTracks')
  })

  it('event_tracks 传 includeTracks: true 才返回曲目明细并标注可播状态', async () => {
    const handlers = createMcpToolHandlers(createFakeDb())

    const result = await handlers.event_tracks({ eventId: 'e1', includeTracks: true })
    expect(result.events).toHaveLength(1)
    expect(result.events[0].tracks).toHaveLength(2)
    expect(result.events[0].tracks[0]).toMatchObject({
      id: 't1', title: 'Melt', source: 'netease', playable: true
    })
    expect(result.events[0].tracks[1]).toMatchObject({
      id: 't2', title: '手写曲', source: 'manual', playable: false
    })
    expect(result.events[0].tracks[1].note).toContain('未关联在线音源')
  })

  it('event_tracks 支持 eventId 精确查询与歌名/演出名关键词', async () => {
    const handlers = createMcpToolHandlers(createFakeDb())

    const byId = await handlers.event_tracks({ eventId: 'e1' })
    expect(byId.events).toHaveLength(1)
    expect(byId.events[0].tracksSummary.total).toBe(2)

    // 不存在的 eventId 明确报错（而非空结果）
    await expect(handlers.event_tracks({ eventId: 'nope' })).rejects.toThrow('未找到')

    // 歌名命中 → 概况只统计匹配曲目
    const byTitle = await handlers.event_tracks({ query: 'melt' })
    expect(byTitle.total).toBe(1)
    expect(byTitle.events[0].tracksSummary).toEqual({ total: 1, playable: 1, manualOnly: 0 })

    // 演出名命中 → 整场曲单概况
    const byName = await handlers.event_tracks({ query: '春季展' })
    expect(byName.events[0].tracksSummary.total).toBe(2)

    // 关键词无命中 → 空列表
    const none = await handlers.event_tracks({ query: '不存在的歌' })
    expect(none.total).toBe(0)
    expect(none.events).toEqual([])

    await expect(handlers.event_tracks({ eventId: 'e1', query: 'x' })).rejects.toThrow('二选一')
  })

  it('createMcpServer 写入门禁：关闭时写工具不展示且调用被拒', async () => {
    const db = createFakeDb()

    const closed = createMcpServer({ dbApi: db })
    const closedList = await closed.handleRaw(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }))
    const closedNames = closedList.body.result.tools.map((/** @type {any} */ t) => t.name)
    expect(closedNames).not.toContain('goods_add')

    const closedCall = await closed.handleRaw(JSON.stringify({
      jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'goods_add', arguments: { name: 'x' } }
    }))
    expect(closedCall.body.result.isError).toBe(true)
    expect(closedCall.body.result.content[0].text).toContain('外部 MCP 写入未开启')

    const open = createMcpServer({ dbApi: db, allowWriteTools: true })
    const openList = await open.handleRaw(JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/list' }))
    const openNames = openList.body.result.tools.map((/** @type {any} */ t) => t.name)
    expect(openNames).toContain('goods_add')
    expect(openNames).toContain('goods_sell')
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
