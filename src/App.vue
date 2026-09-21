<template>
  <div class="app-wrapper">
    <!-- key 只绑 route-stage：避免整页 remount 打断返回滑动动画 -->
    <div class="route-stage" :key="routeAliveKey">
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
    <AsyncFloatingAudioPlayer v-if="showFloatingPlayer" :with-tab-bar="showTabBar" />
    <!-- 网页版安卓 UA 引流：固定顶部，组件内部再判 UA 与关闭状态 -->
    <WebApkPromoBanner v-if="shellReady && showTabBar" />
    <AsyncTermsPrivacyDialog v-if="shellReady" />
    <AsyncAnnouncementDialog v-if="shellReady" />
    <AsyncWebUpdateDialog v-if="shellReady" />
    <AsyncAppUpdateDialog v-if="shellReady" />

    <AsyncClipboardDialog v-if="shellReady" />
    <!-- 与其它壳层弹窗一样常驻：v-if 绑可见性会让组件随开闭卸载，AppSheet 的 sheet-pop 进出场画不出来 -->
    <AsyncAiAssistantPopup v-if="shellReady" v-model:show="aiAssistantVisible" />
    <AppNotifyToast :notifications="appNotifyList" @dismiss="appNotifyDismiss" />
    <AppToast :message="globalToastMsg" />
    <AsyncSurveyPopupDialog v-if="shellReady" ref="surveyPopupRef" />
    <AsyncBirthdayEggDialog v-if="shellReady" />
  </div>
</template>

<script setup>
import { computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { useI18n } from 'vue-i18n'
import AppNotifyToast from '@/components/app/AppNotifyToast.vue'
import AppToast from '@/components/common/AppToast.vue'
import TabBar from '@/components/app/TabBar.vue'
import WebApkPromoBanner from '@/components/app/WebApkPromoBanner.vue'
import { globalToastMsg } from '@/utils/globalToast'
import { useSyncStore } from '@/stores/sync'
import { useRealtimeSync } from '@/composables/sync/useRealtimeSync'
import { useDeepLinks } from '@/composables/useDeepLinks'
import { useAppStartup } from '@/composables/useAppStartup'
import { useGoodsStore } from '@/stores/goods'
import { useWebUpdateStore } from '@/stores/webUpdate'
import { useAppUpdateStore } from '@/stores/appUpdate'
import { useAppNotify } from '@/composables/useAppNotify'
import { usePullDownGesture } from '@/composables/usePullDownGesture'
import { useSurveyStore } from '@/stores/survey'
import { useLegalStore } from '@/stores/legal'
import { createLogger } from '@/utils/logger'

const shellLog = createLogger('app-shell')

const AsyncTermsPrivacyDialog = defineAsyncComponent({
  loader: () => import('@/components/app/TermsPrivacyDialog.vue'),
  delay: 0,
  timeout: 10000,
  onError: (error) => shellLog.warn('terms-privacy:load-failed', error)
})
const AsyncFloatingAudioPlayer = defineAsyncComponent({
  loader: () => import('@/components/app/FloatingAudioPlayer.vue'),
  delay: 0,
  timeout: 10000,
  onError: (error) => shellLog.warn('floating-player:load-failed', error)
})
const AsyncAnnouncementDialog = defineAsyncComponent({
  loader: () => import('@/components/app/AnnouncementDialog.vue'),
  delay: 0,
  timeout: 10000,
  onError: (error) => shellLog.warn('announcement:load-failed', error)
})
const AsyncWebUpdateDialog = defineAsyncComponent({
  loader: () => import('@/components/app/WebUpdateDialog.vue'),
  delay: 0,
  timeout: 10000,
  onError: (error) => shellLog.warn('web-update:load-failed', error)
})
const AsyncAppUpdateDialog = defineAsyncComponent({
  loader: () => import('@/components/app/AppUpdateDialog.vue'),
  delay: 0,
  timeout: 10000,
  onError: (error) => shellLog.warn('app-update:load-failed', error)
})
const AsyncClipboardDialog = defineAsyncComponent({
  loader: () => import('@/components/app/ClipboardDialog.vue'),
  delay: 0,
  timeout: 10000,
  onError: (error) => shellLog.warn('clipboard:load-failed', error)
})
const AsyncSurveyPopupDialog = defineAsyncComponent({
  loader: () => import('@/components/app/SurveyPopupDialog.vue'),
  delay: 0,
  timeout: 10000,
  onError: (error) => shellLog.warn('survey:load-failed', error)
})
const AsyncBirthdayEggDialog = defineAsyncComponent({
  loader: () => import('@/components/app/BirthdayEggDialog.vue'),
  delay: 0,
  timeout: 10000,
  onError: (error) => shellLog.warn('birthday:load-failed', error)
})
const AsyncAiAssistantPopup = defineAsyncComponent({
  loader: () => import('@/components/app/AiAssistantPopup.vue'),
  delay: 0,
  timeout: 15000,
  onError: (error) => shellLog.warn('ai-assistant:load-failed', error)
})

const route = useRoute()
const { t } = useI18n()
const syncStore = useSyncStore()
const goodsStore = useGoodsStore()
const webUpdateStore = useWebUpdateStore()
const appUpdateStore = useAppUpdateStore()

const { notifications: appNotifyList, dismiss: appNotifyDismiss, push: pushNotify, start: startAppNotify } = useAppNotify(goodsStore, syncStore, webUpdateStore, appUpdateStore)
startAppNotify()

const surveyStore = useSurveyStore()
const legalStore = useLegalStore()
const surveyPopupRef = ref(null)

// 壳层弹窗等首屏挂载后再加载，避免把公告/问卷/更新检查等拖进首包关键路径
const shellReady = ref(false)
const showFloatingPlayer = ref(false)

// 从登录 WebView/系统浏览器返回后若路由树被回收成空白，用该 key 强制重建。
// 只重建 route-stage，且不做 router.replace——replace 会打乱历史栈，导致返回动画丢失。
const routeAliveKey = ref(0)
let appStateListener = null
let recoveringAlive = false
let blankCheckTimer = null

function isRouteStageBlank() {
  const root = document.getElementById('app')
  const stage = root?.querySelector('.route-stage')
  if (!stage) return true
  const scene = stage.querySelector('.route-scene')
  if (!scene) return true
  const rect = scene.getBoundingClientRect()
  return rect.height < 4 || rect.width < 4
}

function scheduleBlankResumeCheck() {
  if (blankCheckTimer) clearTimeout(blankCheckTimer)
  // 等动画/首帧稳定后再判断，避免转场中途误判为空白而 remount
  blankCheckTimer = setTimeout(async () => {
    blankCheckTimer = null
    if (recoveringAlive) return
    await nextTick()
    if (!isRouteStageBlank()) return
    await new Promise((resolve) => setTimeout(resolve, 220))
    await nextTick()
    if (!isRouteStageBlank()) return
    recoveringAlive = true
    try {
      routeAliveKey.value += 1
      await nextTick()
    } finally {
      recoveringAlive = false
    }
  }, 480)
}

async function recoverFromBlankResume() {
  scheduleBlankResumeCheck()
}

watch(() => surveyStore.isLoaded, async (loaded) => {
  if (!loaded) return
  await legalStore.gateReady
  setTimeout(() => {
    surveyPopupRef.value?.checkPopup()
  }, 800)
}, { immediate: true })

window.addEventListener('app-notify-test', (e) => {
  if (e.detail) {
    pushNotify(e.detail)
  }
})

const keepAliveViewNames = ['HomeView', 'RechargeView', 'WishlistView', 'MyView', 'EventsView', 'GroupDetailView', 'StatisticsView', 'EventMapView']
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

const aiAssistantVisible = ref(false)
usePullDownGesture({
  enabled: () => route.name !== 'manage-ai-chat' && !aiAssistantVisible.value,
  onTrigger: () => {
    aiAssistantVisible.value = true
  }
})
useAppStartup()

onMounted(async () => {
  if (Capacitor.isNativePlatform()) {
    try {
      appStateListener = await CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive) void recoverFromBlankResume()
      })
    } catch (error) {
      shellLog.warn('app-state-listener-failed', error)
    }
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      showFloatingPlayer.value = true
      shellReady.value = true
    })
  })
})

onUnmounted(() => {
  try { appStateListener?.remove?.() } catch { /* ignore */ }
  appStateListener = null
  if (blankCheckTimer) clearTimeout(blankCheckTimer)
  blankCheckTimer = null
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
