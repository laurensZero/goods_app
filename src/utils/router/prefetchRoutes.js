// 路由 chunk 空闲预取：弱网下切 Tab / 进详情不再等现场下载
// 与 router/routes 里的 () => import() 指向同一模块，会命中同一 chunk 缓存

const routeChunkLoaders = {
  home: () => import('@/views/tabs/HomeView.vue'),
  wishlist: () => import('@/views/tabs/WishlistView.vue'),
  events: () => import('@/views/tabs/EventsView.vue'),
  recharge: () => import('@/views/tabs/RechargeView.vue'),
  manage: () => import('@/views/tabs/MyView.vue'),
  detail: () => import('@/views/goods/DetailView.vue'),
  manageView: () => import('@/views/manage/ManageView.vue')
}

const prefetched = new Set()

export function prefetchRouteChunks(keys) {
  for (const key of keys) {
    if (prefetched.has(key)) continue
    const loader = routeChunkLoaders[key]
    if (!loader) continue
    prefetched.add(key)
    loader().catch(() => {
      // 失败允许下次再试（用户主动进入时路由仍会重新 import）
      prefetched.delete(key)
    })
  }
}

function scheduleIdle(fn, timeout = 2500) {
  if (typeof window === 'undefined') return
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(fn, { timeout })
    return
  }
  window.setTimeout(fn, 400)
}

/** 首屏挂载后空闲预取：其余主 Tab + 详情/我的管理页 */
export function prefetchCoreRouteChunksAfterIdle() {
  scheduleIdle(() => {
    prefetchRouteChunks(['wishlist', 'events', 'recharge', 'manage', 'home', 'detail'])
  })
}

/** Tab 指针悬停 / 触摸时提前拉对应 chunk（桌面 hover、手机 touchstart） */
export function prefetchTabChunkOnIntent(tabKey) {
  const map = {
    collection: ['home', 'wishlist'],
    home: ['home'],
    wishlist: ['wishlist'],
    events: ['events'],
    recharge: ['recharge'],
    manage: ['manage', 'manageView']
  }
  const keys = map[tabKey]
  if (keys) prefetchRouteChunks(keys)
}
