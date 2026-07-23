<template>
  <div class="page sync-page">
    <NavBar :title="t('sync.title')" show-back />

    <Transition name="toast-fade">
      <div v-if="syncNoticeText" class="sync-notice" :class="`sync-notice--${syncNoticeLevel}`" role="alert">
        <span class="sync-notice__title">{{ syncNoticeLevel === 'error' ? t('sync.errorTitle') : t('sync.syncNotice') }}</span>
        <span class="sync-notice__body">{{ syncNoticeText }}</span>
      </div>
    </Transition>

    <main ref="pageBodyRef" class="page-body">
      <section class="hero-section hero-section--sync">
        <article class="hero-card">
          <div class="hero-head">
            <div class="hero-copy">
              <p class="hero-label">Cloud Sync</p>
              <h1 class="hero-title">{{ t('sync.syncLabel', { backend: syncBackendLabel }) }}</h1>
              <p class="hero-desc">{{ t('sync.description') }}</p>
            </div>
            <span class="status-badge" :class="statusBadgeClass">{{ statusBadgeText }}</span>
          </div>

          <div class="hero-grid">
            <div class="hero-metric">
              <p class="hero-metric__label">{{ t('sync.recentSync') }}</p>
              <p class="hero-metric__value">{{ lastSyncDisplay }}</p>
            </div>
            <div class="hero-metric">
              <p class="hero-metric__label">{{ remoteIdLabel }}</p>
              <p class="hero-metric__value hero-metric__value--mono">{{ remoteIdDisplay }}</p>
            </div>
          </div>
        </article>
      </section>

      <Transition name="overlay-fade">
        <div v-if="showBackendConfirm" class="overlay" @click.self="cancelChooseBackend">
          <div class="dialog">
            <h3 class="dialog-title">{{ t('sync.switchBackend') }}</h3>
            <p class="dialog-desc">{{ t('sync.switchBackendDesc', { backend: 'Supabase' }) }}</p>
            <div class="dialog-actions">
              <button class="dialog-btn dialog-btn--secondary" @click="cancelChooseBackend">{{ t('common.cancel') }}</button>
              <button class="dialog-btn dialog-btn--primary" @click="confirmChooseBackend">{{ t('sync.confirmSwitch') }}</button>
            </div>
          </div>
        </div>
      </Transition>

      <section class="content-section overview-section">
        <div class="section-head">
          <p class="section-label">Sync Overview</p>
          <h2 class="section-title">{{ t('sync.overview') }}</h2>
        </div>

        <div class="overview-grid">
          <article class="panel-card">
            <div class="panel-head">
              <div>
                <p class="panel-kicker">Connection</p>
                <h3 class="panel-title">{{ t('sync.connection') }}</h3>
              </div>
              <span class="panel-badge" :class="statusBadgeClass">{{ statusBadgeText }}</span>
            </div>

            <div class="detail-list">
              <template v-if="syncStore.syncBackend === 'supabase'">
                <div class="detail-row">
                  <span class="detail-label">{{ t('sync.supabaseUrl') }}</span>
                  <span class="detail-value detail-value--mono">{{ supabaseUrlDisplay }}</span>
                </div>
                <div v-if="syncStore.supabaseUrl" class="detail-row">
                  <span class="detail-label">Anon Key</span>
                  <span class="detail-value detail-value--mono">{{ supabaseKeyDisplay }}</span>
                </div>
              </template>

              <div v-if="syncStore.isSupabaseMode()" class="detail-row">
                <span class="detail-label">{{ t('sync.pauseSync') }}</span>
                <label class="toggle-switch" :aria-label="t('sync.pauseSync')">
                  <input
                    :checked="syncStore.syncPaused"
                    type="checkbox"
                    @change="handlePauseSyncToggle"
                  />
                  <span class="toggle-slider" />
                </label>
              </div>

              <div class="detail-row">
                <span class="detail-label">{{ t('sync.deviceId') }}</span>
                <span class="detail-value detail-value--mono">{{ syncStore.deviceId }}</span>
              </div>

              <div class="detail-row detail-row--last">
                <span class="detail-label">{{ t('sync.recentSync') }}</span>
                <span class="detail-value">{{ lastSyncDisplay }}</span>
              </div>
            </div>
          </article>

          <article class="panel-card">
            <div class="panel-head">
              <div>
                <p class="panel-kicker">Remote Data</p>
                <h3 class="panel-title">{{ t('sync.remoteData') }}</h3>
              </div>
            </div>

            <div class="stats-grid">
              <article class="stat-card stat-card--collection">
                <p class="stat-label">{{ t('sync.remoteCollection') }}</p>
                <p class="stat-value">{{ collectionCount }}</p>
                <p class="stat-desc">{{ t('sync.remoteCollectionDesc') }}</p>
              </article>
              <article class="stat-card stat-card--wishlist">
                <p class="stat-label">{{ t('sync.remoteWishlist') }}</p>
                <p class="stat-value">{{ wishlistCount }}</p>
                <p class="stat-desc">{{ t('sync.remoteWishlistDesc') }}</p>
              </article>
              <article class="stat-card stat-card--wishlist">
                <p class="stat-label">{{ t('sync.remoteRecharge') }}</p>
                <p class="stat-value">{{ rechargeCount }}</p>
                <p class="stat-desc">{{ t('sync.remoteRechargeDesc') }}</p>
              </article>
              <article class="stat-card stat-card--collection">
                <p class="stat-label">{{ t('sync.remoteEvents') }}</p>
                <p class="stat-value">{{ eventCount }}</p>
                <p class="stat-desc">{{ t('sync.remoteEventsDesc') }}</p>
              </article>
              <article class="stat-card stat-card--image">
                <p class="stat-label">{{ t('sync.remoteImages') }}</p>
                <p class="stat-value">{{ imageFileCount }}</p>
                <p class="stat-desc">{{ t('sync.remoteImagesDesc') }}</p>
              </article>
              <article class="stat-card stat-card--trash">
                <p class="stat-label">{{ t('sync.remoteTrash') }}</p>
                <p class="stat-value">{{ trashCount }}</p>
                <p class="stat-desc">{{ t('sync.remoteTrashDesc') }}</p>
              </article>
            </div>
          </article>
        </div>
      </section>

      <section class="content-section actions-section">
        <div class="section-head">
          <p class="section-label">Sync Actions</p>
          <h2 class="section-title">{{ t('sync.actions') }}</h2>
        </div>

        <div class="action-grid">
          <button
            type="button"
            class="entry-card"
            :disabled="syncStore.isSyncing || !syncStore.isConfigured"
            @click="handleSync"
          >
            <span class="entry-icon sync-icon">
              <svg v-if="!syncStore.isSyncing" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M21.5 2v6h-6" />
                <path d="M2.5 22v-6h6" />
                <path d="M2 11.5a10 10 0 0 1 18.8-4.3" />
                <path d="M22 12.5a10 10 0 0 1-18.8 4.3" />
              </svg>
              <span v-else class="sync-spinner" aria-hidden="true" />
            </span>
            <div class="entry-body">
              <p class="entry-kicker">Push & Resolve</p>
              <h3 class="entry-name">{{ syncStore.isSyncing ? (syncStore.syncStatus || t('sync.syncing')) : t('sync.uploadToRemote') }}</h3>
              <p class="entry-desc">{{ t('sync.uploadDesc') }}</p>
            </div>
            <svg class="entry-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>

          <button
            type="button"
            class="entry-card"
            :disabled="syncStore.isSyncing || !syncStore.isConfigured"
            @click="handlePull"
          >
            <span class="entry-icon pull-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </span>
            <div class="entry-body">
              <p class="entry-kicker">Remote to Local</p>
              <h3 class="entry-name">{{ t('sync.pullRemote') }}</h3>
              <p class="entry-desc">{{ t('sync.pullDesc') }}</p>
            </div>
            <svg class="entry-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </div>
      </section>

      <!-- 后端选择 -->
      <section class="content-section">
        <div class="section-head">
          <p class="section-label">Backend</p>
          <h2 class="section-title">{{ t('sync.backend') }}</h2>
        </div>

        <div class="backend-grid">
          <button
            type="button"
            class="entry-card backend-card"
            :class="{ 'backend-card--active': syncStore.syncBackend === 'supabase' }"
            @click="chooseBackend('supabase')"
          >
            <span class="entry-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <path d="M16 11.37A4 4 0 0 1 13.63 16" />
                <path d="M12 7v.01" />
              </svg>
            </span>
            <div class="entry-body">
              <p class="entry-kicker">Supabase</p>
              <h3 class="entry-name">{{ t('sync.supabaseBackend') }}</h3>
              <p class="entry-desc">{{ t('sync.supabaseBackendDesc') }}</p>
            </div>
            <svg class="entry-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </div>

        <!-- Supabase 配置已移除：URL/Key 与测试连接不在此显示 -->
      </section>

      <Transition name="error-slide">
        <section v-if="syncStore.syncPhase" class="content-section error-section">
          <article class="error-card">
            <div class="error-card__head">
              <span class="error-card__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </span>
              <div class="error-card__copy">
                <p class="error-card__label">Sync Error</p>
                <h3 class="error-card__title">{{ t('sync.errorTitle') }}</h3>
              </div>
              <button type="button" class="error-card__dismiss" @click="clearSyncError" :aria-label="t('common.close')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div class="error-card__body">
              <div class="error-card__row">
                <span class="error-card__key">{{ t('sync.errorPhase') }}</span>
                <span class="error-card__val">{{ syncPhaseName }}</span>
              </div>
              <div class="error-card__row">
                <span class="error-card__key">{{ t('sync.errorCause') }}</span>
                <span class="error-card__val">{{ syncCauseName }}</span>
              </div>
              <div class="error-card__row">
                <span class="error-card__key">{{ t('sync.errorMessage') }}</span>
                <span class="error-card__val error-card__val--detail">{{ syncStore.lastError }}</span>
              </div>
            </div>

            <div class="error-card__footer">
              <p class="error-card__suggestion">{{ syncStore.syncSuggestion }}</p>
            </div>
          </article>
        </section>
      </Transition>

      <section class="content-section logs-section">
        <div class="section-head">
          <p class="section-label">Sync Trace</p>
          <h2 class="section-title">{{ t('sync.syncLogs') }}</h2>
        </div>

        <article class="panel-card log-panel">
          <div class="panel-head">
            <div>
              <p class="panel-kicker">Detailed Trace</p>
              <h3 class="panel-title">{{ t('sync.logsSubtitle') }}</h3>
            </div>
            <span class="panel-badge" :class="syncStore.isSyncing ? 'badge--syncing' : 'log-count-badge'">
              {{ syncStore.isSyncing ? t('sync.recording') : t('sync.logCount', { count: syncStore.syncLogs.length }) }}
            </span>
          </div>

          <p class="section-note">{{ t('sync.logsNote') }}</p>

          <div v-if="groupedSyncLogs.length > 0" class="log-groups">
            <article
              v-for="group in groupedSyncLogs"
              :key="group.key"
              class="log-group"
              :class="{ 'log-group--collapsed': !isLogGroupExpanded(group.key) }"
            >
              <button type="button" class="log-group-head" @click="toggleLogGroup(group.key)">
                <div class="log-group-head__copy">
                  <p class="log-group-title">{{ group.label }}</p>
                  <span class="log-group-meta">{{ t('sync.logCount', { count: group.logs.length }) }}</span>
                </div>

                <div class="log-group-head__stats">
                  <span v-if="group.totalDurationMs > 0" class="log-group-duration">{{ formatLogDuration(group.totalDurationMs) }}</span>
                  <svg class="log-group-chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </div>
              </button>

              <div v-show="isLogGroupExpanded(group.key)" class="log-group-body">
                <div class="log-list">
                  <article
                    v-for="entry in group.logs"
                    :key="entry.id"
                    class="log-item"
                    :class="`log-item--${entry.status}`"
                  >
                    <span class="log-dot" aria-hidden="true" />
                    <div class="log-content">
                      <div class="log-head">
                        <div class="log-title-row">
                          <p class="log-title">{{ entry.title }}</p>
                          <span class="log-status">
                            {{ entry.status === 'running' ? t('sync.status.running') : entry.status === 'success' ? t('sync.status.success') : t('sync.status.failed') }}
                          </span>
                        </div>
                        <span class="log-time">{{ formatLogTime(entry.timestamp) }}</span>
                      </div>

                      <div class="log-meta">
                        <p class="log-detail">{{ entry.detail || t('toast.loading') }}</p>
                        <span v-if="entry.durationMs !== null" class="log-duration">{{ formatLogDuration(entry.durationMs) }}</span>
                      </div>
                    </div>
                  </article>
                </div>
              </div>
            </article>
          </div>

          <div v-else class="log-empty">
            {{ t('sync.logEmpty') }}
          </div>
        </article>
      </section>

      <Transition name="overlay-fade">
        <div v-if="showResetConfirm" class="overlay" @click.self="showResetConfirm = false">
          <div class="dialog">
            <h3 class="dialog-title">{{ t('common.confirmDelete') }}</h3>
            <p class="dialog-desc">
              {{ t('sync.clearConfigDesc') }}
            </p>
            <div class="dialog-actions">
              <button class="dialog-btn dialog-btn--secondary" @click="showResetConfirm = false">{{ t('common.cancel') }}</button>
              <button class="dialog-btn dialog-btn--danger" @click="handleReset">{{ t('common.confirmDelete') }}</button>
            </div>
          </div>
        </div>
      </Transition>

      <Transition name="overlay-fade">
        <div v-if="showPullConflict" class="overlay">
          <div class="dialog dialog--wide dialog--scrollable">
            <div class="dialog-scroll">
              <h3 class="dialog-title">{{ t('sync.remoteDataDetected') }}</h3>
              <div class="conflict-info">
                <div class="conflict-row">
                  <span class="conflict-label">{{ t('sync.sourceDevice') }}</span>
                  <span class="conflict-value">{{ pullConflictData.remoteDevice }}</span>
                </div>
                <div class="conflict-row">
                  <span class="conflict-label">{{ t('sync.remoteTime') }}</span>
                  <span class="conflict-value">{{ formatTime(pullConflictData.remoteTime) }}</span>
                </div>
                <div class="conflict-row">
                  <span class="conflict-label">{{ t('sync.remoteTotal') }}</span>
                  <span class="conflict-value">{{ t('sync.remoteTotalValue', { collection: pullConflictData.remoteCollectionCount, wishlist: pullConflictData.remoteWishlistCount, trash: pullConflictData.remoteTrashCount, recharge: pullConflictData.remoteRechargeCount || 0, events: pullConflictData.remoteEventCount || 0, images: pullConflictData.remoteImageCount || 0 }) }}</span>
                </div>
              </div>
              <div class="conflict-diff">
                <p class="conflict-diff-title">{{ t('sync.diff') }}</p>
                <div class="conflict-diff-row">
                  <span class="conflict-diff-label">{{ t('sync.remoteAdded') }}</span>
                  <span class="conflict-diff-value conflict-diff-value--add">{{ t('sync.remoteAddedValue', { collection: pullConflictData.remoteOnlyCollection, wishlist: pullConflictData.remoteOnlyWishlist, trash: pullConflictData.remoteOnlyTrash, recharge: pullConflictData.remoteOnlyRecharge || 0, events: pullConflictData.remoteOnlyEvents || 0, images: pullConflictData.remoteOnlyImages || 0 }) }}</span>
                </div>
                <div class="conflict-diff-row">
                  <span class="conflict-diff-label">{{ t('sync.remoteModified') }}</span>
                  <span class="conflict-diff-value conflict-diff-value--update">{{ t('sync.remoteModifiedValue', { goods: pullConflictData.updatedGoods || 0, recharge: pullConflictData.updatedRecharge || 0, events: pullConflictData.updatedEvents || 0, images: pullConflictData.updatedImages || 0 }) }}</span>
                </div>
                <div class="conflict-diff-row">
                  <span class="conflict-diff-label">{{ t('sync.localOnly') }}</span>
                  <span class="conflict-diff-value conflict-diff-value--local">{{ t('sync.localOnlyValue', { collection: pullConflictData.localOnlyCollection, wishlist: pullConflictData.localOnlyWishlist, trash: pullConflictData.localOnlyTrash, recharge: pullConflictData.localOnlyRecharge || 0, events: pullConflictData.localOnlyEvents || 0, images: pullConflictData.localOnlyImages || 0 }) }}</span>
                </div>
              </div>
              <p class="conflict-desc">{{ t('sync.pullConflictDesc') }}</p>
            </div>
            <div class="dialog-actions">
              <button class="dialog-btn dialog-btn--secondary" @click="handlePullConflict(false)">{{ t('common.cancel') }}</button>
              <button class="dialog-btn dialog-btn--primary" :disabled="syncStore.isSyncing" @click="handlePullConflict(true)">
                {{ t('sync.confirmPull') }}
              </button>
            </div>
          </div>
        </div>
      </Transition>

      <Transition name="overlay-fade">
        <div v-if="showSyncConflict" class="overlay">
          <div class="dialog dialog--scrollable">
            <div class="dialog-scroll">
              <h3 class="dialog-title">{{ t('sync.conflictDetected') }}</h3>
              <p class="conflict-desc">{{ t('sync.conflictDesc') }}</p>
              <div class="conflict-info">
                <div class="conflict-row">
                  <span class="conflict-label">{{ t('sync.remoteTime') }}</span>
                  <span class="conflict-value">{{ formatTime(syncConflictData.remoteTime) }}</span>
                </div>
                <div class="conflict-row">
                  <span class="conflict-label">{{ t('sync.localLastSync') }}</span>
                  <span class="conflict-value">{{ formatTime(syncConflictData.localTime) || t('sync.neverSynced') }}</span>
                </div>
                <div class="conflict-row">
                  <span class="conflict-label">{{ t('sync.localLastModified') }}</span>
                  <span class="conflict-value">{{ formatTime(syncConflictData.localModifiedTime) || t('sync.noLocalChanges') }}</span>
                </div>
              </div>
              <p class="conflict-desc">{{ t('sync.conflictChoose') }}</p>
            </div>
            <div class="dialog-actions">
              <button class="dialog-btn dialog-btn--secondary" :disabled="syncStore.isSyncing" @click="handleSyncConflict(false)">
                {{ t('sync.uploadLocal') }}
              </button>
              <button class="dialog-btn dialog-btn--primary" :disabled="syncStore.isSyncing" @click="handleSyncConflict(true)">
                {{ t('sync.pullRemoteBtn') }}
              </button>
            </div>
          </div>
        </div>
      </Transition>

      <!-- Supabase URL 输入对话框 -->
      <Transition name="overlay-fade">
        <div v-if="showSupabaseUrlDialog" class="overlay" @click.self="showSupabaseUrlDialog = false">
          <div class="dialog">
            <h3 class="dialog-title">{{ t('sync.supabaseUrlTitle') }}</h3>
            <input
              v-model="supabaseUrlInput"
              class="dialog-input"
              type="url"
              placeholder="https://xxxxx.supabase.co"
              autocomplete="off"
            />
            <div class="dialog-actions">
              <button class="dialog-btn dialog-btn--secondary" @click="showSupabaseUrlDialog = false">{{ t('common.cancel') }}</button>
              <button class="dialog-btn dialog-btn--primary" :disabled="!supabaseUrlInput.trim()" @click="handleSaveSupabaseUrl">{{ t('common.save') }}</button>
            </div>
          </div>
        </div>
      </Transition>

      <!-- Supabase Key 输入对话框 -->
      <Transition name="overlay-fade">
        <div v-if="showSupabaseKeyDialog" class="overlay" @click.self="showSupabaseKeyDialog = false">
          <div class="dialog">
            <h3 class="dialog-title">{{ t('sync.supabaseKeyTitle') }}</h3>
            <input
              v-model="supabaseKeyInput"
              class="dialog-input"
              type="text"
              placeholder="eyJhbGciOiJIUzI1NiIs..."
              autocomplete="off"
            />
            <div class="dialog-actions">
              <button class="dialog-btn dialog-btn--secondary" @click="showSupabaseKeyDialog = false">{{ t('common.cancel') }}</button>
              <button class="dialog-btn dialog-btn--primary" :disabled="!supabaseKeyInput.trim()" @click="handleSaveSupabaseKey">{{ t('common.save') }}</button>
            </div>
          </div>
        </div>
      </Transition>

      <AppToast :message="toastMsg" />
    </main>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useSyncStore } from '@/stores/sync'
import {
  PHASE_ENSURE_GIST, PHASE_READ_MANIFEST, PHASE_READ_REMOTE, PHASE_DIFF,
  PHASE_PULL, PHASE_PUSH, PHASE_UPLOAD_IMAGES, PHASE_WRITE_DATA,
  CAUSE_NETWORK, CAUSE_RATE_LIMIT, CAUSE_AUTH, CAUSE_SERVER, CAUSE_DATA_FORMAT, CAUSE_UNKNOWN
} from '@/services/syncError'
import { getSupabaseClient, isSupabaseConfigured } from '@/utils/sync/supabaseClient'
import { useAuthStore } from '@/stores/auth'
import { scrollToTopAnimated } from '@/utils/scrollToTopAnimated'
import { formatDate } from '@/utils/format'
import { useI18n } from 'vue-i18n'
import { useToast } from '@/composables/useToast'
import NavBar from '@/components/common/NavBar.vue'
import AppToast from '@/components/common/AppToast.vue'

const { t } = useI18n()
const syncStore = useSyncStore()
const authStore = useAuthStore()

const pageBodyRef = ref(null)
const showResetConfirm = ref(false)
const showPullConflict = ref(false)
const showSyncConflict = ref(false)
const syncConflictData = ref({})
const { toastMsg, showToast } = useToast()
const syncNoticeText = computed(() => syncStore.syncNotice?.message || '')
const syncNoticeLevel = computed(() => syncStore.syncNotice?.level || 'error')
const gistInfo = ref(null)
const pullConflictData = ref({})
const showSupabaseUrlDialog = ref(false)
const showSupabaseKeyDialog = ref(false)
const supabaseUrlInput = ref('')
const supabaseKeyInput = ref('')
const isTestingSupabase = ref(false)
const LOG_GROUP_SEQUENCE = [
  'manifest',
  'data',
  'recharge-data',
  'events-data',
  'other'
]
const LOG_GROUP_LABEL_KEYS = {
  manifest: 'manifest',
  data: 'data',
  'recharge-data': 'recharge-data',
  'events-data': 'events-data',
  other: 'sync.logGroup.other'
}
const DEFAULT_OPEN_LOG_GROUPS = []
const expandedLogGroups = ref(new Set(DEFAULT_OPEN_LOG_GROUPS))

const groupedSyncLogs = computed(() => {
  const groupMap = new Map()

  for (const entry of syncStore.syncLogs) {
    const key = resolveLogGroupKey(entry)
    if (!groupMap.has(key)) {
      const labelKey = LOG_GROUP_LABEL_KEYS[key] || LOG_GROUP_LABEL_KEYS.other
      groupMap.set(key, {
        key,
        label: labelKey.startsWith('sync.') ? t(labelKey) : labelKey,
        logs: []
      })
    }

    groupMap.get(key).logs.push(entry)
  }

  const orderedGroups = []
  for (const key of LOG_GROUP_SEQUENCE) {
    const group = groupMap.get(key)
    if (group) {
      orderedGroups.push({
        ...group,
        totalDurationMs: group.logs.reduce((sum, log) => sum + (Number(log.durationMs) || 0), 0)
      })
      groupMap.delete(key)
    }
  }

  for (const group of groupMap.values()) {
    orderedGroups.push({
      ...group,
      totalDurationMs: group.logs.reduce((sum, log) => sum + (Number(log.durationMs) || 0), 0)
    })
  }

  return orderedGroups
})

function resolveLogGroupKey(entry) {
  const title = String(entry?.title || '')

  if (title.includes('manifest.json')) return 'manifest'
  if (title.includes('recharge-data.json')) return 'recharge-data'
  if (title.includes('events-data.json')) return 'events-data'
  if (title.includes('data.json')) return 'data'

  return String(entry?.category || 'other') || 'other'
}

function isLogGroupExpanded(key) {
  return expandedLogGroups.value.has(key)
}

function toggleLogGroup(key) {
  const next = new Set(expandedLogGroups.value)
  if (next.has(key)) {
    next.delete(key)
  } else {
    next.add(key)
  }
  expandedLogGroups.value = next
}

watch(() => syncStore.conflictData, (val) => {
  if (val?.isPullOnly) {
    pullConflictData.value = val
    showPullConflict.value = true
  } else {
    showPullConflict.value = false
  }
})

// 同步成功后自动关闭错误卡片
watch(() => syncStore.isSyncing, (syncing) => {
  if (!syncing && !syncStore.lastError && syncStore.syncPhase) {
    clearSyncError()
  }
})

const lastSyncDisplay = computed(() => {
  if (!syncStore.lastSyncedAt) return t('sync.neverSynced')
  return formatTime(syncStore.lastSyncedAt)
})

const statusBadgeClass = computed(() => {
  if (syncStore.isSyncing) return 'badge--syncing'
  if (syncStore.lastError) return 'badge--error'
  if (syncStore.syncBackend === 'supabase') {
    if (isSupabaseConfigured()) return 'badge--success'
    return 'badge--warning'
  }
  return 'badge--warning'
})

const statusBadgeText = computed(() => {
  if (syncStore.isSyncing) return t('sync.syncing')
  if (syncStore.lastError) return t('sync.hasError')
  if (syncStore.syncBackend === 'supabase') {
    if (isSupabaseConfigured()) return t('sync.connected')
    return t('sync.notConfigured')
  }
  return t('sync.notConfigured')
})

const PHASE_NAME_MAP = {
  [PHASE_ENSURE_GIST]: 'sync.phase.ensureGist',
  [PHASE_READ_MANIFEST]: 'sync.phase.readManifest',
  [PHASE_READ_REMOTE]: 'sync.phase.readRemote',
  [PHASE_DIFF]: 'sync.phase.diff',
  [PHASE_PULL]: 'sync.phase.pull',
  [PHASE_PUSH]: 'sync.phase.push',
  [PHASE_UPLOAD_IMAGES]: 'sync.phase.uploadImages',
  [PHASE_WRITE_DATA]: 'sync.phase.writeData'
}

const CAUSE_NAME_MAP = {
  [CAUSE_NETWORK]: 'sync.cause.network',
  [CAUSE_RATE_LIMIT]: 'sync.cause.rateLimit',
  [CAUSE_AUTH]: 'sync.cause.auth',
  [CAUSE_SERVER]: 'sync.cause.server',
  [CAUSE_DATA_FORMAT]: 'sync.cause.dataFormat',
  [CAUSE_UNKNOWN]: 'sync.cause.unknown'
}

const syncPhaseName = computed(() => {
  const key = PHASE_NAME_MAP[syncStore.syncPhase]
  return key ? t(key) : syncStore.syncPhase || ''
})
const syncCauseName = computed(() => {
  const key = CAUSE_NAME_MAP[syncStore.syncCause]
  return key ? t(key) : syncStore.syncCause || ''
})

function clearSyncError() {
  syncStore.syncPhase = null
  syncStore.syncCause = null
  syncStore.syncSuggestion = null
  syncStore.lastError = ''
  syncStore.syncStatus = ''
}

const remoteIdLabel = computed(() => t('sync.supabaseUrl'))
const remoteIdDisplay = computed(() => {
  if (syncStore.supabaseUrl) return syncStore.supabaseUrl
  if (isSupabaseConfigured()) return 'Built-in'
  return t('sync.notConfigured')
})

const collectionCount = computed(() => gistInfo.value?.collectionCount ?? '-')
const wishlistCount = computed(() => gistInfo.value?.wishlistCount ?? '-')
const trashCount = computed(() => gistInfo.value?.trashCount ?? '-')
const rechargeCount = computed(() => gistInfo.value?.rechargeCount ?? '-')
const eventCount = computed(() => gistInfo.value?.eventCount ?? '-')
const imageFileCount = computed(() => gistInfo.value?.imageFileCount ?? '-')

function resetPageScrollTop() {
  scrollToTopAnimated(() => pageBodyRef.value, 0)
}

function formatTime(isoString) {
  return formatDate(isoString, 'YYYY-MM-DD HH:mm')
}

function formatLogTime(isoString) {
  if (!isoString) return ''
  const date = new Date(isoString)
  const pad = (value) => String(value).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function formatLogDuration(durationMs) {
  const numericDuration = Number(durationMs)
  if (!Number.isFinite(numericDuration)) return ''

  const seconds = numericDuration / 1000
  return `${seconds >= 10 ? seconds.toFixed(1) : seconds.toFixed(2)}s`
}

async function loadGistInfo() {
  // If using Supabase backend, read manifest from Supabase table
  const readCount = (value) => (value === undefined || value === null ? null : Number(value) || 0)
  if (syncStore.syncBackend === 'supabase') {
    try {
      const db = getSupabaseClient()
      const { data, error } = await db.from('sync_manifest').select('*').eq('user_id', authStore.user?.id || '').limit(1)
      if (error || !data || data.length === 0) {
        gistInfo.value = null
        return
      }
      const row = data[0]
      gistInfo.value = {
        collectionCount: readCount(row.collection_count ?? row.collectionCount),
        wishlistCount: readCount(row.wishlist_count ?? row.wishlistCount),
        trashCount: readCount(row.trash_count ?? row.trashCount),
        rechargeCount: readCount(row.recharge_count ?? row.rechargeCount),
        eventCount: readCount(row.event_count ?? row.eventCount),
        imageGistId: row.image_bucket ?? row.imageGistId ?? '',
        rechargeGistId: '',
        eventGistId: '',
        imageFileCount: readCount(row.image_count ?? row.imageFileCount),
        imageUpdatedAt: row.image_updated_at ?? row.imageUpdatedAt ?? ''
      }
      return
    } catch (e) {
      gistInfo.value = null
      return
    }
  }
}

function buildImageSyncText(result) {
  const parts = []
  if (result?.uploadedImages > 0) parts.push(t('sync.uploadImages', { count: result.uploadedImages }))
  if (result?.reusedImages > 0) parts.push(t('sync.reuseImages', { count: result.reusedImages }))
  if (result?.restoredImages > 0) parts.push(t('sync.restoreImages', { count: result.restoredImages }))
  return parts.join('，')
}

async function handlePauseSyncToggle(event) {
  const paused = event.target.checked
  await syncStore.setSyncPaused(paused)
}

function buildEventSyncSummary(result) {
  if (!result) return ''
  if (result.action === 'no_changes') return ''
  return `，${t('sync.eventsAdded', { count: result.totalEvents ?? 0 })}`
}

function buildEventPullSummary(result) {
  if (!result) return ''
  const changed = Number(result.added || 0) + Number(result.updated || 0)
  if (changed <= 0) return ''
  return `，${t('sync.eventsAdded', { count: result.added || 0 })}、${t('sync.eventsUpdated', { count: result.updated || 0 })}`
}

function buildPullResultParts(result) {
  const parts = []
  if (result.importedGoods > 0) parts.push(t('sync.imported', { count: result.importedGoods }))
  if (result.updatedGoods > 0) parts.push(t('sync.updated', { count: result.updatedGoods }))
  if (result.importedTrash > 0) parts.push(t('sync.trashImported', { count: result.importedTrash }))
  if (result.importedRecharge > 0) parts.push(t('sync.rechargeAdded', { count: result.importedRecharge }))
  if (result.updatedRecharge > 0) parts.push(t('sync.rechargeUpdated', { count: result.updatedRecharge }))
  if (result.importedEvents > 0) parts.push(t('sync.eventsAdded', { count: result.importedEvents }))
  if (result.updatedEvents > 0) parts.push(t('sync.eventsUpdated', { count: result.updatedEvents }))
  return parts
}

function buildPushResultParts(result) {
  const parts = []
  if (result.updatedGoods > 0) parts.push(t('sync.updated', { count: result.updatedGoods }))
  if (result.updatedTrash > 0) parts.push(t('sync.trashImported', { count: result.updatedTrash }))
  if (result.updatedRecharge > 0) parts.push(t('sync.rechargeUpdated', { count: result.updatedRecharge }))
  if (result.updatedEvents > 0) parts.push(t('sync.eventsUpdated', { count: result.updatedEvents }))
  return parts
}

async function handleSync() {
  if (syncStore.isSyncing) return

  try {
    const result = await syncStore.sync()

    if (!result) {
      showToast(t('sync.uploadComplete'))
      await loadGistInfo()
      return
    }

    if (result.action === 'conflict') {
      syncConflictData.value = {
        remoteTime: syncStore.conflictData?.remoteTime,
        localTime: syncStore.conflictData?.localTime,
        localModifiedTime: syncStore.conflictData?.localModifiedTime
      }
      showSyncConflict.value = true
      return
    }

    let message = ''
    if (result.action === 'pulled') {
      const parts = buildPullResultParts(result)
      message = parts.length > 0 ? `${t('sync.pullComplete')}，${parts.join('，')}` : t('sync.dataUpToDate')
    } else if (result.action === 'no_changes') {
      message = t('sync.noUploadNeeded')
    } else if (result.action === 'pushed') {
      if (result.hasChanges) {
        const parts = buildPushResultParts(result)
        message = `${t('sync.uploadComplete')}，${parts.join('，')}`
      } else {
        message = t('sync.uploadComplete')
      }
    } else {
      message = t('sync.uploadComplete')
    }

    showToast(message, 3500)
    await loadGistInfo()
  } catch (error) {
    showToast(syncStore.syncSuggestion || t('sync.uploadFailed', { error: error.message }))
  }
}

async function handlePull() {
  if (syncStore.isSyncing) return

  try {
    const since = syncStore.lastSyncedAt ? new Date(syncStore.lastSyncedAt).getTime() : 0
    const tables = ['goods', 'events', 'recharge_records', 'goods_groups', 'goods_group_items']
    const result = await syncStore.pull({ tables, since })

    if (result?.action === 'pulled') {
      const parts = buildPullResultParts(result)
      let message = parts.length > 0 ? `${t('sync.pullComplete')}，${parts.join('，')}` : t('sync.dataUpToDate')
      showToast(message, 3500)
      await loadGistInfo()
    } else if (result?.action === 'no_changes') {
      let message = t('sync.dataUpToDate')
      showToast(message, 3500)
      await loadGistInfo()
    }
  } catch (error) {
    showToast(syncStore.syncSuggestion || t('sync.pullFailed', { error: error.message }))
  }
}

async function handlePullConflict(confirm) {
  showPullConflict.value = false
  try {
    const result = await syncStore.resolvePullConflict(confirm)

    if (result?.action === 'pulled') {
      const parts = buildPullResultParts(result)
      let message = parts.length > 0 ? `${t('sync.pullComplete')}，${parts.join('，')}` : t('sync.dataUpToDate')
      showToast(message, 3500)
      await loadGistInfo()
    } else if (result?.action === 'cancelled') {
      showToast(t('sync.pullCancelled'))
    }
  } catch (error) {
    showToast(syncStore.syncSuggestion || t('sync.pullFailed', { error: error.message }))
  }
}

async function handleSyncConflict(useRemote) {
  try {
    const result = await syncStore.resolveConflict(useRemote)
    showSyncConflict.value = false

    if (result?.action === 'pulled') {
      const parts = buildPullResultParts(result)
      let message = parts.length > 0 ? `${t('sync.pullComplete')}，${parts.join('，')}` : t('sync.dataUpToDate')
      showToast(message, 3500)
    } else if (result?.action === 'pushed') {
      showToast(t('sync.reuploaded'), 3500)
    }
    await loadGistInfo()
  } catch (error) {
    showToast(syncStore.syncSuggestion || (useRemote ? `${t('sync.pullFailed', { error: error.message })}` : `${t('sync.uploadFailed', { error: error.message })}`))
  }
}

async function handleReset() {
  await syncStore.resetConfig()
  gistInfo.value = null
  showResetConfirm.value = false
  showToast(t('sync.configCleared'))
}

// ── Supabase 后端配置 ──────────────────────────────────
const syncBackendLabel = computed(() => 'Supabase')
const supabaseUrlDisplay = computed(() => {
  if (syncStore.supabaseUrl) return syncStore.supabaseUrl
  if (isSupabaseConfigured()) return 'Built-in'
  return t('sync.notConfigured')
})
const supabaseKeyDisplay = computed(() => {
  if (syncStore.supabaseAnonKey) return '***' + syncStore.supabaseAnonKey.slice(-6)
  if (isSupabaseConfigured()) return '***built-in'
  return t('sync.notConfigured')
})

const selectedBackend = computed({
  get: () => syncStore.syncBackend,
  set: async (val) => {
    if (val === syncStore.syncBackend) return
    // selection is handled via confirm dialog; setter kept for reactivity
    syncStore.syncBackend = val
  }
})

const showBackendConfirm = ref(false)
const pendingBackend = ref('')

function chooseBackend(val) {
  if (val === syncStore.syncBackend) return
  // If user chooses Supabase but no config (manual or built-in), open URL dialog first
  if (val === 'supabase' && !isSupabaseConfigured()) {
    showSupabaseUrlDialog.value = true
    pendingBackend.value = val
    return
  }
  pendingBackend.value = val
  showBackendConfirm.value = true
}

async function confirmChooseBackend() {
  showBackendConfirm.value = false
  if (!pendingBackend.value) return
  await syncStore.setSyncBackend(pendingBackend.value)
  pendingBackend.value = ''
}

function cancelChooseBackend() {
  showBackendConfirm.value = false
  pendingBackend.value = ''
}

function openSupabaseUrlDialog() {
  supabaseUrlInput.value = syncStore.supabaseUrl || ''
  showSupabaseUrlDialog.value = true
}

function openSupabaseKeyDialog() {
  supabaseKeyInput.value = syncStore.supabaseAnonKey || ''
  showSupabaseKeyDialog.value = true
}

async function handleSaveSupabaseUrl() {
  const url = supabaseUrlInput.value.trim()
  if (!url) return
  await syncStore.saveSupabaseConfig(url, syncStore.supabaseAnonKey)
  showSupabaseUrlDialog.value = false
  // If key is also missing and we're in a backend switch flow, prompt for key next
  if (!syncStore.supabaseAnonKey && pendingBackend.value === 'supabase') {
    supabaseKeyInput.value = ''
    showSupabaseKeyDialog.value = true
  }
}

async function handleSaveSupabaseKey() {
  const key = supabaseKeyInput.value.trim()
  if (!key) return
  await syncStore.saveSupabaseConfig(syncStore.supabaseUrl, key)
  showSupabaseKeyDialog.value = false
  // If we were in a backend switch flow and both config values are now set, confirm the switch
  if (pendingBackend.value === 'supabase' && syncStore.supabaseUrl && syncStore.supabaseAnonKey) {
    showBackendConfirm.value = true
  }
}

async function handleTestSupabase() {
  if (!syncStore.supabaseUrl || !syncStore.supabaseAnonKey) {
    showToast(t('sync.pleaseConfigFirst'))
    return
  }
  isTestingSupabase.value = true
  try {
    const result = await syncStore.testSupabaseConnection(syncStore.supabaseUrl, syncStore.supabaseAnonKey)
    if (result.ok) {
      showToast(t('sync.connectionTestSuccess'))
    } else {
      showToast(result.error || t('sync.connectionTestFailed'))
    }
  } catch (e) {
    showToast(e.message || t('sync.connectionTestFailed'))
  } finally {
    isTestingSupabase.value = false
  }
}

onMounted(async () => {
  resetPageScrollTop()
  window.requestAnimationFrame(resetPageScrollTop)
  await syncStore.init()
  await loadGistInfo()
})
</script>

<style scoped src="../assets/views/SyncView.css"></style>

<style scoped>
/* Backend selection grid and card highlight */
.backend-grid {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
}
@media (max-width: 767px) {
  .backend-grid {
    flex-direction: column;
  }
}
.backend-card {
  flex: 1 1 0;
  text-align: left;
  transition: transform .08s ease, box-shadow .12s ease, border-color .12s ease;
  border: 1px solid var(--app-glass-border);
  background: var(--app-surface);
  color: var(--app-text);
}
.backend-card--active {
  border-color: var(--color-primary, #3b82f6);
  box-shadow: 0 6px 18px rgba(59,130,246,0.12);
  transform: translateY(-2px);
}
:global(html.theme-dark) .backend-card--active {
  box-shadow: 0 6px 18px rgba(59,130,246,0.22);
}
.backend-card .entry-icon {
  width: 48px;
  height: 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.detail-value--link {
  background: transparent;
  border: none;
  color: var(--color-primary, #3b82f6);
  padding: 0;
  font: inherit;
}

.sync-notice {
  margin: 12px 16px 0;
  padding: 12px 14px;
  border-radius: 16px;
  display: grid;
  gap: 4px;
  background: color-mix(in srgb, var(--app-surface) 88%, #fff);
  border: 1px solid color-mix(in srgb, var(--app-text) 12%, transparent);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.06);
}

.sync-notice--error {
  border-color: color-mix(in srgb, #dc2626 28%, transparent);
  background: color-mix(in srgb, #dc2626 10%, var(--app-surface));
}

.sync-notice--info {
  border-color: color-mix(in srgb, #2563eb 24%, transparent);
  background: color-mix(in srgb, #2563eb 10%, var(--app-surface));
}

.sync-notice__title {
  color: var(--app-text);
  font-size: 13px;
  font-weight: 700;
}

.sync-notice__body {
  color: var(--app-text-secondary);
  font-size: 13px;
  line-height: 1.5;
}

/* Dialog overrides: align z-index with this view's layering */
.overlay { z-index: 1200 }
</style>

