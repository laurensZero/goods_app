import { describe, it, expect } from 'vitest'
import { buildShareDescription, buildSyncDescription } from '../gist'

describe('buildShareDescription', () => {
  it('returns fixed share description', () => {
    expect(buildShareDescription()).toBe('goods-app-share')
  })
})

describe('buildSyncDescription', () => {
  it('builds data sync description', () => {
    expect(buildSyncDescription('device-123')).toBe('goods-app-sync-device-123')
  })

  it('builds image sync description', () => {
    expect(buildSyncDescription('device-123', 'image')).toBe('goods-app-images-device-123')
  })

  it('builds recharge sync description', () => {
    expect(buildSyncDescription('device-123', 'recharge')).toBe('goods-app-recharge-sync-device-123')
  })

  it('builds events sync description', () => {
    expect(buildSyncDescription('device-123', 'events')).toBe('goods-app-events-sync-device-123')
  })

  it('defaults to data kind', () => {
    expect(buildSyncDescription('dev-1', 'unknown')).toBe('goods-app-sync-dev-1')
  })
})
