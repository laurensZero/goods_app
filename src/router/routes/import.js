export default [
  {
    path: '/import',
    name: 'import',
    component: () => import('@/views/ImportView.vue'),
    meta: { title: '从米游铺导入' }
  },
  {
    path: '/cart-import',
    name: 'cart-import',
    component: () => import('@/views/CartImportView.vue'),
    meta: { title: '购物车导入' }
  },
  {
    path: '/account-import',
    name: 'account-import',
    component: () => import('@/views/AccountImportView.vue'),
    meta: { title: '账号批量导入' }
  },
  {
    path: '/taobao-import',
    name: 'taobao-import',
    component: () => import('@/views/TaobaoImportView.vue'),
    meta: { title: '淘宝订单导入' }
  },
  {
    path: '/share/:gistId?',
    name: 'share-import',
    component: () => import('@/views/ShareImportView.vue'),
    meta: { title: '导入分享' },
    props: true
  }
]
