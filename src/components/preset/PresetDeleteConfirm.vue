<template>
  <DangerConfirmDialog
    :show="show"
    :title="t('preset.deleteTitle', { name })"
    :description="t('preset.deleteDesc', { count, field: fieldLabel || t('preset.thisPreset') })"
    :confirm-text="t('common.delete')"
    :cancel-text="t('common.cancel')"
    @update:show="$emit('update:show', $event)"
    @cancel="$emit('cancel')"
    @confirm="$emit('confirm')"
  />
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import DangerConfirmDialog from '@/components/common/DangerConfirmDialog.vue'

defineProps({
  show: { type: Boolean, default: false },
  name: { type: String, default: '' },
  count: { type: Number, default: 0 },
  fieldLabel: { type: String, default: '' }
})
defineEmits(['update:show', 'cancel', 'confirm'])

const { t } = useI18n()
</script>
