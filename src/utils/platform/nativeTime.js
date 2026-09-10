import { Capacitor, registerPlugin } from '@capacitor/core'

const NativeTime = registerPlugin('NativeTime')

function isAndroidNative() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

/**
 * Android 原生 UDP SNTP 授时。
 * @returns {Promise<{offsetMs: number, delayMs: number, serverTime: number, localMidpointMs: number, source: string}>}
 * offsetMs 约定：serverTime − localMidpoint，与 edge 授时一致。
 */
export async function queryNativeNtp(options = {}) {
  if (!isAndroidNative()) {
    throw new Error('native NTP only available on Android')
  }
  const result = await NativeTime.query({
    servers: Array.isArray(options.servers) ? options.servers : undefined,
    attemptsPerServer: Number(options.attemptsPerServer) || 1,
    timeoutMs: Number(options.timeoutMs) || 2000,
    primaryDelayThresholdMs: Number(options.primaryDelayThresholdMs) || 120,
  })
  const offsetMs = Number(result?.offsetMs)
  const serverTime = Number(result?.serverTime)
  const localMidpointMs = Number(result?.localMidpointMs)
  if (!Number.isFinite(offsetMs) || !Number.isFinite(serverTime)) {
    throw new Error('invalid native NTP result')
  }
  return {
    offsetMs,
    delayMs: Number(result?.delayMs) || 0,
    serverTime,
    localMidpointMs: Number.isFinite(localMidpointMs) ? localMidpointMs : Date.now(),
    source: String(result?.source || 'native-ntp'),
  }
}

export function isNativeNtpAvailable() {
  return isAndroidNative()
}
