import { createRouter, createWebHashHistory } from 'vue-router'
import i18n from '@/locales'

import tabRoutes from './routes/tabs'
import goodsRoutes from './routes/goods'
import eventRoutes from './routes/events'
import manageRoutes from './routes/manage'
import importRoutes from './routes/import'

const routes = [
  ...tabRoutes,
  ...goodsRoutes,
  ...eventRoutes,
  ...manageRoutes,
  ...importRoutes
]

if ('scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual'
}

const MANUAL_SCROLL_RESTORE_ROUTES = new Set([
  'home',
  'wishlist',
  'recharge',
  'events',
  'detail',
  'character-leaderboard',
  'manage'
])

const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (MANUAL_SCROLL_RESTORE_ROUTES.has(String(to.name || ''))) {
      return false
    }

    if (savedPosition) {
      return savedPosition
    }

    return { left: 0, top: 0 }
  }
})

let isPopstateNavigation = false
window.addEventListener('popstate', () => {
  isPopstateNavigation = true
})

router.beforeEach((to) => {
  const { t } = i18n.global
  const title = to.meta.titleKey ? t(to.meta.titleKey) : (to.meta.title || '')
  document.title = title ? `${title} - ${t('common.appName')}` : t('common.appName')
  const htmlEl = document.documentElement
  if (isPopstateNavigation) {
    htmlEl.classList.add('is-back')
  } else {
    htmlEl.classList.remove('is-back')
  }
  isPopstateNavigation = false
})

export default router
