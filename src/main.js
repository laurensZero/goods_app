import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import 'vant/lib/index.css'
import './assets/base.css'
import { initDB } from './utils/db'
import { useGoodsStore } from './stores/goods'

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
  try {
    await store.init()
  } catch (e) {
    console.error('[DB] store.init failed:', e)
  }

  app.mount('#app')
}

bootstrap().catch(console.error)
