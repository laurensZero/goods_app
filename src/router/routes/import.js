export default [
  {
    path: '/import',
    name: 'import',
    component: () => import('@/views/import/ImportView.vue'),
    meta: { titleKey: 'nav.importFromMihoyo' },
    beforeEnter: () => ensureMihoyoFeaturesEnabled()
  },
  {
    path: '/cart-import',
    name: 'cart-import',
    component: () => import('@/views/import/CartImportView.vue'),
    meta: { titleKey: 'nav.cartImport' },
    beforeEnter: () => ensureMihoyoFeaturesEnabled()
  },
  {
    path: '/account-import',
    name: 'account-import',
    component: () => import('@/views/import/AccountImportView.vue'),
    meta: { titleKey: 'nav.accountImport' },
    beforeEnter: () => ensureMihoyoFeaturesEnabled()
  },
  {
    // 淘宝导入聚合页：链接导入 / 订单导入 / 搜索（占位）
    path: '/taobao-import',
    name: 'taobao-import',
    component: () => import('@/views/import/TaobaoHubView.vue'),
    meta: { titleKey: 'nav.taobaoImport' }
  },
  {
    path: '/taobao-import/order',
    name: 'taobao-order-import',
    component: () => import('@/views/import/TaobaoImportView.vue'),
    meta: { titleKey: 'nav.taobaoOrderImport' }
  },
  {
    path: '/share/:shareId?',
    name: 'share-import',
    component: () => import('@/views/import/ShareImportView.vue'),
    meta: { titleKey: 'nav.importShare' },
    props: true
  }
]

/** 米游铺功能总开关关闭时拦截相关路由；开启时返回 undefined 放行（不能 return false，会取消导航） */
async function ensureMihoyoFeaturesEnabled(from) {
  const { useMihoyoFeaturesStore } = await import('@/stores/mihoyoFeatures')
  const store = useMihoyoFeaturesStore()
  if (store.enabled) return
  const { showGlobalToast } = await import('@/utils/globalToast')
  const { default: i18n } = await import('@/locales')
  showGlobalToast(i18n.global.t('toast.mihoyoFeaturesDisabled'))
  return from?.name ? from.fullPath : '/home'
}
