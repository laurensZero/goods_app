<template>
  <div class="app-wrapper">
    <div class="route-stage">
      <RouterView v-slot="{ Component, route: currentRoute }">
        <KeepAlive v-if="Component" :include="keepAliveViewNames">
          <component
            :is="Component"
            :key="currentRoute.meta.keepAlive ? getKeepAliveKey(currentRoute) : getRouteKey(currentRoute)"
            class="route-scene"
          />
        </KeepAlive>
      </RouterView>
    </div>
    <TabBar v-if="showTabBar" />
    <FloatingAudioPlayer :with-tab-bar="showTabBar" />
    <AnnouncementDialog />
    <WebUpdateDialog />
    <AppUpdateDialog />
  </div>
</template>

<script setup>
import { computed, KeepAlive, onBeforeUnmount, onMounted } from 'vue'
import { App as CapApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { useRoute, useRouter } from 'vue-router'
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
const router = useRouter()
const syncStore = useSyncStore()
const goodsStore = useGoodsStore()
const eventsStore = useEventsStore()
const rechargeStore = useRechargeStore()
const announcementStore = useAnnouncementStore()
const appUpdateStore = useAppUpdateStore()
const webUpdateStore = useWebUpdateStore()
const keepAliveViewNames = ['HomeView', 'RechargeView', 'WishlistView', 'MyView', 'EventsView']
const hiddenTabBarRoutes = ['detail', 'add', 'edit', 'import', 'cart-import', 'account-import', 'taobao-import', 'manage-categories', 'manage-ips', 'manage-characters', 'manage-theme', 'manage-settings', 'manage-sync', 'manage-about', 'storage-locations', 'trash', 'event-add', 'event-edit', 'event-detail']
const showTabBar = computed(() => !hiddenTabBarRoutes.includes(String(route.name ?? '')))
const hasLocalData = computed(() => (
  resolveArrayValue(goodsStore.list).length > 0
  || resolveArrayValue(goodsStore.trashList).length > 0
  || resolveArrayValue(rechargeStore.records).length > 0
  || resolveArrayValue(eventsStore.list).length > 0
))

function resolveArrayValue(source) {
  if (Array.isArray(source)) return source
  if (Array.isArray(source?.value)) return source.value
  return []
}

function getKeepAliveKey(currentRoute) {
  return String(currentRoute.name ?? currentRoute.path ?? currentRoute.fullPath)
}

function getRouteKey(currentRoute) {
  return currentRoute.fullPath
}

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
    document.addEventListener('visibilitychange', handleVisibilityChange, { passive: true })
  
    if (Capacitor.isNativePlatform()) {
      const handleAppUrlOpen = (url) => {
        if (!url) return
        if (url.startsWith('goodsapp://storage/')) {
          let storagePath = decodeURIComponent(url.replace('goodsapp://storage/', ''))
          storagePath = storagePath.replace(/\/$/, '')
          const stateKey = 'searchViewState:collection'
          
          const nextState = {
            filters: { storageLocations: [storagePath] },
            advancedExpanded: false
          }
  
          router.push({
            path: '/search',
            query: { scope: 'collection', action: 'nfc' },
            state: {
              [stateKey]: nextState
            }
          })
        }
      }

      // 1. Initial Launch check
      const launchUrl = await CapApp.getLaunchUrl()
      if (launchUrl && launchUrl.url) {
        handleAppUrlOpen(launchUrl.url)
      }

      // 2. Listener for foreground awakes
      CapApp.addListener('appUrlOpen', (event) => {
        handleAppUrlOpen(event.url)
      })
    }
  
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
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})
</script>

<style>
html,
body,
#app {
  min-height: 100%;
  background-color: var(--app-bg);
  background: var(--app-bg-gradient);
}

.app-wrapper {
  min-height: 100dvh;
  background-color: var(--app-bg);
  background: var(--app-bg-gradient);
}

.route-stage {
  position: relative;
  min-height: 100dvh;
  overflow: hidden;
  background-color: var(--app-bg);
  background: var(--app-bg-gradient);
}

.route-scene {
  min-height: 100dvh;
  background-color: var(--app-bg);
  background: var(--app-bg-gradient);
  backface-visibility: hidden;
}

html[data-route-transition-fallback='1'][data-route-transition-kind='page'][data-route-transition-direction='forward'] .route-scene {
  animation: route-fallback-page-forward 180ms cubic-bezier(0.22, 0.8, 0.22, 1);
  will-change: transform, opacity;
}

html[data-route-transition-fallback='1'][data-route-transition-kind='page'][data-route-transition-direction='back'] .route-scene {
  animation: route-fallback-page-back 180ms cubic-bezier(0.22, 0.8, 0.22, 1);
  will-change: transform, opacity;
}

html[data-route-transition-fallback='1'][data-route-transition-kind='detail-enter'] .route-scene {
  animation: route-fallback-detail-enter 220ms cubic-bezier(0.2, 0.85, 0.2, 1);
  will-change: transform, opacity;
}

html[data-route-transition-fallback='1'][data-route-transition-kind='detail-back'] .route-scene {
  animation: route-fallback-detail-back 210ms cubic-bezier(0.2, 0.85, 0.2, 1);
  will-change: transform, opacity;
}

html[data-route-transition-fallback='1'][data-route-transition-kind='detail-fade'] .route-scene {
  animation: route-fallback-detail-fade 240ms ease-out both;
  will-change: opacity;
}

html[data-route-transition-fallback='1'][data-route-transition-kind='search-enter'] .route-scene {
  animation: route-fallback-search-enter 260ms cubic-bezier(0.22, 0.9, 0.2, 1);
  will-change: transform, opacity;
}

html[data-route-transition-fallback='1'][data-route-transition-kind='search-back'] .route-scene {
  animation: route-fallback-search-back 220ms cubic-bezier(0.22, 0.8, 0.22, 1);
  will-change: transform, opacity;
}

@keyframes route-fallback-page-forward {
  from {
    opacity: 0.95;
    transform: translateX(14px);
  }

  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes route-fallback-page-back {
  from {
    opacity: 0.95;
    transform: translateX(-14px);
  }

  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes route-fallback-detail-enter {
  from {
    opacity: 0.86;
    transform: translateY(22px) scale(0.965);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes route-fallback-detail-back {
  from {
    opacity: 0.9;
    transform: translateY(-14px) scale(1.01);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes route-fallback-detail-fade {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

@keyframes route-fallback-search-enter {
  from {
    opacity: 0.92;
    transform: translateX(32px);
  }

  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes route-fallback-search-back {
  from {
    opacity: 0.94;
    transform: translateX(-18px);
  }

  to {
    opacity: 1;
    transform: translateX(0);
  }
}

</style>
