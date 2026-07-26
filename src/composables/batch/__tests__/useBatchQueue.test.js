import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick } from 'vue'

// 模块级 mock：文件删除与图片 ID 生成（vi.mock 提升，需用 vi.hoisted 共享状态）
const mocks = vi.hoisted(() => ({
  deleteManagedLocalImages: vi.fn(),
  idCounter: { n: 0 }
}))

vi.mock('@/utils/image/localImage', () => ({
  deleteManagedLocalImages: mocks.deleteManagedLocalImages
}))

vi.mock('@/utils/goods/images', () => ({
  createGoodsImageId: vi.fn(() => `id_${++mocks.idCounter.n}`)
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

function makeGoodsStore() {
  return { addMultipleGoods: vi.fn().mockResolvedValue([]) }
}

describe('useBatchQueue', () => {
  beforeEach(() => {
    sessionStorage.clear()
    mocks.deleteManagedLocalImages.mockReset()
    mocks.deleteManagedLocalImages.mockResolvedValue(0)
  })

  it('saveAll 成功后清空队列且不删除图片文件', async () => {
    const q = await loadQueue()
    q.initQueue([{ uri: URI_A }, { uri: URI_B }], { batchId: 'b1' })
    q.updateItem(q.queue.value[0].id, { name: '吧唧A' })
    q.updateItem(q.queue.value[1].id, { name: '吧唧B' })

    const goodsStore = makeGoodsStore()
    await q.saveAll(goodsStore)
    await nextTick()

    expect(goodsStore.addMultipleGoods).toHaveBeenCalledTimes(1)
    expect(q.queue.value).toHaveLength(0)
    // 保存后图片归商品所有，不得删除文件
    expect(mocks.deleteManagedLocalImages).not.toHaveBeenCalled()
    // 队列持久化已被清空（watcher 会重写为空数组）
    const saved = sessionStorage.getItem('batch-queue-data')
    expect(JSON.parse(saved || '[]')).toHaveLength(0)
  })

  it('saveAll 愿望单批次：isWishlist=true、collectStatus 为空、acquiredAt 为空', async () => {
    const q = await loadQueue()
    q.initQueue([{ uri: URI_A }], { batchId: 'b1', isWishlist: true })
    q.updateItem(q.queue.value[0].id, { name: '想要的吧唧' })

    const goodsStore = makeGoodsStore()
    await q.saveAll(goodsStore)

    const items = goodsStore.addMultipleGoods.mock.calls[0][0]
    expect(items).toHaveLength(1)
    // 与单件添加流程一致：心愿单靠 isWishlist 标记，collectStatus/acquiredAt 留空
    expect(items[0]).toMatchObject({
      name: '想要的吧唧',
      isWishlist: true,
      collectStatus: '',
      acquiredAt: ''
    })
  })

  it('saveAll 普通批次：isWishlist=false、collectStatus=已拥有、acquiredAt 取条目日期', async () => {
    const q = await loadQueue()
    q.initQueue([{ uri: URI_A }], { batchId: 'b1', isWishlist: false })
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
    q.initQueue([{ uri: URI_A }, { uri: URI_B }], { batchId: 'b1' })
    const removedId = q.queue.value[0].id

    q.removeItem(removedId)

    expect(mocks.deleteManagedLocalImages).toHaveBeenCalledWith([URI_A])
    expect(q.queue.value).toHaveLength(1)
    expect(q.queue.value[0].imageUri).toBe(URI_B)
  })

  it('replaceItemImage 删除旧文件并更新 uri', async () => {
    const q = await loadQueue()
    q.initQueue([{ uri: URI_A }], { batchId: 'b1' })
    const id = q.queue.value[0].id

    q.replaceItemImage(id, URI_C)

    expect(mocks.deleteManagedLocalImages).toHaveBeenCalledWith([URI_A])
    expect(q.queue.value[0].imageUri).toBe(URI_C)

    // 相同 uri 不触发删除
    mocks.deleteManagedLocalImages.mockClear()
    q.replaceItemImage(id, URI_C)
    expect(mocks.deleteManagedLocalImages).not.toHaveBeenCalled()
  })

  it('discardQueue 删除全部文件并清空队列与存储', async () => {
    const q = await loadQueue()
    q.initQueue([{ uri: URI_A }, { uri: URI_B }], { batchId: 'b1' })
    await nextTick()

    q.discardQueue()
    await nextTick()

    expect(mocks.deleteManagedLocalImages).toHaveBeenCalledWith([URI_A, URI_B])
    expect(q.queue.value).toHaveLength(0)
    expect(q.batchId.value).toBe('')
    expect(JSON.parse(sessionStorage.getItem('batch-queue-data') || '[]')).toHaveLength(0)
  })

  it('initQueue 相同图片列表时跳过重建并保留编辑进度', async () => {
    const q = await loadQueue()
    q.initQueue([{ uri: URI_A }, { uri: URI_B }], { batchId: 'b1' })
    const firstId = q.queue.value[0].id
    q.updateItem(firstId, { name: '已编辑' })
    q.markDirty(firstId, 'name')

    // 页面刷新后 history.state 仍携带同一批图片
    q.initQueue([{ uri: URI_A }, { uri: URI_B }], { batchId: 'b1' })

    expect(q.queue.value[0].id).toBe(firstId)
    expect(q.queue.value[0].name).toBe('已编辑')
    expect(q.queue.value[0].dirtyFields.has('name')).toBe(true)
    expect(mocks.deleteManagedLocalImages).not.toHaveBeenCalled()
  })

  it('initQueue 传入新图片时清理旧队列残留文件', async () => {
    const q = await loadQueue()
    q.initQueue([{ uri: URI_A }, { uri: URI_B }], { batchId: 'b1' })

    q.initQueue([{ uri: URI_C }], { batchId: 'b2' })

    expect(mocks.deleteManagedLocalImages).toHaveBeenCalledWith([URI_A, URI_B])
    expect(q.queue.value).toHaveLength(1)
    expect(q.queue.value[0].imageUri).toBe(URI_C)
  })

  it('sessionStorage 配额不足时降级写入并标记 persistDegraded', async () => {
    const q = await loadQueue()
    const originalSetItem = sessionStorage.setItem.bind(sessionStorage)
    vi.spyOn(sessionStorage, 'setItem').mockImplementation((key, value) => {
      // 模拟包含内联图片的完整写入超出配额
      if (String(value).includes('data:image')) {
        throw new DOMException('quota exceeded', 'QuotaExceededError')
      }
      return originalSetItem(key, value)
    })

    q.initQueue([{ uri: 'data:image/png;base64,AAAA' }], { batchId: 'b1' })
    q.updateItem(q.queue.value[0].id, { name: '大图条目' })
    await nextTick()

    expect(q.persistDegraded.value).toBe(true)
    // 降级写入成功：元数据保留、内联图片被剥离
    const saved = JSON.parse(sessionStorage.getItem('batch-queue-data'))
    expect(saved).toHaveLength(1)
    expect(saved[0].imageUri).toBe('')
    expect(saved[0].name).toBe('大图条目')
  })
})
