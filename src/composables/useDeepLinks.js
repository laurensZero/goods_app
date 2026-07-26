import { onMounted, onBeforeUnmount } from 'vue'
import { App as CapApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { isNavigationFailure, NavigationFailureType, useRouter } from 'vue-router'
import { useClipboardImport } from '@/composables/useClipboardImport'
import { parseStorageQrUrl, persistStorageQrFilter } from '@/utils/storageQr'
import { extractIdsFromInput } from '@/utils/share/goods'
import { appLog } from '@/utils/logger'

export function useDeepLinks({ onStorageNavigate } = {}) {
  const router = useRouter()
  const { triggerSharePrompt } = useClipboardImport()

  let removeAppUrlOpenListener = null
  let removeNativeNfcListener = null
  let lastHandledUrl = ''
  let lastHandledTime = 0

  async function handleIncomingAppUrl(url) {
    const now = Date.now()
    if (url === lastHandledUrl && now - lastHandledTime < 1000) return false
    lastHandledUrl = url
    lastHandledTime = now

    if (await navigateByStorageNfc(url)) {
      appLog('info', 'deep-link: storage-nfc handled')
      return true
    }
    if (await navigateByShareLink(url)) {
      appLog('info', 'deep-link: share-link handled')
      return true
    }
    appLog('warn', 'deep-link: unrecognized url', { url: String(url || '').slice(0, 120) })
    return false
  }

  async function navigateByStorageNfc(url) {
    const storagePath = parseStorageQrUrl(url)
    if (!storagePath) return false

    persistStorageQrFilter(storagePath)

    // 导航失败（已在 /home 的重复导航除外）时不触发"已跳转"通知
    let failure = null
    try {
      failure = await router.push('/home')
    } catch {
      return true
    }
    if (failure && !isNavigationFailure(failure, NavigationFailureType.duplicated)) return true

    if (onStorageNavigate) {
      onStorageNavigate(storagePath)
    }

    return true
  }

  async function navigateByShareLink(url) {
    const { shareId } = extractIdsFromInput(url)
    if (!shareId) return false

    triggerSharePrompt(shareId)

    return true
  }

  onMounted(async () => {
    if (!Capacitor.isNativePlatform()) return

    let startupExternalUrl = ''

    const nativeNfcListener = (event) => {
      void handleIncomingAppUrl(event?.detail?.url)
    }

    window.addEventListener('goodsappNfcOpen', nativeNfcListener)
    removeNativeNfcListener = () => window.removeEventListener('goodsappNfcOpen', nativeNfcListener)

    try {
      const launchUrl = await CapApp.getLaunchUrl()
      if (launchUrl && launchUrl.url) {
        const handled = await handleIncomingAppUrl(launchUrl.url)
        if (handled) {
          startupExternalUrl = launchUrl.url
          // retained appUrlOpen 在 addListener 注册时即送达，跳过标记只需短暂存活；
          // 超时清除，避免 webview 重载（OTA）后标记滞留吞掉用户对同一 URL 的下次真实触发
          setTimeout(() => { startupExternalUrl = '' }, 5000)
        }
      }
    } catch (e) {
      console.warn('[app] getLaunchUrl failed:', e)
    }

    try {
      removeAppUrlOpenListener = await CapApp.addListener('appUrlOpen', (event) => {
        // 冷启动的 launch URL 已处理过：跳过启动时重复触发的首个 appUrlOpen
        if (startupExternalUrl && event.url === startupExternalUrl) {
          startupExternalUrl = ''
          return
        }
        void handleIncomingAppUrl(event.url)
      })
    } catch (e) {
      console.warn('[app] addListener appUrlOpen failed:', e)
    }
  })

  onBeforeUnmount(() => {
    removeNativeNfcListener?.()
    removeNativeNfcListener = null
    removeAppUrlOpenListener?.remove?.()
    removeAppUrlOpenListener = null
  })
}
