import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  fetchGoodsDetail: vi.fn(),
}))

vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useI18n: () => ({ t: (key) => key }),
  }
})

vi.mock('@/utils/mihoyo/index', () => ({
  fetchGoodsDetail: mocks.fetchGoodsDetail,
}))

import { useMihoyoGoodsQueue } from '../useMihoyoGoodsQueue'

describe('useMihoyoGoodsQueue（有货监控 / 米游铺批量导入共用队列逻辑）', () => {
  beforeEach(() => {
    mocks.fetchGoodsDetail.mockReset()
  })

  it('enqueueGoods 入队并激活当前项', () => {
    const q = useMihoyoGoodsQueue({ hint: () => '' })
    q.enqueueGoods({ goodsId: '1001', name: '测试商品' }, { load: false })

    expect(q.queue.value).toHaveLength(1)
    expect(q.activeUid.value).toBe(q.queue.value[0].uid)
    expect(q.queue.value[0].goodsId).toBe('1001')
    expect(q.queue.value[0].name).toBe('测试商品')
  })

  it('预置变体入队：映射 cover/price、标记已加载，且不请求详情接口', () => {
    const q = useMihoyoGoodsQueue({ hint: () => '' })
    q.enqueueGoods(
      { goodsId: '1001', name: '测试商品' },
      {
        load: true,
        variants: [
          { key: 'a', text: '款A', cover_url: 'https://a.jpg', price: 12.5 },
          { key: 'b', text: '款B', img_url: 'https://b.jpg' },
        ],
      }
    )

    const entry = q.queue.value[0]
    expect(entry.variantsLoaded).toBe(true)
    expect(entry.variants).toEqual([
      { text: '款A', key: 'a', cover_url: 'https://a.jpg', price: 12.5 },
      { text: '款B', key: 'b', cover_url: 'https://b.jpg', price: null },
    ])
    expect(mocks.fetchGoodsDetail).not.toHaveBeenCalled()
  })

  it('自动选款：仅一个款式时直接选中', () => {
    const q = useMihoyoGoodsQueue({ hint: () => '' })
    q.enqueueGoods({ goodsId: '1', name: 'x' }, { load: false, variants: [{ key: 'a', text: '默认款' }] })

    expect(q.queue.value[0].selectedSkus.map((s) => s.key)).toEqual(['a'])
  })

  it('自动选款：搜索角色/关键词唯一命中时自动选中该款式', () => {
    const q = useMihoyoGoodsQueue({ hint: () => '芙宁娜' })
    q.enqueueGoods(
      { goodsId: '2', name: 'x' },
      {
        load: false,
        variants: [
          { key: 'a', text: '芙宁娜 立牌' },
          { key: 'b', text: '其他角色 立牌' },
        ],
      }
    )

    expect(q.queue.value[0].selectedSkus.map((s) => s.key)).toEqual(['a'])
    // 命中后收起选择器
    expect(q.queue.value[0].expanded).toBe(false)
  })

  it('自动选款：未命中时不选中并展开选择器', () => {
    const q = useMihoyoGoodsQueue({ hint: () => '不存在' })
    q.enqueueGoods(
      { goodsId: '3', name: 'x' },
      { load: false, variants: [{ key: 'a', text: '款A' }, { key: 'b', text: '款B' }] }
    )

    expect(q.queue.value[0].selectedSkus).toHaveLength(0)
    expect(q.queue.value[0].expanded).toBe(true)
  })

  it('selectSku 多选/取消切换；selectWholeGoods 清空为整件', () => {
    const q = useMihoyoGoodsQueue({ hint: () => '' })
    q.enqueueGoods(
      { goodsId: '4', name: 'x' },
      { load: false, variants: [{ key: 'a', text: 'A' }, { key: 'b', text: 'B' }] }
    )
    const entry = q.queue.value[0]

    q.selectSku(entry, { key: 'a', text: 'A' })
    q.selectSku(entry, { key: 'b', text: 'B' })
    expect(entry.selectedSkus.map((s) => s.key)).toEqual(['a', 'b'])

    q.selectSku(entry, { key: 'a', text: 'A' })
    expect(entry.selectedSkus.map((s) => s.key)).toEqual(['b'])

    q.selectWholeGoods(entry)
    expect(entry.selectedSkus).toHaveLength(0)
  })

  it('onSkuSelected 在自动选中与手动选中款式时触发', () => {
    const onSkuSelected = vi.fn()
    const q = useMihoyoGoodsQueue({ hint: () => '角色A', onSkuSelected })
    q.enqueueGoods(
      { goodsId: '5', name: 'x' },
      {
        load: false,
        variants: [
          { key: 'a', text: '角色A 立牌' },
          { key: 'b', text: '角色B 立牌' },
        ],
      }
    )
    expect(onSkuSelected).toHaveBeenCalledTimes(1)

    q.selectSku(q.queue.value[0], { key: 'b', text: '角色B 立牌' })
    expect(onSkuSelected).toHaveBeenCalledTimes(2)
  })

  it('loadEntryVariants 拉取变体、自动选款并标记加载完成', async () => {
    mocks.fetchGoodsDetail.mockResolvedValue({
      ok: true,
      skuVariants: [{ key: 's1', text: '款1' }],
      skuCovers: {},
      skuPrices: {},
      coverUrl: '',
    })
    const q = useMihoyoGoodsQueue({ hint: () => '' })
    const entry = q.createQueueEntry({ goodsId: '4004', name: 'x' })
    q.queue.value.push(entry)

    await q.loadEntryVariants(entry)

    expect(mocks.fetchGoodsDetail).toHaveBeenCalledWith('4004')
    expect(entry.variantsLoaded).toBe(true)
    expect(entry.loading).toBe(false)
    expect(entry.selectedSkus.map((s) => s.key)).toEqual(['s1'])
  })

  it('activateQueueEntry 切换激活并懒加载变体', () => {
    mocks.fetchGoodsDetail.mockResolvedValue({ ok: true, skuVariants: [], skuCovers: {}, skuPrices: {}, coverUrl: '' })
    const q = useMihoyoGoodsQueue({ hint: () => '' })
    q.enqueueGoods({ goodsId: '1', name: 'a' }, { load: false })
    q.enqueueGoods({ goodsId: '2', name: 'b' }, { load: false })
    const [e1] = q.queue.value

    q.activateQueueEntry(e1.uid)

    expect(q.activeUid.value).toBe(e1.uid)
    expect(mocks.fetchGoodsDetail).toHaveBeenCalledWith('1')
  })

  it('removeFromQueue 移除激活项后自动切换到相邻项；清空队列', () => {
    const q = useMihoyoGoodsQueue({ hint: () => '' })
    q.enqueueGoods({ goodsId: '1', name: 'a' }, { load: false })
    q.enqueueGoods({ goodsId: '2', name: 'b' }, { load: false })
    const [e1, e2] = q.queue.value
    expect(q.activeUid.value).toBe(e2.uid)

    q.removeFromQueue(e2.uid)
    expect(q.queue.value).toHaveLength(1)
    expect(q.activeUid.value).toBe(e1.uid)

    q.clearQueue()
    expect(q.queue.value).toHaveLength(0)
    expect(q.activeUid.value).toBe('')
  })

  it('isQueued / getQueuedEntry 按 goodsId（兼容 goods_id）判定', () => {
    const q = useMihoyoGoodsQueue({ hint: () => '' })
    q.enqueueGoods({ goodsId: '1001', name: 'x' }, { load: false })

    expect(q.isQueued({ goods_id: '1001' })).toBe(true)
    expect(q.isQueued({ goodsId: '1001' })).toBe(true)
    expect(q.isQueued({ goods_id: '9999' })).toBe(false)
    expect(q.getQueuedEntry({ goods_id: '1001' })?.uid).toBe(q.queue.value[0].uid)
    expect(q.getQueuedEntry({ goods_id: '9999' })).toBeNull()
  })

  it('loadEntryVariants 合并 SKU 专属封面（skuCovers），无专属封面的款式回退商品封面', async () => {
    mocks.fetchGoodsDetail.mockResolvedValue({
      ok: true,
      skuVariants: [{ key: 's1', text: '款1' }, { key: 's2', text: '款2' }],
      skuCovers: { s1: 'https://sku-s1.jpg' },
      skuPrices: {},
      coverUrl: 'https://product.jpg',
    })
    const q = useMihoyoGoodsQueue({ hint: () => '' })
    const entry = q.createQueueEntry({ goodsId: '4005', name: 'x' })
    q.queue.value.push(entry)

    await q.loadEntryVariants(entry)

    expect(entry.variants[0]).toMatchObject({ key: 's1', cover_url: 'https://sku-s1.jpg' })
    expect(entry.variants[1]).toMatchObject({ key: 's2', cover_url: 'https://product.jpg' })
  })
})
