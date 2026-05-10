import EventAddView from '@/views/EventAddView.vue'
import EventDetailView from '@/views/EventDetailView.vue'

export default [
  {
    path: '/events/add',
    name: 'event-add',
    component: EventAddView,
    meta: { title: '添加活动' }
  },
  {
    path: '/events/link-goods',
    name: 'event-link-goods',
    component: () => import('@/views/EventGoodsPickerView.vue'),
    meta: { title: '选择关联谷子' }
  },
  {
    path: '/events/edit/:id',
    name: 'event-edit',
    component: EventAddView,
    meta: { title: '编辑活动' },
    props: true
  },
  {
    path: '/events/:id',
    name: 'event-detail',
    component: EventDetailView,
    meta: { title: '活动详情' },
    props: true
  }
]
