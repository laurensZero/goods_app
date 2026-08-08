<template>
  <div class="page notify-settings-page">
    <NavBar :title="t('notifySettings.title')" show-back />

    <main ref="pageBodyRef" class="page-body">
      <section class="hero-section">
        <article class="hero-card">
          <div class="hero-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 01-3.46 0" />
            </svg>
          </div>
          <div class="hero-copy">
            <p class="hero-label">Notification</p>
            <h1 class="hero-title">{{ t('notifySettings.title') }}</h1>
            <p class="hero-desc">{{ t('notifySettings.description') }}</p>
          </div>
        </article>
      </section>

      <section class="settings-section">
        <div class="settings-card">
          <div class="settings-card__header">
            <p class="settings-card__label">GLOBAL</p>
            <h2 class="settings-card__title">{{ t('notifySettings.globalSettings') }}</h2>
          </div>

          <div class="settings-list">
            <div class="settings-item">
              <div class="settings-item__info">
                <span class="settings-item__icon settings-item__icon--main">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 01-3.46 0" />
                  </svg>
                </span>
                <div>
                  <span class="settings-item__title">{{ t('notifySettings.enableNotifications') }}</span>
                  <span class="settings-item__desc">{{ t('notifySettings.enableNotificationsDesc') }}</span>
                </div>
              </div>
              <label class="toggle-switch" :aria-label="t('notifySettings.enableNotifications')">
                <input
                  :checked="settings.enabled"
                  type="checkbox"
                  @change="saveSetting('enabled', $event.target.checked)"
                />
                <span class="toggle-slider" />
              </label>
            </div>
          </div>
        </div>
      </section>

      <section class="settings-section" :class="{ 'settings-section--disabled': !settings.enabled }">
        <div class="settings-card">
          <div class="settings-card__header">
            <p class="settings-card__label">TYPES</p>
            <h2 class="settings-card__title">{{ t('notifySettings.notificationTypes') }}</h2>
          </div>

          <div class="settings-list">
            <div class="settings-item">
              <div class="settings-item__info">
                <span class="settings-item__icon settings-item__icon--sale">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </span>
                <div>
                  <span class="settings-item__title">{{ t('notifySettings.saleReminder') }}</span>
                  <span class="settings-item__desc">{{ t('notifySettings.saleReminderDesc') }}</span>
                </div>
              </div>
              <label class="toggle-switch" :aria-label="t('notifySettings.saleReminder')">
                <input
                  :checked="settings.saleReminder"
                  :disabled="!settings.enabled"
                  type="checkbox"
                  @change="saveSetting('saleReminder', $event.target.checked)"
                />
                <span class="toggle-slider" />
              </label>
            </div>

            <div class="settings-item">
              <div class="settings-item__info">
                <span class="settings-item__icon settings-item__icon--sale">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8" />
                    <path d="M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1" />
                    <path d="M2 21h20" />
                    <path d="M7 8v3" />
                    <path d="M12 8v3" />
                    <path d="M17 8v3" />
                    <path d="M7 4h.01" />
                    <path d="M12 4h.01" />
                    <path d="M17 4h.01" />
                  </svg>
                </span>
                <div>
                  <span class="settings-item__title">{{ t('notifySettings.birthdayEgg') }}</span>
                  <span class="settings-item__desc">{{ t('notifySettings.birthdayEggDesc') }}</span>
                </div>
              </div>
              <label class="toggle-switch" :aria-label="t('notifySettings.birthdayEgg')">
                <input
                  :checked="settings.birthdayEgg"
                  :disabled="!settings.enabled"
                  type="checkbox"
                  @change="saveSetting('birthdayEgg', $event.target.checked)"
                />
                <span class="toggle-slider" />
              </label>
            </div>

            <div class="settings-item">
              <div class="settings-item__info">
                <span class="settings-item__icon settings-item__icon--syncing">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 12a9 9 0 11-6.219-8.56" />
                    <polyline points="21 3 21 9 15 9" />
                  </svg>
                </span>
                <div>
                  <span class="settings-item__title">{{ t('notifySettings.syncing') }}</span>
                  <span class="settings-item__desc">{{ t('notifySettings.syncingDesc') }}</span>
                </div>
              </div>
              <label class="toggle-switch" :aria-label="t('notifySettings.syncing')">
                <input
                  :checked="settings.syncing"
                  :disabled="!settings.enabled"
                  type="checkbox"
                  @change="saveSetting('syncing', $event.target.checked)"
                />
                <span class="toggle-slider" />
              </label>
            </div>

            <div class="settings-item">
              <div class="settings-item__info">
                <span class="settings-item__icon settings-item__icon--success">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
                <div>
                  <span class="settings-item__title">{{ t('notifySettings.syncSuccess') }}</span>
                  <span class="settings-item__desc">{{ t('notifySettings.syncSuccessDesc') }}</span>
                </div>
              </div>
              <label class="toggle-switch" :aria-label="t('notifySettings.syncSuccess')">
                <input
                  :checked="settings.syncSuccess"
                  :disabled="!settings.enabled"
                  type="checkbox"
                  @change="saveSetting('syncSuccess', $event.target.checked)"
                />
                <span class="toggle-slider" />
              </label>
            </div>

            <div class="settings-item">
              <div class="settings-item__info">
                <span class="settings-item__icon settings-item__icon--error">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                </span>
                <div>
                  <span class="settings-item__title">{{ t('notifySettings.syncError') }}</span>
                  <span class="settings-item__desc">{{ t('notifySettings.syncErrorDesc') }}</span>
                </div>
              </div>
              <label class="toggle-switch" :aria-label="t('notifySettings.syncError')">
                <input
                  :checked="settings.syncError"
                  :disabled="!settings.enabled"
                  type="checkbox"
                  @change="saveSetting('syncError', $event.target.checked)"
                />
                <span class="toggle-slider" />
              </label>
            </div>

            <div class="settings-item">
              <div class="settings-item__info">
                <span class="settings-item__icon settings-item__icon--update">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </span>
                <div>
                  <span class="settings-item__title">{{ t('notifySettings.updateAvailable') }}</span>
                  <span class="settings-item__desc">{{ t('notifySettings.updateAvailableDesc') }}</span>
                </div>
              </div>
              <label class="toggle-switch" :aria-label="t('notifySettings.updateAvailable')">
                <input
                  :checked="settings.updateAvailable"
                  :disabled="!settings.enabled"
                  type="checkbox"
                  @change="saveSetting('updateAvailable', $event.target.checked)"
                />
                <span class="toggle-slider" />
              </label>
            </div>
          </div>
        </div>
      </section>

      <section class="settings-section" :class="{ 'settings-section--disabled': !qqStore.isBound }">
        <div class="settings-card">
          <div class="settings-card__header">
            <p class="settings-card__label">PUSH CHANNEL</p>
            <h2 class="settings-card__title">{{ t('notifySettings.qqPushSection') }}</h2>
          </div>

          <div class="settings-list">
            <div class="settings-item">
              <div class="settings-item__info">
                <span class="settings-item__icon settings-item__icon--qq">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                    <line x1="9" y1="9" x2="9.01" y2="9" />
                    <line x1="15" y1="9" x2="15.01" y2="9" />
                  </svg>
                </span>
                <div>
                  <span class="settings-item__title">{{ t('notifySettings.qqPush') }}</span>
                  <span class="settings-item__desc">
                    {{ qqStore.isBound ? t('notifySettings.qqPushDesc') : t('notifySettings.qqPushNeedBind') }}
                  </span>
                </div>
              </div>
              <label class="toggle-switch" :aria-label="t('notifySettings.qqPush')">
                <input
                  :checked="qqStore.isEnabled"
                  :disabled="!qqStore.isBound || qqStore.isLoading"
                  type="checkbox"
                  @change="onQQPushChange"
                />
                <span class="toggle-slider" />
              </label>
            </div>

            <div class="settings-item">
              <div class="settings-item__info">
                <span class="settings-item__icon settings-item__icon--mihoyo">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.83z" />
                    <line x1="7" y1="7" x2="7.01" y2="7" />
                  </svg>
                </span>
                <div>
                  <span class="settings-item__title">{{ t('notifySettings.mihoyoPush') }}</span>
                  <span class="settings-item__desc">
                    {{ qqStore.isBound ? t('notifySettings.mihoyoPushDesc') : t('notifySettings.mihoyoPushNeedBind') }}
                  </span>
                </div>
              </div>
              <label class="toggle-switch" :aria-label="t('notifySettings.mihoyoPush')">
                <input
                  :checked="qqStore.isMihoyoEnabled"
                  :disabled="!qqStore.isBound || qqStore.isLoading"
                  type="checkbox"
                  @change="onMihoyoPushChange"
                />
                <span class="toggle-slider" />
              </label>
            </div>

            <div v-if="qqStore.isBound" class="settings-item settings-item--column">
              <div class="settings-item__info">
                <span class="settings-item__icon settings-item__icon--mihoyo">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                    <line x1="9" y1="9" x2="9.01" y2="9" />
                    <line x1="15" y1="9" x2="15.01" y2="9" />
                  </svg>
                </span>
                <div>
                  <span class="settings-item__title">{{ t('notifySettings.mihoyoShops') }}</span>
                  <span class="settings-item__desc">{{ t('notifySettings.mihoyoShopsDesc') }}</span>
                </div>
              </div>
              <div class="mihoyo-shop-picker">
                <button
                  v-for="shop in mihoyoShopOptions"
                  :key="shop.code"
                  type="button"
                  class="mihoyo-shop-chip"
                  :class="{ 'mihoyo-shop-chip--active': isShopSelected(shop.code) }"
                  :disabled="!qqStore.isMihoyoEnabled"
                  @click="toggleShop(shop.code)"
                >
                  {{ shop.label }}
                </button>
              </div>
              <p
                v-if="qqStore.isMihoyoEnabled && qqStore.mihoyoShops.length === 0"
                class="mihoyo-shop-hint"
              >
                {{ t('notifySettings.mihoyoShopsNeedPick') }}
              </p>
            </div>

            <div v-if="qqStore.isBound" class="settings-item settings-item--column">
              <div class="settings-item__info">
                <span class="settings-item__icon settings-item__icon--ship">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="1" y="3" width="15" height="13" rx="1" />
                    <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                    <circle cx="5.5" cy="18.5" r="2.5" />
                    <circle cx="18.5" cy="18.5" r="2.5" />
                  </svg>
                </span>
                <div>
                  <span class="settings-item__title">{{ t('notifySettings.shipReminder') }}</span>
                  <span class="settings-item__desc">{{ t('notifySettings.shipReminderDesc') }}</span>
                </div>
              </div>
              <div class="mihoyo-shop-picker">
                <button
                  v-for="day in shipReminderDayOptions"
                  :key="day"
                  type="button"
                  class="mihoyo-shop-chip"
                  :class="{ 'mihoyo-shop-chip--active': isShipReminderDaySelected(day) }"
                  @click="toggleShipReminderDay(day)"
                >
                  {{ t('notifySettings.shipReminderDay', { days: day }) }}
                </button>
              </div>
              <p
                v-if="qqStore.shipReminderOffsets.length === 0"
                class="mihoyo-shop-hint"
              >
                {{ t('notifySettings.shipReminderNeedPick') }}
              </p>
            </div>

            <div class="settings-item settings-item--link" @click="openStockMonitor">
              <div class="settings-item__info">
                <span class="settings-item__icon settings-item__icon--mihoyo">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 3h18v18H3z" />
                    <path d="M3 9h18" />
                    <path d="M9 21V9" />
                  </svg>
                </span>
                <div>
                  <span class="settings-item__title">{{ t('notifySettings.mihoyoStockMonitor') }}</span>
                  <span class="settings-item__desc">{{ t('notifySettings.mihoyoStockMonitorDesc') }}</span>
                </div>
              </div>
              <svg class="settings-item__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </div>
          </div>
        </div>
      </section>

      <section class="settings-section" :class="{ 'settings-section--disabled': !settings.enabled }">
        <div class="settings-card">
          <div class="settings-card__header">
            <p class="settings-card__label">DISPLAY</p>
            <h2 class="settings-card__title">{{ t('notifySettings.displaySettings') }}</h2>
          </div>

          <div class="settings-list">
            <div class="settings-item settings-item--column">
              <div class="settings-item__info">
                <span class="settings-item__icon settings-item__icon--display">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <line x1="3" y1="9" x2="21" y2="9" />
                    <line x1="9" y1="21" x2="9" y2="9" />
                  </svg>
                </span>
                <div>
                  <span class="settings-item__title">{{ t('notifySettings.position') }}</span>
                  <span class="settings-item__desc">{{ t('notifySettings.positionDesc') }}</span>
                </div>
              </div>
              <div class="position-picker">
                <button
                  v-for="pos in positionOptions"
                  :key="pos.value"
                  type="button"
                  class="position-option"
                  :class="{ 'position-option--active': currentPosition === pos.value }"
                  :disabled="!settings.enabled"
                  @click="updatePosition(pos.value)"
                >
                  {{ pos.label }}
                </button>
              </div>
            </div>

            <div class="settings-item">
              <div class="settings-item__info">
                <span class="settings-item__icon settings-item__icon--display">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                </span>
                <div>
                  <span class="settings-item__title">{{ t('notifySettings.maxVisible') }}</span>
                  <span class="settings-item__desc">{{ t('notifySettings.maxVisibleDesc') }}</span>
                </div>
              </div>
              <div class="number-picker">
                <button
                  type="button"
                  class="number-picker__btn"
                  :disabled="!settings.enabled || currentMaxVisible <= 1"
                  @click="updateMaxVisible(currentMaxVisible - 1)"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
                <span class="number-picker__value">{{ currentMaxVisible }}</span>
                <button
                  type="button"
                  class="number-picker__btn"
                  :disabled="!settings.enabled || currentMaxVisible >= 5"
                  @click="updateMaxVisible(currentMaxVisible + 1)"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
              </div>
            </div>

            <div class="settings-item">
              <div class="settings-item__info">
                <span class="settings-item__icon settings-item__icon--display">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </span>
                <div>
                  <span class="settings-item__title">{{ t('notifySettings.autoClose') }}</span>
                  <span class="settings-item__desc">{{ t('notifySettings.autoCloseDesc') }}</span>
                </div>
              </div>
              <label class="toggle-switch" :aria-label="t('notifySettings.autoClose')">
                <input
                  :checked="settings.autoClose"
                  :disabled="!settings.enabled"
                  type="checkbox"
                  @change="saveSetting('autoClose', $event.target.checked)"
                />
                <span class="toggle-slider" />
              </label>
            </div>

            <div v-if="settings.autoClose" class="settings-item settings-item--slider">
              <div class="settings-item__info">
                <span class="settings-item__icon settings-item__icon--display">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                  </svg>
                </span>
                <div>
                  <span class="settings-item__title">{{ t('notifySettings.duration') }}</span>
                  <span class="settings-item__desc">{{ t('notifySettings.durationDesc') }}</span>
                </div>
                <div class="duration-display">
                  <span class="duration-value">{{ durationSliderValue }}</span>
                  <span class="duration-unit">{{ t('notifySettings.seconds') }}</span>
                </div>
              </div>
              <div class="slider-wrapper">
                <input
                  v-model="durationSliderValue"
                  class="notify-slider"
                  type="range"
                  min="2"
                  max="15"
                  step="1"
                  :disabled="!settings.enabled"
                  @change="updateDuration"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section v-if="isMobileDevice" class="settings-section" :class="{ 'settings-section--disabled': !settings.enabled }">
        <div class="settings-card">
          <div class="settings-card__header">
            <p class="settings-card__label">FEEDBACK</p>
            <h2 class="settings-card__title">{{ t('notifySettings.feedbackSettings') }}</h2>
          </div>

          <div class="settings-list">
            <div class="settings-item">
              <div class="settings-item__info">
                <span class="settings-item__icon settings-item__icon--feedback">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M2 8l2 2-2 2 2 2-2 2" />
                    <path d="M22 8l-2 2 2 2-2 2 2 2" />
                    <rect x="8" y="2" width="8" height="20" rx="2" />
                  </svg>
                </span>
                <div>
                  <span class="settings-item__title">{{ t('notifySettings.vibration') }}</span>
                  <span class="settings-item__desc">{{ t('notifySettings.vibrationDesc') }}</span>
                </div>
              </div>
              <label class="toggle-switch" :aria-label="t('notifySettings.vibration')">
                <input
                  :checked="settings.vibration"
                  :disabled="!settings.enabled"
                  type="checkbox"
                  @change="saveSetting('vibration', $event.target.checked)"
                />
                <span class="toggle-slider" />
              </label>
            </div>
          </div>
        </div>
      </section>

      <section class="settings-section">
        <div class="settings-card">
          <div class="settings-card__header">
            <p class="settings-card__label">ACTIONS</p>
            <h2 class="settings-card__title">{{ t('notifySettings.actions') }}</h2>
          </div>

          <div class="settings-list">
            <button type="button" class="settings-action-btn" @click="testNotification">
              <span class="settings-action-btn__icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              </span>
              <span class="settings-action-btn__text">{{ t('notifySettings.testNotification') }}</span>
            </button>

            <button type="button" class="settings-action-btn settings-action-btn--danger" @click="resetSettings">
              <span class="settings-action-btn__icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="1 4 1 10 7 10" />
                  <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                </svg>
              </span>
              <span class="settings-action-btn__text">{{ t('notifySettings.resetDefaults') }}</span>
            </button>
          </div>
        </div>
      </section>

      <AppToast :message="toastMsg" />
    </main>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, inject } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import NavBar from '@/components/common/NavBar.vue'
import AppToast from '@/components/common/AppToast.vue'
import { runWithRouteTransition } from '@/utils/routeTransition'
import { useToast } from '@/composables/useToast'
import { useNotifySettingsStore } from '@/stores/notifySettings'
import { useQQBindingStore } from '@/stores/qqBinding'

defineOptions({ name: 'NotifySettingsView' })

const { t } = useI18n()
const router = useRouter()
const { toastMsg, showToast } = useToast()

const notifySettingsStore = useNotifySettingsStore()
const qqStore = useQQBindingStore()

const pageBodyRef = ref(null)

// 平板设置分屏时由 ManageView provide，用于在右面板内直接打开子页面
const openManageSubPage = inject('openManageSubPage', null)

// 检测是否是移动端
const isMobileDevice = ref(false)
onMounted(() => {
  isMobileDevice.value = typeof navigator !== 'undefined'
    ? (navigator.userAgentData?.mobile ?? /Mobile|iPhone|iPod|Windows Phone/i.test(navigator.userAgent || ''))
    : false
  qqStore.init().catch(() => {})
})

// 设置引用
const settings = computed(() => notifySettingsStore.settings)

// 当前设备对应的位置设置
const currentPosition = computed(() => {
  if (notifySettingsStore.isTabletViewport) {
    return settings.value.padPosition
  }
  return settings.value.position
})

// 当前设备对应的最大显示数量
const currentMaxVisible = ref(3)
onMounted(() => {
  currentMaxVisible.value = notifySettingsStore.isTabletViewport
    ? settings.value.padMaxVisible
    : settings.value.maxVisible
})

// 当前设备对应的自动关闭时长
const durationSliderValue = ref(6)
onMounted(() => {
  const duration = notifySettingsStore.isTabletViewport
    ? settings.value.padDuration
    : settings.value.duration
  durationSliderValue.value = duration / 1000
})

// 位置选项
const positionOptions = computed(() => [
  { value: 'top-left', label: t('notifySettings.topLeft') },
  { value: 'top-center', label: t('notifySettings.topCenter') },
  { value: 'top-right', label: t('notifySettings.topRight') }
])

// 保存单个设置
function saveSetting(key, value) {
  notifySettingsStore.updateSetting(key, value)
}

// QQ 推送开关（同步到服务端 user_qq_bindings.enabled）
async function onQQPushChange(e) {
  const enabled = e.target.checked
  try {
    await qqStore.toggleEnabled(enabled)
  } catch (err) {
    e.target.checked = !enabled
    showToast(err.message || t('common.failed'))
  }
}

// 米游铺上新开关（同步到服务端 user_qq_bindings.mihoyo_enabled，默认关闭）
async function onMihoyoPushChange(e) {
  const enabled = e.target.checked
  try {
    await qqStore.toggleMihoyoEnabled(enabled)
  } catch (err) {
    e.target.checked = !enabled
    showToast(err.message || t('common.failed'))
  }
}

// 米游铺监听店铺选项（与 scan-mihoyo 的 SHOP_CODES 保持一致）
const mihoyoShopOptions = computed(() => [
  { code: 'ys', label: t('notifySettings.mihoyoShopYs') },
  { code: 'xqtd', label: t('notifySettings.mihoyoShopXqtd') },
  { code: 'bh3', label: t('notifySettings.mihoyoShopBh3') },
  { code: 'zzz', label: t('notifySettings.mihoyoShopZzz') },
])

function isShopSelected(code) {
  return qqStore.mihoyoShops.includes(code)
}

// 切换某个店铺的监听（同步到服务端 user_qq_bindings.mihoyo_shops）
async function toggleShop(code) {
  const current = qqStore.mihoyoShops
  const next = current.includes(code)
    ? current.filter((c) => c !== code)
    : [...current, code]
  try {
    await qqStore.toggleMihoyoShops(next)
  } catch (err) {
    showToast(err.message || t('common.failed'))
  }
}

// 未发货超时提醒的天数档位（与 scan/ship 提醒服务端校验一致：1~3650 天）
const shipReminderDayOptions = [15, 30, 45, 60, 90]

function isShipReminderDaySelected(day) {
  return qqStore.shipReminderOffsets.includes(day)
}

// 切换某个未发货超时天数档位（同步到服务端 user_qq_bindings.ship_reminder_offsets_days）
async function toggleShipReminderDay(day) {
  try {
    await qqStore.toggleShipReminderOffset(day)
  } catch (err) {
    showToast(err.message || t('common.failed'))
  }
}

// 打开「米游铺有货监控」列表（平板嵌入设置分屏时在右面板内打开，否则走独立页面）
function openStockMonitor() {
  if (typeof openManageSubPage === 'function') {
    openManageSubPage('mihoyoStockMonitor')
    return
  }
  runWithRouteTransition(() => router.push('/manage/mihoyo-stock-monitor'), { direction: 'forward' })
}

// 更新位置
function updatePosition(value) {
  if (notifySettingsStore.isTabletViewport) {
    notifySettingsStore.updateSetting('padPosition', value)
  } else {
    notifySettingsStore.updateSetting('position', value)
  }
}

// 更新最大显示数量
function updateMaxVisible(value) {
  currentMaxVisible.value = value
  if (notifySettingsStore.isTabletViewport) {
    notifySettingsStore.updateSetting('padMaxVisible', value)
  } else {
    notifySettingsStore.updateSetting('maxVisible', value)
  }
}

// 更新自动关闭时长
function updateDuration() {
  const durationMs = durationSliderValue.value * 1000
  if (notifySettingsStore.isTabletViewport) {
    notifySettingsStore.updateSetting('padDuration', durationMs)
  } else {
    notifySettingsStore.updateSetting('duration', durationMs)
  }
}

// 测试通知
function testNotification() {
  window.dispatchEvent(new CustomEvent('app-notify-test', {
    detail: {
      iconType: 'bell',
      text: t('notifySettings.testTitle'),
      subText: t('notifySettings.testMessage'),
      duration: durationSliderValue.value * 1000,
      forceAutoClose: true
    }
  }))
}

// 重置设置
function resetSettings() {
  notifySettingsStore.resetToDefaults()
  currentMaxVisible.value = notifySettingsStore.isTabletViewport ? 5 : 3
  const duration = notifySettingsStore.isTabletViewport ? 8000 : 6000
  durationSliderValue.value = duration / 1000
}
</script>

<style scoped>
.notify-settings-page {
  min-height: 100dvh;
}

.page-body {
  padding-bottom: 40px;
}

.hero-section,
.content-section {
  padding: 0 var(--page-padding);
  margin-top: var(--section-gap);
}

.hero-card {
  position: relative;
  display: grid;
  gap: 18px;
  padding: 22px;
  border-radius: var(--radius-large);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
  overflow: hidden;
}

.hero-card::before {
  content: '';
  position: absolute;
  inset: auto -70px -90px auto;
  width: 220px;
  height: 220px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 149, 0, 0.18) 0%, rgba(255, 149, 0, 0) 72%);
  pointer-events: none;
}

.hero-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: var(--radius-card);
  background: rgba(255, 149, 0, 0.12);
  color: #ff9500;
}

.hero-icon svg {
  width: 32px;
  height: 32px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.hero-copy {
  position: relative;
  z-index: 1;
}

.hero-label {
  color: var(--app-text-tertiary);
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.hero-title {
  margin-top: 6px;
  color: var(--app-text);
  font-size: 30px;
  font-weight: 700;
  letter-spacing: -0.04em;
}

.hero-desc {
  margin-top: 10px;
  color: var(--app-text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

/* Settings Sections */
.settings-section {
  padding: 0 var(--page-padding);
  margin-top: 16px;
}

.settings-section--disabled {
  opacity: 0.5;
  pointer-events: none;
}

.settings-card {
  padding: 20px;
  border-radius: 24px;
  background: color-mix(in srgb, var(--app-surface) 88%, transparent);
  box-shadow: var(--app-shadow);
}

.settings-card__header {
  margin-bottom: 16px;
}

.settings-card__label {
  color: var(--app-text-tertiary);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.settings-card__title {
  margin: 4px 0 0;
  color: var(--app-text);
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.03em;
}

/* Settings List */
.settings-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.settings-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 14px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--app-surface-soft) 72%, transparent);
}

.settings-item--column {
  flex-direction: column;
  align-items: stretch;
}

.settings-item--slider {
  flex-direction: column;
  align-items: stretch;
  gap: 12px;
  padding: 14px;
}

.settings-item__info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.settings-item--slider .settings-item__info {
  flex-wrap: wrap;
}

.settings-item__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  flex-shrink: 0;
}

.settings-item__icon svg {
  width: 20px;
  height: 20px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.settings-item__icon--main {
  background: rgba(255, 149, 0, 0.12);
  color: #ff9500;
}

.settings-item__icon--sale {
  background: rgba(255, 59, 48, 0.12);
  color: #ff3b30;
}

.settings-item__icon--syncing {
  background: rgba(88, 86, 214, 0.12);
  color: #5856d6;
}

.settings-item__icon--success {
  background: rgba(52, 199, 89, 0.12);
  color: #34c759;
}

.settings-item__icon--error {
  background: rgba(255, 59, 48, 0.12);
  color: #ff3b30;
}

.settings-item__icon--update {
  background: rgba(0, 122, 255, 0.12);
  color: #007aff;
}

.settings-item__icon--display {
  background: rgba(52, 199, 89, 0.12);
  color: #34c759;
}

.settings-item__icon--feedback {
  background: rgba(175, 82, 222, 0.12);
  color: #af52de;
}

.settings-item__icon--qq {
  background: rgba(18, 183, 245, 0.12);
  color: #12b7f5;
}

.settings-item__icon--mihoyo {
  background: rgba(84, 184, 253, 0.12);
  color: #54b8fd;
}

.settings-item__icon--ship {
  background: rgba(255, 149, 0, 0.12);
  color: #ff9500;
}

.settings-item__title {
  display: block;
  color: var(--app-text);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.3;
}

.settings-item__desc {
  display: block;
  margin-top: 2px;
  color: var(--app-text-secondary);
  font-size: 13px;
  line-height: 1.4;
}

/* Toggle Switch */
.toggle-switch {
  position: relative;
  display: inline-block;
  width: 51px;
  height: 31px;
  flex-shrink: 0;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--app-surface-muted, #e5e5ea);
  transition: background-color 0.25s ease;
  border-radius: 31px;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.08);
}

.toggle-slider::before {
  position: absolute;
  content: '';
  height: 27px;
  width: 27px;
  left: 2px;
  bottom: 2px;
  background-color: #fff;
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  border-radius: 50%;
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.12),
    0 1px 2px rgba(0, 0, 0, 0.08);
}

.toggle-switch input:checked + .toggle-slider {
  background-color: var(--app-chip-accent-text);
}

.toggle-switch input:checked + .toggle-slider::before {
  transform: translateX(20px);
}

.toggle-switch input:disabled + .toggle-slider {
  opacity: 0.4;
  cursor: not-allowed;
}

:global(html.theme-dark) .toggle-slider {
  background-color: rgba(255, 255, 255, 0.12);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.2);
}

:global(html.theme-dark) .toggle-slider::before {
  background-color: #f5f5f7;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

/* Position Picker */
.position-picker {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.position-option {
  flex: 1;
  padding: 10px 12px;
  border: 1px solid var(--app-border);
  border-radius: 12px;
  background: transparent;
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.position-option:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.position-option--active {
  background: var(--app-text);
  color: var(--app-surface);
  border-color: var(--app-text);
}

/* Mihoyo Shop Picker */
.mihoyo-shop-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.mihoyo-shop-chip {
  padding: 10px 12px;
  border: 1px solid var(--app-border);
  border-radius: 12px;
  background: transparent;
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.mihoyo-shop-chip:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.mihoyo-shop-chip--active {
  background: var(--app-text);
  color: var(--app-surface);
  border-color: var(--app-text);
}

.mihoyo-shop-hint {
  margin: 10px 0 0;
  color: #ff9500;
  font-size: 12px;
}

.settings-item--link {
  cursor: pointer;
  transition: background 0.2s ease;
}

.settings-item--link:active {
  background: color-mix(in srgb, var(--app-text) 6%, transparent);
}

.settings-item__chevron {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  color: var(--app-text-tertiary);
}

/* Number Picker */
.number-picker {
  display: flex;
  align-items: center;
  gap: 12px;
}

.number-picker__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--app-border);
  border-radius: 10px;
  background: transparent;
  color: var(--app-text);
  cursor: pointer;
  transition: all 0.2s ease;
}

.number-picker__btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.number-picker__btn:not(:disabled):active {
  background: color-mix(in srgb, var(--app-text) 8%, transparent);
}

.number-picker__btn svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.number-picker__value {
  min-width: 32px;
  text-align: center;
  color: var(--app-text);
  font-size: 18px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

/* Duration Display */
.duration-display {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-left: auto;
}

.duration-value {
  color: var(--app-text);
  font-size: 20px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.duration-unit {
  color: var(--app-text-secondary);
  font-size: 14px;
}

/* Slider */
.slider-wrapper {
  width: 100%;
  padding: 0 4px;
}

.notify-slider {
  width: 100%;
  height: 8px;
  appearance: none;
  background: color-mix(in srgb, var(--app-text) 12%, transparent);
  border-radius: 999px;
  outline: none;
  cursor: pointer;
}

.notify-slider::-webkit-slider-thumb {
  width: 20px;
  height: 20px;
  appearance: none;
  background: var(--app-surface);
  border: 3px solid var(--app-text);
  border-radius: 50%;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  cursor: pointer;
}

.notify-slider::-moz-range-thumb {
  width: 20px;
  height: 20px;
  background: var(--app-surface);
  border: 3px solid var(--app-text);
  border-radius: 50%;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  cursor: pointer;
}

.notify-slider:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.notify-slider:disabled::-webkit-slider-thumb {
  cursor: not-allowed;
}

.notify-slider:disabled::-moz-range-thumb {
  cursor: not-allowed;
}

/* Action Buttons */
.settings-action-btn {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 16px;
  border: none;
  border-radius: 16px;
  background: color-mix(in srgb, var(--app-surface-soft) 72%, transparent);
  color: var(--app-text);
  text-align: left;
  cursor: pointer;
  transition: all 0.2s ease;
}

.settings-action-btn:active {
  transform: scale(0.98);
}

.settings-action-btn--danger {
  color: #ff3b30;
}

.settings-action-btn__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: rgba(0, 122, 255, 0.12);
  color: #007aff;
  flex-shrink: 0;
}

.settings-action-btn--danger .settings-action-btn__icon {
  background: rgba(255, 59, 48, 0.12);
  color: #ff3b30;
}

.settings-action-btn__icon svg {
  width: 20px;
  height: 20px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.settings-action-btn__text {
  font-size: 15px;
  font-weight: 600;
}

/* Responsive */
@media (min-width: 768px) {
  .settings-card {
    padding: 24px;
  }

  .settings-item {
    padding: 16px;
  }

  .position-picker {
    gap: 12px;
  }
}

@media (max-width: 767px) {
  .page-body {
    padding-bottom: calc(154px + env(safe-area-inset-bottom));
  }

  .notify-hero__title {
    font-size: 24px;
  }

  .settings-card {
    padding: 16px;
  }

  .settings-item {
    padding: 12px;
  }
}
</style>
