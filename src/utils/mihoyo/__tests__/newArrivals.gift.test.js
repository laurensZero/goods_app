import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mihoyoRequest: vi.fn(),
  fetchGoodsGiftActivityIds: vi.fn(),
  fetchGiftActivityPublic: vi.fn(),
}))

vi.mock('@/utils/mihoyo/request', async (importOriginal) => ({
  ...(await importOriginal()),
  mihoyoRequest: mocks.mihoyoRequest,
}))

vi.mock('@/utils/mihoyo', () => ({
  fetchGoodsGiftActivityIds: mocks.fetchGoodsGiftActivityIds,
  fetchGiftActivityPublic: mocks.fetchGiftActivityPublic,
}))

import {
  fetchMihoyoGiftArrivals,
  giftSeriesKey,
  isGiftActivityExpired,
} from '../newArrivals'

const GIFT_CACHE_KEY = 'goods-app:mihoyo-new-arrivals:gift'
const GIFT_STORE_KEY = 'goods-app:mihoyo-gift-activities'

function listResponse(items) {
  return { retcode: 0, data: { list: items } }
}

function shopItem(goodsId, name, saleTime) {
  return {
    goods_id: goodsId,
    name,
    cover_url: '',
    price: 0,
    sale_time: saleTime,
  }
}

function activityPayload({
  activityId = 'act-1',
  name = '满赠活动',
  endTime = 0,
  status = 1,
  gifts = [],
  shopCode = 'zzz',
} = {}) {
  return {
    ok: true,
    activityId,
    name,
    shopCode,
    startTime: 0,
    endTime,
    status,
    serverTime: 0,
    outOfStock: false,
    gifts,
  }
}

beforeEach(() => {
  localStorage.clear()
  mocks.mihoyoRequest.mockReset()
  mocks.fetchGoodsGiftActivityIds.mockReset()
  mocks.fetchGiftActivityPublic.mockReset()
})

describe('giftSeriesKey', () => {
  it('剥离 IP 前缀与款式后缀，同系列归并成同一个键', () => {
    const a = giftSeriesKey('【绝区零】PINK甜蜜暴击系列 亚克力立牌')
    const b = giftSeriesKey('【绝区零】PINK甜蜜暴击系列 毛绒挂件')
    expect(a).toBe('PINK甜蜜暴击系列')
    expect(b).toBe(a)
  })

  it('忽略「第 N 弹」后缀', () => {
    expect(giftSeriesKey('「原神」尘世闲游系列 第二弹 徽章')).toBe('尘世闲游系列')
    expect(giftSeriesKey('「原神」尘世闲游系列 徽章')).toBe('尘世闲游系列')
  })

  it('没有系列标记时保留完整名称，避免误并', () => {
    expect(giftSeriesKey('【崩坏3】琪亚娜 1/7 手办')).toBe('琪亚娜 1/7 手办')
  })
})

describe('isGiftActivityExpired', () => {
  const now = Date.UTC(2026, 9, 19)

  it('按 end_time 判定：结束后过期，进行中不过期', () => {
    expect(isGiftActivityExpired({ endTime: now / 1000 - 60 }, now)).toBe(true)
    expect(isGiftActivityExpired({ endTime: now / 1000 + 60 }, now)).toBe(false)
  })

  it('支持缓存条目上的 gift_activity_end_time', () => {
    expect(
      isGiftActivityExpired({ gift_activity_end_time: now / 1000 - 1 }, now),
    ).toBe(true)
  })

  it('status >= 2 视为已下线，status 未知不误杀', () => {
    expect(isGiftActivityExpired({ status: 2 }, now)).toBe(true)
    expect(isGiftActivityExpired({ status: 1, endTime: 0 }, now)).toBe(false)
    expect(isGiftActivityExpired({ status: -1 }, now)).toBe(false)
  })
})

describe('fetchMihoyoGiftArrivals', () => {
  it('按系列探测，不再只看前 3 个商品（PINK 甜蜜暴击回归）', async () => {
    const items = [
      shopItem('g1', '【绝区零】她与她的隐秘往事系列 徽章', 0),
      shopItem('g2', '【绝区零】她与她的隐秘往事系列 立牌', 0),
      shopItem('g3', '【绝区零】她与她的隐秘往事系列 挂件', 0),
      shopItem('g4', '【绝区零】噪点狂潮系列 键盘', 0),
      shopItem('g5', '【绝区零】PINK甜蜜暴击系列 亚克力立牌', 0),
    ]
    mocks.mihoyoRequest.mockResolvedValue(listResponse(items))

    const activityByGoods = {
      g1: 'act-main',
      g4: 'act-keyboard',
      g5: 'act-pink',
    }
    mocks.fetchGoodsGiftActivityIds.mockImplementation(async (goodsId) =>
      activityByGoods[goodsId]
        ? [{ activity_id: activityByGoods[goodsId], promotion_text: '' }]
        : [],
    )

    const endTime = Math.floor(Date.now() / 1000) + 86400
    mocks.fetchGiftActivityPublic.mockImplementation(async (activityId) =>
      activityPayload({
        activityId,
        name: activityId,
        endTime,
        gifts: [
          {
            goods_id: `gift-${activityId}`,
            name: `赠品 ${activityId}`,
            cover_url: '',
          },
        ],
      }),
    )

    const { items: gifts, errors } = await fetchMihoyoGiftArrivals(['zzz'])

    expect(errors).toEqual([])
    expect(mocks.fetchGoodsGiftActivityIds).toHaveBeenCalledWith('g5')
    expect(gifts.map((item) => item.goods_id).sort()).toEqual([
      'gift-act-keyboard',
      'gift-act-main',
      'gift-act-pink',
    ])
    expect(gifts.every((item) => item.gift_activity_end_time === endTime)).toBe(true)
    // 活动台账落盘，供下次直接复核
    expect(JSON.parse(localStorage.getItem(GIFT_STORE_KEY))['act-pink']).toBeTruthy()
  })

  it('第二次进入：商品详情不重探、活动详情 30 分钟内不重复请求', async () => {
    const items = [
      shopItem('g1', '【绝区零】PINK甜蜜暴击系列 立牌', 0),
      shopItem('g2', '【绝区零】PINK甜蜜暴击系列 挂件', 0),
    ]
    mocks.mihoyoRequest.mockResolvedValue(listResponse(items))
    mocks.fetchGoodsGiftActivityIds.mockResolvedValue([
      { activity_id: 'act-pink', promotion_text: '' },
    ])
    mocks.fetchGiftActivityPublic.mockResolvedValue(
      activityPayload({
        activityId: 'act-pink',
        endTime: Math.floor(Date.now() / 1000) + 86400,
        gifts: [{ goods_id: 'gift-1', name: '赠品', cover_url: '' }],
      }),
    )

    await fetchMihoyoGiftArrivals(['zzz'])
    expect(mocks.fetchGoodsGiftActivityIds).toHaveBeenCalledTimes(1)
    expect(mocks.fetchGiftActivityPublic).toHaveBeenCalledTimes(1)

    mocks.fetchGoodsGiftActivityIds.mockClear()
    mocks.fetchGiftActivityPublic.mockClear()
    mocks.mihoyoRequest.mockClear()

    const { items: second } = await fetchMihoyoGiftArrivals(['zzz'])

    // 商品没变：不重新探测；活动详情在 TTL 内：不重新请求；列表 10 分钟内也不重拉
    expect(mocks.fetchGoodsGiftActivityIds).not.toHaveBeenCalled()
    expect(mocks.fetchGiftActivityPublic).not.toHaveBeenCalled()
    expect(mocks.mihoyoRequest).not.toHaveBeenCalled()
    // 但列表仍然从缓存完整返回
    expect(second.map((item) => item.goods_id)).toEqual(['gift-1'])
  })

  it('超过活动详情 TTL 才复核活动，商品详情仍不重探', async () => {
    const realNow = Date.now()
    vi.useFakeTimers()
    try {
      vi.setSystemTime(realNow)
      mocks.mihoyoRequest.mockResolvedValue(
        listResponse([shopItem('g1', '【绝区零】PINK甜蜜暴击系列 立牌', 0)]),
      )
      mocks.fetchGoodsGiftActivityIds.mockResolvedValue([
        { activity_id: 'act-pink', promotion_text: '' },
      ])
      mocks.fetchGiftActivityPublic.mockResolvedValue(
        activityPayload({
          activityId: 'act-pink',
          endTime: Math.floor(realNow / 1000) + 86400,
          gifts: [{ goods_id: 'gift-1', name: '赠品', cover_url: '' }],
        }),
      )

      await fetchMihoyoGiftArrivals(['zzz'])
      mocks.fetchGoodsGiftActivityIds.mockClear()
      mocks.fetchGiftActivityPublic.mockClear()

      // 31 分钟后重进：活动详情复核一次，商品详情不重探
      vi.setSystemTime(realNow + 31 * 60_000)
      const { items } = await fetchMihoyoGiftArrivals(['zzz'])

      expect(mocks.fetchGoodsGiftActivityIds).not.toHaveBeenCalled()
      expect(mocks.fetchGiftActivityPublic).toHaveBeenCalledTimes(1)
      expect(items.map((item) => item.goods_id)).toEqual(['gift-1'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('列表新增商品时只探新增的那一个', async () => {
    const realNow = Date.now()
    vi.useFakeTimers()
    try {
      vi.setSystemTime(realNow)
      mocks.mihoyoRequest.mockResolvedValue(
        listResponse([shopItem('g1', '【绝区零】PINK甜蜜暴击系列 立牌', 0)]),
      )
      mocks.fetchGoodsGiftActivityIds.mockResolvedValue([
        { activity_id: 'act-pink', promotion_text: '' },
      ])
      mocks.fetchGiftActivityPublic.mockResolvedValue(
        activityPayload({
          activityId: 'act-pink',
          endTime: Math.floor(realNow / 1000) + 86400,
          gifts: [{ goods_id: 'gift-1', name: '赠品', cover_url: '' }],
        }),
      )
      await fetchMihoyoGiftArrivals(['zzz'])
      mocks.fetchGoodsGiftActivityIds.mockClear()

      // 11 分钟后列表缓存过期，新上架了一个商品
      vi.setSystemTime(realNow + 11 * 60_000)
      mocks.mihoyoRequest.mockResolvedValue(
        listResponse([
          shopItem('g2', '【绝区零】噪点狂潮系列 键盘', 0),
          shopItem('g1', '【绝区零】PINK甜蜜暴击系列 立牌', 0),
        ]),
      )
      mocks.fetchGoodsGiftActivityIds.mockResolvedValue([
        { activity_id: 'act-keyboard', promotion_text: '' },
      ])
      await fetchMihoyoGiftArrivals(['zzz'])

      expect(mocks.fetchGoodsGiftActivityIds).toHaveBeenCalledTimes(1)
      expect(mocks.fetchGoodsGiftActivityIds).toHaveBeenCalledWith('g2')
    } finally {
      vi.useRealTimers()
    }
  })

  it('活动结束后即使接口仍返回赠品，也不再展示并清出缓存', async () => {
    const pastEnd = Math.floor(Date.now() / 1000) - 60
    mocks.mihoyoRequest.mockResolvedValue(
      listResponse([shopItem('g1', '【绝区零】PINK甜蜜暴击系列 立牌', 0)]),
    )
    mocks.fetchGoodsGiftActivityIds.mockResolvedValue([
      { activity_id: 'act-pink', promotion_text: '' },
    ])
    mocks.fetchGiftActivityPublic.mockResolvedValue(
      activityPayload({
        activityId: 'act-pink',
        endTime: pastEnd,
        gifts: [{ goods_id: 'gift-1', name: '赠品', cover_url: '' }],
      }),
    )

    localStorage.setItem(
      GIFT_CACHE_KEY,
      JSON.stringify({
        'gift-1': {
          goods_id: 'gift-1',
          name: '赠品',
          is_gift: true,
          catalog: 'gift',
          gift_activity_id: 'act-pink',
          gift_activity_end_time: pastEnd,
          cached_at: Date.now(),
        },
      }),
    )

    const { items: gifts } = await fetchMihoyoGiftArrivals(['zzz'])

    expect(gifts).toEqual([])
    const store = JSON.parse(localStorage.getItem(GIFT_STORE_KEY) || '{}')
    expect(store['act-pink']).toBeUndefined()
  })

  it('网络失败保留台账（不清活动），not_found 才清理', async () => {
    const futureEnd = Math.floor(Date.now() / 1000) + 86400
    localStorage.setItem(
      GIFT_STORE_KEY,
      JSON.stringify({
        'act-network': {
          shopCode: 'zzz',
          endTime: futureEnd,
          name: '网络抖动',
          lastSeenAt: Date.now(),
        },
        'act-missing': {
          shopCode: 'zzz',
          endTime: futureEnd,
          name: '已删除',
          lastSeenAt: Date.now(),
        },
      }),
    )
    mocks.mihoyoRequest.mockResolvedValue(listResponse([]))
    mocks.fetchGiftActivityPublic.mockImplementation(async (activityId) =>
      activityId === 'act-missing'
        ? {
            ok: false,
            reason: 'not_found',
            activityId,
            name: '',
            shopCode: '',
            startTime: 0,
            endTime: 0,
            status: -1,
            serverTime: 0,
            outOfStock: false,
            gifts: [],
          }
        : {
            ok: false,
            reason: 'network',
            activityId,
            name: '',
            shopCode: '',
            startTime: 0,
            endTime: 0,
            status: -1,
            serverTime: 0,
            outOfStock: false,
            gifts: [],
          },
    )

    await fetchMihoyoGiftArrivals(['zzz'])

    const store = JSON.parse(localStorage.getItem(GIFT_STORE_KEY) || '{}')
    expect(store['act-network']).toBeTruthy()
    expect(store['act-missing']).toBeUndefined()
  })
})
