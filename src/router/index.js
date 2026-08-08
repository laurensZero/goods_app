import { createRouter, createWebHashHistory } from 'vue-router'
import i18n from '@/locales'

import tabRoutes from './routes/tabs'
import goodsRoutes from './routes/goods'
import eventRoutes from './routes/events'
import manageRoutes from './routes/manage'
import importRoutes from './routes/import'

const routes = [
  // Auth callback catch-all（OAuth / Magic Link 回调）
  {
    path: '/:pathMatch(access_token)*',
    redirect: '/manage'
  },
  ...tabRoutes,
  ...goodsRoutes,
  ...eventRoutes,
  ...manageRoutes,
  ...importRoutes,
  // 404 catch-all：未匹配的 hash 若渲染不出组件，App.vue 的 RouterView 会拿到空 Component
  {
    path: '/:pathMatch(.*)*',
    redirect: '/'
  }
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
  'manage',
  // 这些设置页面使用自己的 .page-body 滚动容器，不能让路由默认行为
  // 同时改动 window 滚动位置，否则切换子页面时会出现轻微下移。
  'manage-settings',
  'manage-notifications',
  'mihoyo-stock-monitor',
  'manage-categories',
  'manage-ips',
  'manage-characters',
  'manage-theme',
  'manage-sync',
  'manage-shares',
  'manage-feedback',
  'manage-about',
  'manage-language',
  'manage-surveys',
  'trash',
  'storage-locations'
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
  // OAuth 回调：URL 中含有 access_token，重定向到首页
  // 回调 token 的提取与 URL 清理统一由 main.js 的 handleAuthCallback 处理；
  // 这里只做路由级 redirect（file:// 下直接 replaceState('/') 会破坏 URL）
  const fullPath = to.fullPath || ''
  if (fullPath.includes('access_token')) {
    return '/'
  }

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

// Suppress unhandled NavigationDuplicated rejections (common when pushing to the same route)
router.onError((err) => {
  if (err?.message?.includes('NavigationDuplicated') || err?.name === 'NavigationDuplicated') return
  console.error('[router]', err)
})

export default router
