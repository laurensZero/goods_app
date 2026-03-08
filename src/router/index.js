import { createRouter, createWebHashHistory } from 'vue-router'

/**
 * router/index.js
 * 集中管理所有页面路由。
 * 每个路由对应 views/ 下的一个页面组件。
 * 使用懒加载（动态 import）可按需拆包，加快首屏速度。
 */
const routes = [
  {
    path: '/',
    redirect: '/home'
  },
  {
    path: '/home',
    name: 'home',
    component: () => import('@/views/HomeView.vue'),
    meta: { title: '我的谷子' }
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
    meta: { title: '管理' }
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
    meta: { title: '角色名管理' }
  }
]

const router = createRouter({
  // Hash 模式：兼容 Capacitor file:// 协议（Android/iOS 打包）
  history: createWebHashHistory(),
  routes
})

// 全局前置守卫：动态修改页面标题
router.beforeEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} - 谷子收纳` : '谷子收纳'
})

export default router
