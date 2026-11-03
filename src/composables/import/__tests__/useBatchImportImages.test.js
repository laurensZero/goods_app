import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { useBatchImport } from '../useBatchImport'

const mocks = vi.hoisted(() => ({
  parseMihoyoUrl: vi.fn(),
  fetchGoodsDetail: vi.fn(),
  addGoodsBatch: vi.fn(),
}))

vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useI18n: () => ({ t: (key) => key }),
  }
})

vi.mock('vue-router', () => ({
  useRouter: () => ({ replace: vi.fn() }),
}))

vi.mock('@/stores/goods', () => ({
  useGoodsStore: () => ({
    list: [],
    characterCountMap: new Map(),
    addGoodsBatch: mocks.addGoodsBatch,
  }),
}))

vi.mock('@/stores/presets', () => ({
  usePresetsStore: () => ({
    categories: [],
    ips: [],
    characters: [],
    addCategory: vi.fn(),
    addIp: vi.fn(),
    addCharacter: vi.fn(),
  }),
}))

vi.mock('@/utils/mihoyo/index', () => ({
  parseMihoyoUrl: mocks.parseMihoyoUrl,
  isMihoyoGiftUrl: vi.fn((url) => /mihoyogift\.com/.test(String(url || ''))),
  fetchGoodsDetail: mocks.fetchGoodsDetail,
  // importResolver 会从该模块引入 parseCategoryFromName，测试里返回空即可
  parseCategoryFromName: vi.fn(() => ''),
  cleanGoodsName: (value) => String(value || '').trim(),
  parseTitleIpName: (value) => ({ ip: '', name: String(value || '').trim() }),
}))

vi.mock('@/utils/routeTransition', () => ({
  runWithRouteTransition: vi.fn(),
}))

function createBatchImport(overrides = {}) {
  return useBatchImport({
    urlInput: ref(''),
    urlInputRef: ref(null),
    syncUrlInput: () => {},
    isWishlistMode: ref(false),
    ensureHistoricalTagContext: () => ({ categories: [], ips: [], characters: {}, tags: [] }),
    updateHistoricalTagContextFromItem: vi.fn(),
    getSearchContext: () => ({ hint: '', preferredCharacter: '' }),
    getDeckEl: () => null,
    ...overrides,
  })
}

describe('useBatchImport 图片联动：选中带专属封面的款式后，不再多存一张「商品默认图」', () => {
  beforeEach(() => {
    mocks.parseMihoyoUrl.mockReset()
    mocks.fetchGoodsDetail.mockReset()
    mocks.addGoodsBatch.mockReset()
    mocks.addGoodsBatch.mockResolvedValue(undefined)
  })

  it('搜索入队默认勾选商品默认图；选中带专属封面的款式后取消勾选并切换主图为 SKU 图', () => {
    const bi = createBatchImport()
    bi.enqueueFromSearch({
      goodsId: '1001',
      name: '芙宁娜 立牌',
      priceCents: 8800,
      coverUrl: 'https://cover.jpg',
    })
    const entry = bi.queue.value[0]
    expect(entry.info.images).toEqual(['https://cover.jpg'])
    expect(entry.info.image).toBe('https://cover.jpg')

    bi.selectSingleSku(entry, { key: 'a', text: '芙宁娜 立牌', cover_url: 'https://sku-a.jpg' })
    expect(entry.selectedSkus.map((s) => s.key)).toEqual(['a'])
    expect(entry.info.images).toEqual([])
    expect(entry.info.image).toBe('https://sku-a.jpg')
  })

  it('再点同一款式回到整件：恢复商品默认图', () => {
    const bi = createBatchImport()
    bi.enqueueFromSearch({ goodsId: '1001', name: 'x', coverUrl: 'https://cover.jpg' })
    const entry = bi.queue.value[0]

    bi.selectSingleSku(entry, { key: 'a', text: '款A', cover_url: 'https://sku-a.jpg' })
    bi.selectSingleSku(entry, { key: 'a', text: '款A', cover_url: 'https://sku-a.jpg' })
    expect(entry.selectedSkus).toHaveLength(0)
    expect(entry.info.images).toEqual(['https://cover.jpg'])
    expect(entry.info.image).toBe('https://cover.jpg')
  })

  it('点「整件商品」按钮同样恢复默认图', () => {
    const bi = createBatchImport()
    bi.enqueueFromSearch({ goodsId: '1001', name: 'x', coverUrl: 'https://cover.jpg' })
    const entry = bi.queue.value[0]

    bi.selectSingleSku(entry, { key: 'a', text: '款A', cover_url: 'https://sku-a.jpg' })
    bi.selectWholeGoods(entry)
    expect(entry.selectedSkus).toHaveLength(0)
    expect(entry.info.images).toEqual(['https://cover.jpg'])
    expect(entry.info.image).toBe('https://cover.jpg')
  })

  it('款式没有专属封面时保留默认图（没有可替换的 SKU 图）', () => {
    const bi = createBatchImport()
    bi.enqueueFromSearch({ goodsId: '1001', name: 'x', coverUrl: 'https://cover.jpg' })
    const entry = bi.queue.value[0]

    bi.selectSingleSku(entry, { key: 'b', text: '款B', cover_url: '' })
    expect(entry.selectedSkus.map((s) => s.key)).toEqual(['b'])
    expect(entry.info.images).toEqual(['https://cover.jpg'])
    expect(entry.info.image).toBe('https://cover.jpg')
  })

  it('用户手动多选了其它图时保留原选择（不覆盖用户的勾选）', () => {
    const bi = createBatchImport()
    bi.enqueueFromSearch({ goodsId: '1001', name: 'x', coverUrl: 'https://cover.jpg' })
    const entry = bi.queue.value[0]

    bi.toggleQueueImage(entry, 'https://img2.jpg')
    expect(entry.info.images).toEqual(['https://cover.jpg', 'https://img2.jpg'])

    bi.selectSingleSku(entry, { key: 'a', text: '款A', cover_url: 'https://sku-a.jpg' })
    expect(entry.info.images).toEqual(['https://cover.jpg', 'https://img2.jpg'])
  })

  it('链接解析自动选款：默认图取消勾选，确认导入后入库图片只有 SKU 专属图', async () => {
    mocks.parseMihoyoUrl.mockResolvedValue({
      goodsId: '3003',
      name: '芙宁娜 亚克力立牌',
      image: 'https://cover3.jpg',
      coverImage: 'https://cover3.jpg',
      price: '66',
      variants: [{ key: 'a', text: '芙宁娜 亚克力立牌', img_url: 'https://img-a.jpg' }],
    })
    mocks.fetchGoodsDetail.mockResolvedValue({
      ok: true,
      skuVariants: [{ key: 'a', text: '芙宁娜 亚克力立牌' }],
      skuCovers: { a: 'https://sku-a-cover.jpg' },
      skuPrices: {},
      coverUrl: 'https://cover3.jpg',
    })

    const urlInput = ref('https://www.mihoyogift.com/goods/3003')
    const bi = createBatchImport({ urlInput })
    await bi.handleBatchImport()

    expect(bi.queue.value).toHaveLength(1)
    const entry = bi.queue.value[0]
    expect(entry.coverUrl).toBe('https://cover3.jpg')
    expect(entry.selectedSkus.map((s) => s.key)).toEqual(['a'])
    expect(entry.info.images).toEqual([])
    expect(entry.info.image).toBe('https://sku-a-cover.jpg')

    await bi.confirmImportQueue()
    expect(mocks.addGoodsBatch).toHaveBeenCalledTimes(1)
    const rows = mocks.addGoodsBatch.mock.calls[0][0]
    expect(rows).toHaveLength(1)
    expect(rows[0].image).toBe('https://sku-a-cover.jpg')
    expect(rows[0].images).toEqual(['https://sku-a-cover.jpg'])
  })
})

describe('多选款式拆分为独立队列项（复用链接导入的队列结构）', () => {
  beforeEach(() => {
    mocks.parseMihoyoUrl.mockReset()
    mocks.fetchGoodsDetail.mockReset()
    mocks.addGoodsBatch.mockReset()
    mocks.addGoodsBatch.mockResolvedValue(undefined)
  })

  it('每个款式成为一张独立卡片，可分别改信息并各自入库', async () => {
    const bi = createBatchImport()
    const entry = bi.enqueueFromSearch({
      goodsId: '1001',
      name: '测试商品',
      coverUrl: 'https://cover.jpg',
    })
    const variants = [
      { key: 'a', text: '芙宁娜', cover_url: 'https://a.jpg', price: 10 },
      { key: 'b', text: '胡桃', cover_url: 'https://b.jpg', price: 20 },
    ]
    entry.variants = variants
    entry.variantsLoaded = true

    bi.setEntrySkus(entry, variants)
    expect(entry.selectedSkus).toHaveLength(2)

    bi.splitEntrySkus(entry)

    expect(bi.queue.value).toHaveLength(2)
    expect(bi.queue.value.map((e) => e.selectedSkus[0].text)).toEqual(['芙宁娜', '胡桃'])
    expect(bi.queue.value.every((e) => e.skuLocked)).toBe(true)

    const [first, second] = bi.queue.value
    first.name = '芙宁娜款'
    second.name = '胡桃款'
    first.info.characters = ['芙宁娜']
    second.info.characters = ['胡桃']
    expect(first.name).toBe('芙宁娜款')
    expect(second.name).toBe('胡桃款')

    await bi.confirmImportQueue()
    const rows = mocks.addGoodsBatch.mock.calls[0][0]
    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.variant === '芙宁娜')).toMatchObject({
      name: '芙宁娜款',
      characters: ['芙宁娜'],
      image: 'https://a.jpg',
      price: 10,
    })
    expect(rows.find((r) => r.variant === '胡桃')).toMatchObject({
      name: '胡桃款',
      characters: ['胡桃'],
      image: 'https://b.jpg',
      price: 20,
    })
  })
})
