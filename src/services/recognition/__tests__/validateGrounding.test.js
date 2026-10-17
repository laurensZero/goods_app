import { describe, it, expect } from 'vitest'
import { normalizeForMatch, isGrounded, applyGrounding } from '../validateGrounding'

describe('normalizeForMatch', () => {
  it('全角字符转半角、去空白、小写', () => {
    expect(normalizeForMatch('ＡＢＣ１２３')).toBe('abc123')
    expect(normalizeForMatch(' 初音 未来 ')).toBe('初音未来')
    expect(normalizeForMatch('¥128')).toBe('¥128')
  })

  it('统一常见全角标点', () => {
    expect(normalizeForMatch('实付（￥128）')).toBe('实付(¥128)')
    expect(normalizeForMatch('含税，包邮。')).toBe('含税,包邮.')
  })

  it('空值返回空串', () => {
    expect(normalizeForMatch(null)).toBe('')
    expect(normalizeForMatch(undefined)).toBe('')
  })
})

describe('isGrounded', () => {
  const transcript = '初音未来 亚克力立牌\n实付 ¥128\n2026-10-12'

  it('原文片段能在转写中找到', () => {
    expect(isGrounded('实付 ¥128', transcript)).toBe(true)
    expect(isGrounded('亚克力立牌', transcript)).toBe(true)
  })

  it('空白与全半角差异不影响判定', () => {
    expect(isGrounded('实付¥128', transcript)).toBe(true)
    expect(isGrounded('实付　¥１２８', transcript)).toBe(true)
  })

  it('转写里没有的片段判为不通过', () => {
    expect(isGrounded('实付 ¥999', transcript)).toBe(false)
    expect(isGrounded('限量特典', transcript)).toBe(false)
  })

  it('空片段不算通过', () => {
    expect(isGrounded('', transcript)).toBe(false)
    expect(isGrounded('   ', transcript)).toBe(false)
  })
})

describe('applyGrounding', () => {
  const transcript = '吧唧 30 元 2026-05-01'

  it('出处能对上 → 采用并标记 verified', () => {
    const { fields, warnings } = applyGrounding(
      { name: '吧唧', price: '30' },
      { name: '吧唧', price: '30 元' },
      transcript
    )
    expect(fields.name).toEqual({ value: '吧唧', sourceText: '吧唧', verified: true })
    expect(fields.price).toEqual({ value: '30', sourceText: '30 元', verified: true })
    expect(warnings).toEqual([])
  })

  it('出处对不上 → 丢弃该字段并告警 grounding_failed', () => {
    const { fields, warnings } = applyGrounding(
      { name: '吧唧', price: '99' },
      { name: '吧唧', price: '99 元' },
      transcript
    )
    expect(fields).not.toHaveProperty('price')
    expect(fields.name.value).toBe('吧唧')
    expect(warnings).toEqual([{ code: 'grounding_failed', field: 'price' }])
  })

  it('模型没给出处 → 保留但标记未验证并告警', () => {
    const { fields, warnings } = applyGrounding({ category: '吧唧' }, {}, transcript)
    expect(fields.category).toEqual({ value: '吧唧', sourceText: '', verified: null })
    expect(warnings).toEqual([{ code: 'evidence_missing', field: 'category' }])
  })

  it('脏入参不炸：fields / evidence 非对象时按空处理', () => {
    const { fields, warnings } = applyGrounding(null, 'not-an-object', transcript)
    expect(fields).toEqual({})
    expect(warnings).toEqual([])
  })
})
