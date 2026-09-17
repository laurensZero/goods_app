export default [
  {
    path: '/manage/categories',
    name: 'manage-categories',
    component: () => import('@/views/manage/CategoryManageView.vue'),
    meta: { titleKey: 'nav.categoryManage' }
  },
  {
    path: '/manage/event-types',
    name: 'manage-event-types',
    component: () => import('@/views/events/EventTypeManageView.vue'),
    meta: { titleKey: 'nav.eventTypeManage' }
  },
  {
    path: '/manage/ips',
    name: 'manage-ips',
    component: () => import('@/views/manage/IpManageView.vue'),
    meta: { titleKey: 'nav.ipManage' }
  },
  {
    path: '/manage/characters',
    name: 'manage-characters',
    component: () => import('@/views/manage/CharacterManageView.vue'),
    meta: { titleKey: 'nav.characterManage' }
  },
  {
    path: '/manage/theme',
    name: 'manage-theme',
    component: () => import('@/views/manage/ThemeView.vue'),
    meta: { titleKey: 'nav.themeAppearance' }
  },
  {
    path: '/manage/settings',
    name: 'manage-settings',
    component: () => import('@/views/manage/ManageView.vue'),
    meta: { titleKey: 'nav.settings' }
  },
  {
    path: '/manage/sync',
    name: 'manage-sync',
    component: () => import('@/views/manage/SyncView.vue'),
    meta: { titleKey: 'nav.cloudSync' }
  },
  {
    path: '/manage/shares',
    name: 'manage-shares',
    component: () => import('@/views/manage/ShareManageView.vue'),
    meta: { titleKey: 'nav.manageShares' }
  },
  {
    path: '/manage/feedback',
    name: 'manage-feedback',
    component: () => import('@/views/manage/FeedbackView.vue'),
    meta: { titleKey: 'nav.feedback' }
  },
  {
    path: '/manage/about',
    name: 'manage-about',
    component: () => import('@/views/manage/AboutView.vue'),
    meta: { titleKey: 'nav.about' }
  },
  {
    path: '/manage/language',
    name: 'manage-language',
    component: () => import('@/views/manage/LanguageView.vue'),
    meta: { titleKey: 'nav.language' }
  },
  {
    path: '/manage/notifications',
    name: 'manage-notifications',
    component: () => import('@/views/manage/NotifySettingsView.vue'),
    meta: { titleKey: 'nav.notificationSettings' }
  },
  {
    path: '/manage/mcp',
    name: 'manage-mcp',
    component: () => import('@/views/manage/McpSettingsView.vue'),
    meta: { titleKey: 'nav.mcpService' }
  },
  {
    path: '/manage/mihoyo-features',
    name: 'mihoyo-features',
    component: () => import('@/views/mihoyo/MihoyoFeaturesView.vue'),
    meta: { titleKey: 'nav.mihoyoFeatures' }
  },
  {
    path: '/manage/ai-chat',
    name: 'manage-ai-chat',
    component: () => import('@/views/ai/AiChatView.vue'),
    meta: { titleKey: 'nav.aiChat' }
  },
  {
    path: '/manage/mihoyo-stock-monitor',
    name: 'mihoyo-stock-monitor',
    component: () => import('@/views/mihoyo/MihoyoStockMonitorView.vue'),
    meta: { titleKey: 'nav.mihoyoStockMonitor' },
    beforeEnter: () => ensureMihoyoFeaturesEnabled()
  },
  {
    path: '/mihoyo-new-arrivals',
    name: 'mihoyo-new-arrivals',
    component: () => import('@/views/mihoyo/MihoyoNewArrivalsView.vue'),
    meta: { titleKey: 'nav.mihoyoNewArrivals' },
    beforeEnter: () => ensureMihoyoFeaturesEnabled()
  },
  {
    path: '/manage/surveys',
    name: 'manage-surveys',
    component: () => import('@/views/manage/SurveyListView.vue'),
    meta: { titleKey: 'nav.surveys' }
  },
  {
    path: '/leaderboard/characters',
    name: 'character-leaderboard',
    component: () => import('@/views/manage/StatisticsView.vue'),
    meta: { titleKey: 'nav.dataStatistics', showTabBar: true, keepAlive: true }
  },
  {
    path: '/trash',
    name: 'trash',
    component: () => import('@/views/goods/TrashView.vue'),
    meta: { titleKey: 'nav.trash' }
  },
  {
    path: '/manage/sale-ledger',
    name: 'manage-sale-ledger',
    component: () => import('@/views/manage/SaleLedgerView.vue'),
    meta: { titleKey: 'nav.saleLedger' }
  },
  {
    path: '/recharge/month-cards',
    name: 'recharge-month-cards',
    component: () => import('@/views/recharge/MonthCardCalendarView.vue'),
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
