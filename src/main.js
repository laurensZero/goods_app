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
import { initDB } from './utils/db'
import { useGoodsStore } from './stores/goods'
import { useEventsStore } from './stores/events'
import { usePresetsStore } from './stores/presets'
import { useFilterPresetsStore } from './stores/filterPresets'
import { useThemeStore } from './stores/theme'
import { useExchangeRateStore } from './stores/exchangeRate'
import { dispatchAndroidBackButton } from './utils/androidBackButton'
import { runWithRouteTransition } from './utils/routeTransition'

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

async function bootstrap() {
  void notifyUpdaterReady()

  // 初始化 SQLite（原生用 Capacitor，Web 用 sql.js）
  try {
    await initDB()
  } catch (e) {
    console.error('[DB] initDB failed — running without SQLite storage:', e)
  }

  const app = createApp(App)
  const pinia = createPinia()
  app.use(pinia)
  app.use(router)

  // 从 SQLite 预加载数据，再挂载 DOM
  const store = useGoodsStore()
  const eventsStore = useEventsStore()
  const presets = usePresetsStore()
  const filterPresets = useFilterPresetsStore()
  const theme = useThemeStore()
  const exchangeRate = useExchangeRateStore()
  try {
    await theme.init()
    await Promise.all([store.init(), eventsStore.init(), presets.init(), filterPresets.init(), exchangeRate.init()])
    await presets.syncCharactersFromGoods(store.list)
    await presets.syncStorageLocationsFromPaths(store.storageLocations)
  } catch (e) {
    console.error('[bootstrap] store init failed:', e)
  }

  await router.isReady()
  setupAndroidBackButton()
  app.mount('#app')
  void reconcileBundlesAfterNativeUpdate()
}

bootstrap().catch(console.error)
