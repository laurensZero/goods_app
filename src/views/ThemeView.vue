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
            <span class="preview-chip">偏好设置：{{ preferenceLabel }}</span>
            <span v-if="isCustomThemeActive" class="preview-chip">自定义颜色实时生效</span>
          </div>
        </article>
      </section>

      <section class="content-section">
        <div class="section-head">
          <div>
            <p class="section-label">Theme Library</p>
            <h2 class="section-title">主题风格</h2>
            <p class="section-desc">内置主题在前，自定义主题固定放在最后，方便先挑风格再细调。</p>
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
              <p class="theme-card__meta">{{ getThemeMeta(theme) }}</p>
            </div>
          </button>
        </div>
      </section>

      <section v-if="isCustomThemeActive" class="content-section">
        <div class="section-head section-head--split">
          <div>
            <p class="section-label">Custom Theme Studio</p>
            <h2 class="section-title">自定义主题</h2>
            <p class="section-desc">浅色和深色分别调色，卡片预览和页面主题都会实时更新。</p>
          </div>
          <button type="button" class="ghost-button" @click="themeStore.resetCustomColors()">
            恢复默认
          </button>
        </div>

        <div class="custom-grid">
          <article
            v-for="mode in CUSTOM_THEME_MODES"
            :key="mode.value"
            class="custom-mode-card"
          >
            <div class="custom-mode-head">
              <div>
                <p class="custom-mode-kicker">{{ mode.kicker }}</p>
                <h3 class="custom-mode-title">{{ mode.label }}</h3>
              </div>
              <button
                type="button"
                class="ghost-button ghost-button--small"
                @click="themeStore.resetCustomColors(mode.value)"
              >
                重置
              </button>
            </div>

            <div class="custom-preview" :style="getCustomPreviewStyle(mode.value)">
              <div class="custom-preview__hero">
                <div class="custom-preview__surface">
                  <span class="custom-preview__badge" />
                  <span class="custom-preview__badge custom-preview__badge--soft" />
                  <span class="custom-preview__line" />
                  <span class="custom-preview__line custom-preview__line--short" />
                </div>
              </div>
              <div class="custom-preview__palette">
                <div
                  v-for="swatch in getCustomPreviewSwatches(mode.value)"
                  :key="`${mode.value}-${swatch.key}`"
                  class="custom-preview__tone"
                  :style="getCustomToneStyle(swatch.color)"
                >
                  <span class="custom-preview__tone-label">{{ swatch.label }}</span>
                  <span class="custom-preview__tone-value">{{ swatch.color }}</span>
                </div>
              </div>
            </div>

             <div class="custom-fields">
               <label
                 v-for="field in CUSTOM_THEME_FIELDS"
                 :key="`${mode.value}-${field.key}`"
                class="custom-field"
              >
                <span class="custom-field__meta">
                  <span class="custom-field__label-wrap">
                    <span
                      class="custom-field__dot"
                      :style="{ background: getCustomColorValue(mode.value, field.key) }"
                    />
                    <span class="custom-field__label">{{ field.label }}</span>
                  </span>
                  <span class="custom-field__hint">HEX</span>
                </span>
                <button
                  type="button"
                  class="custom-field__trigger"
                  @click="openColorPicker(mode.value, field.key)"
                >
                  <span
                    class="custom-field__picker"
                    :style="{ background: getCustomColorValue(mode.value, field.key) }"
                  />
                  <span class="custom-field__input">{{ getCustomColorValue(mode.value, field.key) }}</span>
                </button>
              </label>
             </div>

             <div class="custom-effect-card" :style="getCustomBlurControlStyle(mode.value)">
               <div class="custom-effect-card__head">
                 <div>
                   <p class="custom-effect-card__kicker">Glass Dialog</p>
                    <h4 class="custom-effect-card__title">模糊弹窗</h4>
                  </div>
                  <strong class="custom-effect-card__value">{{ getCustomBlurValue(mode.value) }}px</strong>
                </div>

               <label class="custom-effect-card__slider">
                 <span class="custom-effect-card__slider-label">Blur</span>
                 <input
                   :value="getCustomBlurValue(mode.value)"
                   class="theme-color-slider__input"
                   type="range"
                   min="0"
                   max="36"
                   step="1"
                   :style="getCustomBlurTrackStyle(mode.value)"
                   @input="handleCustomBlurSlider(mode.value, $event)"
                 >
               </label>
             </div>
           </article>
         </div>
      </section>

      <section class="content-section">
        <div class="section-head">
          <div>
            <p class="section-label">Appearance Mode</p>
            <h2 class="section-title">外观模式</h2>
            <p class="section-desc">支持双模式的主题可以跟随系统，也可以固定成浅色或深色。</p>
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
          <p class="mode-lock-desc">
            只有支持外观切换的主题才能在这里选择浅色、深色或跟随系统。切换回支持双模式的主题后，这里的偏好会继续生效。
          </p>
        </article>
      </section>
    </main>

    <Popup
      v-model:show="colorPicker.show"
      teleport="body"
      :z-index="2200"
      :position="pickerPopupPosition"
      :round="!isTabletViewport"
      :class="['theme-color-popup', { 'theme-color-popup--center': isTabletViewport }]"
    >
      <div class="theme-color-sheet">
        <div class="theme-color-sheet__head">
          <div>
            <p class="section-label">Color Picker</p>
            <h3 class="theme-color-sheet__title">{{ activePickerFieldLabel }} · {{ activePickerModeLabel }}</h3>
          </div>
          <div class="theme-color-sheet__actions">
            <button type="button" class="ghost-button ghost-button--small" @click="closeColorPicker">
              取消
            </button>
            <button type="button" class="ghost-button ghost-button--small ghost-button--solid" @click="applyColorPicker">
              应用
            </button>
          </div>
        </div>

        <div class="theme-color-sheet__preview" :style="getPickerPreviewStyle()">
          <div class="theme-color-sheet__preview-canvas">
            <div class="theme-color-sheet__preview-surface">
              <span class="theme-color-sheet__preview-accent" />
              <span class="theme-color-sheet__preview-text" />
              <span class="theme-color-sheet__preview-text theme-color-sheet__preview-text--short" />
            </div>
          </div>
          <div class="theme-color-sheet__preview-meta">
            <span class="theme-color-sheet__preview-label">{{ activePickerFieldLabel }}</span>
            <strong class="theme-color-sheet__preview-value">{{ pickerHex }}</strong>
          </div>
        </div>

        <div class="theme-color-sheet__sliders">
          <label class="theme-color-slider">
            <span class="theme-color-slider__label">Hue</span>
            <input
              :value="colorPicker.h"
              class="theme-color-slider__input theme-color-slider__input--hue"
              type="range"
              min="0"
              max="360"
              step="1"
              @input="handleHueSlider"
            >
          </label>
          <label class="theme-color-slider">
            <span class="theme-color-slider__label">Sat</span>
            <input
              :value="colorPicker.s"
              class="theme-color-slider__input"
              type="range"
              min="0"
              max="100"
              step="1"
              :style="getSliderTrackStyle('saturation')"
              @input="handleSaturationSlider"
            >
          </label>
          <label class="theme-color-slider">
            <span class="theme-color-slider__label">Light</span>
            <input
              :value="colorPicker.l"
              class="theme-color-slider__input"
              type="range"
              min="0"
              max="100"
              step="1"
              :style="getSliderTrackStyle('lightness')"
              @input="handleLightnessSlider"
            >
          </label>
        </div>

        <div class="theme-color-sheet__footer">
          <input
            :value="pickerHex"
            type="text"
            inputmode="text"
            maxlength="7"
            class="theme-color-sheet__hex-input"
            @change="handlePickerHexInput"
          >
        </div>
      </div>
    </Popup>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { APPEARANCE_OPTIONS, APPEARANCE_PREFERENCES, THEME_OPTIONS } from '@/constants/themes'
import NavBar from '@/components/common/NavBar.vue'
import { buildCustomThemeTokens, useThemeStore } from '@/stores/theme'
import { Popup } from 'vant'

const CUSTOM_THEME_MODES = [
  { value: 'light', label: '浅色外观', kicker: 'Light appearance' },
  { value: 'dark', label: '深色外观', kicker: 'Dark appearance' }
]

const CUSTOM_THEME_FIELDS = [
  { key: 'bg', label: '背景' },
  { key: 'surface', label: '表面' },
  { key: 'primary', label: '主色' },
  { key: 'text', label: '文字' }
]

const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{6})$/
const TABLET_BREAKPOINT = 768

const themeStore = useThemeStore()
const pageBodyRef = ref(null)
const viewportWidth = ref(typeof window === 'undefined' ? 0 : window.innerWidth)
const colorPicker = reactive({
  show: false,
  mode: 'light',
  field: 'bg',
  h: 0,
  s: 0,
  l: 100
})

const visibleThemeOptions = computed(() => {
  const options = THEME_OPTIONS.filter((theme) => !theme.hidden)
  const customThemes = options.filter((theme) => theme.id === 'custom')
  const regularThemes = options.filter((theme) => theme.id !== 'custom')

  return [...regularThemes, ...customThemes]
})

const isCustomThemeActive = computed(() => themeStore.themeId === 'custom')
const isTabletViewport = computed(() => viewportWidth.value >= TABLET_BREAKPOINT)
const pickerPopupPosition = computed(() => (isTabletViewport.value ? 'center' : 'bottom'))
const pickerHex = computed(() => hslToHex(Number(colorPicker.h), Number(colorPicker.s), Number(colorPicker.l)))
const activePickerFieldLabel = computed(() => (
  CUSTOM_THEME_FIELDS.find((field) => field.key === colorPicker.field)?.label || '颜色'
))
const activePickerModeLabel = computed(() => (
  CUSTOM_THEME_MODES.find((mode) => mode.value === colorPicker.mode)?.label || '主题'
))
const activePickerPreviewColors = computed(() => {
  const modeColors = themeStore.customColors[colorPicker.mode] || themeStore.customColors.light

  return {
    ...modeColors,
    [colorPicker.field]: pickerHex.value
  }
})

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

function resolveThemeTokens(theme, appearance) {
  if (theme.id !== 'custom') {
    return { ...theme.appearances[appearance] }
  }

  return buildCustomThemeTokens(
    themeStore.customColors[appearance] || themeStore.customColors.light,
    appearance,
    themeStore.customEffects[appearance] || themeStore.customEffects.light
  )
}

function getThemePreviewAppearances(theme) {
  if (theme.supportsAppearanceControl && theme.appearances.light && theme.appearances.dark) {
    return [
      { key: 'light', tokens: resolveThemeTokens(theme, 'light') },
      { key: 'dark', tokens: resolveThemeTokens(theme, 'dark') }
    ]
  }

  return [
    {
      key: theme.defaultAppearance,
      tokens: resolveThemeTokens(theme, theme.defaultAppearance)
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
    tokens['--app-bg'],
    tokens['--app-surface'],
    tokens['--app-primary'] || theme.preview[2] || tokens['--app-text']
  ]
}

function getThemeMeta(theme) {
  if (theme.id === 'custom') {
    return '浅色/深色独立调色，实时预览'
  }

  return theme.supportsAppearanceControl
    ? '支持浅色 / 深色 / 跟随系统'
    : `固定${theme.defaultAppearance === 'dark' ? '深色' : '浅色'}外观`
}

function getCustomColorValue(mode, key) {
  return themeStore.customColors[mode]?.[key] || ''
}

function getCustomPreviewStyle(mode) {
  const colors = themeStore.customColors[mode]
  const tokens = buildCustomThemeTokens(colors, mode, themeStore.customEffects[mode] || themeStore.customEffects.light)

  return {
    '--custom-preview-bg': colors.bg,
    '--custom-preview-surface': colors.surface,
    '--custom-preview-text': colors.text,
    '--custom-preview-primary': colors.primary,
    '--custom-preview-blur': tokens['--app-frost-blur'],
    '--custom-preview-saturate': tokens['--app-frost-saturate']
  }
}

function getCustomPreviewSwatches(mode) {
  const colors = themeStore.customColors[mode]
  return CUSTOM_THEME_FIELDS.map((field) => ({
    key: field.key,
    label: field.label,
    color: colors[field.key]
  }))
}

function getCustomBlurValue(mode) {
  return themeStore.customEffects[mode]?.blur ?? themeStore.customEffects.light.blur
}

function getCustomBlurControlStyle(mode) {
  const colors = themeStore.customColors[mode]
  const tokens = buildCustomThemeTokens(colors, mode, themeStore.customEffects[mode] || themeStore.customEffects.light)

  return {
    '--custom-blur-surface': tokens['--app-surface'],
    '--custom-blur-border': tokens['--app-glass-border'],
    '--custom-blur-text': tokens['--app-text'],
    '--custom-blur-text-secondary': tokens['--app-text-secondary'],
    '--custom-blur-soft': tokens['--app-surface-soft'],
    '--custom-blur-accent': tokens['--app-primary']
  }
}

function getCustomBlurTrackStyle(mode) {
  const colors = themeStore.customColors[mode]
  return {
    '--slider-track': `linear-gradient(90deg, color-mix(in srgb, ${colors.surface} 86%, ${colors.bg}) 0%, color-mix(in srgb, ${colors.primary} 48%, ${colors.surface}) 100%)`
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function componentToHex(value) {
  return clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0')
}

function hexToRgb(hexColor) {
  const value = String(hexColor || '').replace('#', '')
  if (value.length !== 6) {
    return { r: 255, g: 255, b: 255 }
  }

  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16)
  }
}

function hexToHsl(hexColor) {
  const { r, g, b } = hexToRgb(hexColor)
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const lightness = (max + min) / 2
  const delta = max - min

  if (delta === 0) {
    return { h: 0, s: 0, l: Math.round(lightness * 100) }
  }

  const saturation = delta / (1 - Math.abs(2 * lightness - 1))
  let hue = 0

  switch (max) {
    case red:
      hue = ((green - blue) / delta) % 6
      break
    case green:
      hue = (blue - red) / delta + 2
      break
    default:
      hue = (red - green) / delta + 4
      break
  }

  return {
    h: Math.round(((hue * 60) + 360) % 360),
    s: Math.round(saturation * 100),
    l: Math.round(lightness * 100)
  }
}

function hslToHex(h, s, l) {
  const hue = ((Number(h) % 360) + 360) % 360
  const saturation = clamp(Number(s), 0, 100) / 100
  const lightness = clamp(Number(l), 0, 100) / 100
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const segment = hue / 60
  const x = chroma * (1 - Math.abs((segment % 2) - 1))
  const match = lightness - chroma / 2

  let red = 0
  let green = 0
  let blue = 0

  if (segment >= 0 && segment < 1) {
    red = chroma
    green = x
  } else if (segment < 2) {
    red = x
    green = chroma
  } else if (segment < 3) {
    green = chroma
    blue = x
  } else if (segment < 4) {
    green = x
    blue = chroma
  } else if (segment < 5) {
    red = x
    blue = chroma
  } else {
    red = chroma
    blue = x
  }

  return `#${componentToHex((red + match) * 255)}${componentToHex((green + match) * 255)}${componentToHex((blue + match) * 255)}`
}

function getReadableTextColor(hexColor) {
  const value = String(hexColor || '').replace('#', '')
  if (value.length !== 6) return '#ffffff'

  const red = Number.parseInt(value.slice(0, 2), 16)
  const green = Number.parseInt(value.slice(2, 4), 16)
  const blue = Number.parseInt(value.slice(4, 6), 16)
  const brightness = (red * 299 + green * 587 + blue * 114) / 1000

  return brightness > 168 ? '#111111' : '#ffffff'
}

function getCustomToneStyle(color) {
  return {
    '--custom-tone-color': color,
    '--custom-tone-ink': getReadableTextColor(color)
  }
}

function getPickerPreviewStyle() {
  const colors = activePickerPreviewColors.value

  return {
    '--picker-preview-bg': colors.bg,
    '--picker-preview-surface': colors.surface,
    '--picker-preview-primary': colors.primary,
    '--picker-preview-text': colors.text
  }
}

function getSliderTrackStyle(type) {
  const hue = Number(colorPicker.h)
  const saturation = Number(colorPicker.s)
  const lightness = Number(colorPicker.l)

  if (type === 'saturation') {
    return {
      '--slider-track': `linear-gradient(90deg, ${hslToHex(hue, 0, lightness)} 0%, ${hslToHex(hue, 100, lightness)} 100%)`
    }
  }

  return {
    '--slider-track': `linear-gradient(90deg, ${hslToHex(hue, saturation, 0)} 0%, ${hslToHex(hue, saturation, 50)} 50%, ${hslToHex(hue, saturation, 100)} 100%)`
  }
}

function getModePrimaryHue(mode) {
  const primary = themeStore.customColors[mode]?.primary || themeStore.customColors.light.primary
  return hexToHsl(primary).h
}

function coercePickerFromNeutralForHue() {
  if (Number(colorPicker.s) > 4) return

  colorPicker.s = colorPicker.field === 'text' ? 10 : 18

  if (Number(colorPicker.l) >= 98) {
    colorPicker.l = colorPicker.field === 'bg' ? 94 : 92
  } else if (Number(colorPicker.l) <= 2) {
    colorPicker.l = colorPicker.field === 'text' ? 14 : 18
  }
}

function handleHueSlider(event) {
  colorPicker.h = Number(event.target.value)
  coercePickerFromNeutralForHue()
}

function handleSaturationSlider(event) {
  colorPicker.s = Number(event.target.value)
}

function handleLightnessSlider(event) {
  colorPicker.l = Number(event.target.value)
}

function handleCustomBlurSlider(mode, event) {
  void themeStore.updateCustomEffects(mode, { blur: Number(event.target.value) })
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

function updateViewportWidth() {
  if (typeof window === 'undefined') return
  viewportWidth.value = window.innerWidth
}

function openColorPicker(mode, fieldKey) {
  const color = getCustomColorValue(mode, fieldKey)
  const hsl = hexToHsl(color)
  const resolvedHue = hsl.s === 0 ? getModePrimaryHue(mode) : hsl.h

  colorPicker.show = true
  colorPicker.mode = mode
  colorPicker.field = fieldKey
  colorPicker.h = resolvedHue
  colorPicker.s = hsl.s
  colorPicker.l = hsl.l
}

function closeColorPicker() {
  colorPicker.show = false
}

function applyColorPicker() {
  themeStore.updateCustomColors(colorPicker.mode, { [colorPicker.field]: pickerHex.value })
  closeColorPicker()
}

function handlePickerHexInput(event) {
  const value = String(event.target.value || '').trim().toLowerCase()

  if (!HEX_COLOR_PATTERN.test(value)) {
    event.target.value = pickerHex.value
    return
  }

  const hsl = hexToHsl(value)
  colorPicker.h = hsl.h
  colorPicker.s = hsl.s
  colorPicker.l = hsl.l
}

onMounted(() => {
  updateViewportWidth()
  window.addEventListener('resize', updateViewportWidth, { passive: true })
  resetPageScrollTop()
  window.requestAnimationFrame(resetPageScrollTop)
})

onBeforeUnmount(() => {
  if (typeof window === 'undefined') return
  window.removeEventListener('resize', updateViewportWidth)
})
</script>

<style scoped src="../assets/views/ThemeView.css"></style>
