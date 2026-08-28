import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { getSupabaseClient, reconnectSupabase } from '@/utils/sync/supabaseClient'
import { useAuthStore } from '@/stores/auth'

/**
 * Supabase Realtime 订阅 composable
 * 监听主数据表的变更，过滤自己的写入，触发 pull（增量模式）
 */
export function useRealtimeSync({ syncStore }) {
  const channel = ref(null)
  const isConnected = ref(false)
  let pullDebounceTimer = null

  let pendingPullTables = new Set()
  let retryTimer = null

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

  async function subscribe() {
    if (channel.value) return
    if (!syncStore.isSupabaseMode()) return

    try {
      const db = getSupabaseClient()
      if (!db) return

      const authStore = useAuthStore()
      const userId = authStore.user?.id
      if (!userId) return

      const tables = ['goods', 'events', 'recharge_records', 'goods_groups', 'goods_group_items']
      let builder = db.channel('data-realtime')
      for (const table of tables) {
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
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            setTimeout(async () => {
              if (syncStore.syncPaused) return
              if (!syncStore.isSupabaseMode()) return
              // 先重建订阅（realtime client 不会自动从 channel 级错误恢复），再补拉
              unsubscribe()
              await subscribe()
              if (!syncStore.isSyncing && !syncStore.isPulling) {
                const tables = ['goods', 'events', 'recharge_records', 'goods_groups', 'goods_group_items']
                const since = syncStore.lastSyncedAt ? new Date(syncStore.lastSyncedAt).getTime() : 0
                try {
                  await syncStore.pull({ tables, since, source: 'realtime' })
                } catch { /* ignore */ }
              }
            }, 3000)
          }
        })
    } catch (e) {
      console.warn('[realtime] subscribe failed:', e.message)
    }
  }

  let visibilityDebounceTimer = null

  function unsubscribe() {
    if (pullDebounceTimer) { clearTimeout(pullDebounceTimer); pullDebounceTimer = null }
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
    if (visibilityDebounceTimer) { clearTimeout(visibilityDebounceTimer); visibilityDebounceTimer = null }
    if (channel.value) {
      channel.value.unsubscribe()
      channel.value = null
      isConnected.value = false
    }
  }

  watch(() => syncStore.syncBackend, (backend) => {
    if (backend === 'supabase') {
      subscribe()
    } else {
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
        // 重建 Supabase 客户端以刷新可能过期的 DNS 缓存
        await reconnectSupabase()
        // 重新订阅 Realtime 通道（WebSocket 可能已断开）
        unsubscribe()
        await subscribe()
        const tables = ['goods', 'events', 'recharge_records', 'goods_groups', 'goods_group_items']
        const since = syncStore.lastSyncedAt ? new Date(syncStore.lastSyncedAt).getTime() : 0
        try { await syncStore.pull({ tables, since, source: 'visibility' }) } catch { /* ignore */ }
      }
    }, 5000)
  }

  // user / 同步后端就绪（或变化）时（重新）订阅；任一未就绪则退订
  const authStore = useAuthStore()
  watch(
    () => [authStore.user?.id, syncStore.syncBackend],
    ([uid, backend]) => {
      if (uid && backend === 'supabase') {
        subscribe()
      } else {
        unsubscribe()
      }
    },
    { immediate: true }
  )

  onMounted(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange, { passive: true })
  })

  onBeforeUnmount(() => {
    unsubscribe()
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  })

  return { isConnected, subscribe, unsubscribe }
}
