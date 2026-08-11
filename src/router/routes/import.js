export default [
  {
    path: '/import',
    name: 'import',
    component: () => import('@/views/ImportView.vue'),
    meta: { titleKey: 'nav.importFromMihoyo' }
  },
  {
    path: '/cart-import',
    name: 'cart-import',
    component: () => import('@/views/CartImportView.vue'),
    meta: { titleKey: 'nav.cartImport' }
  },
  {
    path: '/account-import',
    name: 'account-import',
    component: () => import('@/views/AccountImportView.vue'),
    meta: { titleKey: 'nav.accountImport' }
  },
  {
    path: '/checkout',
    name: 'checkout',
    component: () => import('@/views/CheckoutView.vue'),
    meta: { titleKey: 'checkout.title' },
    // 白名单安全兜底：未登录或无权限时拦截，回退到来源页（避免被 / 重定向到默认 Tab）
    beforeEnter: async (to, from) => {
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
    component: () => import('@/views/TaobaoImportView.vue'),
    meta: { titleKey: 'nav.taobaoImport' }
  },
  {
    path: '/share/:shareId?',
    name: 'share-import',
    component: () => import('@/views/ShareImportView.vue'),
    meta: { titleKey: 'nav.importShare' },
    props: true
  }
]
