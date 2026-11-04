import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { useBatchImport } from '../useBatchImport'
import { buildMihoyoImportContext } from '@/utils/mihoyo/importResolver'

const mocks = vi.hoisted(() => ({
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
  parseMihoyoUrl: vi.fn(),
  isMihoyoGiftUrl: vi.fn(() => false),
  fetchGoodsDetail: vi.fn(),
  parseCategoryFromName: vi.fn(() => ''),
  cleanGoodsName: (value) => String(value || '').trim(),
  parseTitleIpName: (value) => ({ ip: '', name: String(value || '').trim() }),
}))

vi.mock('@/utils/routeTransition', () => ({
  runWithTransition: vi.fn(),
  runWithRouteTransition: vi.fn(),
}))

function createBatchImport(context) {
  return useBatchImport({
    urlInput: ref(''),
    urlInputRef: ref(null),
    syncUrlInput: () => {},
    isWishlistMode: ref(false),
    ensureHistoricalTagContext: () => context,
    updateHistoricalTagContextFromItem: vi.fn(),
    getSearchContext: () => ({ hint: '', preferredCharacter: '' }),
    getDeckEl: () => null,
  })
}

const NAME = '三明治香气的梦想系列 Q版mini立牌'

describe('米游铺导入：角色按名称 + SKU 综合判断，手动修改不被自动识别覆盖', () => {
  beforeEach(() => {
    mocks.addGoodsBatch.mockReset()
    mocks.addGoodsBatch.mockResolvedValue(undefined)
  })

  function createContext() {
    return buildMihoyoImportContext({
      presetCharacters: [
        { name: '三明治', ip: '测试IP' },
        { name: '阿尔法', ip: '测试IP' },
        { name: '贝塔', ip: '测试IP' },
      ],
      categories: ['立牌'],
      ips: ['测试IP'],
    })
  }

  it('SKU 里写的角色优先于标题里的系列词', async () => {
    const bi = createBatchImport(createContext())
    const entry = bi.enqueueFromSearch({ goodsId: '1001', name: NAME, coverUrl: 'https://cover.jpg' })
    const variants = [{ key: 'a', text: '阿尔法', cover_url: 'https://a.jpg' }]
    entry.variants = variants
    entry.variantsLoaded = true

    bi.setEntrySkus(entry, variants)
    expect(entry.info.characters).toEqual(['阿尔法'])
  })

  it('手动改过角色后保存，不再被款式自动识别结果覆盖', async () => {
    const bi = createBatchImport(createContext())
    const entry = bi.enqueueFromSearch({ goodsId: '1001', name: NAME, coverUrl: 'https://cover.jpg' })
    const variants = [{ key: 'a', text: '阿尔法', cover_url: 'https://a.jpg' }]
    entry.variants = variants
    entry.variantsLoaded = true

    bi.setEntrySkus(entry, variants)
    expect(entry.info.characters).toEqual(['阿尔法'])

    bi.setEntryCharacters(entry, ['贝塔'])
    await bi.confirmImportQueue()

    const rows = mocks.addGoodsBatch.mock.calls[0][0]
    expect(rows).toHaveLength(1)
    expect(rows[0].characters).toEqual(['贝塔'])
  })

  it('重新确认同一款式时，不覆盖手动改过的角色', () => {
    const bi = createBatchImport(createContext())
    const entry = bi.enqueueFromSearch({ goodsId: '1001', name: NAME, coverUrl: 'https://cover.jpg' })
    const variants = [{ key: 'a', text: '阿尔法', cover_url: 'https://a.jpg' }]
    entry.variants = variants
    entry.variantsLoaded = true

    bi.setEntrySkus(entry, variants)
    bi.setEntryCharacters(entry, ['贝塔'])
    bi.setEntrySkus(entry, variants)

    expect(entry.info.characters).toEqual(['贝塔'])
  })

  it('未手动修改时仍按款式自动识别的角色入库', async () => {
    const bi = createBatchImport(createContext())
    const entry = bi.enqueueFromSearch({ goodsId: '1001', name: NAME, coverUrl: 'https://cover.jpg' })
    const variants = [{ key: 'a', text: '阿尔法', cover_url: 'https://a.jpg' }]
    entry.variants = variants
    entry.variantsLoaded = true

    bi.setEntrySkus(entry, variants)
    await bi.confirmImportQueue()

    const rows = mocks.addGoodsBatch.mock.calls[0][0]
    expect(rows[0].characters).toEqual(['阿尔法'])
  })
})
