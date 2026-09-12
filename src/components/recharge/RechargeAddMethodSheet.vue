<template>
  <AppSheet
    :model-value="modelValue"
    @update:model-value="close"
  >
    <p class="sheet-title">{{ t('recharge.addMethod.title') }}</p>

    <div class="sheet-options">
      <button class="sheet-option" type="button" @click="onManual">
        <span class="option-icon option-icon--manual">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="4" y="4" width="16" height="16" rx="3" />
            <path d="M8 12H16" />
            <path d="M12 8V16" />
          </svg>
        </span>
        <div class="option-body">
          <p class="option-title">{{ t('recharge.addMethod.manual.title') }}</p>
          <p class="option-desc">{{ t('recharge.addMethod.manual.desc') }}</p>
        </div>
        <svg class="option-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>

      <div class="sheet-divider" />

      <button class="sheet-option" type="button" @click="onPreset">
        <span class="option-icon option-icon--import">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="8" />
            <path d="M12 8v4l3 3" />
          </svg>
        </span>
        <div class="option-body">
          <p class="option-title">{{ t('recharge.addMethod.preset.title') }}</p>
          <p class="option-desc">{{ t('recharge.addMethod.preset.desc') }}</p>
        </div>
        <svg class="option-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>
    </div>

    <button class="sheet-cancel" type="button" @click="close">{{ t('common.cancel') }}</button>
  </AppSheet>
</template>

<script setup>
const props = defineProps({
  modelValue: { type: Boolean, default: false }
})

import { useI18n } from 'vue-i18n'
import { useDialogBackButton } from '@/composables/useDialogBackButton'
import AppSheet from '@/components/common/AppSheet.vue'

const { t } = useI18n()

const emit = defineEmits(['update:modelValue', 'manual', 'preset'])

function close() {
  emit('update:modelValue', false)
}

useDialogBackButton(close, () => props.modelValue)

function onManual() {
  emit('manual')
  close()
}

function onPreset() {
  emit('preset')
  close()
}
</script>

<style scoped>
.sheet-title {
  margin: 0 0 14px;
  text-align: center;
  color: var(--app-text-tertiary);
  font-size: 13px;
}

.sheet-options {
  margin-bottom: 10px;
  overflow: hidden;
  border-radius: 18px;
  background: color-mix(in srgb, var(--app-bg) 88%, var(--app-glass));
}

.sheet-option {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border: none;
  background: transparent;
  text-align: left;
  transition: background 0.14s ease;
}

.sheet-option:active {
  background: rgba(142, 142, 147, 0.12);
}

.sheet-divider {
  height: 1px;
  margin: 0 16px;
  background: rgba(142, 142, 147, 0.15);
}

.option-icon {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.option-icon--manual {
  background: rgba(90, 120, 250, 0.12);
}

.option-icon--manual svg {
  width: 22px;
  height: 22px;
  stroke: #5a78fa;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.option-icon--import {
  background: rgba(50, 200, 140, 0.12);
}

.option-icon--import svg {
  width: 22px;
  height: 22px;
  stroke: #28c880;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.option-body {
  flex: 1;
  min-width: 0;
}

.option-title {
  margin: 0 0 2px;
  color: var(--app-text);
  font-size: 16px;
  font-weight: 600;
}

.option-desc {
  margin: 0;
  color: var(--app-text-tertiary);
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.option-arrow {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  stroke: var(--app-text-tertiary);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.sheet-cancel {
  width: 100%;
  height: 54px;
  border: none;
  border-radius: 18px;
  background: var(--app-bg, #f5f5f7);
  color: var(--app-text);
  font-size: 16px;
  font-weight: 600;
  transition: background 0.14s ease;
}

.sheet-cancel:active {
  background: rgba(142, 142, 147, 0.18);
}

:global(html.theme-dark) .sheet-options,
:global(html.theme-dark) .sheet-cancel {
  background: rgba(255, 255, 255, 0.05);
}

:global(html.theme-dark) .sheet-option:active {
  background: rgba(255, 255, 255, 0.06);
}
</style>
