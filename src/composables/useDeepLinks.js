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
    const { gistId, shareId } = extractIdsFromInput(url)
    if (!gistId || !/^[a-zA-Z0-9]+$/.test(gistId)) return false

    triggerSharePrompt(gistId, shareId)

    return true
  }

  async function handleIncomingAppUrl(url) {
    if (await navigateByStorageNfc(url)) return true
    if (await navigateByShareLink(url)) return true
    return false
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
