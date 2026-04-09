import { Capacitor, registerPlugin } from '@capacitor/core'

const NativeMusicBridge = registerPlugin('NativeMusicBridge')

function isAndroidNative() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

export async function requestNativeNotificationPermission() {
  if (!isAndroidNative()) return false

  try {
    const result = await NativeMusicBridge.requestNotificationPermission()
    return !!result?.granted
  } catch {
    return false
  }
}

export async function updateNativePlaybackNotification(payload = {}) {
  if (!isAndroidNative()) return false

  try {
    const result = await NativeMusicBridge.updatePlaybackNotification(payload)
    return !!result?.shown
  } catch {
    return false
  }
}

export async function clearNativePlaybackNotification() {
  if (!isAndroidNative()) return

  try {
    await NativeMusicBridge.clearPlaybackNotification()
  } catch {
    // ignore native bridge failures
  }
}

export async function openNeteaseSongNative(songId) {
  if (!isAndroidNative()) return false

  try {
    const result = await NativeMusicBridge.openNeteaseSong({ songId: String(songId || '').trim() })
    return !!result?.opened
  } catch {
    return false
  }
}

export async function addNativeMediaActionListener(listener) {
  if (!isAndroidNative() || typeof listener !== 'function') {
    return { remove: async () => {} }
  }

  try {
    return await NativeMusicBridge.addListener('mediaAction', listener)
  } catch {
    return { remove: async () => {} }
  }
}
