export default [
  {
    path: '/events/add',
    name: 'event-add',
    component: () => import('@/views/events/EventAddView.vue'),
    meta: { titleKey: 'nav.addEvent' }
  },
  {
    path: '/events/link-goods',
    name: 'event-link-goods',
    component: () => import('@/views/events/EventGoodsPickerView.vue'),
    meta: { titleKey: 'nav.linkGoods' }
  },
  {
    path: '/events/map',
    name: 'event-map',
    component: () => import('@/views/events/EventMapView.vue'),
    meta: { titleKey: 'events.map.title', keepAlive: true }
  },
  {
    path: '/events/edit/:id',
    name: 'event-edit',
    component: () => import('@/views/events/EventAddView.vue'),
    meta: { titleKey: 'nav.editEvent' },
    props: true
  },
  {
    path: '/events/:id',
    name: 'event-detail',
    component: () => import('@/views/events/EventDetailView.vue'),
    meta: { titleKey: 'nav.eventDetail' },
    props: true
  }
]
