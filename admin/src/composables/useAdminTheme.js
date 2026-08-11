import { ref, watch } from 'vue'

const STORAGE_KEY = 'goods_admin_theme_preference'

const SYSTEM_DARK_QUERY = '(prefers-color-scheme: dark)'

/** 读取用户偏好：dark / light / system（默认跟随系统） */
function readStoredPreference() {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function resolveAppearance(preference) {
  if (preference === 'dark' || preference === 'light') return preference
  if (typeof window !== 'undefined' && window.matchMedia?.(SYSTEM_DARK_QUERY)?.matches) return 'dark'
  return 'light'
}

/** 立即把当前外观同步到 <html> 上（幂等） */
function applyAppearanceToDocument(appearance) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.classList.toggle('theme-dark', appearance === 'dark')
  root.style.colorScheme = appearance
}

export function useAdminTheme() {
  const preference = ref(readStoredPreference() || 'system')
  const appearance = ref(resolveAppearance(preference.value))

  applyAppearanceToDocument(appearance.value)

  let mediaQueryList = null
  let removeSystemListener = null

  function applySystemSync() {
    const next = window.matchMedia(SYSTEM_DARK_QUERY).matches ? 'dark' : 'light'
    appearance.value = next
    applyAppearanceToDocument(next)
  }

  function bindSystemListener() {
    if (typeof window === 'undefined' || mediaQueryList) return
    mediaQueryList = window.matchMedia(SYSTEM_DARK_QUERY)
    const listener = () => {
      if (preference.value === 'system') {
        applySystemSync()
      }
    }
    if (typeof mediaQueryList.addEventListener === 'function') {
      mediaQueryList.addEventListener('change', listener)
      removeSystemListener = () => mediaQueryList?.removeEventListener('change', listener)
    } else {
      mediaQueryList.addListener(listener)
      removeSystemListener = () => mediaQueryList?.removeListener(listener)
    }
  }

  function setPreference(nextPreference) {
    const normalized = nextPreference === 'dark' || nextPreference === 'light'
      ? nextPreference
      : 'system'
    preference.value = normalized
    try {
      if (normalized === 'system') {
        localStorage.removeItem(STORAGE_KEY)
      } else {
        localStorage.setItem(STORAGE_KEY, normalized)
      }
    } catch {
      // ignore
    }
    appearance.value = resolveAppearance(normalized)
    applyAppearanceToDocument(appearance.value)
  }

  function toggleDark() {
    // 手动切换后固定为显式偏好
    setPreference(appearance.value === 'dark' ? 'light' : 'dark')
  }

  watch(preference, () => { /* keep for potential future use */ })

  bindSystemListener()

  return {
    preference,
    appearance,
    setPreference,
    toggleDark
  }
}