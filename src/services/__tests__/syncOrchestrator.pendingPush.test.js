import { describe, it, expect, vi } from 'vitest'

// Stub platform storage
vi.mock('@/utils/platform/storage', () => ({
  readPersisted: vi.fn(),
  writePersisted: vi.fn(),
  removePersisted: vi.fn()
}))

// Stub logger
vi.mock('@/utils/logger', () => ({ createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn() }) }))

// Stub i18n
vi.mock('@/locales', () => ({ default: { global: { t: (k) => k } } }))

import { reconcilePendingPush, createSyncOrchestrator } from '../syncOrchestrator'

function makeCtx(overrides = {}) {
  return {
    lastSyncedAt: '2026-07-01T00:00:00.000Z',
    pendingPush: null,
    saveLastSyncedAt: vi.fn(),
    saveEventLastSyncedAt: vi.fn(),
    savePendingPush: vi.fn(),
    clearPendingPush: vi.fn(),
    ...overrides
  }
}

describe('reconcilePendingPush', () => {
  it('fast-forwards watermark when same device and remote ts equals marker ts (format-insensitive)', async () => {
    // 远端回传 '+00:00' 格式、标记为 'Z' 格式 — 证明按 toTimestampMs 比较而非字符串比较
    const ctx = makeCtx({
      pendingPush: { ts: '2026-07-20T10:00:00.000Z', deviceId: 'dev-a' }
    })
    const remoteManifest = { lastSyncAt: '2026-07-20T10:00:00+00:00', deviceId: 'dev-a' }

    const result = await reconcilePendingPush(ctx, remoteManifest)

    expect(result).toBe(true)
    expect(ctx.saveLastSyncedAt).toHaveBeenCalledWith('2026-07-20T10:00:00+00:00')
    expect(ctx.lastSyncedAt).toBe('2026-07-20T10:00:00+00:00')
    expect(ctx.clearPendingPush).toHaveBeenCalled()
    expect(ctx.pendingPush).toBe(null)
  })

  it('fast-forwards when remote ts is slightly later than marker (server-stamped now())', async () => {
    const ctx = makeCtx({
      pendingPush: { ts: '2026-07-20T10:00:00.000Z', deviceId: 'dev-a' }
    })
    const remoteManifest = { lastSyncAt: '2026-07-20T10:00:02.500Z', deviceId: 'dev-a' }

    const result = await reconcilePendingPush(ctx, remoteManifest)

    expect(result).toBe(true)
    expect(ctx.saveLastSyncedAt).toHaveBeenCalledWith('2026-07-20T10:00:02.500Z')
    expect(ctx.clearPendingPush).toHaveBeenCalled()
  })

  it('does not fast-forward when remote manifest was written by another device, but clears marker', async () => {
    const ctx = makeCtx({
      pendingPush: { ts: '2026-07-20T10:00:00.000Z', deviceId: 'dev-a' }
    })
    const remoteManifest = { lastSyncAt: '2026-07-20T10:00:00.000Z', deviceId: 'dev-b' }

    const result = await reconcilePendingPush(ctx, remoteManifest)

    expect(result).toBe(false)
    expect(ctx.saveLastSyncedAt).not.toHaveBeenCalled()
    expect(ctx.lastSyncedAt).toBe('2026-07-01T00:00:00.000Z')
    expect(ctx.clearPendingPush).toHaveBeenCalled()
    expect(ctx.pendingPush).toBe(null)
  })

  it('fast-forwards when remote ts is older than marker but newer than local watermark (earlier interrupted push landed, later attempt did not)', async () => {
    // 场景：quickPush 崩溃后重试会用更新的 ts 覆盖标记；已落地的远端时间早于标记时间。
    // 只要最后写入者是本设备且远端晚于本地水位线，即为本设备自己的中断推送，应恢复。
    const ctx = makeCtx({
      pendingPush: { ts: '2026-07-20T10:00:00.000Z', deviceId: 'dev-a' }
    })
    const remoteManifest = { lastSyncAt: '2026-07-19T10:00:00.000Z', deviceId: 'dev-a' }

    const result = await reconcilePendingPush(ctx, remoteManifest)

    expect(result).toBe(true)
    expect(ctx.saveLastSyncedAt).toHaveBeenCalledWith('2026-07-19T10:00:00.000Z')
    expect(ctx.lastSyncedAt).toBe('2026-07-19T10:00:00.000Z')
    expect(ctx.clearPendingPush).toHaveBeenCalled()
  })

  it('returns false without touching persistence when no marker exists', async () => {
    const ctx = makeCtx()
    const remoteManifest = { lastSyncAt: '2026-07-20T10:00:00.000Z', deviceId: 'dev-a' }

    const result = await reconcilePendingPush(ctx, remoteManifest)

    expect(result).toBe(false)
    expect(ctx.saveLastSyncedAt).not.toHaveBeenCalled()
    expect(ctx.clearPendingPush).not.toHaveBeenCalled()
  })

  it('also fast-forwards the event watermark when marker carries eventTs', async () => {
    const ctx = makeCtx({
      pendingPush: { ts: '2026-07-20T10:00:00.000Z', eventTs: '2026-07-20T09:59:00.000Z', deviceId: 'dev-a' }
    })
    const remoteManifest = { lastSyncAt: '2026-07-20T10:00:00.000Z', deviceId: 'dev-a' }

    const result = await reconcilePendingPush(ctx, remoteManifest)

    expect(result).toBe(true)
    expect(ctx.saveEventLastSyncedAt).toHaveBeenCalledWith('2026-07-20T09:59:00.000Z')
    expect(ctx.clearPendingPush).toHaveBeenCalled()
  })

  it('does not fast-forward when local watermark is already >= remote ts, but clears marker', async () => {
    const ctx = makeCtx({
      lastSyncedAt: '2026-07-20T10:00:00.000Z',
      pendingPush: { ts: '2026-07-20T10:00:00.000Z', deviceId: 'dev-a' }
    })
    const remoteManifest = { lastSyncAt: '2026-07-20T10:00:00.000Z', deviceId: 'dev-a' }

    const result = await reconcilePendingPush(ctx, remoteManifest)

    expect(result).toBe(false)
    expect(ctx.saveLastSyncedAt).not.toHaveBeenCalled()
    expect(ctx.clearPendingPush).toHaveBeenCalled()
  })
})

describe('quickPush crash-safe ordering', () => {
  it('persists the pending-push marker before pushAll and clears it after the watermark save', async () => {
    const calls = []

    const backend = {
      pushAll: async () => { calls.push('pushAll') },
      getDb: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              limit: async () => ({ data: [] })
            })
          })
        })
      })
    }

    const orchestrator = createSyncOrchestrator({
      backend,
      payload: {},
      image: {},
      conflict: { getLocalChangesSince: () => ({ hasChanges: false }) },
      useGoodsStore: () => ({ list: [{ id: 'g1', images: [], updatedAt: 1 }], trashList: [] }),
      useRechargeStore: () => ({}),
      useEventsStore: () => ({}),
      usePresetsStore: () => ({}),
      useGoodsGroupStore: () => ({}),
      trackSyncStep: (t, fn) => fn(),
      userIdRef: () => 'u1'
    })

    const ctx = {
      deviceId: 'dev-a',
      lastSyncedAt: '',
      pendingPush: null,
      ensureEventsStoreReady: async () => {},
      buildPresetsData: async () => null,
      savePendingPush: vi.fn(async () => { calls.push('savePendingPush') }),
      saveLastSyncedAt: vi.fn(async () => { calls.push('saveLastSyncedAt') }),
      clearPendingPush: vi.fn(async () => { calls.push('clearPendingPush') }),
      saveEventLastSyncedAt: vi.fn(),
      saveImageCloudId: async () => {}
    }

    const result = await orchestrator.sync(ctx, {
      dirtyDomains: new Set(['goods']),
      dirtyGoodsIds: new Set(['g1'])
    })

    expect(result.action).toBe('pushed')
    expect(calls).toEqual(['savePendingPush', 'pushAll', 'saveLastSyncedAt', 'clearPendingPush'])
  })
})
