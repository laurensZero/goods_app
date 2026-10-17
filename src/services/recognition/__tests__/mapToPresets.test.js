import { describe, it, expect, beforeAll } from 'vitest'
import { ensurePinyin } from '@/utils/pinyin'
import {
  normalizeVocabText,
  matchVocabulary,
  mapFieldToPresets,
  buildVocabulary,
  vocabularyTexts
} from '../mapToPresets'

beforeAll(async () => {
  // 拼音匹配依赖 pinyin-pro 已加载（生产路径里由 recognizeImage 预热）
  await ensurePinyin()
})

describe('normalizeVocabText', () => {
  it('去空白并小写', () => {
    expect(normalizeVocabText(' 初音 未来 ')).toBe('初音未来')
    expect(normalizeVocabText('VOCALOID')).toBe('vocaloid')
    expect(normalizeVocabText(null)).toBe('')
  })
})

describe('matchVocabulary', () => {
  const characters = ['初音未来', '纳西妲', '芙宁娜']

  it('完全相同（忽略大小写与空格）判为 exact', () => {
    expect(matchVocabulary('初音未来', characters)).toEqual({ value: '初音未来', match: 'exact' })
    expect(matchVocabulary(' 纳 西妲 ', characters)).toEqual({ value: '纳西妲', match: 'exact' })
    expect(matchVocabulary('vocaloid', ['VOCALOID'])).toEqual({ value: 'VOCALOID', match: 'exact' })
  })

  it('繁简/同音变体通过拼音判为 fuzzy', () => {
    expect(matchVocabulary('納西妲', characters)).toEqual({ value: '纳西妲', match: 'fuzzy' })
  })

  it('包含关系判为 fuzzy（识别常带前后缀）', () => {
    expect(matchVocabulary('亚克力立牌', ['立牌'])).toEqual({ value: '立牌', match: 'fuzzy' })
    expect(matchVocabulary('初音未来 雪初音', ['初音未来'])).toEqual({ value: '初音未来', match: 'fuzzy' })
  })

  it('单字不参与包含匹配，避免误命中', () => {
    expect(matchVocabulary('立', ['立牌'])).toEqual({ value: '立', match: 'none' })
  })

  it('词表里没有就原样返回 none', () => {
    expect(matchVocabulary('凯亚', characters)).toEqual({ value: '凯亚', match: 'none' })
  })

  it('空值或空词表返回 none', () => {
    expect(matchVocabulary('', characters)).toEqual({ value: '', match: 'none' })
    expect(matchVocabulary('凯亚', [])).toEqual({ value: '凯亚', match: 'none' })
  })
})

describe('mapFieldToPresets', () => {
  const vocabulary = {
    categories: ['吧唧', '立牌'],
    ips: ['原神'],
    characters: ['纳西妲', '芙宁娜']
  }

  it('按字段语义选词表', () => {
    expect(mapFieldToPresets('category', '立牌', vocabulary).value).toBe('立牌')
    expect(mapFieldToPresets('ip', '原神', vocabulary).match).toBe('exact')
    expect(mapFieldToPresets('characters', ['納西妲'], vocabulary)).toEqual({
      value: ['纳西妲'],
      match: 'fuzzy',
      unmatched: []
    })
  })

  it('数组里部分命中记为 mixed 并列出未命中项', () => {
    const result = mapFieldToPresets('characters', ['纳西妲', '凯亚'], vocabulary)
    expect(result.value).toEqual(['纳西妲', '凯亚'])
    expect(result.match).toBe('mixed')
    expect(result.unmatched).toEqual(['凯亚'])
  })

  it('词表为空时原样返回，不算未命中', () => {
    const result = mapFieldToPresets('ip', '原神', { categories: [] })
    expect(result).toEqual({ value: '原神', match: 'none', unmatched: [] })
  })

  it('无词表的字段（如 name）不动值', () => {
    const result = mapFieldToPresets('name', '某谷子', vocabulary)
    expect(result).toEqual({ value: '某谷子', match: 'none', unmatched: [] })
  })
})

describe('buildVocabulary', () => {
  it('兼容字符串数组与 { name } 对象数组（角色）', () => {
    const vocabulary = buildVocabulary({
      categories: ['吧唧'],
      ips: [{ name: '原神' }],
      characters: [{ name: '纳西妲', ip: '原神' }, '芙宁娜', { name: '' }]
    })
    expect(vocabulary).toEqual({
      categories: ['吧唧'],
      ips: ['原神'],
      characters: ['纳西妲', '芙宁娜']
    })
  })

  it('缺字段 / 脏结构返回空数组', () => {
    expect(buildVocabulary(null)).toEqual({ categories: [], ips: [], characters: [] })
    expect(buildVocabulary({ categories: '吧唧' })).toEqual({ categories: [], ips: [], characters: [] })
  })
})

describe('vocabularyTexts', () => {
  it('汇总三张词表的文本', () => {
    expect(vocabularyTexts({ categories: ['吧唧'], ips: ['原神'], characters: ['纳西妲'] }))
      .toEqual(['吧唧', '原神', '纳西妲'])
  })
})
