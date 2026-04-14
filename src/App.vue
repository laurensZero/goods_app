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
:global(html),
:global(body),
:global(#app) {
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

:global(::view-transition-old(root)),
:global(::view-transition-new(root)) {
  animation: none;
}

:global(::view-transition-group(*)) {
  animation-duration: 220ms;
  animation-timing-function: cubic-bezier(0.2, 0.8, 0.2, 1);
  isolation: isolate;
}

:global(::view-transition-old(*)),
:global(::view-transition-new(*)) {
  will-change: transform, opacity;
  transform: translateZ(0);
  backface-visibility: hidden;
}

:global(html[data-vt-direction='back']::view-transition-old(*)) {
  z-index: 20;
  animation-timing-function: cubic-bezier(0.32, 0, 0.67, 0);
}

:global(html[data-vt-direction='back']::view-transition-new(root)) {
  animation: vt-root-recover 260ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

@media (min-width: 900px) {
  :global(::view-transition-group(*)) {
    animation-duration: 300ms;
    animation-timing-function: cubic-bezier(0.2, 0.8, 0.2, 1);
  }
}

@keyframes vt-root-recover {
  from {
    opacity: 0.94;
    transform: scale(0.96);
  }

  to {
    opacity: 1;
    transform: scale(1);
  }
}

</style>
