import { createApp } from 'vue'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import 'vant/lib/index.css'
import './assets/base.css'
import { initDB } from './utils/db'
import { useGoodsStore } from './stores/goods'
import { usePresetsStore } from './stores/presets'
import { useFilterPresetsStore } from './stores/filterPresets'
import { dispatchAndroidBackButton } from './utils/androidBackButton'

function setupAndroidBackButton() {
  if (Capacitor.getPlatform() !== 'android') return

  CapacitorApp.addListener('backButton', async ({ canGoBack }) => {
    if (dispatchAndroidBackButton({ canGoBack })) return

    const currentRoute = router.currentRoute.value
    const isHome = currentRoute.name === 'home'

    if (!isHome) {
      if (canGoBack || window.history.length > 1) {
        router.back()
      } else {
        await router.replace('/home')
      }
      return
    }

    await CapacitorApp.exitApp()
  })
}

async function bootstrap() {
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
  const presets = usePresetsStore()
  const filterPresets = useFilterPresetsStore()
  try {
    await Promise.all([store.init(), presets.init(), filterPresets.init()])
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
