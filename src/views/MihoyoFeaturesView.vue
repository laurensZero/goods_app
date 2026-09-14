<template>
  <div class="page mihoyo-features-page">
    <NavBar :title="t('nav.mihoyoFeatures')" show-back />

    <main ref="pageBodyRef" class="page-body page-entry">
      <section class="hero-section">
        <article class="hero-card">
          <div class="hero-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
              <line x1="7" y1="7" x2="7.01" y2="7" />
            </svg>
          </div>
          <div class="hero-copy">
            <p class="hero-label">MIHOYO SHOP</p>
            <h1 class="hero-title">{{ t('manage.mihoyoFeatures') }}</h1>
            <p class="hero-desc">{{ t('manage.mihoyoFeaturesDesc') }}</p>
          </div>
        </article>
      </section>

      <section class="settings-section">
        <div class="settings-card">
          <div class="settings-card__header">
            <p class="settings-card__label">FEATURE</p>
            <h2 class="settings-card__title">{{ t('manage.mihoyoFeaturesMaster') }}</h2>
          </div>

          <div class="settings-list">
            <div class="settings-item">
              <div class="settings-item__info">
                <span class="settings-item__icon settings-item__icon--mihoyo">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                    <line x1="7" y1="7" x2="7.01" y2="7" />
                  </svg>
                </span>
                <div>
                  <span class="settings-item__title">{{ t('manage.mihoyoFeaturesMaster') }}</span>
                  <span class="settings-item__desc">{{ t('manage.mihoyoFeaturesMasterDesc') }}</span>
                </div>
              </div>
              <label class="toggle-switch" :aria-label="t('manage.mihoyoFeaturesMaster')">
                <input
                  :checked="mihoyoFeaturesStore.enabled"
                  type="checkbox"
                  @change="onEnabledChange"
                />
                <span class="toggle-slider" />
              </label>
            </div>

            <div class="settings-item">
              <div class="settings-item__info">
                <span :class="['settings-item__icon', mihoyoFeaturesStore.enabled ? 'settings-item__icon--success' : 'settings-item__icon--idle']">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="9" />
                    <path v-if="mihoyoFeaturesStore.enabled" d="M8 12.5l2.5 2.5L16 9.5" />
                    <path v-else d="M8 8l8 8M16 8l-8 8" />
                  </svg>
                </span>
                <div>
                  <span class="settings-item__title">{{ statusText }}</span>
                  <span class="settings-item__desc">{{ statusDetailText }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="settings-section">
        <div class="settings-card">
          <div class="settings-card__header">
            <p class="settings-card__label">SCOPE</p>
            <h2 class="settings-card__title">{{ t('manage.mihoyoFeaturesScope') }}</h2>
          </div>

          <div class="settings-list">
            <div
              v-for="item in scopeItems"
              :key="item.key"
              class="settings-item"
              :class="{ 'settings-item--dimmed': !mihoyoFeaturesStore.enabled }"
            >
              <div class="settings-item__info">
                <span :class="['settings-item__icon', item.iconClass]">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path v-for="(path, index) in item.iconPaths" :key="index" :d="path" />
                  </svg>
                </span>
                <div>
                  <span class="settings-item__title">{{ item.title }}</span>
                  <span class="settings-item__desc">{{ item.desc }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import NavBar from '@/components/common/NavBar.vue'
import { useMihoyoFeaturesStore } from '@/stores/mihoyoFeatures'
import { scrollToTopAnimated } from '@/utils/scrollToTopAnimated'

defineOptions({ name: 'MihoyoFeaturesView' })

const { t } = useI18n()
const pageBodyRef = ref(null)
const mihoyoFeaturesStore = useMihoyoFeaturesStore()

const statusText = computed(() =>
  mihoyoFeaturesStore.enabled
    ? t('manage.mihoyoFeaturesStatusOn')
    : t('manage.mihoyoFeaturesStatusOff')
)
const statusDetailText = computed(() =>
  mihoyoFeaturesStore.enabled
    ? t('manage.mihoyoFeaturesStatusOnDesc')
    : t('manage.mihoyoFeaturesStatusOffDesc')
)

const scopeItems = computed(() => [
  {
    key: 'import',
    title: t('manage.mihoyoFeaturesScopeImport'),
    desc: t('manage.mihoyoFeaturesScopeImportDesc'),
    iconClass: 'settings-item__icon--url',
    iconPaths: [
      'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4',
      'M7 10L12 15L17 10',
      'M12 15V3'
    ]
  },
  {
    key: 'arrivals',
    title: t('manage.mihoyoFeaturesScopeArrivals'),
    desc: t('manage.mihoyoFeaturesScopeArrivalsDesc'),
    iconClass: 'settings-item__icon--main',
    iconPaths: [
      'M12 3l2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4L7.5 16.7l.9-5L4.8 8.2l5-.7L12 3z'
    ]
  },
  {
    key: 'monitor',
    title: t('manage.mihoyoFeaturesScopeMonitor'),
    desc: t('manage.mihoyoFeaturesScopeMonitorDesc'),
    iconClass: 'settings-item__icon--success',
    iconPaths: [
      'M3 3h18v18H3z',
      'M3 9h18',
      'M9 21V9'
    ]
  },
  {
    key: 'checkout',
    title: t('manage.mihoyoFeaturesScopeCheckout'),
    desc: t('manage.mihoyoFeaturesScopeCheckoutDesc'),
    iconClass: 'settings-item__icon--token',
    iconPaths: [
      'M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z',
      'M3 6h18',
      'M16 10a4 4 0 0 1-8 0'
    ]
  },
  {
    key: 'notify',
    title: t('manage.mihoyoFeaturesScopeNotify'),
    desc: t('manage.mihoyoFeaturesScopeNotifyDesc'),
    iconClass: 'settings-item__icon--qq',
    iconPaths: [
      'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9',
      'M13.73 21a2 2 0 0 1-3.46 0'
    ]
  },
  {
    key: 'recharge',
    title: t('manage.mihoyoFeaturesScopeRecharge'),
    desc: t('manage.mihoyoFeaturesScopeRechargeDesc'),
    iconClass: 'settings-item__icon--config',
    iconPaths: [
      'M12 2v20',
      'M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6'
    ]
  }
])

function onEnabledChange(e) {
  mihoyoFeaturesStore.setEnabled(!!e.target.checked)
}

function resetPageScrollTop() {
  scrollToTopAnimated(() => pageBodyRef.value, 0)
}

onMounted(() => {
  resetPageScrollTop()
  window.requestAnimationFrame(resetPageScrollTop)
})
</script>

<style scoped>
.mihoyo-features-page {
  min-height: 100dvh;
}

.page-body {
  padding-bottom: 40px;
}

.hero-section,
.settings-section {
  padding: 0 var(--page-padding);
}

.hero-section {
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
  background: radial-gradient(circle, rgba(84, 184, 253, 0.22) 0%, rgba(84, 184, 253, 0) 72%);
  pointer-events: none;
}

.hero-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: var(--radius-card);
  background: rgba(84, 184, 253, 0.14);
  color: #54b8fd;
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

.settings-section {
  margin-top: 16px;
}

.settings-card {
  padding: 20px;
  border-radius: 24px;
  background: color-mix(in srgb, var(--app-surface) 94%, transparent);
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

.settings-item--dimmed {
  opacity: 0.55;
}

.settings-item__info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
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

.settings-item__icon--mihoyo {
  background: rgba(84, 184, 253, 0.12);
  color: #54b8fd;
}

.settings-item__icon--main {
  background: rgba(138, 122, 255, 0.14);
  color: #8a7aff;
}

.settings-item__icon--success {
  background: rgba(52, 199, 89, 0.12);
  color: #34c759;
}

.settings-item__icon--idle {
  background: color-mix(in srgb, var(--app-text) 8%, transparent);
  color: var(--app-text-tertiary);
}

.settings-item__icon--url {
  background: rgba(0, 122, 255, 0.12);
  color: #007aff;
}

.settings-item__icon--token {
  background: rgba(255, 149, 0, 0.12);
  color: #ff9500;
}

.settings-item__icon--qq {
  background: rgba(18, 183, 245, 0.12);
  color: #12b7f5;
}

.settings-item__icon--config {
  background: rgba(175, 82, 222, 0.12);
  color: #af52de;
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

:global(html.theme-dark) .toggle-slider {
  background-color: rgba(255, 255, 255, 0.12);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.2);
}

:global(html.theme-dark) .toggle-slider::before {
  background-color: #f5f5f7;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

@media (min-width: 768px) {
  .settings-card {
    padding: 24px;
  }

  .settings-item {
    padding: 16px;
  }
}

@media (max-width: 767px) {
  .page-body {
    padding-bottom: calc(154px + env(safe-area-inset-bottom));
  }

  .hero-title {
    font-size: 24px;
  }

  .settings-card {
    padding: 16px;
  }
}
</style>
