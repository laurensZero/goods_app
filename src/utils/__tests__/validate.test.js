vi.mock('@/locales', () => ({
  default: {
    global: {
      locale: { value: 'zh-CN' },
      t: (key, params) => params ? `${key}:${JSON.stringify(params)}` : key
    }
  }
}))

import { describe, it, expect } from 'vitest'
import { validateName, validatePrice } from '../validate'

describe('validateName', () => {
  it('returns valid for normal name', () => {
    const result = validateName('测试名称')
    expect(result.valid).toBe(true)
    expect(result.message).toBe('')
  })

  it('returns invalid for empty name', () => {
    const result = validateName('')
    expect(result.valid).toBe(false)
    expect(result.message).toContain('validation.required')
  })

  it('returns invalid for whitespace-only name', () => {
    const result = validateName('   ')
    expect(result.valid).toBe(false)
    expect(result.message).toContain('validation.required')
  })

  it('returns invalid for null name', () => {
    const result = validateName(null)
    expect(result.valid).toBe(false)
  })

  it('returns invalid for too-long name', () => {
    const longName = 'a'.repeat(51)
    const result = validateName(longName)
    expect(result.valid).toBe(false)
    expect(result.message).toContain('validation.maxLength')
  })

  it('accepts name at max length', () => {
    const name = 'a'.repeat(50)
    const result = validateName(name)
    expect(result.valid).toBe(true)
  })

  it('respects custom maxLength', () => {
    const result = validateName('abcdef', { maxLength: 3 })
    expect(result.valid).toBe(false)
    expect(result.message).toContain('3')
  })

  it('respects custom label', () => {
    const result = validateName('', { label: '自定义字段' })
    expect(result.valid).toBe(false)
    expect(result.message).toContain('自定义字段')
  })
})

describe('validatePrice', () => {
  it('returns valid for normal price', () => {
    expect(validatePrice(99).valid).toBe(true)
    expect(validatePrice('99.5').valid).toBe(true)
  })

  it('returns valid for empty price', () => {
    expect(validatePrice('').valid).toBe(true)
    expect(validatePrice(null).valid).toBe(true)
    expect(validatePrice(undefined).valid).toBe(true)
  })

  it('returns valid for zero', () => {
    expect(validatePrice(0).valid).toBe(true)
  })

  it('returns invalid for negative price', () => {
    const result = validatePrice(-10)
    expect(result.valid).toBe(false)
    expect(result.message).toContain('validation.invalidPrice')
  })

  it('returns invalid for non-numeric string', () => {
    const result = validatePrice('abc')
    expect(result.valid).toBe(false)
    expect(result.message).toContain('validation.invalidPrice')
  })

  it('returns invalid for price over 999999', () => {
    const result = validatePrice(1000000)
    expect(result.valid).toBe(false)
    expect(result.message).toContain('validation.priceOutOfRange')
  })

  it('accepts price at boundary', () => {
    expect(validatePrice(999999).valid).toBe(true)
  })
})
