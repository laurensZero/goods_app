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

    <div v-if="accounts?.length" class="account-pick">
      <p class="account-pick__title">{{ $t('checkout.pickAccount') }}</p>
      <div class="account-pick__list">
        <button
          v-for="account in accounts"
          :key="account.id"
          type="button"
          class="account-pick__item"
          :class="{ 'account-pick__item--active': String(account.id) === String(activeAccountId) }"
          @click="$emit('select-account', account)"
        >
          <span class="account-pick__avatar" aria-hidden="true">
            <img v-if="account.avatarUrl" :src="account.avatarUrl" :alt="account.label" class="account-pick__img" />
            <span v-else class="account-pick__fallback">{{ (account.label || '?').charAt(0) }}</span>
          </span>
          <span class="account-pick__copy">
            <span class="account-pick__label">{{ account.label }}</span>
            <span class="account-pick__meta">{{ account.accountId || account.id }}</span>
          </span>
        </button>
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
        {{ $t('import.logout') }}
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
  accounts: { type: Array, default: () => [] },
  activeAccountId: { type: String, default: '' },
  activeAccountLabel: { type: String, default: '' },
  activeAccountAvatar: { type: String, default: '' },
  stepNumber: { type: Number, required: true },
  stepCount: { type: Number, required: true },
})
const emit = defineEmits(['update:modelValue', 'update:rememberCookie', 'clear-saved', 'select-account'])

const rememberModel = computed({
  get: () => props.rememberCookie,
  set: (val) => emit('update:rememberCookie', val),
})

const cookieModel = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})
</script>

<style src="@/assets/views/checkout-shared.css"></style>
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

.account-pick {
  margin-bottom: 12px;
}

.account-pick__title {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--app-text-secondary);
}

.account-pick__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.account-pick__item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--app-border) 80%, transparent);
  border-radius: 14px;
  background: var(--app-surface);
  text-align: left;
}

.account-pick__item--active {
  border-color: #2070c0;
  background: rgba(32, 112, 192, 0.08);
}

.account-pick__avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
  background: rgba(90, 120, 250, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
}

.account-pick__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.account-pick__fallback {
  font-weight: 600;
  color: #4c7dff;
}

.account-pick__copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.account-pick__label {
  font-size: 14px;
  font-weight: 600;
  color: var(--app-text);
}

.account-pick__meta {
  font-size: 12px;
  color: var(--app-text-tertiary);
}
</style>