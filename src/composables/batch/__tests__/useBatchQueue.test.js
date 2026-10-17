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
  deleteManagedLocalImages: mocks.deleteManagedLocalImages,
  isLocalImageUri: vi.fn((uri) => {
    const value = String(uri || '')
    return value.includes('_capacitor_file_') || value.includes('user-images') || value.startsWith('file:')
  })
}))

vi.mock('@/utils/goods/images', () => ({
  createGoodsImageId: vi.fn(() => `id_${++mocks.idCounter.n}`),
  buildCloudImageUri: vi.fn((name) => (name ? `cloud-image://${name}` : '')),
  parseCloudImageUri: vi.fn((uri) => {
    const value = String(uri || '')
    return value.startsWith('cloud-image://') ? value.slice('cloud-image://'.length) : ''
  }),
  parseStoragePublicImageUrl: vi.fn(() => '')
}))

vi.mock('@/stores/storeCore', () => ({
  createAutoPush: vi.fn(() => vi.fn())
}))

vi.mock('@/utils/db', () => ({
  getBatchDraft: vi.fn(async (slot) => {
    const row = mocks.draftStore.get(slot)
    return row ? structuredClone(row) : null
  }),
  getAllBatchDrafts: vi.fn(async () => [...mocks.draftStore.values()].map((row) => structuredClone(row))),
  getBatchDraftUpdatedAt: vi.fn(async (slot) => {
    const row = mocks.draftStore.get(slot)
    return row ? (Number(row.updatedAt) || 0) : 0
  }),
  saveBatchDraft: vi.fn(async (draft) => {
    mocks.draftStore.set(draft.slot, {
      slot: draft.slot,
      batchId: draft.batchId || '',
      isWishlist: draft.isWishlist === true,
      items: structuredClone(draft.items || []),
      defaults: structuredClone(draft.defaults || {}),
      deleted: draft.deleted === true,
      updatedAt: draft.updatedAt || Date.now()
    })
  }),
  saveBatchDrafts: vi.fn(async (drafts) => {
    for (const draft of drafts || []) {
      if (!draft?.slot) continue
      mocks.draftStore.set(draft.slot, {
        slot: draft.slot,
        batchId: draft.batchId || '',
        isWishlist: draft.isWishlist === true,
        items: structuredClone(draft.items || []),
        defaults: structuredClone(draft.defaults || {}),
        deleted: draft.deleted === true,
        updatedAt: draft.updatedAt || Date.now()
      })
    }
  }),
  softDeleteBatchDraft: vi.fn(async (slot) => {
    const row = mocks.draftStore.get(slot)
    if (!row) return
    mocks.draftStore.set(slot, {
      ...row,
      items: [],
      deleted: true,
      updatedAt: Math.max(Date.now(), (Number(row.updatedAt) || 0) + 1)
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

/** 软删墓碑：行仍在，deleted=1、items 清空 */
function isTombstone(row) {
  return !!row && row.deleted === true && (!row.items || row.items.length === 0)
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
    // 草稿软删墓碑（供同步传播清除）
    expect(isTombstone(mocks.draftStore.get('collection'))).toBe(true)
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
    expect(isTombstone(mocks.draftStore.get('wishlist'))).toBe(true)
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
    expect(meta).toMatchObject({ kind: 'queue', count: 1, batchId: 'b1', isWishlist: false })
    expect(await q.hasDraft('collection')).toBe(true)
    // wishlist 侧仍无
    expect(await q.hasDraft('wishlist')).toBe(false)
  })

  it('saveSingleDraft / getSingleDraft：单个草稿与队列草稿共用同一行且可读回', async () => {
    const q = await loadQueue()
    const updatedAt = await q.saveSingleDraft('collection', {
      name: '单草稿',
      images: [{ id: 'i1', uri: URI_A }]
    }, false)
    expect(updatedAt).toBeGreaterThan(0)

    const meta = await q.getDraftMeta('collection')
    expect(meta).toMatchObject({ kind: 'single', count: 1, isWishlist: false })

    const single = await q.getSingleDraft('collection')
    expect(single.form.name).toBe('单草稿')
    expect(single.form.images[0].uri).toBe(URI_A)
    expect(single.updatedAt).toBe(updatedAt)
  })

  it('resumeDraft 遇到单个草稿既不恢复队列也不软删（保护单个草稿）', async () => {
    const q = await loadQueue()
    await q.saveSingleDraft('collection', { name: '单草稿' }, false)

    const ok = await q.resumeDraft('collection')
    expect(ok).toBe(false)
    expect(q.queue.value).toHaveLength(0)

    const row = mocks.draftStore.get('collection')
    expect(row.deleted).toBeFalsy()
    expect((await q.getDraftMeta('collection')).kind).toBe('single')
  })

  it('clearDraft 删掉单个草稿行与其中的本地图片', async () => {
    const q = await loadQueue()
    await q.saveSingleDraft('collection', {
      name: '单草稿',
      images: [{ id: 'i1', uri: URI_A }, { id: 'i2', uri: URI_B }]
    }, false)

    await q.clearDraft('collection')

    expect(isTombstone(mocks.draftStore.get('collection'))).toBe(true)
    expect(mocks.deleteManagedLocalImages).toHaveBeenCalledWith([URI_A, URI_B])
  })

  it('clearSingleDraft 软删草稿行但不删图片（保存成功语义）', async () => {
    const q = await loadQueue()
    await q.saveSingleDraft('wishlist', {
      name: '单草稿',
      images: [{ id: 'i1', uri: URI_A }]
    }, true)
    mocks.deleteManagedLocalImages.mockClear()

    await q.clearSingleDraft('wishlist')

    expect(isTombstone(mocks.draftStore.get('wishlist'))).toBe(true)
    expect(mocks.deleteManagedLocalImages).not.toHaveBeenCalled()
  })

  it('清除草稿：墓碑 updatedAt 必须晚于内容行（本机时钟落后也不会被云端/pull 盖回）', async () => {
    const q = await loadQueue()
    vi.setSystemTime(new Date('2026-01-01T00:00:10.000Z'))
    await q.saveSingleDraft('collection', { name: '单草稿' }, false)
    const contentTs = mocks.draftStore.get('collection').updatedAt
    expect(contentTs).toBeGreaterThan(0)

    // 模拟本机时钟落后 / 内容行来自更快的时钟：墓碑若只用 Date.now() 会比内容行更旧，
    // 云端 upsert（updated_at <= excluded）会拒收，随后 pull 把内容行盖回 → 草稿复活。
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    await q.clearSingleDraft('collection')

    const tomb = mocks.draftStore.get('collection')
    expect(isTombstone(tomb)).toBe(true)
    expect(tomb.updatedAt).toBeGreaterThan(contentTs)
  })

  it('清除后再次写入单个草稿：updatedAt 仍基于墓碑递增（不因墓碑被判 null 而退回设备时钟）', async () => {
    const q = await loadQueue()
    vi.setSystemTime(new Date('2026-01-01T00:00:10.000Z'))
    await q.saveSingleDraft('collection', { name: '旧草稿' }, false)
    await q.clearSingleDraft('collection')
    const tombTs = mocks.draftStore.get('collection').updatedAt

    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    const newTs = await q.saveSingleDraft('collection', { name: '新草稿' }, false)

    expect(newTs).toBeGreaterThan(tombTs)
    const row = mocks.draftStore.get('collection')
    expect(row.deleted).toBe(false)
    expect(await q.getDraftMeta('collection')).toMatchObject({ kind: 'single' })
  })

  it('clearDraft 删除草稿行与全部本地图片并清内存', async () => {
    const q = await loadQueue()
    await q.initQueue([{ uri: URI_A }, { uri: URI_B }], { batchId: 'b1' })
    await flushPersist(q)

    await q.clearDraft('collection')

    expect(isTombstone(mocks.draftStore.get('collection'))).toBe(true)
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

    expect(isTombstone(mocks.draftStore.get('collection'))).toBe(true)
    expect(mocks.draftStore.get('wishlist').deleted).toBeFalsy()
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
    expect(isTombstone(mocks.draftStore.get('collection'))).toBe(true)
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

    expect(isTombstone(mocks.draftStore.get('collection'))).toBe(true)
    expect(mocks.deleteManagedLocalImages).toHaveBeenCalledWith([URI_A])
  })
})
