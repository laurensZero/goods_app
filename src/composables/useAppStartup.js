import { computed, onMounted } from 'vue'
import { Capacitor } from '@capacitor/core'
import { useAnnouncementStore } from '@/stores/announcement'
import { useAppUpdateStore } from '@/stores/appUpdate'
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

    void announcementStore.checkAndDecide({ source: 'startup' }).catch(() => {
      // silent fail on startup announcement check
    })

    // 自动拉取
    try {
      await syncStore.init()
    } catch (e) {
      console.error('[app] syncStore.init failed:', e)
    }
    if (syncStore.token && syncStore.gistId && !syncStore.isSyncing && !hasLocalData.value) {
      try {
        await syncStore.pullOnly({ silent: true })
      } catch {
        // silent fail on startup pull
      }
    }
    // Supabase 模式：应用启动时也做一次拉取以防错过 realtime 推送
    if (syncStore.isSupabaseMode() && !syncStore.isSyncing && !syncStore.isPulling) {
      try {
        await syncStore.pullOnly({ silent: true })
      } catch {
        // silent fail on startup pull
      }
    }
  })
}
