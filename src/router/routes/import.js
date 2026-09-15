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
    path: '/checkout',
    name: 'checkout',
    component: () => import('@/views/import/CheckoutView.vue'),
    meta: { titleKey: 'checkout.title' },
    // 白名单安全兜底：未登录或无权限时拦截，回退到来源页（避免被 / 重定向到默认 Tab）
    beforeEnter: async (to, from) => {
      const blocked = await ensureMihoyoFeaturesEnabled(from)
      if (blocked) return blocked
      const { useAuthStore } = await import('@/stores/auth')
      const auth = useAuthStore()
      const fallback = from?.name && from.name !== 'checkout' ? from.fullPath : '/home'
      // 确保 session 已恢复（刷新后 Supabase auth 异步加载，否则 isLoggedIn 可能为 false）
      await auth.init()
      if (!auth.isLoggedIn) return fallback
      const { checkFeaturePermission } = await import('@/composables/permission/useFeaturePermission')
      const allowed = await checkFeaturePermission('checkout')
      if (!allowed) {
        const { showGlobalToast } = await import('@/utils/globalToast')
        const { default: i18n } = await import('@/locales')
        showGlobalToast(i18n.global.t('checkout.notAuthorized'))
        return fallback
      }
    }
  },
  {
    path: '/taobao-import',
    name: 'taobao-import',
    component: () => import('@/views/import/TaobaoImportView.vue'),
    meta: { titleKey: 'nav.taobaoImport' }
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
  return from?.name && from.name !== 'checkout' ? from.fullPath : '/home'
}
