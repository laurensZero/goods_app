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
const IS_NATIVE = Capacitor.isNativePlatform()
const SYSTEM_DARK_QUERY = '(prefers-color-scheme: dark)'

function canUseDom() {
  return typeof window !== 'undefined' && typeof document !== 'undefined'
}

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
    const tokens = themeDefinition.value.appearances[appearance]
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
    root.style.backgroundImage = bgGradient
    root.style.backgroundAttachment = 'fixed'

    if (body) {
      body.style.backgroundColor = bgColor
      body.style.backgroundImage = bgGradient
      body.style.backgroundAttachment = 'fixed'
    }

    if (appRoot) {
      appRoot.style.backgroundColor = bgColor
      appRoot.style.backgroundImage = bgGradient
      appRoot.style.backgroundAttachment = 'fixed'
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

    const [storedThemeId, storedAppearance] = await Promise.all([
      readPersistedValue(STORAGE_KEY_THEME_ID, THEME_IDS.mist),
      readPersistedValue(STORAGE_KEY_APPEARANCE, APPEARANCE_PREFERENCES.system)
    ])

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
    initialized,
    init,
    applyTheme,
    setTheme,
    setAppearancePreference,
    teardown
  }
})
