import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { getSupabaseClient, reconnectSupabase, onSupabaseClientChange } from '@/utils/sync/supabaseClient'
import { useAuthStore } from '@/stores/auth'
import { createLogger } from '@/utils/logger'

/**
 * Supabase Realtime 订阅 composable
 * 监听主数据表的变更，过滤自己的写入，触发 pull（增量模式）
 *
 * Android WebView / 弱网下 WebSocket 常静默断开或落到 CHANNEL_ERROR/TIMED_OUT/CLOSED，
 * 这里统一走 scheduleRebuild：指数退避 + 抖动，成功订阅后重置退避；前台还有健康巡检兜底。
 */
const REALTIME_TABLES = ['goods', 'events', 'recharge_records', 'goods_groups', 'goods_group_items']
const REBUILD_BASE_MS = 2000
const REBUILD_MAX_MS = 60_000
const HEALTH_CHECK_MS = 30_000
// 底层 WebSocket 静默断开（Android 切网/休眠后常见）时 phoenix 可能自己重连，
// 连续两轮巡检仍为断开才判定真死，避免与库自带重连打架
const SOCKET_DOWN_TICKS = 2
// 连接尝试可能永远卡在 CONNECTING（phoenix 不给它超时，channel.join 也一直排队不回调），
// 此时只能靠强拆 disconnect() 重新 connect()
const SOCKET_KICK_WAIT_MS = 2000
// subscribe() 之后迟迟收不到任何状态回调 = 回调没挂上（同名 channel 复用）或 join 一直排队
const SUBSCRIBE_WATCHDOG_MS = 15_000
const STALE_CHANNEL_WAIT_MS = 1500
const CHANNEL_NAME = 'data-realtime'
const CHANNEL_TOPIC = `realtime:${CHANNEL_NAME}`

/**
 * 模块级共享状态：App.vue 只实例化一次，云同步设置页（SyncView）直接读它展示实时推送状态。
 * status: idle | disabled | connecting | connected | reconnecting | disconnected
 */
export const realtimeState = ref({
  status: 'idle',
  reason: '',
  attempt: 0,
  changedAt: 0
})

let reconnectRequestHandler = null

/** 手动触发一次立即重连（设置页「立即重连」按钮），未初始化时静默忽略 */
export function requestRealtimeReconnect() {
  reconnectRequestHandler?.()
}

export function useRealtimeSync({ syncStore }) {
  const log = createLogger('realtime')
  const channel = ref(null)
  const isConnected = ref(false)
  let pullDebounceTimer = null
  let retryTimer = null

  let rebuildTimer = null
  let rebuildAttempt = 0
  let isRebuilding = false
  let healthTimer = null
  let visibilityDebounceTimer = null
  let subscribeWatchdogTimer = null
  let isSubscribing = false

  function doPull() {
    if (syncStore.syncPaused) return
    if (syncStore.isSyncing || syncStore.isPulling) {
      scheduleRetryPull()
      return
    }
    const since = syncStore.lastSyncedAt ? new Date(syncStore.lastSyncedAt).getTime() : 0
    try {
      // tables 只作为增量模式开关传给 pull（sync_pull 本身就是全域增量），不做数据过滤
      void syncStore.pull({ tables: REALTIME_TABLES, since, source: 'realtime' })
    } catch {
      // silent fail
    }
  }

  // 到点仍被在途同步占位时重新排队，而不是丢弃这次远端变更——
  // 否则只能等下一次编辑/切前台/手动同步，跨设备表现为「对方改了我这边迟迟不来」
  function scheduleRetryPull() {
    if (retryTimer) return
    retryTimer = setTimeout(async () => {
      retryTimer = null
      if (syncStore.syncPaused) return
      if (syncStore.isSyncing || syncStore.isPulling) {
        scheduleRetryPull()
        return
      }
      doPull()
    }, 2000)
  }

  function handleRemoteChange(payload) {
    const row = payload.new || payload.old
    if (!row) return
    // 安全兜底：服务端已通过 filter=user_id 过滤，这里再检查一次
    const authStore = useAuthStore()
    const currentUserId = authStore.user?.id || ''
    if (currentUserId && row.user_id && row.user_id !== currentUserId) return
    // 过滤掉自己设备的写入（自己改的不需要再拉取）
    if (row.synced_by && row.synced_by === syncStore.deviceId) return
    if (pullDebounceTimer) clearTimeout(pullDebounceTimer)
    pullDebounceTimer = setTimeout(() => {
      pullDebounceTimer = null
      doPull()
    }, 500)
  }

  function unsubscribe() {
    if (pullDebounceTimer) { clearTimeout(pullDebounceTimer); pullDebounceTimer = null }
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
    clearSubscribeWatchdog()
    if (channel.value) {
      try { channel.value.unsubscribe() } catch { /* ignore */ }
      channel.value = null
      isConnected.value = false
    }
  }

  function clearSubscribeWatchdog() {
    if (subscribeWatchdogTimer) {
      clearTimeout(subscribeWatchdogTimer)
      subscribeWatchdogTimer = null
    }
  }

  // 底层 WebSocket 不通/卡住时先强拆：RealtimeClient.connect() 会被 isConnecting() 短路，
  // 只重订阅救不回来。返回是否执行了强拆（执行了就无需再走端点探测）。
  async function kickDeadSocket() {
    const realtime = getSupabaseClient()?.realtime
    if (!realtime || typeof realtime.isConnected !== 'function') return false
    if (realtime.isConnected()) return false
    if (typeof realtime.disconnect === 'function') {
      try {
        await Promise.race([
          realtime.disconnect(),
          new Promise((resolve) => setTimeout(resolve, SOCKET_KICK_WAIT_MS))
        ])
      } catch { /* ignore */ }
    }
    return true
  }

  // supabase-js 按 topic 复用 channel：上一次 unsubscribe 是异步的，残留实例若还停在
  // leaving/joining，subscribe() 会跳过回调注册（既不 SUBSCRIBED 也不报错），
  // 状态就永远停在 connecting。这里先把同名残留清干净再新建。
  async function dropStaleChannels(db) {
    const stale = (typeof db.getChannels === 'function' ? db.getChannels() : [])
      .filter((item) => item?.topic === CHANNEL_TOPIC)
    for (const item of stale) {
      try {
        await Promise.race([
          item.unsubscribe(),
          new Promise((resolve) => setTimeout(resolve, STALE_CHANNEL_WAIT_MS))
        ])
      } catch { /* ignore */ }
      try { item.teardown?.() } catch { /* ignore */ }
    }
  }

  function clearRebuildTimer() {
    if (rebuildTimer) {
      clearTimeout(rebuildTimer)
      rebuildTimer = null
    }
  }

  function canOperate() {
    if (syncStore.syncPaused) return false
    if (!syncStore.isSupabaseMode()) return false
    const authStore = useAuthStore()
    return !!authStore.user?.id
  }

  function computeStatus() {
    if (!canOperate()) return 'disabled'
    // 重建排队/进行中优先：静默断线时本地 isConnected 可能还停在 true
    if (isRebuilding || rebuildTimer) return 'reconnecting'
    if (isConnected.value) return 'connected'
    if (channel.value) return 'connecting'
    return 'disconnected'
  }

  // 把当前连接状态发布到模块级 realtimeState，供设置页展示。
  // 只在 status / reason / attempt 真变化时写入，避免巡检心跳刷屏 changedAt。
  function publishState(reason) {
    const status = computeStatus()
    const prev = realtimeState.value
    const keepReason = status === 'reconnecting' || status === 'disconnected'
    const nextReason = keepReason ? (reason !== undefined ? reason : prev.reason) : ''
    if (prev.status === status && prev.reason === nextReason && prev.attempt === rebuildAttempt) return
    realtimeState.value = { status, reason: nextReason, attempt: rebuildAttempt, changedAt: Date.now() }
  }

  async function rebuildChannel(reason) {
    if (isRebuilding) return
    if (!canOperate()) { publishState(); return }
    isRebuilding = true
    publishState(reason)
    try {
      log.info('rebuilding channel:', reason, 'attempt', rebuildAttempt + 1)
      unsubscribe()
      // WebSocket 已死/卡在 CONNECTING：先强拆让它重新 connect；
      // socket 活着时才走端点探测，避免复用过期 DNS 缓存 / 半死实例
      const kicked = await kickDeadSocket()
      if (!kicked && reason !== 'health' && reason !== 'subscribe-failed') {
        await reconnectSupabase()
      }
      await subscribe()
    } catch (e) {
      console.warn('[realtime] rebuild failed:', e?.message || e)
      scheduleRebuild('rebuild-failed')
    } finally {
      isRebuilding = false
      publishState()
    }
  }

  function scheduleRebuild(reason) {
    if (rebuildTimer) return
    if (!canOperate()) { publishState(); return }

    const backoff = Math.min(REBUILD_BASE_MS * (2 ** rebuildAttempt), REBUILD_MAX_MS)
    const jitter = backoff * (0.7 + Math.random() * 0.6)
    const delay = Math.round(jitter)
    rebuildAttempt = Math.min(rebuildAttempt + 1, 6)

    log.info('schedule rebuild:', reason, `in ${delay}ms`)
    // 先挂上定时器再发布状态：publishState 靠 rebuildTimer 判定 reconnecting
    rebuildTimer = setTimeout(() => {
      rebuildTimer = null
      void rebuildChannel(reason)
    }, delay)
    publishState(reason)
  }

  async function subscribe() {
    if (channel.value || isSubscribing) return
    if (!syncStore.isSupabaseMode()) return
    isSubscribing = true
    clearSubscribeWatchdog()

    try {
      const db = getSupabaseClient()
      if (!db) {
        scheduleRebuild('no-client')
        return
      }

      const authStore = useAuthStore()
      const userId = authStore.user?.id
      if (!userId) return

      await dropStaleChannels(db)

      let builder = db.channel(CHANNEL_NAME)
      for (const table of REALTIME_TABLES) {
        builder = builder.on('postgres_changes', {
          event: '*',
          schema: 'public',
          table,
          filter: `user_id=eq.${userId}`
        }, handleRemoteChange)
      }
      channel.value = builder.subscribe((status) => {
        clearSubscribeWatchdog()
        isConnected.value = status === 'SUBSCRIBED'
        log.info('channel status:', status)
        if (status === 'SUBSCRIBED') {
          rebuildAttempt = 0
          clearRebuildTimer()
          publishState('')
          return
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          // 先清掉半死 channel，再走退避重建；realtime client 不会自动从 channel 级错误恢复
          scheduleRebuild(status)
          return
        }
        publishState(status)
      })
      // 回调迟迟不来 = 没挂上或 join 一直排队：强制走重建，别让状态卡在 connecting
      subscribeWatchdogTimer = setTimeout(() => {
        subscribeWatchdogTimer = null
        if (isConnected.value || document.hidden) return
        log.warn('subscribe watchdog fired, forcing rebuild')
        scheduleRebuild('subscribe-timeout')
      }, SUBSCRIBE_WATCHDOG_MS)
      publishState()
    } catch (e) {
      console.warn('[realtime] subscribe failed:', e.message)
      scheduleRebuild('subscribe-failed')
    } finally {
      isSubscribing = false
    }
  }

  let socketDownTicks = 0

  function startHealthCheck() {
    stopHealthCheck()
    healthTimer = setInterval(() => {
      if (document.hidden) return
      if (!canOperate()) return
      if (isRebuilding || rebuildTimer) return

      // 底层 WebSocket 静默断开/卡住：channel 级回调可能一动不动，这里直接探 socket。
      // 卡在 CONNECTING 时 phoenix 不会自己超时，同样要算死（否则永远停在 connecting）。
      // 连续两轮巡检为断开才判定真死，避免与库自带重连打架。
      const realtime = getSupabaseClient()?.realtime
      const socketDead = !!realtime && typeof realtime.isConnected === 'function' && !realtime.isConnected()
      if (socketDead) {
        socketDownTicks += 1
        if (socketDownTicks >= SOCKET_DOWN_TICKS) {
          socketDownTicks = 0
          const stuck = typeof realtime.isConnecting === 'function' && !!realtime.isConnecting()
          scheduleRebuild(stuck ? 'socket-stuck' : 'socket-down')
        }
        return
      }
      socketDownTicks = 0

      // channel 还在但未 SUBSCRIBED：静默半死，触发轻量重建
      if (!channel.value || !isConnected.value) {
        scheduleRebuild('health')
        return
      }
      publishState()
    }, HEALTH_CHECK_MS)
  }

  function stopHealthCheck() {
    if (healthTimer) {
      clearInterval(healthTimer)
      healthTimer = null
    }
  }

  watch(() => syncStore.syncBackend, (backend) => {
    if (backend === 'supabase') {
      void subscribe()
    } else {
      clearRebuildTimer()
      stopHealthCheck()
      unsubscribe()
    }
    publishState()
  })

  watch(() => syncStore.syncPaused, () => publishState())

  async function handleVisibilityChange() {
    if (document.hidden) {
      return
    }

    // Supabase 模式：回到前台时重建连接 + 重新订阅 + 增量拉取
    if (visibilityDebounceTimer) clearTimeout(visibilityDebounceTimer)
    visibilityDebounceTimer = setTimeout(async () => {
      if (syncStore.syncPaused) return
      if (syncStore.isSupabaseMode() && !syncStore.isSyncing && !syncStore.isPulling) {
        rebuildAttempt = 0
        clearRebuildTimer()
        unsubscribe()
        await reconnectSupabase()
        await subscribe()
        const since = syncStore.lastSyncedAt ? new Date(syncStore.lastSyncedAt).getTime() : 0
        try { await syncStore.pull({ tables: [...REALTIME_TABLES], since, source: 'visibility' }) } catch { /* ignore */ }
        startHealthCheck()
        publishState()
      }
    }, 2000)
  }

  // client 实例被替换（端点切换 / 初始化变更）时，旧 channel 已随旧实例销毁。
  // 这里主动退订：client 非空就在新实例上立刻重订阅，避免停留在已死的连接上等不到数据。
  // （探测失败不再销毁实例，所以网络抖动不会打断 Realtime。）
  const stopClientWatch = onSupabaseClientChange((client) => {
    unsubscribe()
    rebuildAttempt = 0
    clearRebuildTimer()
    if (client && canOperate()) void subscribe()
    publishState()
  })

  // 设置页「立即重连」：清掉退避定时器，立刻做一次全量重建
  reconnectRequestHandler = () => {
    if (!canOperate()) return
    clearRebuildTimer()
    rebuildAttempt = 0
    void rebuildChannel('manual')
  }

  // user / 同步后端就绪（或变化）时（重新）订阅；任一未就绪则退订
  const authStore = useAuthStore()
  watch(
    () => [authStore.user?.id, syncStore.syncBackend],
    ([uid, backend]) => {
      if (uid && backend === 'supabase') {
        rebuildAttempt = 0
        void subscribe()
        startHealthCheck()
      } else {
        clearRebuildTimer()
        stopHealthCheck()
        unsubscribe()
      }
      publishState()
    },
    { immediate: true }
  )

  onMounted(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange, { passive: true })
  })

  onBeforeUnmount(() => {
    stopClientWatch()
    clearRebuildTimer()
    stopHealthCheck()
    if (visibilityDebounceTimer) { clearTimeout(visibilityDebounceTimer); visibilityDebounceTimer = null }
    unsubscribe()
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    reconnectRequestHandler = null
    realtimeState.value = { status: 'idle', reason: '', attempt: 0, changedAt: Date.now() }
  })

  return { isConnected, subscribe, unsubscribe }
}
