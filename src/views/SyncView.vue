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
            <button
              v-if="syncStore.syncBackend === 'gist' && showTokenInfo"
              type="button"
              class="hero-metric hero-metric--interactive"
              :disabled="!syncStore.token"
              @click="copyText(syncStore.token)"
            >
              <p class="hero-metric__label">{{ t('sync.syncToken') }}</p>
              <p class="hero-metric__value hero-metric__value--mono">{{ tokenDisplay }}</p>
            </button>
          </div>
        </article>
      </section>

      <Transition name="overlay-fade">
        <div v-if="showBackendConfirm" class="overlay" @click.self="cancelChooseBackend">
          <div class="dialog">
            <h3 class="dialog-title">{{ t('sync.switchBackend') }}</h3>
            <p class="dialog-desc">{{ t('sync.switchBackendDesc', { backend: pendingBackend === 'supabase' ? 'Supabase' : 'GitHub Gist' }) }}</p>
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
              <template v-if="syncStore.syncBackend === 'gist'">
                <button v-if="showTokenInfo" type="button" class="detail-row detail-row--button" :disabled="!syncStore.token" @click="copyText(syncStore.token)">
                  <span class="detail-label">Token</span>
                  <span class="detail-value detail-value--mono">{{ tokenDisplay }}</span>
                </button>
                <div class="detail-row">
                  <span class="detail-label">{{ t('sync.githubAccount') }}</span>
                  <span class="detail-value">{{ syncStore.githubLogin || t('common.notLoggedIn') }}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">{{ t('sync.syncPassword') }}</span>
                  <input
                    :value="syncStore.syncPassword"
                    class="password-input"
                    type="password"
                    :placeholder="t('sync.syncPasswordPlaceholder')"
                    autocomplete="off"
                    spellcheck="false"
                    @input="handlePasswordChange"
                  />
                </div>
                <div class="detail-row">
                  <span class="detail-label">{{ t('sync.enableEncryption') }}</span>
                  <label class="toggle-switch" :aria-label="t('sync.enableEncryption')">
                    <input
                      :checked="syncStore.encryptionEnabled"
                      :disabled="!syncStore.syncPassword"
                      type="checkbox"
                      @change="handleEncryptionToggle"
                    />
                    <span class="toggle-slider" />
                  </label>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Data Gist</span>
                  <span class="detail-value detail-value--mono">{{ syncStore.gistId || t('common.notCreated') }}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Image Gist</span>
                  <span class="detail-value detail-value--mono">{{ resolvedImageGistId || t('common.notCreated') }}</span>
                </div>
              </template>

              <template v-else-if="syncStore.syncBackend === 'supabase'">
                <div class="detail-row">
                  <span class="detail-label">{{ t('sync.supabaseUrl') }}</span>
                  <button type="button" class="detail-value detail-value--mono detail-value--link" @click="openSupabaseUrlDialog">{{ supabaseUrlDisplay }}</button>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Anon Key</span>
                  <button type="button" class="detail-value detail-value--mono detail-value--link" @click="openSupabaseKeyDialog">{{ supabaseKeyDisplay }}</button>
                </div>
              </template>

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

          <article v-if="false" class="panel-card">
            <div class="panel-head">
              <div>
                <p class="panel-kicker">Image Sync</p>
                <h3 class="panel-title">{{ t('sync.imageSync') }}</h3>
              </div>
            </div>

            <div class="detail-list">
              <div class="detail-row">
                <span class="detail-label">Image Gist</span>
                <span class="detail-value detail-value--mono">{{ resolvedImageGistId || t('common.notCreated') }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">{{ t('sync.imageFileCount') }}</span>
                <span class="detail-value">{{ imageFileCount }}</span>
              </div>
              <article class="stat-card stat-card--image">
                <p class="stat-label">Images</p>
                <p class="stat-value">{{ imageFileCount }}</p>
                <p class="stat-desc">{{ t('sync.remoteImagesDesc') }}</p>
              </article>
            </div>
            <p class="section-note">{{ t('sync.imageSyncTime', { time: imageSyncDisplay }) }}</p>
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
            :class="{ 'backend-card--active': syncStore.syncBackend === 'gist' }"
            @click="chooseBackend('gist')"
          >
            <span class="entry-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.57.11.78-.25.78-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.67 1.25 3.32.96.1-.75.4-1.25.72-1.54-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.47.11-3.07 0 0 .97-.31 3.18 1.18a11.04 11.04 0 0 1 2.9-.39c.99 0 1.98.13 2.9.39 2.2-1.49 3.17-1.18 3.17-1.18.62 1.6.23 2.78.11 3.07.73.81 1.18 1.84 1.18 3.1 0 4.44-2.69 5.4-5.25 5.68.41.36.77 1.08.77 2.18 0 1.58-.01 2.85-.01 3.24 0 .31.2.67.79.55A11.52 11.52 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5z" />
              </svg>
            </span>
            <div class="entry-body">
              <p class="entry-kicker">GitHub Gist</p>
              <h3 class="entry-name">{{ t('sync.gistBackend') }}</h3>
              <p class="entry-desc">{{ t('sync.gistBackendDesc') }}</p>
            </div>
            <svg class="entry-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>

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

      <section v-if="syncStore.syncBackend === 'gist'" class="content-section config-section">
        <div class="section-head">
          <p class="section-label">Config</p>
          <h2 class="section-title">{{ t('sync.configMaintenance') }}</h2>
        </div>

        <div class="action-grid">
          <a v-if="gistUrl" class="entry-card" :href="gistUrl" target="_blank" rel="noopener">
            <span class="entry-icon link-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </span>
            <div class="entry-body">
              <p class="entry-kicker">Remote Inspect</p>
              <h3 class="entry-name">{{ t('sync.viewDataGist') }}</h3>
              <p class="entry-desc">{{ t('sync.viewDataGistDesc') }}</p>
            </div>
            <svg class="entry-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </a>

          <a v-if="imageGistUrl" class="entry-card" :href="imageGistUrl" target="_blank" rel="noopener">
            <span class="entry-icon link-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </span>
            <div class="entry-body">
              <p class="entry-kicker">Image Store</p>
              <h3 class="entry-name">{{ t('sync.viewImageGist') }}</h3>
              <p class="entry-desc">{{ t('sync.viewImageGistDesc') }}</p>
            </div>
            <svg class="entry-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </a>

          <button type="button" class="entry-card" @click="openGithubLoginDialog">
            <span class="entry-icon token-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 3a9 9 0 1 0 9 9" />
                <path d="M12 12l4.5-4.5" />
                <path d="M12 12h7" />
              </svg>
            </span>
            <div class="entry-body">
              <p class="entry-kicker">GitHub OAuth</p>
              <h3 class="entry-name">{{ syncStore.githubLogin ? `${t('sync.relogin')}（${syncStore.githubLogin}）` : t('sync.githubLogin') }}</h3>
              <p class="entry-desc">{{ t('sync.githubLoginDesc') }}</p>
            </div>
            <svg class="entry-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>

          <button v-if="showManualTokenEntry" type="button" class="entry-card" @click="openTokenDialog">
            <span class="entry-icon token-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
            </span>
            <div class="entry-body">
              <p class="entry-kicker">GitHub Access</p>
              <h3 class="entry-name">{{ syncStore.token ? t('sync.manualTokenReplace') : t('sync.manualToken') }}</h3>
              <p class="entry-desc">{{ t('sync.manualTokenDesc') }}</p>
            </div>
            <svg class="entry-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>

          <button v-if="syncStore.gistId || resolvedImageGistId || resolvedRechargeGistId || resolvedEventGistId" type="button" class="entry-card entry-card--danger" @click="showResetConfirm = true">
            <span class="entry-icon danger-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M3 6h18" />
                <path d="M8 6V4h8v2" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
              </svg>
            </span>
            <div class="entry-body">
              <p class="entry-kicker">Reset</p>
              <h3 class="entry-name">{{ t('sync.clearConfig') }}</h3>
              <p class="entry-desc">{{ t('sync.clearConfigDesc') }}</p>
            </div>
            <svg class="entry-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </div>
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
              <button
                v-if="syncStore.syncCause === 'auth'"
                type="button"
                class="error-card__action"
                @click="openGithubLoginDialog"
              >
                {{ t('sync.relogin') }}
              </button>
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
        <div v-if="showTokenDialog" class="overlay" @click.self="closeTokenDialog">
          <div class="dialog">
            <h3 class="dialog-title">{{ t('sync.configGithubToken') }}</h3>
            <p class="dialog-desc">
              {{ t('sync.tokenDialogDesc') }}
              <a href="https://github.com/settings/tokens/new?scopes=gist&description=goods-app-sync" target="_blank" rel="noopener">{{ t('sync.createToken') }}</a>
            </p>
            <input
              v-model="tokenInput"
              class="dialog-input"
              type="password"
              placeholder="ghp_xxxxxxxxxxxx"
              autocomplete="off"
            />
            <div v-if="tokenError" class="dialog-error">{{ tokenError }}</div>
            <div v-if="tokenValidLogin" class="dialog-success">{{ t('sync.verified') }}：{{ tokenValidLogin }}</div>
            <div class="dialog-actions">
              <button class="dialog-btn dialog-btn--secondary" @click="closeTokenDialog">{{ t('common.cancel') }}</button>
              <button
                class="dialog-btn dialog-btn--primary"
                :disabled="isVerifyingToken || !tokenInput.trim()"
                @click="handleSaveToken"
              >
                {{ isVerifyingToken ? t('sync.verifying') : t('sync.verifyAndSave') }}
              </button>
            </div>
          </div>
        </div>
      </Transition>

      <GithubLoginDialog
        v-model="showGithubLoginDialog"
        @login-success="handleGithubLoginSuccess"
        @toast="showToast"
      />

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

      <Transition name="toast-fade">
        <div v-if="toastMsg" class="toast">{{ toastMsg }}</div>
      </Transition>
    </main>
  </div>
</template>

<script setup>
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSyncStore } from '@/stores/sync'
import {
  PHASE_ENSURE_GIST, PHASE_READ_MANIFEST, PHASE_READ_REMOTE, PHASE_DIFF,
  PHASE_PULL, PHASE_PUSH, PHASE_UPLOAD_IMAGES, PHASE_WRITE_DATA,
  CAUSE_NETWORK, CAUSE_RATE_LIMIT, CAUSE_AUTH, CAUSE_SERVER, CAUSE_DATA_FORMAT, CAUSE_UNKNOWN
} from '@/services/syncError'
import { validateToken, getGist, getGistFileContent } from '@/utils/github/gist'
import { getSupabaseClient } from '@/utils/sync/supabaseClient'
import {
  fetchGitHubUser,
  getGitHubDeviceFlowScope,
  getGitHubOAuthClientId,
  getGitHubVerificationUrl,
  pollGitHubAccessToken,
  requestGitHubDeviceCode
} from '@/utils/github/auth'
import { scrollToTopAnimated } from '@/utils/scrollToTopAnimated'
import { showSuccessToast, showFailToast } from 'vant'
import { Cell as VanCell, CellGroup as VanCellGroup, Radio as VanRadio, RadioGroup as VanRadioGroup, Button as VanButton, Dialog as VanDialog, Field as VanField } from 'vant'
import NavBar from '@/components/common/NavBar.vue'
import { useI18n } from 'vue-i18n'

const GithubLoginDialog = defineAsyncComponent(() => import('@/components/common/GithubLoginDialog.vue'))

const { t } = useI18n()
const syncStore = useSyncStore()
const route = useRoute()
const router = useRouter()
const githubOAuthClientId = getGitHubOAuthClientId()
const githubDeviceScope = getGitHubDeviceFlowScope()

const pageBodyRef = ref(null)
const showTokenDialog = ref(false)
const showGithubLoginDialog = ref(false)
const showResetConfirm = ref(false)
const showPullConflict = ref(false)
const showSyncConflict = ref(false)
const syncConflictData = ref({})
const tokenInput = ref('')
const tokenError = ref('')
const tokenValidLogin = ref('')
const isVerifyingToken = ref(false)
const githubDeviceInfo = ref(null)
const githubLoginStatus = ref('')
const githubLoginError = ref('')
const isRequestingGithubDeviceCode = ref(false)
const isPollingGithubLogin = ref(false)
const toastMsg = ref('')
const syncNoticeText = computed(() => syncStore.syncNotice?.message || '')
const syncNoticeLevel = computed(() => syncStore.syncNotice?.level || 'error')
const gistInfo = ref(null)
const pullConflictData = ref({})
const showSupabaseUrlDialog = ref(false)
const showSupabaseKeyDialog = ref(false)
const supabaseUrlInput = ref('')
const supabaseKeyInput = ref('')
const isTestingSupabase = ref(false)
let githubLoginAbortController = null
const LOG_GROUP_SEQUENCE = [
  'manifest',
  'data',
  'recharge-data',
  'events-data',
  'image-gist',
  'recharge-gist',
  'event-gist',
  'image-merge',
  'local-collection',
  'local-recharge',
  'local-event',
  'update-image-gist',
  'update-main-gist',
  'image-file',
  'event-cover-file',
  'other'
]
const LOG_GROUP_LABEL_KEYS = {
  manifest: 'manifest',
  data: 'data',
  'recharge-data': 'recharge-data',
  'events-data': 'events-data',
  'image-gist': 'sync.logGroup.imageGist',
  'recharge-gist': 'sync.logGroup.rechargeGist',
  'event-gist': 'sync.logGroup.eventGist',
  'image-merge': 'sync.logGroup.imageMerge',
  'local-collection': 'sync.logGroup.localCollection',
  'local-recharge': 'sync.logGroup.localRecharge',
  'local-event': 'sync.logGroup.localEvent',
  'update-image-gist': 'sync.logGroup.updateImageGist',
  'update-main-gist': 'sync.logGroup.updateMainGist',
  'image-file': 'sync.logGroup.imageFile',
  'event-cover-file': 'sync.logGroup.eventCover',
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
  if (title.includes('读取图片 Gist') || title.includes('检查图片 Gist')) return 'image-gist'
  if (title.includes('检查充值 Gist')) return 'recharge-gist'
  if (title.includes('检查活动 Gist')) return 'event-gist'
  if (title.includes('恢复收藏图片') || title.includes('恢复回收站图片') || title.includes('恢复活动封面')) return 'image-merge'
  if (title.includes('整理本地收藏/回收站数据')) return 'local-collection'
  if (title.includes('整理本地充值数据')) return 'local-recharge'
  if (title.includes('整理本地活动数据')) return 'local-event'
  if (title.includes('更新图片 Gist')) return 'update-image-gist'
  if (title.includes('更新主同步 Gist')) return 'update-main-gist'
  if (title.includes('读取图片文件')) return 'image-file'
  if (title.includes('读取活动封面文件')) return 'event-cover-file'

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
let toastTimer = null

watch(() => syncStore.conflictData, (val) => {
  if (val?.isPullOnly) {
    pullConflictData.value = val
    showPullConflict.value = true
  } else {
    showPullConflict.value = false
  }
})

const lastSyncDisplay = computed(() => {
  if (!syncStore.lastSyncedAt) return t('sync.neverSynced')
  return formatTime(syncStore.lastSyncedAt)
})

const resolvedImageGistId = computed(() => gistInfo.value?.imageGistId || syncStore.imageGistId || '')
const resolvedRechargeGistId = computed(() => gistInfo.value?.rechargeGistId || syncStore.gistId || '')
const resolvedEventGistId = computed(() => gistInfo.value?.eventGistId || syncStore.gistId || '')

const statusBadgeClass = computed(() => {
  if (syncStore.isSyncing) return 'badge--syncing'
  if (syncStore.lastError) return 'badge--error'
  if (syncStore.githubLogin) return 'badge--success'
  if (!syncStore.token) return 'badge--warning'
  if (syncStore.gistId) return 'badge--success'
  return 'badge--warning'
})

const statusBadgeText = computed(() => {
  if (syncStore.isSyncing) return t('sync.syncing')
  if (syncStore.lastError) return t('sync.hasError')
  if (syncStore.githubLogin) return t('sync.loggedIn')
  if (!syncStore.token) return t('sync.notConfigured')
  if (syncStore.gistId) return t('sync.connected')
  return t('sync.pendingUpload')
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

const isUsingGithubLogin = computed(() => (
  !!syncStore.githubLogin && syncStore.githubAuthMethod === 'device-flow'
))

const showTokenInfo = computed(() => !isUsingGithubLogin.value)

const showManualTokenEntry = computed(() => !isUsingGithubLogin.value)

const githubVerificationUrl = computed(() => getGitHubVerificationUrl(githubDeviceInfo.value))
const githubDeviceExpiresText = computed(() => {
  if (!githubDeviceInfo.value?.expires_in) return '--'
  const expiresIn = Number(githubDeviceInfo.value.expires_in)
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) return '--'
  const minutes = Math.floor(expiresIn / 60)
  const seconds = expiresIn % 60
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`
})

const tokenDisplay = computed(() => {
  if (!syncStore.token) return t('sync.notConfigured')
  const token = syncStore.token
  return `${token.slice(0, 4)}...${token.slice(-4)}`
})

const remoteIdLabel = computed(() => syncStore.syncBackend === 'supabase' ? t('sync.supabaseUrl') : t('sync.remoteGist'))
const remoteIdDisplay = computed(() => {
  if (syncStore.syncBackend === 'supabase') return syncStore.supabaseUrl || t('sync.notConfigured')
  return syncStore.gistId || t('common.notCreated')
})

const gistUrl = computed(() => {
  if (!syncStore.gistId) return ''
  return `https://gist.github.com/${syncStore.gistId}`
})

const imageGistUrl = computed(() => {
  if (!resolvedImageGistId.value) return ''
  return `https://gist.github.com/${resolvedImageGistId.value}`
})

const rechargeGistUrl = computed(() => {
  if (!resolvedRechargeGistId.value) return ''
  return `https://gist.github.com/${resolvedRechargeGistId.value}`
})

const eventGistUrl = computed(() => {
  if (!resolvedEventGistId.value) return ''
  return `https://gist.github.com/${resolvedEventGistId.value}`
})

const collectionCount = computed(() => gistInfo.value?.collectionCount ?? '-')
const wishlistCount = computed(() => gistInfo.value?.wishlistCount ?? '-')
const trashCount = computed(() => gistInfo.value?.trashCount ?? '-')
const rechargeCount = computed(() => gistInfo.value?.rechargeCount ?? '-')
const eventCount = computed(() => gistInfo.value?.eventCount ?? '-')
const imageFileCount = computed(() => gistInfo.value?.imageFileCount ?? '-')
const imageSyncDisplay = computed(() => {
  if (!gistInfo.value?.imageUpdatedAt) return t('sync.neverSynced')
  return formatTime(gistInfo.value.imageUpdatedAt)
})

function resetPageScrollTop() {
  scrollToTopAnimated(() => pageBodyRef.value, 0)
}

function formatTime(isoString) {
  if (!isoString) return ''
  const date = new Date(isoString)
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
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

function showToast(message, duration = 2600) {
  toastMsg.value = message
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toastMsg.value = ''
  }, duration)
}

async function loadGistInfo() {
  // If using Supabase backend, read manifest from Supabase table
  const readCount = (value) => (value === undefined || value === null ? null : Number(value) || 0)
  if (syncStore.syncBackend === 'supabase') {
    try {
      const db = getSupabaseClient()
      const { data, error } = await db.from('sync_manifest').select('*').eq('id', 'default').limit(1)
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
        rechargeGistId: syncStore.gistId || '',
        eventGistId: syncStore.gistId || '',
        imageFileCount: readCount(row.image_count ?? row.imageFileCount),
        imageUpdatedAt: row.image_updated_at ?? row.imageUpdatedAt ?? ''
      }
      return
    } catch (e) {
      gistInfo.value = null
      return
    }
  }

  // Fallback: Gist backend
  if (!syncStore.token || !syncStore.gistId) {
    gistInfo.value = null
    return
  }

  try {
    const gist = await getGist(syncStore.token, syncStore.gistId)
    if (!gist) {
      gistInfo.value = null
      return
    }

    const manifestContent = await getGistFileContent(syncStore.token, gist, 'manifest.json')
    const manifest = manifestContent ? JSON.parse(manifestContent) : null

    gistInfo.value = {
      collectionCount: readCount(manifest?.collectionCount),
      wishlistCount: readCount(manifest?.wishlistCount),
      trashCount: readCount(manifest?.trashCount),
      rechargeCount: readCount(manifest?.rechargeCount),
      eventCount: readCount(manifest?.eventCount),
      imageGistId: manifest?.imageGistId || '',
      rechargeGistId: syncStore.gistId || '',
      eventGistId: syncStore.gistId || '',
      imageFileCount: readCount(manifest?.imageFileCount),
      imageUpdatedAt: manifest?.imageUpdatedAt || ''
    }
  } catch {
    gistInfo.value = null
  }
}

function buildImageSyncText(result) {
  const parts = []
  if (result?.uploadedImages > 0) parts.push(t('sync.uploadImages', { count: result.uploadedImages }))
  if (result?.reusedImages > 0) parts.push(t('sync.reuseImages', { count: result.reusedImages }))
  if (result?.restoredImages > 0) parts.push(t('sync.restoreImages', { count: result.restoredImages }))
  return parts.join('，')
}

async function handlePasswordChange(event) {
  const password = event.target.value
  try {
    await syncStore.setSyncPassword(password)
    if (!password && syncStore.encryptionEnabled) {
      await syncStore.setEncryptionEnabled(false)
    }
  } catch (e) {
    console.error(t('sync.setPwdFailed'), e)
  }
}

async function handleEncryptionToggle(event) {
  const enabled = event.target.checked
  try {
    await syncStore.setEncryptionEnabled(enabled)
  } catch (e) {
    console.error(t('sync.toggleEncryptionFailed'), e)
    event.target.checked = !enabled
  }
}

async function copyText(text) {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    showToast(t('common.copied'))
  } catch {
    showToast(t('common.copyFailed'))
  }
}

function openEventGist() {
  if (!eventGistUrl.value) {
    showToast(t('sync.noGistYet'))
    return
  }
  window.open(eventGistUrl.value, '_blank', 'noopener')
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
    const result = await syncStore.fullSync()

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
    const result = await syncStore.pullOnly()

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
      showToast(t('sync.uploadComplete'), 3500)
    }
    await loadGistInfo()
  } catch (error) {
    showToast(syncStore.syncSuggestion || (useRemote ? `${t('sync.pullFailed', { error: error.message })}` : `${t('sync.uploadFailed', { error: error.message })}`))
  }
}

function openTokenDialog() {
  tokenInput.value = syncStore.token
  tokenError.value = ''
  tokenValidLogin.value = ''
  showTokenDialog.value = true
}

function resetGithubLoginState() {
  githubDeviceInfo.value = null
  githubLoginStatus.value = ''
  githubLoginError.value = ''
  isRequestingGithubDeviceCode.value = false
  isPollingGithubLogin.value = false
}

function closeGithubLoginDialog() {
  showGithubLoginDialog.value = false
  if (githubLoginAbortController) {
    githubLoginAbortController.abort()
    githubLoginAbortController = null
  }
  resetGithubLoginState()
}

function openGithubLoginDialog() {
  showGithubLoginDialog.value = true
  resetGithubLoginState()
  if (!githubOAuthClientId) {
    githubLoginError.value = t('sync.githubOAuthNotConfigured')
  }
}

function openGithubVerificationPage() {
  const url = githubVerificationUrl.value
  if (!url) return
  window.open(url, '_blank', 'noopener')
}

function closeTokenDialog() {
  showTokenDialog.value = false
  tokenInput.value = ''
  tokenError.value = ''
  tokenValidLogin.value = ''
}

async function handleSaveToken() {
  const input = tokenInput.value.trim()
  if (!input) return

  isVerifyingToken.value = true
  tokenError.value = ''

  try {
    const check = await validateToken(input)
    if (!check.valid) {
      tokenError.value = t('sync.tokenInvalid')
      return
    }
    tokenValidLogin.value = check.login
    await syncStore.saveToken(input, { login: check.login, userId: check.userId, authMethod: 'token' })
    await syncStore.init()
    showToast(`${t('sync.tokenSaved')}（${tokenValidLogin.value}）`)
    closeTokenDialog()
    await loadGistInfo()
  } catch (error) {
    tokenError.value = error.message
  } finally {
    isVerifyingToken.value = false
  }
}

async function handleGithubLoginSuccess(user) {
  showToast(`${t('sync.githubLoginSuccess')}（${user.login}）`, 3200)
  showGithubLoginDialog.value = false
  await loadGistInfo()
}

onBeforeUnmount(() => {
  if (githubLoginAbortController) {
    githubLoginAbortController.abort()
    githubLoginAbortController = null
  }
})

async function handleReset() {
  await syncStore.resetConfig()
  gistInfo.value = null
  showResetConfirm.value = false
  showToast(t('sync.configCleared'))
}

// ── Supabase 后端配置 ──────────────────────────────────
const syncBackendLabel = computed(() => syncStore.syncBackend === 'supabase' ? 'Supabase' : 'GitHub Gist')
const supabaseUrlDisplay = computed(() => syncStore.supabaseUrl || t('sync.notConfigured'))
const supabaseKeyDisplay = computed(() => syncStore.supabaseAnonKey ? '***' + syncStore.supabaseAnonKey.slice(-6) : t('sync.notConfigured'))

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
  // If user chooses Supabase but config missing, open URL dialog first
  if (val === 'supabase' && (!syncStore.supabaseUrl || !syncStore.supabaseAnonKey)) {
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
      showSuccessToast(t('sync.connectionTestSuccess'))
    } else {
      showFailToast(result.error || t('sync.connectionTestFailed'))
    }
  } catch (e) {
    showFailToast(e.message || t('sync.connectionTestFailed'))
  } finally {
    isTestingSupabase.value = false
  }
}

onMounted(async () => {
  resetPageScrollTop()
  window.requestAnimationFrame(resetPageScrollTop)
  await syncStore.init()
  await loadGistInfo()

  if (route.query.openLogin === '1') {
    openGithubLoginDialog()
    await router.replace({ path: route.path, query: {} })
  }
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

