import { describe, it, expect, vi } from 'vitest'

// 避免加载完整 i18n 语言包
vi.mock('@/locales', () => ({
  default: { global: { t: (key) => key } }
}))

import { createWriter } from '../writer'

function makeDb(calls) {
  return {
    rpc: (name) => {
      calls.push(name)
      return Promise.resolve({
        data: name === 'sync_push' ? { synced_at: '2026-10-17T14:40:31.000Z' } : null,
        error: null
      })
    }
  }
}

describe('pushAll RPC 顺序', () => {
  it('先写行级预设/背景，再写数据+manifest：manifest 时间必须晚于行 updated_at', async () => {
    // 回归：sync_push_rows 服务端 updated_at = now()，若在 sync_push（写 manifest）之后执行，
    // 行 updated_at 会晚于 manifest.synced_at；客户端行水位被 manifest 钳住永远追不上，
    // 下次同步把刚推的行当成远端新行，叠加本地改动即误报冲突（单设备死循环）。
    const calls = []
    const writer = createWriter({
      getDb: () => makeDb(calls),
      deviceIdRef: () => 'dev-a',
      userIdRef: () => 'user-1'
    })

    const result = await writer.pushAll({
      presetRows: [{ domain: 'category', id: 'cat-1', payload: { name: '分类' }, sort_order: 0, deleted: 0, synced_by: 'dev-a' }]
    })

    expect(calls).toEqual(['sync_push_rows', 'sync_push'])
    expect(result.syncedAt).toBe('2026-10-17T14:40:31.000Z')
  })

  it('只有收藏馆背景行时同样先写行表', async () => {
    const calls = []
    const writer = createWriter({
      getDb: () => makeDb(calls),
      deviceIdRef: () => 'dev-a',
      userIdRef: () => 'user-1'
    })

    await writer.pushAll({
      collectionProfileRows: [{ id: 'ip-1', kind: 'ip', items: [], rotation: {}, theme: {}, deleted: 0, synced_by: 'dev-a' }]
    })

    expect(calls).toEqual(['sync_push_rows', 'sync_push'])
  })
})
