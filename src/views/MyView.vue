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

    <!-- Scanner overlay -->
    <Teleport to="body">
      <Transition name="scanner-fade">
        <div v-if="showScanner" class="scanner-overlay" @click.self="closeScanner">
          <div class="scanner-dialog" @click.stop>
            <div class="scanner-dialog__head">
              <h2 class="scanner-dialog__title">{{ t('my.scanQR') }}</h2>
              <button class="scanner-dialog__close" type="button" :aria-label="t('my.close')" @click="closeScanner">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                </svg>
              </button>
            </div>

            <div class="scanner-viewport">
              <video
                ref="scannerVideoRef"
                class="scanner-video"
                :class="{ 'is-ready': scannerReady }"
                autoplay
                playsinline
                muted
                @playing="onScannerVideoReady"
              />
              <canvas ref="scannerCanvasRef" class="scanner-canvas" />

              <div v-if="scannerReady" class="scanner-frame">
                <span class="scanner-corner scanner-corner--tl" />
                <span class="scanner-corner scanner-corner--tr" />
                <span class="scanner-corner scanner-corner--bl" />
                <span class="scanner-corner scanner-corner--br" />
                <span class="scanner-line" />
              </div>
            </div>

            <p class="scanner-hint">{{ scannerHint }}</p>

            <div class="scanner-dialog__foot">
              <button class="scanner-foot-btn" type="button" @click="handleScannerGallery">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="3" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="M21 15l-5-5L5 21" />
                </svg>
                <span>{{ t('my.fromGallery') }}</span>
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

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
import { computed, onActivated, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import jsQR from 'jsqr'
import GithubLoginDialog from '@/components/common/GithubLoginDialog.vue'
import { extractIdsFromInput } from '@/utils/share/goods'
import { formatPrice } from '@/utils/format'
import { readPersisted, writePersisted } from '@/utils/platform/storage'
import { MONTHLY_BUDGET_STORAGE_KEY, YEARLY_BUDGET_STORAGE_KEY } from '@/constants/budgetConstants'
import { useGoodsStore } from '@/stores/goods'
import { useEventsStore } from '@/stores/events'
import { usePresetsStore } from '@/stores/presets'
import { useSyncStore } from '@/stores/sync'
import { useRechargeStore } from '@/stores/recharge'
import { useExchangeRateStore } from '@/stores/exchangeRate'
import {
  fetchGitHubUser,
  getGitHubDeviceFlowScope,
  getGitHubOAuthClientId,
  getGitHubVerificationUrl,
  pollGitHubAccessToken,
  requestGitHubDeviceCode
} from '@/utils/github/auth'
import { runWithRouteTransition } from '@/utils/routeTransition'
import { scrollToTopAnimated } from '@/utils/scrollToTopAnimated'
import { useI18n } from 'vue-i18n'

defineOptions({ name: 'MyView' })

const { t } = useI18n()
const router = useRouter()
const syncStore = useSyncStore()
const exchangeRateStore = useExchangeRateStore()
const goodsStore = useGoodsStore()
const eventsStore = useEventsStore()
const presetsStore = usePresetsStore()
const rechargeStore = useRechargeStore()
const pageBodyRef = ref(null)
const showLoginDialog = ref(false)
const showLogoutDialog = ref(false)
const showBudgetDialog = ref(false)
const monthlyBudgetInput = ref('')
const yearlyBudgetInput = ref('')

const githubOAuthClientId = getGitHubOAuthClientId()

const collectionCount = computed(() => goodsStore.list.filter((item) => !item?.isWishlist).length)
const wishlistCount = computed(() => goodsStore.list.filter((item) => item?.isWishlist).length)
const eventCount = computed(() => eventsStore.list.length)
const rechargeCount = computed(() => rechargeStore.sortedRecords.length)

const currentPeriodLabel = computed(() => {
  const now = new Date()
  return t('my.periodLabel', { year: now.getFullYear(), month: String(now.getMonth() + 1).padStart(2, '0') })
})

const currentYearLabel = computed(() => t('my.yearLabel', { year: new Date().getFullYear() }))

const monthlyBudget = computed(() => parseBudgetValue(monthlyBudgetInput.value))
const yearlyBudget = computed(() => parseBudgetValue(yearlyBudgetInput.value))

// 预算消费改为基于商品的入手日期计算：
// - 如果存在 unitAcquiredAtList 与 unitActualPriceList，按每个单位逐条判断并累加对应价格
// - 否则使用 item.acquiredAt 与 item.actualPrice/price * quantity
// - 邮费按单件分摊：shippingFee / quantity，然后根据当期计入的件数累加分摊后的邮费
const currentMonthSpent = computed(() => {
  const now = new Date()
  const cy = now.getFullYear()
  const cm = now.getMonth()

  const EXCLUDED_VALUE_STATUSES = new Set(['已赠出', '已出', '丢失'])
  return goodsStore.list.reduce((sum, item) => {
    if (item?.isWishlist) return sum
    if (EXCLUDED_VALUE_STATUSES.has(String(item?.collectStatus || '').trim())) return sum

    const qty = Math.max(1, Number(item.quantity) || 1)
    const unitDates = Array.isArray(item.unitAcquiredAtList) ? item.unitAcquiredAtList : []
    const unitPrices = Array.isArray(item.unitActualPriceList) ? item.unitActualPriceList : []
    let monthUnits = 0
    let monthAmount = 0

    if (unitDates.length > 0 && unitPrices.length > 0) {
      const len = Math.min(unitDates.length, unitPrices.length)
      for (let i = 0; i < len; i++) {
        const d = unitDates[i] ? new Date(String(unitDates[i]).trim()) : null
        const ts = d && !isNaN(d.getTime()) ? d : null
        if (!ts) continue
        if (ts.getFullYear() === cy && ts.getMonth() === cm) {
          monthUnits += 1
          monthAmount += Number(unitPrices[i] || 0)
        }
      }
    } else {
      const d = item?.acquiredAt ? new Date(String(item.acquiredAt).trim()) : null
      if (d && !isNaN(d.getTime()) && d.getFullYear() === cy && d.getMonth() === cm) {
        const base = (item.actualPrice !== '' && item.actualPrice != null)
          ? (Number(item.actualPrice) || 0)
          : (Number(item.price) || 0)
        monthUnits = qty
        monthAmount = base * qty
      }
    }

    if (monthUnits === 0) return sum

    const shipping = Number(item.shippingFee) || 0
    const shippingPerUnit = shipping / Math.max(1, qty)
    return sum + monthAmount + (shippingPerUnit * monthUnits)
  }, 0)
})

const currentYearSpent = computed(() => {
  const cy = new Date().getFullYear()

  const EXCLUDED_VALUE_STATUSES = new Set(['已赠出', '已出', '丢失'])
  return goodsStore.list.reduce((sum, item) => {
    if (item?.isWishlist) return sum
    if (EXCLUDED_VALUE_STATUSES.has(String(item?.collectStatus || '').trim())) return sum

    const qty = Math.max(1, Number(item.quantity) || 1)
    const unitDates = Array.isArray(item.unitAcquiredAtList) ? item.unitAcquiredAtList : []
    const unitPrices = Array.isArray(item.unitActualPriceList) ? item.unitActualPriceList : []
    let yearUnits = 0
    let yearAmount = 0

    if (unitDates.length > 0 && unitPrices.length > 0) {
      const len = Math.min(unitDates.length, unitPrices.length)
      for (let i = 0; i < len; i++) {
        const d = unitDates[i] ? new Date(String(unitDates[i]).trim()) : null
        const ts = d && !isNaN(d.getTime()) ? d : null
        if (!ts) continue
        if (ts.getFullYear() === cy) {
          yearUnits += 1
          yearAmount += Number(unitPrices[i] || 0)
        }
      }
    } else {
      const d = item?.acquiredAt ? new Date(String(item.acquiredAt).trim()) : null
      if (d && !isNaN(d.getTime()) && d.getFullYear() === cy) {
        const base = (item.actualPrice !== '' && item.actualPrice != null)
          ? (Number(item.actualPrice) || 0)
          : (Number(item.price) || 0)
        yearUnits = qty
        yearAmount = base * qty
      }
    }

    if (yearUnits === 0) return sum

    const shipping = Number(item.shippingFee) || 0
    const shippingPerUnit = shipping / Math.max(1, qty)
    return sum + yearAmount + (shippingPerUnit * yearUnits)
  }, 0)
})

const monthlyBudgetProgress = computed(() => buildBudgetProgress(currentMonthSpent.value, monthlyBudget.value))
const yearlyBudgetProgress = computed(() => buildBudgetProgress(currentYearSpent.value, yearlyBudget.value))

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

const syncHeadlineText = computed(() => {
  if (syncStore.githubLogin) return t('my.headlineConnected')
  if (syncStore.token) return t('my.headlineConfigured')
  return t('my.headlinePending')
})

const syncSublineText = computed(() => {
  if (syncStore.lastSyncedAt) return t('my.sublineRecentSync', { time: formatTime(syncStore.lastSyncedAt) })
  if (syncStore.token) return t('my.sublineConfigSaved')
  return t('my.sublineNotConfigured')
})

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

const scanning = ref(false)
const scanError = ref('')
const showScanner = ref(false)
const scannerReady = ref(false)
const scannerVideoRef = ref(null)
const scannerCanvasRef = ref(null)
const scannerHint = ref('') // initialized in openScanner with t()
let scannerStream = null
let scannerTimer = 0
let scannerResolved = false

function onScannerVideoReady() {
  scannerReady.value = true
  startScannerLoop()
}

function loadImageFromSrc(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(t('my.qrLoadFailed')))
    img.src = src
  })
}

async function decodeQrFromImageElement(image) {
  const maxEdge = 1600
  const scale = Math.min(1, maxEdge / Math.max(image.width, image.height))
  const width = Math.max(1, Math.floor(image.width * scale))
  const height = Math.max(1, Math.floor(image.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return ''

  ctx.drawImage(image, 0, 0, width, height)
  const imageData = ctx.getImageData(0, 0, width, height)
  const result = jsQR(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: 'attemptBoth'
  })

  return String(result?.data || '').trim()
}

let scannerBusy = false

async function decodeQrFromVideoFrame() {
  if (scannerBusy) return ''
  const video = scannerVideoRef.value
  const canvas = scannerCanvasRef.value
  if (!video || !canvas || video.readyState < 2) return ''

  const vw = video.videoWidth
  const vh = video.videoHeight
  if (!vw || !vh) return ''

  scannerBusy = true

  try {
    // Capture a smaller region around center to improve performance
    const size = Math.min(vw, vh)
    const sx = Math.floor((vw - size) / 2)
    const sy = Math.floor((vh - size) / 2)

    // Lower resolution = faster decoding, less GC pressure
    const outSize = 320
    canvas.width = outSize
    canvas.height = outSize

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return ''

    ctx.drawImage(video, sx, sy, size, size, 0, 0, outSize, outSize)
    const imageData = ctx.getImageData(0, 0, outSize, outSize)

    // dontInvert is much faster — QR codes are always dark-on-light in our use case
    const result = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert'
    })

    return String(result?.data || '').trim()
  } finally {
    scannerBusy = false
  }
}

async function onScannerQRFound(text) {
  if (scannerResolved) return
  scannerResolved = true

  const { gistId, shareId } = extractIdsFromInput(text)
  stopScanner()

  if (!gistId) {
    scannerHint.value = t('my.scanInvalidShareCode')
    setTimeout(() => {
      scannerResolved = false
      scannerHint.value = t('my.scannerHint')
      startScannerLoop()
    }, 1500)
    return
  }

  const query = shareId ? { s: shareId } : {}
  showScanner.value = false
  scanError.value = ''
  runWithRouteTransition(
    () => router.push({ name: 'share-import', params: { gistId }, query }),
    { direction: 'forward' }
  )
}

function startScannerLoop() {
  stopScannerLoop()
  scannerTimer = window.setInterval(async () => {
    if (scannerResolved) return
    try {
      const text = await decodeQrFromVideoFrame()
      if (text) {
        await onScannerQRFound(text)
      }
    } catch {
      // skip frame errors
    }
  }, 300)
}

function stopScannerLoop() {
  if (scannerTimer) {
    clearInterval(scannerTimer)
    scannerTimer = 0
  }
}

function stopScanner() {
  stopScannerLoop()
  if (scannerStream) {
    scannerStream.getTracks().forEach((track) => track.stop())
    scannerStream = null
  }
}

function closeScanner() {
  stopScanner()
  scannerReady.value = false
  showScanner.value = false
  scanning.value = false
}

async function openScanner() {
  scanning.value = true
  scanError.value = ''
  scannerResolved = false
  showScanner.value = true

  // Wait for DOM to render the video element
  await new Promise((resolve) => setTimeout(resolve, 100))

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 1280 } },
      audio: false
    })
    scannerStream = stream
    if (scannerVideoRef.value) {
      scannerVideoRef.value.srcObject = stream
      // video @playing event will call onScannerVideoReady → startScannerLoop
    }
    scannerHint.value = t('my.scannerHint')
  } catch {
    // Fallback: if getUserMedia fails (e.g. no permission), use native camera
    closeScanner()
    try {
      const photo = await Camera.getPhoto({
        source: CameraSource.Prompt,
        resultType: CameraResultType.Uri,
        quality: 92,
        promptLabelHeader: t('my.promptScanImport'),
        promptLabelPhoto: t('my.promptFromGallery'),
        promptLabelPicture: t('my.promptTakePhoto')
      })

      const src = String(photo?.webPath || photo?.path || '').trim()
      if (!src) { scanning.value = false; return }

      const image = await loadImageFromSrc(src)
      const text = await decodeQrFromImageElement(image)

      if (!text) {
        scanError.value = t('my.scanNoQR')
        scanning.value = false
        return
      }

      const { gistId, shareId } = extractIdsFromInput(text)
      if (!gistId) {
        scanError.value = t('my.scanInvalidContent')
        scanning.value = false
        return
      }

      const query = shareId ? { s: shareId } : {}
      scanning.value = false
      runWithRouteTransition(
        () => router.push({ name: 'share-import', params: { gistId }, query }),
        { direction: 'forward' }
      )
    } catch (e2) {
      const message = String(e2?.message || '')
      if (!message || !/cancel|canceled|cancelled/i.test(message)) {
        scanError.value = e2?.message || t('my.scanFailed')
      }
      scanning.value = false
    }
  }
}

async function handleScannerGallery() {
  if (scannerResolved) return
  stopScannerLoop()

  try {
    const photo = await Camera.getPhoto({
      source: CameraSource.Photos,
      resultType: CameraResultType.Uri,
      quality: 92,
      promptLabelHeader: t('my.scanFromGallery')
    })

    const src = String(photo?.webPath || photo?.path || '').trim()
    if (!src) { startScannerLoop(); return }

    const image = await loadImageFromSrc(src)
    const text = await decodeQrFromImageElement(image)

    if (text) {
      await onScannerQRFound(text)
    } else {
      scannerHint.value = t('my.scanNoQRRetry')
      setTimeout(() => {
        scannerResolved = false
        scannerHint.value = t('my.scannerHint')
        startScannerLoop()
      }, 1500)
    }
  } catch (e) {
    const message = String(e?.message || '')
    if (!message || !/cancel|canceled|cancelled/i.test(message)) {
      scanError.value = e?.message || t('my.galleryReadFailed')
    }
    startScannerLoop()
  }
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

function parseRecordDate(record) {
  const chargedAt = String(record?.chargedAt || '').trim()
  const chargedAtTs = chargedAt ? new Date(chargedAt).getTime() : NaN
  if (Number.isFinite(chargedAtTs)) {
    return new Date(chargedAtTs)
  }

  const updatedAt = Number(record?.updatedAt || 0)
  if (Number.isFinite(updatedAt) && updatedAt > 0) {
    return new Date(updatedAt)
  }

  return null
}

function parseBudgetValue(value) {
  const normalized = Number(String(value || '').trim())
  if (!Number.isFinite(normalized) || normalized <= 0) return 0
  return normalized
}

function normalizeBudgetInput(value) {
  const normalized = parseBudgetValue(value)
  if (normalized <= 0) return ''
  return String(normalized)
}

function buildBudgetProgress(spent, budget) {
  const safeSpent = Number.isFinite(spent) ? Math.max(0, spent) : 0
  const safeBudget = Number.isFinite(budget) ? Math.max(0, budget) : 0

  if (safeBudget <= 0) {
    return {
      hasBudget: false,
      spent: safeSpent,
      budget: safeBudget,
      percent: 0,
      clampedPercent: 0,
      overPercent: 0,
      remaining: 0,
      isOverBudget: false
    }
  }

  const percent = (safeSpent / safeBudget) * 100
  return {
    hasBudget: true,
    spent: safeSpent,
    budget: safeBudget,
    percent,
    clampedPercent: Math.min(100, Math.max(0, percent)),
    overPercent: Math.min(100, Math.max(0, percent - 100)),
    remaining: safeBudget - safeSpent,
    isOverBudget: percent > 100
  }
}

async function loadBudgetSettings() {
  const [savedMonthly, savedYearly] = await Promise.all([
    readPersisted(MONTHLY_BUDGET_STORAGE_KEY, ''),
    readPersisted(YEARLY_BUDGET_STORAGE_KEY, '')
  ])

  monthlyBudgetInput.value = normalizeBudgetInput(savedMonthly)
  yearlyBudgetInput.value = normalizeBudgetInput(savedYearly)
}

watch(monthlyBudgetInput, (value) => {
  const normalized = normalizeBudgetInput(value)
  if (normalized !== value) {
    monthlyBudgetInput.value = normalized
    return
  }
  writePersisted(MONTHLY_BUDGET_STORAGE_KEY, normalized)
})

watch(yearlyBudgetInput, (value) => {
  const normalized = normalizeBudgetInput(value)
  if (normalized !== value) {
    yearlyBudgetInput.value = normalized
    return
  }
  writePersisted(YEARLY_BUDGET_STORAGE_KEY, normalized)
})

onMounted(async () => {
  resetPageScrollTop()
  window.requestAnimationFrame(resetPageScrollTop)
  await Promise.all([syncStore.init(), loadBudgetSettings()])
})

onActivated(() => {
  scanning.value = false
  scanError.value = ''
  resetPageScrollTop()
  window.requestAnimationFrame(resetPageScrollTop)
  void loadBudgetSettings()
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

.budget-stack {
  display: grid;
  gap: 12px;
  margin-bottom: 18px;
}

.budget-card {
  padding: 16px;
  border-radius: 24px;
  background: color-mix(in srgb, var(--app-surface) 90%, transparent);
  box-shadow: var(--app-shadow);
}

.budget-card--over {
  box-shadow:
    var(--app-shadow),
    0 0 0 1px color-mix(in srgb, #e45b5b 26%, transparent);
}

.budget-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.budget-card__label {
  color: var(--app-text-tertiary);
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.budget-card__title {
  margin-top: 4px;
  color: var(--app-text);
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.03em;
}

.budget-card__percent {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 32px;
  padding: 0 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-surface-soft) 90%, transparent);
  color: var(--app-text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.budget-card__percent--over {
  background: color-mix(in srgb, #e45b5b 14%, var(--app-surface-soft));
  color: #cd3f3f;
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

.budget-card__meta {
  margin-top: 10px;
  color: var(--app-text-secondary);
  font-size: 14px;
}

.budget-card__hint {
  margin-top: 4px;
  color: var(--app-text-tertiary);
  font-size: 13px;
}

.budget-card__hint--over {
  color: #cd3f3f;
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
  .overview-strip {
    display: none;
  }

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

/* ── Scanner overlay (glass dialog) ── */
.scanner-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--app-overlay);
  backdrop-filter: blur(14px) saturate(120%);
  -webkit-backdrop-filter: blur(14px) saturate(120%);
}

.scanner-dialog {
  width: 100%;
  max-width: 360px;
  border-radius: 28px;
  background: color-mix(in srgb, var(--app-glass-strong) 94%, var(--app-surface));
  border: 1px solid var(--app-glass-border);
  box-shadow:
    0 24px 56px color-mix(in srgb, var(--app-text) 16%, transparent),
    0 0 0 1px color-mix(in srgb, var(--app-text) 5%, transparent);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.scanner-dialog__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px 0;
}

.scanner-dialog__title {
  font-size: 17px;
  font-weight: 700;
  color: var(--app-text);
  letter-spacing: -0.02em;
  margin: 0;
}

.scanner-dialog__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: color-mix(in srgb, var(--app-surface-soft) 88%, transparent);
  color: var(--app-text-secondary);
}

.scanner-dialog__close svg {
  width: 16px;
  height: 16px;
}

.scanner-viewport {
  position: relative;
  margin: 16px 20px;
  aspect-ratio: 1;
  border-radius: 16px;
  overflow: hidden;
  background: #0f0f10;
}

.scanner-video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  transition: opacity 0.12s ease;
}

.scanner-video.is-ready {
  opacity: 1;
}

.scanner-canvas {
  position: absolute;
  inset: 0;
  opacity: 0;
  pointer-events: none;
}

.scanner-frame {
  position: absolute;
  inset: 8px;
  z-index: 10;
  pointer-events: none;
}

.scanner-corner {
  position: absolute;
  width: 22px;
  height: 22px;
  border-color: rgba(255, 255, 255, 0.86);
  border-style: solid;
}

.scanner-corner--tl { top: 0; left: 0; border-width: 2.5px 0 0 2.5px; border-radius: 4px 0 0 0; }
.scanner-corner--tr { top: 0; right: 0; border-width: 2.5px 2.5px 0 0; border-radius: 0 4px 0 0; }
.scanner-corner--bl { bottom: 0; left: 0; border-width: 0 0 2.5px 2.5px; border-radius: 0 0 0 4px; }
.scanner-corner--br { bottom: 0; right: 0; border-width: 0 2.5px 2.5px 0; border-radius: 0 0 4px 0; }

.scanner-line {
  position: absolute;
  left: 6px;
  right: 6px;
  top: 12px;
  height: 1.5px;
  background: linear-gradient(90deg, transparent, #5ba0ff, transparent);
  animation: scanner-line-sweep 2.6s ease-in-out infinite;
}

@keyframes scanner-line-sweep {
  0%   { top: 12px;  opacity: 0; }
  12%  { opacity: 1; }
  88%  { opacity: 1; }
  100% { top: calc(100% - 16px); opacity: 0; }
}

.scanner-hint {
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 500;
  text-align: center;
  margin: 0 20px 4px;
}

.scanner-dialog__foot {
  padding: 12px 20px 20px;
}

.scanner-foot-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 46px;
  border: none;
  border-radius: 14px;
  background: color-mix(in srgb, var(--app-surface-soft) 88%, transparent);
  color: var(--app-text);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.02em;
  transition: background 0.16s ease;
}

.scanner-foot-btn:active {
  background: color-mix(in srgb, var(--app-text) 8%, transparent);
}

.scanner-foot-btn svg {
  width: 20px;
  height: 20px;
  stroke: currentColor;
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

/* scanner transition */
.scanner-fade-enter-active,
.scanner-fade-leave-active {
  transition: opacity 0.24s ease;
}

.scanner-fade-enter-from,
.scanner-fade-leave-to {
  opacity: 0;
}

:global(html.theme-dark) .scanner-dialog {
  background: color-mix(in srgb, var(--app-glass-strong) 96%, var(--app-surface));
  box-shadow:
    0 24px 56px rgba(0, 0, 0, 0.48),
    0 0 0 1px rgba(255, 255, 255, 0.06);
}

:global(html.theme-dark) .budget-card__percent--over,
:global(html.theme-dark) .budget-card__hint--over {
  color: #ff8d8d;
}
</style>
