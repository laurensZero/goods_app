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
              <img v-if="displayAvatarSrc" class="account-avatar" :src="displayAvatarSrc" :alt="t('my.avatar')" />
              <span v-else class="account-avatar account-avatar--placeholder">{{ avatarInitial }}</span>
              <input ref="avatarInputRef" type="file" accept="image/*" class="avatar-file-input" @change="onAvatarFileChange" />
            </div>

            <div class="account-copy">
              <h1 class="account-name">
                {{ authStore.userDisplayName || t('my.authNotConnected') }}
                <button v-if="authStore.isLoggedIn" type="button" class="name-edit-btn" @click="openProfileEditSheet" :aria-label="t('my.rename')">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                </button>
              </h1>
              <div class="account-tags">
                <span class="status-pill" :class="authStore.isLoggedIn ? 'status-pill--online' : 'status-pill--idle'">
                  {{ authStore.isLoggedIn ? t('my.authConnected') : t('my.authNotConnected') }}
                </span>
                <span v-if="authStore.userEmail" class="status-pill status-pill--soft">{{ authStore.userEmail }}</span>
                <span class="status-pill status-pill--soft">{{ syncStore.lastSyncedAt ? t('my.lastSync', { time: formatDate(syncStore.lastSyncedAt, 'YYYY-MM-DD HH:mm') }) : t('my.neverSynced') }}</span>
              </div>
            </div>

            <div class="account-actions">
              <button v-if="!authStore.isLoggedIn" type="button" class="hero-action hero-action--primary" @click="handleLogin">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 3a9 9 0 1 0 9 9" />
                  <path d="M12 12l4.5-4.5" />
                  <path d="M12 12h7" />
                </svg>
                <span>{{ t('my.authLogin') }}</span>
              </button>

              <button v-if="authStore.isLoggedIn" type="button" class="hero-action hero-action--primary" @click="handleLogin">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 3a9 9 0 1 0 9 9" />
                  <path d="M12 12l4.5-4.5" />
                  <path d="M12 12h7" />
                </svg>
                <span>{{ t('my.relogin') }}</span>
              </button>

              <button type="button" class="hero-action" :disabled="!authStore.isLoggedIn" @click="openLogoutDialog">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M10 17l5-5-5-5" />
                  <path d="M15 12H3" />
                  <path d="M21 4v16" />
                </svg>
                <span>{{ t('my.logout') }}</span>
              </button>

              <button v-if="authStore.isLoggedIn" type="button" class="hero-action" @click="openAccountManageSheet">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                <span>{{ t('my.accountManage') }}</span>
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
              <span class="shortcut-row__meta">{{ authStore.isLoggedIn ? t('my.connectedShort') : t('my.gotoLogin') }}</span>
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
            <div v-if="authStore.isLoggedIn" class="detail-row">
              <span class="detail-row__label">{{ t('my.authEmail') }}</span>
              <span class="detail-row__value">{{ authStore.userEmail || t('my.notLoggedIn') }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-row__label">{{ t('my.recentSync') }}</span>
              <span class="detail-row__value">{{ syncStore.lastSyncedAt ? formatDate(syncStore.lastSyncedAt, 'YYYY-MM-DD HH:mm') : t('my.neverSyncedDetail') }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-row__label">{{ t('my.syncStatus') }}</span>
              <span class="detail-row__value">{{ syncStore.syncStatus || (authStore.isLoggedIn ? t('my.ready') : t('my.unprocessed')) }}</span>
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

    <SupabaseLoginDialog
      v-model="showLoginDialog"
      @login-success="handleLoginSuccess"
      @toast="onDialogToast"
    />

    <Teleport to="body">
      <Transition name="sheet-pop">
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

    <Transition name="sheet-pop">
      <div v-if="showLogoutDialog" class="login-overlay" @click.self="closeLogoutDialog">
        <section class="login-sheet" role="dialog" aria-modal="true" aria-labelledby="logoutSheetTitle">
          <h2 id="logoutSheetTitle" class="login-sheet__title">{{ t('my.logout') }}</h2>
          <p class="login-sheet__desc">
            {{ t('my.authLogoutDesc') }}
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
    </Transition>

    <Transition name="sheet-pop">
      <div v-if="showProfileEditSheet" class="login-overlay" @click.self="closeProfileEditSheet">
        <section class="login-sheet" role="dialog" aria-modal="true" aria-labelledby="profileEditSheetTitle">
          <h2 id="profileEditSheetTitle" class="login-sheet__title">{{ t('my.rename') }}</h2>
          <div class="rename-field">
            <input
              v-model="renameInput"
              class="auth-input"
              type="text"
              :placeholder="t('my.authDisplayName')"
              maxlength="30"
              @keydown.enter="confirmRename"
            />
          </div>
          <p v-if="renameError" class="rename-error">{{ renameError }}</p>
          <div class="login-sheet__actions">
            <button type="button" class="login-sheet__button login-sheet__button--primary" :disabled="!renameInput.trim() || renameLoading" @click="confirmRename">
              {{ renameLoading ? '...' : t('common.confirm') }}
            </button>
            <button type="button" class="login-sheet__button login-sheet__button--secondary" @click="chooseNewAvatar">
              {{ t('my.changeAvatar') }}
            </button>
            <button v-if="displayAvatarSrc" type="button" class="login-sheet__button login-sheet__button--secondary" @click="editExistingAvatar">
              {{ t('my.editCurrentAvatar') }}
            </button>
            <button v-if="displayAvatarSrc" type="button" class="login-sheet__button login-sheet__button--secondary" @click="confirmResetAvatar">
              {{ t('my.resetAvatar') }}
            </button>
            <button type="button" class="login-sheet__button login-sheet__button--secondary" @click="closeProfileEditSheet">
              {{ t('my.cancel') }}
            </button>
          </div>
        </section>
      </div>
    </Transition>

    <!-- Avatar Crop Editor -->
    <QuickImageEditorDialog
      v-model:show="showAvatarEditor"
      :source-file="avatarEditorFile"
      simple-mode
      @save="onAvatarEditorSave"
    />

    <!-- Change Password Dialog -->
    <Transition name="sheet-pop">
      <div v-if="showChangePasswordSheet" class="login-overlay" @click.self="closeChangePasswordSheet">
        <section class="login-sheet" role="dialog" aria-modal="true" aria-labelledby="changePasswordTitle">
          <h2 id="changePasswordTitle" class="login-sheet__title">{{ t('my.changePasswordTitle') }}</h2>

          <form class="auth-form" @submit.prevent="confirmChangePassword">
            <label class="auth-field">
              <span class="auth-field__label">{{ t('my.currentPassword') }}</span>
              <input
                v-model="changePasswordOld"
                class="auth-input"
                type="password"
                :placeholder="t('my.currentPassword')"
                autocomplete="current-password"
                required
              />
            </label>

            <label class="auth-field">
              <span class="auth-field__label">{{ t('my.newPassword') }}</span>
              <input
                v-model="changePasswordNew"
                class="auth-input"
                type="password"
                :placeholder="t('my.newPassword')"
                autocomplete="new-password"
                required
                minlength="6"
              />
            </label>

            <label class="auth-field">
              <span class="auth-field__label">{{ t('my.confirmNewPassword') }}</span>
              <input
                v-model="changePasswordConfirm"
                class="auth-input"
                type="password"
                :placeholder="t('my.confirmNewPassword')"
                autocomplete="new-password"
                required
              />
            </label>

            <p v-if="changePasswordError" class="rename-error">{{ changePasswordError }}</p>

            <div class="login-sheet__actions">
              <button type="submit" class="login-sheet__button login-sheet__button--primary" :disabled="changePasswordLoading || !changePasswordOld || !changePasswordNew || !changePasswordConfirm">
                {{ changePasswordLoading ? '...' : t('common.confirm') }}
              </button>
              <button type="button" class="login-sheet__button login-sheet__button--secondary" @click="closeChangePasswordSheet">
                {{ t('my.cancel') }}
              </button>
            </div>
          </form>
        </section>
      </div>
    </Transition>

    <!-- Account Management Dialog -->
    <Transition name="sheet-pop">
      <div v-if="showAccountManageSheet" class="login-overlay" @click.self="closeAccountManageSheet">
        <section class="login-sheet login-sheet--tall" role="dialog" aria-modal="true" aria-labelledby="accountManageTitle">
          <h2 id="accountManageTitle" class="login-sheet__title">{{ t('my.accountManage') }}</h2>

          <!-- Current Email -->
          <div class="account-manage-section">
            <h3 class="account-manage-section__title">{{ t('my.authEmail') }}</h3>
            <div class="account-manage-item">
              <div class="account-manage-item__info">
                <span class="account-manage-item__provider">{{ t('my.authEmail') }}</span>
                <span class="account-manage-item__email">{{ authStore.userEmail }}</span>
              </div>
              <button
                type="button"
                class="login-sheet__button login-sheet__button--secondary-sm"
                @click="openChangeEmail"
              >
                {{ t('my.changeEmail') }}
              </button>
            </div>
          </div>

          <!-- Change Email Form (hidden by default) -->
          <div v-if="showChangeEmailForm" class="account-manage-section">
            <form class="auth-form" @submit.prevent="confirmChangeEmail">
              <label class="auth-field">
                <span class="auth-field__label">{{ t('my.newEmail') }}</span>
                <input
                  v-model="changeEmailNew"
                  class="auth-input"
                  type="email"
                  :placeholder="t('my.authEmail')"
                  autocomplete="email"
                  required
                />
              </label>
              <p v-if="changeEmailError" class="rename-error">{{ changeEmailError }}</p>
              <p v-if="changeEmailSent" class="dialog-success">{{ t('my.changeEmailSent') }}</p>
              <div class="login-sheet__actions">
                <button type="submit" class="login-sheet__button login-sheet__button--primary" :disabled="changeEmailLoading || !changeEmailNew || changeEmailNew === authStore.userEmail">
                  {{ changeEmailLoading ? '...' : t('common.confirm') }}
                </button>
                <button type="button" class="login-sheet__button login-sheet__button--secondary" @click="closeChangeEmail">
                  {{ t('my.cancel') }}
                </button>
              </div>
            </form>
          </div>

          <!-- Linked Accounts List -->
          <div class="account-manage-section">
            <h3 class="account-manage-section__title">{{ t('my.linkedAccounts') }}</h3>
            <div v-if="authStore.linkedProviders.length === 0" class="account-manage-empty">
              {{ t('my.notLoggedIn') }}
            </div>
            <div v-for="identity in authStore.linkedProviders" :key="identity.id" class="account-manage-item">
              <div class="account-manage-item__info">
                <span class="account-manage-item__provider">{{ getProviderLabel(identity.provider) }}</span>
                <span class="account-manage-item__email">{{ identity.identity_data?.email || identity.identity_data?.name || '' }}</span>
              </div>
              <button
                type="button"
                class="login-sheet__button login-sheet__button--danger-sm"
                :disabled="authStore.linkedProviders.length <= 1"
                @click="confirmUnlinkProvider(identity)"
              >
                {{ t('my.unlinkProvider') }}
              </button>
            </div>
          </div>

          <!-- Link New Provider -->
          <div class="account-manage-section">
            <h3 class="account-manage-section__title">{{ t('my.linkProvider') }}</h3>
            <div class="social-buttons">
              <button type="button" class="social-btn social-btn--google" :disabled="authStore.isLoading" @click="handleLinkProvider('google')">
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                <span>Google</span>
              </button>
              <button type="button" class="social-btn social-btn--github" :disabled="authStore.isLoading" @click="handleLinkProvider('github')">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
                <span>GitHub</span>
              </button>
              <button type="button" class="social-btn social-btn--microsoft" :disabled="authStore.isLoading" @click="handleLinkProvider('azure')">
                <svg viewBox="0 0 21 21" width="20" height="20" aria-hidden="true">
                  <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
                  <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
                  <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
                  <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
                </svg>
                <span>Microsoft</span>
              </button>
            </div>
          </div>

          <!-- Change Password Button -->
          <div class="account-manage-section">
            <button type="button" class="login-sheet__button login-sheet__button--secondary login-sheet__button--full" @click="openChangePasswordFromManage">
              {{ t('my.changePassword') }}
            </button>
          </div>

          <!-- Delete Account Button -->
          <div class="account-manage-section">
            <button type="button" class="login-sheet__button login-sheet__button--danger login-sheet__button--full" @click="openDeleteAccountFromManage">
              {{ t('my.deleteAccount') }}
            </button>
          </div>

          <div class="login-sheet__actions">
            <button type="button" class="login-sheet__button login-sheet__button--secondary" @click="closeAccountManageSheet">
              {{ t('my.close') }}
            </button>
          </div>
        </section>
      </div>
    </Transition>

    <!-- Delete Account Dialog -->
    <Transition name="sheet-pop">
      <div v-if="showDeleteAccountSheet" class="login-overlay" @click.self="closeDeleteAccountSheet">
        <section class="login-sheet" role="dialog" aria-modal="true" aria-labelledby="deleteAccountTitle">
          <h2 id="deleteAccountTitle" class="login-sheet__title login-sheet__title--danger">{{ t('my.deleteAccountTitle') }}</h2>
          <p class="login-sheet__desc login-sheet__desc--danger">{{ t('my.deleteAccountDesc') }}</p>

          <form class="auth-form" @submit.prevent="confirmDeleteAccount">
            <label class="auth-field">
              <span class="auth-field__label">{{ t('my.deleteAccountConfirmHint') }}</span>
              <input
                v-model="deleteAccountEmail"
                class="auth-input"
                type="email"
                :placeholder="t('my.authEmail')"
                autocomplete="email"
                required
              />
            </label>

            <label class="auth-field">
              <span class="auth-field__label">{{ t('my.currentPassword') }}</span>
              <input
                v-model="deleteAccountPassword"
                class="auth-input"
                type="password"
                :placeholder="t('my.authPassword')"
                autocomplete="current-password"
                required
              />
            </label>

            <p v-if="deleteAccountError" class="rename-error">{{ deleteAccountError }}</p>

            <div class="login-sheet__actions">
              <button type="submit" class="login-sheet__button login-sheet__button--danger" :disabled="deleteAccountLoading || deleteAccountEmail !== authStore.userEmail || !deleteAccountPassword">
                {{ deleteAccountLoading ? '...' : t('my.deleteAccount') }}
              </button>
              <button type="button" class="login-sheet__button login-sheet__button--secondary" @click="closeDeleteAccountSheet">
                {{ t('my.cancel') }}
              </button>
            </div>
          </form>
        </section>
      </div>
    </Transition>

    <AppToast :message="toastMsg" />
  </div>
</template>

<script setup>
import { computed, onActivated, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import SupabaseLoginDialog from '@/components/common/SupabaseLoginDialog.vue'
import QrScannerOverlay from '@/components/my/QrScannerOverlay.vue'
import AppToast from '@/components/common/AppToast.vue'
import QuickImageEditorDialog from '@/components/image/QuickImageEditorDialog.vue'
import { getCachedImage, peekCachedImage } from '@/utils/image/cache'
import { useToast } from '@/composables/useToast'
import { formatDate, formatPrice } from '@/utils/format'
import { useSyncStore } from '@/stores/sync'
import { useAuthStore } from '@/stores/auth'
import { useExchangeRateStore } from '@/stores/exchangeRate'
import { runWithRouteTransition } from '@/utils/routeTransition'
import { scrollToTopAnimated } from '@/utils/scrollToTopAnimated'
import { useI18n } from 'vue-i18n'
import { useQrScanner } from '@/composables/my/useQrScanner'
import { useBudgetCalculation } from '@/composables/my/useBudgetCalculation'
import { readPersisted, writePersisted } from '@/utils/platform/storage'

defineOptions({ name: 'MyView' })

const { t } = useI18n()
const router = useRouter()
const syncStore = useSyncStore()
const authStore = useAuthStore()
const exchangeRateStore = useExchangeRateStore()
const pageBodyRef = ref(null)
const showLoginDialog = ref(false)
const showLogoutDialog = ref(false)
const showBudgetDialog = ref(false)
const showProfileEditSheet = ref(false)
const renameInput = ref('')
const renameError = ref('')
const renameLoading = ref(false)

const showChangePasswordSheet = ref(false)
const changePasswordOld = ref('')
const changePasswordNew = ref('')
const changePasswordConfirm = ref('')
const changePasswordError = ref('')
const changePasswordLoading = ref(false)

const showAccountManageSheet = ref(false)

const showChangeEmailForm = ref(false)
const changeEmailNew = ref('')
const changeEmailError = ref('')
const changeEmailLoading = ref(false)
const changeEmailSent = ref(false)

const showDeleteAccountSheet = ref(false)
const deleteAccountEmail = ref('')
const deleteAccountPassword = ref('')
const deleteAccountError = ref('')
const deleteAccountLoading = ref(false)

const { toastMsg, showToast: showToastMsg } = useToast()

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

const CUSTOM_AVATAR_KEY = 'goods_custom_avatar'

const avatarInitial = computed(() => {
  const name = authStore.userDisplayName || authStore.userEmail
  return name ? name.slice(0, 1).toUpperCase() : 'G'
})
const cachedAvatarSrc = ref('')
const customAvatarUrl = ref('')
const avatarInputRef = ref(null)
const showAvatarEditor = ref(false)
const avatarEditorFile = ref(null)

// Custom avatar takes priority, then Supabase avatar (custom > OAuth > cached)
const displayAvatarSrc = computed(() => {
  return customAvatarUrl.value || authStore.userAvatarUrl || cachedAvatarSrc.value || ''
})

// 缓存头像
watch(
  () => authStore.user?.user_metadata?.avatar_url,
  async (url) => {
    if (!url) {
      cachedAvatarSrc.value = ''
      return
    }
    // 先检查内存缓存
    const memHit = peekCachedImage(url)
    if (memHit) {
      cachedAvatarSrc.value = memHit
      return
    }
    // 异步加载缓存（Cache API / Capacitor FS / 网络）
    try {
      const cached = await getCachedImage(url)
      if (cached) cachedAvatarSrc.value = cached
    } catch { /* ignore */ }
  },
  { immediate: true }
)

function chooseNewAvatar() {
  avatarInputRef.value?.click()
}

async function editExistingAvatar() {
  const src = displayAvatarSrc.value
  if (!src) return
  try {
    const response = await fetch(src)
    const blob = await response.blob()
    const file = new File([blob], 'avatar.jpg', { type: blob.type || 'image/jpeg' })
    avatarEditorFile.value = file
    showAvatarEditor.value = true
  } catch (err) {
    console.warn('[MyView] fetch avatar failed', err)
    showToastMsg(t('my.avatarUpdateFailed'))
  }
}

async function onAvatarFileChange(e) {
  const file = e.target.files?.[0]
  if (!file) return
  avatarEditorFile.value = file
  showAvatarEditor.value = true
  if (avatarInputRef.value) avatarInputRef.value.value = ''
}

async function onAvatarEditorSave(result) {
  if (!result?.file) return
  try {
    const dataUrl = await fileToDataUrl(result.file)
    customAvatarUrl.value = dataUrl
    await writePersisted(CUSTOM_AVATAR_KEY, dataUrl)
    uploadAvatarToSupabase(result.file).then(() => {
      showToastMsg(t('my.avatarSynced'))
    }).catch((e) => {
      console.warn('[avatar] sync failed:', e.message)
      showToastMsg(t('my.avatarSyncFailed'))
    })
  } catch (err) {
    console.warn('[MyView] avatar save failed', err)
    showToastMsg(t('my.avatarUpdateFailed'))
  }
  avatarEditorFile.value = null
}

async function uploadAvatarToSupabase(file) {
  if (!authStore.isLoggedIn) throw new Error('not_logged_in')
  const db = (await import('@/utils/sync/supabaseClient')).getSupabaseClient()
  if (!db) throw new Error('no_client')
  const userId = authStore.user?.id
  if (!userId) throw new Error('no_user_id')

  // 确保 Supabase client 真的有有效 session（不只是 store 有缓存）
  const { data: { session } } = await db.auth.getSession()
  if (!session) {
    try {
      const { data: refreshData } = await db.auth.refreshSession()
      if (!refreshData.session) throw new Error('no_session')
    } catch {
      throw new Error('session_expired')
    }
  }

  const ext = file.name.split('.').pop() || 'jpg'
  // 加时间戳避免 CDN 缓存旧文件：同名路径即使删除重建，CDN 也可能返回旧内容
  const path = `${userId}_${Date.now()}.${ext}`
  const { error: uploadError } = await db.storage
    .from('avatars')
    .upload(path, file, { upsert: true, contentType: file.type || 'image/jpeg' })

  if (uploadError) {
    throw new Error(uploadError.message)
  }

  const { data: urlData } = db.storage.from('avatars').getPublicUrl(path)
  const publicUrl = urlData?.publicUrl
  if (!publicUrl) throw new Error('no_public_url')

  // 更新 profile 指向新头像
  await authStore.updateProfile({ custom_avatar_url: publicUrl })
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function confirmResetAvatar() {
  customAvatarUrl.value = ''
  await writePersisted(CUSTOM_AVATAR_KEY, '')
  // 清除自定义头像（恢复到 OAuth/邮箱默认头像）
  if (authStore.isLoggedIn) {
    authStore.updateProfile({ custom_avatar_url: '' }).catch(() => {})
  }
  showProfileEditSheet.value = false
  showToastMsg(t('my.avatarReset'))
}

const syncSummaryText = computed(() => {
  if (syncStore.lastSyncedAt) return t('my.summaryLastSync', { time: formatDate(syncStore.lastSyncedAt, 'YYYY-MM-DD HH:mm') })
  if (authStore.isLoggedIn) return t('my.summaryConnected')
  return t('my.summaryNotConnected')
})

const exchangeRateLastUpdatedText = computed(() => {
  if (!exchangeRateStore.lastUpdated) return t('my.rateNotFetched')
  return t('my.rateLastUpdated', { time: formatDate(exchangeRateStore.lastUpdated, 'YYYY-MM-DD HH:mm') })
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

function openProfileEditSheet() {
  renameInput.value = authStore.userDisplayName || ''
  renameError.value = ''
  showProfileEditSheet.value = true
}

function closeProfileEditSheet() {
  showProfileEditSheet.value = false
}

async function confirmRename() {
  const name = renameInput.value.trim()
  if (!name) return
  renameLoading.value = true
  renameError.value = ''
  try {
    await authStore.updateProfile({ display_name: name })
    showProfileEditSheet.value = false
    showToastMsg(t('my.renameSuccess'))
  } catch (e) {
    renameError.value = e.message || t('my.renameFailed')
  } finally {
    renameLoading.value = false
  }
}

function onDialogToast(message) {
  showToastMsg(message)
}

async function handleLoginSuccess() {
  showToastMsg(t('my.authLoginSuccess'))
  showLoginDialog.value = false
}

function handleLogin() {
  showLoginDialog.value = true
}

async function handleLogout() {
  if (!authStore.isLoggedIn) return
  await authStore.logout()
  closeLogoutDialog()
}

function confirmLogout() {
  void handleLogout()
}

// Change Password
function openChangePasswordSheet() {
  changePasswordOld.value = ''
  changePasswordNew.value = ''
  changePasswordConfirm.value = ''
  changePasswordError.value = ''
  showChangePasswordSheet.value = true
}

function closeChangePasswordSheet() {
  showChangePasswordSheet.value = false
}

async function confirmChangePassword() {
  if (changePasswordNew.value !== changePasswordConfirm.value) {
    changePasswordError.value = t('my.authPasswordMismatch')
    return
  }
  if (changePasswordNew.value.length < 6) {
    changePasswordError.value = t('my.authPasswordTooShort')
    return
  }
  changePasswordLoading.value = true
  changePasswordError.value = ''
  try {
    // Verify old password first
    await authStore.loginWithEmail(authStore.userEmail, changePasswordOld.value)
    // Then update to new password
    await authStore.changePassword(changePasswordNew.value)
    showChangePasswordSheet.value = false
    showToastMsg(t('my.changePasswordSuccess'))
  } catch (e) {
    changePasswordError.value = e.message || t('my.changePasswordFailed')
  } finally {
    changePasswordLoading.value = false
  }
}

// Account Management
async function openAccountManageSheet() {
  showAccountManageSheet.value = true
  await authStore.fetchLinkedProviders()
}

function closeAccountManageSheet() {
  showAccountManageSheet.value = false
}

function openChangePasswordFromManage() {
  showAccountManageSheet.value = false
  openChangePasswordSheet()
}

function openDeleteAccountFromManage() {
  showAccountManageSheet.value = false
  openDeleteAccountSheet()
}

// Change Email
function openChangeEmail() {
  changeEmailNew.value = ''
  changeEmailError.value = ''
  changeEmailSent.value = false
  showChangeEmailForm.value = true
}

function closeChangeEmail() {
  showChangeEmailForm.value = false
  changeEmailNew.value = ''
  changeEmailError.value = ''
  changeEmailSent.value = false
}

async function confirmChangeEmail() {
  if (!changeEmailNew.value || changeEmailNew.value === authStore.userEmail) return
  changeEmailLoading.value = true
  changeEmailError.value = ''
  changeEmailSent.value = false
  try {
    await authStore.updateProfile({ email: changeEmailNew.value })
    changeEmailSent.value = true
    changeEmailNew.value = ''
  } catch (e) {
    changeEmailError.value = e.message || t('my.changeEmailFailed')
  } finally {
    changeEmailLoading.value = false
  }
}

function getProviderLabel(provider) {
  const map = {
    google: t('my.providerGoogle'),
    github: t('my.providerGitHub'),
    azure: t('my.providerMicrosoft'),
    email: t('my.authTypeEmail')
  }
  return map[provider] || provider
}

async function handleLinkProvider(provider) {
  try {
    await authStore.linkProvider(provider)
    await authStore.fetchLinkedProviders()
  } catch (e) {
    showToastMsg(e.message || t('my.unlinkProviderFailed'))
  }
}

function confirmUnlinkProvider(identity) {
  if (authStore.linkedProviders.length <= 1) {
    showToastMsg(t('my.cannotUnlinkLast'))
    return
  }
  showAccountManageSheet.value = false
  // Show a simple confirm before unlinking
  if (window.confirm(t('my.unlinkProviderConfirm'))) {
    doUnlinkProvider(identity)
  } else {
    showAccountManageSheet.value = true
  }
}

async function doUnlinkProvider(identity) {
  try {
    await authStore.unlinkProvider(identity.id)
    showToastMsg(t('my.unlinkProviderSuccess'))
    showAccountManageSheet.value = true
  } catch (e) {
    showToastMsg(e.message || t('my.unlinkProviderFailed'))
    showAccountManageSheet.value = true
  }
}

// Delete Account
function openDeleteAccountSheet() {
  deleteAccountEmail.value = ''
  deleteAccountPassword.value = ''
  deleteAccountError.value = ''
  showDeleteAccountSheet.value = true
}

function closeDeleteAccountSheet() {
  showDeleteAccountSheet.value = false
}

async function confirmDeleteAccount() {
  if (deleteAccountEmail.value !== authStore.userEmail) {
    deleteAccountError.value = t('my.deleteAccountEmailMismatch')
    return
  }
  deleteAccountLoading.value = true
  deleteAccountError.value = ''
  try {
    await authStore.deleteAccount(deleteAccountPassword.value)
    showDeleteAccountSheet.value = false
    showToastMsg(t('my.deleteAccountSuccess'))
  } catch (e) {
    deleteAccountError.value = e.message || t('my.deleteAccountFailed')
  } finally {
    deleteAccountLoading.value = false
  }
}


onMounted(async () => {
  resetPageScrollTop()
  window.requestAnimationFrame(resetPageScrollTop)
  const saved = await readPersisted(CUSTOM_AVATAR_KEY, '')
  if (saved) customAvatarUrl.value = saved
  await Promise.all([syncStore.init(), authStore.init(), loadBudgetSettings()])
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

.account-avatar-wrap {
  position: relative;
  cursor: pointer;
}

.avatar-file-input {
  display: none;
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
  display: flex;
  align-items: center;
  gap: 8px;
}

.name-edit-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 8px;
  background: color-mix(in srgb, var(--app-text) 8%, transparent);
  color: var(--app-text-secondary);
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.14s ease;
}

.name-edit-btn:hover {
  background: color-mix(in srgb, var(--app-text) 14%, transparent);
}

.name-edit-btn svg {
  width: 14px;
  height: 14px;
}

.rename-field {
  margin: 12px 0;
}

.rename-field .auth-input {
  width: 100%;
  height: 46px;
  padding: 0 14px;
  border: 1px solid color-mix(in srgb, var(--app-text) 12%, transparent);
  border-radius: 12px;
  background: var(--app-surface-soft);
  color: var(--app-text);
  font-size: 15px;
  outline: none;
  transition: border-color 0.16s ease;
  box-sizing: border-box;
}

.rename-field .auth-input:focus {
  border-color: color-mix(in srgb, var(--app-text) 28%, transparent);
}

.rename-error {
  color: var(--app-danger, #c74444);
  font-size: 13px;
  margin-bottom: 8px;
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

.hero-action--danger {
  color: #c74444;
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

.login-sheet__button--danger {
  background: #c74444;
  color: #fff;
}

.login-sheet__button--danger-sm {
  min-height: 32px;
  padding: 0 12px;
  border: none;
  border-radius: 8px;
  background: color-mix(in srgb, #c74444 12%, transparent);
  color: #c74444;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.login-sheet__button--danger-sm:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.login-sheet__button--secondary-sm {
  min-height: 32px;
  padding: 0 12px;
  border: none;
  border-radius: 8px;
  background: var(--app-surface-soft);
  color: var(--app-text);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.login-sheet__button--secondary-sm:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.dialog-success {
  margin-top: 8px;
  color: #28c880;
  font-size: 13px;
}

.login-sheet__button--full {
  width: 100%;
}

.login-sheet__title--danger {
  color: #c74444;
}

.login-sheet__desc--danger {
  color: #c74444;
  font-weight: 500;
}

.login-sheet--tall {
  max-height: min(calc(100dvh - 48px), 80vh);
  overflow-y: auto;
}

.account-manage-section {
  margin-bottom: 20px;
}

.account-manage-section__title {
  margin: 0 0 12px;
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.account-manage-empty {
  color: var(--app-text-secondary);
  font-size: 14px;
  padding: 12px;
  text-align: center;
  background: var(--app-surface-soft);
  border-radius: 12px;
}

.account-manage-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  margin-bottom: 8px;
  background: var(--app-surface-soft);
  border-radius: 12px;
}

.account-manage-item__info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.account-manage-item__provider {
  color: var(--app-text);
  font-size: 14px;
  font-weight: 600;
}

.account-manage-item__email {
  color: var(--app-text-secondary);
  font-size: 12px;
}

.auth-form {
  display: grid;
  gap: 14px;
}

.auth-field {
  display: grid;
  gap: 6px;
}

.auth-field__label {
  color: var(--app-text-secondary);
  font-size: 13px;
}

.auth-input {
  width: 100%;
  height: 46px;
  padding: 0 14px;
  border: 1px solid color-mix(in srgb, var(--app-text) 12%, transparent);
  border-radius: 12px;
  background: var(--app-surface-soft);
  color: var(--app-text);
  font-size: 15px;
  outline: none;
  transition: border-color 0.16s ease;
}

.auth-input:focus {
  border-color: color-mix(in srgb, var(--app-text) 28%, transparent);
}

.social-buttons {
  display: grid;
  gap: 10px;
  margin-top: 8px;
}

.social-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  min-height: 48px;
  padding: 0 16px;
  border: 1px solid color-mix(in srgb, var(--app-text) 12%, transparent);
  border-radius: 14px;
  background: var(--app-surface-soft);
  color: var(--app-text);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.16s ease;
}

.social-btn:active {
  transform: scale(0.98);
}

.social-btn:disabled {
  opacity: 0.56;
  cursor: not-allowed;
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

.sheet-pop-enter-active,
.sheet-pop-leave-active {
  transition: opacity 0.24s ease;
}

.sheet-pop-enter-active .login-sheet,
.sheet-pop-leave-active .login-sheet {
  transition: transform 0.28s var(--motion-ease-spring), opacity 0.24s ease;
}

.sheet-pop-enter-from,
.sheet-pop-leave-to {
  opacity: 0;
}

.sheet-pop-enter-from .login-sheet,
.sheet-pop-leave-to .login-sheet {
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
  .login-overlay {
    align-items: center;
  }

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
