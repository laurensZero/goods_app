import { describe, it, expect } from 'vitest'
import {
  MAPPABLE_FIELDS,
  coerceValue,
  normalizeDate,
  normalizeDefaults
} from '../fieldCoercion'

describe('fieldCoercion', () => {
  it('MAPPABLE_FIELDS 含核心字段', () => {
    expect(MAPPABLE_FIELDS).toContain('name')
    expect(MAPPABLE_FIELDS).toContain('price')
    expect(MAPPABLE_FIELDS).toContain('acquiredAt')
  })

  describe('coerceValue', () => {
    it('空值一律返回 undefined（含 null / 纯空白）', () => {
      expect(coerceValue('name', '')).toBeUndefined()
      expect(coerceValue('name', '   ')).toBeUndefined()
      expect(coerceValue('name', null)).toBeUndefined()
      expect(coerceValue('name', undefined)).toBeUndefined()
    })

    it('数组字段按中英标点与斜杠拆分并去空', () => {
      expect(coerceValue('characters', '芙宁娜;那维莱特')).toEqual(['芙宁娜', '那维莱特'])
      expect(coerceValue('characters', 'A|B/C')).toEqual(['A', 'B', 'C'])
      expect(coerceValue('characters', 'A、B;C')).toEqual(['A', 'B', 'C'])
      expect(coerceValue('tags', '限定、 特典 ')).toEqual(['限定', '特典'])
    })

    it('全角逗号「，」也视为分隔符（中文输入法默认全角）', () => {
      expect(coerceValue('characters', '芙宁娜，那维莱特')).toEqual(['芙宁娜', '那维莱特'])
      expect(coerceValue('characters', '納西妲， 芙宁娜，那维莱特')).toEqual(['納西妲', '芙宁娜', '那维莱特'])
    })

    it('布尔字段识别常见写法，无法识别返回 undefined', () => {
      for (const truthy of ['1', 'true', '是', 'y', 'YES', '✓']) {
        expect(coerceValue('isWishlist', truthy)).toBe(true)
      }
      for (const falsy of ['0', 'false', '否', 'n', 'No', '✗']) {
        expect(coerceValue('isWishlist', falsy)).toBe(false)
      }
      expect(coerceValue('isWishlist', '也许')).toBeUndefined()
    })

    it('日期字段归一化为 YYYY-MM-DD，补零', () => {
      expect(coerceValue('acquiredAt', '2024-3-1')).toBe('2024-03-01')
      expect(coerceValue('acquiredAt', '2024/03/15')).toBe('2024-03-15')
      expect(coerceValue('acquiredAt', '2024.3.5')).toBe('2024-03-05')
      expect(coerceValue('acquiredAt', '2024年3月5日')).toBe('2024-03-05')
      expect(coerceValue('sellDate', '20240315')).toBe('2024-03-15')
    })

    it('日期不可识别时抛错（不静默写脏值）', () => {
      expect(() => coerceValue('acquiredAt', 'bad-date')).toThrow('无法识别日期')
      expect(() => coerceValue('acquiredAt', '2024-13-01')).toThrow('无法识别日期')
      expect(() => coerceValue('acquiredAt', '2024-02-32')).toThrow('无法识别日期')
    })

    it('quantity 取证整数并向下取整，< 1 抛错', () => {
      expect(coerceValue('quantity', '2')).toBe(2)
      expect(coerceValue('quantity', '3 个')).toBe(3)
      expect(coerceValue('quantity', '2.7')).toBe(2)
      expect(() => coerceValue('quantity', 'x')).toThrow('数量无效')
      expect(() => coerceValue('quantity', '0')).toThrow('数量无效')
    })

    it('金额字段清掉货币符号与千分位，保持字符串', () => {
      expect(coerceValue('price', '30')).toBe('30')
      expect(coerceValue('price', '¥1,280')).toBe('1280')
      expect(coerceValue('actualPrice', '$ 12.5')).toBe('12.5')
      expect(coerceValue('sellPrice', '€8.00')).toBe('8.00')
      expect(() => coerceValue('price', 'abc')).toThrow('金额格式无法识别')
    })

    it('普通字段原样返回并 trim', () => {
      expect(coerceValue('name', '  吧唧  ')).toBe('吧唧')
      expect(coerceValue('variant', '初版')).toBe('初版')
    })
  })

  describe('normalizeDate', () => {
    it('无法识别返回空串而不抛错', () => {
      expect(normalizeDate('')).toBe('')
      expect(normalizeDate('2024年13月1日')).toBe('')
      expect(normalizeDate('昨天')).toBe('')
    })
  })

  describe('normalizeDefaults', () => {
    it('只保留白名单字段与非空值', () => {
      expect(normalizeDefaults({
        category: '吧唧',
        currency: 'CNY',
        unknownField: 'x',
        note: '',
        ip: null
      })).toEqual({ category: '吧唧', currency: 'CNY' })
    })

    it('非对象输入返回空对象', () => {
      expect(normalizeDefaults(null)).toEqual({})
      expect(normalizeDefaults([])).toEqual({})
      expect(normalizeDefaults('x')).toEqual({})
    })
  })
})
