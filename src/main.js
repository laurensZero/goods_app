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

async function checkAndWipeObsoleteBundles() {
  if (!Capacitor.isNativePlatform()) return

  try {
    const info = await CapacitorApp.getInfo()
    const currentAppVersion = `${info.version}(${info.build})`
    const { Preferences } = await import('@capacitor/preferences')
    const { value: storedVersion } = await Preferences.get({ key: 'last_native_app_version' })

    if (storedVersion && storedVersion !== currentAppVersion) {
      console.log(`[updater] Native app updated from ${storedVersion} to ${currentAppVersion}. Wiping obsolete bundles...`)
      
      // Reset to builtin bundle
      await CapacitorUpdater.reset({ toLastSuccessful: false }).catch((e) => {
        console.warn('[updater] Reset failed:', e)
      })

      // Explicitly delete downloaded bundles
      const { bundles } = await CapacitorUpdater.list()
      for (const b of bundles) {
        if (b.id !== 'builtin') {
          await CapacitorUpdater.delete({ id: b.id }).catch((e) => {
            console.warn(`[updater] Failed to delete bundle ${b.id}:`, e)
          })
        }
      }
    }
    
    await Preferences.set({ key: 'last_native_app_version', value: currentAppVersion })
  } catch (error) {
    console.warn('[updater] Version check failed:', error)
  }
}

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
  await checkAndWipeObsoleteBundles()
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
