import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { getSupabaseClient, reconnectSupabase } from '@/utils/sync/supabaseClient'
import { useAuthStore } from '@/stores/auth'

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

export function useRealtimeSync({ syncStore }) {
  const channel = ref(null)
  const isConnected = ref(false)
  let pullDebounceTimer = null
  let pendingPullTables = new Set()
  let retryTimer = null

  let rebuildTimer = null
  let rebuildAttempt = 0
  let isRebuilding = false
  let healthTimer = null
  let visibilityDebounceTimer = null

  function doPull(tables) {
    if (syncStore.syncPaused) return
    if (syncStore.isSyncing || syncStore.isPulling) {
      if (!retryTimer) {
        retryTimer = setTimeout(async () => {
          retryTimer = null
          if (syncStore.syncPaused) return
          if (!syncStore.isSyncing && !syncStore.isPulling) {
            const since = syncStore.lastSyncedAt ? new Date(syncStore.lastSyncedAt).getTime() : 0
            try { await syncStore.pull({ tables, since, source: 'realtime' }) } catch { /* ignore */ }
          }
        }, 2000)
      }
      return
    }
    const since = syncStore.lastSyncedAt ? new Date(syncStore.lastSyncedAt).getTime() : 0
    try {
      void syncStore.pull({ tables, since, source: 'realtime' })
    } catch {
      // silent fail
    }
  }

  function handleRemoteChange(payload) {
    const row = payload.new || payload.old
    if (!row) return
    const table = String(payload?.table || '')
    // 安全兜底：服务端已通过 filter=user_id 过滤，这里再检查一次
    const authStore = useAuthStore()
    const currentUserId = authStore.user?.id || ''
    if (currentUserId && row.user_id && row.user_id !== currentUserId) return
    // 过滤掉自己设备的写入（自己改的不需要再拉取）
    if (row.synced_by && row.synced_by === syncStore.deviceId) return
    pendingPullTables.add(table)
    if (pullDebounceTimer) clearTimeout(pullDebounceTimer)
    pullDebounceTimer = setTimeout(() => {
      const tables = [...pendingPullTables]
      pendingPullTables.clear()
      doPull(tables)
    }, 500)
  }

  function unsubscribe() {
    if (pullDebounceTimer) { clearTimeout(pullDebounceTimer); pullDebounceTimer = null }
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
    if (channel.value) {
      try { channel.value.unsubscribe() } catch { /* ignore */ }
      channel.value = null
      isConnected.value = false
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

  async function rebuildChannel(reason) {
    if (isRebuilding) return
    if (!canOperate()) return
    isRebuilding = true
    try {
      console.log('[realtime] rebuilding channel:', reason, 'attempt', rebuildAttempt + 1)
      unsubscribe()
      // 静默断连/错误后刷新客户端，避免复用已死的 WebSocket / 过期 DNS 缓存
      if (reason !== 'health' && reason !== 'subscribe-failed') {
        await reconnectSupabase()
      }
      await subscribe()
    } catch (e) {
      console.warn('[realtime] rebuild failed:', e?.message || e)
      scheduleRebuild('rebuild-failed')
    } finally {
      isRebuilding = false
    }
  }

  function scheduleRebuild(reason) {
    if (rebuildTimer) return
    if (!canOperate()) return

    const backoff = Math.min(REBUILD_BASE_MS * (2 ** rebuildAttempt), REBUILD_MAX_MS)
    const jitter = backoff * (0.7 + Math.random() * 0.6)
    const delay = Math.round(jitter)
    rebuildAttempt = Math.min(rebuildAttempt + 1, 6)

    console.log('[realtime] schedule rebuild:', reason, `in ${delay}ms`)
    rebuildTimer = setTimeout(() => {
      rebuildTimer = null
      void rebuildChannel(reason)
    }, delay)
  }

  async function subscribe() {
    if (channel.value) return
    if (!syncStore.isSupabaseMode()) return

    try {
      const db = getSupabaseClient()
      if (!db) {
        scheduleRebuild('no-client')
        return
      }

      const authStore = useAuthStore()
      const userId = authStore.user?.id
      if (!userId) return

      let builder = db.channel('data-realtime')
      for (const table of REALTIME_TABLES) {
        builder = builder.on('postgres_changes', {
          event: '*',
          schema: 'public',
          table,
          filter: `user_id=eq.${userId}`
        }, handleRemoteChange)
      }
      channel.value = builder.subscribe((status) => {
        isConnected.value = status === 'SUBSCRIBED'
        console.log('[realtime] channel status:', status)
        if (status === 'SUBSCRIBED') {
          rebuildAttempt = 0
          clearRebuildTimer()
          return
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          // 先清掉半死 channel，再走退避重建；realtime client 不会自动从 channel 级错误恢复
          scheduleRebuild(status)
        }
      })
    } catch (e) {
      console.warn('[realtime] subscribe failed:', e.message)
      scheduleRebuild('subscribe-failed')
    }
  }

  function startHealthCheck() {
    stopHealthCheck()
    healthTimer = setInterval(() => {
      if (document.hidden) return
      if (!canOperate()) return
      if (isRebuilding || rebuildTimer) return
      // channel 还在但未 SUBSCRIBED：静默半死，触发轻量重建
      if (!channel.value || !isConnected.value) {
        scheduleRebuild('health')
      }
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
  })

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
        const tables = [...REALTIME_TABLES]
        const since = syncStore.lastSyncedAt ? new Date(syncStore.lastSyncedAt).getTime() : 0
        try { await syncStore.pull({ tables, since, source: 'visibility' }) } catch { /* ignore */ }
        startHealthCheck()
      }
    }, 2000)
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
    },
    { immediate: true }
  )

  onMounted(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange, { passive: true })
  })

  onBeforeUnmount(() => {
    clearRebuildTimer()
    stopHealthCheck()
    if (visibilityDebounceTimer) { clearTimeout(visibilityDebounceTimer); visibilityDebounceTimer = null }
    unsubscribe()
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  })

  return { isConnected, subscribe, unsubscribe }
}
