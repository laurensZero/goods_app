<template>
  <AppSheet
    :model-value="modelValue"
    sheet-class="mihoyo-account-sheet"
    @update:model-value="(v) => { if (!v) close() }"
  >
    <p class="sheet-title">{{ t('import.accountManager') }}</p>
    <p v-if="activeAccountLabel" class="sheet-sub">
      {{ t('import.currentAccount', { label: activeAccountLabel }) }}
    </p>

    <div v-if="accounts.length === 0" class="account-empty">
      {{ t('import.noSavedAccounts') }}
    </div>

    <div v-else class="sheet-options account-list">
      <div
        v-for="account in accounts"
        :key="account.id"
        :class="['account-row', account.id === activeAccountId && 'account-row--active']"
      >
        <button class="account-main" type="button" @click="onSwitch(account)">
          <div class="account-avatar" aria-hidden="true">
            <img
              v-if="account.avatarUrl"
              :src="account.avatarUrl"
              :alt="account.label"
              class="account-avatar__img"
              loading="lazy"
            />
            <span v-else class="account-avatar__fallback">{{ avatarText(account) }}</span>
          </div>
          <div class="account-copy">
            <p class="account-label">
              {{ account.label }}
              <span v-if="account.id === activeAccountId" class="account-badge">{{ t('import.currentAccountBadge') }}</span>
            </p>
            <p class="account-meta">
              <span v-if="account.invalidAt" class="account-meta--warn">{{ t('import.accountInvalid') }}</span>
              <span v-else-if="account.accountId">{{ account.accountId }}</span>
              <span v-else>{{ account.id }}</span>
            </p>
          </div>
        </button>
        <div class="account-actions">
          <button
            v-if="account.invalidAt"
            class="icon-btn icon-btn--warn"
            type="button"
            @click="onRelogin(account)"
          >
            {{ t('import.reloginAccount') }}
          </button>
          <button class="icon-btn icon-btn--danger" type="button" @click="onLogoutAccount(account)">
            {{ t('import.logout') }}
          </button>
        </div>
      </div>
    </div>

    <p v-if="notice" class="account-notice">{{ notice }}</p>

    <button
      class="sheet-cancel sheet-login-new"
      type="button"
      @click="onLoginNew"
    >
      {{ t('import.loginNewAccount') }}
    </button>
  </AppSheet>

  <MihoyoCookieLoginSheet
    v-model="showCookieLogin"
    :submitting="cookieLoginSubmitting"
    @submit="(payload) => $emit('login-cookie', payload)"
  />

  <DangerConfirmDialog
    v-model:show="showLogoutConfirm"
    :title="t('import.logoutAccountTitle')"
    :description="t('import.logoutAccountDesc', { label: pendingLogout?.label || '' })"
    :confirm-text="t('import.logout')"
    @confirm="doLogoutAccount"
  />
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppSheet from '@/components/common/AppSheet.vue'
import DangerConfirmDialog from '@/components/common/DangerConfirmDialog.vue'
import MihoyoCookieLoginSheet from '@/components/import/MihoyoCookieLoginSheet.vue'
import { useDialogBackButton } from '@/composables/useDialogBackButton'
import { canUseNativeMihoyoImport } from '@/utils/mihoyo/nativeImport'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  accounts: { type: Array, default: () => [] },
  activeAccountId: { type: String, default: '' },
  activeAccountLabel: { type: String, default: '' },
  cookieLoginSubmitting: { type: Boolean, default: false },
})

const emit = defineEmits([
  'update:modelValue',
  'switch',
  'remove',
  'login-native',
  'login-cookie',
])

const { t } = useI18n()
const notice = ref('')
const showLogoutConfirm = ref(false)
const pendingLogout = ref(null)
const showCookieLogin = ref(false)

const activeId = computed(() => String(props.activeAccountId || ''))
const isNativeLogin = computed(() => canUseNativeMihoyoImport())

useDialogBackButton(close, () => props.modelValue || showCookieLogin.value)

watch(
  () => props.modelValue,
  (open) => {
    if (!open) {
      notice.value = ''
      pendingLogout.value = null
      showLogoutConfirm.value = false
    }
  }
)

function close() {
  showCookieLogin.value = false
  emit('update:modelValue', false)
}

/** 登录成功后由父组件调用：关掉 Cookie 弹层与账号面板 */
function closeAll() {
  showCookieLogin.value = false
  emit('update:modelValue', false)
}

function onLoginNew() {
  notice.value = ''
  if (isNativeLogin.value) {
    emit('login-native')
    close()
    return
  }
  showCookieLogin.value = true
}

function avatarText(account) {
  const label = String(account?.label || account?.accountId || '?').trim()
  return label.charAt(0) || '?'
}

function onSwitch(account) {
  if (!account || account.id === activeId.value) return
  notice.value = ''
  if (account.invalidAt) {
    // Cookie 已失效：不能直接当有效会话切换，引导重新登录
    onRelogin(account)
    return
  }
  emit('switch', account)
  close()
}

function onRelogin(account) {
  notice.value = ''
  pendingLogout.value = account
  if (isNativeLogin.value) {
    emit('login-native', account)
    close()
    return
  }
  showCookieLogin.value = true
}

function onLogoutAccount(account) {
  if (!account) return
  pendingLogout.value = account
  showLogoutConfirm.value = true
}

function doLogoutAccount() {
  const account = pendingLogout.value
  if (!account) return
  emit('remove', account)
  pendingLogout.value = null
}

defineExpose({
  setNotice(message) {
    notice.value = String(message || '')
  },
  close,
  closeAll,
})
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
  margin: 0 0 12px;
  text-align: center;
  font-size: 12px;
  color: var(--app-text-secondary, #8e8e93);
}

.account-empty {
  padding: 20px 12px;
  text-align: center;
  font-size: 13px;
  color: var(--app-text-secondary, #8e8e93);
}

.sheet-options {
  background: color-mix(in srgb, var(--app-glass) 76%, var(--app-surface));
  border: 1px solid color-mix(in srgb, var(--app-border) 78%, transparent);
  border-radius: 18px;
  overflow: hidden;
  margin-bottom: 10px;
}

.account-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(142, 142, 147, 0.12);
}

.account-row:last-child {
  border-bottom: none;
}

.account-row--active {
  background: rgba(90, 120, 250, 0.08);
}

.account-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 4px;
  border: none;
  background: transparent;
  text-align: left;
}

.account-avatar {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  overflow: hidden;
  background: rgba(90, 120, 250, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
}

.account-avatar__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.account-avatar__fallback {
  font-size: 16px;
  font-weight: 600;
  color: #4c7dff;
}

.account-copy {
  min-width: 0;
}

.account-label {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  color: var(--app-text);
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.account-badge {
  font-size: 11px;
  font-weight: 500;
  color: #4c7dff;
  background: rgba(76, 125, 255, 0.12);
  border-radius: 999px;
  padding: 1px 8px;
}

.account-meta {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--app-text-tertiary, #8e8e93);
}

.account-meta--warn {
  color: #ff9f0a;
}

.account-actions {
  display: flex;
  flex-shrink: 0;
  gap: 4px;
  flex-wrap: wrap;
  justify-content: flex-end;
  max-width: 120px;
}

.icon-btn {
  border: none;
  background: transparent;
  color: var(--app-text-secondary, #6c6c70);
  font-size: 12px;
  padding: 6px 8px;
  border-radius: 8px;
  white-space: nowrap;
}

.icon-btn:active {
  background: rgba(142, 142, 147, 0.12);
}

.icon-btn--danger {
  color: #ff3b30;
}

.icon-btn--warn {
  color: #c77700;
}

.account-notice {
  margin: 0 0 10px;
  text-align: center;
  font-size: 12px;
  color: #ff9f0a;
}

.sheet-cancel {
  width: 100%;
  margin-top: 4px;
  border: none;
  border-radius: 14px;
  padding: 13px 16px;
  background: color-mix(in srgb, var(--app-glass) 80%, var(--app-surface));
  color: var(--app-text);
  font-size: 15px;
  font-weight: 500;
}

.sheet-login-new {
  margin-top: 10px;
  background: #141416;
  color: #fff;
  font-weight: 600;
}

:global(html.theme-dark) .sheet-options,
:global(html.theme-dark) .sheet-cancel {
  background: color-mix(in srgb, var(--app-glass) 70%, var(--app-surface));
}

:global(html.theme-dark) .sheet-login-new {
  background: #f5f5f7;
  color: #141416;
}
</style>
