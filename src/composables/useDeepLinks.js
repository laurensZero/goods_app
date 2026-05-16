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

    const stateKey = 'homeSearchState:collection'
    const nextState = buildNfcSearchState(storagePath)

    await router.push({
      path: '/home',
      query: {
        mode: 'search',
        scope: 'collection',
        action: 'nfc',
        nfc: `${Date.now()}`
      },
      state: {
        [stateKey]: nextState
      }
    }).catch(() => {})

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

  function isOneShotNfcSearchRoute(currentRoute) {
    if (!currentRoute) return false
    if (String(currentRoute.path || '') !== '/home') return false
    return String(currentRoute.query?.action || '').toLowerCase() === 'nfc'
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

    // NFC 跳转是一次性动作：普通冷启动时不应重复停留在带 action=nfc 的搜索页。
    if (!handledStartupExternalUrl && isOneShotNfcSearchRoute(route)) {
      await router.replace('/home').catch(() => {})
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
