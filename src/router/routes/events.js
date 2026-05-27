export default [
  {
    path: '/events/add',
    name: 'event-add',
    component: () => import('@/views/EventAddView.vue'),
    meta: { titleKey: 'nav.addEvent' }
  },
  {
    path: '/events/link-goods',
    name: 'event-link-goods',
    component: () => import('@/views/EventGoodsPickerView.vue'),
    meta: { titleKey: 'nav.linkGoods' }
  },
  {
    path: '/events/edit/:id',
    name: 'event-edit',
    component: () => import('@/views/EventAddView.vue'),
    meta: { titleKey: 'nav.editEvent' },
    props: true
  },
  {
    path: '/events/:id',
    name: 'event-detail',
    component: () => import('@/views/EventDetailView.vue'),
    meta: { titleKey: 'nav.eventDetail' },
    props: true
  }
]
