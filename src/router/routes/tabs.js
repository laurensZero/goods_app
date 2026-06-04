const HomeView = () => import('@/views/HomeView.vue')
const RechargeView = () => import('@/views/RechargeView.vue')
const WishlistView = () => import('@/views/WishlistView.vue')
const MyView = () => import('@/views/MyView.vue')
const EventsView = () => import('@/views/EventsView.vue')

const COLLECTION_TAB_STORAGE_KEY = 'goods_collection_tab_v1'

function resolveDefaultTab() {
  try {
    const stored = localStorage.getItem(COLLECTION_TAB_STORAGE_KEY)
    if (stored === 'wishlist') return '/wishlist'
    if (stored === 'stats') return '/leaderboard/characters'
  } catch {}
  return '/home'
}

export default [
  { path: '/', redirect: () => resolveDefaultTab() },
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
