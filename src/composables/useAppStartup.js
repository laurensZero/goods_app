import { onMounted, watch } from 'vue'
import { useAnnouncementStore } from '@/stores/announcement'
import { useCharacterBirthdayStore } from '@/stores/characterBirthday'
import { useAppUpdateStore } from '@/stores/appUpdate'
import { useAuthStore } from '@/stores/auth'
import { useEventsStore } from '@/stores/events'
import { useRechargeStore } from '@/stores/recharge'
import { useWebUpdateStore } from '@/stores/webUpdate'
import { useSyncStore } from '@/stores/sync'

export function useAppStartup() {
  const eventsStore = useEventsStore()
  const rechargeStore = useRechargeStore()
  const announcementStore = useAnnouncementStore()
  const characterBirthdayStore = useCharacterBirthdayStore()
  const appUpdateStore = useAppUpdateStore()
  const webUpdateStore = useWebUpdateStore()
  const syncStore = useSyncStore()
  const authStore = useAuthStore()

  onMounted(async () => {
    void appUpdateStore.init()
    void webUpdateStore.init()
    void announcementStore.init()

    // 预加载活动和充值数据，确保相关页面初次打开时已就绪
    void eventsStore.init()
    void rechargeStore.init()

    // 启动即自动检测更新：原生 / 生产 PWA / PC dev 模拟统一走同一行为
    // （appUpdate 与 webUpdate 均走 Supabase；webUpdate 在生产 PWA 会自行判定 disabled）
    void appUpdateStore.checkForUpdates({ source: 'startup' }).catch(() => {
      // silent fail on startup update check
    })

    void webUpdateStore.checkForUpdates().catch(() => {
      // silent fail on startup web bundle update check
    })

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

    // 冷启动心跳：上报设备存活与当前 APK/bundle 版本（fire-and-forget）。
    // 未登录时静默跳过；即使下方启动拉取被跳过/失败，也保证启动时上报一次。
    syncStore.reportHeartbeat()

    // 公告检查；结束后再检查角色生日彩蛋（公告弹窗未关时等它关闭，避免弹窗叠加）
    void announcementStore.checkAndDecide().catch(() => {
      // silent fail on startup announcement check
    }).then(() => {
      const runBirthdayCheck = () => {
        void characterBirthdayStore.checkAndDecide().catch(() => {
          // silent fail on startup birthday check
        })
      }
      if (!announcementStore.dialogVisible) {
        runBirthdayCheck()
        return
      }
      const stop = watch(() => announcementStore.dialogVisible, (visible) => {
        if (visible) return
        stop()
        runBirthdayCheck()
      })
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
