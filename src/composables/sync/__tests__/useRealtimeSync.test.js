// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h, nextTick, reactive } from 'vue'
import { mount } from '@vue/test-utils'
import { realtimeState, requestRealtimeReconnect, useRealtimeSync } from '@/composables/sync/useRealtimeSync'

const mocks = vi.hoisted(() => ({
  channels: [],
  staleChannels: [],
  socketUp: { value: true },
  socketConnecting: { value: false },
  auth: { user: { id: 'user-1' }, session: null },
  disconnect: vi.fn(async () => 'ok'),
  reconnectSupabase: vi.fn(async () => true),
  getSession: vi.fn(async () => ({ data: { session: null } })),
  setAuth: vi.fn(async () => {})
}))

vi.mock('@/utils/sync/supabaseClient', () => {
  return {
    getSupabaseClient: vi.fn(() => ({
      channel(name) {
        const channel = {
          topic: `realtime:${name}`,
          on() { return channel },
          subscribe(cb) {
            mocks.channels.push({ topic: channel.topic, callback: cb, channel })
            return channel
          },
          unsubscribe() {}
        }
        return channel
      },
      getChannels: () => mocks.staleChannels,
      auth: {
        getSession: mocks.getSession
      },
      realtime: {
        isConnected: () => mocks.socketUp.value,
        isConnecting: () => mocks.socketConnecting.value,
        disconnect: mocks.disconnect,
        setAuth: mocks.setAuth
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

function tableTopic(table) {
  return `realtime:data-realtime:${table}`
}

function latestChannel(table) {
  for (let i = mocks.channels.length - 1; i >= 0; i--) {
    if (mocks.channels[i].topic === tableTopic(table)) return mocks.channels[i]
  }
  return null
}

// 所有表一起发状态（连接级事件）
function emitStatus(status) {
  for (const item of [...mocks.channels]) item.callback(status)
}

// 只给某张表发状态（表级事件）
function emitStatusFor(table, status) {
  latestChannel(table)?.callback(status)
}

describe('useRealtimeSync realtime state', () => {
  let wrapper
  let syncStore

  beforeEach(() => {
    vi.useFakeTimers()
    mocks.channels.length = 0
    mocks.staleChannels.length = 0
    mocks.socketUp.value = true
    mocks.socketConnecting.value = false
    mocks.auth.user = { id: 'user-1' }
    mocks.auth.session = { access_token: 'token-1', expires_at: Math.floor(Date.now() / 1000) + 3600 }
    mocks.getSession.mockReset()
    mocks.getSession.mockResolvedValue({ data: { session: mocks.auth.session } })
    mocks.setAuth.mockClear()
    mocks.disconnect.mockClear()
    mocks.reconnectSupabase.mockClear()
    realtimeState.value = { status: 'idle', reason: '', attempt: 0, changedAt: 0 }
    syncStore = createSyncStore()
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.useRealTimers()
  })

  // subscribe 内部有 await（清理残留 channel），需要先把微任务跑完
  async function mountReady() {
    wrapper = mountRealtime(syncStore)
    await vi.advanceTimersByTimeAsync(0)
  }

  it('subscribe 成功后置为 connected', async () => {
    await mountReady()
    expect(realtimeState.value.status).toBe('connecting')

    emitStatus('SUBSCRIBED')
    expect(realtimeState.value.status).toBe('connected')
    expect(realtimeState.value.reason).toBe('')
    expect(realtimeState.value.attempt).toBe(0)
  })

  it('创建 channel 前先同步 Realtime JWT，避免以 anon 角色 join 触发 P0001', async () => {
    await mountReady()

    expect(mocks.setAuth).toHaveBeenCalledWith('token-1')
    expect(mocks.channels).toHaveLength(7)
  })

  it('session 未就绪时不创建 channel，token 到达后自动补订阅', async () => {
    mocks.auth.session = null
    mocks.getSession.mockResolvedValueOnce({ data: { session: null } })

    await mountReady()
    expect(mocks.channels).toHaveLength(0)
    expect(realtimeState.value.status).toBe('reconnecting')
    expect(realtimeState.value.reason).toBe('auth-pending')

    await vi.advanceTimersByTimeAsync(1500)
    expect(mocks.setAuth).toHaveBeenCalledWith('token-1')
    expect(mocks.channels).toHaveLength(7)
  })

  it('单表 CHANNEL_ERROR 只重建该表，不影响其它表', async () => {
    await mountReady()
    emitStatus('SUBSCRIBED')

    emitStatusFor('goods', 'CHANNEL_ERROR')
    expect(realtimeState.value.status).toBe('reconnecting')
    expect(realtimeState.value.reason).toBe('CHANNEL_ERROR')
    expect(realtimeState.value.attempt).toBe(1)

    await vi.advanceTimersByTimeAsync(4000)
    // 表级故障不触发连接级重连
    expect(mocks.reconnectSupabase).not.toHaveBeenCalled()
    // 只重建 goods：其余表仍保持已订阅状态，goods 重新 join 成功后整体恢复
    emitStatusFor('goods', 'SUBSCRIBED')
    expect(realtimeState.value.status).toBe('connected')
    expect(realtimeState.value.attempt).toBe(0)
  })

  it('暂停自动同步后置为 disabled', async () => {
    await mountReady()
    emitStatus('SUBSCRIBED')

    syncStore.syncPaused = true
    await nextTick()
    expect(realtimeState.value.status).toBe('disabled')
  })

  it('回调迟迟不来：看门狗强制重建，状态不卡在 connecting', async () => {
    await mountReady()
    expect(realtimeState.value.status).toBe('connecting')

    await vi.advanceTimersByTimeAsync(15_000)
    expect(realtimeState.value.status).toBe('reconnecting')
    expect(realtimeState.value.reason).toBe('subscribe-timeout')
  })

  it('同名残留 channel 会被清掉再重建（避免复用后回调挂不上）', async () => {
    const stale = {
      topic: 'realtime:data-realtime',
      unsubscribe: vi.fn(async () => 'ok'),
      teardown: vi.fn()
    }
    mocks.staleChannels.push(stale)

    await mountReady()

    expect(stale.unsubscribe).toHaveBeenCalled()
    expect(stale.teardown).toHaveBeenCalled()
    expect(realtimeState.value.status).toBe('connecting')
  })

  it('WebSocket 静默断开：连续两轮巡检才判定真死并重建', async () => {
    await mountReady()
    emitStatus('SUBSCRIBED')
    mocks.socketUp.value = false

    await vi.advanceTimersByTimeAsync(30_000)
    expect(realtimeState.value.status).toBe('connected')

    await vi.advanceTimersByTimeAsync(30_000)
    expect(realtimeState.value.status).toBe('reconnecting')
    expect(realtimeState.value.reason).toBe('socket-down')

    await vi.advanceTimersByTimeAsync(3000)
    expect(realtimeState.value.status).toBe('connecting')
    expect(mocks.disconnect).toHaveBeenCalled()
    expect(mocks.reconnectSupabase).not.toHaveBeenCalled()
  })

  it('卡在 CONNECTING 的 socket 也会被强拆重连（否则永远停在 connecting）', async () => {
    await mountReady()
    emitStatus('SUBSCRIBED')
    mocks.socketUp.value = false
    mocks.socketConnecting.value = true

    await vi.advanceTimersByTimeAsync(60_000)
    expect(realtimeState.value.status).toBe('reconnecting')
    expect(realtimeState.value.reason).toBe('socket-stuck')

    await vi.advanceTimersByTimeAsync(3000)
    expect(mocks.disconnect).toHaveBeenCalled()
    expect(realtimeState.value.status).toBe('connecting')
  })

  it('requestRealtimeReconnect 立即重建并重置退避', async () => {
    await mountReady()
    emitStatus('CHANNEL_ERROR')
    expect(realtimeState.value.status).toBe('reconnecting')

    requestRealtimeReconnect()
    await vi.advanceTimersByTimeAsync(0)

    expect(realtimeState.value.status).toBe('connecting')
    expect(realtimeState.value.attempt).toBe(0)
    expect(realtimeState.value.reason).toBe('')
  })
})
