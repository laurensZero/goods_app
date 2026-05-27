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
    path: '/taobao-import',
    name: 'taobao-import',
    component: () => import('@/views/TaobaoImportView.vue'),
    meta: { titleKey: 'nav.taobaoImport' }
  },
  {
    path: '/share/:gistId?',
    name: 'share-import',
    component: () => import('@/views/ShareImportView.vue'),
    meta: { titleKey: 'nav.importShare' },
    props: true
  }
]
