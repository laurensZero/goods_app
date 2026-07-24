export default [
  {
    path: '/manage/categories',
    name: 'manage-categories',
    component: () => import('@/views/CategoryManageView.vue'),
    meta: { titleKey: 'nav.categoryManage' }
  },
  {
    path: '/manage/ips',
    name: 'manage-ips',
    component: () => import('@/views/IpManageView.vue'),
    meta: { titleKey: 'nav.ipManage' }
  },
  {
    path: '/manage/characters',
    name: 'manage-characters',
    component: () => import('@/views/CharacterManageView.vue'),
    meta: { titleKey: 'nav.characterManage' }
  },
  {
    path: '/manage/theme',
    name: 'manage-theme',
    component: () => import('@/views/ThemeView.vue'),
    meta: { titleKey: 'nav.themeAppearance' }
  },
  {
    path: '/manage/settings',
    name: 'manage-settings',
    component: () => import('@/views/ManageView.vue'),
    meta: { titleKey: 'nav.settings' }
  },
  {
    path: '/manage/sync',
    name: 'manage-sync',
    component: () => import('@/views/SyncView.vue'),
    meta: { titleKey: 'nav.cloudSync' }
  },
  {
    path: '/manage/shares',
    name: 'manage-shares',
    component: () => import('@/views/ShareManageView.vue'),
    meta: { titleKey: 'nav.manageShares' }
  },
  {
    path: '/manage/feedback',
    name: 'manage-feedback',
    component: () => import('@/views/FeedbackView.vue'),
    meta: { titleKey: 'nav.feedback' }
  },
  {
    path: '/manage/about',
    name: 'manage-about',
    component: () => import('@/views/AboutView.vue'),
    meta: { titleKey: 'nav.about' }
  },
  {
    path: '/manage/language',
    name: 'manage-language',
    component: () => import('@/views/LanguageView.vue'),
    meta: { titleKey: 'nav.language' }
  },
  {
    path: '/manage/notifications',
    name: 'manage-notifications',
    component: () => import('@/views/NotifySettingsView.vue'),
    meta: { titleKey: 'nav.notificationSettings' }
  },
  {
    path: '/leaderboard/characters',
    name: 'character-leaderboard',
    component: () => import('@/views/CharacterLeaderboardView.vue'),
    meta: { titleKey: 'nav.dataStatistics', showTabBar: true }
  },
  {
    path: '/trash',
    name: 'trash',
    component: () => import('@/views/TrashView.vue'),
    meta: { titleKey: 'nav.trash' }
  },
  {
    path: '/recharge/month-cards',
    name: 'recharge-month-cards',
    component: () => import('@/views/MonthCardCalendarView.vue'),
    meta: { titleKey: 'nav.monthCardCalendar' }
  }
]
