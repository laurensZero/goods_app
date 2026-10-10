import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../mtop', () => ({ mtopCall: vi.fn() }))
vi.mock('../cookie', () => ({
  getTaobaoCookie: vi.fn(),
  isTaobaoCookieReady: vi.fn((cookie) => Boolean(cookie)),
  setTaobaoCookie: vi.fn(),
  clearTaobaoCookie: vi.fn(),
  normalizeTaobaoCookie: vi.fn((raw) => raw),
  getTaobaoCookieSync: vi.fn(() => ''),
  __resetTaobaoCookieCache: vi.fn(),
}))
vi.mock('../request', () => ({
  taobaoPageGet: vi.fn(),
  classifyPageResponse: vi.fn(() => 'OK'),
  TaobaoRequestError: class extends Error {
    constructor(code, message) {
      super(message || code)
      this.name = 'TaobaoRequestError'
      this.code = code
    }
  },
}))

import { mtopCall } from '../mtop'
import { getTaobaoCookie } from '../cookie'
import { TaobaoRequestError } from '../request'
import { searchTaobaoItems, TaobaoImportError, TAOBAO_SEARCH_PAGE_SIZE } from '../service'

const READY_COOKIE = 'cookie2=xyz; _m_h5_tk=aaaa_1'

function mtopItems(list) {
  return { ret: ['SUCCESS'], data: { itemsArray: list } }
}

beforeEach(() => {
  vi.clearAllMocks()
  getTaobaoCookie.mockResolvedValue(READY_COOKIE)
})

describe('searchTaobaoItems', () => {
  it('归一化 SUCCESS 结果：去标题高亮标签、价格补 ¥、协议头补全、无 itemId 过滤', async () => {
    mtopCall.mockResolvedValue(mtopItems([
      {
        item_id: 123,
        title: '【<em>原神</em>】徽章',
        priceShow: { priceText: '12.50' },
        shopInfo: { shopName: '官方店' },
        pic_path: '//gw.alicdn.com/x.jpg',
        realSales: '100+人收货',
      },
      { itemId: 456, title: '立牌', price: '¥30', nick: '小店', picPath: 'https://img/2.jpg', auctionURL: 'https://item.taobao.com/item.htm?id=456' },
      { title: '没有 itemId 应被丢弃' },
    ]))

    const { items, page } = await searchTaobaoItems('原神 徽章')

    expect(page).toBe(1)
    expect(items).toEqual([
      { itemId: '123', title: '【原神】徽章', price: '¥12.50', shop: '官方店', pic: 'https://gw.alicdn.com/x.jpg', sales: '100+人收货' },
      { itemId: '456', title: '立牌', price: '¥30', shop: '小店', pic: 'https://img/2.jpg', sales: '' },
    ])
  })

  it('搜索 CDN 裂图域 g.search.alicdn.com 改写为 g-search1.alicdn.com', async () => {
    mtopCall.mockResolvedValue(mtopItems([
      { item_id: 789, title: '谷子', pic_path: '//g.search.alicdn.com/img/O1CN01-0-item_pic.jpg' },
    ]))

    const { items } = await searchTaobaoItems('谷子')

    expect(items[0].pic).toBe('https://g-search1.alicdn.com/img/O1CN01-0-item_pic.jpg')
  })

  it('透传关键词与分页到 mtop 外层 params（appId 34385）', async () => {
    mtopCall.mockResolvedValue(mtopItems([]))
    await searchTaobaoItems('  谷子  ', { page: 3 })

    const call = mtopCall.mock.calls[0][0]
    expect(call.api).toBe('mtop.relationrecommend.wirelessrecommend.recommend')
    expect(call.v).toBe('2.0')
    expect(call.referer).toBe('https://s.taobao.com/')
    expect(call.cookie).toBe(READY_COOKIE)
    expect(call.data.appId).toBe('34385')
    const params = JSON.parse(call.data.params)
    expect(params.q).toBe('谷子')
    expect(params.page).toBe(3)
    expect(params.pageSize).toBe(TAOBAO_SEARCH_PAGE_SIZE)
    expect(params.n).toBe(TAOBAO_SEARCH_PAGE_SIZE)
    expect(params.sort).toBe('_coefp')
  })

  it('空关键词抛 INVALID_QUERY', async () => {
    await expect(searchTaobaoItems('   ')).rejects.toMatchObject({ name: 'TaobaoImportError', code: 'INVALID_QUERY' })
    expect(mtopCall).not.toHaveBeenCalled()
  })

  it('无 Cookie 抛 NO_COOKIE，不发请求', async () => {
    getTaobaoCookie.mockResolvedValue('')
    await expect(searchTaobaoItems('原神')).rejects.toMatchObject({ code: 'NO_COOKIE' })
    expect(mtopCall).not.toHaveBeenCalled()
  })

  it('mtop 错误映射：BLOCKED→BLOCKED、TOKEN→LOGIN_REQUIRED、FAIL→SEARCH（带 ret 文案）', async () => {
    mtopCall.mockRejectedValueOnce(new TaobaoRequestError('BLOCKED', '风控挑战'))
    await expect(searchTaobaoItems('x')).rejects.toMatchObject({ code: 'BLOCKED' })

    mtopCall.mockRejectedValueOnce(new TaobaoRequestError('TOKEN', 'FAIL_SYS_TOKEN_EXPIRED'))
    await expect(searchTaobaoItems('x')).rejects.toMatchObject({ code: 'LOGIN_REQUIRED' })

    mtopCall.mockRejectedValueOnce(new TaobaoRequestError('FAIL', 'FAIL_SYS_TRAFFIC_LIMIT'))
    await expect(searchTaobaoItems('x')).rejects.toMatchObject({ code: 'SEARCH', message: 'FAIL_SYS_TRAFFIC_LIMIT' })

    mtopCall.mockRejectedValueOnce(new TaobaoRequestError('HTTP', 'HTTP 503'))
    await expect(searchTaobaoItems('x')).rejects.toMatchObject({ code: 'HTTP' })
  })
})

describe('TaobaoImportError', () => {
  it('携带 code 与默认 message', () => {
    const error = new TaobaoImportError('BLOCKED')
    expect(error.code).toBe('BLOCKED')
    expect(error.message).toBe('BLOCKED')
    expect(error.name).toBe('TaobaoImportError')
  })
})
