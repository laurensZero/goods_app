import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map()

vi.mock('@/utils/platform/storage', () => ({
  readPersisted: vi.fn(async (key) => (store.has(key) ? store.get(key) : null)),
  writePersisted: vi.fn(async (key, value) => { store.set(key, value) })
}))

const supabaseResult = { data: [], error: null }
const from = vi.fn()

vi.mock('@/utils/sync/supabaseClient', () => ({
  getSupabaseClient: () => ({ from })
}))

const eqCalls = []
const orderCalls = []

function makeQuery(result) {
  const query = {
    select: () => query,
    eq: (col, val) => { eqCalls.push([col, val]); return query },
    order: (col) => { orderCalls.push(col); return query },
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  }
  return query
}

const ROW = {
  id: 'msb:1',
  source: 'miyoushe',
  game: '原神',
  name: '测试气泡',
  description: 'desc',
  url: 'https://bbs-static.miyoushe.com/a.png?x-oss-process=image/resize,w_318',
  bg_color: 'f5f0e6',
  gif_url: '',
  pag_url: 'https://bbs-static.miyoushe.com/a.pag',
  animated: false,
  sort: 1,
  mirror_url: '',
  thumb_url: ''
}

async function load() {
  const mod = await import('../bubbles')
  mod.resetBubbleCatalogCache()
  return mod
}

beforeEach(() => {
  store.clear()
  supabaseResult.data = []
  supabaseResult.error = null
  eqCalls.length = 0
  orderCalls.length = 0
  from.mockReset()
  from.mockImplementation(() => makeQuery(supabaseResult))
})

afterEach(() => {
  vi.resetModules()
})

describe('normalizeBubbleRow', () => {
  it('剥掉 x-oss-process 并转成紧凑结构（bg/gif 带出来，pag_url 丢弃）', async () => {
    const { normalizeBubbleRow } = await load()
    expect(normalizeBubbleRow(ROW)).toEqual({
      i: 'msb:1',
      s: 'miyoushe',
      g: '原神',
      n: '测试气泡',
      d: 'desc',
      u: 'https://bbs-static.miyoushe.com/a.png',
      bg: 'f5f0e6',
      gif: '',
      a: false,
      m: '',
      t: ''
    })
  })

  it('动图行透传 gif（不剥查询参数）与 m/t（剥查询参数）', async () => {
    const { normalizeBubbleRow } = await load()
    expect(normalizeBubbleRow({
      ...ROW,
      id: 'msb:2',
      animated: true,
      gif_url: 'https://bbs-static.miyoushe.com/b.gif?sign=xyz',
      bg_color: '#ffccdd',
      mirror_url: 'https://abc.supabase.co/storage/v1/object/public/mhy-decor/mirror/b.png?download=true',
      thumb_url: 'https://abc.supabase.co/storage/v1/object/public/mhy-decor/thumb/b.webp'
    })).toEqual({
      i: 'msb:2',
      s: 'miyoushe',
      g: '原神',
      n: '测试气泡',
      d: 'desc',
      u: 'https://bbs-static.miyoushe.com/a.png',
      // bg 统一剥掉 # 前缀
      bg: 'ffccdd',
      // gif 直接播放，不拼缩放参数，所以保留查询串
      gif: 'https://bbs-static.miyoushe.com/b.gif?sign=xyz',
      a: true,
      m: 'https://abc.supabase.co/storage/v1/object/public/mhy-decor/mirror/b.png',
      t: 'https://abc.supabase.co/storage/v1/object/public/mhy-decor/thumb/b.webp'
    })
  })

  it('bg_color 缺省时为空串，game 缺省兜底「其他」', async () => {
    const { normalizeBubbleRow } = await load()
    const item = normalizeBubbleRow({ id: 'msb:3', url: 'https://bbs-static.miyoushe.com/c.png' })
    expect(item.bg).toBe('')
    expect(item.g).toBe('其他')
    expect(item.gif).toBe('')
    expect(item.a).toBe(false)
  })

  it('已缓存的紧凑项（i/u/bg/gif）直接归一化，字段不丢', async () => {
    const { normalizeBubbleRow } = await load()
    const cached = {
      i: 'msb:2',
      s: 'miyoushe',
      g: '绝区零',
      n: 'cached',
      d: '',
      u: 'https://x/b.png',
      bg: 'ffeeaa',
      gif: 'https://x/b.gif',
      a: true,
      m: 'https://abc.supabase.co/storage/v1/object/public/mhy-decor/mirror/b.png',
      t: 'https://abc.supabase.co/storage/v1/object/public/mhy-decor/thumb/b.webp'
    }
    expect(normalizeBubbleRow(cached)).toEqual(cached)
  })

  it('缺 id 或 url 的行直接丢掉', async () => {
    const { normalizeBubbleRow } = await load()
    expect(normalizeBubbleRow({ id: '', url: 'https://x/a.png' })).toBeNull()
    expect(normalizeBubbleRow({ id: 'x', url: '' })).toBeNull()
    expect(normalizeBubbleRow(null)).toBeNull()
  })
})

describe('loadBubbleCatalog', () => {
  it('命中未过期缓存时不再请求云端', async () => {
    store.set('mhy_bubble_catalog_v1', JSON.stringify({
      fetchedAt: Date.now(),
      items: [{ i: 'msb:1', s: 'miyoushe', g: '原神', n: 'cached', d: '', u: 'https://x/a.png', bg: '', gif: '', a: false }]
    }))
    const { loadBubbleCatalog } = await load()
    const items = await loadBubbleCatalog()
    expect(items).toHaveLength(1)
    expect(items[0].n).toBe('cached')
    expect(from).not.toHaveBeenCalled()
  })

  it('缓存过期就请求 mhy_reply_bubbles 并回写缓存', async () => {
    store.set('mhy_bubble_catalog_v1', JSON.stringify({ fetchedAt: 1, items: [] }))
    supabaseResult.data = [{ ...ROW, id: 'msb:9' }]
    const { loadBubbleCatalog } = await load()
    const items = await loadBubbleCatalog()
    expect(from).toHaveBeenCalledWith('mhy_reply_bubbles')
    expect(items.map((x) => x.i)).toEqual(['msb:9'])
    const saved = JSON.parse(store.get('mhy_bubble_catalog_v1'))
    expect(saved.items[0].i).toBe('msb:9')
  })

  it('只拉 enabled=true 的行，排序 game → sort（气泡全部来自米游社，source 无排序意义）', async () => {
    store.set('mhy_bubble_catalog_v1', JSON.stringify({ fetchedAt: 1, items: [] }))
    const { loadBubbleCatalog } = await load()
    await loadBubbleCatalog()
    expect(eqCalls).toEqual([['enabled', true]])
    expect(orderCalls).toEqual(['game', 'sort'])
  })

  it('云端失败时退回过期缓存', async () => {
    store.set('mhy_bubble_catalog_v1', JSON.stringify({
      fetchedAt: 1,
      items: [{ i: 'msb:7', s: 'miyoushe', g: '原神', n: 'stale', d: '', u: 'https://x/a.png', bg: '', gif: '', a: false }]
    }))
    supabaseResult.error = { message: 'boom' }
    const { loadBubbleCatalog } = await load()
    const items = await loadBubbleCatalog()
    expect(items.map((x) => x.n)).toEqual(['stale'])
  })

  it('云端失败且无缓存时返回空目录', async () => {
    supabaseResult.error = { message: 'boom' }
    const { loadBubbleCatalog } = await load()
    const items = await loadBubbleCatalog()
    expect(items).toEqual([])
  })

  it('force=true 跳过缓存直接打云端', async () => {
    store.set('mhy_bubble_catalog_v1', JSON.stringify({ fetchedAt: Date.now(), items: [] }))
    supabaseResult.data = [{ ...ROW, id: 'msb:5' }]
    const { loadBubbleCatalog } = await load()
    const items = await loadBubbleCatalog({ force: true })
    expect(from).toHaveBeenCalled()
    expect(items.map((x) => x.i)).toEqual(['msb:5'])
  })

  it('force=true 绕过内存缓存重新拉云端（手动刷新语义），memo 同步更新', async () => {
    supabaseResult.data = [{ ...ROW, id: 'msb:1' }]
    const { loadBubbleCatalog } = await load()
    await loadBubbleCatalog() // 首拉 → memo

    supabaseResult.data = [{ ...ROW, id: 'msb:2' }]
    const items = await loadBubbleCatalog({ force: true })
    expect(from).toHaveBeenCalledTimes(2)
    expect(items.map((x) => x.i)).toEqual(['msb:2'])

    // 不带 force 仍走内存 memo（拿到刷新后的新目录）
    const again = await loadBubbleCatalog()
    expect(again.map((x) => x.i)).toEqual(['msb:2'])
    expect(from).toHaveBeenCalledTimes(2)
  })

  it('force 拉取失败：抛错且 memo 回退旧缓存（刷新按钮提示「已显示缓存内容」）', async () => {
    supabaseResult.data = [{ ...ROW, id: 'msb:1' }]
    const { loadBubbleCatalog } = await load()
    await loadBubbleCatalog()

    supabaseResult.error = { message: 'boom' }
    await expect(loadBubbleCatalog({ force: true })).rejects.toThrow('boom')

    // 兜底生效：常规读取拿到旧列表
    const items = await loadBubbleCatalog()
    expect(items.map((x) => x.i)).toEqual(['msb:1'])
  })

  it('force 拉到空目录：视为失败抛错，老数据不动', async () => {
    supabaseResult.data = [{ ...ROW, id: 'msb:1' }]
    const { loadBubbleCatalog } = await load()
    await loadBubbleCatalog()

    supabaseResult.data = []
    await expect(loadBubbleCatalog({ force: true })).rejects.toThrow('云端气泡目录为空')
    const items = await loadBubbleCatalog()
    expect(items.map((x) => x.i)).toEqual(['msb:1'])
  })

  it('inflight 去重：并发调用只打一次云端', async () => {
    store.set('mhy_bubble_catalog_v1', JSON.stringify({ fetchedAt: 1, items: [] }))
    supabaseResult.data = [{ ...ROW, id: 'msb:6' }]
    const { loadBubbleCatalog } = await load()
    const [a, b] = await Promise.all([loadBubbleCatalog(), loadBubbleCatalog()])
    expect(a).toBe(b)
    expect(from).toHaveBeenCalledTimes(1)
  })
})
