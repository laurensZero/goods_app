<template>
  <AccountManagerSheet
    ref="managerRef"
    :model-value="modelValue"
    :accounts="accounts"
    :active-account-id="activeAccountId"
    :active-account-label="activeAccountLabel"
    :refreshing-account-id="refreshingAccountId"
    supports-stoken
    supports-refresh
    @update:model-value="(v) => { if (!v) close() }"
    @switch="(account) => $emit('switch', account)"
    @remove="(account) => $emit('remove', account)"
    @relogin="onRelogin"
    @login-new="onLoginNew"
    @edit-stoken="onEditStoken"
    @refresh-account="(account) => $emit('refresh-account', account)"
  >
    <template #login-extra>
      <button
        v-if="isNativeLogin"
        class="sheet-cookie-login"
        type="button"
        @click="onCookieLogin"
      >
        {{ t('import.loginWithCookie') }}
      </button>
    </template>
  </AccountManagerSheet>

  <MihoyoCookieLoginSheet
    v-model="showCookieLogin"
    :submitting="cookieLoginSubmitting"
    @submit="(payload) => $emit('login-cookie', payload)"
  />

  <MihoyoQrLoginSheet
    v-model="showQrLogin"
    @success="(payload) => $emit('login-cookie', payload)"
    @use-cookie="showCookieLogin = true"
  />

  <MihoyoStokenSheet
    v-model="showStokenSheet"
    :account-label="stokenAccount?.label || ''"
    :submitting="stokenSubmitting"
    :error="stokenError"
    @submit="onStokenSubmit"
  />
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AccountManagerSheet from '@/components/import/AccountManagerSheet.vue'
import MihoyoCookieLoginSheet from '@/components/import/MihoyoCookieLoginSheet.vue'
import MihoyoQrLoginSheet from '@/components/import/MihoyoQrLoginSheet.vue'
import MihoyoStokenSheet from '@/components/import/MihoyoStokenSheet.vue'
import { useDialogBackButton } from '@/composables/useDialogBackButton'
import { canUseNativeMihoyoImport } from '@/utils/mihoyo/nativeImport'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  accounts: { type: Array, default: () => [] },
  activeAccountId: { type: String, default: '' },
  activeAccountLabel: { type: String, default: '' },
  cookieLoginSubmitting: { type: Boolean, default: false },
  refreshingAccountId: { type: String, default: '' },
  saveStoken: { type: Function, default: null },
  stokenErrorMessage: { type: Function, default: null },
})

const emit = defineEmits([
  'update:modelValue',
  'switch',
  'remove',
  'login-native',
  'login-cookie',
  'refresh-account',
])

const { t } = useI18n()
const managerRef = ref(null)
const showCookieLogin = ref(false)
const showQrLogin = ref(false)
const showStokenSheet = ref(false)
const stokenAccount = ref(null)
const stokenSubmitting = ref(false)
const stokenError = ref('')
const isNativeLogin = computed(() => canUseNativeMihoyoImport())

useDialogBackButton(
  closeChildren,
  () => showCookieLogin.value || showQrLogin.value || showStokenSheet.value
)

watch(
  () => props.modelValue,
  (open) => {
    if (!open) closeChildren()
  }
)

function closeChildren() {
  showCookieLogin.value = false
  showQrLogin.value = false
  closeStokenSheet()
}

function close() {
  closeChildren()
  emit('update:modelValue', false)
}

/** 登录成功后由父组件调用：关掉 Cookie 弹层与账号面板 */
function closeAll() {
  closeChildren()
  emit('update:modelValue', false)
}

function onLoginNew() {
  if (isNativeLogin.value) {
    emit('login-native')
    close()
    return
  }
  // 网页版优先扫码；Sheet 内可改走粘贴 Cookie
  showQrLogin.value = true
}

/**
 * 安卓端：原生 WebView 登录之外，再提供「粘贴 Cookie 登录」入口。
 * 账号失效后的重新登录也可以用底部这个入口（按账号 UID 覆盖同一条账号记录）。
 */
function onCookieLogin() {
  managerRef.value?.setNotice('')
  showCookieLogin.value = true
}

function onRelogin(account) {
  if (!account) return
  if (isNativeLogin.value) {
    emit('login-native', account)
    close()
    return
  }
  showQrLogin.value = true
}

function onEditStoken(account) {
  if (!account) return
  stokenAccount.value = account
  stokenError.value = ''
  showStokenSheet.value = true
}

async function onStokenSubmit({ input } = {}) {
  const account = stokenAccount.value
  if (!account || stokenSubmitting.value) return
  if (typeof props.saveStoken !== 'function') {
    stokenError.value = t('import.stokenRefreshFailed')
    return
  }

  stokenSubmitting.value = true
  stokenError.value = ''
  try {
    const result = await props.saveStoken(account.id, input)
    if (result?.ok) {
      closeStokenSheet()
      managerRef.value?.setNotice(t('import.stokenRefreshSuccess'), 'success')
      return
    }
    stokenError.value = props.stokenErrorMessage?.(result)
      || String(result?.message || t('import.stokenRefreshFailed'))
  } catch (error) {
    stokenError.value = String(error?.message || t('import.stokenRefreshFailed'))
  } finally {
    stokenSubmitting.value = false
  }
}

function closeStokenSheet() {
  showStokenSheet.value = false
  stokenAccount.value = null
  stokenSubmitting.value = false
  stokenError.value = ''
}

function setStokenSubmitting(value) {
  stokenSubmitting.value = Boolean(value)
}

function setStokenError(message) {
  stokenError.value = String(message || '')
}

defineExpose({
  setNotice(message, tone = 'info') {
    managerRef.value?.setNotice(message, tone)
  },
  setStokenSubmitting,
  setStokenError,
  closeStokenSheet,
  close,
  closeAll,
})
</script>

<style scoped>
.sheet-cookie-login {
  width: 100%;
  height: 48px;
  margin-top: 8px;
  border: none;
  border-radius: var(--radius-medium);
  padding: 0 16px;
  background: var(--app-surface-soft);
  color: var(--app-text);
  font-size: var(--font-subtitle);
  font-weight: 500;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background-color var(--motion-fast) ease;
}

.sheet-cookie-login:active {
  background: color-mix(in srgb, var(--app-text) 8%, var(--app-surface-soft));
}

@media (prefers-reduced-motion: reduce) {
  .sheet-cookie-login {
    transition: none;
  }
}
</style>
