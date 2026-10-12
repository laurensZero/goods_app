import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../request', () => {
  class TaobaoRequestError extends Error {
    constructor(code, message) {
      super(message || code)
      this.name = 'TaobaoRequestError'
      this.code = code
    }
  }
  return { taobaoPageGet: vi.fn(), taobaoPagePost: vi.fn(), TaobaoRequestError }
})
vi.mock('../cookie', () => ({
  getTaobaoCookie: vi.fn(),
  isTaobaoCookieReady: vi.fn(),
  setTaobaoCookie: vi.fn(async (c) => c),
}))
vi.mock('../mtop', () => ({ mtopCall: vi.fn() }))
vi.mock('../service', () => {
  class TaobaoImportError extends Error {
    constructor(code, message) {
      super(message || code)
      this.name = 'TaobaoImportError'
      this.code = code
    }
  }
  return { TaobaoImportError }
})

import { isTaobaoCookieReady, getTaobaoCookie } from '../cookie'
import { mtopCall } from '../mtop'
import { TaobaoRequestError } from '../request'
import {
  parseCartResponse,
  cartItemToGoods,
  fetchTaobaoCart,
  buildCartPayload,
  TAOBAO_CART_API,
} from '../cart'

/** 按真实 query.bag 响应形状构造的最小 fixture（1 有效 + 1 失效，同店铺） */
function makeBodyFixture() {
  return {
    ret: ['SUCCESS::调用成功'],
    data: {
      data: {
        item_665: {
          tag: 'item',
          id: '665',
          fields: {
            cartId: '665',
            itemId: '1085017453509',
            title: '【赠品】Hanser「花生与葱花」个人类·演唱会限定明信片（一套）',
            shopId: '151121773',
            shopTitle: 'bilibili旗舰店',
            quantity: 1,
            pic: '//gw.alicdn.com/imgextra/i4/2138521987/xxx.png',
            pay: { now: 2000, nowTitle: '￥20' },
            sku: { skuId: '0', status: 'NO_SKU', title: '', skuMap: {} },
            isInvalid: false,
            outerUrl: 'https://item.taobao.com/item.htm?id=1085017453509',
          },
        },
        item_664: {
          tag: 'item',
          id: '664',
          fields: {
            cartId: '664',
            itemId: '1083894893156',
            title: '哔哩哔哩Hanser「花生与葱花」个人类·演唱会马口铁徽章（盲抽）',
            shopId: '151121773',
            shopTitle: 'bilibili旗舰店',
            quantity: 1,
            pic: '//gw.alicdn.com/imgextra/i3/2138521987/yyy.png',
            pay: { now: 2500, nowTitle: '￥25' },
            sku: {
              skuId: '6137836077911',
              status: 'CAN_NOT_CHANGE_SKU',
              title: '随机一款;58mm',
              skuMap: { 大小: '58mm', 颜色分类: '随机一款' },
            },
            isInvalid: true,
            outerUrl: 'https://item.taobao.com/item.htm?id=1083894893156',
          },
        },
        group_1: { tag: 'group', id: '1', fields: {} },
        header_1: { tag: 'header', id: '1', fields: {} },
      },
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('buildCartPayload', () => {
  it('与 PC 购物车主站一致的 form 载荷', () => {
    const p = buildCartPayload()
    expect(p.cartFrom).toBe('main_site')
    expect(p.isPage).toBe(true)
    const ex = JSON.parse(p.exParams)
    expect(ex.spiPage).toBe('pcTao')
    expect(ex.isPcMixCart).toBe('true')
  })
})

describe('parseCartResponse', () => {
  it('抽取 tag=item 节点并按店铺分组，忽略 group/header', () => {
    const parsed = parseCartResponse(makeBodyFixture())
    expect(parsed.total).toBe(2)
    expect(parsed.invalidCount).toBe(1)
    expect(parsed.groups).toHaveLength(1)
    const group = parsed.groups[0]
    expect(group.shopName).toBe('bilibili旗舰店')
    expect(group.items).toHaveLength(2)
    expect(group.items[0].title).toContain('明信片')
    expect(group.items[0].priceNowCents).toBe(2000)
    expect(group.items[0].pic).toBe('https://gw.alicdn.com/imgextra/i4/2138521987/xxx.png')
    expect(group.items[1].isInvalid).toBe(true)
    expect(group.items[1].skuText).toBe('随机一款;58mm')
  })

  it('缺少 data.data 时抛错', () => {
    expect(() => parseCartResponse({ data: {} })).toThrow(/data\.data/)
  })
})

describe('cartItemToGoods', () => {
  it('映射为草稿字段（含图片、SKU、失效标记）', () => {
    const parsed = parseCartResponse(makeBodyFixture())
    const valid = cartItemToGoods(parsed.groups[0].items[0])
    expect(valid.name).toContain('明信片')
    expect(valid.ip).toBe('哔哩哔哩')
    expect(valid.price).toBe('20')
    expect(valid.image).toBe('https://gw.alicdn.com/imgextra/i4/2138521987/xxx.png')
    expect(valid.images).toEqual([valid.image])
    expect(valid.note).toBe('淘宝购物车')
    expect(valid.acquiredAt).toBe('')
    expect(valid._itemKey).toBe('cart_1085017453509_0')
    expect(valid._isInvalid).toBe(false)
    expect(valid._shopName).toBe('bilibili旗舰店')

    const invalid = cartItemToGoods(parsed.groups[0].items[1])
    expect(invalid._isInvalid).toBe(true)
    expect(invalid.variant).toBe('随机一款;58mm')
    expect(invalid.price).toBe('25')
    expect(invalid._itemKey).toBe('cart_1083894893156_6137836077911')
  })
})

describe('fetchTaobaoCart', () => {
  it('Cookie 未就绪 → NO_COOKIE', async () => {
    isTaobaoCookieReady.mockReturnValue(false)
    await expect(fetchTaobaoCart()).rejects.toMatchObject({
      name: 'TaobaoImportError',
      code: 'NO_COOKIE',
    })
    expect(mtopCall).not.toHaveBeenCalled()
  })

  it('成功时 form 调用 query.bag 并返回分组草稿', async () => {
    isTaobaoCookieReady.mockReturnValue(true)
    getTaobaoCookie.mockResolvedValue('cookie2=1; _m_h5_tk=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa_1')
    mtopCall.mockResolvedValue(makeBodyFixture())

    const result = await fetchTaobaoCart()

    expect(mtopCall).toHaveBeenCalledTimes(1)
    const call = mtopCall.mock.calls[0][0]
    expect(call.api).toBe(TAOBAO_CART_API)
    expect(call.form).toBe(true)
    expect(call.preferProxy).toBe(true)
    expect(call.referer).toContain('cart.taobao.com')

    expect(result.total).toBe(2)
    expect(result.invalidCount).toBe(1)
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0].goods).toHaveLength(2)
    expect(result.groups[0].goods[0].image).toContain('alicdn.com')
    expect(result.groups[0].goods[1]._isInvalid).toBe(true)
  })

  it('mtop TOKEN → LOGIN_REQUIRED；BLOCKED → BLOCKED', async () => {
    isTaobaoCookieReady.mockReturnValue(true)

    mtopCall.mockRejectedValueOnce(new TaobaoRequestError('TOKEN', 'FAIL_SYS_TOKEN_EMPTY'))
    await expect(fetchTaobaoCart()).rejects.toMatchObject({ code: 'LOGIN_REQUIRED' })

    mtopCall.mockRejectedValueOnce(new TaobaoRequestError('BLOCKED', 'tmd'))
    await expect(fetchTaobaoCart()).rejects.toMatchObject({ code: 'BLOCKED' })
  })
})
