<template>
  <AppSheet
    :model-value="show"
    :placement="isTabletViewport ? 'center' : 'top'"
    sheet-class="ai-assistant-popup"
    @update:model-value="onUpdateShow"
  >
    <div
      class="ai-assistant-body"
      :class="{ 'ai-assistant-body--tablet': isTabletViewport }"
    >
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
  </AppSheet>
</template>

<script setup>
// @ts-check
// 全局 AI 助手弹窗：任意页面顶部下拉手势唤起。
// 手机从顶部滑入（与下拉手势方向一致），平板（≥900px）居中弹窗。
// 宿主（App.vue）必须常驻挂载本组件，只用 v-model:show 开关；随开闭 v-if 会跳过 sheet-pop 动画。
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppSheet from '@/components/common/AppSheet.vue'
import { useDialogBackButton } from '@/composables/useDialogBackButton'
import { createLogger } from '@/utils/logger'

const aiLog = createLogger('ai-assistant')
const AI_CHAT_PANEL_LOAD = () => import('@/components/ai/AiChatPanel.vue')
const AiChatPanel = defineAsyncComponent({
  loader: AI_CHAT_PANEL_LOAD,
  delay: 0,
  timeout: 15000,
  onError: (error) => aiLog.warn('panel:load-failed', error)
})

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
onMounted(() => {
  window.addEventListener('resize', handleResize, { passive: true })
  // 常驻挂载后预热聊天面板 chunk，避免首次下拉时进场动画和异步加载叠在一起
  void AI_CHAT_PANEL_LOAD().catch((error) => aiLog.warn('panel:warmup-failed', error))
})
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
  /* 占满 AppSheet 内容区：高度由 sheet max-height + padding 约束。
     不要用固定 88dvh——会与 sheet 的 padding 叠加溢出，底部输入栏被 overflow:hidden 裁切 */
  flex: 1;
  min-height: 0;
  height: auto;
  color: var(--app-text);
  background: transparent;
}

/* 平板/居中弹窗：贴合 AppSheet 居中限高，避免内容溢出 */
.ai-assistant-body--tablet {
  flex: 1;
  min-height: min(70dvh, 640px);
}

/* 手机顶滑：限制 sheet 本身高度，保持原先约 88dvh 的观感 */
:global(.app-sheet.ai-assistant-popup.app-sheet--top) {
  height: min(88dvh, 840px);
}

/* AppSheet 已含 safe-area 底距；输入栏再叠一层 env() 会多出一截空白 */
:global(.ai-assistant-popup) :deep(.chat-compose) {
  margin-bottom: 12px;
}

/* 平板居中：左右拉宽（默认 center 仅 420px，聊天对话偏窄） */
:global(.app-sheet-overlay--center .ai-assistant-popup) {
  width: min(92vw, 640px) !important;
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
</style>
