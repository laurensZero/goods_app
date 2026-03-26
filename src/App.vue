<template>
  <div class="app-wrapper">
    <div class="route-stage">
      <RouterView v-slot="{ Component, route: currentRoute }">
        <Transition :name="routeTransitionName" mode="out-in">
          <KeepAlive v-if="Component" :include="keepAliveViewNames">
            <component
              :is="Component"
              :key="currentRoute.meta.keepAlive ? getKeepAliveKey(currentRoute) : getRouteKey(currentRoute)"
              class="route-scene"
            />
          </KeepAlive>
        </Transition>
      </RouterView>
    </div>
    <Transition :name="tabBarTransitionName">
      <TabBar v-if="showTabBar" />
    </Transition>
    <AppUpdateDialog />
  </div>
</template>

<script setup>
import { computed, KeepAlive, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Capacitor } from '@capacitor/core'
import { useRoute } from 'vue-router'
import AppUpdateDialog from '@/components/AppUpdateDialog.vue'
import TabBar from '@/components/TabBar.vue'
import { useAppUpdateStore } from '@/stores/appUpdate'
import { useWebUpdateStore } from '@/stores/webUpdate'
import { useSyncStore } from '@/stores/sync'

const route = useRoute()
const syncStore = useSyncStore()
const appUpdateStore = useAppUpdateStore()
const webUpdateStore = useWebUpdateStore()
const keepAliveViewNames = ['HomeView', 'TimelineView', 'WishlistView']
const hiddenTabBarRoutes = ['detail', 'add', 'edit', 'import', 'cart-import', 'account-import', 'taobao-import', 'manage-categories', 'manage-ips', 'manage-characters', 'manage-theme', 'manage-about', 'storage-locations', 'trash']
const showTabBar = computed(() => !hiddenTabBarRoutes.includes(String(route.name ?? '')))
const routeTransitionName = ref('route-none')
const tabBarTransitionName = computed(() => {
  if (routeTransitionName.value === 'route-back') return 'tabbar-back'
  if (routeTransitionName.value === 'route-forward') return 'tabbar-forward'
  return 'tabbar-none'
})
let pendingRouteDirection = 'forward'
let hasMountedRoute = false

function markBackNavigation() {
  pendingRouteDirection = 'back'
}

watch(
  () => route.fullPath,
  (_, previousPath) => {
    if (!previousPath || !hasMountedRoute) {
      hasMountedRoute = true
      routeTransitionName.value = 'route-none'
      pendingRouteDirection = 'forward'
      return
    }

    routeTransitionName.value = pendingRouteDirection === 'back' ? 'route-back' : 'route-forward'
    pendingRouteDirection = 'forward'
  }
)

async function handleVisibilityChange() {
  if (document.hidden) {
    if (syncStore.token && syncStore.gistId && !syncStore.isSyncing && !syncStore.conflictData) {
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

  // 自动拉取
  await syncStore.init()
  if (syncStore.token && syncStore.gistId && !syncStore.isSyncing) {
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

.route-forward-enter-active,
.route-forward-leave-active,
.route-back-enter-active,
.route-back-leave-active {
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
