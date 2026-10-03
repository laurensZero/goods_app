import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowRef } from 'vue'

// 会写 SQLite；happy-dom 下拉不到 sql.js wasm，必须 mock
vi.mock('@/utils/db/index', () => ({
  saveItems: vi.fn(async () => {})
}))

import { saveItems } from '@/utils/db/index'
import { clearCustomFieldValues, renameCustomFieldOptionValue } from '../goodsBatchRename'

function makeItem(id, customFields, extra = {}) {
  return { id, name: id, customFields, updatedAt: 1, ...extra }
}

describe('clearCustomFieldValues', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('只删该字段的键，其它键与值不动，并 bump updatedAt', async () => {
    const list = shallowRef([
      makeItem('a', { cf_1: 'A', cf_2: 'B' }),
      makeItem('b', { cf_2: 'C' })
    ])
    const trash = shallowRef([makeItem('t1', { cf_1: 'T' })])
    const sync = vi.fn()

    await clearCustomFieldValues('cf_1', null, list, trash, sync)

    expect(list.value[0].customFields).toEqual({ cf_2: 'B' })
    expect(list.value[1].customFields).toEqual({ cf_2: 'C' })
    expect(list.value[0].updatedAt).toBeGreaterThan(1)
    expect(trash.value[0].customFields).toEqual({})
    expect(sync).toHaveBeenCalledWith(['a', 't1'])
    expect(saveItems).toHaveBeenCalledTimes(1)
    expect(saveItems.mock.calls[0][0].map((i) => i.id).sort()).toEqual(['a', 't1'])
  })

  it('onlyValue 非空时只清该选项值', async () => {
    const list = shallowRef([
      makeItem('a', { cf_1: '限A' }),
      makeItem('b', { cf_1: '限B' })
    ])
    const trash = shallowRef([])
    const sync = vi.fn()

    await clearCustomFieldValues('cf_1', '限A', list, trash, sync)

    expect(list.value[0].customFields).toEqual({})
    expect(list.value[1].customFields).toEqual({ cf_1: '限B' })
    expect(sync).toHaveBeenCalledWith(['a'])
  })

  it('没有命中任何条目时不写库、不触发推送', async () => {
    const list = shallowRef([makeItem('a', { cf_2: 'B' }), makeItem('b', {})])
    const trash = shallowRef([])
    const sync = vi.fn()

    await clearCustomFieldValues('cf_1', null, list, trash, sync)

    expect(saveItems).not.toHaveBeenCalled()
    expect(sync).not.toHaveBeenCalled()
  })

  it('customFields 非对象（脏数据）时安全跳过', async () => {
    const list = shallowRef([
      makeItem('a', undefined),
      { id: 'b', name: 'b', customFields: ['cf_1'], updatedAt: 1 }
    ])
    const trash = shallowRef([])
    const sync = vi.fn()

    await clearCustomFieldValues('cf_1', null, list, trash, sync)

    expect(saveItems).not.toHaveBeenCalled()
    expect(sync).not.toHaveBeenCalled()
  })
})

describe('renameCustomFieldOptionValue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('把等于旧选项的值改成新选项', async () => {
    const list = shallowRef([
      makeItem('a', { cf_1: '旧名', cf_2: '旧名' }),
      makeItem('b', { cf_1: '无关' })
    ])
    const trash = shallowRef([])
    const sync = vi.fn()

    await renameCustomFieldOptionValue('cf_1', '旧名', '新名', list, trash, sync)

    expect(list.value[0].customFields).toEqual({ cf_1: '新名', cf_2: '旧名' })
    expect(list.value[1].customFields).toEqual({ cf_1: '无关' })
    expect(sync).toHaveBeenCalledWith(['a'])
  })

  it('空值/同名时不动作', async () => {
    const list = shallowRef([makeItem('a', { cf_1: '旧名' })])
    const trash = shallowRef([])
    const sync = vi.fn()

    await renameCustomFieldOptionValue('cf_1', '', '新名', list, trash, sync)
    await renameCustomFieldOptionValue('cf_1', '旧名', '旧名', list, trash, sync)

    expect(saveItems).not.toHaveBeenCalled()
    expect(sync).not.toHaveBeenCalled()
  })
})
