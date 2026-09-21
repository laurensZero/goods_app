<template>
  <AppSheet
    :model-value="modelValue"
    sheet-class="mihoyo-cookie-login-sheet"
    @update:model-value="(v) => { if (!v) close() }"
  >
    <p class="sheet-title">{{ t('import.loginNewAccount') }}</p>
    <p class="sheet-sub">{{ t('import.loginNewAccountCookieHint') }}</p>

    <div class="field-group">
      <label class="field-label" for="new-account-cookie">{{ t('import.pasteCookie') }}</label>
      <textarea
        id="new-account-cookie"
        v-model="cookieText"
        class="cookie-textarea"
        :placeholder="t('import.cookiePlaceholder')"
        spellcheck="false"
        autocomplete="off"
        rows="5"
      />
      <p v-if="cookieText && !cookieValid" class="field-error">{{ t('import.cookieInvalid') }}</p>
    </div>

    <label class="remember-row">
      <input v-model="remember" class="remember-checkbox" type="checkbox" />
      <span>{{ t('import.rememberCookie') }}</span>
    </label>

    <p v-if="error" class="account-notice">{{ error }}</p>

    <button
      class="sheet-primary"
      type="button"
      :disabled="!cookieValid || submitting"
      @click="submit"
    >
      {{ submitting ? t('common.loading') : t('import.loginNewAccountConfirm') }}
    </button>
    <button class="sheet-cancel" type="button" @click="close">{{ t('common.cancel') }}</button>
  </AppSheet>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppSheet from '@/components/common/AppSheet.vue'
import { useDialogBackButton } from '@/composables/useDialogBackButton'
import { validateMihoyoCookie } from '@/utils/mihoyo/index'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  submitting: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'submit'])

const { t } = useI18n()
const cookieText = ref('')
const remember = ref(true)
const error = ref('')

const cookieValid = computed(() => {
  const value = cookieText.value.trim()
  return value.length > 20 && validateMihoyoCookie(value)
})

useDialogBackButton(close, () => props.modelValue)

watch(
  () => props.modelValue,
  (open) => {
    if (!open) {
      cookieText.value = ''
      error.value = ''
    }
  }
)

function close() {
  emit('update:modelValue', false)
}

function submit() {
  if (!cookieValid.value || props.submitting) return
  error.value = ''
  emit('submit', { cookie: cookieText.value.trim(), remember: remember.value })
}
</script>

<style scoped>
.sheet-title {
  margin: 0 0 4px;
  text-align: center;
  font-size: 16px;
  font-weight: 600;
  color: var(--app-text);
}

.sheet-sub {
  margin: 0 0 14px;
  text-align: center;
  font-size: 12px;
  line-height: 1.5;
  color: var(--app-text-secondary, #8e8e93);
}

.field-group {
  margin-bottom: 10px;
}

.field-label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  color: var(--app-text-secondary);
}

.cookie-textarea {
  width: 100%;
  min-height: 110px;
  border: 1px solid var(--app-border, rgba(142, 142, 147, 0.28));
  border-radius: 12px;
  background: var(--app-surface, #fff);
  color: var(--app-text);
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.45;
  resize: vertical;
  box-sizing: border-box;
}

.field-error {
  margin: 6px 0 0;
  font-size: 12px;
  color: #c74444;
}

.remember-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  font-size: 13px;
  color: var(--app-text-secondary);
}

.remember-checkbox {
  width: 16px;
  height: 16px;
}

.account-notice {
  margin: 0 0 10px;
  text-align: center;
  font-size: 12px;
  color: #c77700;
}

.sheet-primary {
  width: 100%;
  margin-bottom: 8px;
  border: none;
  border-radius: 14px;
  padding: 13px 16px;
  background: #141416;
  color: #fff;
  font-size: 15px;
  font-weight: 600;
}

.sheet-primary:disabled {
  opacity: 0.45;
}

.sheet-cancel {
  width: 100%;
  border: none;
  border-radius: 14px;
  padding: 13px 16px;
  background: color-mix(in srgb, var(--app-glass) 80%, var(--app-surface));
  color: var(--app-text);
  font-size: 15px;
  font-weight: 500;
}

:global(html.theme-dark) .sheet-primary {
  background: #f5f5f7;
  color: #141416;
}
</style>
