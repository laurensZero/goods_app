import { createApp } from 'vue'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
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
import { dispatchAndroidBackButton } from './utils/androidBackButton'

const ANDROID_ROOT_ROUTE_NAMES = new Set([
  'home',
  'recharge',
  'wishlist',
  'character-leaderboard',
  'events',
  'manage'
])

async function notifyUpdaterReady() {
  if (!Capacitor.isNativePlatform()) return

  try {
    await CapacitorUpdater.notifyAppReady()
  } catch (error) {
    console.warn('[updater] notifyAppReady failed:', error)
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
        router.back()
      } else {
        await router.replace('/home')
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
  try {
    await theme.init()
    await Promise.all([store.init(), eventsStore.init(), presets.init(), filterPresets.init()])
    await presets.syncCharactersFromGoods(store.list)
    await presets.syncStorageLocationsFromPaths(store.storageLocations)
  } catch (e) {
    console.error('[bootstrap] store init failed:', e)
  }

  await router.isReady()
  setupAndroidBackButton()
  app.mount('#app')
}

bootstrap().catch(console.error)
