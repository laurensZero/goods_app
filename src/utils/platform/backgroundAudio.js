import { Capacitor, registerPlugin } from '@capacitor/core'

const BackgroundAudio = registerPlugin('BackgroundAudio')

function isAndroid() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

export async function startBackgroundAudio(meta = {}) {
  if (!isAndroid()) return
  try {
    await BackgroundAudio.start({
      title: String(meta.title || ''),
      artist: String(meta.artist || ''),
      coverUrl: String(meta.coverUrl || ''),
      isPlaying: Boolean(meta.isPlaying),
      durationMs: Math.max(0, Math.round(Number(meta.durationMs) || 0)),
      positionMs: Math.max(0, Math.round(Number(meta.positionMs) || 0))
    })
  } catch (error) {
    console.warn('[backgroundAudio] 启动前台服务失败:', error?.message)
  }
}

export async function updateBackgroundAudio(meta = {}) {
  if (!isAndroid()) return
  try {
    await BackgroundAudio.update({
      title: String(meta.title || ''),
      artist: String(meta.artist || ''),
      coverUrl: String(meta.coverUrl || ''),
      isPlaying: Boolean(meta.isPlaying),
      durationMs: Math.max(0, Math.round(Number(meta.durationMs) || 0)),
      positionMs: Math.max(0, Math.round(Number(meta.positionMs) || 0))
    })
  } catch (error) {
    console.warn('[backgroundAudio] 更新媒体通知失败:', error?.message)
  }
}

export async function stopBackgroundAudio() {
  if (!isAndroid()) return
  try {
    await BackgroundAudio.stop()
  } catch (error) {
    console.warn('[backgroundAudio] 停止前台服务失败:', error?.message)
  }
}

export function addBackgroundAudioActionListener(listener) {
  if (!isAndroid()) {
    return () => {}
  }
  try {
    return BackgroundAudio.addListener('action', listener)
  } catch (error) {
    console.warn('[backgroundAudio] 注册媒体按钮监听失败:', error?.message)
    return () => {}
  }
}
