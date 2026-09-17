<!--
  BatchDraftResumeSheet.vue
  批量添加入口发现未完成草稿时的「继续上次 / 重新开始」底部面板
  用法：<BatchDraftResumeSheet v-model="show" :count="n" @continue="..." @restart="..." />
-->
<template>
  <AppSheet
    :model-value="modelValue"
    sheet-class="batch-draft-sheet"
    @update:model-value="(v) => { if (!v) close() }"
    @closed="closed"
  >
    <p class="sheet-title">{{ t('goods.batch.draftResumeTitle') }}</p>
    <p class="sheet-desc">{{ t('goods.batch.draftResumeDesc', { count }) }}</p>

    <div class="sheet-options">
      <button class="sheet-option" type="button" @click="onContinue">
        <span class="option-icon option-icon--continue">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
        <div class="option-body">
          <p class="option-title">{{ t('goods.batch.draftContinue') }}</p>
          <p class="option-desc">{{ t('goods.batch.draftContinueDesc') }}</p>
        </div>
      </button>

      <div class="sheet-divider" />

      <button class="sheet-option" type="button" @click="onRestart">
        <span class="option-icon option-icon--restart">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M3 12a9 9 0 1 0 3-6.7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            <path d="M3 4v5h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
        <div class="option-body">
          <p class="option-title">{{ t('goods.batch.draftRestart') }}</p>
          <p class="option-desc">{{ t('goods.batch.draftRestartDesc') }}</p>
        </div>
      </button>
    </div>

    <button class="sheet-cancel" type="button" @click="close">{{ t('common.cancel') }}</button>
  </AppSheet>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import AppSheet from '@/components/common/AppSheet.vue'
import { useDialogBackButton } from '@/composables/useDialogBackButton'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  count: { type: Number, default: 0 }
})

const emit = defineEmits(['update:modelValue', 'continue', 'restart'])

const { t } = useI18n()
useDialogBackButton(close, () => props.modelValue)

/** 关闭动画结束后再向上抛，避免与路由转场抢同一帧 */
let pendingAction = null

function close() {
  emit('update:modelValue', false)
}

function closed() {
  if (!pendingAction) return
  const action = pendingAction
  pendingAction = null
  emit(action)
}

function onContinue() {
  pendingAction = 'continue'
  close()
}

function onRestart() {
  pendingAction = 'restart'
  close()
}
</script>

<style scoped>
.sheet-title {
  margin: 0 0 6px;
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--app-text);
  text-align: center;
}

.sheet-desc {
  margin: 0 0 18px;
  font-size: 13px;
  line-height: 1.55;
  color: var(--app-text-secondary);
  text-align: center;
}

.sheet-options {
  display: flex;
  flex-direction: column;
  gap: 1px;
  border-radius: var(--radius-card);
  background: var(--app-border);
  overflow: hidden;
  margin-bottom: 12px;
}

.sheet-option {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 14px 16px;
  border: none;
  background: var(--app-surface);
  text-align: left;
  cursor: pointer;
  transition: background 0.16s ease;
}

.sheet-option:active {
  background: var(--app-surface-soft);
}

.sheet-divider {
  height: 1px;
  background: transparent;
}

.option-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  flex-shrink: 0;
  background: var(--app-surface-soft);
  color: var(--app-text);
}

.option-icon svg {
  width: 18px;
  height: 18px;
}

.option-icon--restart {
  color: #ff3b30;
}

.option-body {
  flex: 1;
  min-width: 0;
}

.option-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--app-text);
}

.option-desc {
  margin: 2px 0 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--app-text-secondary);
}

.sheet-cancel {
  display: block;
  width: 100%;
  height: 46px;
  border: none;
  border-radius: var(--radius-card);
  background: var(--app-surface-soft);
  color: var(--app-text);
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
}

.sheet-cancel:active {
  opacity: 0.85;
}
</style>
