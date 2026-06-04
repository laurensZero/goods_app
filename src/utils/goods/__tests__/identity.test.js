vi.mock('@/utils/goods/images', () => ({
  getPrimaryGoodsImageUrl: vi.fn(() => '')
}))

import { describe, it, expect } from 'vitest'
import {
  normalizeGoodsName,
  normalizeGoodsVariant,
  extractVariantFromNote,
  stripVariantFromNote,
  buildNoteWithVariant,
  buildGoodsIdentityAliases,
  getGoodsVariant
} from '../identity'

describe('normalizeGoodsName', () => {
  it('trims whitespace', () => {
    expect(normalizeGoodsName('  hello  ')).toBe('hello')
  })

  it('returns empty for null', () => {
    expect(normalizeGoodsName(null)).toBe('')
  })

  it('returns empty for undefined', () => {
    expect(normalizeGoodsName(undefined)).toBe('')
  })

  it('returns empty for empty string', () => {
    expect(normalizeGoodsName('')).toBe('')
  })
})

describe('normalizeGoodsVariant', () => {
  it('strips presale markers in brackets', () => {
    expect(normalizeGoodsVariant('兹白【预售5月】')).toBe('兹白')
  })

  it('strips presale trailing notes', () => {
    expect(normalizeGoodsVariant('兹白,预售5月')).toBe('兹白')
  })

  it('preserves non-sale bracket content', () => {
    expect(normalizeGoodsVariant('兹白（男）')).toBe('兹白（男）')
  })

  it('strips sale segments from slash-separated values', () => {
    // Both '现货' and '预售' are sale keywords, result is empty
    expect(normalizeGoodsVariant('现货/预售')).toBe('')
  })

  it('returns empty for null', () => {
    expect(normalizeGoodsVariant(null)).toBe('')
  })

  it('returns empty for empty string', () => {
    expect(normalizeGoodsVariant('')).toBe('')
  })

  it('trims and cleans', () => {
    expect(normalizeGoodsVariant('  兹白  ')).toBe('兹白')
  })
})

describe('extractVariantFromNote', () => {
  it('extracts variant from note with 款式:', () => {
    expect(extractVariantFromNote('款式：兹白\n其他内容')).toBe('兹白')
  })

  it('extracts variant with 款式：(full-width colon)', () => {
    // extractVariantFromNote normalizes but does not strip trailing 款
    expect(extractVariantFromNote('款式：兹白款')).toBe('兹白款')
  })

  it('returns empty when no variant line', () => {
    expect(extractVariantFromNote('普通备注')).toBe('')
  })

  it('returns empty for null', () => {
    expect(extractVariantFromNote(null)).toBe('')
  })

  it('handles variant at start of note', () => {
    expect(extractVariantFromNote('款式：兹白')).toBe('兹白')
  })
})

describe('stripVariantFromNote', () => {
  it('removes variant line from note', () => {
    expect(stripVariantFromNote('款式：兹白\n其他内容')).toBe('其他内容')
  })

  it('returns empty when only variant', () => {
    expect(stripVariantFromNote('款式：兹白')).toBe('')
  })

  it('preserves non-variant content', () => {
    expect(stripVariantFromNote('普通备注')).toBe('普通备注')
  })

  it('returns empty for null', () => {
    expect(stripVariantFromNote(null)).toBe('')
  })
})

describe('buildNoteWithVariant', () => {
  it('prepends variant to note', () => {
    expect(buildNoteWithVariant('备注内容', '兹白')).toBe('款式：兹白\n备注内容')
  })

  it('returns only variant when note is empty', () => {
    expect(buildNoteWithVariant('', '兹白')).toBe('款式：兹白')
  })

  it('returns only note when variant is empty', () => {
    expect(buildNoteWithVariant('备注内容', '')).toBe('备注内容')
  })

  it('returns empty when both are empty', () => {
    expect(buildNoteWithVariant('', '')).toBe('')
  })

  it('cleans variant (removes presale markers)', () => {
    expect(buildNoteWithVariant('备注', '兹白【预售】')).toBe('款式：兹白\n备注')
  })
})

describe('getGoodsVariant', () => {
  it('returns explicit variant', () => {
    expect(getGoodsVariant({ variant: '兹白' })).toBe('兹白')
  })

  it('falls back to style field', () => {
    expect(getGoodsVariant({ style: '钒离' })).toBe('钒离')
  })

  it('extracts from note when no explicit variant', () => {
    expect(getGoodsVariant({ note: '款式：兹白' })).toBe('兹白')
  })

  it('falls back to characters array', () => {
    expect(getGoodsVariant({ characters: ['B', 'A'] })).toBe('A,B')
  })

  it('returns empty when nothing available', () => {
    expect(getGoodsVariant({})).toBe('')
  })

  it('returns empty for null', () => {
    expect(getGoodsVariant(null)).toBe('')
  })
})

describe('buildGoodsIdentityAliases', () => {
  it('matches full imported name against base name plus variant', () => {
    const imported = {
      name: '女生宿舍系列拍立得套组',
      variant: '流萤款A'
    }

    expect(buildGoodsIdentityAliases(imported)).toContain('女生宿舍系列拍立得套组-流萤款A||')
  })

  it('adds exact name alias for image-keyed goods without variant', () => {
    const existing = {
      name: '女生宿舍系列拍立得套组-流萤款A',
      coverImage: 'https://example.com/a.jpg'
    }

    expect(buildGoodsIdentityAliases(existing)).toContain('女生宿舍系列拍立得套组-流萤款A||')
  })

  it('matches duplicate full name plus variant against exact full name', () => {
    const imported = {
      name: '女生宿舍系列拍立得套组-流萤款A',
      variant: '流萤款A'
    }

    expect(buildGoodsIdentityAliases(imported)).toContain('女生宿舍系列拍立得套组-流萤款A||')
  })

  it('matches character-prefixed name against exact full name', () => {
    const imported = {
      name: '知更鸟系列Q版立绘马口铁徽章',
      characters: ['知更鸟']
    }

    expect(buildGoodsIdentityAliases(imported)).toContain('知更鸟系列Q版立绘马口铁徽章||')
  })
})
