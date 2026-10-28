import { describe, expect, it } from 'vitest'
import {
  CATEGORY_DEFINITIONS,
  CATEGORY_KEYWORDS,
  CATEGORY_RULES,
  CATEGORY_TYPE_WORDS,
} from '../categoryDefinitions'
import { parseCategoryFromName } from '@/utils/mihoyo/index'

describe('categoryDefinitions 单一数据源', () => {
  it('每个品类生成一条关键词表和一条打分规则', () => {
    expect(CATEGORY_KEYWORDS).toHaveLength(CATEGORY_DEFINITIONS.length)
    expect(CATEGORY_RULES).toHaveLength(CATEGORY_DEFINITIONS.length)

    for (const definition of CATEGORY_DEFINITIONS) {
      const keywordEntry = CATEGORY_KEYWORDS.find((item) => item.category === definition.category)
      const rule = CATEGORY_RULES.find((item) => item.value === definition.category)
      expect(keywordEntry?.keywords).toEqual(definition.keywords)
      expect(rule).toBeTruthy()
      expect(rule.weight).toBe(definition.weight)
      expect(Boolean(rule.decisive)).toBe(Boolean(definition.decisive))
    }
  })

  it('生成的规则正则能命中该品类的每个关键词', () => {
    for (const definition of CATEGORY_DEFINITIONS) {
      const rule = CATEGORY_RULES.find((item) => item.value === definition.category)
      const regex = new RegExp(rule.key, 'i')
      for (const keyword of definition.keywords) {
        expect(regex.test(keyword)).toBe(true)
      }
    }
  })

  it('所有品类词都汇入角色过滤词表', () => {
    const typeWords = new Set(CATEGORY_TYPE_WORDS)
    for (const definition of CATEGORY_DEFINITIONS) {
      for (const keyword of definition.keywords) {
        expect(typeWords.has(keyword)).toBe(true)
      }
    }
  })

  it('同一个关键词不会同时属于两个品类', () => {
    const seen = new Map()
    for (const definition of CATEGORY_DEFINITIONS) {
      for (const keyword of definition.keywords) {
        expect(seen.has(keyword)).toBe(false)
        seen.set(keyword, definition.category)
      }
    }
  })

  it('导入链路直接使用这份定义', () => {
    expect(parseCategoryFromName('角色印象系列丝巾')).toBe('服饰')
    expect(parseCategoryFromName('花绪之约系列特典票')).toBe('镭射票')
    expect(parseCategoryFromName('测试 流沙摆件')).toBe('摆件')
    expect(parseCategoryFromName('花绪之约系列亚克力票根')).toBe('')
  })
})
