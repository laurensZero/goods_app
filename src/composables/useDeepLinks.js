import { onMounted, onBeforeUnmount } from 'vue'
import { App as CapApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { useRouter } from 'vue-router'
import { useClipboardImport } from '@/composables/useClipboardImport'
import { parseStorageQrUrl, persistStorageQrFilter } from '@/utils/storageQr'
import { extractIdsFromInput } from '@/utils/share/goods'

export function useDeepLinks({ onStorageNavigate } = {}) {
  const router = useRouter()
  const { triggerSharePrompt } = useClipboardImport()

  let removeAppUrlOpenListener = null
  let removeNativeNfcListener = null
  let lastHandledUrl = ''
  let lastHandledTime = 0

  async function handleIncomingAppUrl(url) {
    const now = Date.now()
    if (url === lastHandledUrl && now - lastHandledTime < 3000) return false
    lastHandledUrl = url
    lastHandledTime = now

    if (await navigateByStorageNfc(url)) return true
    if (await navigateByShareLink(url)) return true
    return false
  }

  async function navigateByStorageNfc(url) {
    const storagePath = parseStorageQrUrl(url)
    if (!storagePath) return false

    persistStorageQrFilter(storagePath)
    await router.push('/home').catch(() => {})

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

    let handledStartupExternalUrl = false

    const nativeNfcListener = (event) => {
      void handleIncomingAppUrl(event?.detail?.url)
    }

    window.addEventListener('goodsappNfcOpen', nativeNfcListener)
    removeNativeNfcListener = () => window.removeEventListener('goodsappNfcOpen', nativeNfcListener)

    try {
      const launchUrl = await CapApp.getLaunchUrl()
      if (launchUrl && launchUrl.url) {
        handledStartupExternalUrl = await handleIncomingAppUrl(launchUrl.url)
      }
    } catch (e) {
      console.warn('[app] getLaunchUrl failed:', e)
    }

    try {
      removeAppUrlOpenListener = await CapApp.addListener('appUrlOpen', (event) => {
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
