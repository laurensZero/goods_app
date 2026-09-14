export default [
  {
    path: '/manage/categories',
    name: 'manage-categories',
    component: () => import('@/views/CategoryManageView.vue'),
    meta: { titleKey: 'nav.categoryManage' }
  },
  {
    path: '/manage/event-types',
    name: 'manage-event-types',
    component: () => import('@/views/EventTypeManageView.vue'),
    meta: { titleKey: 'nav.eventTypeManage' }
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
    path: '/manage/mcp',
    name: 'manage-mcp',
    component: () => import('@/views/McpSettingsView.vue'),
    meta: { titleKey: 'nav.mcpService' }
  },
  {
    path: '/manage/mihoyo-features',
    name: 'mihoyo-features',
    component: () => import('@/views/MihoyoFeaturesView.vue'),
    meta: { titleKey: 'nav.mihoyoFeatures' }
  },
  {
    path: '/manage/ai-chat',
    name: 'manage-ai-chat',
    component: () => import('@/views/AiChatView.vue'),
    meta: { titleKey: 'nav.aiChat' }
  },
  {
    path: '/manage/mihoyo-stock-monitor',
    name: 'mihoyo-stock-monitor',
    component: () => import('@/views/MihoyoStockMonitorView.vue'),
    meta: { titleKey: 'nav.mihoyoStockMonitor' },
    beforeEnter: () => ensureMihoyoFeaturesEnabled()
  },
  {
    path: '/mihoyo-new-arrivals',
    name: 'mihoyo-new-arrivals',
    component: () => import('@/views/MihoyoNewArrivalsView.vue'),
    meta: { titleKey: 'nav.mihoyoNewArrivals' },
    beforeEnter: () => ensureMihoyoFeaturesEnabled()
  },
  {
    path: '/manage/surveys',
    name: 'manage-surveys',
    component: () => import('@/views/SurveyListView.vue'),
    meta: { titleKey: 'nav.surveys' }
  },
  {
    path: '/leaderboard/characters',
    name: 'character-leaderboard',
    component: () => import('@/views/StatisticsView.vue'),
    meta: { titleKey: 'nav.dataStatistics', showTabBar: true, keepAlive: true }
  },
  {
    path: '/trash',
    name: 'trash',
    component: () => import('@/views/TrashView.vue'),
    meta: { titleKey: 'nav.trash' }
  },
  {
    path: '/manage/sale-ledger',
    name: 'manage-sale-ledger',
    component: () => import('@/views/SaleLedgerView.vue'),
    meta: { titleKey: 'nav.saleLedger' }
  },
  {
    path: '/recharge/month-cards',
    name: 'recharge-month-cards',
    component: () => import('@/views/MonthCardCalendarView.vue'),
    meta: { titleKey: 'nav.monthCardCalendar' }
  }
]

/** 米游铺功能总开关关闭时拦截相关路由；开启时返回 undefined 放行（不能 return false，会取消导航） */
async function ensureMihoyoFeaturesEnabled() {
  const { useMihoyoFeaturesStore } = await import('@/stores/mihoyoFeatures')
  const store = useMihoyoFeaturesStore()
  if (store.enabled) return
  const { showGlobalToast } = await import('@/utils/globalToast')
  const { default: i18n } = await import('@/locales')
  showGlobalToast(i18n.global.t('toast.mihoyoFeaturesDisabled'))
  return '/home'
}
