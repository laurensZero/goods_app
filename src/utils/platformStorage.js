import { Preferences } from '@capacitor/preferences'
import { IS_NATIVE } from '@/utils/platform'

export async function readPersisted(key, fallback = null) {
  if (IS_NATIVE) {
    try {
      const { value } = await Preferences.get({ key })
      if (value !== null) return value
    } catch {}
  }
  try {
    const value = localStorage.getItem(key)
    return value !== null ? value : fallback
  } catch {
    return fallback
  }
}

export async function writePersisted(key, value) {
  try { localStorage.setItem(key, value) } catch {}
  if (!IS_NATIVE) return
  try { await Preferences.set({ key, value }) } catch {}
}

export async function removePersisted(key) {
  try { localStorage.removeItem(key) } catch {}
  if (!IS_NATIVE) return
  try { await Preferences.remove({ key }) } catch {}
}
