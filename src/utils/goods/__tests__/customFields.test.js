import { describe, it, expect } from 'vitest'
import {
  CUSTOM_FIELD_DEF_MAX,
  CUSTOM_FIELD_KEY_MAX,
  CUSTOM_FIELD_OPTION_MAX,
  CUSTOM_FIELD_VALUE_MAX,
  createCustomFieldDefId,
  isCustomFieldType,
  normalizeCustomFieldDefs,
  normalizeCustomFields
} from '../customFields'

describe('normalizeCustomFieldDefs', () => {
  it('保留合法定义并固定键顺序', () => {
    const [def] = normalizeCustomFieldDefs([
      { options: ['A'], type: 'select', name: ' 联动限定 ', id: 'cf_1' }
    ])
    expect(Object.keys(def)).toEqual(['id', 'name', 'type', 'options'])
    expect(def).toEqual({ id: 'cf_1', name: '联动限定', type: 'select', options: ['A'] })
  })

  it('非数组 / 脏项 / 无名 / 重名 都被丢弃', () => {
    expect(normalizeCustomFieldDefs(null)).toEqual([])
    expect(normalizeCustomFieldDefs('nope')).toEqual([])
    expect(normalizeCustomFieldDefs([null, 'x', 42, { id: 'a' }, { id: 'b', name: '   ' }])).toEqual([])
    expect(normalizeCustomFieldDefs([
      { id: 'a', name: '同名' },
      { id: 'b', name: '同名' }
    ])).toHaveLength(1)
  })

  it('非法类型回落 text，且非 select 的 options 强制清空', () => {
    const [def] = normalizeCustomFieldDefs([{ id: 'a', name: 'X', type: 'multiSelect', options: ['A'] }])
    expect(def.type).toBe('text')
    expect(def.options).toEqual([])
  })

  it('id 缺失/超长/重复时用确定性兜底 id（同输入必得同结果）', () => {
    const input = [
      { name: '甲' },
      { id: 'dup', name: '乙' },
      { id: 'dup', name: '丙' },
      { id: 'x'.repeat(CUSTOM_FIELD_KEY_MAX + 1), name: '丁' }
    ]
    const first = normalizeCustomFieldDefs(input)
    const second = normalizeCustomFieldDefs(JSON.parse(JSON.stringify(input)))
    expect(first).toEqual(second)

    const ids = first.map((item) => item.id)
    expect(new Set(ids).size).toBe(ids.length)
    // 合法 id 原样保留（改 id 会让已填值变孤儿键）
    expect(first[1].id).toBe('dup')
    // 缺失/超长/重复的才用确定性兜底 id
    expect(first[0].id).toMatch(/^cf_auto_/)
    expect(first[2].id).toMatch(/^cf_auto_/)
    expect(first[3].id).toMatch(/^cf_auto_/)
  })

  it('options 去空去重截断，数量封顶', () => {
    const [def] = normalizeCustomFieldDefs([{
      id: 'a',
      name: 'X',
      type: 'select',
      options: ['', '  ', 'A', 'A', ...Array.from({ length: 80 }, (_, i) => `O${i}`)]
    }])
    expect(def.options[0]).toBe('A')
    expect(def.options).toHaveLength(CUSTOM_FIELD_OPTION_MAX)
  })

  it('定义数量封顶', () => {
    const many = Array.from({ length: CUSTOM_FIELD_DEF_MAX + 5 }, (_, i) => ({ id: `cf_${i}`, name: `F${i}` }))
    expect(normalizeCustomFieldDefs(many)).toHaveLength(CUSTOM_FIELD_DEF_MAX)
  })

  it('幂等：normalize 后的结果再归一化不变（同步两侧对称的前提）', () => {
    const input = [
      { id: 'cf_1', name: 'A', type: 'select', options: ['X', 'X', 'Y'] },
      { name: 'B', type: 'number' }
    ]
    const once = normalizeCustomFieldDefs(input)
    expect(normalizeCustomFieldDefs(once)).toEqual(once)
    expect(normalizeCustomFieldDefs(JSON.parse(JSON.stringify(once)))).toEqual(once)
  })

  it('createCustomFieldDefId 唯一且带 cf_ 前缀', () => {
    const ids = new Set(Array.from({ length: 50 }, () => createCustomFieldDefId()))
    expect(ids.size).toBe(50)
    expect([...ids].every((id) => id.startsWith('cf_'))).toBe(true)
  })

  it('类型注册表', () => {
    expect(isCustomFieldType('text')).toBe(true)
    expect(isCustomFieldType('select')).toBe(true)
    expect(isCustomFieldType('boolean')).toBe(false)
    expect(isCustomFieldType(undefined)).toBe(false)
  })
})

describe('normalizeCustomFields', () => {
  it('非对象输入回 {}', () => {
    expect(normalizeCustomFields(null)).toEqual({})
    expect(normalizeCustomFields([])).toEqual({})
    expect(normalizeCustomFields('{"cf_1":"x"}')).toEqual({})
    expect(normalizeCustomFields({})).toEqual({})
  })

  it('值字符串化并 trim；空值保留（键存在 = 这件谷子添加了该字段）', () => {
    expect(normalizeCustomFields({ cf_1: ' A ', cf_2: '', cf_3: '   ', cf_4: null, cf_5: undefined }))
      .toEqual({ cf_1: 'A', cf_2: '', cf_3: '', cf_4: '', cf_5: '' })
  })

  it('数字 0 与 false 作为值保留', () => {
    expect(normalizeCustomFields({ cf_1: 0, cf_2: false })).toEqual({ cf_1: '0', cf_2: 'false' })
  })

  it('对象/数组值丢弃（留给未来 multiSelect）', () => {
    expect(normalizeCustomFields({ cf_1: ['A'], cf_2: { a: 1 } })).toEqual({})
  })

  it('键排序让序列化结果稳定', () => {
    const a = normalizeCustomFields({ cf_b: '2', cf_a: '1' })
    const b = normalizeCustomFields({ cf_a: '1', cf_b: '2' })
    expect(Object.keys(a)).toEqual(['cf_a', 'cf_b'])
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('空键与超长键丢弃', () => {
    expect(normalizeCustomFields({ '  ': 'x', ['k'.repeat(CUSTOM_FIELD_KEY_MAX + 1)]: 'x', cf_1: 'y' }))
      .toEqual({ cf_1: 'y' })
  })

  it('不做键数量截断（孤儿键与有效键在归一化层无法区分）', () => {
    const input = {}
    for (let i = 0; i < 120; i += 1) input[`cf_${i}`] = `v${i}`
    expect(Object.keys(normalizeCustomFields(input))).toHaveLength(120)
  })

  it('超长值截断', () => {
    const value = normalizeCustomFields({ cf_1: 'x'.repeat(CUSTOM_FIELD_VALUE_MAX + 50) }).cf_1
    expect(value).toHaveLength(CUSTOM_FIELD_VALUE_MAX)
  })

  it('幂等', () => {
    const once = normalizeCustomFields({ cf_2: 'b', cf_1: ' a ' })
    expect(normalizeCustomFields(once)).toEqual(once)
  })
})
