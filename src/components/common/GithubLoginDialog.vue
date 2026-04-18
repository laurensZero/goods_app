<template>
  <Transition name="overlay-fade">
    <div v-if="modelValue" class="overlay" @click.self="closeDialog">
      <div class="dialog dialog--wide dialog--scrollable">
        <div class="dialog-scroll">
          <h3 class="dialog-title">GitHub 授权登录</h3>
          <p class="dialog-desc">使用 Device Flow 完成授权。授权成功后会自动保存访问令牌，并同步当前 GitHub 账号信息。</p>

          <div v-if="githubLoginStatus" class="dialog-success">{{ githubLoginStatus }}</div>
          <div v-if="githubLoginError" class="dialog-error">{{ githubLoginError }}</div>

          <article v-if="githubDeviceInfo" class="panel-card" style="margin-top: 16px;">
            <div class="detail-list">
              <div class="detail-row">
                <span class="detail-label">验证码</span>
                <span class="detail-value detail-value--mono">{{ githubDeviceInfo.user_code }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">授权地址</span>
                <span class="detail-value detail-value--mono">{{ githubVerificationUrl }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">有效期</span>
                <span class="detail-value">{{ githubDeviceExpiresText }}</span>
              </div>
              <div class="detail-row detail-row--last">
                <span class="detail-label">权限范围</span>
                <span class="detail-value">{{ githubDeviceScope }}</span>
              </div>
            </div>
          </article>

          <div class="dialog-actions dialog-actions--wrap" style="margin-top: 16px;">
            <button class="dialog-btn dialog-btn--secondary" :disabled="!githubDeviceInfo" @click="copyText(githubDeviceInfo?.user_code || '')">复制验证码</button>
            <button class="dialog-btn dialog-btn--secondary" :disabled="!githubVerificationUrl" @click="openGithubVerificationPage">打开授权页</button>
          </div>
          <div class="dialog-actions dialog-actions--wrap">
            <button class="dialog-btn dialog-btn--secondary" @click="closeDialog">取消</button>
            <button
              class="dialog-btn dialog-btn--primary"
              :disabled="isRequestingGithubDeviceCode || isPollingGithubLogin || !githubOAuthClientId"
              @click="handleStartGithubLogin"
            >
              {{ isRequestingGithubDeviceCode ? '申请设备码...' : isPollingGithubLogin ? '等待授权中...' : '开始授权' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useSyncStore } from '@/stores/sync'
import {
  fetchGitHubUser,
  getGitHubDeviceFlowScope,
  getGitHubOAuthClientId,
  getGitHubVerificationUrl,
  pollGitHubAccessToken,
  requestGitHubDeviceCode
} from '@/utils/githubAuth'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue', 'login-success', 'toast'])

const syncStore = useSyncStore()

const githubOAuthClientId = getGitHubOAuthClientId()
const githubDeviceScope = getGitHubDeviceFlowScope()

const githubLoginStatus = ref('')
const githubLoginError = ref('')
const githubDeviceInfo = ref(null)
const isRequestingGithubDeviceCode = ref(false)
const isPollingGithubLogin = ref(false)

let githubLoginAbortController = null

const githubVerificationUrl = computed(() => githubDeviceInfo.value?.verification_uri || getGitHubVerificationUrl())

const githubDeviceExpiresText = computed(() => {
  if (!githubDeviceInfo.value?.expires_in) return ''
  const minutes = Math.floor(githubDeviceInfo.value.expires_in / 60)
  return `${minutes} 分钟`
})

function closeDialog() {
  emit('update:modelValue', false)
  if (githubLoginAbortController) {
    githubLoginAbortController.abort()
    githubLoginAbortController = null
  }
  resetGithubLoginState()
}

function resetGithubLoginState() {
  githubLoginStatus.value = ''
  githubLoginError.value = ''
  githubDeviceInfo.value = null
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
    emit('toast', '已复制验证码', 2000)
  } catch (err) {
    console.error('复制失败', err)
    emit('toast', '复制失败: ' + err.message, 2000)
  }
}

watch(() => props.modelValue, (newVal) => {
  if (newVal) {
    resetGithubLoginState()
    if (!githubOAuthClientId) {
      githubLoginError.value = '未配置 GitHub OAuth Client ID，请先设置 VITE_GITHUB_OAUTH_CLIENT_ID。'
    }
  }
})

async function handleStartGithubLogin() {
  if (isRequestingGithubDeviceCode.value || isPollingGithubLogin.value) return
  if (!githubOAuthClientId) {
    githubLoginError.value = '未配置 GitHub OAuth Client ID，请先设置 VITE_GITHUB_OAUTH_CLIENT_ID。'
    return
  }

  githubLoginError.value = ''
  githubLoginStatus.value = '正在向 GitHub 申请设备码...'
  githubDeviceInfo.value = null
  isRequestingGithubDeviceCode.value = true

  const controller = new AbortController()
  githubLoginAbortController = controller

  try {
    const device = await requestGitHubDeviceCode(githubOAuthClientId, githubDeviceScope, controller.signal)
    githubDeviceInfo.value = device
    githubLoginStatus.value = `请将验证码 ${device.user_code} 填入授权页面`

    const verificationUrl = githubVerificationUrl.value
    if (verificationUrl) {
      window.open(verificationUrl, '_blank', 'noopener')
    }

    isPollingGithubLogin.value = true
    githubLoginStatus.value = '等待你在 GitHub 完成授权...'

    const token = await pollGitHubAccessToken({
      clientId: githubOAuthClientId,
      deviceCode: device.device_code,
      interval: Number(device.interval) || 5,
      expiresIn: Number(device.expires_in) || 900,
      signal: controller.signal
    })

    githubLoginStatus.value = '正在验证 GitHub 账号...'
    const user = await fetchGitHubUser(token.access_token, controller.signal)

    await syncStore.saveToken(token.access_token, {
      login: user.login,
      avatarUrl: user.avatar_url,
      scopes: token.scope,
      authMethod: 'device-flow'
    })

    await syncStore.init()

    emit('login-success', user)
    closeDialog()
  } catch (error) {
    githubLoginError.value = error?.message || 'GitHub 登录失败'
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
  if (githubLoginAbortController) {
    githubLoginAbortController.abort()
    githubLoginAbortController = null
  }
})
</script>

<style scoped>
/* Scoped styles might be required if any specific dialog styles are not global. In SyncView they are in `.dialog-`.
Assuming .dialog and .overlay are global. If not, we might need to copy them or let SyncView provide them globally. */
</style>
