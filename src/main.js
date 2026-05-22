import { createApp } from 'vue'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { Preferences } from '@capacitor/preferences'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import 'vant/lib/index.css'
import './assets/base.css'
import { initDB } from './utils/db/index'
import { useGoodsStore } from './stores/goods'
import { useEventsStore } from './stores/events'
import { usePresetsStore } from './stores/presets'
import { useFilterPresetsStore } from './stores/filterPresets'
import { useThemeStore } from './stores/theme'
import { useExchangeRateStore } from './stores/exchangeRate'
import { useRechargeStore } from './stores/recharge'
import { dispatchAndroidBackButton } from './utils/platform/androidBackButton'
import { runWithRouteTransition } from './utils/routeTransition'
import { signalImageCacheRefresh } from './utils/image/cache'

const ANDROID_ROOT_ROUTE_NAMES = new Set([
  'home',
  'recharge',
  'wishlist',
  'character-leaderboard',
  'events',
  'manage'
])
const LAST_NATIVE_APP_VERSION_KEY = 'last_native_app_version'

async function notifyUpdaterReady() {
  if (!Capacitor.isNativePlatform()) return

  try {
    await CapacitorUpdater.notifyAppReady()
  } catch (error) {
    console.warn('[updater] notifyAppReady failed:', error)
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

    console.log(`[updater] Native app updated from ${storedVersion} to ${currentAppVersion}. Reconciling bundles...`)

    const nextBundle = await CapacitorUpdater.getNextBundle().catch(() => null)
    if (nextBundle?.id && nextBundle.id !== 'builtin') {
      await CapacitorUpdater.next({ id: 'builtin' }).catch((error) => {
        console.warn('[updater] Failed to clear next bundle after native update:', error)
      })
    }

    const { bundles } = await CapacitorUpdater.list().catch(() => ({ bundles: [] }))
    for (const bundle of bundles) {
      if (bundle?.id && bundle.id !== 'builtin') {
        await CapacitorUpdater.delete({ id: bundle.id }).catch((error) => {
          console.warn(`[updater] Failed to delete obsolete bundle ${bundle.id}:`, error)
        })
      }
    }

    await Preferences.set({ key: LAST_NATIVE_APP_VERSION_KEY, value: currentAppVersion })
  } catch (error) {
    console.warn('[updater] Native update reconciliation failed:', error)
  }
}

function setupAndroidBackButton() {
  if (Capacitor.getPlatform() !== 'android') return

  CapacitorApp.addListener('backButton', async ({ canGoBack }) => {
    if (dispatchAndroidBackButton({ canGoBack })) return

    const currentRoute = router.currentRoute.value
    const isAndroidRootRoute = ANDROID_ROOT_ROUTE_NAMES.has(String(currentRoute.name || ''))

    if (!isAndroidRootRoute) {
      if (canGoBack || window.history.length > 1) {
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

  void notifyUpdaterReady()

  // 初始化 SQLite（原生用 Capacitor，Web 用 sql.js）
  const t1 = performance.now()
  try {
    await initDB()
  } catch (e) {
    console.error('[DB] initDB failed — running without SQLite storage:', e)
  }
  timings.initDB = performance.now() - t1

  const app = createApp(App)
  const pinia = createPinia()
  app.use(pinia)
  app.use(router)

  // 从 SQLite 预加载数据，再挂载 DOM
  const store = useGoodsStore()
  const eventsStore = useEventsStore()
  const rechargeStore = useRechargeStore()
  const presets = usePresetsStore()
  const filterPresets = useFilterPresetsStore()
  const theme = useThemeStore()
  const exchangeRate = useExchangeRateStore()
  try {
    const t2 = performance.now()
    await theme.init()
    timings.themeInit = performance.now() - t2
    
    // 只初始化关键 store（阻塞）— goods / presets / filterPresets 对主页必须
    // events / recharge 可以延迟到 App 挂载后，不影响首屏
    const t3 = performance.now()
    await Promise.all([store.init(), presets.init(), filterPresets.init()])
    timings.storesInit = performance.now() - t3
  } catch (e) {
    console.error('[bootstrap] store init failed:', e)
  }
  
  // 非阻塞式初始化 - 不延迟 DOM 挂载
  // exchangeRate, presets 同步（后台执行）
  exchangeRate.init().catch((e) => {
    console.warn('[bootstrap] exchangeRate.init failed:', e)
  })
  presets.syncPresetsIfNeeded(store.list, store.storageLocations).catch((e) => {
    console.warn('[bootstrap] presets.syncPresetsIfNeeded failed:', e)
  })
  
  // events + recharge 延迟到 App 挂载后（不影响首屏）
  const deferredStoreInit = async () => {
    try {
      await Promise.all([eventsStore.init(), rechargeStore.init()])
    } catch (e) {
      console.error('[bootstrap] deferred store init failed:', e)
    }
  }

  const t4 = performance.now()
  try {
    await router.isReady()
  } catch (e) {
    console.error('[bootstrap] router.isReady failed:', e)
  }
  timings.routerReady = performance.now() - t4
  setupAndroidBackButton()
  setupAndroidResumeListener(theme)
  
  const t5 = performance.now()
  app.mount('#app')
  timings.mount = performance.now() - t5
  
  // 打出启动时间统计（仅开发环境）
  timings.total = performance.now() - startTime
  if (import.meta.env.DEV) {
    console.log(
      '[bootstrap] startup timings (ms):\n' +
      Object.entries(timings).map(([k, v]) => `  ${k}: ${v.toFixed(1)}`).join('\n')
    )
  }
  
  // 顺序很重要：先挂载 DOM，再初始化重的 store
  void deferredStoreInit()
  void reconcileBundlesAfterNativeUpdate()
}

bootstrap().catch(console.error)
