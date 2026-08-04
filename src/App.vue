<template>
  <div class="app-wrapper">
    <div class="route-stage">
      <RouterView v-slot="{ Component, route: currentRoute }">
        <!-- v-if 必须在 component 上而不是 KeepAlive 上：KeepAlive 被卸载会连带销毁全部缓存实例 -->
        <KeepAlive :include="keepAliveViewNames">
          <component
            :is="Component"
            v-if="Component"
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
    <AppToast :message="globalToastMsg" />
    <SurveyPopupDialog ref="surveyPopupRef" />
    <BirthdayEggDialog />
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AnnouncementDialog from '@/components/app/AnnouncementDialog.vue'
import AppUpdateDialog from '@/components/app/AppUpdateDialog.vue'
import FloatingAudioPlayer from '@/components/app/FloatingAudioPlayer.vue'
import WebUpdateDialog from '@/components/app/WebUpdateDialog.vue'
import ClipboardDialog from '@/components/app/ClipboardDialog.vue'
import AppNotifyToast from '@/components/app/AppNotifyToast.vue'
import AppToast from '@/components/common/AppToast.vue'
import SurveyPopupDialog from '@/components/app/SurveyPopupDialog.vue'
import BirthdayEggDialog from '@/components/app/BirthdayEggDialog.vue'
import TabBar from '@/components/app/TabBar.vue'
import { globalToastMsg } from '@/utils/globalToast'
import { useSyncStore } from '@/stores/sync'
import { useRealtimeSync } from '@/composables/sync/useRealtimeSync'
import { useDeepLinks } from '@/composables/useDeepLinks'
import { useAppStartup } from '@/composables/useAppStartup'
import { useGoodsStore } from '@/stores/goods'
import { useWebUpdateStore } from '@/stores/webUpdate'
import { useAppUpdateStore } from '@/stores/appUpdate'
import { useAppNotify } from '@/composables/useAppNotify'

const route = useRoute()
const { t } = useI18n()
const syncStore = useSyncStore()
const goodsStore = useGoodsStore()
const webUpdateStore = useWebUpdateStore()
const appUpdateStore = useAppUpdateStore()

const { notifications: appNotifyList, dismiss: appNotifyDismiss, push: pushNotify, start: startAppNotify } = useAppNotify(goodsStore, syncStore, webUpdateStore, appUpdateStore)
startAppNotify()

// Survey popup
import { useSurveyStore } from '@/stores/survey'
const surveyStore = useSurveyStore()
const surveyPopupRef = ref(null)

watch(() => surveyStore.isLoaded, (loaded) => {
  if (loaded) {
    setTimeout(() => {
      surveyPopupRef.value?.checkPopup()
    }, 800)
  }
}, { immediate: true })

// 监听测试通知事件
window.addEventListener('app-notify-test', (e) => {
  if (e.detail) {
    pushNotify(e.detail)
  }
})

const keepAliveViewNames = ['HomeView', 'RechargeView', 'WishlistView', 'MyView', 'EventsView', 'GroupDetailView', 'StatisticsView']
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
    const displayName = decodeURIComponent(storagePath).split('/').filter(Boolean).join(' > ') || t('toast.unknownLocation')
    pushNotify({
      iconType: 'bell',
      text: t('toast.jumpedToStorage'),
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
}

/* 渐变背景只保留 route-stage（滑动动画露缝时的底色）和 route-scene（页面自身、
   随内容高度延伸）两层；html/#app/.app-wrapper 不再叠涂同一渐变，减少全页 overdraw。 */
.route-stage {
  position: relative;
  min-height: 100dvh;
  overflow: hidden;
  background: var(--app-bg-gradient);
}

.route-scene {
  min-height: 100dvh;
  background: var(--app-bg-gradient);
}

/* ---- page slide transition ---- */
/* New pages slide in from right (forward) or left (back).
   Route-stage background fills the gap — no overlay, no white flash. */

</style>

