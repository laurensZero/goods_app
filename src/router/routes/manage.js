export default [
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
    path: '/manage/settings',
    name: 'manage-settings',
    component: () => import('@/views/ManageView.vue'),
    meta: { title: '设置' }
  },
  {
    path: '/manage/sync',
    name: 'manage-sync',
    component: () => import('@/views/SyncView.vue'),
    meta: { title: '云同步' }
  },
  {
    path: '/manage/shares',
    name: 'manage-shares',
    component: () => import('@/views/ShareManageView.vue'),
    meta: { title: '管理分享' }
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
    path: '/trash',
    name: 'trash',
    component: () => import('@/views/TrashView.vue'),
    meta: { title: '回收站' }
  },
  {
    path: '/recharge/month-cards',
    name: 'recharge-month-cards',
    component: () => import('@/views/MonthCardCalendarView.vue'),
    meta: { title: '月卡日历' }
  }
]
