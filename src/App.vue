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

    <ClipboardDialog />
    <AppNotifyToast :notifications="appNotifyList" @dismiss="appNotifyDismiss" />
  </div>
</template>

<script setup>
import { computed, KeepAlive } from 'vue'
import { useRoute } from 'vue-router'
import AnnouncementDialog from '@/components/app/AnnouncementDialog.vue'
import AppUpdateDialog from '@/components/app/AppUpdateDialog.vue'
import FloatingAudioPlayer from '@/components/app/FloatingAudioPlayer.vue'
import WebUpdateDialog from '@/components/app/WebUpdateDialog.vue'
import ClipboardDialog from '@/components/app/ClipboardDialog.vue'
import AppNotifyToast from '@/components/app/AppNotifyToast.vue'
import TabBar from '@/components/app/TabBar.vue'
import { useSyncStore } from '@/stores/sync'
import { useRealtimeSync } from '@/composables/sync/useRealtimeSync'
import { useDeepLinks } from '@/composables/useDeepLinks'
import { useAppStartup } from '@/composables/useAppStartup'
import { useGoodsStore } from '@/stores/goods'
import { useWebUpdateStore } from '@/stores/webUpdate'
import { useAppNotify } from '@/composables/useAppNotify'

const route = useRoute()
const syncStore = useSyncStore()
const goodsStore = useGoodsStore()
const webUpdateStore = useWebUpdateStore()

const { notifications: appNotifyList, dismiss: appNotifyDismiss, push: pushNotify, start: startAppNotify } = useAppNotify(goodsStore, syncStore, webUpdateStore)
startAppNotify()

const keepAliveViewNames = ['HomeView', 'RechargeView', 'WishlistView', 'MyView', 'EventsView', 'GroupDetailView']
const showTabBar = computed(() => route.meta.showTabBar === true)

function getKeepAliveKey(currentRoute) {
  return String(currentRoute.name ?? currentRoute.path ?? currentRoute.fullPath)
}

function getRouteKey(currentRoute) {
  return currentRoute.fullPath
}

useRealtimeSync({ syncStore })
useDeepLinks({
  onStorageNavigate(storagePath) {
    const displayName = decodeURIComponent(storagePath).split('/').filter(Boolean).join(' > ') || '未知位置'
    pushNotify({
      iconType: 'bell',
      text: '已跳转到收纳位置',
      subText: displayName,
      duration: 4000
    })
  }
})
useAppStartup()
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

/* ---- page slide transition ---- */
/* New pages slide in from right (forward) or left (back).
   Route-stage background fills the gap — no overlay, no white flash. */

</style>

