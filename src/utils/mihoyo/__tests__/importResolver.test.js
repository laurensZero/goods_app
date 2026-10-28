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

  it('recognizes apparel words and does not treat 亚克力 as a category', () => {
    expect(parseCategoryFromName('角色印象系列丝巾')).toBe('服饰')
    expect(parseCategoryFromName('花绪之约系列亚克力票根')).toBe('')
  })

  it('lets an explicit apparel word beat a learned series keyword', () => {
    const context = buildMihoyoImportContext({
      categories: ['手办', '服饰'],
      learnedCategories: [{ keyword: '角色印象', value: '手办' }],
    })
    const draft = resolveMihoyoImportDraft({ name: '角色印象系列丝巾' }, { context })
    expect(draft.category).toBe('服饰')
  })

  it('does not learn 亚克力 as a category keyword (material, not a category)', () => {
    const context = buildMihoyoImportContext({
      goodsList: [
        { name: '芙宁娜 亚克力立牌', category: '立牌' },
        { name: '流萤 亚克力挂件', category: '挂件' },
      ],
      categories: ['立牌', '挂件', '装饰品'],
    })
    expect(context.learnedCategories).not.toContainEqual({ keyword: '亚克力', value: '立牌' })

    const draft = resolveMihoyoImportDraft({ name: '花绪之约系列亚克力票根' }, { context })
    expect(draft.category).toBe('')
  })

  it('learns a user-created 装饰品 category for 票根 goods', () => {
    const context = buildMihoyoImportContext({
      goodsList: [
        { name: '花绪之约系列亚克力票根', category: '装饰品' },
        { name: '花绪之约系列票根', category: '装饰品' },
      ],
      categories: ['立牌', '装饰品'],
    })
    expect(context.learnedCategories).toContainEqual({ keyword: '票根', value: '装饰品' })

    const draft = resolveMihoyoImportDraft({ name: '花绪之约系列亚克力票根' }, { context })
    expect(draft.category).toBe('装饰品')

    const variantDraft = resolveMihoyoVariantDraft({
      name: '花绪之约系列亚克力票根',
      variant: { text: '票根' },
      context,
    })
    expect(variantDraft.category).toBe('装饰品')
  })

  it('falls back to the most similar stored goods for a newly seen type word', () => {
    const context = buildMihoyoImportContext({
      goodsList: [
        { id: 'p1', name: '花绪之约系列亚克力票根', category: '装饰品' },
        { id: 'p2', name: '花绪之约系列亚克力立牌', category: '立牌' },
        { id: 'p3', name: '花绪之约系列亚克力挂件', category: '挂件' },
      ],
      categories: ['立牌', '挂件', '装饰品'],
    })

    // 「票根」只出现过 1 次，学习词不会学；规则里也没有「票根」。
    // 这里靠相似商品兜底：一次人工归类就应该让下一次识别生效。
    const draft = resolveMihoyoImportDraft({ name: '花绪之约系列亚克力票根 第二弹' }, { context })
    expect(draft.category).toBe('装饰品')

    const variantDraft = resolveMihoyoVariantDraft({
      name: '花绪之约系列亚克力票根',
      variant: { text: '第二弹' },
      context,
    })
    expect(variantDraft.category).toBe('装饰品')
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

  it('does not turn merchandise SKU text into a character (毛巾 / 闪卡)', () => {
    const context = buildMihoyoImportContext({
      presetCharacters: [{ name: '兹白', ip: '原神' }],
      categories: ['卡片'],
      ips: ['原神'],
    })

    // SKU 文案就是品类：选中「毛巾A」不应把「毛巾」当角色，但可从名称匹配到已知角色
    const towel = resolveMihoyoImportDraft({
      name: '原神 兹白 毛巾',
      variant: '毛巾A',
      skuCharacters: ['毛巾'],
      image: 'https://example.com/a.png',
    }, { context, preferredCharacter: '毛巾' })
    expect(towel.characters).toEqual(['兹白'])

    // 店铺把「闪卡」放进名为「角色」的属性组：既不是角色，也应识别为卡片
    const flash = resolveMihoyoImportDraft({
      name: '原神 镭射闪卡',
      variant: '闪卡',
      skuCharacters: ['闪卡'],
      image: 'https://example.com/a.png',
    }, { context })
    expect(flash.characters).toEqual([])
    expect(flash.category).toBe('卡片')
  })

  it('does not turn 品类词+修饰 的款式文案 into a character (上新/导入)', () => {
    const context = buildMihoyoImportContext({
      presetCharacters: [{ name: '铃', ip: '绝区零' }],
      categories: ['海报'],
      ips: ['绝区零', '崩坏：星穹铁道'],
    })

    const cases = [
      { ip: '崩坏：星穹铁道', text: '盲袋' },
      { ip: '绝区零', text: 'Q版应援扇' },
      { ip: '绝区零', text: 'Q版贴纸' },
      { ip: '绝区零', text: '印花毛巾' },
      { ip: '绝区零', text: '妄想天使' },
      { ip: '绝区零', text: '应援棒' },
      { ip: '绝区零', text: '装饰海报' },
    ]

    for (const { ip, text } of cases) {
      const draft = resolveMihoyoImportDraft({
        name: `${ip} ${text}`,
        ip,
        variant: text,
        image: 'https://example.com/a.png',
        skuCharacters: [text],
        variants: [{ text, key: 'k' }],
      }, { context, preferredCharacter: text })
      expect(draft.characters).toEqual([])
    }
  })

  it('auto-matches a known character from shared context (上新加入心愿单的行为)', () => {
    const context = buildMihoyoImportContext({
      presetCharacters: [{ name: '兹白', ip: '原神' }],
      categories: ['立牌'],
      ips: ['原神'],
    })

    // 传入上下文（与导入 / 编辑页的智能建议同源）→ 自动匹配到已知角色
    const withContext = resolveMihoyoImportDraft({
      name: '原神 兹白 立牌',
      image: 'https://example.com/a.png',
    }, { context })
    expect(withContext.characters).toEqual(['兹白'])

    // 没有上下文时无法匹配到动态角色池（修复前上新加入心愿单即为此路径）
    const withoutContext = resolveMihoyoImportDraft({
      name: '原神 兹白 立牌',
      image: 'https://example.com/a.png',
    })
    expect(withoutContext.characters).toEqual([])
  })
})
