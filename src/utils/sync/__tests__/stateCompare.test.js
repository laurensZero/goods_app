import { describe, it, expect } from 'vitest'
import { compareState, compareStateSync } from '../stateCompare'

const local = [
  { id: 'a', updatedAt: 100 },
  { id: 'b', updatedAt: 200 },
  { id: 'c', updatedAt: 300 }
]

const remote = [
  { id: 'a', updatedAt: 100 },
  { id: 'b', updatedAt: 250 },
  { id: 'd', updatedAt: 400 }
]

describe('compareStateSync (timestamp)', () => {
  it('counts remote-only, local-only, and updated', () => {
    expect(compareStateSync(local, remote)).toEqual({
      remoteTotal: 3,
      remoteOnly: 1,
      localOnly: 1,
      updated: 1,
      hasChanges: true
    })
  })

  it('skips localOnly when incremental', () => {
    const result = compareStateSync(local, remote, { incremental: true })
    expect(result.localOnly).toBe(0)
    expect(result.updated).toBe(1)
    expect(result.hasChanges).toBe(true)
  })

  it('reports no changes when identical timestamps', () => {
    const same = [{ id: 'a', updatedAt: 1 }, { id: 'b', updatedAt: 2 }]
    expect(compareStateSync(same, same)).toMatchObject({
      remoteOnly: 0,
      localOnly: 0,
      updated: 0,
      hasChanges: false
    })
  })

  it('skips items without id', () => {
    const result = compareStateSync([{ id: '', updatedAt: 1 }], [{ id: '', updatedAt: 2 }])
    expect(result.remoteTotal).toBe(0)
    expect(result.hasChanges).toBe(false)
  })

  it('treats missing updatedAt as 0', () => {
    const result = compareStateSync([{ id: 'a' }], [{ id: 'a', updatedAt: 5 }])
    expect(result.updated).toBe(1)
  })
})

describe('compareState (content strategy)', () => {
  it('detects same-timestamp content changes', async () => {
    const a = [{ id: 'x', updatedAt: 1, name: 'old' }]
    const b = [{ id: 'x', updatedAt: 1, name: 'new' }]
    expect(compareStateSync(a, b).updated).toBe(0)
    const result = await compareState(a, b, { strategy: 'content' })
    expect(result.updated).toBe(1)
    expect(result.hasChanges).toBe(true)
  })

  it('treats identical content as unchanged', async () => {
    const items = [{ id: 'x', updatedAt: 1, name: 'same', tags: ['a', 'b'] }]
    const copy = [{ id: 'x', updatedAt: 1, tags: ['a', 'b'], name: 'same' }]
    const result = await compareState(items, copy, { strategy: 'content' })
    expect(result.updated).toBe(0)
    expect(result.hasChanges).toBe(false)
  })

  it('falls back to timestamp behavior for non-content strategy', async () => {
    expect(await compareState(local, remote, { strategy: 'timestamp' })).toEqual(
      compareStateSync(local, remote)
    )
  })
})
