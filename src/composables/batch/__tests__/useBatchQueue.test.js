import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'

// 模块级 mock：文件删除、图片 ID、草稿 DB（vi.mock 提升，需用 vi.hoisted 共享状态）
const mocks = vi.hoisted(() => ({
  deleteManagedLocalImages: vi.fn(),
  idCounter: { n: 0 },
  // slot → draft row
  draftStore: new Map()
}))

vi.mock('@/utils/image/localImage', () => ({
  deleteManagedLocalImages: mocks.deleteManagedLocalImages
}))

vi.mock('@/utils/goods/images', () => ({
  createGoodsImageId: vi.fn(() => `id_${++mocks.idCounter.n}`)
}))

vi.mock('@/utils/db', () => ({
  getBatchDraft: vi.fn(async (slot) => {
    const row = mocks.draftStore.get(slot)
    return row ? structuredClone(row) : null
  }),
  saveBatchDraft: vi.fn(async (draft) => {
    mocks.draftStore.set(draft.slot, {
      slot: draft.slot,
      batchId: draft.batchId || '',
      isWishlist: draft.isWishlist === true,
      items: structuredClone(draft.items || []),
      defaults: structuredClone(draft.defaults || {}),
      updatedAt: draft.updatedAt || Date.now()
    })
  }),
  deleteBatchDraft: vi.fn(async (slot) => {
    mocks.draftStore.delete(slot)
  })
}))

// 原生端复制后的本地图片 URI 样例
const URI_A = 'https://localhost/_capacitor_file_/data/user-images/a.jpg'
const URI_B = 'https://localhost/_capacitor_file_/data/user-images/b.jpg'
const URI_C = 'https://localhost/_capacitor_file_/data/user-images/c.jpg'

// 组合式函数持有模块级状态，每个用例需重置模块后重新加载
async function loadQueue() {
  vi.resetModules()
  const mod = await import('../useBatchQueue')
  return mod.useBatchQueue()
}

/** 等防抖 + 串行 persist 链跑完 */
async function flushPersist(q) {
  await nextTick()
  await q.flushBatchDraft()
  await nextTick()
}

function makeGoodsStore() {
  return { addMultipleGoods: vi.fn().mockResolvedValue([]) }
}

describe('useBatchQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.draftStore.clear()
    mocks.deleteManagedLocalImages.mockReset()
    mocks.deleteManagedLocalImages.mockResolvedValue(0)
    mocks.idCounter.n = 0
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('saveAll 成功后清空队列、删草稿行，且不删除图片文件', async () => {
    const q = await loadQueue()
    await q.initQueue([{ uri: URI_A }, { uri: URI_B }], { batchId: 'b1' })
    q.updateItem(q.queue.value[0].id, { name: '吧唧A' })
    q.updateItem(q.queue.value[1].id, { name: '吧唧B' })
    await flushPersist(q)
    expect(mocks.draftStore.has('collection')).toBe(true)

    const goodsStore = makeGoodsStore()
    await q.saveAll(goodsStore)
    await flushPersist(q)

    expect(goodsStore.addMultipleGoods).toHaveBeenCalledTimes(1)
    expect(q.queue.value).toHaveLength(0)
    // 保存后图片归商品所有，不得删除文件
    expect(mocks.deleteManagedLocalImages).not.toHaveBeenCalled()
    // 草稿行已清
    expect(mocks.draftStore.has('collection')).toBe(false)
  })

  it('saveAll 愿望单批次：isWishlist=true、collectStatus 为空、acquiredAt 为空，清 wishlist 槽', async () => {
    const q = await loadQueue()
    await q.initQueue([{ uri: URI_A }], { batchId: 'b1', isWishlist: true })
    q.updateItem(q.queue.value[0].id, { name: '想要的吧唧' })
    await flushPersist(q)
    expect(mocks.draftStore.has('wishlist')).toBe(true)

    const goodsStore = makeGoodsStore()
    await q.saveAll(goodsStore)
    await flushPersist(q)

    const items = goodsStore.addMultipleGoods.mock.calls[0][0]
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      name: '想要的吧唧',
      isWishlist: true,
      collectStatus: '',
      acquiredAt: ''
    })
    expect(mocks.draftStore.has('wishlist')).toBe(false)
    // collection 槽从未被触碰
    expect(mocks.draftStore.has('collection')).toBe(false)
  })

  it('saveAll 普通批次：isWishlist=false、collectStatus=已拥有、acquiredAt 取条目日期', async () => {
    const q = await loadQueue()
    await q.initQueue([{ uri: URI_A }], { batchId: 'b1', isWishlist: false })
    const item = q.queue.value[0]
    q.updateItem(item.id, { name: '已入手的吧唧', date: '2026-07-01' })

    const goodsStore = makeGoodsStore()
    await q.saveAll(goodsStore)

    const items = goodsStore.addMultipleGoods.mock.calls[0][0]
    expect(items[0]).toMatchObject({
      name: '已入手的吧唧',
      isWishlist: false,
      collectStatus: '已拥有',
      acquiredAt: '2026-07-01'
    })
    expect(items[0].images).toEqual([{ id: item.id, uri: URI_A }])
  })

  it('removeItem 删除对应的本地图片文件', async () => {
    const q = await loadQueue()
    await q.initQueue([{ uri: URI_A }, { uri: URI_B }], { batchId: 'b1' })
    const removedId = q.queue.value[0].id

    q.removeItem(removedId)

    expect(mocks.deleteManagedLocalImages).toHaveBeenCalledWith([URI_A])
    expect(q.queue.value).toHaveLength(1)
    expect(q.queue.value[0].imageUri).toBe(URI_B)
  })

  it('replaceItemImage 删除旧文件并更新 uri', async () => {
    const q = await loadQueue()
    await q.initQueue([{ uri: URI_A }], { batchId: 'b1' })
    const id = q.queue.value[0].id

    q.replaceItemImage(id, URI_C)

    expect(mocks.deleteManagedLocalImages).toHaveBeenCalledWith([URI_A])
    expect(q.queue.value[0].imageUri).toBe(URI_C)

    // 相同 uri 不触发删除
    mocks.deleteManagedLocalImages.mockClear()
    q.replaceItemImage(id, URI_C)
    expect(mocks.deleteManagedLocalImages).not.toHaveBeenCalled()
  })

  it('离开（flushBatchDraft）静默保留：写 DB、不删图片、不弹任何清理', async () => {
    const q = await loadQueue()
    await q.initQueue([{ uri: URI_A }, { uri: URI_B }], { batchId: 'b1' })
    q.updateItem(q.queue.value[0].id, { name: '编辑中' })
    q.markDirty(q.queue.value[0].id, 'name')

    // 模拟离开页面：只 flush，不 discard
    await flushPersist(q)

    expect(q.queue.value).toHaveLength(2)
    expect(mocks.deleteManagedLocalImages).not.toHaveBeenCalled()
    const row = mocks.draftStore.get('collection')
    expect(row).toBeTruthy()
    expect(row.items).toHaveLength(2)
    expect(row.items[0].name).toBe('编辑中')
    expect(Array.isArray(row.items[0].dirtyFields)).toBe(true)
    expect(row.items[0].dirtyFields).toContain('name')
  })

  it('resumeDraft 从 DB 恢复编辑进度（含 dirtyFields）', async () => {
    // 第一段：写入草稿
    {
      const q = await loadQueue()
      await q.initQueue([{ uri: URI_A }], { batchId: 'b1' })
      q.updateItem(q.queue.value[0].id, { name: '已编辑' })
      q.markDirty(q.queue.value[0].id, 'name')
      await flushPersist(q)
    }
    // 第二段：模拟杀进程后重新加载模块
    const q2 = await loadQueue()
    expect(q2.queue.value).toHaveLength(0)
    const ok = await q2.resumeDraft('collection')
    expect(ok).toBe(true)
    expect(q2.queue.value).toHaveLength(1)
    expect(q2.queue.value[0].name).toBe('已编辑')
    expect(q2.queue.value[0].dirtyFields.has('name')).toBe(true)
    expect(q2.batchId.value).toBe('b1')
    expect(q2.activeSlot.value).toBe('collection')
  })

  it('slot 隔离：collection 与 wishlist 草稿互不覆盖', async () => {
    const q = await loadQueue()
    await q.initQueue([{ uri: URI_A }], { batchId: 'bc', isWishlist: false })
    q.updateItem(q.queue.value[0].id, { name: '收藏草稿' })
    await flushPersist(q)

    // 切到 wishlist：旧槽先落库，内存换新
    await q.initQueue([{ uri: URI_B }], { batchId: 'bw', isWishlist: true })
    q.updateItem(q.queue.value[0].id, { name: '心愿草稿' })
    await flushPersist(q)

    expect(mocks.draftStore.get('collection').items[0].name).toBe('收藏草稿')
    expect(mocks.draftStore.get('wishlist').items[0].name).toBe('心愿草稿')
    expect(q.activeSlot.value).toBe('wishlist')
    // 跨槽切换不得删另一槽的图片
    expect(mocks.deleteManagedLocalImages).not.toHaveBeenCalledWith([URI_A])
  })

  it('hasDraft / getDraftMeta：空 items 视为无草稿', async () => {
    const q = await loadQueue()
    expect(await q.hasDraft('collection')).toBe(false)
    mocks.draftStore.set('collection', {
      slot: 'collection',
      batchId: '',
      isWishlist: false,
      items: [],
      defaults: {},
      updatedAt: Date.now()
    })
    expect(await q.hasDraft('collection')).toBe(false)

    await q.initQueue([{ uri: URI_A }], { batchId: 'b1' })
    await flushPersist(q)
    const meta = await q.getDraftMeta('collection')
    expect(meta).toMatchObject({ count: 1, batchId: 'b1', isWishlist: false })
    expect(await q.hasDraft('collection')).toBe(true)
    // wishlist 侧仍无
    expect(await q.hasDraft('wishlist')).toBe(false)
  })

  it('clearDraft 删除草稿行与全部本地图片并清内存', async () => {
    const q = await loadQueue()
    await q.initQueue([{ uri: URI_A }, { uri: URI_B }], { batchId: 'b1' })
    await flushPersist(q)

    await q.clearDraft('collection')

    expect(mocks.draftStore.has('collection')).toBe(false)
    expect(mocks.deleteManagedLocalImages).toHaveBeenCalledWith([URI_A, URI_B])
    expect(q.queue.value).toHaveLength(0)
    expect(q.batchId.value).toBe('')
    expect(q.activeSlot.value).toBe('')
  })

  it('clearDraft 非当前槽：只读 DB 删行删图，不动内存', async () => {
    const q = await loadQueue()
    await q.initQueue([{ uri: URI_A }], { batchId: 'bc', isWishlist: false })
    await flushPersist(q)
    await q.initQueue([{ uri: URI_B }], { batchId: 'bw', isWishlist: true })
    await flushPersist(q)
    mocks.deleteManagedLocalImages.mockClear()

    await q.clearDraft('collection')

    expect(mocks.draftStore.has('collection')).toBe(false)
    expect(mocks.draftStore.has('wishlist')).toBe(true)
    expect(mocks.deleteManagedLocalImages).toHaveBeenCalledWith([URI_A])
    // 内存仍是 wishlist
    expect(q.queue.value).toHaveLength(1)
    expect(q.queue.value[0].imageUri).toBe(URI_B)
    expect(q.activeSlot.value).toBe('wishlist')
  })

  it('discardQueue 等价 clearDraft(activeSlot)：删图 + 清行 + 清内存', async () => {
    const q = await loadQueue()
    await q.initQueue([{ uri: URI_A }, { uri: URI_B }], { batchId: 'b1' })
    await flushPersist(q)

    // discardQueue 返回 clearDraft 的 Promise
    await q.discardQueue()

    expect(mocks.deleteManagedLocalImages).toHaveBeenCalledWith([URI_A, URI_B])
    expect(q.queue.value).toHaveLength(0)
    expect(q.batchId.value).toBe('')
    expect(mocks.draftStore.has('collection')).toBe(false)
  })

  it('initQueue 相同图片列表时跳过重建并保留编辑进度', async () => {
    const q = await loadQueue()
    await q.initQueue([{ uri: URI_A }, { uri: URI_B }], { batchId: 'b1' })
    const firstId = q.queue.value[0].id
    q.updateItem(firstId, { name: '已编辑' })
    q.markDirty(firstId, 'name')

    // 页面刷新后 history.state 仍携带同一批图片
    await q.initQueue([{ uri: URI_A }, { uri: URI_B }], { batchId: 'b1' })

    expect(q.queue.value[0].id).toBe(firstId)
    expect(q.queue.value[0].name).toBe('已编辑')
    expect(q.queue.value[0].dirtyFields.has('name')).toBe(true)
    expect(mocks.deleteManagedLocalImages).not.toHaveBeenCalled()
  })

  it('initQueue 同槽传入新图片时清理旧队列残留文件', async () => {
    const q = await loadQueue()
    await q.initQueue([{ uri: URI_A }, { uri: URI_B }], { batchId: 'b1' })

    await q.initQueue([{ uri: URI_C }], { batchId: 'b2' })

    expect(mocks.deleteManagedLocalImages).toHaveBeenCalledWith([URI_A, URI_B])
    expect(q.queue.value).toHaveLength(1)
    expect(q.queue.value[0].imageUri).toBe(URI_C)
  })

  it('initQueue 切槽时先落库旧槽且不删旧图', async () => {
    const q = await loadQueue()
    await q.initQueue([{ uri: URI_A }], { batchId: 'bc', isWishlist: false })
    await flushPersist(q)
    mocks.deleteManagedLocalImages.mockClear()

    await q.initQueue([{ uri: URI_B }], { batchId: 'bw', isWishlist: true })
    await flushPersist(q)

    expect(mocks.draftStore.get('collection').items[0].imageUri).toBe(URI_A)
    expect(mocks.deleteManagedLocalImages).not.toHaveBeenCalled()
    expect(q.activeSlot.value).toBe('wishlist')
    expect(q.isWishlist.value).toBe(true)
  })

  it('队列清空后 flush 删掉草稿行（不删图）', async () => {
    const q = await loadQueue()
    await q.initQueue([{ uri: URI_A }], { batchId: 'b1' })
    await flushPersist(q)
    expect(mocks.draftStore.has('collection')).toBe(true)

    q.removeItem(q.queue.value[0].id)
    // removeItem 已删该图
    await flushPersist(q)

    expect(mocks.draftStore.has('collection')).toBe(false)
    expect(mocks.deleteManagedLocalImages).toHaveBeenCalledWith([URI_A])
  })
})
