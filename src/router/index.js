import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  { path: '/', redirect: '/home' },
  {
    path: '/home',
    name: 'home',
    component: () => import('@/views/HomeView.vue'),
    meta: { title: '我的谷子', keepAlive: true }
  },
  {
    path: '/wishlist',
    name: 'wishlist',
    component: () => import('@/views/WishlistView.vue'),
    meta: { title: '心愿单', keepAlive: true }
  },
  {
    path: '/search',
    name: 'search',
    component: () => import('@/views/SearchView.vue'),
    meta: { title: '搜索' }
  },
  {
    path: '/add',
    name: 'add',
    component: () => import('@/views/AddItemView.vue'),
    meta: { title: '添加谷子' }
  },
  {
    path: '/import',
    name: 'import',
    component: () => import('@/views/ImportView.vue'),
    meta: { title: '从米游铺导入' }
  },
  {
    path: '/cart-import',
    name: 'cart-import',
    component: () => import('@/views/CartImportView.vue'),
    meta: { title: '购物车导入' }
  },
  {
    path: '/account-import',
    name: 'account-import',
    component: () => import('@/views/AccountImportView.vue'),
    meta: { title: '账号批量导入' }
  },
  {
    path: '/taobao-import',
    name: 'taobao-import',
    component: () => import('@/views/TaobaoImportView.vue'),
    meta: { title: '淘宝订单导入' }
  },
  {
    path: '/detail/:id',
    name: 'detail',
    component: () => import('@/views/DetailView.vue'),
    meta: { title: '谷子详情' },
    props: true
  },
  {
    path: '/edit/:id',
    name: 'edit',
    component: () => import('@/views/EditItemView.vue'),
    meta: { title: '编辑谷子' },
    props: true
  },
  {
    path: '/manage',
    name: 'manage',
    component: () => import('@/views/ManageView.vue'),
    meta: { title: '管理', keepAlive: true }
  },
  {
    path: '/timeline',
    name: 'timeline',
    component: () => import('@/views/TimelineView.vue'),
    meta: { title: '时间线', keepAlive: true }
  },
  {
    path: '/manage/categories',
    name: 'manage-categories',
    component: () => import('@/views/CategoryManageView.vue'),
    meta: { title: '分类管理' }
  },
  {
    path: '/manage/ips',
    name: 'manage-ips',
    component: () => import('@/views/IpManageView.vue'),
    meta: { title: 'IP 管理' }
  },
  {
    path: '/manage/characters',
    name: 'manage-characters',
    component: () => import('@/views/CharacterManageView.vue'),
    meta: { title: '角色管理' }
  },
  {
    path: '/manage/theme',
    name: 'manage-theme',
    component: () => import('@/views/ThemeView.vue'),
    meta: { title: '主题与外观' }
  },
  {
    path: '/manage/about',
    name: 'manage-about',
    component: () => import('@/views/AboutView.vue'),
    meta: { title: '关于应用' }
  },
  {
    path: '/leaderboard/characters',
    name: 'character-leaderboard',
    component: () => import('@/views/CharacterLeaderboardView.vue'),
    meta: { title: '数据统计' }
  },
  {
    path: '/storage-locations',
    name: 'storage-locations',
    component: () => import('@/views/StorageLocationsView.vue'),
    meta: { title: '收纳位置' }
  },
  {
    path: '/trash',
    name: 'trash',
    component: () => import('@/views/TrashView.vue'),
    meta: { title: '回收站' }
  },
  {
    path: '/manage/sync',
    name: 'manage-sync',
    component: () => import('@/views/SyncView.vue'),
    meta: { title: '云同步' }
  }
]

if ('scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual'
}

const MANUAL_SCROLL_RESTORE_ROUTES = new Set([
  'home',
  'search',
  'wishlist',
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

router.beforeEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} - 谷子收藏` : '谷子收藏'
})

export default router
