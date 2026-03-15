<template>
  <div class="page theme-page">
    <NavBar :key="`${themeStore.themeId}-${themeStore.appliedAppearance}`" title="主题与外观" show-back />

    <main ref="pageBodyRef" class="page-body">
      <section class="hero-section">
        <div class="hero-copy">
          <p class="hero-label">Theme & Appearance</p>
          <h1 class="hero-title">主题与外观</h1>
        </div>

        <article class="preview-card">
          <p class="preview-kicker">当前使用</p>
          <h2 class="preview-title">{{ themeStore.themeDefinition.label }}</h2>
          <p class="preview-desc">{{ themeStore.themeDefinition.description }}</p>
          <div class="preview-row">
            <span class="preview-chip">实际外观：{{ appliedAppearanceLabel }}</span>
            <span class="preview-chip">设置：{{ preferenceLabel }}</span>
          </div>
        </article>
      </section>

      <section class="content-section">
        <div class="section-head">
          <div>
            <p class="section-label">Theme Library</p>
            <h2 class="section-title">主题风格</h2>
          </div>
        </div>

        <div class="theme-grid">
          <button
            v-for="theme in visibleThemeOptions"
            :key="theme.id"
            type="button"
            :class="['theme-card', { 'theme-card--active': themeStore.themeId === theme.id }]"
            :style="getThemeCardStyle(theme)"
            @click="themeStore.setTheme(theme.id)"
          >
            <div
              :class="[
                'theme-card__preview',
                { 'theme-card__preview--dual': theme.supportsAppearanceControl }
              ]"
            >
              <div
                v-for="previewAppearance in getThemePreviewAppearances(theme)"
                :key="previewAppearance.key"
                :class="[
                  'theme-card__pane',
                  { 'theme-card__pane--dual': theme.supportsAppearanceControl }
                ]"
                :style="getThemePreviewPaneStyle(previewAppearance)"
              >
                <div class="theme-card__surface">
                  <span class="theme-card__badge" />
                  <span class="theme-card__badge theme-card__badge--soft" />
                  <span class="theme-card__line" />
                  <span class="theme-card__line theme-card__line--short" />
                </div>
                <div class="theme-card__swatches">
                  <span
                    v-for="color in getThemeSwatches(previewAppearance, theme)"
                    :key="`${previewAppearance.key}-${color}`"
                    class="theme-card__swatch"
                    :style="{ background: color }"
                  />
                </div>
              </div>
            </div>

            <div class="theme-card__body">
              <div class="theme-card__title-row">
                <p class="theme-card__name">{{ theme.label }}</p>
                <span class="theme-card__state">{{ themeStore.themeId === theme.id ? '当前' : '切换' }}</span>
              </div>
              <p class="theme-card__desc">{{ theme.description }}</p>
              <p class="theme-card__meta">
                {{
                  theme.supportsAppearanceControl
                    ? '支持浅色 / 深色 / 跟随系统'
                    : `${theme.defaultAppearance === 'dark' ? '固定深色外观' : '固定浅色外观'}`
                }}
              </p>
            </div>
          </button>
        </div>
      </section>

      <section class="content-section">
        <div class="section-head">
          <div>
            <p class="section-label">Appearance Mode</p>
            <h2 class="section-title">外观模式</h2>
          </div>
        </div>

        <div v-if="themeStore.canCustomizeAppearance" class="mode-list">
          <button
            v-for="option in APPEARANCE_OPTIONS"
            :key="option.value"
            type="button"
            :class="['mode-card', { 'mode-card--active': themeStore.appearancePreference === option.value }]"
            @click="themeStore.setAppearancePreference(option.value)"
          >
            <div class="mode-copy">
              <p class="mode-name">{{ option.label }}</p>
              <p class="mode-desc">{{ option.description }}</p>
            </div>
            <span class="mode-state">{{ themeStore.appearancePreference === option.value ? '当前使用' : '切换' }}</span>
          </button>
        </div>

        <article v-else class="mode-lock-card">
          <p class="mode-lock-title">当前主题固定为 {{ appliedAppearanceLabel }} 外观</p>
          <p class="mode-lock-desc">只有支持外观切换的主题才可以在这里选择浅色、深色或跟随系统。切回支持切换的主题后，这里的设置会继续生效。</p>
        </article>
      </section>
    </main>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { APPEARANCE_OPTIONS, APPEARANCE_PREFERENCES, THEME_OPTIONS } from '@/constants/themes'
import NavBar from '@/components/NavBar.vue'
import { useThemeStore } from '@/stores/theme'

const themeStore = useThemeStore()
const pageBodyRef = ref(null)
const visibleThemeOptions = THEME_OPTIONS.filter((theme) => !theme.hidden)

const appliedAppearanceLabel = computed(() => (
  themeStore.appliedAppearance === 'dark' ? '深色' : '浅色'
))

const preferenceLabel = computed(() => {
  switch (themeStore.appearancePreference) {
    case APPEARANCE_PREFERENCES.light:
      return '浅色模式'
    case APPEARANCE_PREFERENCES.dark:
      return '深色模式'
    case APPEARANCE_PREFERENCES.system:
    default:
      return '跟随系统'
  }
})

function getThemeCardStyle(theme) {
  return {
    '--theme-preview-columns': theme.supportsAppearanceControl ? 2 : 1
  }
}

function getThemePreviewAppearances(theme) {
  if (theme.supportsAppearanceControl && theme.appearances.light && theme.appearances.dark) {
    return [
      { key: 'light', tokens: theme.appearances.light },
      { key: 'dark', tokens: theme.appearances.dark }
    ]
  }

  return [
    {
      key: theme.defaultAppearance,
      tokens: theme.appearances[theme.defaultAppearance]
    }
  ]
}

function getThemePreviewPaneStyle(previewAppearance) {
  const tokens = previewAppearance.tokens

  return {
    '--theme-preview-bg': tokens['--app-bg-gradient'] || tokens['--app-bg'],
    '--theme-preview-surface': tokens['--app-surface'],
    '--theme-preview-soft': tokens['--app-surface-soft'],
    '--theme-preview-text': tokens['--app-text']
  }
}

function getThemeSwatches(previewAppearance, theme) {
  const tokens = previewAppearance.tokens
  return [
    tokens['--app-surface'],
    tokens['--app-surface-soft'],
    theme.preview[2]
  ]
}

function resetPageScrollTop() {
  try {
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
    window.scrollTo(0, 0)
  } catch {
    // ignore scroll reset failures in non-browser contexts
  }

  if (pageBodyRef.value) {
    pageBodyRef.value.scrollTop = 0
  }
}

onMounted(() => {
  resetPageScrollTop()
  window.requestAnimationFrame(resetPageScrollTop)
})
</script>

<style scoped>
.page-body {
  padding-bottom: 40px;
}

.hero-section,
.content-section {
  padding: 0 var(--page-padding);
  margin-top: var(--section-gap);
}

.hero-section {
  display: grid;
  gap: 14px;
}

.hero-label,
.section-label {
  color: var(--app-text-tertiary);
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.hero-title,
.section-title {
  margin-top: 4px;
  color: var(--app-text);
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.04em;
}

.section-title {
  font-size: 22px;
  font-weight: 600;
}

.preview-desc,
.theme-card__desc,
.mode-desc,
.mode-lock-desc {
  margin-top: 8px;
  color: var(--app-text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.preview-card,
.theme-card,
.mode-card,
.mode-lock-card {
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
}

.preview-card,
.mode-lock-card {
  padding: 20px;
  border-radius: var(--radius-large);
}

.preview-kicker,
.mode-state,
.theme-card__state,
.theme-card__meta {
  color: var(--app-text-tertiary);
  font-size: 12px;
  font-weight: 600;
}

.preview-title {
  margin-top: 8px;
  color: var(--app-text);
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.04em;
}

.preview-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

.preview-chip {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 600;
}

.section-head {
  margin-bottom: 14px;
}

.theme-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.theme-card,
.mode-card {
  border: none;
  text-align: left;
}

.theme-card {
  position: relative;
  isolation: isolate;
  display: flex;
  flex-direction: column;
  padding: 14px;
  border-radius: var(--radius-card);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--app-text) 6%, transparent);
  transition:
    transform var(--motion-fast) var(--motion-emphasis),
    box-shadow var(--motion-fast) var(--motion-emphasis);
}

.theme-card__preview {
  display: grid;
  grid-template-columns: repeat(var(--theme-preview-columns), minmax(0, 1fr));
  align-items: stretch;
  gap: 8px;
}

.theme-card__preview--dual {
  gap: 10px;
}

.theme-card__pane {
  display: flex;
  flex-direction: column;
  min-height: 124px;
  padding: 12px;
  border-radius: calc(var(--radius-card) - 4px);
  background: var(--theme-preview-bg);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--theme-preview-text) 8%, transparent);
}

.theme-card__pane--dual {
  padding: 10px;
}

.theme-card__surface {
  position: relative;
  height: 76px;
  padding: 12px;
  overflow: hidden;
  border-radius: 18px;
  background: color-mix(in srgb, var(--theme-preview-surface) 86%, transparent);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);
}

.theme-card__pane--dual .theme-card__surface {
  height: 72px;
  padding: 10px;
  border-radius: 16px;
}

.theme-card__badge,
.theme-card__badge--soft {
  position: absolute;
  left: 12px;
  height: 10px;
  border-radius: 999px;
}

.theme-card__badge {
  top: 16px;
  width: 54px;
  background: var(--theme-preview-text);
  opacity: 0.82;
}

.theme-card__badge--soft {
  top: 32px;
  width: 72px;
  background: var(--theme-preview-soft);
}

.theme-card__line,
.theme-card__line--short {
  position: absolute;
  left: 12px;
  height: 9px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--theme-preview-text) 12%, var(--theme-preview-surface));
}

.theme-card__line {
  bottom: 22px;
  width: 72%;
}

.theme-card__line--short {
  bottom: 10px;
  width: 52%;
}

.theme-card__pane--dual .theme-card__badge,
.theme-card__pane--dual .theme-card__badge--soft {
  left: 10px;
  height: 8px;
}

.theme-card__pane--dual .theme-card__badge {
  top: 18px;
  width: 44px;
}

.theme-card__pane--dual .theme-card__badge--soft {
  top: 32px;
  width: 58px;
}

.theme-card__pane--dual .theme-card__line,
.theme-card__pane--dual .theme-card__line--short {
  left: 10px;
  height: 8px;
}

.theme-card__pane--dual .theme-card__line {
  bottom: 20px;
  width: 64%;
}

.theme-card__pane--dual .theme-card__line--short {
  bottom: 8px;
  width: 44%;
}

.theme-card__swatches {
  display: flex;
  gap: 8px;
  margin-top: auto;
  padding-top: 12px;
}

.theme-card__pane--dual .theme-card__swatches {
  gap: 6px;
  padding-top: 10px;
}

.theme-card__swatch {
  width: 12px;
  height: 12px;
  border-radius: 999px;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.18);
}

.theme-card__pane--dual .theme-card__swatch {
  width: 11px;
  height: 11px;
}

.theme-card__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  margin-top: 14px;
  min-width: 0;
}

.theme-card__title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.theme-card__name,
.mode-name,
.mode-lock-title {
  color: var(--app-text);
  font-size: 16px;
  font-weight: 600;
}

.theme-card__state {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-surface-soft) 88%, transparent);
  transition:
    background var(--motion-fast) var(--motion-emphasis),
    color var(--motion-fast) var(--motion-emphasis),
    box-shadow var(--motion-fast) var(--motion-emphasis);
}

.theme-card__name {
  flex: 1;
  min-width: 0;
}

.theme-card__desc {
  min-height: 68px;
}

.theme-card__meta {
  margin-top: auto;
  padding-top: 14px;
}

.theme-card--active {
  box-shadow:
    var(--app-shadow),
    0 0 0 2px color-mix(in srgb, var(--app-text) 32%, transparent),
    0 14px 30px color-mix(in srgb, var(--app-text) 12%, transparent);
  transform: translateY(-1px);
}

.theme-card--active::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  box-shadow:
    inset 0 0 0 2px color-mix(in srgb, var(--app-text) 22%, transparent),
    0 0 0 4px color-mix(in srgb, var(--app-text) 8%, transparent);
}

.theme-card--active .theme-card__state {
  background: var(--app-text);
  color: var(--app-surface);
  box-shadow: 0 8px 18px color-mix(in srgb, var(--app-text) 14%, transparent);
}

.mode-list {
  display: grid;
  gap: 12px;
}

.mode-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
  padding: 18px 20px;
  border-radius: var(--radius-large);
}

.mode-card--active {
  box-shadow:
    var(--app-shadow),
    0 0 0 1px color-mix(in srgb, var(--app-text) 12%, transparent);
}

.mode-copy {
  min-width: 0;
}

.mode-lock-title {
  font-size: 18px;
}

:deep(.nav-bar) {
  z-index: 60;
}

:deep(.nav-back) {
  background: color-mix(in srgb, var(--app-surface) 84%, transparent);
  border-color: color-mix(in srgb, var(--app-text) 8%, transparent);
}

@media (max-width: 768px) {
  .theme-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .theme-card__desc {
    min-height: 0;
  }

  .mode-card {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
