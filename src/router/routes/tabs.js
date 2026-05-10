import HomeView from '@/views/HomeView.vue'
import RechargeView from '@/views/RechargeView.vue'
import WishlistView from '@/views/WishlistView.vue'
import MyView from '@/views/MyView.vue'
import EventsView from '@/views/EventsView.vue'

export default [
  { path: '/', redirect: '/home' },
  {
    path: '/home',
    name: 'home',
    component: HomeView,
    meta: { title: '我的谷子', keepAlive: true }
  },
  {
    path: '/recharge',
    name: 'recharge',
    component: RechargeView,
    meta: { title: '充值', keepAlive: true }
  },
  {
    path: '/wishlist',
    name: 'wishlist',
    component: WishlistView,
    meta: { title: '心愿单', keepAlive: true }
  },
  {
    path: '/manage',
    name: 'manage',
    component: MyView,
    meta: { title: '我的', keepAlive: true }
  },
  {
    path: '/events',
    name: 'events',
    component: EventsView,
    meta: { title: '活动记录', keepAlive: true }
  }
]
