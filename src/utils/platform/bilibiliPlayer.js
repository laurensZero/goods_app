import { Capacitor, registerPlugin } from '@capacitor/core'

const BilibiliPlayer = registerPlugin('BilibiliPlayer')

export function isAndroidBilibiliPlayer() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

export async function playBilibiliNative({ url, title = '', artist = '' } = {}) {
  return BilibiliPlayer.play({ url: String(url || ''), title: String(title || ''), artist: String(artist || '') })
}

export function addBilibiliPlayerListener(eventName, listener) {
  return BilibiliPlayer.addListener(eventName, listener)
}

export const bilibiliPlayer = {
  pause: () => BilibiliPlayer.pause(),
  resume: () => BilibiliPlayer.resume(),
  stop: () => BilibiliPlayer.stop(),
  release: () => BilibiliPlayer.release(),
  seekTo: (positionMs) => BilibiliPlayer.seekTo({ positionMs }),
  setVolume: (volume) => BilibiliPlayer.setVolume({ volume })
}
