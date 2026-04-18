<template>
  <div class="page my-page">
    <NavBar title="我的" />

    <main ref="pageBodyRef" class="page-body">
      <section class="profile-hero">
        <article class="profile-card">
          <div class="profile-card__top">
            <div class="avatar-wrap">
              <img v-if="syncStore.githubAvatarUrl" class="avatar" :src="syncStore.githubAvatarUrl" alt="GitHub 头像" />
              <span v-else class="avatar avatar--placeholder">{{ avatarInitial }}</span>
            </div>

            <div class="profile-copy">
              <p class="eyebrow">Account Center</p>
              <h1 class="profile-name">{{ syncStore.githubLogin || '未登录 GitHub' }}</h1>
            </div>
          </div>

          <div class="profile-chip-row">
            <span class="status-chip" :class="syncStore.githubLogin ? 'status-chip--success' : 'status-chip--warning'">
              {{ syncStore.githubLogin ? '已连接 GitHub' : '未连接 GitHub' }}
            </span>
            <span class="status-chip status-chip--soft">{{ syncStore.githubAuthMethod || '未设置登录方式' }}</span>
          </div>

          <div class="profile-actions">
            <button type="button" class="action-button action-button--primary" @click="handleGithubLogin">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 3a9 9 0 1 0 9 9" />
                <path d="M12 12l4.5-4.5" />
                <path d="M12 12h7" />
              </svg>
              <span>{{ syncStore.githubLogin ? '重新登录' : '登录 GitHub' }}</span>
            </button>

            <button type="button" class="action-button" :disabled="!syncStore.githubLogin && !syncStore.token" @click="handleLogout">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M10 17l5-5-5-5" />
                <path d="M15 12H3" />
                <path d="M21 4v16" />
              </svg>
              <span>退出登录</span>
            </button>
          </div>
        </article>
      </section>

      <section class="group-section">
        <div class="section-head">
          <p class="section-label">Quick Actions</p>
          <h2 class="section-title">快捷操作</h2>
        </div>

        <article class="list-group">
          <button type="button" class="list-row" @click="openSync">
            <div class="list-row__icon list-row__icon--soft">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M21.5 2v6h-6" />
                <path d="M2.5 22v-6h6" />
                <path d="M2 11.5a10 10 0 0 1 18.8-4.3" />
                <path d="M22 12.5a10 10 0 0 1-18.8 4.3" />
              </svg>
            </div>
            <div class="list-row__copy">
              <h3 class="list-row__title">云同步</h3>
              <p class="list-row__desc">查看同步状态、Gist 和远端数据。</p>
            </div>
            <svg class="list-row__arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>

          <button type="button" class="list-row" @click="openSettings">
            <div class="list-row__icon list-row__icon--soft">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 3v4" />
                <path d="M12 17v4" />
                <path d="M4 12h4" />
                <path d="M16 12h4" />
                <path d="M12 15a3 3 0 1 0 0-6a3 3 0 0 0 0 6Z" />
              </svg>
            </div>
            <div class="list-row__copy">
              <h3 class="list-row__title">设置</h3>
              <p class="list-row__desc">分类、导入导出、主题与数据管理。</p>
            </div>
            <svg class="list-row__arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>

          <button type="button" class="list-row" @click="openAbout">
            <div class="list-row__icon list-row__icon--info">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 10v6" />
                <path d="M12 7h.01" />
              </svg>
            </div>
            <div class="list-row__copy">
              <h3 class="list-row__title">关于应用</h3>
              <p class="list-row__desc">查看版本、更新和反馈入口。</p>
            </div>
            <svg class="list-row__arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </article>
      </section>

      <section class="group-section">
        <div class="section-head">
          <p class="section-label">Account</p>
          <h2 class="section-title">账号信息</h2>
        </div>

        <article class="info-card">
          <div class="info-row">
            <span class="info-label">GitHub 用户</span>
            <span class="info-value">{{ syncStore.githubLogin || '未登录' }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">同步令牌</span>
            <span class="info-value info-value--mono">{{ tokenDisplay }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">授权方式</span>
            <span class="info-value">{{ syncStore.githubAuthMethod || '未设置' }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">权限范围</span>
            <span class="info-value info-value--mono">{{ syncStore.githubScopes || '未获取' }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">最近同步</span>
            <span class="info-value">{{ syncStore.lastSyncedAt ? formatTime(syncStore.lastSyncedAt) : '从未同步' }}</span>
          </div>
          <div class="info-row info-row--last">
            <span class="info-label">GitHub 状态</span>
            <span class="info-value">{{ syncStore.githubLogin ? '已登录' : '待登录' }}</span>
          </div>
        </article>
      </section>
    </main>

    <div v-if="showLoginDialog" class="login-overlay" @click.self="closeLoginDialog">
      <section class="login-sheet" role="dialog" aria-modal="true" aria-labelledby="loginSheetTitle">
        <h2 id="loginSheetTitle" class="login-sheet__title">GitHub 登录</h2>
        <p class="login-sheet__desc">
          重新登录会直接在当前页面发起授权，不会跳转到云同步。
        </p>
        <p v-if="githubLoginStatus" class="login-sheet__status">{{ githubLoginStatus }}</p>
        <p v-if="githubLoginError" class="login-sheet__error">{{ githubLoginError }}</p>

        <div class="login-sheet__actions">
          <button type="button" class="login-sheet__button login-sheet__button--primary" :disabled="isGithubLoginLoading" @click="startGithubLogin">
            {{ isGithubLoginLoading ? '正在登录...' : '开始登录' }}
          </button>
          <button type="button" class="login-sheet__button login-sheet__button--secondary" @click="closeLoginDialog">
            取消
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import NavBar from '@/components/common/NavBar.vue'
import { useSyncStore } from '@/stores/sync'
import {
  fetchGitHubUser,
  getGitHubDeviceFlowScope,
  getGitHubOAuthClientId,
  getGitHubVerificationUrl,
  pollGitHubAccessToken,
  requestGitHubDeviceCode
} from '@/utils/githubAuth'
import { runWithRouteTransition } from '@/utils/routeTransition'
import { scrollToTopAnimated } from '@/utils/scrollToTopAnimated'

defineOptions({ name: 'MyView' })

const router = useRouter()
const syncStore = useSyncStore()
const pageBodyRef = ref(null)
const showLoginDialog = ref(false)
const githubLoginStatus = ref('')
const githubLoginError = ref('')
const isGithubLoginLoading = ref(false)
let githubLoginAbortController = null

const githubOAuthClientId = getGitHubOAuthClientId()

const avatarInitial = computed(() => (syncStore.githubLogin ? syncStore.githubLogin.slice(0, 1).toUpperCase() : 'G'))
const tokenDisplay = computed(() => {
  if (!syncStore.token) return '未配置'
  const token = syncStore.token
  return `${token.slice(0, 4)}...${token.slice(-4)}`
})
const accountMetaText = computed(() => {
  if (syncStore.githubLogin) {
    const parts = []
    if (syncStore.githubAuthMethod) parts.push(`方式：${syncStore.githubAuthMethod}`)
    if (syncStore.githubScopes) parts.push(`范围：${syncStore.githubScopes}`)
    if (syncStore.lastSyncedAt) parts.push(`最近同步：${formatTime(syncStore.lastSyncedAt)}`)
    return parts.length ? parts.join(' · ') : '已完成登录'
  }
  if (syncStore.token) return '已保存同步令牌，可直接进入云同步。'
  return '尚未登录 GitHub，可通过授权登录并同步到多设备。'
})

function resetPageScrollTop() {
  scrollToTopAnimated(() => pageBodyRef.value, 0)
}

function openSync() {
  runWithRouteTransition(() => router.push('/manage/sync'), { direction: 'forward' })
}

function openSettings() {
  runWithRouteTransition(() => router.push('/manage/settings'), { direction: 'forward' })
}

function openAbout() {
  runWithRouteTransition(() => router.push('/manage/about'), { direction: 'forward' })
}

function openLoginDialog() {
  showLoginDialog.value = true
  githubLoginStatus.value = ''
  githubLoginError.value = ''
}

function closeLoginDialog() {
  showLoginDialog.value = false
  githubLoginStatus.value = ''
  githubLoginError.value = ''
  if (githubLoginAbortController) {
    githubLoginAbortController.abort()
    githubLoginAbortController = null
  }
}

async function startGithubLogin() {
  if (isGithubLoginLoading.value) return

  if (!githubOAuthClientId) {
    githubLoginError.value = '未配置 GitHub OAuth Client ID。'
    showLoginDialog.value = true
    return
  }

  const controller = new AbortController()
  githubLoginAbortController = controller
  isGithubLoginLoading.value = true
  githubLoginError.value = ''
  githubLoginStatus.value = '正在向 GitHub 申请设备码...'
  showLoginDialog.value = true

  try {
    const device = await requestGitHubDeviceCode(githubOAuthClientId, getGitHubDeviceFlowScope(), controller.signal)
    githubLoginStatus.value = `请在 GitHub 页面输入验证码 ${device.user_code}`

    const verificationUrl = getGitHubVerificationUrl(device)
    if (verificationUrl) {
      window.open(verificationUrl, '_blank', 'noopener')
    }

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
    closeLoginDialog()
  } catch (error) {
    githubLoginError.value = error?.message || 'GitHub 登录失败'
    githubLoginStatus.value = ''
  } finally {
    isGithubLoginLoading.value = false
    if (githubLoginAbortController === controller) {
      githubLoginAbortController = null
    }
  }
}

function handleGithubLogin() {
  openLoginDialog()
  void startGithubLogin()
}

async function handleLogout() {
  if (!syncStore.githubLogin && !syncStore.token) return
  const confirmed = window.confirm('确认退出登录并清除本地同步配置？')
  if (!confirmed) return
  await syncStore.resetConfig()
}

function formatTime(isoString) {
  if (!isoString) return ''
  const date = new Date(isoString)
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

onMounted(async () => {
  resetPageScrollTop()
  window.requestAnimationFrame(resetPageScrollTop)
  await syncStore.init()
})

onBeforeUnmount(() => {
  if (githubLoginAbortController) {
    githubLoginAbortController.abort()
    githubLoginAbortController = null
  }
})
</script>

<style scoped>
.my-page {
  min-height: 100dvh;
  background: var(--app-bg-gradient);
}

.page-body {
  min-height: 100dvh;
  padding-bottom: 48px;
  background: var(--app-bg-gradient);
}

.profile-hero,
.group-section {
  padding: 0 var(--page-padding);
  margin-top: var(--section-gap);
}

.profile-card,
.list-group,
.info-card {
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
}

.profile-card {
  display: grid;
  gap: 16px;
  padding: 20px;
  border-radius: var(--radius-large);
}

.profile-card__top {
  display: flex;
  align-items: center;
  gap: 14px;
}

.avatar-wrap {
  flex-shrink: 0;
}

.avatar {
  width: 68px;
  height: 68px;
  border-radius: 22px;
  object-fit: cover;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.10);
}

.avatar--placeholder {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--app-text);
  color: var(--app-surface);
  font-size: 24px;
  font-weight: 700;
}

.profile-copy {
  min-width: 0;
}

.eyebrow,
.section-label,
.stat-label,
.info-label {
  color: var(--app-text-tertiary);
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.profile-name,
.section-title,
.list-title {
  color: var(--app-text);
  letter-spacing: -0.04em;
}

.profile-name {
  margin-top: 6px;
  font-size: 28px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-desc,
.stat-desc,
.list-desc,
.info-value {
  color: var(--app-text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.profile-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.status-chip {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}

.status-chip--success {
  background: rgba(40, 200, 128, 0.12);
  color: #28c880;
}

.status-chip--warning {
  background: rgba(255, 162, 0, 0.12);
  color: #d07a0b;
}

.status-chip--soft {
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
}

.profile-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.action-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 14px;
  border: none;
  border-radius: 14px;
  background: var(--app-surface-soft);
  color: var(--app-text);
  font-size: 14px;
  font-weight: 600;
}

.action-button--primary {
  background: var(--app-text);
  color: var(--app-surface);
}

.action-button:disabled {
  opacity: 0.56;
}

.action-button svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.section-head {
  margin-bottom: 14px;
}

.section-title {
  margin-top: 6px;
  font-size: 22px;
  font-weight: 600;
}

.stats-grid {
  display: grid;
  gap: 12px;
}

.stat-card {
  padding: 16px 18px;
  border-radius: var(--radius-card);
}

.stat-value {
  margin-top: 8px;
  color: var(--app-text);
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.04em;
}

.stat-value--small {
  font-size: 18px;
}

.stat-value--mono,
.info-value--mono {
  font-family: 'Consolas', 'SFMono-Regular', monospace;
  font-size: 13px;
}

.action-list {
  display: grid;
  gap: 12px;
}

.list-card {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 16px 18px;
  border: none;
  border-radius: var(--radius-card);
  text-align: left;
}

.list-card--accent {
  background: color-mix(in srgb, var(--app-text) 6%, var(--app-surface));
}

.list-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  border-radius: 16px;
}

.list-icon svg {
  width: 20px;
  height: 20px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.list-icon--sync {
  background: rgba(40, 200, 128, 0.10);
  color: #28c880;
}

.list-icon--soft {
  background: rgba(120, 100, 255, 0.10);
  color: #7864ff;
}

.list-icon--info {
  background: rgba(255, 162, 0, 0.12);
  color: #d07a0b;
}

.list-copy {
  min-width: 0;
  flex: 1;
}

.list-title {
  font-size: 17px;
  font-weight: 600;
}

.list-desc {
  margin-top: 4px;
}

.list-arrow {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  stroke: var(--app-text-tertiary);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.info-card {
  padding: 18px;
  border-radius: var(--radius-large);
}

.info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--app-text) 8%, transparent);
}

.info-row--last {
  border-bottom: none;
  padding-bottom: 0;
}

.info-value {
  color: var(--app-text);
  font-weight: 500;
  text-align: right;
  overflow-wrap: anywhere;
}

.list-group {
  overflow: hidden;
  border-radius: var(--radius-large);
}

.list-row {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 16px 18px;
  border: none;
  background: transparent;
  text-align: left;
}

.list-row + .list-row {
  border-top: 1px solid color-mix(in srgb, var(--app-text) 8%, transparent);
}

.list-row__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  border-radius: 16px;
}

.list-row__icon svg {
  width: 20px;
  height: 20px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.list-row__icon--primary {
  background: rgba(40, 200, 128, 0.10);
  color: #28c880;
}

.list-row__icon--soft {
  background: rgba(120, 100, 255, 0.10);
  color: #7864ff;
}

.list-row__icon--info {
  background: rgba(255, 162, 0, 0.12);
  color: #d07a0b;
}

.list-row__copy {
  min-width: 0;
  flex: 1;
}

.list-row__title {
  color: var(--app-text);
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.04em;
}

.list-row__desc {
  margin-top: 4px;
  color: var(--app-text-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.list-row__arrow {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  stroke: var(--app-text-tertiary);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.login-overlay {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: flex-end;
  background: rgba(20, 20, 22, 0.28);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.login-sheet {
  width: 100%;
  padding: 20px 18px calc(env(safe-area-inset-bottom) + 18px);
  border-radius: 24px 24px 0 0;
  background: var(--app-surface);
  box-shadow: 0 -10px 28px rgba(0, 0, 0, 0.12);
}

.login-sheet__title {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.03em;
  color: var(--app-text);
}

.login-sheet__desc,
.login-sheet__status {
  margin-top: 8px;
  color: var(--app-text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.login-sheet__status {
  color: var(--app-text);
}

.login-sheet__error {
  margin-top: 10px;
  color: #d93025;
  font-size: 13px;
  line-height: 1.5;
}

.login-sheet__actions {
  display: grid;
  gap: 10px;
  margin-top: 18px;
}

.login-sheet__button {
  min-height: 48px;
  border: none;
  border-radius: 16px;
  font-size: 15px;
  font-weight: 600;
}

.login-sheet__button--primary {
  background: var(--app-text);
  color: var(--app-surface);
}

.login-sheet__button--secondary {
  background: var(--app-surface-soft);
  color: var(--app-text);
}

.login-sheet__button:disabled {
  opacity: 0.56;
}

@media (min-width: 768px) {
  .profile-actions {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .login-sheet {
    width: min(100%, 430px);
    margin: 0 auto;
    border-radius: 24px;
  }
}

@media (max-width: 767px) {
  .profile-card__top,
  .info-row {
    align-items: flex-start;
  }

  .profile-card__top,
  .info-row {
    flex-direction: column;
  }

  .profile-name {
    white-space: normal;
  }

  .profile-actions {
    grid-template-columns: 1fr 1fr;
  }

  .info-value {
    text-align: left;
  }

  .list-row {
    align-items: center;
    min-height: 76px;
    padding: 14px 16px;
  }

  .list-row__copy {
    flex: 1;
  }

  .list-row__arrow {
    align-self: center;
  }
}
</style>
