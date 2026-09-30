import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  preCreateOrder: vi.fn(),
  createOrder: vi.fn(),
  fetchGoodsDetailForCheckout: vi.fn(),
  fetchMihoyoServerTime: vi.fn(),
  fetchPrimaryServerTime: vi.fn(),
}))

vi.mock('@/utils/mihoyo/checkout', () => mocks)

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('useCheckoutOrderQueue 并发成功短路', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
    mocks.preCreateOrder.mockReset()
    mocks.createOrder.mockReset()
    mocks.fetchGoodsDetailForCheckout.mockReset()
    mocks.fetchMihoyoServerTime.mockReset()
    mocks.fetchPrimaryServerTime.mockReset()
    mocks.fetchPrimaryServerTime.mockResolvedValue({ offsetMs: 0, rttMs: 1, source: 'test' })
    mocks.fetchMihoyoServerTime.mockResolvedValue({ offsetMs: 0 })
    mocks.fetchGoodsDetailForCheckout.mockResolvedValue({ skus: [] })
  })

  it('任一单元拿到 orderNo 后，其余并发单元不再继续 preCreate/createOrder', async () => {
    const { useCheckoutOrderQueue } = await import('../useCheckoutOrderQueue')
    const queueApi = useCheckoutOrderQueue()

    let preCreateCalls = 0
    let createOrderCalls = 0

    mocks.preCreateOrder.mockImplementation(async () => {
      preCreateCalls += 1
      return {
        code: `code-${preCreateCalls}`,
        totalFee: 100,
        orderPoints: 0,
        shopOrders: [],
        respGifts: [],
      }
    })

    mocks.createOrder.mockImplementation(async (_cookie, { code }) => {
      createOrderCalls += 1
      if (code === 'code-1') {
        // 首个单元稍后成功；其余单元若不断重试会把 createOrder 次数推高
        await sleep(50)
        return { orderNo: 'ORDER-1', amount: 100, orderPoints: 0, productName: '测试商品' }
      }
      // 可重试失败：修复前会持续打 createOrder
      throw new Error('系统繁忙，请稍后重试')
    })

    const entry = queueApi.enqueueOrder({
      scheduledAt: Date.now() - 2000,
      displayAt: Date.now() - 2000,
      retryCount: Infinity,
      concurrency: 3,
      snapshot: {
        cookie: 'cookie=test',
        addressId: 'addr-1',
        remark: '',
        isFromShopCar: false,
        accountId: 'acc-1',
        accountLabel: '账号1',
        items: [{ goodsId: 'g-1', skuId: 'sku-1', name: '测试商品', num: 1 }],
        giftActivities: [],
      },
      summary: { goodsText: '测试商品' },
    })

    await vi.waitFor(() => {
      expect(entry.status).toBe('success')
    }, { timeout: 3000 })

    expect(entry.result?.orderNo).toBe('ORDER-1')

    const preCreateAfterSuccess = preCreateCalls
    const createOrderAfterSuccess = createOrderCalls

    // 留出足够时间覆盖错峰启动与快重试窗口；成功后不应再新增请求
    await sleep(400)

    expect(preCreateCalls).toBe(preCreateAfterSuccess)
    expect(createOrderCalls).toBe(createOrderAfterSuccess)
  })

  it('收到「重复/已存在」后同样短路其余单元，不再继续发单', async () => {
    const { useCheckoutOrderQueue } = await import('../useCheckoutOrderQueue')
    const queueApi = useCheckoutOrderQueue()

    let createOrderCalls = 0

    mocks.preCreateOrder.mockImplementation(async () => {
      return {
        code: `code-${Math.random().toString(36).slice(2)}`,
        totalFee: 100,
        orderPoints: 0,
        shopOrders: [],
        respGifts: [],
      }
    })

    mocks.createOrder.mockImplementation(async () => {
      createOrderCalls += 1
      await sleep(30)
      throw new Error('您已下过单，请勿重复下单')
    })

    const entry = queueApi.enqueueOrder({
      scheduledAt: Date.now() - 2000,
      displayAt: Date.now() - 2000,
      retryCount: Infinity,
      concurrency: 3,
      snapshot: {
        cookie: 'cookie=test',
        addressId: 'addr-1',
        remark: '',
        isFromShopCar: false,
        accountId: 'acc-1',
        accountLabel: '账号1',
        items: [{ goodsId: 'g-1', skuId: 'sku-1', name: '测试商品', num: 1 }],
        giftActivities: [],
      },
      summary: { goodsText: '测试商品' },
    })

    await vi.waitFor(() => {
      expect(entry.status).toBe('success')
    }, { timeout: 3000 })

    expect(entry.result?.duplicate).toBe(true)

    const createOrderAfterSuccess = createOrderCalls
    await sleep(400)
    expect(createOrderCalls).toBe(createOrderAfterSuccess)
  })
})
