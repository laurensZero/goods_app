<template>
  <AppSheet
    :model-value="modelValue"
    sheet-class="account-manager-sheet"
    @update:model-value="(v) => { if (!v) close() }"
  >
    <p class="sheet-title">{{ t('import.accountManager') }}</p>

    <div v-if="accounts.length === 0" class="account-empty">
      {{ t('import.noSavedAccounts') }}
    </div>

    <template v-else>
      <!-- 当前账号：深色主卡，使用 App 的 summary-card 材质 -->
      <section v-if="activeAccount" class="account-hero">
        <div class="account-hero__head">
          <div class="account-hero__avatar" aria-hidden="true">
            <img
              v-if="showAvatar(activeAccount)"
              :src="activeAccount.avatarUrl"
              :alt="activeAccount.label"
              class="account-hero__avatar-img"
              referrerpolicy="no-referrer"
              loading="lazy"
              @error="markAvatarBroken(activeAccount)"
            />
            <span v-else class="account-hero__avatar-fallback">{{ avatarText(activeAccount) }}</span>
          </div>
          <div class="account-hero__copy">
            <p class="account-hero__name">
              <span class="account-hero__name-text">{{ activeAccount.label }}</span>
              <span class="account-hero__badge">{{ t('import.currentAccountBadge') }}</span>
            </p>
            <p class="account-hero__uid">{{ activeAccount.accountId || activeAccount.id }}</p>
          </div>
          <button
            class="account-hero__logout"
            type="button"
            :title="t('import.logout')"
            :aria-label="t('import.logout')"
            @click="onLogoutAccount(activeAccount)"
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
              <path d="M12 2v10" />
            </svg>
          </button>
        </div>
        <p
          v-if="showStatus(activeAccount)"
          :class="['account-hero__status', statusClass(activeAccount)]"
        >
          <span class="account-hero__dot" aria-hidden="true"></span>
          <span class="account-hero__status-text">{{ statusText(activeAccount) }}</span>
        </p>
        <div class="account-hero__actions">
          <button
            v-if="supportsStoken"
            class="account-hero__action"
            type="button"
            @click="onEditStoken(activeAccount)"
          >
            <svg class="account-hero__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="8" cy="15" r="4" />
              <path d="M10.85 12.15 19 4M18 5l2 2M15 8l2 2" />
            </svg>
            <span>{{ activeAccount.hasStoken ? t('import.stokenUpdate') : t('import.stokenSet') }}</span>
          </button>
          <button
            v-if="supportsStoken && supportsRefresh && activeAccount.hasStoken && !activeAccount.invalidAt"
            class="account-hero__action"
            type="button"
            :disabled="refreshingAccountId === activeAccount.id"
            @click="onRefresh(activeAccount)"
          >
            <svg
              :class="['account-hero__icon', refreshingAccountId === activeAccount.id && 'is-spinning']"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <path d="M21 3v6h-6" />
            </svg>
            <span>{{ refreshingAccountId === activeAccount.id ? t('common.loading') : t('import.stokenRefresh') }}</span>
          </button>
          <button
            v-if="activeAccount.invalidAt || !supportsStoken"
            class="account-hero__action"
            type="button"
            @click="onRelogin(activeAccount)"
          >
            <svg class="account-hero__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M3 12h12" />
              <path d="M11 8l4 4-4 4" />
              <path d="M16 4h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-2" />
            </svg>
            <span>{{ t('import.reloginAccount') }}</span>
          </button>
        </div>
      </section>

      <!-- 其他账号：轻量列表 -->
      <template v-if="otherAccounts.length">
        <p v-if="activeAccount" class="account-section-title">{{ t('import.otherAccounts') }}</p>
        <div class="sheet-options account-list">
          <div v-for="account in otherAccounts" :key="account.id" class="account-card">
            <div class="account-row">
              <button class="account-main" type="button" @click="onSwitch(account)">
                <div class="account-avatar" aria-hidden="true">
                  <img
                    v-if="showAvatar(account)"
                    :src="account.avatarUrl"
                    :alt="account.label"
                    class="account-avatar__img"
                    referrerpolicy="no-referrer"
                    loading="lazy"
                    @error="markAvatarBroken(account)"
                  />
                  <span v-else class="account-avatar__fallback">{{ avatarText(account) }}</span>
                </div>
                <div class="account-copy">
                  <p class="account-label">
                    <span class="account-label__text">{{ account.label }}</span>
                  </p>
                  <p class="account-meta">
                    <span v-if="account.accountId">{{ account.accountId }}</span>
                    <span v-else>{{ account.id }}</span>
                  </p>
                  <p
                    v-if="showStatus(account)"
                    :class="['account-status', statusClass(account)]"
                  >
                    <span class="account-status__dot" aria-hidden="true"></span>
                    <span class="account-status__label">{{ statusText(account) }}</span>
                  </p>
                </div>
                <span class="account-chevron" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none">
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </span>
              </button>
            </div>
            <div class="account-actions">
              <button
                v-if="supportsStoken"
                class="account-action"
                type="button"
                @click="onEditStoken(account)"
              >
                <svg class="account-action__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="8" cy="15" r="4" />
                  <path d="M10.85 12.15 19 4M18 5l2 2M15 8l2 2" />
                </svg>
                <span>{{ account.hasStoken ? t('import.stokenUpdate') : t('import.stokenSet') }}</span>
              </button>
              <button
                v-if="supportsStoken && supportsRefresh && account.hasStoken && !account.invalidAt"
                class="account-action"
                type="button"
                :disabled="refreshingAccountId === account.id"
                @click="onRefresh(account)"
              >
                <svg
                  :class="['account-action__icon', refreshingAccountId === account.id && 'is-spinning']"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                  <path d="M21 3v6h-6" />
                </svg>
                <span>{{ refreshingAccountId === account.id ? t('common.loading') : t('import.stokenRefresh') }}</span>
              </button>
              <button
                v-if="account.invalidAt || !supportsStoken"
                class="account-action"
                type="button"
                @click="onRelogin(account)"
              >
                <svg class="account-action__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M3 12h12" />
                  <path d="M11 8l4 4-4 4" />
                  <path d="M16 4h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-2" />
                </svg>
                <span>{{ t('import.reloginAccount') }}</span>
              </button>
              <button
                class="account-action account-action--danger"
                type="button"
                @click="onLogoutAccount(account)"
              >
                <svg class="account-action__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
                  <path d="M12 2v10" />
                </svg>
                <span>{{ t('import.logout') }}</span>
              </button>
            </div>
          </div>
        </div>
      </template>
    </template>

    <p v-if="notice" :class="['account-notice', `account-notice--${noticeTone}`]">{{ notice }}</p>

    <button
      class="sheet-cancel sheet-login-new"
      type="button"
      @click="onLoginNew"
    >
      {{ t('import.loginNewAccount') }}
    </button>
    <slot name="login-extra" />
  </AppSheet>

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
import { useDialogBackButton } from '@/composables/useDialogBackButton'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  accounts: { type: Array, default: () => [] },
  activeAccountId: { type: String, default: '' },
  activeAccountLabel: { type: String, default: '' },
  refreshingAccountId: { type: String, default: '' },
  /** 米游铺账号支持 stoken 保活；淘宝账号只做 Cookie 登录 */
  supportsStoken: { type: Boolean, default: false },
  supportsRefresh: { type: Boolean, default: false },
})

const emit = defineEmits([
  'update:modelValue',
  'switch',
  'remove',
  'relogin',
  'login-new',
  'edit-stoken',
  'refresh-account',
])

const { t } = useI18n()
const notice = ref('')
const noticeTone = ref('info')
const showLogoutConfirm = ref(false)
const pendingLogout = ref(null)
const brokenAvatars = ref(new Set())

const activeId = computed(() => String(props.activeAccountId || ''))
const activeAccount = computed(() => (
  (props.accounts || []).find((item) => item.id === activeId.value) || null
))
const otherAccounts = computed(() => (
  (props.accounts || []).filter((item) => item.id !== activeAccount.value?.id)
))

useDialogBackButton(close, () => props.modelValue)

watch(
  () => props.modelValue,
  (open) => {
    if (!open) {
      notice.value = ''
      noticeTone.value = 'info'
      pendingLogout.value = null
      showLogoutConfirm.value = false
    }
  }
)

function close() {
  emit('update:modelValue', false)
}

function closeAll() {
  emit('update:modelValue', false)
}

function onLoginNew() {
  notice.value = ''
  noticeTone.value = 'info'
  emit('login-new')
}

function avatarText(account) {
  const label = String(account?.label || account?.accountId || '?').trim()
  return label.charAt(0) || '?'
}

function showAvatar(account) {
  const url = String(account?.avatarUrl || '')
  return Boolean(url) && !brokenAvatars.value.has(url)
}

function markAvatarBroken(account) {
  const url = String(account?.avatarUrl || '')
  if (url) brokenAvatars.value.add(url)
}

function onSwitch(account) {
  if (!account || account.id === activeId.value) return
  notice.value = ''
  noticeTone.value = 'info'
  if (account.invalidAt) {
    // Cookie 已失效：不能直接当有效会话切换，引导重新登录
    onRelogin(account)
    return
  }
  emit('switch', account)
  close()
}

function onRelogin(account) {
  if (!account) return
  notice.value = ''
  noticeTone.value = 'info'
  emit('relogin', account)
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

function formatKeepaliveTime(value) {
  const date = new Date(String(value || ''))
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  const pad = (number) => String(number).padStart(2, '0')
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  if (date.toDateString() === now.toDateString()) return time
  return `${date.getMonth() + 1}/${date.getDate()} ${time}`
}

function keepaliveText(account) {
  if (!account?.hasStoken) return t('import.stokenNotConfigured')
  if (account.invalidAt) return t('import.stokenInvalidated')
  if (account.refreshError) return t('import.stokenRefreshError', { message: account.refreshError })
  if (account.lastValidAt) {
    return t('import.stokenLastValid', { time: formatKeepaliveTime(account.lastValidAt) })
  }
  if (account.lastCheckedAt) {
    return t('import.stokenLastChecked', { time: formatKeepaliveTime(account.lastCheckedAt) })
  }
  return t('import.stokenNeverChecked')
}

function keepaliveClass(account) {
  if (!account?.hasStoken) return 'account-status--muted'
  if (account.invalidAt) return 'account-status--error'
  if (account.refreshError) return 'account-status--warn'
  if (account.lastValidAt) return 'account-status--ok'
  return 'account-status--muted'
}

function showStatus(account) {
  return props.supportsStoken || Boolean(account?.invalidAt)
}

function statusText(account) {
  if (props.supportsStoken) return keepaliveText(account)
  return account?.invalidAt ? t('import.accountInvalid') : ''
}

function statusClass(account) {
  if (props.supportsStoken) return keepaliveClass(account)
  return account?.invalidAt ? 'account-status--error' : 'account-status--muted'
}

function onEditStoken(account) {
  if (!account) return
  notice.value = ''
  noticeTone.value = 'info'
  emit('edit-stoken', account)
}

function onRefresh(account) {
  if (!account || props.refreshingAccountId) return
  notice.value = ''
  noticeTone.value = 'info'
  emit('refresh-account', account)
}

function setNotice(message, tone = 'info') {
  notice.value = String(message || '')
  noticeTone.value = ['info', 'success', 'error'].includes(tone) ? tone : 'info'
}

defineExpose({
  setNotice,
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

.account-empty {
  padding: 20px 12px;
  text-align: center;
  font-size: 13px;
  color: var(--app-text-secondary, #8e8e93);
}

.sheet-options {
  margin-bottom: 10px;
  border-radius: 16px;
  overflow: hidden;
  background: var(--app-surface-soft);
}

.account-section-title {
  margin: 2px 2px 8px;
  font-size: 12px;
  font-weight: 500;
  color: var(--app-text-tertiary);
}

/* ── 当前账号主卡：复用 App summary-card 的深色玻璃材质 ── */
.account-hero {
  position: relative;
  margin-bottom: 16px;
  padding: 18px 18px 14px;
  border-radius: var(--radius-large);
  overflow: hidden;
  color: var(--summary-card-text);
  background:
    radial-gradient(circle at top left, rgba(255, 255, 255, 0.16), transparent 34%),
    var(--summary-card-gradient);
  box-shadow: var(--app-shadow);
}

.account-hero::after {
  content: '';
  position: absolute;
  top: -42%;
  right: -18%;
  width: 160px;
  height: 160px;
  border-radius: 50%;
  background: var(--summary-card-orb);
  filter: blur(40px);
  pointer-events: none;
  opacity: 0.55;
}

.account-hero__head,
.account-hero__status,
.account-hero__actions {
  position: relative;
  z-index: 1;
}

.account-hero__head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.account-hero__avatar {
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.16);
  display: flex;
  align-items: center;
  justify-content: center;
}

.account-hero__avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.account-hero__avatar-fallback {
  font-size: 18px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.95);
  text-transform: uppercase;
}

.account-hero__copy {
  flex: 1;
  min-width: 0;
}

.account-hero__name {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--summary-card-text);
}

.account-hero__name-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-hero__badge {
  flex-shrink: 0;
  padding: 1px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.14);
  color: rgba(255, 255, 255, 0.9);
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0;
}

.account-hero__uid {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--summary-card-label);
}

.account-hero__logout {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: rgba(255, 255, 255, 0.55);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background-color var(--motion-fast) ease;
}

.account-hero__logout svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.account-hero__logout:active {
  background: rgba(255, 255, 255, 0.1);
}

.account-hero__status {
  margin: 10px 0 0;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--summary-card-label);
}

.account-hero__dot {
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.account-hero__status-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-hero__status.account-status--ok {
  color: #6ee7a0;
}

.account-hero__status.account-status--warn {
  color: #ffcc66;
}

.account-hero__status.account-status--error {
  color: #ff8a8a;
}

.account-hero__status.account-status--muted {
  color: var(--summary-card-label);
}

.account-hero__actions {
  margin-top: 12px;
  display: flex;
  align-items: stretch;
  border-radius: 12px;
  overflow: hidden;
  background: var(--summary-card-button-bg);
}

.account-hero__action {
  position: relative;
  flex: 1 1 0;
  min-width: 0;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 8px;
  border: none;
  background: transparent;
  color: var(--summary-card-button-text);
  font-size: 12.5px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background-color var(--motion-fast) ease;
}

.account-hero__action + .account-hero__action::before {
  content: '';
  position: absolute;
  left: 0;
  top: 10px;
  bottom: 10px;
  width: 1px;
  background: rgba(255, 255, 255, 0.12);
}

.account-hero__action:active {
  background: rgba(255, 255, 255, 0.08);
}

.account-hero__action:disabled {
  opacity: 0.45;
  cursor: default;
}

.account-hero__icon {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.account-hero__action span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.account-hero__icon.is-spinning {
  animation: account-action-spin 0.9s linear infinite;
}

@media (hover: hover) {
  .account-hero__action:hover {
    background: rgba(255, 255, 255, 0.07);
  }

  .account-hero__logout:hover {
    background: rgba(255, 255, 255, 0.08);
  }
}

.account-card {
  position: relative;
  border-bottom: 1px solid color-mix(in srgb, var(--app-text) 6%, transparent);
}

.account-card:last-child {
  border-bottom: none;
}

.account-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 14px 10px;
}

.account-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: opacity var(--motion-fast) ease;
}

.account-main:active {
  opacity: 0.65;
}

.account-avatar {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--app-surface);
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
  color: var(--app-text-secondary);
  text-transform: uppercase;
}

.account-copy {
  flex: 1;
  min-width: 0;
}

.account-label {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--app-text);
}

.account-label__text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-meta {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--app-text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-status {
  margin: 4px 0 0;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 11.5px;
  font-weight: 500;
  line-height: 1.3;
}

.account-status__dot {
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.account-status__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-status--muted {
  color: var(--app-text-tertiary);
}

.account-status--ok {
  color: #2f9e44;
}

.account-status--warn {
  color: #b26a00;
}

.account-status--error {
  color: #cc3d3d;
}

.account-chevron {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--app-text-tertiary);
}

.account-chevron svg {
  width: 16px;
  height: 16px;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* 操作栏：平铺文字按钮 + 细分隔线，避免每个按钮各自带底色 */
.account-actions {
  display: flex;
  align-items: stretch;
  border-top: 1px solid color-mix(in srgb, var(--app-text) 6%, transparent);
}

.account-action {
  position: relative;
  flex: 1 1 0;
  min-width: 0;
  height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 8px;
  border: none;
  background: transparent;
  color: var(--app-text-secondary);
  font-size: 12.5px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background-color var(--motion-fast) ease, color var(--motion-fast) ease;
}

.account-action + .account-action::before {
  content: '';
  position: absolute;
  left: 0;
  top: 11px;
  bottom: 11px;
  width: 1px;
  background: color-mix(in srgb, var(--app-text) 6%, transparent);
}

.account-action:active {
  background: color-mix(in srgb, var(--app-text) 5%, transparent);
  color: var(--app-text);
}

.account-action:disabled {
  opacity: 0.45;
  cursor: default;
}

.account-action__icon {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.account-action span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.account-action--danger {
  color: #cc3d3d;
}

.account-action--danger:active {
  background: color-mix(in srgb, #cc3d3d 8%, transparent);
  color: #cc3d3d;
}

@media (hover: hover) {
  .account-action:hover {
    background: color-mix(in srgb, var(--app-text) 4%, transparent);
    color: var(--app-text);
  }

  .account-action--danger:hover {
    background: color-mix(in srgb, #cc3d3d 8%, transparent);
    color: #cc3d3d;
  }
}

.account-action__icon.is-spinning {
  animation: account-action-spin 0.9s linear infinite;
}

@keyframes account-action-spin {
  to {
    transform: rotate(360deg);
  }
}

.account-notice {
  margin: 0 0 10px;
  text-align: center;
  font-size: 12px;
  color: var(--app-text-secondary);
}

.account-notice--success {
  color: #2f9e44;
}

.account-notice--error {
  color: #cc3d3d;
}

.sheet-cancel {
  width: 100%;
  height: 48px;
  margin-top: 4px;
  border: none;
  border-radius: 16px;
  padding: 0 16px;
  background: var(--app-surface-soft);
  color: var(--app-text);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}

.sheet-login-new {
  margin-top: 10px;
  background: var(--app-primary);
  color: var(--app-bg);
}

/* 深色下给主卡加一条极淡描边，避免和面板背景糊在一起 */
html.theme-dark .account-hero {
  border: 1px solid rgba(255, 255, 255, 0.06);
}

/* 仅保留必要的深色语义色，其余颜色全部由 token 自适应 */
html.theme-dark .account-status--ok,
html.theme-dark .account-notice--success {
  color: #4cd964;
}

html.theme-dark .account-status--warn {
  color: #ffb340;
}

html.theme-dark .account-status--error,
html.theme-dark .account-notice--error,
html.theme-dark .account-action--danger {
  color: #ff6961;
}

@media (prefers-reduced-motion: reduce) {
  .account-main,
  .account-action,
  .account-hero__action,
  .account-hero__logout {
    transition: none;
  }

  .account-action__icon.is-spinning,
  .account-hero__icon.is-spinning {
    animation: none;
  }
}

</style>
