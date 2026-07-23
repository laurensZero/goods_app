import { computed, onMounted } from 'vue'
import { Capacitor } from '@capacitor/core'
import { useAnnouncementStore } from '@/stores/announcement'
import { useAppUpdateStore } from '@/stores/appUpdate'
import { useAuthStore } from '@/stores/auth'
import { useGoodsStore } from '@/stores/goods'
import { useEventsStore } from '@/stores/events'
import { useRechargeStore } from '@/stores/recharge'
import { useWebUpdateStore } from '@/stores/webUpdate'
import { useSyncStore } from '@/stores/sync'

function resolveArrayValue(source) {
  if (Array.isArray(source)) return source
  if (Array.isArray(source?.value)) return source.value
  return []
}

export function useAppStartup() {
  const goodsStore = useGoodsStore()
  const eventsStore = useEventsStore()
  const rechargeStore = useRechargeStore()
  const announcementStore = useAnnouncementStore()
  const appUpdateStore = useAppUpdateStore()
  const webUpdateStore = useWebUpdateStore()
  const syncStore = useSyncStore()
  const authStore = useAuthStore()

  const hasLocalData = computed(() => (
    resolveArrayValue(goodsStore.list).length > 0
    || resolveArrayValue(goodsStore.trashList).length > 0
    || resolveArrayValue(rechargeStore.records).length > 0
    || resolveArrayValue(eventsStore.list).length > 0
  ))

  onMounted(async () => {
    void appUpdateStore.init()
    void webUpdateStore.init()
    void announcementStore.init()

    // 预加载活动和充值数据，确保相关页面初次打开时已就绪
    void eventsStore.init()
    void rechargeStore.init()

    const shouldAutoCheckUpdate = !(import.meta.env.DEV && !Capacitor.isNativePlatform())
    if (shouldAutoCheckUpdate) {
      void appUpdateStore.checkForUpdates({ source: 'startup' }).catch(() => {
        // silent fail on startup update check
      })

      if (Capacitor.isNativePlatform()) {
        void webUpdateStore.checkForUpdates().catch(() => {
          // silent fail on startup web bundle update check
        })
      }
    }

    // Supabase Auth 初始化（必须在 sync 之前，确保登录状态可用）
    try {
      await authStore.init()
    } catch (e) {
      console.error('[app] authStore.init failed:', e)
    }

    // Sync 初始化（auth 之后，确保 userId 可用）
    try {
      await syncStore.init()
    } catch (e) {
      console.error('[app] syncStore.init failed:', e)
    }

    // 公告检查
    void announcementStore.checkAndDecide({ source: 'startup' }).catch(() => {
      // silent fail on startup announcement check
    })
    // Supabase 模式：应用启动时增量拉取
    if (syncStore.isSupabaseMode() && !syncStore.syncPaused && !syncStore.isSyncing && !syncStore.isPulling) {
      const tables = ['goods', 'events', 'recharge_records', 'goods_groups', 'goods_group_items']
      const since = syncStore.lastSyncedAt ? new Date(syncStore.lastSyncedAt).getTime() : 0
      try {
        await syncStore.pull({ tables, since, silent: true })
      } catch {
        // silent fail on startup pull
      }
    }
  })
}
