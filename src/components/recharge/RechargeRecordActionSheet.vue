<template>
  <AppSheet
    :model-value="modelValue"
    @update:model-value="close"
  >
    <p class="sheet-title">{{ t('recharge.recordAction.title') }}</p>
    <p class="sheet-record">{{ record?.itemName || t('recharge.unnamedItem') }}</p>

    <div class="sheet-options">
      <button class="sheet-option" type="button" @click="onEdit">
        <span class="option-icon">{{ t('common.edit') }}</span>
        <div class="option-body">
          <p class="option-title">{{ t('recharge.recordAction.editTitle') }}</p>
          <p class="option-desc">{{ t('recharge.recordAction.editDesc') }}</p>
        </div>
      </button>

      <div class="sheet-divider" />

      <button class="sheet-option sheet-option--danger" type="button" @click="onDelete">
        <span class="option-icon option-icon--danger">{{ t('common.delete') }}</span>
        <div class="option-body">
          <p class="option-title">{{ t('recharge.recordAction.moveToTrash') }}</p>
          <p class="option-desc">{{ t('recharge.recordAction.moveToTrashDesc') }}</p>
        </div>
      </button>
    </div>

    <button class="sheet-cancel" type="button" @click="close">{{ t('common.cancel') }}</button>
  </AppSheet>
</template>

<script setup>
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  record: { type: Object, default: null }
})

import { useI18n } from 'vue-i18n'
import { useDialogBackButton } from '@/composables/useDialogBackButton'
import AppSheet from '@/components/common/AppSheet.vue'
const { t } = useI18n()

const emit = defineEmits(['update:modelValue', 'edit', 'delete'])

function close() {
  emit('update:modelValue', false)
}

useDialogBackButton(close, () => props.modelValue)

function onEdit() {
  emit('edit')
  close()
}

function onDelete() {
  emit('delete')
  close()
}
</script>

<style scoped>
.sheet-title {
  text-align: center;
  color: var(--app-text-tertiary);
  font-size: 13px;
}

.sheet-record {
  margin-top: 6px;
  color: var(--app-text);
  font-size: 18px;
  font-weight: 700;
  text-align: center;
}

.sheet-options {
  margin-top: 14px;
  border-radius: 16px;
  overflow: hidden;
  background: var(--app-surface-soft);
}

.sheet-option {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border: none;
  background: transparent;
  text-align: left;
}

.sheet-option--danger .option-title,
.sheet-option--danger .option-desc {
  color: #cc3d3d;
}

.sheet-divider {
  height: 1px;
  margin: 0 16px;
  background: rgba(142, 142, 147, 0.2);
}

.option-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--app-surface);
  color: var(--app-text);
  font-size: 14px;
  font-weight: 700;
}

.option-icon--danger {
  background: color-mix(in srgb, #e05454 16%, transparent);
  color: #cc3d3d;
}

.option-title {
  color: var(--app-text);
  font-size: 15px;
  font-weight: 600;
}

.option-desc {
  color: var(--app-text-tertiary);
  font-size: 12px;
  margin-top: 3px;
}

.sheet-cancel {
  margin-top: 10px;
  width: 100%;
  height: 48px;
  border: none;
  border-radius: 16px;
  background: var(--app-surface-soft);
  color: var(--app-text);
  font-size: 15px;
  font-weight: 600;
}
</style>
