<template>
  <AppSheet
    :model-value="show"
    placement="center"
    :z-index="zIndex"
    @update:model-value="handleCancel"
  >
    <div class="danger-confirm" role="alertdialog" aria-modal="true">
      <div class="danger-confirm__icon">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M3 6H21" />
          <path d="M8 6V4H16V6" />
          <path d="M19 6L18 20H6L5 6" />
          <path d="M10 11V17" />
          <path d="M14 11V17" />
        </svg>
      </div>
      <h2 class="danger-confirm__title">{{ title }}</h2>
      <p class="danger-confirm__desc">{{ description }}</p>
      <div class="danger-confirm__actions">
        <button class="danger-confirm__btn danger-confirm__btn--ghost" type="button" @click="handleCancel">
          {{ cancelText || t('common.cancel') }}
        </button>
        <button class="danger-confirm__btn danger-confirm__btn--danger" type="button" @click="handleConfirm">
          {{ confirmText || t('common.confirm') }}
        </button>
      </div>
    </div>
  </AppSheet>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import { useDialogBackButton } from '@/composables/useDialogBackButton'
import AppSheet from '@/components/common/AppSheet.vue'

const { t } = useI18n()

const props = defineProps({
  show: { type: Boolean, default: false },
  title: { type: String, default: '' },
  description: { type: String, default: '' },
  confirmText: { type: String, default: '' },
  cancelText: { type: String, default: '' },
  zIndex: { type: Number, default: 3000 }
})

const emit = defineEmits(['update:show', 'cancel', 'confirm'])

useDialogBackButton(handleCancel, () => props.show)

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
/* 外壳 = AppSheet 一层；内容透明铺开，图标与文字左对齐 */
.danger-confirm {
  width: 100%;
  text-align: left;
  color: var(--app-text);
}

.danger-confirm__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgba(255, 59, 48, 0.1);
  color: #ff3b30;
}

.danger-confirm__icon svg {
  width: 20px;
  height: 20px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.danger-confirm__title {
  margin: 16px 0 0;
  color: var(--app-text);
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.03em;
}

.danger-confirm__desc {
  margin: 8px 0 0;
  color: var(--app-text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.danger-confirm__actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 20px;
}

.danger-confirm__btn {
  height: 48px;
  border: none;
  border-radius: 16px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}

.danger-confirm__btn:active {
  transform: scale(0.96);
}

.danger-confirm__btn--ghost {
  background: var(--app-surface-soft);
  color: var(--app-text);
}

.danger-confirm__btn--danger {
  background: var(--app-primary);
  color: #fff;
}

:global(html.theme-dark .danger-confirm__btn--ghost) {
  background: rgba(255, 255, 255, 0.06);
}

:global(html.theme-dark .danger-confirm__btn--danger) {
  background: #f5f5f7;
  color: #d32f2f;
}
</style>
