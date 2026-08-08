import { describe, it, expect, vi } from 'vitest'

// 避免加载完整 i18n 语言包
vi.mock('@/locales', () => ({
  default: { global: { t: (key) => key } }
}))

import { computeBucketDiff } from '../helpers'

function makeItem(id, updatedAt, overrides = {}) {
  return { id, name: `item-${id}`, updatedAt, ...overrides }
}

describe('computeBucketDiff', () => {
  it('does not re-push a stale active copy over a newer remote tombstone', async () => {
    const local = makeItem('g1', 100)
    const remoteTombstone = makeItem('g1', 200, { trashed: true })

    const result = await computeBucketDiff([local], [], [], [remoteTombstone])

    expect(result.active).toEqual([])
    expect(result.trash).toEqual([])
  })

  it('pushes a genuinely newer local active edit', async () => {
    const local = makeItem('g1', 300)
    const remote = makeItem('g1', 200)

    const result = await computeBucketDiff([local], [], [remote], [])

    expect(result.active.map((i) => i.id)).toEqual(['g1'])
    expect(result.trash).toEqual([])
  })

  it('pushes a newer local trash tombstone over an older remote active row', async () => {
    const localTrash = makeItem('g1', 300, { trashed: true })
    const remoteActive = makeItem('g1', 200)

    const result = await computeBucketDiff([], [localTrash], [remoteActive], [])

    expect(result.trash.map((i) => i.id)).toEqual(['g1'])
    expect(result.active).toEqual([])
  })

  it('pushes a restored item (local active newer than remote tombstone) to the active bucket', async () => {
    const localRestored = makeItem('g1', 300)
    const remoteTombstone = makeItem('g1', 200, { trashed: true })

    const result = await computeBucketDiff([localRestored], [], [], [remoteTombstone])

    expect(result.active.map((i) => i.id)).toEqual(['g1'])
    expect(result.trash).toEqual([])
  })

  it('pushes items absent from the remote view', async () => {
    const local = makeItem('g1', 100)

    const result = await computeBucketDiff([local], [], [], [])

    expect(result.active.map((i) => i.id)).toEqual(['g1'])
  })

  it('skips rows with equal timestamps (no re-push churn)', async () => {
    const local = makeItem('g1', 100)
    const remote = makeItem('g1', 100)

    const result = await computeBucketDiff([local], [], [remote], [])

    expect(result.active).toEqual([])
    expect(result.trash).toEqual([])
  })

  it('does not push a stale local trash tombstone over a newer remote active row', async () => {
    const localTrash = makeItem('g1', 100, { trashed: true })
    const remoteActive = makeItem('g1', 200)

    const result = await computeBucketDiff([], [localTrash], [remoteActive], [])

    expect(result.active).toEqual([])
    expect(result.trash).toEqual([])
  })

  it('routes a duplicate local id (both buckets) to the LWW-winning bucket', async () => {
    const localActive = makeItem('g1', 100)
    const localTrash = makeItem('g1', 200, { trashed: true })

    const result = await computeBucketDiff([localActive], [localTrash], [], [])

    expect(result.trash.map((i) => i.id)).toEqual(['g1'])
    expect(result.active).toEqual([])
  })

  it('routes to the active bucket when the local active copy wins the LWW', async () => {
    const localActive = makeItem('g1', 300)
    const localTrash = makeItem('g1', 200, { trashed: true })

    const result = await computeBucketDiff([localActive], [localTrash], [], [])

    expect(result.active.map((i) => i.id)).toEqual(['g1'])
    expect(result.trash).toEqual([])
  })

  it('ignores ids that only exist remotely (never deletes cloud rows)', async () => {
    const remoteActive = makeItem('remote-only', 500)

    const result = await computeBucketDiff([], [], [remoteActive], [])

    expect(result.active).toEqual([])
    expect(result.trash).toEqual([])
  })
})
