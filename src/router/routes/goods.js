import DetailView from '@/views/DetailView.vue'

export default [
  {
    path: '/search',
    name: 'search',
    component: () => import('@/views/SearchView.vue'),
    meta: { title: '搜索' }
  },
  {
    path: '/add',
    name: 'add',
    component: () => import('@/views/AddItemView.vue'),
    meta: { title: '添加谷子' }
  },
  {
    path: '/batch-add',
    name: 'batch-add',
    component: () => import('@/views/BatchAddView.vue'),
    meta: { title: '批量添加' }
  },
  {
    path: '/detail/:id',
    name: 'detail',
    component: DetailView,
    meta: { title: '谷子详情' },
    props: true
  },
  {
    path: '/edit/:id',
    name: 'edit',
    component: () => import('@/views/EditItemView.vue'),
    meta: { title: '编辑谷子' },
    props: true
  },
  {
    path: '/storage-locations',
    name: 'storage-locations',
    component: () => import('@/views/StorageLocationsView.vue'),
    meta: { title: '收纳位置' }
  }
]
