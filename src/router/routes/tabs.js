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
    meta: { titleKey: 'nav.home', keepAlive: true, showTabBar: true }
  },
  {
    path: '/recharge',
    name: 'recharge',
    component: RechargeView,
    meta: { titleKey: 'nav.recharge', keepAlive: true, showTabBar: true }
  },
  {
    path: '/wishlist',
    name: 'wishlist',
    component: WishlistView,
    meta: { titleKey: 'nav.wishlist', keepAlive: true, showTabBar: true }
  },
  {
    path: '/manage',
    name: 'manage',
    component: MyView,
    meta: { titleKey: 'nav.my', keepAlive: true, showTabBar: true }
  },
  {
    path: '/events',
    name: 'events',
    component: EventsView,
    meta: { titleKey: 'nav.events', keepAlive: true, showTabBar: true }
  }
]
