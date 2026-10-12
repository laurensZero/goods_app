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
import { gunzipSync, strFromU8 } from 'fflate'
import {
  parseCartResponse,
  cartItemToGoods,
  fetchTaobaoCart,
  buildCartPayload,
  mergeCartHierarchy,
  buildCartPagePayload,
  encodeCartParams,
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
        global_1: { tag: 'global', id: '1', fields: {} },
        extendBody_1: {
          tag: 'extendBody',
          id: '1',
          hasMore: true,
          fields: { attributes: { allItemCnt: 75 } },
        },
      },
      linkage: {
        input: ['global_1', 'extendBody_1'],
        common: { desc: '购物车' },
      },
      endpoint: 'cartView',
      hierarchy: {
        root: 'global_1',
        structure: { global_1: ['header_1', 'group_1'], group_1: ['item_665', 'item_664'] },
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

/** base64 → gunzip → JSON（模拟服务端解 params） */
function decodeCartParams(base64) {
  const bin = atob(base64)
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0))
  return JSON.parse(strFromU8(gunzipSync(bytes)))
}

describe('购物车翻页协议', () => {
  it('首页载荷不带 params/feature，翻页载荷带 gzip feature + params', () => {
    expect(buildCartPayload().params).toBeUndefined()
    expect(buildCartPayload().feature).toBeUndefined()

    const paging = buildCartPayload({ params: 'abc' })
    expect(paging.params).toBe('abc')
    expect(paging.feature).toBe('{"gzip":true}')
    const ex = JSON.parse(paging.exParams)
    expect(ex.iCheckedCartIds).toBe('')
    expect(ex.tabFilterItem).toBe('')
    expect(ex.filterItem).toBe('')
    expect(ex.spiPage).toBe('pcTao')
  })

  it('mergeCartHierarchy：structure 数组去重拼接、标量取新值', () => {
    const prev = {
      root: 'global_1',
      structure: { global_1: ['header_1', 'group_1'], group_1: ['item_1'] },
    }
    const next = {
      root: 'global_1',
      structure: { global_1: ['header_1', 'group_2'], group_1: ['item_1'], group_2: ['item_2'] },
    }
    const merged = mergeCartHierarchy(prev, next)
    expect(merged.structure.global_1).toEqual(['header_1', 'group_1', 'group_2'])
    expect(merged.structure.group_1).toEqual(['item_1'])
    expect(merged.structure.group_2).toEqual(['item_2'])
    // next 缺失时保留 prev；prev 缺失时用 next
    expect(mergeCartHierarchy(prev, null)).toBe(prev)
    expect(mergeCartHierarchy(null, next)).toBe(next)
  })

  it('encodeCartParams 产物可被 gunzip+JSON 解出 data/linkage/hierarchy', () => {
    const fixture = makeBodyFixture()
    const hierarchy = mergeCartHierarchy(null, fixture.data.hierarchy)
    const payload = buildCartPagePayload(fixture, hierarchy)
    const decoded = decodeCartParams(encodeCartParams(payload))

    expect(Object.keys(decoded.data).sort()).toEqual(['extendBody_1', 'global_1'])
    expect(decoded.data.global_1.elementId).toBe('global_1')
    expect(decoded.linkage.input).toEqual(['global_1', 'extendBody_1'])
    expect(decoded.endpoint).toBe('cartView')
    expect(decoded.hierarchy).toEqual(hierarchy)
  })

  it('parseCartResponse 抽取 extendBody 的 hasMore / allItemCnt', () => {
    const parsed = parseCartResponse(makeBodyFixture())
    expect(parsed.hasMore).toBe(true)
    expect(parsed.allItemCnt).toBe(75)

    const noExtend = makeBodyFixture()
    delete noExtend.data.data.extendBody_1
    const parsed2 = parseCartResponse(noExtend)
    expect(parsed2.hasMore).toBe(false)
    expect(parsed2.allItemCnt).toBe(0)
  })

  it('fetchTaobaoCart 首页返回可续翻的 paging；翻页请求走 __customTag__=paging', async () => {
    isTaobaoCookieReady.mockReturnValue(true)
    getTaobaoCookie.mockResolvedValue('_m_h5_tk=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa_1')
    mtopCall.mockResolvedValue(makeBodyFixture())

    const first = await fetchTaobaoCart()
    expect(first.hasMore).toBe(true)
    expect(first.allItemCnt).toBe(75)
    expect(first.paging).toBeTruthy()
    const firstCall = mtopCall.mock.calls[0][0]
    expect(firstCall.extraQuery).toEqual({ __customTag__: 'build', timeout: '6000' })
    expect(firstCall.data.params).toBeUndefined()

    // 第二页响应：只含新增 item，hierarchy 累计，hasMore 翻完
    const page2 = makeBodyFixture()
    page2.data.data = {
      ...page2.data.data,
      item_700: {
        tag: 'item',
        id: '700',
        fields: {
          cartId: '700',
          itemId: '2000000000001',
          title: '第二页新商品',
          shopId: '151121773',
          shopTitle: 'bilibili旗舰店',
          quantity: 2,
          pic: '//gw.alicdn.com/zzz.png',
          pay: { now: 9900, nowTitle: '￥99' },
          sku: { skuId: '0', title: '', skuMap: {} },
          isInvalid: false,
          outerUrl: '',
        },
      },
      extendBody_1: { tag: 'extendBody', id: '1', hasMore: false, fields: { attributes: { allItemCnt: 75 } } },
    }
    delete page2.data.data.item_665
    delete page2.data.data.item_664
    page2.data.hierarchy = {
      root: 'global_1',
      structure: { global_1: ['group_1', 'group_2'], group_2: ['item_700'] },
    }
    mtopCall.mockResolvedValueOnce(page2)

    const second = await fetchTaobaoCart({ paging: first.paging })
    const secondCall = mtopCall.mock.calls[1][0]
    expect(secondCall.extraQuery).toEqual({ __customTag__: 'paging', timeout: '12000' })
    expect(secondCall.data.feature).toBe('{"gzip":true}')
    // 请求里的 hierarchy 是「截至上一页」的累计态（不含本页新增）
    const decoded = decodeCartParams(secondCall.data.params)
    expect(decoded.hierarchy.structure.global_1).toEqual(['header_1', 'group_1'])
    // 本次响应返回的下一页 paging 才包含本页新增后的累计 hierarchy
    expect(second.paging.hierarchy.structure.global_1).toEqual(['header_1', 'group_1', 'group_2'])
    expect(second.groups[0].goods).toHaveLength(1)
    expect(second.groups[0].goods[0].name).toContain('第二页新商品')
    expect(second.hasMore).toBe(false)

    // 响应缺 hierarchy 时不再续翻
    const noHierarchy = makeBodyFixture()
    delete noHierarchy.data.hierarchy
    mtopCall.mockResolvedValueOnce(noHierarchy)
    const third = await fetchTaobaoCart({ paging: first.paging })
    expect(third.paging).toBeNull()
    expect(third.hasMore).toBe(true)
  })
})
