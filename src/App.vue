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
    <AsyncFloatingAudioPlayer v-if="showFloatingPlayer" :with-tab-bar="showTabBar" />
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
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppNotifyToast from '@/components/app/AppNotifyToast.vue'
import AppToast from '@/components/common/AppToast.vue'
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
import { usePullDownGesture } from '@/composables/usePullDownGesture'
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

// Survey popup（等用户协议门禁通过后再弹，避免叠加）
import { useSurveyStore } from '@/stores/survey'
import { useLegalStore } from '@/stores/legal'
const surveyStore = useSurveyStore()
const legalStore = useLegalStore()
const surveyPopupRef = ref(null)

// 壳层弹窗等首屏挂载后再加载，避免把公告/问卷/更新检查等拖进首包关键路径
const shellReady = ref(false)
const showFloatingPlayer = ref(false)

watch(() => surveyStore.isLoaded, async (loaded) => {
  if (!loaded) return
  await legalStore.gateReady
  setTimeout(() => {
    surveyPopupRef.value?.checkPopup()
  }, 800)
}, { immediate: true })

// 监听测试通知事件
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

// 任意页面顶部大幅下拉并停顿 → 弹出 AI 助手（手机自顶部滑入，平板居中；
// 已在 AI 聊天页或弹窗已打开时不触发）。
// 组件在 shellReady 后常驻，动画靠 modelValue 开关，与其它 AppSheet 一致。
const aiAssistantVisible = ref(false)
usePullDownGesture({
  enabled: () => route.name !== 'manage-ai-chat' && !aiAssistantVisible.value,
  onTrigger: () => {
    aiAssistantVisible.value = true
  }
})
useAppStartup()

onMounted(() => {
  // 双 rAF：确保首屏渲染完成后再拉壳层重组件，避免抢首包带宽
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      showFloatingPlayer.value = true
      shellReady.value = true
    })
  })
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

