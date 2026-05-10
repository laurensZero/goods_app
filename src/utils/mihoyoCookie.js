import { readPersisted, writePersisted, removePersisted } from '@/utils/platformStorage'

const STORAGE_KEY = 'mihoyo_cookie_state'

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
