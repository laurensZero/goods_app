// 最先加载 logger：安装 console/window 错误捕获，后续模块初始化的报错才能进日志缓冲
import './utils/logger'
import { createApp } from 'vue'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { Preferences } from '@capacitor/preferences'
// TODO: capacitor.config.json 需加 CapacitorUpdater.apiKey + defaultChannel（Capgo Cloud）
// 当前 autoUpdate: false，增量更新需配 apiKey 后才能用 @capgo/cli upload --delta
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import { createPinia } from 'pinia'
import App from './App.vue'
import i18n from './locales'
import router from './router'
import 'vant/lib/index.css'
import './assets/base.css'
import './assets/shared-ui.css'
import { initDB } from './utils/db/index'
import { ensurePinyin } from './utils/pinyin'
import { useGoodsStore } from './stores/goods'
import { useEventsStore } from './stores/events'
import { usePresetsStore } from './stores/presets'
import { useFilterPresetsStore } from './stores/filterPresets'
import { useThemeStore } from './stores/theme'
import { useExchangeRateStore } from './stores/exchangeRate'
import { useRechargeStore } from './stores/recharge'
import { useGoodsGroupStore } from './stores/goodsGroup'
import { useSurveyStore } from './stores/survey'
import { dispatchAndroidBackButton } from './utils/platform/androidBackButton'
import { hasOverlays } from './composables/useDialogBackButton'
import { runWithRouteTransition } from './utils/routeTransition'
import { cleanupImageCache, signalImageCacheRefresh } from './utils/image/cache'
import { createLogger } from './utils/logger'
import { handleAuthCallback } from './utils/supabase/auth'
import { cleanupDownloadedApkFiles } from './stores/appUpdate'

const ANDROID_ROOT_ROUTE_NAMES = new Set([
  'home',
  'recharge',
  'wishlist',
  'character-leaderboard',
  'events',
  'manage'
])
const LAST_NATIVE_APP_VERSION_KEY = 'last_native_app_version'
const log = createLogger('bootstrap')
const updaterLog = createLogger('updater')

async function notifyUpdaterReady() {
  if (!Capacitor.isNativePlatform()) return

  try {
    await CapacitorUpdater.notifyAppReady()
  } catch (error) {
    updaterLog.warn('ready:notify:failed', error)
  }
}

async function reconcileBundlesAfterNativeUpdate() {
  if (!Capacitor.isNativePlatform()) return

  try {
    const info = await CapacitorApp.getInfo()
    const currentAppVersion = `${info.version}(${info.build})`
    const { value: storedVersion } = await Preferences.get({ key: LAST_NATIVE_APP_VERSION_KEY })

    if (!storedVersion) {
      await Preferences.set({ key: LAST_NATIVE_APP_VERSION_KEY, value: currentAppVersion })
      return
    }

    if (storedVersion === currentAppVersion) {
      return
    }

    updaterLog.info('native-update:reconcile:start', { from: storedVersion, to: currentAppVersion })

    // 原生升级已生效：清理下载缓存里的历史 APK，避免多次升级累积占用空间
    void cleanupDownloadedApkFiles()

    const nextBundle = await CapacitorUpdater.getNextBundle().catch(() => null)
    if (nextBundle?.id && nextBundle.id !== 'builtin') {
      await CapacitorUpdater.next({ id: 'builtin' }).catch((error) => {
        updaterLog.warn('native-update:clear-next-bundle:failed', { nextBundleId: nextBundle.id }, error)
      })
    }

    const { bundles } = await CapacitorUpdater.list().catch(() => ({ bundles: [] }))
    for (const bundle of bundles) {
      if (bundle?.id && bundle.id !== 'builtin') {
        await CapacitorUpdater.delete({ id: bundle.id }).catch((error) => {
          updaterLog.warn('native-update:delete-obsolete-bundle:failed', { bundleId: bundle.id }, error)
        })
      }
    }

    await Preferences.set({ key: LAST_NATIVE_APP_VERSION_KEY, value: currentAppVersion })
    updaterLog.info('native-update:reconcile:done', { from: storedVersion, to: currentAppVersion })
  } catch (error) {
    updaterLog.warn('native-update:reconcile:failed', error)
  }
}

function setupAndroidBackButton() {
  if (Capacitor.getPlatform() !== 'android') return

  CapacitorApp.addListener('backButton', async ({ canGoBack }) => {
    if (dispatchAndroidBackButton({ canGoBack })) return

    // 全局弹窗注册的 listener 已在 dispatch 中被调用，此处为额外保底
    if (hasOverlays()) return

    const currentRoute = router.currentRoute.value
    const isAndroidRootRoute = ANDROID_ROOT_ROUTE_NAMES.has(String(currentRoute.name || ''))

    if (!isAndroidRootRoute) {
      // history.length 只增不减且含 forward 条目，不可靠；用 vue-router 维护的
      // back 状态判断应用内是否有上一条目（深链/通知冷启动落在非根路由时为 null）
      const historyState = router.options.history.state
      if (historyState?.back != null) {
        runWithRouteTransition(() => router.back(), { direction: 'back' })
      } else {
        runWithRouteTransition(() => router.replace('/home'), { direction: 'back' })
      }
      return
    }

    await CapacitorApp.minimizeApp()
  })
}

function setupAndroidResumeListener(theme) {
  const handleAppVisible = () => {
    theme.syncSystemAppearance({ forceApply: true })
    void cleanupImageCache()
    signalImageCacheRefresh('resume')
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    handleAppVisible()
  })

  if (Capacitor.isNativePlatform()) {
    CapacitorApp.addListener('resume', handleAppVisible)
  }
}

async function bootstrap() {
  const startTime = performance.now()
  const timings = {}

  // 尽早处理 OAuth / Magic Link 回调（在路由匹配之前）
  try {
    await handleAuthCallback()
  } catch (e) {
    console.warn('[bootstrap] handleAuthCallback failed:', e)
  }

  // 创建 Vue 应用和 Pinia（这些是同步的，很快）
  const app = createApp(App)
  const pinia = createPinia()
  app.use(i18n)
  app.use(pinia)
  app.use(router)

  // 全局错误捕获：组件错误带上组件名和生命周期钩子，导航错误（含动态 import 失败）单独记录
  app.config.errorHandler = (err, instance, info) => {
    const componentName = instance?.$options?.name || instance?.$options?.__name || 'anonymous'
    log.error('vue:component-error', { component: componentName, info }, err)
  }
  router.onError((err, to) => {
    log.error('router:navigation-error', { to: to?.fullPath }, err)
  })

  // 获取 store 实例（此时还未初始化数据）
  const store = useGoodsStore()
  const eventsStore = useEventsStore()
  const rechargeStore = useRechargeStore()
  const goodsGroupStore = useGoodsGroupStore()
  const surveyStore = useSurveyStore()
  const presets = usePresetsStore()
  const filterPresets = useFilterPresetsStore()
  const theme = useThemeStore()
  const exchangeRate = useExchangeRateStore()

  // ── 并行启动不互相依赖的初始化 ──
  // theme.init() 和 presets.init() 只读 Preferences，不依赖 DB
  // initDB() 是其他 store 的前置依赖
  // ensurePinyin() 预加载拼音库，确保 store.init() → enrichItem → buildSearchText 时拼音就绪
  const t1 = performance.now()
  const [,] = await Promise.all([
    // DB 初始化（其他 store 依赖它）
    initDB().catch((e) => {
      log.error('db:init:failed', e)
      import('@/utils/globalToast').then(({ showGlobalToast }) => {
        showGlobalToast(i18n.global.t('toast.dbInitFailed', { error: e.message || String(e) }))
      }).catch(() => {})
    }),
    // 主题初始化（只读 Preferences，可并行）
    theme.init().catch((e) => {
      log.warn('theme:init:failed', e)
    }),
    // 预设初始化（只读 Preferences，可并行）
    presets.init().catch((e) => {
      log.warn('presets:init:failed', e)
    }),
    // 预加载 pinyin-pro，避免 enrichItem 时拼音未就绪导致 searchText 缺失
    ensurePinyin()
  ])
  timings.parallelInit = performance.now() - t1

  // ── DB 就绪后，初始化依赖 DB 的 store ──
  const t2 = performance.now()
  try {
    await Promise.all([store.init(), filterPresets.init()])
  } catch (e) {
    log.error('stores:init:failed', e)
  }
  timings.storesInit = performance.now() - t2

  // 非阻塞式初始化 - 不延迟 DOM 挂载
  exchangeRate.init().catch((e) => {
    log.warn('exchange-rate:init:failed', e)
  })
  presets.syncPresetsIfNeeded(store.list, store.storageLocations).catch((e) => {
    log.warn('presets:sync-if-needed:failed', e)
  })

  // events + recharge + goodsGroup 延迟到 App 挂载后（不影响首屏）
  const deferredStoreInit = async () => {
    try {
      await Promise.all([eventsStore.init(), rechargeStore.init(), goodsGroupStore.init()])
    } catch (e) {
      log.error('stores:deferred-init:failed', e)
    }
  }

  const t3 = performance.now()
  try {
    await router.isReady()
  } catch (e) {
    log.error('router:ready:failed', e)
  }
  timings.routerReady = performance.now() - t3
  setupAndroidBackButton()
  setupAndroidResumeListener(theme)
  void cleanupImageCache()
  import('./utils/saleReminder').then(({ registerSaleReminderNotificationNavigation, watchSaleReminderNotifications }) => {
    registerSaleReminderNotificationNavigation()
    watchSaleReminderNotifications(store)
  }).catch((e) => { log.warn('saleReminder:init:failed', e) })

  const t4 = performance.now()
  app.mount('#app')
  timings.mount = performance.now() - t4

  // 挂载成功后再上报 bundle 就绪：坏 bundle 白屏时 capgo 才能自动回滚
  void notifyUpdaterReady()

  timings.total = performance.now() - startTime
  // info 级：进入日志缓冲（反馈日志可见启动耗时），console 输出仍受调试开关控制
  log.info('startup:timings', Object.fromEntries(
    Object.entries(timings).map(([key, value]) => [key, Number(value.toFixed(1))])
  ))

  // 顺序很重要：先挂载 DOM，再初始化重的 store
  void deferredStoreInit()
  void reconcileBundlesAfterNativeUpdate()

  // MCP 服务：dev 由 Vite dev server 提供入口（页面桥接）；
  // 原生端由 McpServer 插件（NanoHTTPD）提供入口（转发回页面协议层）
  if (import.meta.env.DEV) {
    import('./services/mcp/bridgeClient').then(({ initMcpBridge }) => initMcpBridge()).catch(() => {})
  } else if (Capacitor.isNativePlatform()) {
    import('./services/mcp/nativeServer').then(({ initMcpNativeServer }) => initMcpNativeServer()).catch(() => {})
  }

  // 非阻塞式初始化问卷（不影响启动性能）
  surveyStore.loadSurveys().catch(() => {})
}

bootstrap().catch((error) => {
  log.error('fatal', error)
})
