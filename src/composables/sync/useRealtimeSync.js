import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { getSupabaseClient } from '@/utils/sync/supabaseClient'

/**
 * Supabase Realtime 订阅 composable
 * 监听主数据表的变更，过滤自己的写入，触发 pullFast（只读变更的表）
 */
export function useRealtimeSync({ syncStore }) {
  const channel = ref(null)
  const isConnected = ref(false)
  let pullDebounceTimer = null

  let pendingPullTables = new Set()
  let retryTimer = null

  function doPull(tables) {
    if (syncStore.isSyncing || syncStore.isPulling) {
      // Already running — schedule ONE retry after it finishes
      if (!retryTimer) {
        retryTimer = setTimeout(async () => {
          retryTimer = null
          if (!syncStore.isSyncing && !syncStore.isPulling) {
            try { await syncStore.pullFast({ tables, since: syncStore.lastSyncedAt ? new Date(syncStore.lastSyncedAt).getTime() : 0 }) } catch { /* ignore */ }
          }
        }, 2000)
      }
      return
    }
    const since = syncStore.lastSyncedAt ? new Date(syncStore.lastSyncedAt).getTime() : 0
    try {
      void syncStore.pullFast({ tables, since })
    } catch {
      // silent fail
    }
  }

  function handleRemoteChange(payload) {
    const row = payload.new || payload.old
    if (!row) return
    const table = String(payload?.table || '')
    // 过滤自己设备的写入
    if (row.synced_by && row.synced_by === syncStore.deviceId) return
    pendingPullTables.add(table)
    // debounce 500ms，每次新事件重置计时器，等所有事件到达后再拉取
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

      const tables = ['goods', 'events', 'recharge_records', 'goods_groups', 'goods_group_items']
      let builder = db.channel('data-realtime')
      for (const table of tables) {
        builder = builder.on('postgres_changes', { event: '*', schema: 'public', table }, handleRemoteChange)
      }
      channel.value = builder.subscribe((status) => {
          isConnected.value = status === 'SUBSCRIBED'
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            // Supabase 会自动重连，重连成功后增量 catch-up
            setTimeout(async () => {
              if (syncStore.isSupabaseMode() && !syncStore.isSyncing && !syncStore.isPulling) {
                const tables = ['goods', 'events', 'recharge_records', 'goods_groups', 'goods_group_items']
                const since = syncStore.lastSyncedAt ? new Date(syncStore.lastSyncedAt).getTime() : 0
                try {
                  if (since > 0) {
                    await syncStore.pullFast({ tables, since })
                  } else {
                    await syncStore.pullOnly({ silent: true })
                  }
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

  // syncStore.init() 完成后 isSupabaseMode() 才可靠，用 watcher 延迟订阅
  watch(() => syncStore.syncBackend, (backend) => {
    if (backend === 'supabase') {
      subscribe()
    } else {
      unsubscribe()
    }
  })

  async function handleVisibilityChange() {
    if (document.hidden) {
      // Gist 模式：退到后台时若有本地变更则做一次完整同步
      if (!syncStore.isSupabaseMode() && syncStore.token && syncStore.gistId && !syncStore.isSyncing && !syncStore.conflictData) {
        const localChanges = syncStore.getLocalChangesSinceLastSync()
        if (!localChanges.hasChanges) return

        try {
          await syncStore.fullSync({ source: 'visibility' })
        } catch {
          // silent fail on background sync
        }
      }
      return
    }

    // Supabase 模式：回到前台时拉取最新数据（用 pullFast 只读变更）
    if (visibilityDebounceTimer) clearTimeout(visibilityDebounceTimer)
    visibilityDebounceTimer = setTimeout(async () => {
      if (syncStore.isSupabaseMode() && !syncStore.isSyncing && !syncStore.isPulling) {
        const tables = ['goods', 'events', 'recharge_records', 'goods_groups', 'goods_group_items']
        const since = syncStore.lastSyncedAt ? new Date(syncStore.lastSyncedAt).getTime() : 0
        try { await syncStore.pullFast({ tables, since }) } catch { /* ignore */ }
      }
    }, 5000)
  }

  onMounted(() => {
    // init 已完成时直接订阅，否则等 watcher 触发
    if (syncStore.isSupabaseMode()) {
      subscribe()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange, { passive: true })
  })

  onBeforeUnmount(() => {
    unsubscribe()
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  })

  return { isConnected, subscribe, unsubscribe }
}
