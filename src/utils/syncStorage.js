import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

const IS_NATIVE = Capacitor.isNativePlatform()

export async function readSyncKey(key) {
  if (IS_NATIVE) {
    try {
      const { value } = await Preferences.get({ key })
      if (value !== null) return value
    } catch {
      // fall through
    }
  }

  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export async function writeSyncKey(key, value) {
  try {
    localStorage.setItem(key, value ?? '')
  } catch {
    // ignore
  }

  if (!IS_NATIVE) return

  try {
    await Preferences.set({ key, value: value ?? '' })
  } catch {
    // ignore
  }
}

export async function readOrCreateDeviceId(key, generateDeviceId) {
  if (IS_NATIVE) {
    try {
      const { value } = await Preferences.get({ key })
      if (value) return value
    } catch {
      // fall through
    }
  }

  let id = ''
  try {
    id = localStorage.getItem(key) || ''
  } catch {
    id = ''
  }

  if (id) return id

  id = generateDeviceId()

  try {
    localStorage.setItem(key, id)
  } catch {
    // ignore
  }

  if (IS_NATIVE) {
    try {
      await Preferences.set({ key, value: id })
    } catch {
      // ignore
    }
  }

  return id
}
