import { createApp } from 'vue'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { Preferences } from '@capacitor/preferences'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import { createPinia } from 'pinia'
import App from './App.vue'
import i18n from './locales'
import router from './router'
import 'vant/lib/index.css'
import './assets/base.css'
import './assets/shared-ui.css'
import { initDB } from './utils/db/index'
import { useGoodsStore } from './stores/goods'
import { useEventsStore } from './stores/events'
import { usePresetsStore } from './stores/presets'
import { useFilterPresetsStore } from './stores/filterPresets'
import { useThemeStore } from './stores/theme'
import { useExchangeRateStore } from './stores/exchangeRate'
import { useRechargeStore } from './stores/recharge'
import { useGoodsGroupStore } from './stores/goodsGroup'
import { dispatchAndroidBackButton } from './utils/platform/androidBackButton'
import { runWithRouteTransition } from './utils/routeTransition'
import { signalImageCacheRefresh } from './utils/image/cache'
import { createLogger } from './utils/logger'

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

  void notifyUpdaterReady()

  // 初始化 SQLite（原生用 Capacitor，Web 用 sql.js）
  const t1 = performance.now()
  try {
    await initDB()
  } catch (e) {
    log.error('db:init:failed', e)
    // 延迟导入 Toast，避免循环依赖
    import('vant').then(({ showFailToast }) => {
      showFailToast(i18n.global.t('toast.dbInitFailed', { error: e.message || String(e) }))
    }).catch(() => {})
  }
  timings.initDB = performance.now() - t1

  const app = createApp(App)
  const pinia = createPinia()
  app.use(i18n)
  app.use(pinia)
  app.use(router)

  // 从 SQLite 预加载数据，再挂载 DOM
  const store = useGoodsStore()
  const eventsStore = useEventsStore()
  const rechargeStore = useRechargeStore()
  const goodsGroupStore = useGoodsGroupStore()
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
    log.error('stores:init:failed', e)
  }
  
  // 非阻塞式初始化 - 不延迟 DOM 挂载
  // exchangeRate, presets 同步（后台执行）
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

  const t4 = performance.now()
  try {
    await router.isReady()
  } catch (e) {
    log.error('router:ready:failed', e)
  }
  timings.routerReady = performance.now() - t4
  setupAndroidBackButton()
  setupAndroidResumeListener(theme)
  
  const t5 = performance.now()
  app.mount('#app')
  timings.mount = performance.now() - t5
  
  timings.total = performance.now() - startTime
  log.debug('startup:timings', Object.fromEntries(
    Object.entries(timings).map(([key, value]) => [key, Number(value.toFixed(1))])
  ))
  
  // 顺序很重要：先挂载 DOM，再初始化重的 store
  void deferredStoreInit()
  void reconcileBundlesAfterNativeUpdate()
}

bootstrap().catch((error) => {
  log.error('fatal', error)
})
