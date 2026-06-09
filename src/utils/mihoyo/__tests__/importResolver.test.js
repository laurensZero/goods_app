import { describe, expect, it } from 'vitest'
import {
  addMihoyoImportContextItem,
  applyMihoyoVariantMedia,
  buildMihoyoImportContext,
  resolveMihoyoImportDraft,
  resolveMihoyoVariantDraft,
} from '../importResolver'

describe('mihoyo import resolver', () => {
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
})
