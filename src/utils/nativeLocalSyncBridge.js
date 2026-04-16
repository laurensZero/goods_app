import { Capacitor, registerPlugin } from '@capacitor/core'

const LocalSyncBridge = registerPlugin('LocalSyncBridge')

function isAndroidNative() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

export async function startNativeLocalSyncReceiver(options = {}) {
  if (!isAndroidNative()) return null

  try {
    return await LocalSyncBridge.startReceiver({
      port: Number(options.port) || 51823
    })
  } catch {
    return null
  }
}

export async function stopNativeLocalSyncReceiver() {
  if (!isAndroidNative()) return false

  try {
    await LocalSyncBridge.stopReceiver()
    return true
  } catch {
    return false
  }
}

export async function getNativeLocalSyncStatus() {
  if (!isAndroidNative()) return null

  try {
    return await LocalSyncBridge.getStatus()
  } catch {
    return null
  }
}

export async function discoverNativeLocalSyncPeers(timeoutMs = 4500) {
  if (!isAndroidNative()) return []

  try {
    const result = await LocalSyncBridge.discoverPeers({
      timeoutMs: Number(timeoutMs) || 4500
    })
    return Array.isArray(result?.peers) ? result.peers : []
  } catch {
    return []
  }
}
