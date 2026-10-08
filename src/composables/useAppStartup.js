import { onMounted, onUnmounted, watch } from 'vue'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { loadEndpointPreference, reconnectSupabase } from '@/utils/sync/supabaseClient'
import { shouldCheckOnForeground } from '@/utils/updateHelpers'
import { useAnnouncementStore } from '@/stores/announcement'
import { useCharacterBirthdayStore } from '@/stores/characterBirthday'
import { useAppUpdateStore } from '@/stores/appUpdate'
import { useAuthStore } from '@/stores/auth'
import { useEventsStore } from '@/stores/events'
import { useLegalStore } from '@/stores/legal'
import { useRechargeStore } from '@/stores/recharge'
import { useWebUpdateStore } from '@/stores/webUpdate'
import { useSyncStore } from '@/stores/sync'
import { isCaptureMode } from '@/utils/captureMode'

export function useAppStartup() {
  const eventsStore = useEventsStore()
  const rechargeStore = useRechargeStore()
  const announcementStore = useAnnouncementStore()
  const characterBirthdayStore = useCharacterBirthdayStore()
  const appUpdateStore = useAppUpdateStore()
  const webUpdateStore = useWebUpdateStore()
  const syncStore = useSyncStore()
  const authStore = useAuthStore()
  const legalStore = useLegalStore()

  // ---- 前台恢复 → 检查 web 资源更新（冷却窗口内不重复查） ----
  // silent 链路的补检时机：冷启动之外，回前台超过冷却时长也静默查一次，
  // 命中 silent 更新则由 store 自动后台下载 + next()，下次自然启动生效。
  function checkWebUpdateOnForeground() {
    if (isCaptureMode()) return
    if (!shouldCheckOnForeground(webUpdateStore.lastCheckedAt)) return
    void webUpdateStore.checkForUpdates().catch(() => {
      // silent fail on foreground web bundle update check
    })
  }

  function onVisibilityChangeForUpdate() {
    if (document.visibilityState === 'visible') checkWebUpdateOnForeground()
  }

  document.addEventListener('visibilitychange', onVisibilityChangeForUpdate)
  let appStateHandle = null
  let appStateHandleReleased = false
  if (Capacitor.isNativePlatform()) {
    CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) checkWebUpdateOnForeground()
    }).then((handle) => {
      if (appStateHandleReleased) {
        handle?.remove?.()
        return
      }
      appStateHandle = handle
    }).catch(() => {
      // listener registration failed; visibilitychange still covers foreground checks
    })
  }

  onUnmounted(() => {
    document.removeEventListener('visibilitychange', onVisibilityChangeForUpdate)
    appStateHandleReleased = true
    appStateHandle?.remove?.()
  })

  onMounted(async () => {
    const captureMode = isCaptureMode()

    // 恢复数据面端点偏好后只探当前端点；失败再探备用（与其它场景一致）
    await loadEndpointPreference()
    await reconnectSupabase({ force: true })

    // 用户协议/隐私政策门禁：本地检查、离线可弹；未同意前阻塞公告等后续弹窗
    const legalReady = legalStore.checkGate()

    void appUpdateStore.init()
    void webUpdateStore.init()
    void announcementStore.init()

    // 预加载活动和充值数据，确保相关页面初次打开时已就绪
    void eventsStore.init()
    void rechargeStore.init()

    // 启动即自动检测更新：原生 / 生产 PWA / PC dev 模拟统一走同一行为
    // （appUpdate 与 webUpdate 均走 Supabase；webUpdate 在生产 PWA 会自行判定 disabled）
    if (!captureMode) {
      void appUpdateStore.checkForUpdates({ source: 'startup' }).catch(() => {
        // silent fail on startup update check
      })

      void webUpdateStore.checkForUpdates().catch(() => {
        // silent fail on startup web bundle update check
      })
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

    // 冷启动心跳：上报设备存活与当前 APK/bundle 版本（fire-and-forget）。
    // 未登录时静默跳过；即使下方启动拉取被跳过/失败，也保证启动时上报一次。
    syncStore.reportHeartbeat()

    // 等待用户协议门禁关闭后再检查公告/生日，避免弹窗叠加
    await legalReady

    // 公告检查；结束后再检查角色生日彩蛋（公告弹窗未关时等它关闭，避免弹窗叠加）
    if (!captureMode) {
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
    }
    // Supabase 模式：应用启动时增量拉取
    if (syncStore.isSupabaseMode() && !syncStore.syncPaused && !syncStore.isSyncing && !syncStore.isPulling) {
      const tables = ['goods', 'events', 'recharge_records', 'goods_groups', 'goods_group_items']
      const since = syncStore.lastSyncedAt ? new Date(syncStore.lastSyncedAt).getTime() : 0
      try {
        await syncStore.pull({ tables, since, silent: true })
      } catch {
        // silent fail on startup pull
      }
      // 上一会话没推成功的脏标记不会自己排定时器，拉取结束后补一次自动推送
      syncStore.resumePendingAutoPush()
    }
  })
}
