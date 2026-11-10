// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { buildRechargeImageLookupKey } from '@/utils/recharge/rechargeImages'

// vi.mock 工厂里引用的 mock 必须用 vi.hoisted 提前构造
const h = vi.hoisted(() => ({
  from: vi.fn(),
  clientError: null
}))

vi.mock('@/utils/sync/supabaseClient', () => ({
  getSupabaseClient: () => {
    if (h.clientError) throw h.clientError
    return { from: h.from }
  }
}))

vi.mock('@/utils/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })
}))

import { useRechargeCatalogStore } from '../rechargeCatalog'

// 模拟 PostgREST 链式 builder（thenable）
function makeBuilder(result) {
  const builder = {
    select: vi.fn(() => builder),
    gt: vi.fn(() => builder),
    then(onFulfilled, onRejected) {
      return Promise.resolve(result).then(onFulfilled, onRejected)
    }
  }
  return builder
}

// 可手动 settle 的 builder，用于观察 loading 中间态
function makeDeferredBuilder() {
  let settle = null
  const promise = new Promise((resolve) => {
    settle = resolve
  })
  const builder = {
    select: vi.fn(() => builder),
    gt: vi.fn(() => builder),
    then(onFulfilled, onRejected) {
      return promise.then(onFulfilled, onRejected)
    }
  }
  return { builder, settle: (result) => settle(result) }
}

// 设置下一次查询的返回结果，并返回 builder 以便检查 gt 参数
function nextQueryResult(result) {
  const builder = makeBuilder(result)
  h.from.mockReturnValueOnce(builder)
  return builder
}

const ROW_HK4E = {
  id: 'hk4e_cn::cn_gf01',
  game_biz: 'hk4e_cn',
  region: 'cn_gf01',
  deleted: false,
  updated_at: '2026-11-01T00:00:00+00:00',
  options: [{ id: 'moon', name: '空月祝福', image: 'https://cdn.example.com/moon.png', amount: 30 }]
}

const ROW_NAP = {
  id: 'nap_cn::prod_gf_cn',
  game_biz: 'nap_cn',
  region: 'prod_gf_cn',
  deleted: false,
  updated_at: '2026-11-03T00:00:00+00:00',
  options: [{ id: 'vip', name: '绳网会员', image: 'https://cdn.example.com/vip.png', amount: 30 }]
}

describe('rechargeCatalog 云端目录', () => {
  beforeEach(() => {
    localStorage.clear()
    h.from.mockReset()
    h.clientError = null
    setActivePinia(createPinia())
  })

  it('无缓存时目录为空，不依赖打包 JSON', () => {
    const store = useRechargeCatalogStore()
    expect(store.distribution).toEqual({})
    expect(store.loading).toBe(false)
    expect(store.loadError).toBe(false)
  })

  it('首次加载展示 loading，成功后目录来自云端', async () => {
    const { builder, settle } = makeDeferredBuilder()
    h.from.mockReturnValueOnce(builder)

    const store = useRechargeCatalogStore()
    const task = store.refresh()
    expect(store.loading).toBe(true)
    expect(store.distribution).toEqual({})

    settle({ data: [ROW_NAP, ROW_HK4E], error: null })
    await expect(task).resolves.toBe(true)

    expect(store.loading).toBe(false)
    expect(store.loadError).toBe(false)
    // 固定游戏顺序：原神在绝区零之前
    expect(Object.keys(store.distribution)).toEqual(['hk4e_cn::cn_gf01', 'nap_cn::prod_gf_cn'])
  })

  it('首次拉取失败：进入错误态、目录为空，重试后恢复', async () => {
    nextQueryResult({ data: null, error: { message: 'network down' } })
    const store = useRechargeCatalogStore()
    await expect(store.refresh()).resolves.toBe(false)

    expect(store.loadError).toBe(true)
    expect(store.loading).toBe(false)
    expect(store.distribution).toEqual({})

    nextQueryResult({ data: [ROW_HK4E], error: null })
    await expect(store.retry()).resolves.toBe(true)
    expect(store.loadError).toBe(false)
    expect(Object.keys(store.distribution)).toEqual(['hk4e_cn::cn_gf01'])
  })

  it('Supabase 未配置（getSupabaseClient 抛错）也不冒泡，进入错误态', async () => {
    h.clientError = new Error('supabase not configured')
    const store = useRechargeCatalogStore()
    await expect(store.refresh()).resolves.toBe(false)
    expect(store.loadError).toBe(true)
    expect(store.distribution).toEqual({})
  })

  it('有缓存时首屏直接用缓存，不再等待网络', async () => {
    nextQueryResult({ data: [ROW_HK4E], error: null })
    const first = useRechargeCatalogStore()
    await first.refresh()

    setActivePinia(createPinia())
    const second = useRechargeCatalogStore()
    expect(second.loading).toBe(false)
    expect(second.loadError).toBe(false)
    expect(second.distribution['hk4e_cn::cn_gf01'].options[0].image).toBe('https://cdn.example.com/moon.png')
    // 尚未调用 refresh，不应产生网络请求
    expect(h.from).toHaveBeenCalledTimes(1)
  })

  it('二次刷新走增量：带服务端水位线且合并旧行', async () => {
    const firstBuilder = nextQueryResult({ data: [ROW_HK4E, ROW_NAP], error: null })
    const store = useRechargeCatalogStore()
    await store.refresh()
    expect(firstBuilder.gt).not.toHaveBeenCalled()

    const changed = {
      ...ROW_HK4E,
      updated_at: '2026-11-04T00:00:00+00:00',
      options: [{ id: 'moon2', name: '空月祝福', image: 'https://cdn.example.com/moon2.png', amount: 30 }]
    }
    const secondBuilder = nextQueryResult({ data: [changed], error: null })
    await store.refresh({ force: true })

    // 增量：以上次拉到的最大 updated_at 为下界
    expect(secondBuilder.gt).toHaveBeenCalledTimes(1)
    const [, watermark] = secondBuilder.gt.mock.calls[0]
    expect(watermark).toBe('2026-11-03T00:00:00+00:00')

    // 旧行保留 + 变更行覆盖
    expect(Object.keys(store.distribution)).toEqual(['hk4e_cn::cn_gf01', 'nap_cn::prod_gf_cn'])
    const key = buildRechargeImageLookupKey('原神', '空月祝福', 30)
    expect(store.presetImageMap.map.get(key)).toBe('https://cdn.example.com/moon2.png')
  })

  it('云端 label 让新游戏无需发版即可显示', async () => {
    nextQueryResult({
      data: [{
        id: 'newgame_cn::prod_gf_cn',
        game_biz: 'newgame_cn',
        region: 'prod_gf_cn',
        label: '全新游戏',
        deleted: false,
        updated_at: '2026-11-05T00:00:00+00:00',
        options: [{ id: 't1', name: '月卡', image: 'https://cdn.example.com/new.png', amount: 30 }]
      }],
      error: null
    })
    const store = useRechargeCatalogStore()
    await store.refresh()

    expect(store.distribution['newgame_cn::prod_gf_cn'].label).toBe('全新游戏')
    const key = buildRechargeImageLookupKey('全新游戏', '月卡', 30)
    expect(store.presetImageMap.map.get(key)).toBe('https://cdn.example.com/new.png')
  })

  it('墓碑分组剔除、空 options 分组不输出', async () => {
    nextQueryResult({
      data: [
        ROW_HK4E,
        { id: 'bh3_cn::android01', game_biz: 'bh3_cn', region: 'android01', deleted: true, updated_at: '2026-11-02T00:00:00+00:00', options: [] },
        { id: 'hkrpg_cn::prod_gf_cn', game_biz: 'hkrpg_cn', region: 'prod_gf_cn', deleted: false, updated_at: '2026-11-03T00:00:00+00:00', options: [] }
      ],
      error: null
    })
    const store = useRechargeCatalogStore()
    await store.refresh()

    expect(Object.keys(store.distribution)).toEqual(['hk4e_cn::cn_gf01'])

    // 云端行覆盖后图片映射生效
    const key = buildRechargeImageLookupKey('原神', '空月祝福', 30)
    expect(store.presetImageMap.map.get(key)).toBe('https://cdn.example.com/moon.png')
  })

  it('有缓存时拉取失败静默降级：目录不变、不进入错误态', async () => {
    nextQueryResult({ data: [ROW_HK4E], error: null })
    const store = useRechargeCatalogStore()
    await store.refresh()
    const before = store.distribution

    nextQueryResult({ data: null, error: { message: 'network down' } })
    await expect(store.refresh({ force: true })).resolves.toBe(false)
    expect(store.distribution).toEqual(before)
    expect(store.loadError).toBe(false)
  })

  it('最短刷新间隔内不重复请求', async () => {
    nextQueryResult({ data: [ROW_HK4E], error: null })
    const store = useRechargeCatalogStore()
    await store.refresh()
    expect(h.from).toHaveBeenCalledTimes(1)

    await store.refresh()
    expect(h.from).toHaveBeenCalledTimes(1)
  })
})
