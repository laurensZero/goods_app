<template>
  <Transition name="overlay-fade">
    <div v-if="modelValue" class="overlay" @click.self="closeDialog">
      <div class="dialog dialog--wide dialog--scrollable">
        <div class="dialog-scroll">
          <h3 class="dialog-title">{{ t('sync.githubLoginTitle') }}</h3>
          <p class="dialog-desc">{{ t('sync.githubLoginDesc') }}</p>

          <div v-if="githubLoginStatus" class="dialog-success">{{ githubLoginStatus }}</div>
          <div v-if="githubLoginError" class="dialog-error">{{ githubLoginError }}</div>

          <article v-if="githubDeviceInfo" class="panel-card" style="margin-top: 16px;">
            <div class="detail-list">
              <div class="detail-row">
                <span class="detail-label">{{ t('sync.deviceCode') }}</span>
                <span class="detail-value detail-value--mono">{{ githubDeviceInfo.user_code }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">{{ t('sync.authUrl') }}</span>
                <span class="detail-value detail-value--mono">{{ githubVerificationUrl }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">{{ t('sync.countdown') }}</span>
                <span class="detail-value detail-value--countdown">{{ githubDeviceCountdownText }}</span>
              </div>
              <div class="detail-row detail-row--last">
                <span class="detail-label">{{ t('sync.scope') }}</span>
                <span class="detail-value">{{ githubDeviceScope }}</span>
              </div>
            </div>
          </article>

          <div class="dialog-actions dialog-actions--wrap" style="margin-top: 16px;">
            <button class="dialog-btn dialog-btn--secondary" :disabled="!githubDeviceInfo" @click="copyText(githubDeviceInfo?.user_code || '')">{{ t('sync.copyCode') }}</button>
            <button class="dialog-btn dialog-btn--secondary" :disabled="!githubVerificationUrl" @click="openGithubVerificationPage">{{ t('sync.openAuthPage') }}</button>
          </div>
          <div class="dialog-actions dialog-actions--wrap">
            <button class="dialog-btn dialog-btn--secondary" @click="closeDialog">{{ t('theme.cancel') }}</button>
            <button
              class="dialog-btn dialog-btn--primary"
              :disabled="isRequestingGithubDeviceCode || isPollingGithubLogin || !githubOAuthClientId"
              @click="handleStartGithubLogin"
            >
              {{ isRequestingGithubDeviceCode ? t('sync.requestingDeviceCode') : isPollingGithubLogin ? t('sync.waitingForAuth') : t('sync.startAuth') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSyncStore } from '@/stores/sync'
import {
  fetchGitHubUser,
  getGitHubDeviceFlowScope,
  getGitHubOAuthClientId,
  getGitHubVerificationUrl,
  pollGitHubAccessToken,
  requestGitHubDeviceCode
} from '@/utils/github/auth'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue', 'login-success', 'toast'])

const { t } = useI18n()
const syncStore = useSyncStore()

const githubOAuthClientId = getGitHubOAuthClientId()
const githubDeviceScope = getGitHubDeviceFlowScope()

const githubLoginStatus = ref('')
const githubLoginError = ref('')
const githubDeviceInfo = ref(null)
const githubDeviceCountdownSeconds = ref(0)
const isRequestingGithubDeviceCode = ref(false)
const isPollingGithubLogin = ref(false)

let githubLoginAbortController = null
let githubDeviceCountdownTimer = null

const githubVerificationUrl = computed(() => githubDeviceInfo.value?.verification_uri || getGitHubVerificationUrl())

const githubDeviceCountdownText = computed(() => {
  if (!githubDeviceInfo.value) return ''
  if (githubDeviceCountdownSeconds.value <= 0) return t('sync.expired')

  const totalSeconds = githubDeviceCountdownSeconds.value
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
})

function stopGithubDeviceCountdown() {
  if (githubDeviceCountdownTimer) {
    clearInterval(githubDeviceCountdownTimer)
    githubDeviceCountdownTimer = null
  }
}

function startGithubDeviceCountdown(expiresInSeconds) {
  stopGithubDeviceCountdown()

  const totalSeconds = Math.max(0, Math.floor(Number(expiresInSeconds) || 0))
  githubDeviceCountdownSeconds.value = totalSeconds

  if (totalSeconds <= 0) return

  githubDeviceCountdownTimer = setInterval(() => {
    githubDeviceCountdownSeconds.value = Math.max(0, githubDeviceCountdownSeconds.value - 1)

    if (githubDeviceCountdownSeconds.value <= 0) {
      stopGithubDeviceCountdown()
      githubLoginStatus.value = t('sync.codeExpiredStatus')
      if (!githubLoginError.value) {
        githubLoginError.value = t('sync.codeExpiredError')
      }
    }
  }, 1000)
}

function closeDialog() {
  emit('update:modelValue', false)
  if (githubLoginAbortController) {
    githubLoginAbortController.abort()
    githubLoginAbortController = null
  }
  resetGithubLoginState()
}

function resetGithubLoginState() {
  stopGithubDeviceCountdown()
  githubLoginStatus.value = ''
  githubLoginError.value = ''
  githubDeviceInfo.value = null
  githubDeviceCountdownSeconds.value = 0
  isRequestingGithubDeviceCode.value = false
  isPollingGithubLogin.value = false
}

function openGithubVerificationPage() {
  const url = githubVerificationUrl.value
  if (!url) return
  window.open(url, '_blank', 'noopener')
}

// Fallback logic for copyText instead of showToast 
async function copyText(text) {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    emit('toast', t('sync.codeCopied'), 2000)
  } catch (err) {
    console.error('Copy failed', err)
    emit('toast', t('sync.copyFailed') + ': ' + err.message, 2000)
  }
}

watch(() => props.modelValue, (newVal) => {
  if (newVal) {
    resetGithubLoginState()
    if (!githubOAuthClientId) {
      githubLoginError.value = t('sync.githubOAuthNotConfigured')
    }
  }
})

async function handleStartGithubLogin() {
  if (isRequestingGithubDeviceCode.value || isPollingGithubLogin.value) return
  if (!githubOAuthClientId) {
    githubLoginError.value = t('sync.githubOAuthNotConfigured')
    return
  }

  githubLoginError.value = ''
  githubLoginStatus.value = t('sync.requestingDeviceCodeStatus')
  githubDeviceInfo.value = null
  isRequestingGithubDeviceCode.value = true

  const controller = new AbortController()
  githubLoginAbortController = controller

  try {
    const device = await requestGitHubDeviceCode(githubOAuthClientId, githubDeviceScope, controller.signal)
    githubDeviceInfo.value = device
    startGithubDeviceCountdown(device.expires_in)
    githubLoginStatus.value = t('sync.fillCode', { code: device.user_code })

    const verificationUrl = githubVerificationUrl.value
    if (verificationUrl) {
      window.open(verificationUrl, '_blank', 'noopener')
    }

    isPollingGithubLogin.value = true
    githubLoginStatus.value = t('sync.waitingForAuthStatus')

    const token = await pollGitHubAccessToken({
      clientId: githubOAuthClientId,
      deviceCode: device.device_code,
      interval: Number(device.interval) || 5,
      expiresIn: Number(device.expires_in) || 900,
      signal: controller.signal
    })

    githubLoginStatus.value = t('sync.verifyingAccount')
    const user = await fetchGitHubUser(token.access_token, controller.signal)

    await syncStore.saveToken(token.access_token, {
      login: user.login,
      userId: String(user.id),
      avatarUrl: user.avatar_url,
      scopes: token.scope,
      authMethod: 'device-flow'
    })

    await syncStore.init()

    emit('login-success', user)
    closeDialog()
  } catch (error) {
    githubLoginError.value = error?.message || t('sync.loginFailed')
    githubLoginStatus.value = ''
  } finally {
    isRequestingGithubDeviceCode.value = false
    isPollingGithubLogin.value = false
    if (githubLoginAbortController === controller) {
      githubLoginAbortController = null
    }
  }
}

onBeforeUnmount(() => {
  stopGithubDeviceCountdown()
  if (githubLoginAbortController) {
    githubLoginAbortController.abort()
    githubLoginAbortController = null
  }
})
</script>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  padding-bottom: calc(24px + env(safe-area-inset-bottom));
  background: rgba(14, 18, 28, 0.38);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.dialog {
  width: min(100%, 420px);
  padding: 24px;
  overflow: hidden;
  border-radius: var(--radius-large);
  border: 1px solid var(--app-glass-border);
  background: var(--app-glass-strong);
  box-shadow: var(--app-shadow);
  backdrop-filter: blur(24px) saturate(140%);
  -webkit-backdrop-filter: blur(24px) saturate(140%);
}

.dialog--scrollable {
  display: flex;
  flex-direction: column;
  max-height: min(calc(100dvh - 48px), 720px);
}

.dialog--wide {
  width: min(100%, 520px);
}

.dialog-scroll {
  min-height: 0;
  overflow-y: auto;
  padding-bottom: 12px;
  padding-right: 6px;
  margin-right: -6px;
}

.dialog-title {
  margin: 0 0 8px;
  color: var(--app-text);
  font-size: 19px;
  font-weight: 600;
  letter-spacing: -0.03em;
}

.dialog-desc {
  margin: 0 0 16px;
}

.dialog-desc code {
  padding: 2px 6px;
  border-radius: 6px;
  background: var(--app-surface-soft);
  font-size: 13px;
}

.dialog-desc a {
  color: var(--app-text);
  text-decoration: underline;
}

.dialog-error {
  margin-top: 8px;
  color: #c74444;
  font-size: 13px;
}

.dialog-success {
  margin-top: 8px;
  color: #28c880;
  font-size: 13px;
}

.dialog-actions {
  display: flex;
  /* use explicit row/column gaps so we can tune vertical spacing separately */
  column-gap: 10px;
  row-gap: 8px;
  justify-content: flex-end;
  margin-top: 12px;
  flex-shrink: 0;
}

.dialog-actions--wrap {
  flex-wrap: wrap;
}

.dialog-actions--wrap .dialog-btn {
  flex: 1 1 160px;
}

.dialog-btn {
  min-height: 42px;
  padding: 0 18px;
  border: none;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.dialog-btn--secondary {
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
}

.dialog-btn--primary {
  background: var(--app-text);
  color: var(--app-bg);
}

.dialog-btn:disabled {
  opacity: 0.56;
  cursor: not-allowed;
}

.panel-card {
  padding: 18px;
  border-radius: var(--radius-large);
  background: var(--app-surface-soft);
}

.detail-list {
  display: flex;
  flex-direction: column;
}

.detail-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--app-text) 8%, transparent);
}

.detail-row--last {
  border-bottom: none;
  padding-bottom: 0;
}

.detail-label {
  flex-shrink: 0;
  color: var(--app-text-secondary);
  font-size: 13px;
}

.detail-value {
  color: var(--app-text);
  font-weight: 500;
  text-align: right;
  font-size: 13px;
  overflow-wrap: anywhere;
}

.detail-value--countdown {
  min-width: 64px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}

.detail-value--mono {
  font-family: 'Consolas', 'SFMono-Regular', monospace;
  letter-spacing: -0.01em;
}

.overlay-fade-enter-active,
.overlay-fade-leave-active {
  transition: opacity 0.25s ease;
}

.overlay-fade-enter-active .dialog,
.overlay-fade-leave-active .dialog {
  transition: transform 0.25s ease;
}

.overlay-fade-enter-from,
.overlay-fade-leave-to {
  opacity: 0;
}

.overlay-fade-enter-from .dialog,
.overlay-fade-leave-to .dialog {
  transform: scale(0.95) translateY(8px);
}

@media (max-width: 767px) {
  .overlay {
    align-items: flex-end;
    padding: 16px;
    padding-bottom: calc(var(--tabbar-height) + 24px + env(safe-area-inset-bottom));
  }

  .dialog {
    width: min(100%, 100%);
    padding: 20px;
    border-bottom-left-radius: 28px;
    border-bottom-right-radius: 28px;
  }

  .dialog--scrollable {
    max-height: min(calc(100dvh - var(--tabbar-height) - 48px - env(safe-area-inset-bottom)), 78vh);
  }

  .detail-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .detail-value {
    text-align: left;
  }

  .dialog-actions {
    flex-direction: row;
    justify-content: stretch;
    margin-inline: -20px;
    padding: 14px 20px calc(4px + max(env(safe-area-inset-bottom), 0px));
    row-gap: 6px;
  }

  .dialog-actions + .dialog-actions {
    margin-top: 4px;
  }

  .dialog-actions .dialog-btn {
    flex: 1 1 0;
    min-width: 0;
  }
}
</style>
