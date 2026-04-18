<template>
  <div class="page my-page">
    <main ref="pageBodyRef" class="page-body">
      <section class="hero-section">
        <div class="hero-copy">
          <p class="hero-label">ACCOUNT CENTER</p>
          <h1 class="hero-title">我的</h1>
        </div>
        <div class="hero-actions">
          <button type="button" class="toolbar-settings" aria-label="打开设置" @click="openSettings">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
          </button>
        </div>
      </section>

      <section class="account-hero">
        <div class="account-hero__backdrop" aria-hidden="true" />

        <article class="account-panel">
          <div class="account-panel__main">
            <div class="account-avatar-wrap">
              <img v-if="syncStore.githubAvatarUrl" class="account-avatar" :src="syncStore.githubAvatarUrl" alt="GitHub 头像" />
              <span v-else class="account-avatar account-avatar--placeholder">{{ avatarInitial }}</span>
            </div>

            <div class="account-copy">
              <h1 class="account-name">{{ syncStore.githubLogin || '未连接 GitHub' }}</h1>
              <div class="account-tags">
                <span class="status-pill" :class="syncStore.githubLogin ? 'status-pill--online' : 'status-pill--idle'">
                  {{ syncStore.githubLogin ? '已连接 GitHub' : '未连接 GitHub' }}
                </span>
                <span class="status-pill status-pill--soft">{{ syncStore.githubAuthMethod || '未设置登录方式' }}</span>
                <span class="status-pill status-pill--soft">{{ syncStore.lastSyncedAt ? `上次同步 ${formatTime(syncStore.lastSyncedAt)}` : '尚未同步' }}</span>
              </div>
            </div>
          </div>

          <div class="account-actions">
            <button type="button" class="hero-action hero-action--primary" @click="handleGithubLogin">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 3a9 9 0 1 0 9 9" />
                <path d="M12 12l4.5-4.5" />
                <path d="M12 12h7" />
              </svg>
              <span>{{ syncStore.githubLogin ? '重新登录 GitHub' : '登录 GitHub' }}</span>
            </button>

            <button type="button" class="hero-action" :disabled="!syncStore.githubLogin && !syncStore.token" @click="openLogoutDialog">
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

      <section class="content-grid">
        <section class="content-main">
          <div class="section-head">
            <p class="section-label">Quick Access</p>
            <h2 class="section-title">常用入口</h2>
          </div>

          <div class="shortcut-stack">
            <button type="button" class="shortcut-row shortcut-row--featured" @click="openSync">
              <span class="shortcut-row__icon shortcut-row__icon--sync">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M21.5 2v6h-6" />
                  <path d="M2.5 22v-6h6" />
                  <path d="M2 11.5a10 10 0 0 1 18.8-4.3" />
                  <path d="M22 12.5a10 10 0 0 1-18.8 4.3" />
                </svg>
              </span>
              <span class="shortcut-row__copy">
                <span class="shortcut-row__kicker">Sync</span>
                <span class="shortcut-row__title">云同步</span>
                <span class="shortcut-row__desc">{{ syncSummaryText }}</span>
              </span>
              <span class="shortcut-row__meta">{{ syncStore.githubLogin ? '已连接' : '去登录' }}</span>
            </button>

            <button type="button" class="shortcut-row" @click="openSettings">
              <span class="shortcut-row__icon shortcut-row__icon--settings">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 3v4" />
                  <path d="M12 17v4" />
                  <path d="M4 12h4" />
                  <path d="M16 12h4" />
                  <path d="M12 15a3 3 0 1 0 0-6a3 3 0 0 0 0 6Z" />
                </svg>
              </span>
              <span class="shortcut-row__copy">
                <span class="shortcut-row__kicker">Manage</span>
                <span class="shortcut-row__title">设置</span>
                <span class="shortcut-row__desc">分类、主题、回收站、导入导出和同步配置。</span>
              </span>
              <svg class="shortcut-row__arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>

            <button type="button" class="shortcut-row" @click="openAbout">
              <span class="shortcut-row__icon shortcut-row__icon--about">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 10v6" />
                  <path d="M12 7h.01" />
                </svg>
              </span>
              <span class="shortcut-row__copy">
                <span class="shortcut-row__kicker">App</span>
                <span class="shortcut-row__title">关于应用</span>
                <span class="shortcut-row__desc">版本信息、更新入口和使用说明。</span>
              </span>
              <svg class="shortcut-row__arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          </div>
        </section>

        <aside class="content-side">
          <div class="section-head">
            <p class="section-label">Account Details</p>
            <h2 class="section-title">账号与同步</h2>
          </div>

          <div class="detail-list">
            <div class="detail-row">
              <span class="detail-row__label">GitHub 用户</span>
              <span class="detail-row__value">{{ syncStore.githubLogin || '未登录' }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-row__label">同步令牌</span>
              <span class="detail-row__value detail-row__value--mono">{{ tokenDisplay }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-row__label">授权方式</span>
              <span class="detail-row__value">{{ syncStore.githubAuthMethod || '未设置' }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-row__label">权限范围</span>
              <span class="detail-row__value detail-row__value--mono">{{ syncStore.githubScopes || '未获取' }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-row__label">最近同步</span>
              <span class="detail-row__value">{{ syncStore.lastSyncedAt ? formatTime(syncStore.lastSyncedAt) : '从未同步' }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-row__label">同步状态</span>
              <span class="detail-row__value">{{ syncStore.syncStatus || '待同步' }}</span>
            </div>
          </div>

        </aside>
      </section>
    </main>

    <GithubLoginDialog
      v-model="showLoginDialog"
      @login-success="handleGithubLoginSuccess"
      @toast="showToast"
    />

    <div v-if="showLogoutDialog" class="login-overlay" @click.self="closeLogoutDialog">
      <section class="login-sheet" role="dialog" aria-modal="true" aria-labelledby="logoutSheetTitle">
        <h2 id="logoutSheetTitle" class="login-sheet__title">退出登录</h2>
        <p class="login-sheet__desc">
          退出后会清除当前设备保存的同步令牌和 GitHub 登录信息。
        </p>

        <div class="login-sheet__actions">
          <button type="button" class="login-sheet__button login-sheet__button--primary" @click="confirmLogout">
            确认退出
          </button>
          <button type="button" class="login-sheet__button login-sheet__button--secondary" @click="closeLogoutDialog">
            取消
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, onActivated, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import GithubLoginDialog from '@/components/common/GithubLoginDialog.vue'
import { useGoodsStore } from '@/stores/goods'
import { useEventsStore } from '@/stores/events'
import { usePresetsStore } from '@/stores/presets'
import { useSyncStore } from '@/stores/sync'
import { useRechargeStore } from '@/composables/recharge/useRechargeStore'
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
const goodsStore = useGoodsStore()
const eventsStore = useEventsStore()
const presetsStore = usePresetsStore()
const rechargeStore = useRechargeStore()
const pageBodyRef = ref(null)
const showLoginDialog = ref(false)
const showLogoutDialog = ref(false)

const githubOAuthClientId = getGitHubOAuthClientId()

const collectionCount = computed(() => goodsStore.list.filter((item) => !item?.isWishlist).length)
const wishlistCount = computed(() => goodsStore.list.filter((item) => item?.isWishlist).length)
const eventCount = computed(() => eventsStore.list.length)
const rechargeCount = computed(() => rechargeStore.sortedRecords.value.length)

const avatarInitial = computed(() => (syncStore.githubLogin ? syncStore.githubLogin.slice(0, 1).toUpperCase() : 'G'))
const tokenDisplay = computed(() => {
  if (!syncStore.token) return '未配置'
  const token = syncStore.token
  return `${token.slice(0, 4)}...${token.slice(-4)}`
})

const syncHeadlineText = computed(() => {
  if (syncStore.githubLogin) return '已连接'
  if (syncStore.token) return '已配置'
  return '待登录'
})

const syncSublineText = computed(() => {
  if (syncStore.lastSyncedAt) return `最近同步 ${formatTime(syncStore.lastSyncedAt)}`
  if (syncStore.token) return '同步配置已保存，可继续前往云同步页检查远端数据。'
  return '当前尚未配置同步，建议先完成 GitHub 登录。'
})

const syncSummaryText = computed(() => {
  if (syncStore.lastSyncedAt) return `上次同步 ${formatTime(syncStore.lastSyncedAt)}，可继续查看远端 Gist 和差异。`
  if (syncStore.githubLogin) return '已连接 GitHub，建议完成一次同步以建立远端基线。'
  return '还没有建立同步基线，登录 GitHub 后可在多设备之间同步收藏数据。'
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


function openLogoutDialog() {
  showLogoutDialog.value = true
}

function closeLogoutDialog() {
  showLogoutDialog.value = false
}

function showToast(message) {
  // Simple fallback toast for MyView since we didn't extract a full Vant-like system
  // We can create a simple text element or just ignore if it's less critical.
  // Actually, we can use standard alert for copy text:
  if (message.includes('失败')) {
    console.error(message)
  }
}

async function handleGithubLoginSuccess(user) {
  showToast(`GitHub 登录成功（${user.login}）`)
  showLoginDialog.value = false
}

function handleGithubLogin() {
  showLoginDialog.value = true
}

async function handleLogout() {
  if (!syncStore.githubLogin && !syncStore.token) return
  await syncStore.resetConfig()
  closeLogoutDialog()
}

function confirmLogout() {
  void handleLogout()
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

onActivated(() => {
  resetPageScrollTop()
  window.requestAnimationFrame(resetPageScrollTop)
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
  background:
    radial-gradient(circle at top left, rgba(112, 164, 255, 0.18), transparent 28%),
    radial-gradient(circle at top right, rgba(94, 197, 163, 0.12), transparent 24%),
    var(--app-bg-gradient);
}

.page-body {
  min-height: 100dvh;
  padding: calc(env(safe-area-inset-top) + 20px) 0 calc(132px + env(safe-area-inset-bottom));
  background: transparent;
}

.account-hero,
.overview-strip,
.content-grid,
.hero-section {
  padding: 0 var(--page-padding);
}

.hero-section {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.hero-copy {
  max-width: 320px;
}

.hero-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.hero-label {
  color: var(--app-text-tertiary);
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.hero-title {
  margin-top: 4px;
  color: var(--app-text);
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.04em;
}

.toolbar-settings {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--icon-button-size, 40px);
  height: var(--icon-button-size, 40px);
  border: none;
  border-radius: 50%;
  background: var(--app-glass);
  color: var(--app-text);
  box-shadow: var(--app-shadow);
  transition: transform 0.16s ease, background 0.16s ease;
  flex-shrink: 0;
}

.toolbar-settings svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.toolbar-settings:active {
  transform: scale(0.96);
}

.account-hero {
  margin-top: 20px;
}

.account-panel {
  position: relative;
  display: grid;
  gap: 22px;
  padding: 24px;
  border-radius: 32px;
  overflow: hidden;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--app-surface) 95%, #f4f8ff) 0%, color-mix(in srgb, var(--app-surface) 92%, #eef6f3) 100%);
  box-shadow: var(--app-shadow);
}

.account-hero__backdrop {
  display: none;
}

.account-panel::before,
.account-panel::after {
  content: '';
  position: absolute;
  border-radius: 999px;
  pointer-events: none;
}

.account-panel::before {
  top: -68px;
  right: -44px;
  width: 220px;
  height: 220px;
  background: radial-gradient(circle, rgba(108, 145, 255, 0.24), rgba(108, 145, 255, 0) 72%);
}

.account-panel::after {
  bottom: -110px;
  left: -50px;
  width: 240px;
  height: 240px;
  background: radial-gradient(circle, rgba(79, 192, 154, 0.16), rgba(79, 192, 154, 0) 74%);
}

.account-panel__main,
.account-actions,
.account-copy,
.overview-item,
.shortcut-row,
.summary-tile,
.detail-list,
.insight-panel {
  position: relative;
  z-index: 1;
}

.account-panel__main {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 18px;
  align-items: center;
}

.account-avatar {
  width: 84px;
  height: 84px;
  border-radius: 26px;
  object-fit: cover;
  box-shadow: 0 16px 40px rgba(31, 41, 55, 0.16);
}

.account-avatar--placeholder {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #15161a;
  color: #ffffff;
  font-size: 28px;
  font-weight: 700;
}

.account-copy {
  min-width: 0;
}

.account-eyebrow,
.section-label,
.overview-item__label,
.shortcut-row__kicker,
.summary-tile__label,
.detail-row__label,
.insight-panel__label {
  color: var(--app-text-tertiary);
  font-size: 12px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.account-name,
.section-title,
.shortcut-row__title,
.summary-tile__value,
.insight-panel__title {
  color: var(--app-text);
  letter-spacing: -0.04em;
}

.account-name {
  margin: 6px 0 0;
  font-size: 34px;
  font-weight: 700;
  line-height: 1.05;
}

.overview-item__meta,
.shortcut-row__desc,
.summary-tile__desc,
.detail-row__value {
  color: var(--app-text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.account-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 0 13px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}

.status-pill--online {
  background: rgba(52, 199, 123, 0.12);
  color: #2ea96c;
}

.status-pill--idle {
  background: rgba(255, 162, 0, 0.14);
  color: #cb7b10;
}

.status-pill--soft {
  background: color-mix(in srgb, var(--app-surface-soft) 92%, transparent);
  color: var(--app-text-secondary);
}

.account-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.hero-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 46px;
  padding: 0 16px;
  border: none;
  border-radius: 16px;
  background: color-mix(in srgb, var(--app-surface-soft) 90%, transparent);
  color: var(--app-text);
  font-size: 14px;
  font-weight: 600;
}

.hero-action--primary {
  background: #15161a;
  color: #ffffff;
}

.hero-action:disabled {
  opacity: 0.56;
}

.hero-action svg,
.shortcut-row__icon svg,
.shortcut-row__arrow {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.overview-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-top: 14px;
}

.overview-item {
  padding: 16px 18px 18px;
  border-radius: 24px;
  background: color-mix(in srgb, var(--app-surface) 88%, transparent);
  box-shadow: var(--app-shadow);
}

.overview-item__value {
  margin: 10px 0 4px;
  color: var(--app-text);
  font-size: 34px;
  font-weight: 700;
  letter-spacing: -0.05em;
}

.content-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(280px, 0.9fr);
  gap: 18px;
  margin-top: 18px;
}

.content-main,
.content-side {
  min-width: 0;
}

.section-head {
  margin-bottom: 14px;
}

.section-head--spaced {
  margin-top: 24px;
}

.section-title {
  margin: 6px 0 0;
  font-size: 24px;
  font-weight: 700;
}

.shortcut-stack {
  overflow: hidden;
  border-radius: 28px;
  background: color-mix(in srgb, var(--app-surface) 90%, transparent);
  box-shadow: var(--app-shadow);
}

.shortcut-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 14px;
  align-items: center;
  width: 100%;
  padding: 18px 20px;
  border: none;
  background: transparent;
  text-align: left;
}

.shortcut-row + .shortcut-row {
  border-top: 1px solid color-mix(in srgb, var(--app-text) 8%, transparent);
}

.shortcut-row--featured {
  background: linear-gradient(180deg, color-mix(in srgb, var(--app-surface-soft) 70%, transparent), transparent);
}

.shortcut-row__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 16px;
}

.shortcut-row__icon--sync {
  background: rgba(82, 110, 255, 0.12);
  color: #6173ff;
}

.shortcut-row__icon--settings {
  background: rgba(255, 170, 64, 0.14);
  color: #d68410;
}

.shortcut-row__icon--about {
  background: rgba(68, 150, 255, 0.14);
  color: #3d82ef;
}

.shortcut-row__copy {
  display: grid;
  min-width: 0;
}

.shortcut-row__title {
  margin-top: 2px;
  font-size: 18px;
  font-weight: 700;
}

.shortcut-row__desc {
  margin-top: 4px;
}

.shortcut-row__meta {
  color: var(--app-text-tertiary);
  font-size: 12px;
  font-weight: 600;
}

.shortcut-row__arrow {
  color: var(--app-text-tertiary);
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.summary-tile {
  padding: 18px;
  border-radius: 24px;
  background: color-mix(in srgb, var(--app-surface) 88%, transparent);
  box-shadow: var(--app-shadow);
}

.summary-tile__value {
  margin: 10px 0 8px;
  font-size: 32px;
  font-weight: 700;
}

.summary-tile__value--status {
  font-size: 24px;
}

.detail-list,
.content-side {
  border-radius: 28px;
  background: color-mix(in srgb, var(--app-surface) 90%, transparent);
  box-shadow: var(--app-shadow);
}

.detail-list {
  padding: 8px 20px;
}

.detail-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding: 14px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--app-text) 8%, transparent);
}

.detail-row:last-child {
  border-bottom: none;
}

.detail-row__value {
  color: var(--app-text);
  font-weight: 500;
  text-align: right;
  overflow-wrap: anywhere;
}

.detail-row__value--mono {
  font-family: 'Consolas', 'SFMono-Regular', monospace;
  font-size: 13px;
}

.content-side {
  padding: 0;
  background: transparent;
  box-shadow: none;
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

@media (max-width: 1023px) {
  .overview-strip {
    display: none;
  }

  .content-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 767px) {
  .page-header {
    margin-bottom: 8px;
  }

  .page-body {
    padding-bottom: calc(154px + env(safe-area-inset-bottom));
  }

  .account-panel {
    padding: 20px;
    border-radius: 28px;
  }

  .account-panel__main {
    grid-template-columns: 1fr;
    justify-items: start;
  }

  .account-name {
    font-size: 28px;
  }

  .account-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .account-actions .hero-action {
    min-width: 0;
    padding-inline: 12px;
  }

  .account-actions .hero-action span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .overview-strip,
  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .overview-item,
  .summary-tile {
    min-width: 0;
    padding: 16px;
  }

  .overview-item__value,
  .summary-tile__value {
    font-size: 28px;
  }

  .shortcut-row {
    grid-template-columns: auto minmax(0, 1fr) auto;
    padding: 16px;
  }

  .shortcut-row__meta {
    display: none;
  }

  .detail-row {
    flex-direction: column;
  }

  .detail-row__value {
    text-align: left;
  }
}

@media (min-width: 768px) {
  .login-sheet {
    width: min(100%, 430px);
    margin: 0 auto;
    border-radius: 24px;
  }
}
</style>
