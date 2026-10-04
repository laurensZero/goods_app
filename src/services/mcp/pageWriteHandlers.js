// @ts-check
/**
 * 页面侧写工具 handlers 组装（dev 桥 bridgeClient 与原生 HTTP 桥 nativeServer 共用）。
 * 依赖 Pinia store 实例，只能在页面上下文调用。
 */
import { createMcpWriteToolHandlers } from './writeTools'
import { useGoodsStore } from '@/stores/goods'
import { useGoodsGroupStore } from '@/stores/goods/goodsGroup'
import { usePresetsStore } from '@/stores/presets'
import { useThemeStore } from '@/stores/theme'
import { useNotifySettingsStore } from '@/stores/notifySettings'
import { useRechargeStore } from '@/stores/recharge'
import { useEventsStore } from '@/stores/events'
import { useMediaPlayerStore } from '@/stores/mediaPlayer'
import { useAuthStore } from '@/stores/auth'
import { useSyncStore } from '@/stores/sync'
import { useAppUpdateStore } from '@/stores/appUpdate'
import { useWebUpdateStore } from '@/stores/webUpdate'
import { readBudgetSettings, writeBudgetSettings } from '@/utils/goods/budget'
import router from '@/router'

/** 构建写工具 handlers（依赖 store 实例，仅在页面侧调用） */
export function buildPageWriteHandlers() {
  return createMcpWriteToolHandlers({
    goodsStore: useGoodsStore(),
    goodsGroupStore: useGoodsGroupStore(),
    presetsStore: usePresetsStore(),
    themeStore: useThemeStore(),
    notifyStore: useNotifySettingsStore(),
    rechargeStore: useRechargeStore(),
    eventsStore: useEventsStore(),
    mediaPlayerStore: useMediaPlayerStore(),
    authStore: useAuthStore(),
    syncStore: useSyncStore(),
    appUpdateStore: useAppUpdateStore(),
    webUpdateStore: useWebUpdateStore(),
    budgetApi: { read: readBudgetSettings, write: writeBudgetSettings },
    router
  })
}
