<template>
  <div class="page my-page">
    <main ref="pageBodyRef" class="page-body">
      <section class="hero-section">
        <div class="hero-copy">
          <p class="hero-label">ACCOUNT CENTER</p>
          <h1 class="hero-title">{{ t('nav.my') }}</h1>
        </div>
        <div class="hero-actions">
          <button type="button" class="toolbar-scan" :aria-label="t('my.scanImport')" :disabled="scanning" @click="openScanner">
            <span v-if="scanning" class="toolbar-scan-spinner" />
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect width="6" height="6" x="3" y="3" rx="1" />
              <rect width="6" height="6" x="15" y="3" rx="1" />
              <rect width="6" height="6" x="3" y="15" rx="1" />
              <path d="M21 15v3a2 2 0 0 1-2 2h-3" />
              <path d="M21 21v.01" />
              <path d="M12 7v3a2 2 0 0 1-2 2H7" />
              <path d="M3 12h.01" />
              <path d="M12 3h.01" />
              <path d="M12 16v.01" />
              <path d="M16 12h1" />
              <path d="M21 12v.01" />
              <path d="M12 21v-1" />
            </svg>
          </button>
          <button type="button" class="toolbar-settings" :aria-label="t('my.openSettings')" @click="openSettings">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
          </button>
        </div>
        <p v-if="scanError" class="scan-toast" role="alert">{{ scanError }}</p>
      </section>

      <section class="account-hero">
        <div class="account-hero__backdrop" aria-hidden="true" />

        <article class="account-panel">
          <div class="account-panel__main">
            <div class="account-avatar-wrap">
              <img v-if="syncStore.githubAvatarUrl" class="account-avatar" :src="syncStore.githubAvatarUrl" :alt="t('my.githubAvatar')" />
              <span v-else class="account-avatar account-avatar--placeholder">{{ avatarInitial }}</span>
            </div>

            <div class="account-copy">
              <h1 class="account-name">{{ syncStore.githubLogin || t('my.notConnected') }}</h1>
              <div class="account-tags">
                <span class="status-pill" :class="syncStore.githubLogin ? 'status-pill--online' : 'status-pill--idle'">
                  {{ syncStore.githubLogin ? t('my.connected') : t('my.notConnected') }}
                </span>
                <span v-if="showAuthMethod" class="status-pill status-pill--soft">{{ syncStore.githubAuthMethod || t('my.noAuthMethod') }}</span>
                <span class="status-pill status-pill--soft">{{ syncStore.lastSyncedAt ? t('my.lastSync', { time: formatTime(syncStore.lastSyncedAt) }) : t('my.neverSynced') }}</span>
              </div>
            </div>

            <div class="account-actions">
              <button type="button" class="hero-action hero-action--primary" @click="handleGithubLogin">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 3a9 9 0 1 0 9 9" />
                  <path d="M12 12l4.5-4.5" />
                  <path d="M12 12h7" />
                </svg>
                <span>{{ syncStore.githubLogin ? t('my.relogin') : t('my.login') }}</span>
              </button>

              <button type="button" class="hero-action" :disabled="!syncStore.githubLogin && !syncStore.token" @click="openLogoutDialog">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M10 17l5-5-5-5" />
                  <path d="M15 12H3" />
                  <path d="M21 4v16" />
                </svg>
                <span>{{ t('my.logout') }}</span>
              </button>
            </div>

            <article class="budget-compact">
              <div class="budget-compact__head">
                <div>
                  <p class="budget-compact__label">Budget Watch</p>
                  <h2 class="budget-compact__title">{{ t('my.budgetTitle') }}</h2>
                </div>
                <button type="button" class="budget-settings-btn" @click="openBudgetDialog">{{ t('my.settings') }}</button>
              </div>

              <div class="budget-compact__item">
                <div class="budget-compact__meta">
                  <span>{{ t('my.monthly') }}</span>
                  <strong>{{ currentPeriodLabel }}</strong>
                  <span class="budget-compact__percent" :class="{ 'budget-compact__percent--over': monthlyBudgetProgress.isOverBudget }">
                    {{ monthlyBudgetProgress.hasBudget ? `${monthlyBudgetProgress.percent.toFixed(0)}%` : t('my.notSet') }}
                  </span>
                </div>
                <div class="budget-progress budget-progress--compact" role="progressbar" :aria-valuenow="monthlyBudgetProgress.percent" aria-valuemin="0" aria-valuemax="100">
                  <span class="budget-progress__bar" :class="{ 'budget-progress__bar--over': monthlyBudgetProgress.isOverBudget }" :style="{ width: `${monthlyBudgetProgress.clampedPercent}%` }" />
                  <span v-if="monthlyBudgetProgress.overPercent > 0" class="budget-progress__overflow" :style="{ width: `${monthlyBudgetProgress.overPercent}%` }" />
                </div>
                <div class="budget-compact__foot">{{ formatPrice(monthlyBudgetProgress.spent) }} / {{ monthlyBudgetProgress.hasBudget ? formatPrice(monthlyBudgetProgress.budget) : t('my.notSetFull') }}</div>
              </div>

              <div class="budget-compact__item">
                <div class="budget-compact__meta">
                  <span>{{ t('my.yearly') }}</span>
                  <strong>{{ currentYearLabel }}</strong>
                  <span class="budget-compact__percent" :class="{ 'budget-compact__percent--over': yearlyBudgetProgress.isOverBudget }">
                    {{ yearlyBudgetProgress.hasBudget ? `${yearlyBudgetProgress.percent.toFixed(0)}%` : t('my.notSet') }}
                  </span>
                </div>
                <div class="budget-progress budget-progress--compact" role="progressbar" :aria-valuenow="yearlyBudgetProgress.percent" aria-valuemin="0" aria-valuemax="100">
                  <span class="budget-progress__bar" :class="{ 'budget-progress__bar--over': yearlyBudgetProgress.isOverBudget }" :style="{ width: `${yearlyBudgetProgress.clampedPercent}%` }" />
                  <span v-if="yearlyBudgetProgress.overPercent > 0" class="budget-progress__overflow" :style="{ width: `${yearlyBudgetProgress.overPercent}%` }" />
                </div>
                <div class="budget-compact__foot">{{ formatPrice(yearlyBudgetProgress.spent) }} / {{ yearlyBudgetProgress.hasBudget ? formatPrice(yearlyBudgetProgress.budget) : t('my.notSetFull') }}</div>
              </div>
            </article>
          </div>
        </article>
      </section>

      <section class="content-grid">
        <section class="content-main">
          <div class="section-head">
            <p class="section-label">Quick Access</p>
            <h2 class="section-title">{{ t('my.quickAccess') }}</h2>
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
                <span class="shortcut-row__title">{{ t('my.cloudSync') }}</span>
                <span class="shortcut-row__desc">{{ syncSummaryText }}</span>
              </span>
              <span class="shortcut-row__meta">{{ syncStore.githubLogin ? t('my.connectedShort') : t('my.gotoLogin') }}</span>
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
                <span class="shortcut-row__title">{{ t('my.settings') }}</span>
                <span class="shortcut-row__desc">{{ t('my.settingsDesc') }}</span>
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
                <span class="shortcut-row__title">{{ t('my.aboutApp') }}</span>
                <span class="shortcut-row__desc">{{ t('my.aboutDesc') }}</span>
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
            <h2 class="section-title">{{ t('my.accountSync') }}</h2>
          </div>

          <div class="detail-list">
            <div class="detail-row">
              <span class="detail-row__label">{{ t('my.githubUser') }}</span>
              <span class="detail-row__value">{{ syncStore.githubLogin || t('my.notLoggedIn') }}</span>
            </div>
            <div v-if="!isUsingGithubLogin" class="detail-row">
              <span class="detail-row__label">{{ t('my.syncToken') }}</span>
              <span class="detail-row__value detail-row__value--mono">{{ tokenDisplay }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-row__label">{{ t('my.authMethod') }}</span>
              <span class="detail-row__value">{{ syncStore.githubAuthMethod || t('my.notSetFull') }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-row__label">{{ t('my.scopes') }}</span>
              <span class="detail-row__value detail-row__value--mono">{{ syncStore.githubScopes || t('my.notObtained') }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-row__label">{{ t('my.recentSync') }}</span>
              <span class="detail-row__value">{{ syncStore.lastSyncedAt ? formatTime(syncStore.lastSyncedAt) : t('my.neverSyncedDetail') }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-row__label">{{ t('my.syncStatus') }}</span>
              <span class="detail-row__value">{{ syncStore.syncStatus || (syncStore.githubLogin ? t('my.ready') : t('my.unprocessed')) }}</span>
            </div>
            <div class="detail-row detail-row--clickable" @click="refreshExchangeRates">
              <span class="detail-row__label">{{ t('my.exchangeRateUpdate') }}</span>
              <span class="detail-row__value" :class="{ 'detail-row__value--error': exchangeRateStore.error }">
                <template v-if="exchangeRateStore.loading">{{ t('my.updating') }}</template>
                <template v-else-if="exchangeRateStore.error">{{ exchangeRateStore.error }}</template>
                <template v-else>{{ exchangeRateLastUpdatedText }}</template>
              </span>
            </div>
          </div>

        </aside>
      </section>
    </main>

    <QrScannerOverlay
      v-model="showScanner"
      :scanner-ready="scannerReady"
      :scanner-hint="scannerHint"
      :video-ref="(el) => { scannerVideoRef = el }"
      :canvas-ref="(el) => { scannerCanvasRef = el }"
      @close="closeScanner"
      @gallery-pick="handleScannerGallery"
      @video-ready="onScannerVideoReady"
    />

    <GithubLoginDialog
      v-model="showLoginDialog"
      @login-success="handleGithubLoginSuccess"
      @toast="showToast"
    />

    <Teleport to="body">
      <Transition name="budget-sheet-pop">
        <div v-if="showBudgetDialog" class="login-overlay budget-overlay" @click.self="closeBudgetDialog">
          <section class="login-sheet budget-sheet" role="dialog" aria-modal="true" aria-labelledby="budgetSheetTitle">
            <h2 id="budgetSheetTitle" class="login-sheet__title">{{ t('my.setBudget') }}</h2>
            <p class="login-sheet__desc">{{ t('my.budgetDesc') }}</p>

            <div class="budget-sheet__fields">
              <label class="budget-input-wrap">
                <span class="budget-input-wrap__label">{{ t('my.monthlyBudget') }}</span>
                <input
                  v-model="monthlyBudgetInput"
                  class="budget-input"
                  type="number"
                  min="0"
                  step="0.01"
                  inputmode="decimal"
                  :placeholder="t('my.monthlyBudgetPlaceholder')"
                />
              </label>

              <label class="budget-input-wrap">
                <span class="budget-input-wrap__label">{{ t('my.yearlyBudget') }}</span>
                <input
                  v-model="yearlyBudgetInput"
                  class="budget-input"
                  type="number"
                  min="0"
                  step="0.01"
                  inputmode="decimal"
                  :placeholder="t('my.yearlyBudgetPlaceholder')"
                />
              </label>
            </div>

            <div class="login-sheet__actions">
              <button type="button" class="login-sheet__button login-sheet__button--primary" @click="closeBudgetDialog">
                {{ t('my.done') }}
              </button>
            </div>
          </section>
        </div>
      </Transition>
    </Teleport>

    <div v-if="showLogoutDialog" class="login-overlay" @click.self="closeLogoutDialog">
      <section class="login-sheet" role="dialog" aria-modal="true" aria-labelledby="logoutSheetTitle">
        <h2 id="logoutSheetTitle" class="login-sheet__title">{{ t('my.logout') }}</h2>
        <p class="login-sheet__desc">
          {{ t('my.logoutDesc') }}
        </p>

        <div class="login-sheet__actions">
          <button type="button" class="login-sheet__button login-sheet__button--primary" @click="confirmLogout">
            {{ t('my.confirmLogout') }}
          </button>
          <button type="button" class="login-sheet__button login-sheet__button--secondary" @click="closeLogoutDialog">
            {{ t('my.cancel') }}
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, onActivated, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import GithubLoginDialog from '@/components/common/GithubLoginDialog.vue'
import QrScannerOverlay from '@/components/my/QrScannerOverlay.vue'
import { formatPrice } from '@/utils/format'
import { useSyncStore } from '@/stores/sync'
import { useExchangeRateStore } from '@/stores/exchangeRate'
import { getGitHubOAuthClientId } from '@/utils/github/auth'
import { runWithRouteTransition } from '@/utils/routeTransition'
import { scrollToTopAnimated } from '@/utils/scrollToTopAnimated'
import { useI18n } from 'vue-i18n'
import { useQrScanner } from '@/composables/my/useQrScanner'
import { useBudgetCalculation } from '@/composables/my/useBudgetCalculation'

defineOptions({ name: 'MyView' })

const { t } = useI18n()
const router = useRouter()
const syncStore = useSyncStore()
const exchangeRateStore = useExchangeRateStore()
const pageBodyRef = ref(null)
const showLoginDialog = ref(false)
const showLogoutDialog = ref(false)
const showBudgetDialog = ref(false)

const githubOAuthClientId = getGitHubOAuthClientId()

const {
  monthlyBudgetInput, yearlyBudgetInput,
  currentPeriodLabel, currentYearLabel,
  monthlyBudgetProgress, yearlyBudgetProgress,
  loadBudgetSettings
} = useBudgetCalculation()

const {
  scanning, scanError, showScanner, scannerReady,
  scannerVideoRef, scannerCanvasRef, scannerHint,
  openScanner, closeScanner, handleScannerGallery,
  onScannerVideoReady, resetScannerState
} = useQrScanner()

const avatarInitial = computed(() => (syncStore.githubLogin ? syncStore.githubLogin.slice(0, 1).toUpperCase() : 'G'))
const tokenDisplay = computed(() => {
  if (!syncStore.token) return t('my.notConfigured')
  const token = syncStore.token
  return `${token.slice(0, 4)}...${token.slice(-4)}`
})

const isUsingGithubLogin = computed(() => (
  !!syncStore.githubLogin && syncStore.githubAuthMethod === 'device-flow'
))

const showAuthMethod = computed(() => (
  !!syncStore.githubAuthMethod && syncStore.githubAuthMethod !== 'device-flow'
))

const syncSummaryText = computed(() => {
  if (syncStore.lastSyncedAt) return t('my.summaryLastSync', { time: formatTime(syncStore.lastSyncedAt) })
  if (syncStore.githubLogin) return t('my.summaryConnected')
  return t('my.summaryNotConnected')
})

const exchangeRateLastUpdatedText = computed(() => {
  if (!exchangeRateStore.lastUpdated) return t('my.rateNotFetched')
  return t('my.rateLastUpdated', { time: formatTime(exchangeRateStore.lastUpdated) })
})

async function refreshExchangeRates() {
  if (exchangeRateStore.loading) return
  await exchangeRateStore.fetchRates()
}

function resetPageScrollTop() {
  scrollToTopAnimated(() => pageBodyRef.value, 0)
}

function openSync() {
  runWithRouteTransition(() => router.push('/manage/sync'), { direction: 'forward' })
}

function openSettings() {
  runWithRouteTransition(() => router.push('/manage/settings'), { direction: 'forward' })
}

function openBudgetDialog() {
  showBudgetDialog.value = true
}

function closeBudgetDialog() {
  showBudgetDialog.value = false
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
  console.error(message)
}

async function handleGithubLoginSuccess(user) {
  showToast(t('my.loginSuccess', { login: user.login }))
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
  await Promise.all([syncStore.init(), loadBudgetSettings()])
})

onActivated(() => {
  resetScannerState()
  resetPageScrollTop()
  window.requestAnimationFrame(resetPageScrollTop)
  void loadBudgetSettings()
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

.toolbar-scan {
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

.toolbar-scan svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.toolbar-scan:active {
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
  grid-template-columns: auto minmax(0, 1fr) auto;
  grid-template-areas:
    'avatar copy actions'
    'budget budget budget';
  gap: 14px 18px;
  align-items: center;
}

.account-avatar-wrap {
  grid-area: avatar;
  align-self: start;
}

.budget-compact {
  grid-area: budget;
  display: grid;
  gap: 4px;
  padding: 20px 16px 18px;
  border-radius: 24px;
  background: color-mix(in srgb, var(--app-surface-soft) 84%, transparent);
  box-shadow: var(--app-shadow);
  min-width: 0;
}

.budget-compact__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.budget-compact__label {
  color: var(--app-text-tertiary);
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.budget-compact__title {
  margin-top: 4px;
  color: var(--app-text);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.03em;
}

.budget-compact__item {
  display: grid;
  gap: 2px;
}

.budget-compact__item + .budget-compact__item {
  margin-top: 0;
}

.budget-compact__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--app-text-secondary);
  font-size: 12px;
  min-height: 0;
}

.budget-compact__meta strong {
  color: var(--app-text);
  font-size: 13px;
  font-weight: 600;
}

.budget-compact__percent {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: auto;
  min-height: 32px;
  align-self: center;
  padding: 0 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-surface) 88%, transparent);
  color: var(--app-text-secondary);
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  flex-shrink: 0;
}

.budget-compact__percent--over {
  background: color-mix(in srgb, #e45b5b 16%, var(--app-surface-soft));
  color: #cd3f3f;
}

.budget-progress--compact {
  height: 8px;
  margin-top: -2px;
}

.budget-compact__foot {
  margin-top: 6px;
  color: var(--app-text-tertiary);
  font-size: 12px;
  line-height: 1.4;
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
  grid-area: copy;
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
  grid-area: actions;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
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

.budget-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.budget-settings-btn {
  min-height: 34px;
  padding: 0 12px;
  border: none;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-surface-soft) 92%, transparent);
  color: var(--app-text);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.budget-settings-btn:active {
  transform: scale(0.98);
}

.budget-input-wrap {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}

.budget-input-wrap__label {
  color: var(--app-text-secondary);
  font-size: 13px;
}

.budget-input {
  width: 100%;
  height: 42px;
  padding: 0 12px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--app-text) 10%, transparent);
  background: color-mix(in srgb, var(--app-surface-soft) 88%, transparent);
  color: var(--app-text);
  font-size: 14px;
  outline: none;
}

.budget-input:focus {
  border-color: color-mix(in srgb, var(--app-text) 26%, transparent);
}

.budget-progress {
  position: relative;
  width: 100%;
  height: 10px;
  margin-top: 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-text) 8%, transparent);
  overflow: hidden;
}

.budget-progress__bar {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #4f9cff, #58c892);
}

.budget-progress__bar--over {
  background: linear-gradient(90deg, #f1a23a, #e45b5b);
}

.budget-progress__overflow {
  position: absolute;
  right: 0;
  top: 0;
  height: 100%;
  border-radius: 999px;
  background: rgba(228, 91, 91, 0.42);
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

.detail-row--clickable {
  cursor: pointer;
  transition: background 0.16s ease;
  border-radius: 8px;
  margin: 0 -8px;
  padding-left: 8px;
  padding-right: 8px;
}

.detail-row--clickable:active {
  background: color-mix(in srgb, var(--app-text) 4%, transparent);
}

.detail-row__value--error {
  color: #e53e3e;
  font-size: 12px;
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

.budget-sheet__fields {
  display: grid;
  gap: 12px;
  margin-top: 16px;
}

.budget-overlay {
  z-index: 220;
}

.budget-sheet-pop-enter-active,
.budget-sheet-pop-leave-active {
  transition: opacity 0.24s ease;
}

.budget-sheet-pop-enter-active .budget-sheet,
.budget-sheet-pop-leave-active .budget-sheet {
  transition: transform 0.24s ease, opacity 0.24s ease;
}

.budget-sheet-pop-enter-from,
.budget-sheet-pop-leave-to {
  opacity: 0;
}

.budget-sheet-pop-enter-from .budget-sheet,
.budget-sheet-pop-leave-to .budget-sheet {
  transform: translateY(26px);
  opacity: 0;
}

@media (max-width: 1023px) {
  .content-grid {
    grid-template-columns: 1fr;
  }
}

@media (min-width: 768px) and (max-width: 1023px) {
  .content-main {
    order: 2;
  }

  .content-side {
    order: 1;
  }

  .account-panel__main {
    grid-template-columns: auto minmax(0, 1fr);
    grid-template-areas:
      'avatar copy'
      'actions actions'
      'budget budget';
  }

  .budget-compact {
    width: 100%;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px 12px;
    align-items: start;
  }

  .budget-compact__head {
    grid-column: 1 / -1;
  }

  .budget-compact__item {
    min-width: 0;
  }
}

@media (min-width: 768px) {
  .budget-compact {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px 12px;
    align-items: start;
  }

  .budget-compact__head {
    grid-column: 1 / -1;
  }

  .budget-compact__item {
    min-width: 0;
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
    grid-template-areas:
      'avatar'
      'copy'
      'actions'
      'budget';
    justify-items: start;
  }

  .budget-compact {
    width: 100%;
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

  .budget-overlay {
    align-items: center;
  }

  .budget-sheet {
    width: min(100%, 460px);
    border-radius: 24px;
  }

  .budget-sheet-pop-enter-from .budget-sheet,
  .budget-sheet-pop-leave-to .budget-sheet {
    transform: translateY(0) scale(0.96);
    opacity: 0;
  }
}

/* scan toast */
.scan-toast {
  margin: 8px 0 0;
  font-size: 13px;
  color: #e53e3e;
  text-align: right;
}

/* scan spinner */
.toolbar-scan-spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid rgba(142, 142, 147, 0.25);
  border-top-color: var(--app-text);
  border-radius: 50%;
  animation: scan-spin 0.7s linear infinite;
}

@keyframes scan-spin {
  to { transform: rotate(360deg); }
}
</style>
