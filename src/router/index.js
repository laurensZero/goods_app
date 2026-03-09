import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    redirect: '/home'
  },
  {
    path: '/home',
    name: 'home',
    component: () => import('@/views/HomeView.vue'),
    meta: { title: '我的谷子', keepAlive: true }
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
    path: '/account-import',
    name: 'account-import',
    component: () => import('@/views/AccountImportView.vue'),
    meta: { title: '账号批量导入' }
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
    meta: { title: '角色管理' }
  }
]

if ('scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual'
}

const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior() {
    return { left: 0, top: 0 }
  }
})

router.beforeEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} - 谷子收藏` : '谷子收藏'
})

export default router
