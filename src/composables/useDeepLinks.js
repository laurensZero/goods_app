import { onMounted, onBeforeUnmount } from 'vue'
import { App as CapApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { useRoute, useRouter } from 'vue-router'
import { useClipboardImport } from '@/composables/useClipboardImport'

export function useDeepLinks() {
  const route = useRoute()
  const router = useRouter()
  const { triggerSharePrompt } = useClipboardImport()

  let removeAppUrlOpenListener = null
  let removeNativeNfcListener = null

  function buildNfcSearchState(storagePath) {
    return {
      filters: { storageLocations: [storagePath] },
      advancedExpanded: false
    }
  }

  async function navigateByStorageNfc(url) {
    if (!url || !url.startsWith('goodsapp://storage/')) return false

    let storagePath = decodeURIComponent(url.replace('goodsapp://storage/', ''))
    storagePath = storagePath.replace(/\/$/, '')

    // Store NFC filter for HomeView to pick up
    localStorage.setItem('goods-app:nfc-storage-filter', JSON.stringify({
      storageLocations: [storagePath],
      timestamp: Date.now()
    }))

    window.dispatchEvent(new CustomEvent('goods-app:nfc-storage-filter'))

    await router.push('/home').catch(() => {})

    return true
  }

  async function navigateByShareLink(url) {
    if (!url || !url.startsWith('goodsapp://share/')) return false

    const match = url.match(/goodsapp:\/\/share\/([a-zA-Z0-9]+)(?:\?(.*))?/)
    if (!match) return false

    const gistId = match[1]
    if (!gistId || !/^[a-zA-Z0-9]+$/.test(gistId)) return false

    const queryString = match[2] || ''
    const shareId = queryString ? new URLSearchParams(queryString).get('s') || '' : ''

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
