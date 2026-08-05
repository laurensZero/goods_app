<template>
  <section class="form-section checkout-step">
    <div class="section-head">
      <p class="section-label">{{ $t('checkout.stepLabel', { current: stepNumber, total: stepCount }) }}</p>
      <h2 class="section-title">{{ $t('checkout.stepCookie') }}</h2>
    </div>

    <div class="field-card">
      <div class="cookie-info">
        <div class="cookie-info__icon">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4" />
            <circle cx="12" cy="16" r="1" fill="currentColor" />
          </svg>
        </div>
        <div class="cookie-info__body">
          <template v-if="isNativePlatform">
            <p class="cookie-info__title">{{ $t('import.nativeLoginTitle') }}</p>
            <ol class="cookie-info__steps">
              <li>{{ $t('import.nativeStep1') }}</li>
              <li>{{ $t('import.nativeStep2') }}</li>
              <li>{{ $t('import.nativeStep3') }}</li>
              <li>{{ $t('import.nativeStep4Cart') }}</li>
            </ol>
          </template>
          <template v-else>
            <p class="cookie-info__title">{{ $t('import.howToGetCookie') }}</p>
            <ol class="cookie-info__steps">
              <li>{{ $t('import.cartCookieStep1') }}</li>
              <li>{{ $t('import.cartCookieStep2') }}</li>
              <li>{{ $t('import.cartCookieStep3') }}</li>
              <li>{{ $t('import.cartCookieStep4') }}</li>
              <li>{{ $t('import.cartCookieStep5') }}</li>
            </ol>
          </template>
        </div>
      </div>
    </div>

    <div v-if="!isNativePlatform" class="field">
      <span class="field-label">{{ $t('import.pasteCookie') }}</span>
      <textarea
        v-model="cookieModel"
        class="cookie-textarea"
        :placeholder="$t('import.cookiePlaceholder')"
        spellcheck="false"
        autocomplete="off"
      />
      <p v-if="modelValue && !cookieValid" class="field-error">{{ $t('import.cookieInvalid') }}</p>
    </div>

    <div v-if="!isNativePlatform" class="cookie-actions">
      <label class="remember-row">
        <input v-model="rememberModel" class="remember-checkbox" type="checkbox" />
        <span>{{ $t('import.rememberCookie') }}</span>
      </label>
      <button v-if="hasSavedCookie" class="link-btn" type="button" @click="$emit('clear-saved')">
        {{ $t('import.clearSaved') }}
      </button>
    </div>
    <p v-if="cookieWarningMessage" class="cookie-tip cookie-tip--warn">{{ cookieWarningMessage }}</p>
  </section>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  isNativePlatform: { type: Boolean, default: false },
  cookieValid: { type: Boolean, default: false },
  hasSavedCookie: { type: Boolean, default: false },
  cookieWarningMessage: { type: String, default: '' },
  rememberCookie: { type: Boolean, default: false },
  stepNumber: { type: Number, required: true },
  stepCount: { type: Number, required: true },
})
const emit = defineEmits(['update:modelValue', 'update:rememberCookie', 'clear-saved'])

const rememberModel = computed({
  get: () => props.rememberCookie,
  set: (val) => emit('update:rememberCookie', val),
})

const cookieModel = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})
</script>

<style src="@/views/checkout-shared.css"></style>
<style scoped>
/* ── Cookie 说明卡 ── */
.cookie-textarea {
  font-family: monospace;
  font-size: 13px;
}

.cookie-info {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.cookie-info__icon {
  flex-shrink: 0;
  width: 42px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-xs);
  background: #e8f4ff;
  color: #2070c0;
}

.cookie-info__icon svg {
  width: 22px;
  height: 22px;
}

.cookie-info__body {
  flex: 1;
  min-width: 0;
}

.cookie-info__title {
  font-size: 15px;
  font-weight: 600;
  color: var(--app-text);
  margin-bottom: 8px;
}

.cookie-info__steps {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  color: var(--app-text-secondary);
  line-height: 1.7;
}

.cookie-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.remember-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--app-text-secondary);
  cursor: pointer;
}

.remember-checkbox {
  width: 16px;
  height: 16px;
  accent-color: #2070c0;
}

.cookie-tip {
  font-size: 12px;
  padding: 8px 12px;
  border-radius: var(--radius-xs);
}

.cookie-tip--warn {
  background: rgba(255, 149, 0, 0.1);
  color: #c77700;
}

:global(html.theme-dark) .cookie-info__icon {
  background: rgba(109, 157, 255, 0.14);
  color: #bfd4ff;
}
</style>