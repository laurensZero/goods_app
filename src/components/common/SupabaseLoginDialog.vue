<template>
  <AppSheet :model-value="modelValue" size="wide" @update:model-value="closeDialog">
    <h3 class="dialog-title">{{ activeMode === 'register' ? t('my.authRegister') : t('my.authLogin') }}</h3>

    <div v-if="authError" class="dialog-error">{{ authError }}</div>

    <!-- Tab Switcher -->
    <div class="auth-tabs">
      <button
        type="button"
        class="auth-tab"
        :class="{ 'auth-tab--active': activeMode === 'login-email' }"
        @click="switchMode('login-email')"
      >
        {{ t('my.authTabEmail') }}
      </button>
      <button
        type="button"
        class="auth-tab"
        :class="{ 'auth-tab--active': activeMode === 'magic' }"
        @click="switchMode('magic')"
      >
        {{ t('my.authTabMagic') }}
      </button>
      <button
        type="button"
        class="auth-tab"
        :class="{ 'auth-tab--active': activeMode === 'social' }"
        @click="switchMode('social')"
      >
        {{ t('my.authTabSocial') }}
      </button>
    </div>

    <!-- Email + Password Login -->
    <form v-if="activeMode === 'login-email' || activeMode === 'register'" class="auth-form" @submit.prevent="handleEmailSubmit">
      <label class="auth-field">
        <span class="auth-field__label">{{ t('my.authEmail') }}</span>
        <input
          v-model="email"
          class="auth-input"
          type="email"
          :placeholder="t('my.authEmail')"
          autocomplete="email"
          required
        />
      </label>

      <label class="auth-field">
        <span class="auth-field__label">{{ t('my.authPassword') }}</span>
        <input
          v-model="password"
          class="auth-input"
          type="password"
          :placeholder="t('my.authPassword')"
          autocomplete="current-password"
          required
          minlength="6"
        />
      </label>

      <label v-if="activeMode === 'register'" class="auth-field">
        <span class="auth-field__label">{{ t('my.authConfirmPassword') }}</span>
        <input
          v-model="confirmPassword"
          class="auth-input"
          type="password"
          :placeholder="t('my.authConfirmPassword')"
          autocomplete="new-password"
          required
        />
      </label>

      <button
        v-if="activeMode === 'login-email'"
        type="button"
        class="auth-forgot"
        @click="switchMode('reset')"
      >
        {{ t('my.authForgotPassword') }}
      </button>

      <div class="auth-actions">
        <button type="submit" class="auth-btn auth-btn--primary" :disabled="isLoading">
          {{ isLoading ? '...' : (activeMode === 'register' ? t('my.authRegister') : t('my.authLogin')) }}
        </button>
      </div>
    </form>

    <!-- Magic Link -->
    <form v-if="activeMode === 'magic'" class="auth-form" @submit.prevent="handleMagicLink">
      <p class="auth-desc">{{ t('my.authMagicLinkDesc') }}</p>

      <label class="auth-field">
        <span class="auth-field__label">{{ t('my.authEmail') }}</span>
        <input
          v-model="email"
          class="auth-input"
          type="email"
          :placeholder="t('my.authEmail')"
          autocomplete="email"
          required
        />
      </label>

      <div v-if="magicLinkSent" class="dialog-success">{{ t('my.authLinkSent') }}</div>

      <div class="auth-actions">
        <button type="submit" class="auth-btn auth-btn--primary" :disabled="isLoading || magicLinkSent">
          {{ isLoading ? '...' : t('my.authSendLink') }}
        </button>
      </div>
    </form>

    <!-- Reset Password: email → OTP + new password -->
    <form v-if="activeMode === 'reset'" class="auth-form" @submit.prevent="handleResetPassword">
      <p class="auth-desc">{{ t('my.authResetOtpDesc') }}</p>

      <label class="auth-field">
        <span class="auth-field__label">{{ t('my.authEmail') }}</span>
        <input
          v-model="email"
          class="auth-input"
          type="email"
          :placeholder="t('my.authEmail')"
          autocomplete="email"
          required
          :disabled="resetSent"
        />
      </label>

      <template v-if="resetSent">
        <label class="auth-field">
          <span class="auth-field__label">{{ t('my.authOtpCode') }}</span>
          <input
            v-model="otpCode"
            class="auth-input"
            type="text"
            inputmode="numeric"
            autocomplete="one-time-code"
            :placeholder="t('my.authOtpCodePlaceholder')"
            required
          />
        </label>

        <label class="auth-field">
          <span class="auth-field__label">{{ t('my.newPassword') }}</span>
          <input
            v-model="password"
            class="auth-input"
            type="password"
            :placeholder="t('my.newPassword')"
            autocomplete="new-password"
            required
            minlength="6"
          />
        </label>

        <label class="auth-field">
          <span class="auth-field__label">{{ t('my.confirmNewPassword') }}</span>
          <input
            v-model="confirmPassword"
            class="auth-input"
            type="password"
            :placeholder="t('my.confirmNewPassword')"
            autocomplete="new-password"
            required
          />
        </label>

        <button type="button" class="auth-forgot" :disabled="isLoading" @click="resendResetOtp">
          {{ t('my.authResendOtp') }}
        </button>
      </template>

      <div class="auth-actions">
        <button type="submit" class="auth-btn auth-btn--primary" :disabled="isLoading">
          {{ isLoading ? '...' : (resetSent ? t('my.changePassword') : t('my.authResetPassword')) }}
        </button>
      </div>
    </form>

    <!-- Social Login -->
    <div v-if="activeMode === 'social'" class="auth-form">
      <p class="auth-desc">{{ t('my.authSocialLogin') }}</p>

      <div class="social-buttons">
        <button type="button" class="social-btn social-btn--google" :disabled="isLoading" @click="handleOAuth('google')">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          <span>Google</span>
        </button>

        <button type="button" class="social-btn social-btn--github" :disabled="isLoading" @click="handleOAuth('github')">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
          </svg>
          <span>GitHub</span>
        </button>

        <button type="button" class="social-btn social-btn--microsoft" :disabled="isLoading" @click="handleOAuth('azure')">
          <svg viewBox="0 0 21 21" width="20" height="20" aria-hidden="true">
            <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
            <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
            <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
            <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
          </svg>
          <span>Microsoft</span>
        </button>
      </div>
    </div>

    <!-- Footer Links -->
    <div class="auth-footer">
      <template v-if="activeMode === 'login-email' || activeMode === 'social'">
        <button type="button" class="auth-link" @click="switchMode('register')">
          {{ t('my.authGoToRegister') }}
        </button>
      </template>
      <template v-else-if="activeMode === 'register'">
        <button type="button" class="auth-link" @click="switchMode('login-email')">
          {{ t('my.authGoToLogin') }}
        </button>
      </template>
      <template v-else-if="activeMode === 'magic' || activeMode === 'reset'">
        <button type="button" class="auth-link" @click="switchMode('login-email')">
          {{ t('my.authGoToLogin') }}
        </button>
      </template>
    </div>
  </AppSheet>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useDialogBackButton } from '@/composables/useDialogBackButton'
import AppSheet from '@/components/common/AppSheet.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue', 'login-success', 'toast'])

const { t } = useI18n()
const authStore = useAuthStore()

const activeMode = ref('login-email')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const otpCode = ref('')
const magicLinkSent = ref(false)
const resetSent = ref(false)
const authError = ref('')
const isLoading = ref(false)

function switchMode(mode) {
  activeMode.value = mode
  authError.value = ''
  magicLinkSent.value = false
  resetSent.value = false
}

function closeDialog() {
  emit('update:modelValue', false)
  resetForm()
}

useDialogBackButton(closeDialog, () => props.modelValue)

function resetForm() {
  email.value = ''
  password.value = ''
  confirmPassword.value = ''
  otpCode.value = ''
  magicLinkSent.value = false
  resetSent.value = false
  authError.value = ''
  isLoading.value = false
  activeMode.value = 'login-email'
}

async function handleEmailSubmit() {
  authError.value = ''

  if (activeMode.value === 'register') {
    if (password.value !== confirmPassword.value) {
      authError.value = t('my.authPasswordMismatch')
      return
    }
    if (password.value.length < 6) {
      authError.value = t('my.authPasswordTooShort')
      return
    }
  }

  isLoading.value = true
  try {
    if (activeMode.value === 'register') {
      await authStore.registerWithEmail(email.value, password.value)
      emit('toast', t('my.authRegisterSuccess'))
      closeDialog()
    } else {
      await authStore.loginWithEmail(email.value, password.value)
      emit('login-success', authStore.user)
      emit('toast', t('my.authLoginSuccess'))
      closeDialog()
    }
  } catch (e) {
    authError.value = e.message || t('my.authLoginSuccess')
  } finally {
    isLoading.value = false
  }
}

async function handleMagicLink() {
  authError.value = ''
  isLoading.value = true
  try {
    await authStore.loginWithMagicLink(email.value)
    magicLinkSent.value = true
  } catch (e) {
    authError.value = e.message || 'Failed'
  } finally {
    isLoading.value = false
  }
}

async function handleResetPassword() {
  authError.value = ''

  // 第二步：验证码 + 新密码
  if (resetSent.value) {
    if (!otpCode.value.trim()) {
      authError.value = t('my.authOtpRequired')
      return
    }
    if (password.value !== confirmPassword.value) {
      authError.value = t('my.authPasswordMismatch')
      return
    }
    if (password.value.length < 6) {
      authError.value = t('my.authPasswordTooShort')
      return
    }
    isLoading.value = true
    try {
      await authStore.resetPasswordWithOtp(email.value, otpCode.value.trim(), password.value)
      emit('toast', t('my.changePasswordSuccess'))
      closeDialog()
    } catch (e) {
      authError.value = e.message || t('my.changePasswordFailed')
    } finally {
      isLoading.value = false
    }
    return
  }

  // 第一步：发送验证码邮件
  isLoading.value = true
  try {
    await authStore.sendResetPassword(email.value)
    resetSent.value = true
    emit('toast', t('my.authResetSent'))
  } catch (e) {
    authError.value = e.message || 'Failed'
  } finally {
    isLoading.value = false
  }
}

async function resendResetOtp() {
  if (isLoading.value || !email.value) return
  authError.value = ''
  isLoading.value = true
  try {
    await authStore.sendResetPassword(email.value)
    emit('toast', t('my.authResetSent'))
  } catch (e) {
    authError.value = e.message || 'Failed'
  } finally {
    isLoading.value = false
  }
}

async function handleOAuth(provider) {
  authError.value = ''
  isLoading.value = true
  try {
    await authStore.loginWithOAuth(provider)
    // OAuth redirects to provider, so dialog stays open until callback
  } catch (e) {
    authError.value = e.message || 'Failed'
  } finally {
    isLoading.value = false
  }
}

watch(() => props.modelValue, (val) => {
  if (val) resetForm()
})
</script>

<style scoped>
.dialog-title {
  margin: 0 0 16px;
  color: var(--app-text);
  font-size: 19px;
  font-weight: 600;
  letter-spacing: -0.03em;
}

.dialog-error {
  margin-bottom: 12px;
  color: #c74444;
  font-size: 13px;
}

.dialog-success {
  margin-top: 8px;
  color: #28c880;
  font-size: 13px;
}

.auth-tabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  margin-bottom: 20px;
  border-radius: var(--radius-small);
  background: var(--app-surface-soft);
}

.auth-tab {
  flex: 1;
  min-height: 38px;
  padding: 0 12px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.16s ease, color 0.16s ease;
}

.auth-tab--active {
  background: var(--app-text);
  color: var(--app-surface);
}

.auth-form {
  display: grid;
  gap: 14px;
}

.auth-desc {
  margin: 0;
  color: var(--app-text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.auth-field {
  display: grid;
  gap: 6px;
}

.auth-field__label {
  color: var(--app-text-secondary);
  font-size: 13px;
}

.auth-input {
  width: 100%;
  height: 46px;
  padding: 0 14px;
  border: 1px solid color-mix(in srgb, var(--app-text) 12%, transparent);
  border-radius: var(--radius-xs);
  background: var(--app-surface-soft);
  color: var(--app-text);
  font-size: 15px;
  outline: none;
  transition: border-color 0.16s ease;
}

.auth-input:focus {
  border-color: color-mix(in srgb, var(--app-text) 28%, transparent);
}

.auth-forgot {
  justify-self: start;
  padding: 0;
  border: none;
  background: none;
  color: var(--app-text-secondary);
  font-size: 13px;
  cursor: pointer;
  text-decoration: underline;
}

.auth-actions {
  margin-top: 4px;
}

.auth-btn {
  width: 100%;
  min-height: 48px;
  border: none;
  border-radius: var(--radius-small);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}

.auth-btn--primary {
  background: var(--app-text);
  color: var(--app-surface);
}

.auth-btn:disabled {
  opacity: 0.56;
  cursor: not-allowed;
}

.social-buttons {
  display: grid;
  gap: 10px;
  margin-top: 8px;
}

.social-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  min-height: 48px;
  padding: 0 16px;
  border: 1px solid color-mix(in srgb, var(--app-text) 12%, transparent);
  border-radius: var(--radius-small);
  background: var(--app-surface-soft);
  color: var(--app-text);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.16s ease;
}

.social-btn:active {
  transform: scale(0.98);
}

.social-btn:disabled {
  opacity: 0.56;
  cursor: not-allowed;
}

.auth-footer {
  margin-top: 16px;
  padding-bottom: 8px;
  text-align: center;
}

.auth-link {
  padding: 0;
  border: none;
  background: none;
  color: var(--app-text-secondary);
  font-size: 14px;
  cursor: pointer;
  text-decoration: underline;
}
</style>
