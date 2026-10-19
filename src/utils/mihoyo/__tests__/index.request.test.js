import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mihoyoRequest: vi.fn(),
}))

vi.mock('@/utils/mihoyo/request', () => ({
  mihoyoRequest: mocks.mihoyoRequest,
}))

import {
  parseMihoyoUrl,
  fetchAllOrders,
  searchGoodsList,
  addToCart,
  fetchGoodsDetailForCart,
  getMihoyoIpByShopCode,
} from '../index'

// restoreMocks 不会重置 vi.fn() 的调用记录，需要手动清理
beforeEach(() => {
  mocks.mihoyoRequest.mockReset()
})

describe('mihoyo 调用方行为锁（错误文案与降级返回值）', () => {
  it('parseMihoyoUrl：retcode 非 0 时抛出「接口返回错误：xxx」并携带 Referer/x-rpc-language 头', async () => {
    mocks.mihoyoRequest.mockResolvedValue({ retcode: 1, message: 'xxx' })

    await expect(parseMihoyoUrl('https://www.mihoyogift.com/goods/1234567890123456789'))
      .rejects.toThrow('接口返回错误：xxx')

    const [path, options] = mocks.mihoyoRequest.mock.calls[0]
    expect(path).toContain('goods_id=1234567890123456789')
    expect(options.headers).toEqual({
      'Referer': 'https://www.mihoyogift.com/',
      'x-rpc-language': 'zh-cn',
    })
  })

  it('fetchAllOrders：retcode 非 0 时抛出 json.message（useMihoyoCookieState 依赖该文案匹配）', async () => {
    mocks.mihoyoRequest.mockResolvedValue({ retcode: -100, message: '登录失效' })
    await expect(fetchAllOrders('a=b')).rejects.toThrow('登录失效')
  })

  it('fetchAllOrders：json.message 为空时抛出「接口错误 N」', async () => {
    mocks.mihoyoRequest.mockResolvedValue({ retcode: -100, message: '' })
    await expect(fetchAllOrders('a=b')).rejects.toThrow('接口错误 -100')
  })

  it('searchGoodsList：mihoyoRequest 抛错时返回 []，成功时映射 data.list', async () => {
    mocks.mihoyoRequest.mockRejectedValue(new Error('请求失败（500）'))
    await expect(searchGoodsList('原神')).resolves.toEqual([])

    mocks.mihoyoRequest.mockResolvedValue({
      retcode: 0,
      data: { list: [{ goods_id: '1', name: '测试商品', cover_url: 'https://example.com/a.png' }] },
    })
    await expect(searchGoodsList('原神')).resolves.toEqual([
      { goods_id: '1', name: '测试商品', cover_url: 'https://example.com/a.png' },
    ])
  })

  it('addToCart：data.code === 2 时返回购物车已满', async () => {
    mocks.mihoyoRequest.mockResolvedValue({ retcode: 0, data: { code: 2 } })

    await expect(addToCart({ goodsId: '1', skuId: 2, shopCode: 'ys', cookie: 'a=b' }))
      .resolves.toEqual({ success: false, message: '购物车已满', cartFull: true })
  })

  it('addToCart：mihoyoRequest 抛出「请求失败（500）」时返回相同 message', async () => {
    mocks.mihoyoRequest.mockRejectedValue(new Error('请求失败（500）'))

    await expect(addToCart({ goodsId: '1', skuId: 2, shopCode: 'ys', cookie: 'a=b' }))
      .resolves.toEqual({ success: false, message: '请求失败（500）' })
  })

  it('fetchGoodsDetailForCart：mihoyoRequest 抛错时返回空降级结构', async () => {
    mocks.mihoyoRequest.mockRejectedValue(new Error('网络错误'))

    await expect(fetchGoodsDetailForCart('123')).resolves.toEqual({ shopCode: '', skus: [] })
  })
})

describe('getMihoyoIpByShopCode（按店铺回填规范 IP 名称）', () => {
  it('四个店铺都映射到与预设一致的规范 IP 全称', () => {
    expect(getMihoyoIpByShopCode('ys')).toBe('原神')
    expect(getMihoyoIpByShopCode('xqtd')).toBe('崩坏：星穹铁道')
    expect(getMihoyoIpByShopCode('bh3')).toBe('崩坏3')
    expect(getMihoyoIpByShopCode('zzz')).toBe('绝区零')
  })

  it('未知店铺返回空串', () => {
    expect(getMihoyoIpByShopCode('')).toBe('')
    expect(getMihoyoIpByShopCode('unknown')).toBe('')
  })
})
