import { describe, it, expect } from 'vitest'
import {
  cleanVariantText,
  extractCharName,
  extractCharsFromVariants,
  isLikelyCharName,
  preserveGenderQualifier,
  displayVariantText,
  normalizeCharacterName
} from '../variantText'

describe('cleanVariantText', () => {
  it('removes 【】brackets', () => {
    expect(cleanVariantText('兹白【预售，5月初】')).toBe('兹白')
  })

  it('removes （）brackets', () => {
    expect(cleanVariantText('兹白（限定）')).toBe('兹白')
  })

  it('removes () brackets', () => {
    expect(cleanVariantText('兹白(限定)')).toBe('兹白')
  })

  it('removes trailing 款', () => {
    expect(cleanVariantText('钒离款')).toBe('钒离')
  })

  it('removes presale info', () => {
    expect(cleanVariantText('兹白预售5月发货')).toBe('兹白')
  })

  it('removes 预计 info', () => {
    expect(cleanVariantText('兹白预计6月')).toBe('兹白')
  })

  it('returns original text when result would be empty', () => {
    expect(cleanVariantText('【预售】')).toBe('【预售】')
  })

  it('handles null', () => {
    expect(cleanVariantText(null)).toBe(null)
  })

  it('handles empty string', () => {
    expect(cleanVariantText('')).toBe('')
  })

  it('preserves 周年 info', () => {
    expect(cleanVariantText('二周年贺图款')).toBe('二周年贺图')
  })
})

describe('extractCharName', () => {
  it('extracts name from bracket text', () => {
    expect(extractCharName('兹白【预售，5月初】')).toBe('兹白')
  })

  it('extracts name with trailing 款', () => {
    expect(extractCharName('钒离款')).toBe('钒离')
  })

  it('removes 周年 prefix', () => {
    expect(extractCharName('二周年贺图')).toBe('贺图')
  })

  it('removes 数字周年 prefix', () => {
    // '限定' is also stripped by the quality prefix regex, so result is null
    expect(extractCharName('3周年兹白')).toBe('兹白')
  })

  it('removes quality prefixes', () => {
    expect(extractCharName('限定兹白')).toBe('兹白')
    expect(extractCharName('特别钒离')).toBe('钒离')
    expect(extractCharName('典藏角色')).toBe('角色')
  })

  it('returns null for empty result', () => {
    expect(extractCharName('【预售】')).toBe(null)
  })

  it('returns null for null input', () => {
    expect(extractCharName(null)).toBe(null)
  })

  it('returns null for empty string', () => {
    expect(extractCharName('')).toBe(null)
  })
})

describe('extractCharsFromVariants', () => {
  it('extracts names from string array', () => {
    expect(extractCharsFromVariants(['兹白【预售】', '钒离款'])).toEqual(['兹白', '钒离'])
  })

  it('extracts names from object array', () => {
    expect(extractCharsFromVariants([{ text: '兹白款' }, { text: '钒离款' }])).toEqual(['兹白', '钒离'])
  })

  it('deduplicates names', () => {
    expect(extractCharsFromVariants(['兹白款', '兹白【限定】'])).toEqual(['兹白'])
  })

  it('filters names shorter than 2 chars', () => {
    expect(extractCharsFromVariants(['A'])).toEqual([])
  })

  it('filters names longer than 8 chars', () => {
    expect(extractCharsFromVariants(['一二三四五六七八九'])).toEqual([])
  })

  it('filters pure english names', () => {
    expect(extractCharsFromVariants(['ABC'])).toEqual([])
  })

  it('returns [] for empty array', () => {
    expect(extractCharsFromVariants([])).toEqual([])
  })

  it('returns [] for null', () => {
    expect(extractCharsFromVariants(null)).toEqual([])
  })
})

describe('isLikelyCharName', () => {
  it('returns true for valid Chinese name', () => {
    expect(isLikelyCharName('兹白')).toBe(true)
  })

  it('returns true for 2-char Chinese name', () => {
    expect(isLikelyCharName('钒离')).toBe(true)
  })

  it('returns false for null', () => {
    expect(isLikelyCharName(null)).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isLikelyCharName('')).toBe(false)
  })

  it('returns false for pure english', () => {
    expect(isLikelyCharName('ABC')).toBe(false)
  })

  it('returns false for numbers', () => {
    expect(isLikelyCharName('2024')).toBe(false)
  })

  it('returns false for year pattern', () => {
    expect(isLikelyCharName('2024年')).toBe(false)
  })

  it('returns false for 周年 pattern', () => {
    expect(isLikelyCharName('2周年')).toBe(false)
  })

  it('returns false for names with NON_CHAR_WORDS', () => {
    expect(isLikelyCharName('贺图兹白')).toBe(false)
    expect(isLikelyCharName('周年限定')).toBe(false)
    expect(isLikelyCharName('全套兹白')).toBe(false)
  })

  it('returns false for too long name', () => {
    expect(isLikelyCharName('一二三四五六七八九')).toBe(false)
  })
})

describe('preserveGenderQualifier', () => {
  it('preserves 男 qualifier', () => {
    expect(preserveGenderQualifier('兹白', '兹白（男）')).toBe('兹白（男）')
  })

  it('preserves 女 qualifier', () => {
    expect(preserveGenderQualifier('兹白', '兹白（女）')).toBe('兹白（女）')
  })

  it('does not duplicate existing qualifier', () => {
    expect(preserveGenderQualifier('兹白（男）', '兹白（男）')).toBe('兹白（男）')
  })

  it('returns base when no qualifier in original', () => {
    expect(preserveGenderQualifier('兹白', '兹白款')).toBe('兹白')
  })

  it('handles null cleaned text', () => {
    expect(preserveGenderQualifier(null, '兹白（男）')).toBe('兹白（男）')
  })
})

describe('displayVariantText', () => {
  it('cleans and preserves gender', () => {
    expect(displayVariantText('兹白款（男）')).toBe('兹白（男）')
  })

  it('cleans without gender', () => {
    expect(displayVariantText('兹白款')).toBe('兹白')
  })
})

describe('normalizeCharacterName', () => {
  it('removes trailing letter suffix', () => {
    expect(normalizeCharacterName('兹白 A')).toBe('兹白')
  })

  it('cleans and normalizes', () => {
    expect(normalizeCharacterName('兹白款')).toBe('兹白')
  })
})
