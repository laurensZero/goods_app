import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h, nextTick, reactive } from 'vue'
import { mount } from '@vue/test-utils'
import { realtimeState, requestRealtimeReconnect, useRealtimeSync } from '@/composables/sync/useRealtimeSync'

const mocks = vi.hoisted(() => ({
  callbacks: [],
  socketUp: { value: true },
  auth: { user: { id: 'user-1' } },
  reconnectSupabase: vi.fn(async () => true)
}))

vi.mock('@/utils/sync/supabaseClient', () => {
  const builder = {
    on() { return builder },
    subscribe(cb) {
      mocks.callbacks.push(cb)
      return { unsubscribe() {} }
    }
  }
  return {
    getSupabaseClient: vi.fn(() => ({
      channel: () => builder,
      realtime: {
        isConnected: () => mocks.socketUp.value,
        isConnecting: () => false
      }
    })),
    reconnectSupabase: mocks.reconnectSupabase,
    onSupabaseClientChange: vi.fn(() => () => {})
  }
})

vi.mock('@/stores/auth', () => ({ useAuthStore: () => mocks.auth }))

function createSyncStore() {
  return reactive({
    syncBackend: 'supabase',
    syncPaused: false,
    isSyncing: false,
    isPulling: false,
    lastSyncedAt: '',
    deviceId: 'device-1',
    pull: vi.fn(async () => ({})),
    isSupabaseMode() { return this.syncBackend === 'supabase' }
  })
}

function mountRealtime(syncStore) {
  const Harness = defineComponent({
    setup() {
      useRealtimeSync({ syncStore })
      return () => h('div')
    }
  })
  return mount(Harness)
}

function emitStatus(status) {
  mocks.callbacks[mocks.callbacks.length - 1](status)
}

describe('useRealtimeSync realtime state', () => {
  let wrapper
  let syncStore

  beforeEach(() => {
    vi.useFakeTimers()
    mocks.callbacks.length = 0
    mocks.socketUp.value = true
    mocks.auth.user = { id: 'user-1' }
    mocks.reconnectSupabase.mockClear()
    realtimeState.value = { status: 'idle', reason: '', attempt: 0, changedAt: 0 }
    syncStore = createSyncStore()
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.useRealTimers()
  })

  it('subscribe 成功后置为 connected', () => {
    wrapper = mountRealtime(syncStore)
    expect(realtimeState.value.status).toBe('connecting')

    emitStatus('SUBSCRIBED')
    expect(realtimeState.value.status).toBe('connected')
    expect(realtimeState.value.reason).toBe('')
    expect(realtimeState.value.attempt).toBe(0)
  })

  it('CHANNEL_ERROR 进入 reconnecting 并按退避自动重建恢复', async () => {
    wrapper = mountRealtime(syncStore)
    emitStatus('SUBSCRIBED')

    emitStatus('CHANNEL_ERROR')
    expect(realtimeState.value.status).toBe('reconnecting')
    expect(realtimeState.value.reason).toBe('CHANNEL_ERROR')
    expect(realtimeState.value.attempt).toBe(1)

    await vi.advanceTimersByTimeAsync(4000)
    expect(mocks.reconnectSupabase).toHaveBeenCalled()
    expect(realtimeState.value.status).toBe('connecting')

    emitStatus('SUBSCRIBED')
    expect(realtimeState.value.status).toBe('connected')
    expect(realtimeState.value.attempt).toBe(0)
  })

  it('暂停自动同步后置为 disabled', async () => {
    wrapper = mountRealtime(syncStore)
    emitStatus('SUBSCRIBED')

    syncStore.syncPaused = true
    await nextTick()
    expect(realtimeState.value.status).toBe('disabled')
  })

  it('WebSocket 静默断开：连续两轮巡检才判定真死并重建', async () => {
    wrapper = mountRealtime(syncStore)
    emitStatus('SUBSCRIBED')
    mocks.socketUp.value = false

    await vi.advanceTimersByTimeAsync(30_000)
    expect(realtimeState.value.status).toBe('connected')

    await vi.advanceTimersByTimeAsync(30_000)
    expect(realtimeState.value.status).toBe('reconnecting')
    expect(realtimeState.value.reason).toBe('socket-down')

    await vi.advanceTimersByTimeAsync(3000)
    expect(realtimeState.value.status).toBe('connecting')
    expect(mocks.reconnectSupabase).not.toHaveBeenCalled()
  })

  it('requestRealtimeReconnect 立即重建并重置退避', async () => {
    wrapper = mountRealtime(syncStore)
    emitStatus('CHANNEL_ERROR')
    expect(realtimeState.value.status).toBe('reconnecting')

    requestRealtimeReconnect()
    await vi.advanceTimersByTimeAsync(0)

    expect(realtimeState.value.status).toBe('connecting')
    expect(realtimeState.value.attempt).toBe(0)
    expect(realtimeState.value.reason).toBe('')
  })
})
