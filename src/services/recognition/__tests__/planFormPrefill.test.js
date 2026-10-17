import { describe, it, expect } from 'vitest'
import { planFormPrefill, isEmptyFormValue, FORM_PREFILL_FIELDS } from '../planFormPrefill'

function entry(value, extra = {}) {
  return { value, confidence: 'high', verified: true, ...extra }
}

describe('isEmptyFormValue', () => {
  it('空串 / 全空白 / null / 空数组算空', () => {
    expect(isEmptyFormValue('')).toBe(true)
    expect(isEmptyFormValue('   ')).toBe(true)
    expect(isEmptyFormValue(null)).toBe(true)
    expect(isEmptyFormValue(undefined)).toBe(true)
    expect(isEmptyFormValue([])).toBe(true)
  })

  it('有内容的值不算空', () => {
    expect(isEmptyFormValue('吧唧')).toBe(false)
    expect(isEmptyFormValue(0)).toBe(false)
    expect(isEmptyFormValue(['纳西妲'])).toBe(false)
  })
})

describe('planFormPrefill', () => {
  it('全空表单：识别到的都填入', () => {
    const plan = planFormPrefill({
      fields: {
        name: entry('初音未来 亚克力立牌'),
        category: entry('立牌'),
        ip: entry('VOCALOID'),
        characters: entry(['初音未来']),
        price: entry('158'),
        actualPrice: entry('128'),
        acquiredAt: entry('2026-10-12')
      },
      current: { name: '', category: '', ip: '', characters: [], price: '', actualPrice: '', acquiredAt: '' }
    })

    expect(plan.assignments).toEqual({
      name: '初音未来 亚克力立牌',
      category: '立牌',
      ip: 'VOCALOID',
      characters: ['初音未来'],
      price: '158',
      actualPrice: '128',
      acquiredAt: '2026-10-12'
    })
    expect(plan.filled).toEqual(FORM_PREFILL_FIELDS)
    expect(plan.skipped).toEqual([])
    expect(plan.notRecognized).toEqual([])
    expect(plan.notApplicable).toEqual([])
  })

  it('已有内容的字段不覆盖，报进 skipped', () => {
    const plan = planFormPrefill({
      fields: { name: entry('识别到的名字'), price: entry('99') },
      current: { name: '我自己写的名字', price: '', characters: [] }
    })

    expect(plan.assignments).toEqual({ price: '99' })
    expect(plan.filled).toEqual(['price'])
    expect(plan.skipped).toEqual(['name'])
  })

  it('没识别到的字段报进 notRecognized，不进 assignments', () => {
    const plan = planFormPrefill({
      fields: { name: entry('吧唧') },
      current: {}
    })

    expect(plan.assignments).toEqual({ name: '吧唧' })
    expect(plan.notRecognized).not.toContain('name')
    expect(plan.notRecognized).toEqual(['category', 'ip', 'characters', 'price', 'actualPrice', 'acquiredAt'])
  })

  it('exclude 的字段既不填也不报未识别（如心愿单模式下的入手价）', () => {
    const plan = planFormPrefill({
      fields: { actualPrice: entry('128'), acquiredAt: entry('2026-10-12'), name: entry('吧唧') },
      current: {},
      exclude: ['actualPrice', 'acquiredAt']
    })

    expect(plan.assignments).toEqual({ name: '吧唧' })
    expect(plan.notApplicable).toEqual(['actualPrice', 'acquiredAt'])
    expect(plan.notRecognized).not.toContain('actualPrice')
  })

  it('空值 / 缺失条目一律视为未识别', () => {
    const plan = planFormPrefill({
      fields: { name: entry('   '), category: entry([]), price: { value: null } },
      current: {}
    })

    expect(plan.assignments).toEqual({})
    expect(plan.notRecognized).toContain('name')
    expect(plan.notRecognized).toContain('category')
    expect(plan.notRecognized).toContain('price')
  })

  it('标出推断值（medium）与未验证（缺出处）的字段', () => {
    const plan = planFormPrefill({
      fields: {
        name: entry('吧唧'),
        category: entry('吧唧', { confidence: 'medium' }),
        ip: entry('原神', { verified: null, confidence: 'medium' }),
        price: entry('30')
      },
      current: {}
    })

    expect(plan.uncertain).toEqual(['category', 'ip'])
    expect(plan.unverified).toEqual(['ip'])
  })

  it('脏入参不炸：fields / current / exclude 非法时按空处理', () => {
    expect(planFormPrefill().filled).toEqual([])
    expect(planFormPrefill({ fields: null, current: null, exclude: 'name' }).filled).toEqual([])
    expect(planFormPrefill({ fields: { name: entry('吧唧') }, current: {}, exclude: 'name' }).filled).toEqual(['name'])
  })
})
