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

function makeQuery(result) {
  const query = {
    select: () => query,
    eq: () => query,
    order: () => query,
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  }
  return query
}

const ROW = {
  id: 'ms:1',
  source: 'miyoushe',
  game: '原神',
  name: '测试挂件',
  description: 'desc',
  url: 'https://bbs-static.miyoushe.com/a.png?x-oss-process=image/resize,w_318',
  mirror_url: '',
  thumb_url: '',
  animated: false,
  sort: 1
}

async function load() {
  const mod = await import('../catalog')
  mod.resetPendantCatalogCache()
  return mod
}

beforeEach(() => {
  store.clear()
  supabaseResult.data = []
  supabaseResult.error = null
  from.mockReset()
  from.mockImplementation(() => makeQuery(supabaseResult))
})

afterEach(() => {
  vi.resetModules()
})

describe('normalizePendantRow', () => {
  it('剥掉 x-oss-process 并转成紧凑结构', async () => {
    const { normalizePendantRow } = await load()
    expect(normalizePendantRow(ROW)).toEqual({
      i: 'ms:1',
      s: 'miyoushe',
      g: '原神',
      n: '测试挂件',
      d: 'desc',
      u: 'https://bbs-static.miyoushe.com/a.png',
      m: '',
      t: '',
      a: false
    })
  })

  it('HoYoLAB 行带 mirror_url/thumb_url 时透传成 m/t（并去掉查询参数）', async () => {
    const { normalizePendantRow } = await load()
    expect(normalizePendantRow({
      ...ROW,
      id: 'hy:9',
      source: 'hoyolab',
      url: 'https://upload-os-bbs.hoyolab.com/b.webp',
      mirror_url: 'https://abc.supabase.co/storage/v1/object/public/mhy-decor/mirror/b.webp?download=true',
      thumb_url: 'https://abc.supabase.co/storage/v1/object/public/mhy-decor/thumb/b.webp',
      animated: true
    })).toEqual({
      i: 'hy:9',
      s: 'hoyolab',
      g: '原神',
      n: '测试挂件',
      d: 'desc',
      u: 'https://upload-os-bbs.hoyolab.com/b.webp',
      m: 'https://abc.supabase.co/storage/v1/object/public/mhy-decor/mirror/b.webp',
      t: 'https://abc.supabase.co/storage/v1/object/public/mhy-decor/thumb/b.webp',
      a: true
    })
  })

  it('已缓存的紧凑项（i/u/m/t）直接归一化，字段不丢', async () => {
    const { normalizePendantRow } = await load()
    expect(normalizePendantRow({
      i: 'hy:9',
      s: 'hoyolab',
      g: '绝区零',
      n: 'cached',
      d: '',
      u: 'https://x/b.webp',
      m: 'https://abc.supabase.co/storage/v1/object/public/mhy-decor/mirror/b.webp',
      t: 'https://abc.supabase.co/storage/v1/object/public/mhy-decor/thumb/b.webp',
      a: true
    })).toEqual({
      i: 'hy:9',
      s: 'hoyolab',
      g: '绝区零',
      n: 'cached',
      d: '',
      u: 'https://x/b.webp',
      m: 'https://abc.supabase.co/storage/v1/object/public/mhy-decor/mirror/b.webp',
      t: 'https://abc.supabase.co/storage/v1/object/public/mhy-decor/thumb/b.webp',
      a: true
    })
  })

  it('缺 id 或 url 的行直接丢掉', async () => {
    const { normalizePendantRow } = await load()
    expect(normalizePendantRow({ id: '', url: 'https://x/a.png' })).toBeNull()
    expect(normalizePendantRow({ id: 'x', url: '' })).toBeNull()
    expect(normalizePendantRow(null)).toBeNull()
  })
})

describe('normalizePendantRows 同图去重', () => {
  const HASH = 'e3e7851669f6a32f1de74aa83e49018d'
  const mk = (id, name, extra = {}) => ({
    ...ROW,
    id,
    name,
    url: `https://upload-os-bbs.hoyolab.com/upload/2024/06/14/${HASH}_${id.replace(':', '')}.png`,
    ...extra
  })

  it('官方目录把同一张图收录两条时只留一条', async () => {
    const { normalizePendantRows } = await load()
    const items = normalizePendantRows([
      mk('hy:916', '知更鸟角色头像框'),
      mk('hy:956', '「知更鸟」头像框')
    ])
    expect(items.map((x) => x.i)).toEqual(['hy:916'])
  })

  it('同图优先留米游社条目（国内 OSS 直连快）', async () => {
    const { normalizePendantRows } = await load()
    const items = normalizePendantRows([
      mk('hy:1', 'A', { source: 'hoyolab' }),
      mk('ms:1', 'A', { source: 'miyoushe' })
    ])
    expect(items.map((x) => x.i)).toEqual(['ms:1'])
  })

  it('同图优先留动图那条', async () => {
    const { normalizePendantRows } = await load()
    const items = normalizePendantRows([
      mk('ms:1', 'A', { source: 'miyoushe' }),
      mk('hy:1', 'A', { source: 'hoyolab', animated: true })
    ])
    expect(items.map((x) => x.i)).toEqual(['hy:1'])
    expect(items[0].a).toBe(true)
  })

  it('不同图（hash 不同）不会被误删', async () => {
    const { normalizePendantRows } = await load()
    const items = normalizePendantRows([
      mk('hy:1', '知更鸟•晴歌头像框'),
      { ...ROW, id: 'hy:2', url: 'https://upload-os-bbs.hoyolab.com/upload/2026/08/20/805c16f2c080921181a4b56b746c7b7f_6527413628437720150.png' }
    ])
    expect(items).toHaveLength(2)
  })
})

describe('loadPendantCatalog', () => {
  it('v1 旧缓存直接忽略（结构缺 m/t），仍然请求云端', async () => {
    store.set('mhy_decor_catalog_v1', JSON.stringify({
      fetchedAt: Date.now(),
      items: [{ i: 'ms:0', s: 'miyoushe', g: '原神', n: 'stale-v1', d: '', u: 'https://x/old.png', a: false }]
    }))
    supabaseResult.data = [{ ...ROW, id: 'ms:1' }]
    const { loadPendantCatalog } = await load()
    const items = await loadPendantCatalog()
    expect(from).toHaveBeenCalled()
    expect(items.map((x) => x.i)).toEqual(['ms:1'])
  })

  it('命中未过期缓存时不再请求云端', async () => {
    store.set('mhy_decor_catalog_v2', JSON.stringify({
      fetchedAt: Date.now(),
      items: [{ i: 'ms:1', s: 'miyoushe', g: '原神', n: 'cached', d: '', u: 'https://x/a.png', a: false }]
    }))
    const { loadPendantCatalog } = await load()
    const items = await loadPendantCatalog()
    expect(items).toHaveLength(1)
    expect(items[0].n).toBe('cached')
    expect(from).not.toHaveBeenCalled()
  })

  it('缓存过期就请求云端并回写缓存', async () => {
    store.set('mhy_decor_catalog_v2', JSON.stringify({ fetchedAt: 1, items: [] }))
    supabaseResult.data = [{ ...ROW, id: 'ms:2' }]
    const { loadPendantCatalog } = await load()
    const items = await loadPendantCatalog()
    expect(from).toHaveBeenCalledWith('mhy_decor_pendants')
    expect(items.map((x) => x.i)).toEqual(['ms:2'])
    const saved = JSON.parse(store.get('mhy_decor_catalog_v2'))
    expect(saved.items[0].i).toBe('ms:2')
  })

  it('云端失败时退回旧缓存', async () => {
    store.set('mhy_decor_catalog_v2', JSON.stringify({
      fetchedAt: 1,
      items: [{ i: 'ms:9', s: 'miyoushe', g: '原神', n: 'stale', d: '', u: 'https://x/a.png', a: false }]
    }))
    supabaseResult.error = { message: 'boom' }
    const { loadPendantCatalog } = await load()
    const items = await loadPendantCatalog()
    expect(items.map((x) => x.n)).toEqual(['stale'])
  })

  it('云端失败且无缓存时返回空目录', async () => {
    supabaseResult.error = { message: 'boom' }
    const { loadPendantCatalog } = await load()
    const items = await loadPendantCatalog()
    expect(items).toEqual([])
  })

  it('force=true 跳过缓存直接打云端', async () => {
    store.set('mhy_decor_catalog_v2', JSON.stringify({ fetchedAt: Date.now(), items: [] }))
    supabaseResult.data = [{ ...ROW, id: 'ms:3' }]
    const { loadPendantCatalog } = await load()
    const items = await loadPendantCatalog({ force: true })
    expect(from).toHaveBeenCalled()
    expect(items.map((x) => x.i)).toEqual(['ms:3'])
  })

  it('force=true 绕过内存缓存重新拉云端（手动刷新语义），memo 同步更新', async () => {
    supabaseResult.data = [{ ...ROW, id: 'ms:1' }]
    const { loadPendantCatalog } = await load()
    await loadPendantCatalog() // 首拉 → memo

    supabaseResult.data = [{ ...ROW, id: 'ms:2' }]
    const items = await loadPendantCatalog({ force: true })
    expect(from).toHaveBeenCalledTimes(2)
    expect(items.map((x) => x.i)).toEqual(['ms:2'])

    // 不带 force 仍走内存 memo（拿到刷新后的新目录）
    const again = await loadPendantCatalog()
    expect(again.map((x) => x.i)).toEqual(['ms:2'])
    expect(from).toHaveBeenCalledTimes(2)
  })

  it('force 拉取失败：抛错且 memo 回退旧缓存（刷新按钮提示「已显示缓存内容」）', async () => {
    supabaseResult.data = [{ ...ROW, id: 'ms:1' }]
    const { loadPendantCatalog } = await load()
    await loadPendantCatalog()

    supabaseResult.error = { message: 'boom' }
    await expect(loadPendantCatalog({ force: true })).rejects.toThrow('boom')

    // 兜底生效：常规读取拿到旧列表
    const items = await loadPendantCatalog()
    expect(items.map((x) => x.i)).toEqual(['ms:1'])
  })

  it('force 拉到空目录：视为失败抛错，老数据不动', async () => {
    supabaseResult.data = [{ ...ROW, id: 'ms:1' }]
    const { loadPendantCatalog } = await load()
    await loadPendantCatalog()

    supabaseResult.data = []
    await expect(loadPendantCatalog({ force: true })).rejects.toThrow('云端挂件目录为空')
    const items = await loadPendantCatalog()
    expect(items.map((x) => x.i)).toEqual(['ms:1'])
  })
})

describe('groupPendants', () => {
  it('按来源 + 游戏分组并保持顺序', async () => {
    const { groupPendants } = await load()
    const groups = groupPendants([
      { i: 'a', s: 'miyoushe', g: '原神', n: '', d: '', u: 'u', a: false },
      { i: 'b', s: 'miyoushe', g: '原神', n: '', d: '', u: 'u', a: false },
      { i: 'c', s: 'hoyolab', g: '绝区零', n: '', d: '', u: 'u', a: false }
    ])
    expect(groups).toEqual([
      { source: 'miyoushe', game: '原神', items: [expect.objectContaining({ i: 'a' }), expect.objectContaining({ i: 'b' })] },
      { source: 'hoyolab', game: '绝区零', items: [expect.objectContaining({ i: 'c' })] }
    ])
  })
})
