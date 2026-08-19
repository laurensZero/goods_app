import { describe, expect, it } from 'vitest'
import {
  addMihoyoImportContextItem,
  applyMihoyoVariantMedia,
  buildMihoyoImportContext,
  resolveMihoyoImportDraft,
  resolveMihoyoVariantDraft,
} from '../importResolver'
import { parseCategoryFromName } from '../index'

describe('mihoyo import resolver', () => {
  it('distinguishes acrylic pendants from acrylic standees', () => {
    expect(parseCategoryFromName('流萤 亚克力挂件')).toBe('挂件')
    expect(parseCategoryFromName('流萤 亚克力立牌')).toBe('立牌')
  })

  it('selects only the first image by default while keeping all candidates', () => {
    const draft = resolveMihoyoImportDraft({
      name: '原神 角色徽章',
      image: 'https://example.com/a.png?x-oss-process=image/resize',
      banners: ['https://example.com/b.png', 'https://example.com/c.png'],
      price: 12,
    })

    expect(draft.images).toEqual(['https://example.com/a.png'])
    expect(draft.image).toBe('https://example.com/a.png')
    expect(draft.baseParsedImages).toEqual([
      'https://example.com/a.png',
      'https://example.com/b.png',
      'https://example.com/c.png',
    ])
  })

  it('selects only the sku image when a variant has media', () => {
    const media = applyMihoyoVariantMedia(
      { cover_url: 'https://example.com/sku.png?size=small', price: 18 },
      ['https://example.com/main.png', 'https://example.com/other.png'],
      ''
    )

    expect(media.images).toEqual(['https://example.com/sku.png'])
    expect(media.image).toBe('https://example.com/sku.png')
    expect(media.parsedImages).toEqual([
      'https://example.com/sku.png',
      'https://example.com/main.png',
      'https://example.com/other.png',
    ])
    expect(media.price).toBe(18)
  })

  it('does not keep category names as characters after category resolution', () => {
    const draft = resolveMihoyoImportDraft({
      name: '原神 徽章',
      variant: '徽章',
      characters: ['徽章'],
      image: 'https://example.com/a.png',
    })

    expect(draft.category).toBe('徽章')
    expect(draft.characters).toEqual([])
  })

  it('does not infer a variant category as selected character', () => {
    const resolved = resolveMihoyoVariantDraft({
      name: '原神 周边',
      variant: { text: '立牌款' },
      context: buildMihoyoImportContext(),
    })

    expect(resolved.category).toBe('立牌')
    expect(resolved.selectedCharacterName).toBe('')
  })

  it('filters category names when adding items to shared import context', () => {
    const context = buildMihoyoImportContext({
      goodsList: [{ ip: '原神', category: '卡片', characters: ['卡片', '芙宁娜'] }],
      categories: ['卡片'],
      ips: ['原神'],
    })

    addMihoyoImportContextItem(context, {
      ip: '原神',
      category: '立牌',
      characters: ['立牌', '流萤'],
    })

    expect(context.characters['原神']).toEqual(['芙宁娜', '流萤'])
    expect(context.categories).toEqual(['卡片', '立牌'])
  })

  it('does not match a one-character role from inside a product word', () => {
    const context = buildMihoyoImportContext({
      presetCharacters: [{ name: '空', ip: '原神' }],
      categories: ['色纸'],
      ips: ['原神'],
    })
    const draft = resolveMihoyoImportDraft({
      name: '虚空劫灰往事书系列周边 Genshin',
      variant: '色纸',
      image: 'https://example.com/a.png',
    }, { context })

    expect(draft.ip).toBe('原神')
    expect(draft.category).toBe('色纸')
    expect(draft.characters).toEqual([])
  })

  it('keeps a one-character role when it is explicit data', () => {
    const draft = resolveMihoyoImportDraft({
      name: '原神 旅行者周边',
      variant: '色纸',
      characters: ['空'],
      image: 'https://example.com/a.png',
    })

    expect(draft.characters).toEqual(['空'])
  })

  it('uses a learned category keyword from stored goods for import category fallback', () => {
    const context = buildMihoyoImportContext({
      goodsList: [
        { name: '芙宁娜 胶片卡', category: '卡片' },
        { name: '娜维娅 胶片卡', category: '卡片' },
      ],
      categories: ['卡片', '立牌'],
      presetCharacters: [
        { name: '芙宁娜', ip: '原神' },
        { name: '娜维娅', ip: '原神' },
      ],
    })
    expect(context.learnedCategories).toContainEqual({ keyword: '胶片卡', value: '卡片' })

    const draft = resolveMihoyoImportDraft({
      name: '测试 胶片卡 随机',
      image: 'https://example.com/a.png',
    }, { context })
    expect(draft.category).toBe('卡片')
  })

  it('resolves a 胶片卡 import to 卡片 with a 4-vs-3 goods base (no character pollution)', () => {
    // 贴近用户真实库存：4 条胶片卡→卡片，3 条→满赠，1 条未分类，另有正常商品/角色
    const goodsList = [
      { name: '满赠 胶片卡', category: '满赠' },
      { name: '满赠 胶片卡', category: '满赠' },
      { name: '满赠 胶片卡', category: '满赠' },
      { name: '芙宁娜 胶片卡', category: '卡片' },
      { name: '芙宁娜 胶片卡', category: '卡片' },
      { name: '娜维娅 胶片卡', category: '卡片' },
      { name: '温迪 胶片卡', category: '卡片' },
      { name: '散装 胶片卡', category: '' },
      { name: '芙宁娜 立牌', category: '立牌' },
    ]
    const presetCharacters = [
      { name: '芙宁娜', ip: '原神' },
      { name: '娜维娅', ip: '原神' },
      { name: '温迪', ip: '原神' },
    ]
    const context = buildMihoyoImportContext({
      goodsList,
      presetCharacters,
      categories: ['卡片', '满赠', '立牌'],
    })
    expect(context.learnedCategories).toContainEqual({ keyword: '胶片卡', value: '卡片' })

    // SKU 里把「胶片卡」放在名为「角色」的属性组中（店铺数据如此）
    const draft = resolveMihoyoImportDraft({
      name: '原神 芙宁娜 胶片卡',
      skuCharacters: ['胶片卡'],
      image: 'https://example.com/a.png',
    }, { context })
    expect(draft.category).toBe('卡片')
    expect(draft.characters).not.toContain('胶片卡')

    // 款式（SKU）选择路径同样识别为卡片
    const variantDraft = resolveMihoyoVariantDraft({
      name: '原神 芙宁娜 胶片卡',
      variant: { text: '胶片卡', key: '1', price: 500 },
      context,
    })
    expect(variantDraft.category).toBe('卡片')
    expect(variantDraft.selectedCharacterName).not.toBe('胶片卡')
  })

  it('drops a learned category keyword from characters during import', () => {
    const context = buildMihoyoImportContext({
      goodsList: [
        { name: '烫金卡', category: '卡片' },
        { name: '烫金卡', category: '卡片' },
      ],
      categories: ['卡片', '立牌'],
    })
    expect(context.learnedCategories).toContainEqual({ keyword: '烫金卡', value: '卡片' })

    // SKU 中把「烫金卡」误标成角色：既然它是学到的分类关键词，就不应被当作角色
    const draft = resolveMihoyoImportDraft({
      name: '测试 烫金卡',
      skuCharacters: ['烫金卡'],
      image: 'https://example.com/a.png',
    }, { context })
    expect(draft.characters).toEqual([])
    expect(draft.category).toBe('卡片')
  })
})
