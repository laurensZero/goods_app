import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mihoyoRequest: vi.fn(),
  mihoyoApi: vi.fn(),
}))

// mihoyoApi 与 mihoyoRequest 在同一模块内互相引用，必须分别 mock；
// mihoyoApi 按真实实现包装被 mock 的 mihoyoRequest，保持 retcode 检查语义
vi.mock('@/utils/mihoyo/request', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    mihoyoRequest: mocks.mihoyoRequest,
    mihoyoApi: mocks.mihoyoApi,
  }
})

import {
  MihoyoApiError,
} from '../request'
import {
  parseMihoyoUrl,
  fetchAllOrders,
  searchGoodsList,
  addToCart,
  fetchGoodsDetail,
  fetchGoodsDetailForCart,
  getMihoyoIpByShopCode,
} from '../index'

// restoreMocks 不会重置 vi.fn() 的调用记录，需要手动清理
beforeEach(() => {
  mocks.mihoyoRequest.mockReset()
  mocks.mihoyoApi.mockReset()
  mocks.mihoyoApi.mockImplementation(async (path, options) => {
    const json = await mocks.mihoyoRequest(path, options)
    if (!json || json.retcode !== 0) {
      throw new MihoyoApiError(
        json?.message || `接口错误 ${json?.retcode ?? 'unknown'}`,
        { retcode: json?.retcode ?? null },
      )
    }
    return json
  })
})

describe('mihoyo 调用方行为锁（错误文案与降级返回值）', () => {
  it('parseMihoyoUrl：retcode 非 0 时抛出携带 retcode 的 MihoyoApiError，并携带统一请求头', async () => {
    mocks.mihoyoRequest.mockResolvedValue({ retcode: 1, message: 'xxx' })

    const error = await parseMihoyoUrl('https://www.mihoyogift.com/goods/1234567890123456789')
      .catch((e) => e)
    expect(error).toBeInstanceOf(MihoyoApiError)
    expect(error.message).toBe('xxx')
    expect(error.retcode).toBe(1)

    const [path, options] = mocks.mihoyoRequest.mock.calls[0]
    expect(path).toContain('goods_id=1234567890123456789')
    expect(options.headers).toEqual({
      'Referer': 'https://www.mihoyogift.com/',
      'x-rpc-language': 'zh-cn',
    })
  })

  it('fetchAllOrders：retcode 非 0 时抛出 json.message（useMihoyoCookieState 依赖该文案匹配）', async () => {
    mocks.mihoyoRequest.mockResolvedValue({ retcode: -100, message: '登录失效' })
    const error = await fetchAllOrders('a=b').catch((e) => e)
    expect(error.message).toBe('登录失效')
    expect(error.retcode).toBe(-100)
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

describe('fetchGoodsDetail：SKU 顺序按 sale_attrs 原始顺序（而非 detail.skus 键顺序）', () => {
  it('单维度：按 sale_attrs.content 组内顺序输出', async () => {
    mocks.mihoyoRequest.mockResolvedValue({
      retcode: 0,
      data: {
        goods: {
          detail: {
            sale_attrs: [
              {
                name: '款式',
                content: [
                  { key: 'a', text: '黑天鹅' },
                  { key: 'b', text: '花火' },
                  { key: 'c', text: '黄泉' },
                ],
              },
            ],
            // 故意与 sale_attrs 顺序不一致
            skus: {
              c: { price: 1000, cover_url: 'cover-c' },
              a: { price: 1000, cover_url: 'cover-a' },
              b: { price: 1000, cover_url: 'cover-b' },
            },
          },
        },
      },
    })

    const result = await fetchGoodsDetail('order-test-single')
    expect(result.skuVariants.map((v) => v.text)).toEqual(['黑天鹅', '花火', '黄泉'])
  })

  it('多维度：先按维度组序、再按组内序排列（第一维变化最慢）', async () => {
    mocks.mihoyoRequest.mockResolvedValue({
      retcode: 0,
      data: {
        goods: {
          detail: {
            sale_attrs: [
              {
                name: '角色',
                content: [
                  { key: 'a', text: 'A' },
                  { key: 'b', text: 'B' },
                ],
              },
              {
                name: '款式',
                content: [
                  { key: 'x', text: 'X' },
                  { key: 'y', text: 'Y' },
                ],
              },
            ],
            skus: {
              b_y: { price: 1000 },
              a_x: { price: 1000 },
              b_x: { price: 1000 },
              a_y: { price: 1000 },
            },
          },
        },
      },
    })

    const result = await fetchGoodsDetail('order-test-multi')
    expect(result.skuVariants.map((v) => v.text))
      .toEqual(['A / X', 'A / Y', 'B / X', 'B / Y'])
  })
})
