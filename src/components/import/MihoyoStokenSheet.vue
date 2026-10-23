<template>
  <AppSheet
    :model-value="modelValue"
    sheet-class="mihoyo-stoken-sheet"
    @update:model-value="(v) => { if (!v) close() }"
  >
    <p class="sheet-title">{{ t('import.stokenKeepalive') }}</p>
    <p v-if="accountLabel" class="sheet-sub">{{ accountLabel }}</p>
    <p class="sheet-hint">{{ t('import.stokenKeepaliveHint') }}</p>

    <textarea
      v-model="input"
      class="stoken-textarea"
      :placeholder="t('import.stokenPlaceholder')"
      spellcheck="false"
      autocomplete="off"
      rows="4"
      autofocus
    />

    <p v-if="errorText" class="field-error">{{ errorText }}</p>

    <button
      class="sheet-primary"
      type="button"
      :disabled="!canSubmit || busy"
      @click="submit"
    >
      {{ busy ? t('common.loading') : t('import.stokenSave') }}
    </button>
    <button class="sheet-cancel" type="button" @click="close">{{ t('common.cancel') }}</button>
  </AppSheet>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppSheet from '@/components/common/AppSheet.vue'
import { useDialogBackButton } from '@/composables/useDialogBackButton'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  accountLabel: { type: String, default: '' },
  submitting: { type: Boolean, default: false },
  error: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue', 'submit'])

const { t } = useI18n()
const input = ref('')
const localSubmitting = ref(false)
const localError = ref('')
let submitTimer = 0

const canSubmit = computed(() => input.value.trim().length > 10)
const busy = computed(() => props.submitting || localSubmitting.value)
const errorText = computed(() => props.error || localError.value)

useDialogBackButton(close, () => props.modelValue)

watch(
  () => props.modelValue,
  (open) => {
    clearTimeout(submitTimer)
    if (open) {
      input.value = ''
      localSubmitting.value = false
      localError.value = ''
    }
  }
)

watch(
  () => props.submitting,
  (value) => {
    clearTimeout(submitTimer)
    if (value) localError.value = ''
    localSubmitting.value = Boolean(value)
  }
)

onBeforeUnmount(() => clearTimeout(submitTimer))

function close() {
  emit('update:modelValue', false)
}

function submit() {
  if (!canSubmit.value || busy.value) return
  localError.value = ''
  localSubmitting.value = true
  emit('submit', { input: input.value.trim() })

  // 父组件没响应时给出兜底提示，避免按钮看起来“没反应”
  clearTimeout(submitTimer)
  submitTimer = setTimeout(() => {
    if (!props.submitting) {
      localSubmitting.value = false
      localError.value = t('import.stokenSaveTimeout')
    }
  }, 20000)
}
</script>

<style scoped>
.sheet-title {
  margin: 0 0 4px;
  text-align: center;
  font-size: var(--font-title);
  font-weight: 600;
  color: var(--app-text);
}

.sheet-sub {
  margin: 0 0 8px;
  text-align: center;
  font-size: var(--font-small);
  color: var(--app-text-secondary, #8e8e93);
}

.sheet-hint {
  margin: 0 0 10px;
  font-size: var(--font-small);
  line-height: 1.5;
  color: var(--app-text-secondary, #8e8e93);
}

.stoken-textarea {
  width: 100%;
  min-height: 96px;
  border: 1px solid var(--app-border, rgba(142, 142, 147, 0.28));
  border-radius: var(--radius-xs);
  background: var(--app-surface, #fff);
  color: var(--app-text);
  padding: 10px 12px;
  font-size: var(--font-small);
  line-height: 1.45;
  font-family: monospace;
  resize: vertical;
  box-sizing: border-box;
}

.field-error {
  margin: 6px 0 0;
  font-size: var(--font-small);
  color: #c74444;
}

.sheet-primary {
  width: 100%;
  margin-top: 10px;
  border: none;
  border-radius: var(--radius-small);
  padding: 14px 16px;
  background: #141416;
  color: #fff;
  font-size: var(--font-subtitle);
  font-weight: 600;
}

.sheet-primary:disabled {
  opacity: 0.45;
}

.sheet-cancel {
  width: 100%;
  margin-top: 8px;
  border: none;
  border-radius: var(--radius-small);
  padding: 14px 16px;
  background: color-mix(in srgb, var(--app-glass) 80%, var(--app-surface));
  color: var(--app-text);
  font-size: var(--font-subtitle);
  font-weight: 500;
}

html.theme-dark .sheet-primary {
  background: #f5f5f7;
  color: #141416;
}
</style>
