import { readPersisted, writePersisted, removePersisted } from '@/utils/platform/storage'
import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

const STORAGE_KEY = 'mihoyo_cookie_state'
const NATIVE_STORAGE_KEY = 'mihoyo_native_session'

function getDefaultState() {
  return {
    cookie: '',
    updatedAt: '',
    invalidAt: '',
    invalidReason: ''
  }
}

function normalizeState(raw) {
  if (!raw || typeof raw !== 'object') return getDefaultState()

  return {
    cookie: String(raw.cookie || '').trim(),
    updatedAt: String(raw.updatedAt || '').trim(),
    invalidAt: String(raw.invalidAt || '').trim(),
    invalidReason: String(raw.invalidReason || '').trim()
  }
}

function readLocalState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? normalizeState(JSON.parse(raw)) : getDefaultState()
  } catch {
    return getDefaultState()
  }
}

function writeLocalState(state) {
  try {
    const normalized = normalizeState(state)
    if (!normalized.cookie) {
      localStorage.removeItem(STORAGE_KEY)
      return
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  } catch {
    // ignore
  }
}

export async function loadMihoyoCookieState() {
  const value = await readPersisted(STORAGE_KEY)
  if (value) {
    try {
      return normalizeState(JSON.parse(value))
    } catch {
      // fall through
    }
  }

  // 安卓原生端可能把 Cookie 存在另一个 key
  if (Capacitor.isNativePlatform()) {
    try {
      const { value: nativeValue } = await Preferences.get({ key: NATIVE_STORAGE_KEY })
      if (nativeValue && nativeValue.trim()) {
        try {
          const parsed = JSON.parse(nativeValue)
          const cookie = String(parsed.cookie || '').trim()
          if (cookie) {
            return {
              cookie,
              updatedAt: String(parsed.updated_at || parsed.updatedAt || '').trim(),
              invalidAt: '',
              invalidReason: ''
            }
          }
        } catch {
          // 如果不是 JSON，直接作为 cookie 字符串
          return {
            cookie: nativeValue.trim(),
            updatedAt: '',
            invalidAt: '',
            invalidReason: ''
          }
        }
      }
    } catch {
      // fall through
    }
  }

  return readLocalState()
}

export async function saveMihoyoCookie(cookie) {
  const value = String(cookie || '').trim()
  if (!value) {
    await clearMihoyoCookieState()
    return getDefaultState()
  }

  const nextState = {
    cookie: value,
    updatedAt: new Date().toISOString(),
    invalidAt: '',
    invalidReason: ''
  }

  writeLocalState(nextState)
  await writePersisted(STORAGE_KEY, JSON.stringify(nextState))
  return nextState
}

export async function markMihoyoCookieInvalid(cookie, reason = '') {
  const value = String(cookie || '').trim()
  if (!value) {
    await clearMihoyoCookieState()
    return getDefaultState()
  }

  const current = await loadMihoyoCookieState()
  const nextState = {
    cookie: value,
    updatedAt: current.updatedAt || new Date().toISOString(),
    invalidAt: new Date().toISOString(),
    invalidReason: String(reason || '').trim()
  }

  writeLocalState(nextState)
  await writePersisted(STORAGE_KEY, JSON.stringify(nextState))
  return nextState
}

export async function clearMihoyoCookieState() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
  await removePersisted(STORAGE_KEY)
}
