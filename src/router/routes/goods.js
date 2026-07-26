export default [
  {
    path: '/add',
    name: 'add',
    component: () => import('@/views/AddItemView.vue'),
    meta: { titleKey: 'nav.addGoods' }
  },
  {
    path: '/batch-add',
    name: 'batch-add',
    component: () => import('@/views/BatchAddQueueView.vue'),
    meta: { titleKey: 'nav.batchAdd' }
  },
  {
    path: '/batch-edit/:id',
    name: 'batch-edit',
    component: () => import('@/views/BatchItemEditView.vue'),
    meta: { titleKey: 'nav.editGoods' },
    props: true
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
    // keepAlive: key 用路由名 → 全部分组共享单个缓存实例（数据由 props.id 响应式派生）。
    // 缺少此标记时 key 会退化为 fullPath，每个分组各缓存一个实例且无上限。
    meta: { titleKey: 'nav.groupDetail', keepAlive: true },
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
