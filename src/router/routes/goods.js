export default [
  {
    path: '/search',
    name: 'search',
    component: () => import('@/views/SearchView.vue'),
    meta: { titleKey: 'nav.search' }
  },
  {
    path: '/add',
    name: 'add',
    component: () => import('@/views/AddItemView.vue'),
    meta: { titleKey: 'nav.addGoods' }
  },
  {
    path: '/batch-add',
    name: 'batch-add',
    component: () => import('@/views/BatchAddView.vue'),
    meta: { titleKey: 'nav.batchAdd' }
  },
  {
    path: '/detail/:id',
    name: 'detail',
    component: () => import('@/views/DetailView.vue'),
    meta: { titleKey: 'nav.goodsDetail' },
    props: true
  },
  {
    path: '/group/:id',
    name: 'group-detail',
    component: () => import('@/views/GroupDetailView.vue'),
    meta: { titleKey: 'nav.groupDetail' },
    props: true
  },
  {
    path: '/edit/:id',
    name: 'edit',
    component: () => import('@/views/EditItemView.vue'),
    meta: { titleKey: 'nav.editGoods' },
    props: true
  },
  {
    path: '/storage-locations',
    name: 'storage-locations',
    component: () => import('@/views/StorageLocationsView.vue'),
    meta: { titleKey: 'nav.storageLocations' }
  }
]
