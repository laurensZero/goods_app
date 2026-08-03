import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mihoyoRequest: vi.fn(),
  mihoyoRequestWithResponse: vi.fn(),
}))

vi.mock('@/utils/mihoyo/request', () => ({
  mihoyoRequest: mocks.mihoyoRequest,
  mihoyoRequestWithResponse: mocks.mihoyoRequestWithResponse,
}))

vi.mock('@/utils/pinyin', () => ({
  compareByPinyin: (a, b) => a.localeCompare(b),
}))

import { fetchGoodsDetailForCheckout } from '../checkout'

beforeEach(() => {
  mocks.mihoyoRequest.mockReset()
  mocks.mihoyoRequestWithResponse.mockReset()
})

// 构造与真实响应一致的 goods/detail 数据
function buildDetail() {
  // 款式 key —— sale_attrs.content 里的 key
  const styleKeys = {
    XS: 'm483fa89e692f3cd',
    M: 'a579977a85f7dd51',
    L: 'h6ab2452d4409f58',
  }
  // sku_quantities 的完整 key 为「款式key_发货时间key」
  const shippingKey = 'pcbf9a4e0fdfd382'
  const sku_quantities = {}
  const skus = {}
  const skuStock = { XS: 5, M: 0, L: 70 }
  for (const [size, key] of Object.entries(styleKeys)) {
    const comboKey = `${key}_${shippingKey}`
    sku_quantities[comboKey] = skuStock[size]
    // 真实响应里 sku.id 是数字 ID，售罄匹配走的是 skus 对象 key（完整组合 key）
    skus[comboKey] = { id: 10000 + Object.keys(styleKeys).indexOf(size), attr: `示例-${size}码`, price: 12900 }
  }
  return {
    retcode: 0,
    data: {
      goods: {
        detail: {
          goods_id: '20281435296093289056407',
          name: '「崩坏：星穹铁道」与你同行的回忆系列短袖T恤',
          shop_code: 'xqtd',
          price: 12900,
          cover_url: '',
          sale_time: 1781524800,
          status: 3,
          remaining_time: 0,
          skus,
          sale_attrs: [
            {
              name: '款式',
              content: Object.entries(styleKeys).map(([size, key]) => ({
                is_chose: true,
                text: `示例-${size}码【预售】`,
                key,
                img_url: '',
              })),
            },
          ],
          promotion: {},
        },
        // quantity 与 detail 平级（真实响应位置：data.goods.quantity）
        quantity: { have_sku: true, spu_quantity: 0, sku_quantities },
      },
      promotion: {},
    },
  }
}

describe('fetchGoodsDetailForCheckout 售罄判断（基于 quantity.sku_quantities）', () => {
  it('按 SKU 粒度解析库存：库存 0 的 SKU 标记售罄，有库存的不标记', async () => {
    mocks.mihoyoRequest.mockResolvedValue(buildDetail())

    const result = await fetchGoodsDetailForCheckout('20281435296093289056407', 'a=b')

    const bySize = Object.fromEntries(result.skus.map((s) => [s.text.replace(/码.*/, ''), s]))
    expect(bySize['示例-XS'].stock).toBe(5)
    expect(bySize['示例-XS'].soldOut).toBe(false)
    expect(bySize['示例-M'].stock).toBe(0)
    expect(bySize['示例-M'].soldOut).toBe(true)
    expect(bySize['示例-L'].stock).toBe(70)
    expect(bySize['示例-L'].soldOut).toBe(false)
  })

  it('spu_quantity 为 0 但存在有库存的 SKU 时，不整单标记售罄', async () => {
    mocks.mihoyoRequest.mockResolvedValue(buildDetail())

    const result = await fetchGoodsDetailForCheckout('20281435296093289056407', 'a=b')

    // 库存按 SKU 粒度得出，而非 spu_quantity=0 一刀切
    expect(result.skus.some((s) => s.stock > 0)).toBe(true)
    expect(result.skus.filter((s) => s.soldOut).length).toBe(1)
  })

  it('detail.skus 为空时回退 sale_attrs，用 contentKey 匹配 sku_quantities', async () => {
    const detail = buildDetail()
    detail.data.goods.detail.skus = {}
    mocks.mihoyoRequest.mockResolvedValue(detail)

    const result = await fetchGoodsDetailForCheckout('20281435296093289056407', 'a=b')

    const bySize = Object.fromEntries(result.skus.map((s) => [s.text.replace(/码.*/, ''), s]))
    expect(bySize['示例-M'].stock).toBe(0)
    expect(bySize['示例-M'].soldOut).toBe(true)
    expect(bySize['示例-L'].stock).toBe(70)
    expect(bySize['示例-L'].soldOut).toBe(false)
  })

  it('sku_quantities 缺失时回退 sku.stock 字段', async () => {
    const detail = buildDetail()
    // 清空真实位置的 sku_quantities（goods.quantity），且 skus 的 key 匹配不上时回退 sku.stock
    detail.data.goods.quantity.sku_quantities = {}
    detail.data.goods.detail.skus = {
      combo_a: { id: 1, attr: 'A码', stock: 0 },
      combo_b: { id: 2, attr: 'B码', stock: 3 },
    }
    mocks.mihoyoRequest.mockResolvedValue(detail)

    const result = await fetchGoodsDetailForCheckout('20281435296093289056407', 'a=b')

    const byText = Object.fromEntries(result.skus.map((s) => [s.text, s]))
    expect(byText['A码'].soldOut).toBe(true)
    expect(byText['B码'].soldOut).toBe(false)
  })

  it('真实响应结构：quantity 在 goods 层级，sku_quantities 的完整 key 直接匹配 skus', async () => {
    const detail = buildDetail()
    mocks.mihoyoRequest.mockResolvedValue(detail)

    const result = await fetchGoodsDetailForCheckout('20281435296093289056407', 'a=b')

    // 3 个 SKU 全部能从 sku_quantities 解析到库存（无未知 -1）
    expect(result.skus).toHaveLength(3)
    expect(result.skus.some((s) => s.stock === -1)).toBe(false)
    const byText = Object.fromEntries(result.skus.map((s) => [s.text, s]))
    expect(byText['示例-M码'].soldOut).toBe(true)  // 库存 0
    expect(byText['示例-L码'].soldOut).toBe(false) // 库存 70
  })
})
