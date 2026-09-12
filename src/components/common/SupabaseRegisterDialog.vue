<template>
  <AppSheet :model-value="modelValue" size="wide" @update:model-value="closeDialog">
    <h3 class="dialog-title">{{ t('my.authRegister') }}</h3>

    <div v-if="authError" class="dialog-error">{{ authError }}</div>
    <div v-if="registerSuccess" class="dialog-success">{{ t('my.authRegisterSuccess') }}</div>

    <form class="auth-form" @submit.prevent="handleRegister">
      <label class="auth-field">
        <span class="auth-field__label">{{ t('my.authEmail') }}</span>
        <input
          v-model="email"
          class="auth-input"
          type="email"
          :placeholder="t('my.authEmail')"
          autocomplete="email"
          required
          @input="onEmailInput"
        />
      </label>

      <label class="auth-field">
        <span class="auth-field__label">{{ t('my.authDisplayName') }}</span>
        <input
          v-model="displayName"
          class="auth-input"
          type="text"
          :placeholder="t('my.authDisplayName')"
          autocomplete="name"
        />
      </label>

      <label class="auth-field">
        <span class="auth-field__label">{{ t('my.authPassword') }}</span>
        <input
          v-model="password"
          class="auth-input"
          type="password"
          :placeholder="t('my.authPassword')"
          autocomplete="new-password"
          required
          minlength="6"
        />
      </label>

      <label class="auth-field">
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

      <div class="auth-actions">
        <button type="submit" class="auth-btn auth-btn--primary" :disabled="isLoading || registerSuccess">
          {{ isLoading ? '...' : t('my.authRegister') }}
        </button>
      </div>
    </form>

    <div class="auth-footer">
      <button type="button" class="auth-link" @click="goToLogin">
        {{ t('my.authGoToLogin') }}
      </button>
    </div>

    <div class="dialog-actions" style="margin-top: 12px;">
      <button type="button" class="dialog-btn dialog-btn--secondary" @click="closeDialog">
        {{ t('theme.cancel') }}
      </button>
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

const emit = defineEmits(['update:modelValue', 'switch-to-login', 'toast'])

const { t } = useI18n()
const authStore = useAuthStore()

const email = ref('')
const displayName = ref('')
const password = ref('')
const confirmPassword = ref('')
const authError = ref('')
const isLoading = ref(false)
const registerSuccess = ref(false)

function closeDialog() {
  emit('update:modelValue', false)
}

useDialogBackButton(closeDialog, () => props.modelValue)

function goToLogin() {
  emit('switch-to-login')
}

function resetForm() {
  email.value = ''
  displayName.value = ''
  password.value = ''
  confirmPassword.value = ''
  authError.value = ''
  isLoading.value = false
  registerSuccess.value = false
}

function onEmailInput() {
  // 预填用户名为邮箱 @ 前面的内容
  if (!displayName.value && email.value.includes('@')) {
    displayName.value = email.value.split('@')[0]
  }
}

async function handleRegister() {
  authError.value = ''

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
    await authStore.registerWithEmail(email.value, password.value, {
      metadata: { display_name: displayName.value || email.value.split('@')[0] }
    })
    registerSuccess.value = true
    emit('toast', t('my.authRegisterSuccess'))
  } catch (e) {
    authError.value = e.message || 'Registration failed'
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
  margin-bottom: 12px;
  color: #28c880;
  font-size: 13px;
}

.dialog-actions {
  display: flex;
  column-gap: 10px;
  row-gap: 8px;
  justify-content: flex-end;
  flex-shrink: 0;
}

.dialog-btn {
  min-height: 42px;
  padding: 0 18px;
  border: none;
  border-radius: var(--radius-xs);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.dialog-btn--secondary {
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
}

.auth-form {
  display: grid;
  gap: 14px;
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
