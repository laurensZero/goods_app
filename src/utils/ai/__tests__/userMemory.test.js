import { describe, it, expect, beforeEach } from 'vitest'
import {
  addUserMemory,
  removeUserMemory,
  loadUserMemories,
  normalizeMemoryText,
  MEMORY_MAX_ENTRIES,
  MEMORY_MAX_LENGTH
} from '../userMemory'

beforeEach(() => {
  localStorage.clear()
})

describe('userMemory', () => {
  it('新增并读取记忆', () => {
    const { entry, total, deduped } = addUserMemory('用户只收吧唧')
    expect(deduped).toBe(false)
    expect(total).toBe(1)
    expect(entry.text).toBe('用户只收吧唧')
    expect(loadUserMemories().map((m) => m.text)).toEqual(['用户只收吧唧'])
  })

  it('完全相同的文本去重：不新增只刷新时间', () => {
    const first = addUserMemory('讨厌剧透')
    const again = addUserMemory('讨厌剧透')
    expect(again.deduped).toBe(true)
    expect(again.total).toBe(1)
    expect(again.entry.id).toBe(first.entry.id)
    expect(loadUserMemories()).toHaveLength(1)
  })

  it('超上限时按最旧淘汰', () => {
    for (let i = 0; i < MEMORY_MAX_ENTRIES; i += 1) {
      addUserMemory(`记忆 ${i}`)
    }
    // 最早写入的「记忆 0」应被淘汰，总量封顶
    addUserMemory('最新的一条')
    const list = loadUserMemories()
    expect(list).toHaveLength(MEMORY_MAX_ENTRIES)
    expect(list.some((m) => m.text === '记忆 0')).toBe(false)
    expect(list.some((m) => m.text === '最新的一条')).toBe(true)
  })

  it('单条限长，超长截断', () => {
    expect(normalizeMemoryText('x'.repeat(200))).toHaveLength(MEMORY_MAX_LENGTH)
    const { entry } = addUserMemory('y'.repeat(300))
    expect(entry.text).toHaveLength(MEMORY_MAX_LENGTH)
  })

  it('删除需精确匹配', () => {
    addUserMemory('讨厌剧透')
    expect(removeUserMemory('讨厌剧透吧')).toBe(false)
    expect(removeUserMemory('讨厌剧透')).toBe(true)
    expect(loadUserMemories()).toHaveLength(0)
    expect(removeUserMemory('讨厌剧透')).toBe(false)
  })

  it('空文本抛错', () => {
    expect(() => addUserMemory('   ')).toThrow('不能为空')
  })
})
