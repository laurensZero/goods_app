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
// 预设与收藏馆背景均使用独立行级表。
const REALTIME_TABLES = ['goods', 'events', 'recharge_records', 'goods_groups', 'goods_group_items', 'sync_preset_rows', 'collection_profiles']
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
// 每张表一个 channel：Supabase 的 postgres_changes 校验是 channel 级的，
// 一张表配置异常（不在 publication / 缺 REPLICA IDENTITY / 缺列）会让同 channel
// 上其它表的订阅一起失败。拆开后单表故障只影响它自己，日志也能直接定位表名。
const CHANNEL_PREFIX = 'data-realtime'

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
  // table -> channel
  const channels = new Map()
  const subscribedTables = new Set()
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
  let authRetryTimer = null
  let authRetryAttempt = 0
  let authRetryLogged = false
  let socketDownTicks = 0
  // 待重建范围：All = 连接级重建；rebuildTables = 只重建指定表（表级配置错误不影响其它表）
  let rebuildAllPending = false
  const rebuildTables = new Set()

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
    clearAuthRetry()
    clearSubscribeWatchdog()
    // 先清表（map）再退订：unsubscribe() 可能同步回调 CLOSED，
    // 回调里发现 channel 已不在 map 就会忽略，不会把主动退订误判成故障并排重建
    const pending = [...channels.values()]
    channels.clear()
    subscribedTables.clear()
    isConnected.value = false
    for (const channel of pending) {
      try { channel.unsubscribe() } catch { /* ignore */ }
    }
  }

  function clearSubscribeWatchdog() {
    if (subscribeWatchdogTimer) {
      clearTimeout(subscribeWatchdogTimer)
      subscribeWatchdogTimer = null
    }
  }

  function recomputeConnected() {
    const connected = subscribedTables.size === REALTIME_TABLES.length
    isConnected.value = connected
    return connected
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
    const active = new Set(channels.values())
    const prefix = `realtime:${CHANNEL_PREFIX}`
    const stale = (typeof db.getChannels === 'function' ? db.getChannels() : [])
      .filter((item) => typeof item?.topic === 'string' && item.topic.startsWith(prefix) && !active.has(item))
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

  // 会话 token 是否还够用：快过期的 token 先走 getSession() 触发刷新，
  // 避免拿一个即将失效的 JWT 去 join，随后又因 401 被踢下线重来。
  function hasUsableToken(session) {
    if (!session?.access_token) return false
    const expiresAt = Number(session.expires_at || 0) * 1000
    return !expiresAt || expiresAt - Date.now() > 30_000
  }

  async function resolveRealtimeToken(db) {
    const session = useAuthStore().session
    if (hasUsableToken(session)) return session.access_token
    try {
      const { data } = (await db?.auth?.getSession?.()) || {}
      const fresh = data?.session
      return fresh?.access_token || (hasUsableToken(session) ? session.access_token : '')
    } catch {
      // getSession 失败（弱网刷新失败）时只在原 token 仍有效时沿用；
      // 已过期就等待刷新成功，绝不退化成 anon，也不拿过期 JWT 去 join。
      return hasUsableToken(session) ? session.access_token : ''
    }
  }

  /**
   * 在创建/重建 channel 之前显式同步 Realtime 的 JWT。
   * supabase-js 的 channel.subscribe() 会同步读取 realtime.accessTokenValue 作为 join payload，
   * 不会等待 auth 初始化；冷启动/后台恢复时先 subscribe 就会以 anon 身份 join，
   * 触发 P0001 invalid column for filter user_id。
   * @returns {Promise<boolean>} 是否已具备可用的登录身份
   */
  async function ensureRealtimeAuth(db) {
    if (!db?.realtime || typeof db.realtime.setAuth !== 'function') return true
    const token = await resolveRealtimeToken(db)
    if (!token) {
      if (!authRetryLogged) {
        log.warn('realtime auth token not ready, waiting before subscribe (avoid anon join)')
        authRetryLogged = true
      }
      return false
    }
    authRetryLogged = false
    authRetryAttempt = 0
    try {
      await db.realtime.setAuth(token)
      return true
    } catch (e) {
      log.warn('realtime setAuth failed:', e?.message || e)
      return false
    }
  }

  function clearAuthRetry() {
    if (authRetryTimer) {
      clearTimeout(authRetryTimer)
      authRetryTimer = null
    }
  }

  // auth 还没就绪时不要创建 channel：拿 anon 身份 join 只会换来 P0001。
  // 这里短暂轮询 session，就绪后自动补订阅；长时间拿不到就放慢轮询。
  function scheduleAuthRetry() {
    if (authRetryTimer) return
    const delay = Math.min(1500 * (2 ** authRetryAttempt), 30_000)
    authRetryAttempt = Math.min(authRetryAttempt + 1, 5)
    authRetryTimer = setTimeout(() => {
      authRetryTimer = null
      if (!canOperate()) { publishState(); return }
      void subscribe()
    }, delay)
    publishState('auth-pending')
  }

  function computeStatus() {
    if (!canOperate()) return 'disabled'
    // 重建排队/进行中优先：静默断线时本地 isConnected 可能还停在 true
    if (isRebuilding || rebuildTimer || authRetryTimer) return 'reconnecting'
    if (isConnected.value) return 'connected'
    if (channels.size > 0 || isSubscribing) return 'connecting'
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

  function teardownTable(table) {
    const channel = channels.get(table)
    channels.delete(table)
    subscribedTables.delete(table)
    recomputeConnected()
    if (channel) {
      try { channel.unsubscribe() } catch { /* ignore */ }
    }
  }

  function handleTableChannelError(table, status, err) {
    const detail = String(err?.message || '')
    log.warn(`channel ${table} failed:`, status, detail)
    if (/invalid column for filter/i.test(detail)) {
      log.error(
        `channel ${table}: invalid column for filter user_id — 检查 public.${table} 是否在 supabase_realtime publication 中、` +
        'REPLICA IDENTITY 是否为 FULL、user_id 列是否存在，以及 Realtime 是否误用 anon 身份订阅' +
        '（见 supabase/supabase-migration-realtime-filter-fix.sql）'
      )
    }
    // 表级错误（publication / replica identity / 列权限）不是连接问题：
    // 只重建这一张表，别把其它表的健康订阅一起拆掉
    teardownTable(table)
    scheduleRebuild(status, table)
  }

  function subscribeTable(db, table) {
    if (channels.has(table)) return
    if (!syncStore.isSupabaseMode()) return
    const userId = useAuthStore().user?.id
    if (!userId) return

    const channel = db.channel(`${CHANNEL_PREFIX}:${table}`)
    channels.set(table, channel)
    channel.on('postgres_changes', {
      event: '*',
      schema: 'public',
      table,
      filter: `user_id=eq.${userId}`
    }, handleRemoteChange)
    channel.subscribe((status, err) => {
      // 已被 teardown / 重建替换掉的旧 channel 回调直接丢弃
      if (channels.get(table) !== channel) return

      log.info(`channel ${table}:`, status, err?.message || '')
      if (status === 'SUBSCRIBED') {
        subscribedTables.add(table)
        // 全部表都订阅成功才清看门狗：个别表回调迟迟不来时仍要能触发重建
        if (recomputeConnected()) {
          clearSubscribeWatchdog()
          rebuildAttempt = 0
          socketDownTicks = 0
          clearRebuildTimer()
          publishState('')
        } else {
          publishState()
        }
        return
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        clearSubscribeWatchdog()
        handleTableChannelError(table, status, err)
        return
      }
      publishState(status)
    })
  }

  async function rebuildChannel(reason) {
    if (isRebuilding) return
    if (!canOperate()) { publishState(); return }
    isRebuilding = true
    publishState(reason)
    try {
      log.info('rebuilding channel:', reason, 'attempt', rebuildAttempt + 1)
      rebuildAllPending = false
      rebuildTables.clear()
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

  // 只重建指定的表：表级配置错误（publication / replica identity）不会波及其它表
  async function rebuildTableChannels(tables, reason) {
    if (!canOperate()) { publishState(); return }
    let db = null
    try { db = getSupabaseClient() } catch { /* not initialized yet */ }
    if (!db) { scheduleRebuild('no-client'); return }
    // 表级重建同样要先同步 JWT：否则重试仍会以 anon 身份 join，P0001 永远不停
    if (!(await ensureRealtimeAuth(db))) { scheduleAuthRetry(); return }
    isRebuilding = true
    publishState(reason)
    try {
      for (const table of tables) subscribeTable(db, table)
    } catch (e) {
      console.warn('[realtime] table rebuild failed:', e?.message || e)
      for (const table of tables) rebuildTables.add(table)
      scheduleRebuild('rebuild-failed')
    } finally {
      isRebuilding = false
      publishState()
    }
  }

  function addRebuildScope(table) {
    if (!table || table === false) {
      rebuildAllPending = true
      return
    }
    if (Array.isArray(table)) {
      for (const name of table) rebuildTables.add(name)
      return
    }
    rebuildTables.add(table)
  }

  function scheduleRebuild(reason, table = null) {
    addRebuildScope(table)
    if (rebuildTimer) return
    if (!canOperate()) { publishState(); return }

    const backoff = Math.min(REBUILD_BASE_MS * (2 ** rebuildAttempt), REBUILD_MAX_MS)
    const jitter = backoff * (0.7 + Math.random() * 0.6)
    const delay = Math.round(jitter)
    rebuildAttempt = Math.min(rebuildAttempt + 1, 6)

    log.info('schedule rebuild:', reason, table || 'all', `in ${delay}ms`)
    // 先挂上定时器再发布状态：publishState 靠 rebuildTimer 判定 reconnecting
    rebuildTimer = setTimeout(() => {
      rebuildTimer = null
      const rebuildAll = rebuildAllPending
      const tables = [...rebuildTables]
      rebuildAllPending = false
      rebuildTables.clear()
      if (rebuildAll || tables.length === 0) {
        void rebuildChannel(reason)
      } else {
        void rebuildTableChannels(tables, reason)
      }
    }, delay)
    publishState(reason)
  }

  async function subscribe() {
    if (isSubscribing) return
    if (!syncStore.isSupabaseMode()) return

    const authStore = useAuthStore()
    const userId = authStore.user?.id
    if (!userId) return
    if (channels.size >= REALTIME_TABLES.length) return

    isSubscribing = true
    clearSubscribeWatchdog()

    try {
      const db = getSupabaseClient()
      if (!db) { scheduleRebuild('no-client'); return }

      // 必须等 Realtime 拿到登录 JWT 再创建 channel：channel.subscribe() 会同步读取
      // realtime.accessTokenValue，尚未 setAuth 时会以 anon 身份 join 并触发 P0001。
      if (!(await ensureRealtimeAuth(db))) {
        scheduleAuthRetry()
        return
      }

      // 全量重建时先清理同名残留；只补缺失表时不能碰已订阅的 channel
      if (channels.size === 0) await dropStaleChannels(db)

      for (const table of REALTIME_TABLES) {
        if (!channels.has(table)) subscribeTable(db, table)
      }
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

  // 读底层 socket 状态；client 尚未初始化时按「网络不可用」处理，不抛异常
  function getSocketHealth() {
    try {
      const realtime = getSupabaseClient()?.realtime
      if (!realtime || typeof realtime.isConnected !== 'function') return { alive: true, stuck: false }
      return {
        alive: !!realtime.isConnected(),
        stuck: typeof realtime.isConnecting === 'function' && !!realtime.isConnecting()
      }
    } catch {
      return { alive: false, stuck: false }
    }
  }

  function startHealthCheck() {
    stopHealthCheck()
    healthTimer = setInterval(() => {
      if (document.hidden) return
      if (!canOperate()) return
      if (isRebuilding || rebuildTimer) return

      // 底层 WebSocket 静默断开/卡住：channel 级回调可能一动不动，这里直接探 socket。
      // 卡在 CONNECTING 时 phoenix 不会自己超时，同样要算死（否则永远停在 connecting）。
      // 连续两轮巡检为断开才判定真死，避免与库自带重连打架。
      const socket = getSocketHealth()
      if (!socket.alive) {
        socketDownTicks += 1
        if (socketDownTicks >= SOCKET_DOWN_TICKS) {
          socketDownTicks = 0
          scheduleRebuild(socket.stuck ? 'socket-stuck' : 'socket-down')
        }
        return
      }
      socketDownTicks = 0

      // channel 还在但未 SUBSCRIBED：只补缺失的表，不要把已健康的订阅一起拆掉
      if (!channels.size) {
        scheduleRebuild('health')
        return
      }
      if (!isConnected.value) {
        const missing = REALTIME_TABLES.filter((table) => !channels.has(table))
        if (missing.length > 0) scheduleRebuild('health', missing)
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

    // Supabase 模式：回到前台时按需重建连接 + 重新订阅 + 增量拉取
    if (visibilityDebounceTimer) clearTimeout(visibilityDebounceTimer)
    visibilityDebounceTimer = setTimeout(async () => {
      if (syncStore.syncPaused) return
      if (!syncStore.isSupabaseMode() || syncStore.isSyncing || syncStore.isPulling) return

      rebuildAttempt = 0
      clearRebuildTimer()
      rebuildAllPending = false
      rebuildTables.clear()

      // 所有表都还 SUBSCRIBED 且底层 socket 活着时不要拆掉重建：
      // 拆建会清空 channel 且在重新 join 完成前漏掉远端事件；只有确实不健康才重连
      const socketAlive = getSocketHealth().alive
      if (!socketAlive || !isConnected.value || channels.size !== REALTIME_TABLES.length) {
        unsubscribe()
        await reconnectSupabase()
        await subscribe()
      }

      const since = syncStore.lastSyncedAt ? new Date(syncStore.lastSyncedAt).getTime() : 0
      try { await syncStore.pull({ tables: [...REALTIME_TABLES], since, source: 'visibility' }) } catch { /* ignore */ }
      startHealthCheck()
      publishState()
    }, 2000)
  }

  // client 实例被替换（端点切换 / 初始化变更）时，旧 channel 已随旧实例销毁。
  // 这里主动退订：client 非空就在新实例上立刻重订阅，避免停留在已死的连接上等不到数据。
  // （探测失败不再销毁实例，所以网络抖动不会打断 Realtime。）
  const stopClientWatch = onSupabaseClientChange((client) => {
    unsubscribe()
    rebuildAttempt = 0
    rebuildAllPending = false
    rebuildTables.clear()
    clearRebuildTimer()
    if (client && canOperate()) void subscribe()
    publishState()
  })

  // 设置页「立即重连」：清掉退避定时器，立刻做一次全量重建
  reconnectRequestHandler = () => {
    if (!canOperate()) return
    clearRebuildTimer()
    rebuildAttempt = 0
    rebuildAllPending = false
    rebuildTables.clear()
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
