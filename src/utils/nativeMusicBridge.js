import { Capacitor, registerPlugin } from '@capacitor/core'

const NativeMusicBridge = registerPlugin('NativeMusicBridge')

function isAndroidNative() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
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
