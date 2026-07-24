<template>
  <div class="page about-page">
    <NavBar :title="t('about.title')" show-back />

    <main ref="pageBodyRef" class="page-body">
      <section class="hero-section">
        <article class="hero-card">
          <img class="app-icon" :src="appIconSrc" :alt="t('about.appIcon')" />
          <div class="hero-copy">
            <p class="hero-label">About Goods App</p>
            <h1 class="hero-title">{{ appName }}</h1>
            <p class="hero-desc">{{ t('about.heroDesc') }}</p>
            <div class="hero-meta">
              <span class="hero-chip">{{ t('about.version') }} {{ appVersion }}</span>
              <span class="hero-chip">Android {{ androidVersionName }}</span>
              <span class="hero-chip">{{ t('about.resourceVersion') }} {{ webBundleVersionLabel }}</span>
            </div>
          </div>
        </article>
      </section>

      <section class="content-section">
        <div class="section-head">
          <p class="section-label">App Info</p>
          <h2 class="section-title">{{ t('about.appInfo') }}</h2>
        </div>

        <div class="info-grid">
          <article class="info-card">
            <p class="info-kicker">{{ t('about.appName') }}</p>
            <h3 class="info-value">{{ appName }}</h3>
            <p class="info-desc">{{ t('about.appNameDesc') }}</p>
          </article>

          <article class="info-card">
            <p class="info-kicker">{{ t('about.packageName') }}</p>
            <h3 class="info-value info-value--mono">{{ appId }}</h3>
            <p class="info-desc">{{ t('about.packageNameDesc') }}</p>
          </article>

          <article class="info-card">
            <p class="info-kicker">{{ t('about.androidVersion') }}</p>
            <h3 class="info-value">{{ androidVersionName }}</h3>
            <p class="info-desc">{{ t('about.androidVersionDesc') }}</p>
          </article>

          <article class="info-card">
            <p class="info-kicker">{{ t('about.resourceVersion') }}</p>
            <h3 class="info-value">{{ webBundleVersionLabel }}</h3>
            <p class="info-desc">{{ t('about.resourceVersionDesc') }}</p>
          </article>
        </div>
      </section>

      <section class="content-section">
        <div class="section-head">
          <p class="section-label">App Update</p>
          <h2 class="section-title">{{ t('about.checkUpdate') }}</h2>
        </div>

        <div class="update-grid">
          <article class="update-panel">
            <p class="info-kicker">App Release</p>
            <h3 class="info-value">{{ t('about.currentVersionLabel', { version: updateStore.currentVersion }) }}</h3>
            <p class="info-desc">{{ IS_NATIVE ? t('about.appUpdateDescNative') : t('about.appUpdateDescWeb') }}</p>
            <div class="update-channel-row">
              <span class="update-channel-label">{{ t('about.updateSource') }}</span>
              <div class="update-channel-actions">
                <button
                  v-for="source in updateStore.availableUpdateSources"
                  :key="`app-${source}`"
                  type="button"
                  :class="['update-channel-btn', { 'update-channel-btn--active': updateStore.selectedSource === source }]"
                  @click="handleAppUpdateSourceChange(source)"
                >
                  {{ source }}
                </button>
              </div>
            </div>
            <p class="update-status">{{ updateStatusText }}</p>
            <p v-if="updateStore.downloadError" class="update-status update-status--error">{{ updateStore.downloadError }}</p>
            <div v-if="updateStore.isDownloading" class="update-download-progress">
              <div class="update-download-progress__head">
                <span>{{ t('about.downloadProgress') }}</span>
                <span>{{ updateStore.downloadProgress }}%</span>
              </div>
              <div class="update-download-progress__track" role="progressbar" :aria-valuenow="updateStore.downloadProgress" aria-valuemin="0" aria-valuemax="100">
                <span class="update-download-progress__bar" :style="{ transform: `scaleX(${updateStore.downloadProgress / 100})` }" />
              </div>
              <div class="update-download-progress__meta">
                <span>{{ updateStore.downloadTransferred || t('about.preparing') }}</span>
                <span>{{ updateStore.downloadSpeed || '--' }}</span>
              </div>
            </div>
            <p class="update-meta">{{ t('about.lastChecked', { time: updateCheckedAtLabel }) }}</p>

            <div class="update-actions">
              <button
                type="button"
                class="dialog-btn dialog-btn--secondary"
                :disabled="updateStore.isChecking"
                @click="handleManualCheckUpdate"
              >
                {{ updateStore.isChecking ? t('about.checking') : t('about.manualCheckUpdate') }}
              </button>
              <button
                v-if="updateStore.hasUpdate"
                type="button"
                class="dialog-btn dialog-btn--primary"
                :disabled="updateStore.isDownloading"
                @click="handleStartUpdate"
              >
                {{ updateStore.isDownloading ? t('about.downloading') : (updateStore.supportsInAppDownload ? t('about.downloadAndInstall') : t('about.gotoUpdate')) }}
              </button>
            </div>
          </article>

          <article class="update-panel">
            <p class="info-kicker">Web Bundle</p>
            <h3 class="info-value">{{ t('about.currentResourceLabel', { version: webBundleVersionLabel }) }}</h3>
            <p class="info-desc">{{ t('about.webUpdateDesc') }}</p>
            <div class="update-channel-row">
              <span class="update-channel-label">{{ t('about.updateSource') }}</span>
              <div class="update-channel-actions">
                <button
                  v-for="source in webUpdateStore.availableUpdateSources"
                  :key="`bundle-${source}`"
                  type="button"
                  :class="['update-channel-btn', { 'update-channel-btn--active': webUpdateStore.selectedSource === source }]"
                  @click="handleWebUpdateSourceChange(source)"
                >
                  {{ source }}
                </button>
              </div>
            </div>
            <div class="update-channel-row">
              <span class="update-channel-label">{{ t('about.updateChannel') }}</span>
              <div class="update-channel-actions">
                <button
                  v-for="channel in webUpdateStore.availableUpdateChannels"
                  :key="channel"
                  type="button"
                  :class="['update-channel-btn', { 'update-channel-btn--active': webUpdateStore.selectedChannel === channel }]"
                  @click="handleWebUpdateChannelChange(channel)"
                >
                  {{ channel }}
                </button>
              </div>
            </div>
            <p class="update-status">{{ webUpdateStatusText }}</p>
            <section v-if="webUpdateReleaseNotesPreview" class="update-notes">
              <p class="update-notes__label">{{ t('about.releaseNotes') }}</p>
              <pre class="update-notes__body">{{ webUpdateReleaseNotesPreview }}</pre>
            </section>
            <p v-if="webUpdateStore.lastError" class="update-status update-status--error">{{ webUpdateStore.lastError }}</p>
            <div v-if="webUpdateStore.isDownloading" class="update-download-progress">
              <div class="update-download-progress__head">
                <span>{{ t('about.downloadProgress') }}</span>
                <span>{{ webUpdateStore.downloadProgress }}%</span>
              </div>
              <div class="update-download-progress__track" role="progressbar" :aria-valuenow="webUpdateStore.downloadProgress" aria-valuemin="0" aria-valuemax="100">
                <span class="update-download-progress__bar" :style="{ transform: `scaleX(${webUpdateStore.downloadProgress / 100})` }" />
              </div>
            </div>
            <p class="update-meta">{{ t('about.lastChecked', { time: webUpdateCheckedAtLabel }) }}</p>
            <div class="update-actions">
              <button
                type="button"
                class="dialog-btn dialog-btn--secondary"
                :disabled="!webUpdateStore.supported || webUpdateStore.isChecking"
                @click="handleManualCheckWebUpdate"
              >
                {{ webUpdateStore.isChecking ? t('about.checking') : t('about.checkResourceUpdate') }}
              </button>
              <button
                v-if="webUpdateStore.hasUpdate"
                type="button"
                class="dialog-btn dialog-btn--primary"
                :disabled="webUpdateStore.isDownloading"
                @click="handleStartWebUpdate"
              >
                {{ webUpdateStore.isDownloading ? t('about.downloading') : t('about.downloadAndNextLaunch') }}
              </button>
              <button
                v-if="webUpdateStore.supported"
                type="button"
                class="dialog-btn dialog-btn--ghost"
                @click="showWebUpdateResetDialog = true"
              >
                {{ t('about.restoreBuiltInResource') }}
              </button>
            </div>
          </article>
        </div>
      </section>

      <section class="content-section">
        <div class="section-head">
          <p class="section-label">Resource Management</p>
          <h2 class="section-title">{{ t('about.resourceManagement') }}</h2>
        </div>

        <div class="info-grid">
          <article class="info-card">
            <p class="info-kicker">{{ t('about.localImageCache') }}</p>
            <h3 class="info-value">{{ resourceSizeCacheImage }}</h3>
            <p class="info-desc">{{ t('about.localImageCacheDesc') }}</p>
            <div class="update-actions" style="margin-top: 1rem;">
              <button class="dialog-btn dialog-btn--secondary" @click="handleClearImageCache">{{ t('about.clearImageCache') }}</button>
            </div>
          </article>

          <article class="info-card">
            <p class="info-kicker">{{ t('about.localCutoutModel') }}</p>
            <h3 class="info-value">{{ resourceSizeModel }}</h3>
            <p class="info-desc">{{ t('about.localCutoutModelDesc') }}</p>
            <div class="update-actions" style="margin-top: 1rem;">
              <button
                class="dialog-btn dialog-btn--secondary"
                :disabled="isClearingCutoutModel"
                @click="handleClearCutoutModel"
              >
                {{ isClearingCutoutModel ? t('about.uninstalling') : t('about.uninstallCutoutModel') }}
              </button>
            </div>
          </article>

          <article class="info-card">
            <p class="info-kicker">{{ t('about.updateRemnants') }}</p>
            <h3 class="info-value">{{ resourceSizeUpdate }}</h3>
            <p class="info-desc">{{ t('about.updateRemnantsDesc') }}</p>
            <div class="update-actions" style="margin-top: 1rem;">
              <button class="dialog-btn dialog-btn--secondary" @click="handleClearUpdateCache">{{ t('about.clearUpdateRemnants') }}</button>
            </div>
          </article>
        </div>
      </section>

      <section class="content-section">
        <div class="section-head">
          <p class="section-label">Current Data</p>
          <h2 class="section-title">{{ t('about.currentData') }}</h2>
        </div>

        <div class="stats-grid">
          <article v-for="item in statsCards" :key="item.label" class="stat-card">
            <p class="stat-label">{{ item.label }}</p>
            <p class="stat-value">{{ item.value }}</p>
            <p class="stat-desc">{{ item.desc }}</p>
          </article>
        </div>
      </section>

      <section class="content-section">
        <div class="section-head">
          <p class="section-label">Feedback</p>
          <h2 class="section-title">{{ t('about.feedback') }}</h2>
        </div>

        <div class="feedback-grid">
          <button
            type="button"
            class="feedback-card"
            @click="showFeedbackDialog = true"
          >
            <span class="feedback-icon feedback-icon--primary">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </span>
            <div class="feedback-body">
              <p class="feedback-kicker">{{ t('about.feedbackInApp') }}</p>
              <h3 class="feedback-title">{{ t('about.submitFeedback') }}</h3>
              <p class="feedback-desc">{{ t('about.feedbackInAppDesc') }}</p>
            </div>
            <svg class="feedback-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>

          <a
            :href="`https://github.com/${FEEDBACK_REPO_OWNER}/${FEEDBACK_REPO_NAME}/issues/new`"
            target="_blank"
            rel="noopener"
            class="feedback-card"
          >
            <span class="feedback-icon feedback-icon--secondary">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
            </span>
            <div class="feedback-body">
              <p class="feedback-kicker">GitHub Issues</p>
              <h3 class="feedback-title">GitHub Issues</h3>
              <p class="feedback-desc">{{ t('about.feedbackGithubDesc') }}</p>
            </div>
            <svg class="feedback-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </a>
        </div>
      </section>

      <!-- My Feedbacks List (login required) -->
      <section v-if="authStore.isLoggedIn && myFeedbacks.length > 0" class="content-section">
        <div class="section-head">
          <p class="section-label">My Feedbacks</p>
          <h2 class="section-title">
            {{ t('about.feedbackMyFeedbacks') }}
            <span v-if="hasNewProgress" class="feedback-badge-dot" />
          </h2>
        </div>

        <div class="feedback-list">
          <button
            v-for="fb in myFeedbacks"
            :key="fb.id"
            type="button"
            class="feedback-list-item"
            :class="{ 'feedback-list-item--updated': isRecentlyUpdated(fb) }"
            @click="detailFbId = fb.id; showFeedbackDetail = true"
          >
            <div class="feedback-list-header">
              <span class="feedback-type-tag" :class="`feedback-type-tag--${fb.type}`">
                {{ typeLabel(fb.type) }}
              </span>
              <span class="feedback-status-tag" :class="`feedback-status-tag--${fb.status}`">
                {{ statusLabel(fb.status) }}
              </span>
            </div>
            <div class="feedback-list-row">
              <h4 class="feedback-list-title">{{ fb.title }}</h4>
              <svg class="feedback-list-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </div>
            <div class="feedback-list-meta">
              <span>{{ t('about.feedbackSubmittedAt', { time: formatTime(fb.created_at) }) }}</span>
            </div>
          </button>
        </div>
      </section>
    </main>

    <Transition name="overlay-fade">
      <div v-if="showWebUpdateRestartDialog" class="overlay" @click.self="cancelWebUpdateRestart">
        <div class="dialog">
          <h3 class="dialog-title">{{ t('about.resourceUpdateReady') }}</h3>
          <p class="dialog-desc">{{ t('about.restartPrompt') }}</p>
          <div class="dialog-actions dialog-actions__right">
            <button type="button" class="dialog-btn dialog-btn--secondary" @click="cancelWebUpdateRestart">{{ t('about.later') }}</button>
            <button type="button" class="dialog-btn dialog-btn--primary" @click="confirmWebUpdateRestart">{{ t('about.restartNow') }}</button>
          </div>
        </div>
      </div>
    </Transition>

    <Transition name="overlay-fade">
      <div v-if="showWebUpdateResetDialog" class="overlay" @click.self="showWebUpdateResetDialog = false">
        <div class="dialog">
          <h3 class="dialog-title">{{ t('about.restoreBuiltinTitle') }}</h3>
          <p class="dialog-desc">{{ t('about.restoreBuiltinDesc') }}</p>
          <div class="dialog-actions dialog-actions__right">
            <button type="button" class="dialog-btn dialog-btn--secondary" @click="showWebUpdateResetDialog = false">{{ t('about.cancel') }}</button>
            <button type="button" class="dialog-btn dialog-btn--primary" @click="confirmResetWebUpdate">{{ t('about.confirmRestore') }}</button>
          </div>
        </div>
      </div>
    </Transition>

    <AppToast :message="toastMsg" />
    <FeedbackDialog v-model="showFeedbackDialog" :user-id="authStore.user?.id || ''" @submitted="onFeedbackSubmitted" />
    <FeedbackDetailView v-model="showFeedbackDetail" :feedback-id="detailFbId" />
  </div>
</template>

<script setup>
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import NavBar from '@/components/common/NavBar.vue'
import AppToast from '@/components/common/AppToast.vue'
import FeedbackDialog from '@/components/app/FeedbackDialog.vue'
import FeedbackDetailView from '@/views/FeedbackDetailView.vue'
import { useAppUpdateStore } from '@/stores/appUpdate'
import { useWebUpdateStore } from '@/stores/webUpdate'
import { useGoodsStore } from '@/stores/goods'
import { usePresetsStore } from '@/stores/presets'
import { useSyncStore } from '@/stores/sync'
import { useAuthStore } from '@/stores/auth'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { scrollToTopAnimated } from '@/utils/scrollToTopAnimated'
import { useI18n } from 'vue-i18n'
import { useToast } from '@/composables/useToast'
import { listMyFeedbacks, checkNewStatus } from '@/services/feedbackService'
import packageJson from '../../package.json'
import capacitorConfig from '../../capacitor.config.json'

const { t } = useI18n()
const router = useRouter()

const FEEDBACK_REPO_OWNER = 'laurensZero'
const FEEDBACK_REPO_NAME = 'goods_app'
const IS_NATIVE = Capacitor.isNativePlatform()

const goodsStore = useGoodsStore()
const presetsStore = usePresetsStore()
const syncStore = useSyncStore()
const authStore = useAuthStore()
const updateStore = useAppUpdateStore()
const webUpdateStore = useWebUpdateStore()
const pageBodyRef = ref(null)
const showWebUpdateRestartDialog = ref(false)
const showWebUpdateResetDialog = ref(false)
const isClearingCutoutModel = ref(false)
const showFeedbackDialog = ref(false)
const showFeedbackDetail = ref(false)
const detailFbId = ref(0)
const { toastMsg, showToast } = useToast()

// Feedback list & red dot
const FEEDBACK_LIST_KEY = 'goods_feedback_last_viewed'
const myFeedbacks = ref([])
const hasNewProgress = ref(false)

const statusMap = {
  pending: 'about.feedbackStatusPending',
  reviewing: 'about.feedbackStatusReviewing',
  resolved: 'about.feedbackStatusResolved',
  closed: 'about.feedbackStatusClosed'
}

function statusLabel(status) {
  return t(statusMap[status] || status)
}

function typeLabel(type) {
  const map = { bug: 'about.feedbackTypeBug', feature: 'about.feedbackTypeFeature', other: 'about.feedbackTypeOther' }
  return t(map[type] || type)
}

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function getLastViewedAt() {
  return localStorage.getItem(FEEDBACK_LIST_KEY) || '1970-01-01T00:00:00Z'
}

function setLastViewedAt() {
  localStorage.setItem(FEEDBACK_LIST_KEY, new Date().toISOString())
}

function isRecentlyUpdated(fb) {
  if (fb.status === 'pending') return false
  const lastViewed = getLastViewedAt()
  return fb.updated_at > lastViewed
}

async function loadMyFeedbacks() {
  const userId = authStore.user?.id
  if (!userId) {
    myFeedbacks.value = []
    hasNewProgress.value = false
    return
  }
  try {
    myFeedbacks.value = await listMyFeedbacks(userId)
    const lastViewed = getLastViewedAt()
    const newCount = await checkNewStatus(userId, lastViewed)
    hasNewProgress.value = newCount > 0
  } catch {
    // Silently ignore — feedback list is non-critical
  }
}

function markFeedbacksViewed() {
  hasNewProgress.value = false
  setLastViewedAt()
}

const appIconSrc = `${import.meta.env.BASE_URL}favicon.svg`
const appName = capacitorConfig.appName || packageJson.name || 'Goods App'
const appId = capacitorConfig.appId || 'unknown'
const appVersion = ref(import.meta.env.VITE_APP_VERSION || packageJson.version || '0.0.0')
const androidVersionName = ref(import.meta.env.VITE_ANDROID_VERSION_NAME || import.meta.env.VITE_APP_VERSION || '1.0')
const webBundleVersionLabel = computed(() => webUpdateStore.currentVersion || `v${appVersion.value}`)

function formatUpdateSourceLabel(source) {
  const normalized = String(source || '').trim().toLowerCase()
  if (normalized === 'gitee') return 'Gitee'
  if (normalized === 'github') return 'GitHub'
  if (normalized === 'auto') return t('about.auto')
  return normalized || '--'
}

const statsCards = computed(() => [
  {
    label: t('about.collectionItems'),
    value: String(goodsStore.list.length),
    desc: t('about.collectionItemsDesc')
  },
  {
    label: t('about.trash'),
    value: String(goodsStore.trashList.length),
    desc: t('about.trashDesc')
  },
  {
    label: t('about.categoryPresets'),
    value: String(presetsStore.categories.length),
    desc: t('about.categoryPresetsDesc')
  },
  {
    label: t('about.characterPresets'),
    value: String(presetsStore.characters.length),
    desc: t('about.characterPresetsDesc')
  },
  {
    label: t('about.storageLocations'),
    value: String(presetsStore.storageLocations.length),
    desc: t('about.storageLocationsDesc')
  },
  {
    label: t('about.syncStatus'),
    value: syncStore.lastSyncedAt ? t('about.syncStatusConfigured') : t('about.syncStatusNotSynced'),
    desc: syncStore.lastSyncedAt ? t('about.recentSync', { time: formatSyncTime(syncStore.lastSyncedAt) }) : t('about.configureSync')
  }
])

const updateStatusText = computed(() => {
  const sourceLabel = formatUpdateSourceLabel(updateStore.selectedSource)
  const resolvedLabel = updateStore.resolvedSource ? formatUpdateSourceLabel(updateStore.resolvedSource) : ''

  if (updateStore.isChecking) return t('about.checkingVersion', { source: sourceLabel })
  if (updateStore.lastStatus === 'disabled') return t('about.versionDisabled')
  if (updateStore.lastStatus === 'available' && updateStore.latestVersion) {
    return resolvedLabel
      ? t('about.newVersionFoundWithSource', { version: updateStore.latestVersion, source: resolvedLabel })
      : t('about.newVersionFound', { version: updateStore.latestVersion })
  }
  if (updateStore.lastStatus === 'latest') return t('about.noUpdate')
  if (updateStore.lastStatus === 'error') return updateStore.lastError || t('about.checkUpdateFailed')
  if (resolvedLabel) {
    return t('about.canCheckManuallyWithResolved', { source: sourceLabel, resolved: resolvedLabel })
  }
  return t('about.canCheckManually', { source: sourceLabel })
})

const updateCheckedAtLabel = computed(() => (
  updateStore.lastCheckedAt ? formatSyncTime(updateStore.lastCheckedAt) : t('about.notCheckedYet')
))

const webUpdateStatusText = computed(() => {
  const sourceLabel = formatUpdateSourceLabel(webUpdateStore.selectedSource)
  const resolvedLabel = webUpdateStore.resolvedSource ? formatUpdateSourceLabel(webUpdateStore.resolvedSource) : ''

  if (!webUpdateStore.supported) return t('about.webOnlyNativeSupported')
  if (webUpdateStore.isChecking) return t('about.checkingResource', { source: sourceLabel })
  if (webUpdateStore.lastStatus === 'pending' && webUpdateStore.pendingVersion) {
    return t('about.resourceReady', { version: webUpdateStore.pendingVersion })
  }
  if (webUpdateStore.lastStatus === 'available' && webUpdateStore.latestVersion) {
    return resolvedLabel
      ? t('about.resourceUpdateFoundWithSource', { version: webUpdateStore.latestVersion, source: resolvedLabel })
      : t('about.resourceUpdateFound', { version: webUpdateStore.latestVersion })
  }
  if (webUpdateStore.lastStatus === 'incompatible-native' && webUpdateStore.latestMinNativeVersion) {
    return t('about.incompatibleNative', { version: webUpdateStore.latestMinNativeVersion })
  }
  if (webUpdateStore.lastStatus === 'missing-asset') {
    return t('about.missingAsset')
  }
  if (webUpdateStore.lastStatus === 'latest') return t('about.resourceLatest')
  if (webUpdateStore.lastStatus === 'error') return webUpdateStore.lastError || t('about.resourceCheckFailed')
  if (resolvedLabel) {
    return t('about.canCheckResourceWithResolved', { channel: webUpdateStore.selectedChannel, source: sourceLabel, resolved: resolvedLabel })
  }
  return t('about.canCheckResource', { channel: webUpdateStore.selectedChannel, source: sourceLabel })
})

const webUpdateCheckedAtLabel = computed(() => (
  webUpdateStore.lastCheckedAt ? formatSyncTime(webUpdateStore.lastCheckedAt) : t('about.notCheckedYet')
))

const webUpdateReleaseNotesPreview = computed(() => {
  return String(webUpdateStore.releaseNotesPreview || '').trim()
})

function formatSyncTime(isoString) {
  if (!isoString) return ''
  const date = new Date(isoString)
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function resetPageScrollTop() {
  scrollToTopAnimated(() => pageBodyRef.value, 0)
}

function onFeedbackSubmitted(created) {
  showToast(t('about.feedbackSuccess'), 3000)
  if (created) {
    myFeedbacks.value.unshift(created)
  }
}

async function handleManualCheckUpdate() {
  if (updateStore.isChecking) return

  try {
    const result = await updateStore.checkForUpdates({ source: 'manual' })
    if (result?.status === 'disabled') {
      showToast(t('about.webDevDisabled'))
      return
    }

    if (result?.status === 'available') {
      showToast(t('about.newVersionFound', { version: updateStore.latestVersion }), 3200)
      return
    }

    showToast(t('about.noUpdate'))
  } catch (error) {
    showToast(updateStore.lastError || error?.message || t('about.checkUpdateFailed'), 3200)
  }
}

async function handleStartUpdate() {
  if (updateStore.isDownloading) return

  const succeeded = await updateStore.downloadAndInstallUpdate()
  if (succeeded) {
    if (updateStore.usingMockDownload) {
      showToast(t('about.mockDownloadDone'), 2200)
      return
    }
    if (updateStore.supportsInAppDownload) {
      showToast(t('about.updateDownloaded'), 3200)
      return
    }
  }

  if (updateStore.downloadError) {
    showToast(updateStore.downloadError, 3200)
  }
}

async function handleAppUpdateSourceChange(source) {
  if (updateStore.selectedSource === source) return
  updateStore.setUpdateSource(source)
  showToast(t('about.updateSourceChanged', { source }), 2200)
  await handleManualCheckUpdate()
}

async function handleManualCheckWebUpdate() {
  if (!webUpdateStore.supported || webUpdateStore.isChecking) return

  try {
    const result = await webUpdateStore.checkForUpdates()
    if (result?.status === 'available') {
      showToast(t('about.resourceUpdateFound', { version: webUpdateStore.latestVersion }), 3200)
      return
    }
    if (result?.status === 'incompatible-native') {
      showToast(
        webUpdateStore.latestMinNativeVersion
          ? t('about.nativeVersionTooLow', { version: webUpdateStore.latestMinNativeVersion })
          : t('about.nativeVersionInsufficient'),
        3200
      )
      return
    }
    if (result?.status === 'missing-asset') {
      showToast(t('about.missingVersionUrl'), 3200)
      return
    }
    showToast(t('about.resourceLatest'))
  } catch (error) {
    showToast(webUpdateStore.lastError || error?.message || t('about.resourceCheckFailed'), 3200)
  }
}

async function handleWebUpdateChannelChange(channel) {
  if (webUpdateStore.selectedChannel === channel) return
  webUpdateStore.setUpdateChannel(channel)
  showToast(t('about.resourceChannelChanged', { channel }), 2200)
  await handleManualCheckWebUpdate()
}

async function handleWebUpdateSourceChange(source) {
  if (webUpdateStore.selectedSource === source) return
  webUpdateStore.setUpdateSource(source)
  showToast(t('about.resourceSourceChanged', { source }), 2200)
  await handleManualCheckWebUpdate()
}

async function handleStartWebUpdate() {
  if (webUpdateStore.isDownloading) return

  const succeeded = await webUpdateStore.downloadAndPrepareUpdate()
  if (succeeded) {
    if (!IS_NATIVE) {
      window.location.reload()
      return
    }
    showToast(t('about.applyingUpdate'), 1800)
    const activated = await webUpdateStore.applyPendingUpdateNow()
    if (!activated) {
      showToast(webUpdateStore.lastError || t('about.updateFailed'), 3200)
    }
  }
}

function cancelWebUpdateRestart() {
  showWebUpdateRestartDialog.value = false
  showToast(t('about.updateKeptForRestart'), 2600)
}

async function confirmWebUpdateRestart() {
  showWebUpdateRestartDialog.value = false

  if (!IS_NATIVE) {
    window.location.reload()
    return
  }

  showToast(t('about.applyingUpdate'), 1800)
  const activated = await webUpdateStore.applyPendingUpdateNow()
  if (!activated) {
    showToast(webUpdateStore.lastError || t('about.updateFailed'), 3200)
  }
}

async function confirmResetWebUpdate() {
  showWebUpdateResetDialog.value = false
  showToast(t('about.restoringBuiltin'), 1800)
  const resetOk = await webUpdateStore.resetToBuiltinBundle()
  if (!resetOk) {
    showToast(webUpdateStore.lastError || t('about.restoreFailed'), 3200)
  }
}

onMounted(async () => {
  resetPageScrollTop()
  window.requestAnimationFrame(resetPageScrollTop)

  if (IS_NATIVE) {
    try {
      const info = await CapacitorApp.getInfo()
      const runtimeVersion = String(info?.version || '').trim()
      if (runtimeVersion) {
        appVersion.value = runtimeVersion
        androidVersionName.value = runtimeVersion
      }
    } catch {
      // ignore runtime version read failures and keep fallback values
    }
  }

  syncStore.init()
  void updateStore.init()
  void webUpdateStore.init()
  void loadMyFeedbacks()
})

onBeforeUnmount(() => {
  markFeedbacksViewed()
})

// ======== 资源空间计算 ========
const resourceSizeCacheImage = ref('--')
const resourceSizeModel = ref('--')
const resourceSizeUpdate = ref('--')

async function calculateDirectorySize(path, directory) {
  let total = 0
  try {
    const res = await Filesystem.readdir({ path, directory })
    for (const file of res.files) {
      if (file.type === 'directory') {
        total += await calculateDirectorySize(`${path}/${file.name}`, directory)
      } else {
        total += Number(file.size) || 0
      }
    }
  } catch {
    // 忽略目录不存在的情况
  }
  return total
}

function formatSize(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

async function refreshResourceSizes() {
  if (!IS_NATIVE) {
    resourceSizeCacheImage.value = t('about.webManagedByBrowser')
    resourceSizeModel.value = t('about.webNoSaved')
    resourceSizeUpdate.value = t('about.webNotUsed')
    return
  }

  calculateDirectorySize('img-cache', Directory.Cache).then(size => {
    resourceSizeCacheImage.value = size > 0 ? formatSize(size) : '0 B'
  })
  
  calculateDirectorySize('imgly-assets', Directory.Data).then(size => {
    resourceSizeModel.value = size > 0 ? formatSize(size) : '0 B'
  })

  calculateDirectorySize('updates', Directory.Cache).then(size => {
    resourceSizeUpdate.value = size > 0 ? formatSize(size) : '0 B'
  })
}

onMounted(() => {
  refreshResourceSizes()
})

async function handleClearImageCache() {
  try {
    const { clearAllCache } = await import('@/utils/image/cache')
    await clearAllCache()
    showToast(t('about.imageCacheCleared'))
    refreshResourceSizes()
  } catch (error) {
    showToast(t('about.clearImageCacheFailed'))
  }
}

async function handleClearCutoutModel() {
  if (!IS_NATIVE) {
    showToast(t('about.webNoNativeModel'))
    return
  }
  if (isClearingCutoutModel.value) return

  isClearingCutoutModel.value = true

  try {
    const { clearLocalModelAssets } = await import('@/composables/image/useImageCutout')
    const ok = await clearLocalModelAssets()
    if (ok) {
      showToast(t('about.cutoutModelUninstalled'))
    } else {
      showToast(t('about.clearCutoutModelFailed'))
    }
  } catch (error) {
    console.error('[about] clear cutout model failed:', error)
    showToast(t('about.clearCutoutModelFailed'))
  } finally {
    isClearingCutoutModel.value = false
    refreshResourceSizes()
  }
}

async function handleClearUpdateCache() {
  try {
    if (IS_NATIVE) {
      await Filesystem.rmdir({
        path: 'updates',
        directory: Directory.Cache,
        recursive: true
      })
    }
    const { caches } = window
    if (caches) {
      await caches.delete('app-update-cache')
    }
    showToast(t('about.updateCacheCleared'))
    refreshResourceSizes()
  } catch (error) {
    showToast(t('about.updateCacheEmpty'))
  }
}


</script>

<style scoped src="../assets/views/AboutView.css"></style>

