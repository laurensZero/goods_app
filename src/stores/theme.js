import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import {
  APPEARANCE_PREFERENCES,
  getThemeAppearance,
  getThemeDefinition,
  THEME_IDS,
  themeSupportsAppearanceControl
} from '@/constants/themes'

const STORAGE_KEY_THEME_ID = 'goods_theme_id'
const STORAGE_KEY_APPEARANCE = 'goods_theme_appearance'
const STORAGE_KEY_CUSTOM_COLORS = 'goods_custom_theme_colors'
const STORAGE_KEY_CUSTOM_EFFECTS = 'goods_custom_theme_effects'
const IS_NATIVE = Capacitor.isNativePlatform()
const SYSTEM_DARK_QUERY = '(prefers-color-scheme: dark)'
const CUSTOM_THEME_MODES = ['light', 'dark']
const CUSTOM_THEME_KEYS = ['bg', 'surface', 'text', 'primary']
const CUSTOM_THEME_EFFECT_KEYS = ['blur']
const DEFAULT_CUSTOM_COLORS = Object.freeze({
  light: Object.freeze({
    bg: '#ffffff',
    surface: '#f5f5f7',
    text: '#1d1d1f',
    primary: '#0066cc'
  }),
  dark: Object.freeze({
    bg: '#000000',
    surface: '#1c1c1e',
    text: '#f5f5f7',
    primary: '#2997ff'
  })
})

const DEFAULT_CUSTOM_EFFECTS = Object.freeze({
  light: Object.freeze({
    blur: 20
  }),
  dark: Object.freeze({
    blur: 24
  })
})

function canUseDom() {
  return typeof window !== 'undefined' && typeof document !== 'undefined'
}

function cloneDefaultCustomColors() {
  return {
    light: { ...DEFAULT_CUSTOM_COLORS.light },
    dark: { ...DEFAULT_CUSTOM_COLORS.dark }
  }
}

function cloneDefaultCustomEffects() {
  return {
    light: { ...DEFAULT_CUSTOM_EFFECTS.light },
    dark: { ...DEFAULT_CUSTOM_EFFECTS.dark }
  }
}

function isHexColor(value) {
  return typeof value === 'string' && /^#(?:[0-9a-fA-F]{6})$/.test(value)
}

function normalizeCustomColors(value) {
  const normalized = cloneDefaultCustomColors()

  if (!value || typeof value !== 'object') {
    return normalized
  }

  for (const mode of CUSTOM_THEME_MODES) {
    const nextMode = value[mode]

    if (!nextMode || typeof nextMode !== 'object') {
      continue
    }

    for (const key of CUSTOM_THEME_KEYS) {
      if (isHexColor(nextMode[key])) {
        normalized[mode][key] = nextMode[key].toLowerCase()
      }
    }
  }

  return normalized
}

function normalizeCustomEffects(value) {
  const normalized = cloneDefaultCustomEffects()

  if (!value || typeof value !== 'object') {
    return normalized
  }

  for (const mode of CUSTOM_THEME_MODES) {
    const nextMode = value[mode]

    if (!nextMode || typeof nextMode !== 'object') {
      continue
    }

    for (const key of CUSTOM_THEME_EFFECT_KEYS) {
      if (key === 'blur' && Number.isFinite(nextMode[key])) {
        normalized[mode][key] = clamp(Math.round(nextMode[key]), 0, 36)
      }
    }
  }

  return normalized
}

function sanitizeCustomColorPatch(colors) {
  const patch = {}

  if (!colors || typeof colors !== 'object') {
    return patch
  }

  for (const key of CUSTOM_THEME_KEYS) {
    if (isHexColor(colors[key])) {
      patch[key] = colors[key].toLowerCase()
    }
  }

  return patch
}

function sanitizeCustomEffectPatch(effects) {
  const patch = {}

  if (!effects || typeof effects !== 'object') {
    return patch
  }

  if (Number.isFinite(effects.blur)) {
    patch.blur = clamp(Math.round(effects.blur), 0, 36)
  }

  return patch
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
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

function rgbToHex({ r, g, b }) {
  const toHex = (channel) => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function mixHex(baseColor, mixColor, ratio = 0.5) {
  const base = hexToRgb(baseColor)
  const mix = hexToRgb(mixColor)
  const amount = clamp(ratio, 0, 1)

  return rgbToHex({
    r: base.r + (mix.r - base.r) * amount,
    g: base.g + (mix.g - base.g) * amount,
    b: base.b + (mix.b - base.b) * amount
  })
}

function withAlpha(hexColor, alpha) {
  const { r, g, b } = hexToRgb(hexColor)
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`
}

function buildCustomThemeTokens(modeColors, appearance, modeEffects = DEFAULT_CUSTOM_EFFECTS[appearance] || DEFAULT_CUSTOM_EFFECTS.light) {
  const isDark = appearance === 'dark'
  const bg = modeColors.bg
  const surface = modeColors.surface
  const text = modeColors.text
  const primary = modeColors.primary
  const blur = clamp(Number(modeEffects?.blur ?? DEFAULT_CUSTOM_EFFECTS[appearance]?.blur ?? 20), 0, 36)

  const bgGradientStart = isDark ? mixHex(bg, '#000000', 0.26) : mixHex(bg, '#ffffff', 0.26)
  const bgGradientMiddle = isDark ? mixHex(bg, primary, 0.08) : mixHex(bg, surface, 0.42)
  const bgGradientEnd = isDark ? mixHex(bg, primary, 0.16) : mixHex(bg, '#d6deea', 0.24)
  const surfaceSoft = isDark ? mixHex(surface, bg, 0.34) : mixHex(surface, bg, 0.24)
  const surfaceMuted = isDark ? mixHex(surface, bg, 0.24) : mixHex(surface, bg, 0.14)
  const accentSoft = isDark ? mixHex(primary, surface, 0.72) : mixHex(primary, '#ffffff', 0.82)
  const accentDeep = isDark ? mixHex(primary, '#000000', 0.34) : mixHex(primary, '#111827', 0.18)
  const summaryBase = isDark ? mixHex(bg, '#05070b', 0.46) : mixHex(bg, '#1f2937', 0.54)
  const popupBlur = `${blur}px`
  const softBlur = `${clamp(Math.round(blur * 0.72), 0, 28)}px`
  const overlayBlur = `${clamp(Math.round(blur * 0.4), 0, 18)}px`
  const popupSaturate = `${clamp(118 + Math.round(blur * 1.2), 108, 170)}%`
  const overlaySaturate = `${clamp(108 + Math.round(blur * 0.8), 100, 145)}%`

  return {
    '--app-bg': bg,
    '--app-bg-gradient': `linear-gradient(180deg, ${bgGradientStart} 0%, ${bgGradientMiddle} 52%, ${bgGradientEnd} 100%)`,
    '--app-surface': surface,
    '--app-surface-soft': surfaceSoft,
    '--app-surface-muted': surfaceMuted,
    '--app-text': text,
    '--app-primary': primary,
    '--app-text-secondary': withAlpha(text, isDark ? 0.72 : 0.62),
    '--app-text-tertiary': withAlpha(text, isDark ? 0.46 : 0.42),
    '--app-placeholder': withAlpha(text, isDark ? 0.3 : 0.26),
    '--app-border': withAlpha(text, isDark ? 0.12 : 0.08),
    '--app-shadow': isDark
      ? `0 16px 32px ${withAlpha(mixHex(bg, '#000000', 0.68), 0.44)}`
      : `0 14px 28px ${withAlpha(mixHex(text, bg, 0.68), 0.12)}`,
    '--summary-card-gradient': `linear-gradient(145deg, ${summaryBase} 0%, ${accentDeep} 54%, ${primary} 100%)`,
    '--summary-card-orb': withAlpha(mixHex(primary, '#ffffff', isDark ? 0.18 : 0.62), isDark ? 0.2 : 0.24),
    '--summary-card-text': isDark ? '#f8fbff' : '#ffffff',
    '--summary-card-label': withAlpha(isDark ? '#f8fbff' : '#ffffff', 0.72),
    '--summary-card-button-bg': withAlpha(isDark ? '#ffffff' : '#f8fbff', isDark ? 0.1 : 0.14),
    '--summary-card-button-border': withAlpha(isDark ? '#ffffff' : '#f8fbff', isDark ? 0.18 : 0.22),
    '--summary-card-button-text': withAlpha(isDark ? '#f8fbff' : '#ffffff', 0.94),
    '--app-glass': withAlpha(surface, isDark ? 0.74 : 0.82),
    '--app-glass-strong': withAlpha(surface, isDark ? 0.86 : 0.92),
    '--app-glass-border': withAlpha(isDark ? mixHex(text, surface, 0.56) : mixHex(surface, '#ffffff', 0.4), isDark ? 0.16 : 0.44),
    '--app-overlay': withAlpha(text, isDark ? 0.34 : 0.18),
    '--app-accent-soft': accentSoft,
    '--app-frost-blur': popupBlur,
    '--app-frost-soft-blur': softBlur,
    '--app-overlay-blur': overlayBlur,
    '--app-frost-saturate': popupSaturate,
    '--app-overlay-saturate': overlaySaturate
  }
}

export { buildCustomThemeTokens }

function readLocal(key, fallback) {
  try {
    const value = localStorage.getItem(key)
    return value === null ? fallback : value
  } catch {
    return fallback
  }
}

async function readPersistedValue(key, fallback) {
  if (IS_NATIVE) {
    try {
      const { value } = await Preferences.get({ key })
      if (value !== null) return value
    } catch {
      // ignore and fall back to localStorage
    }
  }

  return readLocal(key, fallback)
}

async function writePersistedValue(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // ignore
  }

  if (!IS_NATIVE) return

  try {
    await Preferences.set({ key, value })
  } catch {
    // ignore
  }
}

export const useThemeStore = defineStore('theme', () => {
  const themeId = ref(THEME_IDS.mist)
  const appearancePreference = ref(APPEARANCE_PREFERENCES.system)
  const systemAppearance = ref('light')
  const initialized = ref(false)

  const customColors = ref(cloneDefaultCustomColors())
  const customEffects = ref(cloneDefaultCustomEffects())

  let mediaQueryList = null
  let removeSystemListener = null

  const themeDefinition = computed(() => getThemeDefinition(themeId.value))
  const resolvedAppearance = computed(() => (
    appearancePreference.value === APPEARANCE_PREFERENCES.system
      ? systemAppearance.value
      : appearancePreference.value
  ))
  const appliedAppearance = computed(() => (
    getThemeAppearance(themeDefinition.value, resolvedAppearance.value)
  ))
  const canCustomizeAppearance = computed(() => (
    themeSupportsAppearanceControl(themeDefinition.value)
  ))

  function applyTheme() {
    if (!canUseDom()) return

    const root = document.documentElement
    const body = document.body
    const appRoot = document.getElementById('app')
    const appearance = appliedAppearance.value

    const tokens = themeDefinition.value.id === 'custom'
      ? buildCustomThemeTokens(
        customColors.value[appearance] || customColors.value.light,
        appearance,
        customEffects.value[appearance] || customEffects.value.light
      )
      : { ...themeDefinition.value.appearances[appearance] }

    const bgColor = tokens['--app-bg']
    const bgGradient = tokens['--app-bg-gradient'] || bgColor

    root.classList.toggle('theme-dark', appearance === 'dark')
    root.classList.toggle('theme-light', appearance !== 'dark')
    root.dataset.themeId = themeDefinition.value.id
    root.dataset.themeAppearance = appearance
    root.style.colorScheme = appearance

    for (const [token, value] of Object.entries(tokens)) {
      root.style.setProperty(token, value)
    }

    // Force Android WebView to repaint the root layers with the current theme
    // so cold starts do not briefly show the host window background at the corners.
    root.style.backgroundColor = bgColor
    root.style.backgroundImage = 'none'

    if (body) {
      body.style.backgroundColor = bgColor
      body.style.backgroundImage = 'none'
    }

    if (appRoot) {
      appRoot.style.backgroundColor = bgColor
      appRoot.style.backgroundImage = bgGradient
    }
  }

  function handleSystemAppearanceChange(event) {
    systemAppearance.value = event.matches ? 'dark' : 'light'
    if (appearancePreference.value === APPEARANCE_PREFERENCES.system) {
      applyTheme()
    }
  }

  function bindSystemListener() {
    if (!canUseDom() || mediaQueryList) return

    mediaQueryList = window.matchMedia(SYSTEM_DARK_QUERY)
    systemAppearance.value = mediaQueryList.matches ? 'dark' : 'light'

    const listener = (event) => handleSystemAppearanceChange(event)
    if (typeof mediaQueryList.addEventListener === 'function') {
      mediaQueryList.addEventListener('change', listener)
      removeSystemListener = () => mediaQueryList?.removeEventListener('change', listener)
      return
    }

    mediaQueryList.addListener(listener)
    removeSystemListener = () => mediaQueryList?.removeListener(listener)
  }

  async function init() {
    if (initialized.value) return

    bindSystemListener()

    const [storedThemeId, storedAppearance, storedCustomColors, storedCustomEffects] = await Promise.all([
      readPersistedValue(STORAGE_KEY_THEME_ID, THEME_IDS.mist),
      readPersistedValue(STORAGE_KEY_APPEARANCE, APPEARANCE_PREFERENCES.system),
      readPersistedValue(STORAGE_KEY_CUSTOM_COLORS, null),
      readPersistedValue(STORAGE_KEY_CUSTOM_EFFECTS, null)
    ])

    if (storedCustomColors) {
      try {
        const parsed = JSON.parse(storedCustomColors)
        customColors.value = normalizeCustomColors(parsed)
      } catch {
        customColors.value = cloneDefaultCustomColors()
      }
    }

    if (storedCustomEffects) {
      try {
        const parsed = JSON.parse(storedCustomEffects)
        customEffects.value = normalizeCustomEffects(parsed)
      } catch {
        customEffects.value = cloneDefaultCustomEffects()
      }
    }

    themeId.value = getThemeDefinition(storedThemeId).id
    appearancePreference.value = Object.values(APPEARANCE_PREFERENCES).includes(storedAppearance)
      ? storedAppearance
      : APPEARANCE_PREFERENCES.system

    applyTheme()
    initialized.value = true
  }

  async function setTheme(nextThemeId) {
    themeId.value = getThemeDefinition(nextThemeId).id
    applyTheme()
    await writePersistedValue(STORAGE_KEY_THEME_ID, themeId.value)
  }

  async function setAppearancePreference(nextPreference) {
    appearancePreference.value = Object.values(APPEARANCE_PREFERENCES).includes(nextPreference)
      ? nextPreference
      : APPEARANCE_PREFERENCES.system

    applyTheme()
    await writePersistedValue(STORAGE_KEY_APPEARANCE, appearancePreference.value)
  }

  async function updateCustomColors(mode, colors) {
    if (!CUSTOM_THEME_MODES.includes(mode)) return

    const patch = sanitizeCustomColorPatch(colors)
    if (!Object.keys(patch).length) return

    customColors.value = {
      ...customColors.value,
      [mode]: {
        ...customColors.value[mode],
        ...patch
      }
    }

    if (themeId.value === 'custom') {
      applyTheme()
    }
    await writePersistedValue(STORAGE_KEY_CUSTOM_COLORS, JSON.stringify(customColors.value))
  }

  async function updateCustomEffects(mode, effects) {
    if (!CUSTOM_THEME_MODES.includes(mode)) return

    const patch = sanitizeCustomEffectPatch(effects)
    if (!Object.keys(patch).length) return

    customEffects.value = {
      ...customEffects.value,
      [mode]: {
        ...customEffects.value[mode],
        ...patch
      }
    }

    if (themeId.value === 'custom') {
      applyTheme()
    }

    await writePersistedValue(STORAGE_KEY_CUSTOM_EFFECTS, JSON.stringify(customEffects.value))
  }

  async function resetCustomColors(mode = null) {
    if (mode && !CUSTOM_THEME_MODES.includes(mode)) return

    if (mode) {
      customColors.value = {
        ...customColors.value,
        [mode]: { ...DEFAULT_CUSTOM_COLORS[mode] }
      }
      customEffects.value = {
        ...customEffects.value,
        [mode]: { ...DEFAULT_CUSTOM_EFFECTS[mode] }
      }
    } else {
      customColors.value = cloneDefaultCustomColors()
      customEffects.value = cloneDefaultCustomEffects()
    }

    if (themeId.value === 'custom') {
      applyTheme()
    }

    await writePersistedValue(STORAGE_KEY_CUSTOM_COLORS, JSON.stringify(customColors.value))
    await writePersistedValue(STORAGE_KEY_CUSTOM_EFFECTS, JSON.stringify(customEffects.value))
  }

  function teardown() {
    removeSystemListener?.()
    removeSystemListener = null
    mediaQueryList = null
  }

  return {
    themeId,
    appearancePreference,
    resolvedAppearance,
    appliedAppearance,
    canCustomizeAppearance,
    themeDefinition,
    customColors,
    customEffects,
    updateCustomColors,
    updateCustomEffects,
    resetCustomColors,
    initialized,
    init,
    applyTheme,
    setTheme,
    setAppearancePreference,
    teardown
  }
})
