<template>
  <Popup
    :show="show"
    :position="isTabletViewport ? 'center' : 'top'"
    teleport="body"
    :class="['ai-assistant-popup', { 'ai-assistant-popup--center': isTabletViewport }]"
    @update:show="onUpdateShow"
  >
    <div class="ai-assistant-body">
      <header class="ai-assistant-head">
        <span class="ai-assistant-head__title">{{ t('nav.aiChat') }}</span>
        <button class="ai-assistant-head__close" type="button" :aria-label="t('common.close')" @click="close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 6L6 18" />
            <path d="M6 6l12 12" />
          </svg>
        </button>
      </header>
      <AiChatPanel />
    </div>
  </Popup>
</template>

<script setup>
// @ts-check
// 全局 AI 助手弹窗：任意页面顶部下拉手势唤起。
// 手机从顶部滑入（与下拉手势方向一致），平板（≥900px）居中弹窗。
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Popup } from 'vant'
import AiChatPanel from '@/components/ai/AiChatPanel.vue'
import { useDialogBackButton } from '@/composables/useDialogBackButton'

const props = defineProps({
  show: { type: Boolean, default: false }
})
const emit = defineEmits(['update:show'])

const { t } = useI18n()
const route = useRoute()

// Android 返回键关闭弹窗（useDialogBackButton 的 LIFO overlayStack）
useDialogBackButton(() => close(), () => props.show)

const windowWidth = ref(window.innerWidth)
const isTabletViewport = computed(() => windowWidth.value >= 900)
function handleResize() { windowWidth.value = window.innerWidth }
onMounted(() => window.addEventListener('resize', handleResize, { passive: true }))
onBeforeUnmount(() => window.removeEventListener('resize', handleResize))

/** @param {boolean} value */
function onUpdateShow(value) {
  emit('update:show', value)
}

function close() {
  emit('update:show', false)
}

// 跳转其他页面时自动收起（navigate 工具/链接跳转后能直接看到目标页面）
watch(() => route.fullPath, () => {
  if (props.show) close()
})

defineExpose({ close })
</script>

<style scoped>
.ai-assistant-body {
  display: flex;
  flex-direction: column;
  /* 手机顶部滑入：几乎全屏高度 */
  height: min(88dvh, 840px);
  color: var(--app-text);
  background: transparent;
  padding-bottom: env(safe-area-inset-bottom);
}

.ai-assistant-head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 6px;
}

.ai-assistant-head__title {
  color: var(--app-text);
  font-size: 16px;
  font-weight: 700;
}

.ai-assistant-head__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: color-mix(in srgb, var(--app-text) 6%, transparent);
  color: var(--app-text-secondary);
  cursor: pointer;
}

.ai-assistant-head__close:active {
  transform: scale(0.92);
}

.ai-assistant-head__close svg {
  width: 16px;
  height: 16px;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* 磨砂玻璃底（与 AI 设置/历史弹层同一套视觉约定） */
:global(.ai-assistant-popup.van-popup) {
  --van-popup-background: color-mix(in srgb, var(--app-surface) 92%, transparent);
  background: color-mix(in srgb, var(--app-surface) 92%, transparent);
  backdrop-filter: blur(var(--app-frost-soft-blur)) saturate(var(--app-frost-saturate));
  -webkit-backdrop-filter: blur(var(--app-frost-soft-blur)) saturate(var(--app-frost-saturate));
}

:global(.ai-assistant-popup--center.van-popup--center) {
  width: min(520px, calc(100vw - 40px));
  height: min(78dvh, 720px);
  border-radius: 28px !important;
  overflow: hidden;
  box-shadow:
    0 28px 80px color-mix(in srgb, var(--app-text) 18%, transparent),
    0 0 0 1px color-mix(in srgb, var(--app-text) 8%, transparent);
}
</style>
