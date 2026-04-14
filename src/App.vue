<template>
  <div class="app-wrapper">
    <div class="route-stage">
      <RouterView v-slot="{ Component, route: currentRoute }">
        <Transition :name="routeTransitionName">
          <KeepAlive v-if="Component" :include="keepAliveViewNames">
            <component
              :is="Component"
              :key="currentRoute.meta.keepAlive ? getKeepAliveKey(currentRoute) : getRouteKey(currentRoute)"
              class="route-scene"
            />
          </KeepAlive>
        </Transition>
      </RouterView>
      <Transition name="route-soft-loader-fade">
        <div v-if="fakeLoadingVisible" class="route-soft-loader" aria-hidden="true">
          <div class="route-soft-loader__card route-soft-loader__card--hero" />
          <div class="route-soft-loader__grid">
            <span v-for="index in 6" :key="`soft-loader-${index}`" class="route-soft-loader__card route-soft-loader__card--tile" />
          </div>
        </div>
      </Transition>
    </div>
    <Transition :name="tabBarTransitionName">
      <TabBar v-if="showTabBar" />
    </Transition>
    <FloatingAudioPlayer :with-tab-bar="showTabBar" />
    <AnnouncementDialog />
    <WebUpdateDialog />
    <AppUpdateDialog />
  </div>
</template>

<script setup>
import { computed, KeepAlive, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Capacitor } from '@capacitor/core'
import { useRoute } from 'vue-router'
import AnnouncementDialog from '@/components/app/AnnouncementDialog.vue'
import AppUpdateDialog from '@/components/app/AppUpdateDialog.vue'
import FloatingAudioPlayer from '@/components/app/FloatingAudioPlayer.vue'
import WebUpdateDialog from '@/components/app/WebUpdateDialog.vue'
import TabBar from '@/components/app/TabBar.vue'
import { useAnnouncementStore } from '@/stores/announcement'
import { useAppUpdateStore } from '@/stores/appUpdate'
import { useGoodsStore } from '@/stores/goods'
import { useEventsStore } from '@/stores/events'
import { useRechargeStore } from '@/composables/recharge/useRechargeStore'
import { useWebUpdateStore } from '@/stores/webUpdate'
import { useSyncStore } from '@/stores/sync'

const route = useRoute()
const syncStore = useSyncStore()
const goodsStore = useGoodsStore()
const eventsStore = useEventsStore()
const rechargeStore = useRechargeStore()
const announcementStore = useAnnouncementStore()
const appUpdateStore = useAppUpdateStore()
const webUpdateStore = useWebUpdateStore()
const keepAliveViewNames = ['HomeView', 'WishlistView', 'ManageView', 'EventsView']
const hiddenTabBarRoutes = ['detail', 'add', 'edit', 'import', 'cart-import', 'account-import', 'taobao-import', 'manage-categories', 'manage-ips', 'manage-characters', 'manage-theme', 'manage-about', 'storage-locations', 'trash', 'event-add', 'event-edit', 'event-detail']
const showTabBar = computed(() => !hiddenTabBarRoutes.includes(String(route.name ?? '')))
const routeTransitionName = ref('route-none')
const fakeLoadingVisible = ref(false)
const MAIN_ROUTE_NAMES = new Set(['home', 'wishlist', 'events', 'manage'])
const SOFT_LOADER_DURATION = 190
const hasLocalData = computed(() => (
  resolveArrayValue(goodsStore.list).length > 0
  || resolveArrayValue(goodsStore.trashList).length > 0
  || resolveArrayValue(rechargeStore.records).length > 0
  || resolveArrayValue(eventsStore.list).length > 0
))
const tabBarTransitionName = computed(() => {
  if (routeTransitionName.value === 'route-back') return 'tabbar-back'
  if (routeTransitionName.value === 'route-forward') return 'tabbar-forward'
  return 'tabbar-none'
})
function resolveArrayValue(source) {
  if (Array.isArray(source)) return source
  if (Array.isArray(source?.value)) return source.value
  return []
}

let pendingRouteDirection = 'forward'
let hasMountedRoute = false
let softLoaderTimer = 0
let previousRouteName = String(route.name ?? '')

function isMainRouteName(routeName) {
  return MAIN_ROUTE_NAMES.has(String(routeName || ''))
}

function showSoftLoader() {
  if (softLoaderTimer) {
    window.clearTimeout(softLoaderTimer)
    softLoaderTimer = 0
  }

  fakeLoadingVisible.value = true
  softLoaderTimer = window.setTimeout(() => {
    fakeLoadingVisible.value = false
    softLoaderTimer = 0
  }, SOFT_LOADER_DURATION)
}

function markBackNavigation() {
  pendingRouteDirection = 'back'
}

watch(
  () => route.fullPath,
  (_, previousPath) => {
    const currentRouteName = String(route.name ?? '')

    if (!previousPath || !hasMountedRoute) {
      hasMountedRoute = true
      routeTransitionName.value = 'route-none'
      pendingRouteDirection = 'forward'
      previousRouteName = currentRouteName
      return
    }

    const switchedBetweenMainScenes = isMainRouteName(previousRouteName)
      && isMainRouteName(currentRouteName)
      && previousRouteName !== currentRouteName
    if (switchedBetweenMainScenes) {
      showSoftLoader()
    }

    routeTransitionName.value = pendingRouteDirection === 'back' ? 'route-back' : 'route-forward'
    pendingRouteDirection = 'forward'
    previousRouteName = currentRouteName
  }
)

async function handleVisibilityChange() {
  if (document.hidden) {
    if (syncStore.token && syncStore.gistId && !syncStore.isSyncing && !syncStore.conflictData) {
      const localChanges = syncStore.getLocalChangesSinceLastSync()
      if (!localChanges.hasChanges) return

      try {
        await syncStore.fullSync()
      } catch {
        // silent fail on background sync
      }
    }
  }
}

onMounted(async () => {
  hasMountedRoute = true
  window.addEventListener('popstate', markBackNavigation, { passive: true })
  document.addEventListener('visibilitychange', handleVisibilityChange, { passive: true })

  void appUpdateStore.init()
  void webUpdateStore.init()
  void announcementStore.init()
  const shouldAutoCheckUpdate = !(import.meta.env.DEV && !Capacitor.isNativePlatform())
  if (shouldAutoCheckUpdate) {
    void appUpdateStore.checkForUpdates({ source: 'startup' }).catch(() => {
      // silent fail on startup update check
    })

    if (Capacitor.isNativePlatform()) {
      void webUpdateStore.checkForUpdates().catch(() => {
        // silent fail on startup web bundle update check
      })
    }

  }

  void announcementStore.checkAndDecide({ source: 'startup' }).catch(() => {
    // silent fail on startup announcement check
  })

  // 自动拉取
  await syncStore.init()
  if (syncStore.token && syncStore.gistId && !syncStore.isSyncing && !hasLocalData.value) {
    try {
      await syncStore.pullOnly()
    } catch {
      // silent fail on startup pull
    }
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('popstate', markBackNavigation)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  if (softLoaderTimer) {
    window.clearTimeout(softLoaderTimer)
    softLoaderTimer = 0
  }
})

function getKeepAliveKey(currentRoute) {
  return String(currentRoute.name ?? currentRoute.path ?? currentRoute.fullPath)
}

function getRouteKey(currentRoute) {
  return currentRoute.fullPath
}

</script>

<style>
.route-stage {
  position: relative;
  min-height: inherit;
  overflow: hidden;
  isolation: isolate;
  background-color: var(--app-bg);
  background: var(--app-bg-gradient);
}

.route-scene {
  min-height: inherit;
  backface-visibility: hidden;
  background-color: var(--app-bg);
  background: var(--app-bg-gradient);
}

.route-soft-loader {
  position: absolute;
  inset: 0;
  z-index: 20;
  pointer-events: none;
  padding: calc(env(safe-area-inset-top) + 16px) var(--page-padding) calc(var(--tabbar-height) + env(safe-area-inset-bottom) + 24px);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--app-bg) 56%, transparent), color-mix(in srgb, var(--app-bg) 74%, transparent)),
    var(--app-bg-gradient);
}

.route-soft-loader__grid {
  margin-top: 16px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.route-soft-loader__card {
  border-radius: var(--radius-card);
  border: 1px solid var(--app-glass-border);
  background:
    linear-gradient(100deg, transparent 20%, color-mix(in srgb, var(--app-text) 10%, transparent) 50%, transparent 80%),
    color-mix(in srgb, var(--app-surface) 88%, transparent);
  background-size: 220% 100%, 100% 100%;
  box-shadow: var(--app-shadow);
  animation: route-soft-loader-shimmer 680ms ease-out 1;
}

.route-soft-loader__card--hero {
  height: 138px;
  border-radius: var(--radius-large);
}

.route-soft-loader__card--tile {
  height: 88px;
}

@keyframes route-soft-loader-shimmer {
  0% {
    background-position: 140% 0, 0 0;
    opacity: 0.82;
  }

  100% {
    background-position: -40% 0, 0 0;
    opacity: 1;
  }
}

.route-soft-loader-fade-enter-active,
.route-soft-loader-fade-leave-active {
  transition: opacity 140ms ease;
}

.route-soft-loader-fade-enter-from,
.route-soft-loader-fade-leave-to {
  opacity: 0;
}

@media (min-width: 700px) {
  .route-soft-loader__grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (prefers-reduced-motion: reduce) {
  .route-soft-loader__card {
    animation: none;
  }

  .route-soft-loader-fade-enter-active,
  .route-soft-loader-fade-leave-active {
    transition: opacity 100ms ease;
  }
}

.route-forward-enter-active,
.route-forward-leave-active,
.route-back-enter-active,
.route-back-leave-active {
  position: absolute;
  inset: 0;
  width: 100%;
  transition:
    transform 170ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 170ms ease;
  will-change: transform, opacity;
}

.route-forward-enter-from {
  opacity: 0;
  transform: translate3d(12px, 0, 0);
}

.route-forward-leave-to {
  opacity: 0;
}

.route-back-enter-from {
  opacity: 0;
  transform: translate3d(-10px, 0, 0);
}

.route-back-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .route-forward-enter-active,
  .route-forward-leave-active,
  .route-back-enter-active,
  .route-back-leave-active {
    transition: opacity 120ms ease;
  }

  .route-forward-enter-from,
  .route-forward-leave-to,
  .route-back-enter-from,
  .route-back-leave-to {
    transform: none;
  }
}

.tab-bar.tabbar-forward-enter-active,
.tab-bar.tabbar-forward-leave-active,
.tab-bar.tabbar-back-enter-active,
.tab-bar.tabbar-back-leave-active {
  transition: opacity 160ms ease;
  will-change: opacity;
}

.tab-bar.tabbar-forward-enter-from,
.tab-bar.tabbar-forward-leave-to,
.tab-bar.tabbar-back-enter-from,
.tab-bar.tabbar-back-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .tab-bar.tabbar-forward-enter-active,
  .tab-bar.tabbar-forward-leave-active,
  .tab-bar.tabbar-back-enter-active,
  .tab-bar.tabbar-back-leave-active {
    transition: opacity 120ms ease;
  }
}
</style>
