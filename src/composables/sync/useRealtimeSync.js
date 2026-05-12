import { ref, onMounted, onBeforeUnmount } from 'vue'
import { getSupabaseClient } from '@/utils/supabaseClient'

/**
 * Supabase Realtime 订阅 composable
 * 监听 goods/events/recharge_records 表的变更，过滤自己的写入，触发 pullOnly
 */
export function useRealtimeSync({ syncStore }) {
  const channel = ref(null)
  const isConnected = ref(false)
  let pullDebounceTimer = null

  function handleRemoteChange(payload) {
    const row = payload.new || payload.old
    if (!row) return
    // 过滤自己设备的写入
    if (row.synced_by && row.synced_by === syncStore.deviceId) return
    // debounce 300ms 合并短时间内的多次事件
    if (pullDebounceTimer) clearTimeout(pullDebounceTimer)
    pullDebounceTimer = setTimeout(async () => {
      if (syncStore.isSyncing || syncStore.isPulling) return
      try {
        await syncStore.pullOnly({ silent: true })
      } catch {
        // silent fail
      }
    }, 300)
  }

  async function subscribe() {
    if (channel.value) return
    if (!syncStore.isSupabaseMode()) return

    try {
      const db = getSupabaseClient()
      if (!db) return

      const tables = ['goods', 'events', 'recharge_records']
      let builder = db.channel('data-realtime')
      for (const table of tables) {
        builder = builder.on('postgres_changes', { event: '*', schema: 'public', table }, handleRemoteChange)
      }
      channel.value = builder.subscribe((status) => {
          isConnected.value = status === 'SUBSCRIBED'
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            // Supabase 会自动重连，重连成功后做一次 catch-up pull
            setTimeout(async () => {
              if (syncStore.isSupabaseMode() && !syncStore.isSyncing && !syncStore.isPulling) {
                try { await syncStore.pullOnly({ silent: true }) } catch { /* ignore */ }
              }
            }, 3000)
          }
        })
    } catch (e) {
      console.warn('[realtime] subscribe failed:', e.message)
    }
  }

  function unsubscribe() {
    if (pullDebounceTimer) { clearTimeout(pullDebounceTimer); pullDebounceTimer = null }
    if (channel.value) {
      channel.value.unsubscribe()
      channel.value = null
      isConnected.value = false
    }
  }

  async function handleVisibilityChange() {
    if (document.hidden) return
    // 回到前台时做一次 catch-up pull
    if (syncStore.isSupabaseMode() && !syncStore.isSyncing && !syncStore.isPulling) {
      try { await syncStore.pullOnly() } catch { /* ignore */ }
    }
  }

  onMounted(() => {
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
