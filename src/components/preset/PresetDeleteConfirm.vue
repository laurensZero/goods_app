<template>
  <AppSheet
    :model-value="show"
    force-center
    size="wide"
    @update:model-value="handleCancel"
  >
    <div class="confirm-card" role="alertdialog" aria-modal="true">
      <div class="confirm-icon">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M3 6H21" />
          <path d="M8 6V4H16V6" />
          <path d="M19 6L18 20H6L5 6" />
          <path d="M10 11V17" />
          <path d="M14 11V17" />
        </svg>
      </div>
      <h2 class="confirm-title">{{ t('preset.deleteTitle', { name }) }}</h2>
      <p class="confirm-desc">{{ t('preset.deleteDesc', { count, field: fieldLabel || t('preset.thisPreset') }) }}</p>
      <div class="confirm-actions">
        <button class="confirm-btn confirm-btn--ghost" type="button" @click="handleCancel">{{ t('common.cancel') }}</button>
        <button class="confirm-btn confirm-btn--danger" type="button" @click="handleConfirm">{{ t('common.delete') }}</button>
      </div>
    </div>
  </AppSheet>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import AppSheet from '@/components/common/AppSheet.vue'

const { t } = useI18n()

defineProps({
  show: { type: Boolean, default: false },
  name: { type: String, default: '' },
  count: { type: Number, default: 0 },
  fieldLabel: { type: String, default: '' },
})
const emit = defineEmits(['update:show', 'cancel', 'confirm'])

function handleCancel() {
  emit('update:show', false)
  emit('cancel')
}

function handleConfirm() {
  emit('update:show', false)
  emit('confirm')
}
</script>

<style scoped>
.confirm-card {
  width: min(100%, 320px);
  margin: 0 auto;
  padding: 28px 24px 24px;
  text-align: center;
  background: transparent;
  color: var(--app-text);
}

.confirm-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgba(255, 59, 48, 0.1);
  color: #ff3b30;
}

.confirm-icon svg {
  width: 20px;
  height: 20px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.confirm-title {
  margin-top: 16px;
  color: var(--app-text);
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.03em;
}

.confirm-desc {
  margin-top: 8px;
  color: var(--app-text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.confirm-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 20px;
}

.confirm-btn {
  height: 48px;
  border: none;
  border-radius: 16px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.16s ease, opacity 0.16s ease, background 0.16s ease;
}

.confirm-btn:active {
  transform: scale(0.96);
}

.confirm-btn--ghost {
  background: var(--app-surface-soft);
  color: var(--app-text);
}

.confirm-btn--danger {
  background: var(--app-primary);
  color: #ffffff;
}

:global(html.theme-dark) .confirm-btn--ghost {
  background: rgba(255, 255, 255, 0.06);
}

:global(html.theme-dark) .confirm-btn--danger {
  background: #f5f5f7;
  color: #d32f2f;
}
</style>
