import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { Clipboard } from '@capacitor/clipboard'
import { App as CapacitorApp } from '@capacitor/app'
import { extractIdsFromInput } from '@/utils/share/goods'

const LAST_PROCESSED_CLIPBOARD_KEY = 'last_processed_clipboard_hash'

const showPrompt = ref(false)
const incomingShareId = ref('')
const currentHash = ref('')

export function useClipboardImport() {
  const router = useRouter()
  let lastCheckTime = 0
  const CHECK_COOLDOWN_MS = 2000

  const checkClipboard = async () => {
    if (showPrompt.value) return
    const now = Date.now()
    if (now - lastCheckTime < CHECK_COOLDOWN_MS) return
    lastCheckTime = now
    try {
      const { value } = await Clipboard.read()
      if (!value) return

      const text = String(value).trim()

      if (!text.includes('来收谷子')) {
        return
      }

      const { shareId } = extractIdsFromInput(text)

      if (!shareId) return

      const lastProcessed = localStorage.getItem(LAST_PROCESSED_CLIPBOARD_KEY)
      if (lastProcessed === shareId) return

      incomingShareId.value = shareId
      currentHash.value = shareId
      showPrompt.value = true
    } catch (err) {
      console.warn('Clipboard check failed:', err)
    }
  }

  const confirmImport = () => {
    showPrompt.value = false
    localStorage.setItem(LAST_PROCESSED_CLIPBOARD_KEY, currentHash.value)
    router.push({
      name: 'share-import',
      params: { shareId: incomingShareId.value }
    })
  }

  const dismissImport = () => {
    showPrompt.value = false
    localStorage.setItem(LAST_PROCESSED_CLIPBOARD_KEY, currentHash.value)
  }

  let visibilityHandler = null
  let focusHandler = null
  let appStateListener = null

  const triggerCheckWithContext = () => {
    checkClipboard()
  }

  onMounted(async () => {
    triggerCheckWithContext()

    visibilityHandler = () => {
      if (document.visibilityState === 'visible') triggerCheckWithContext()
    }
    document.addEventListener('visibilitychange', visibilityHandler)

    focusHandler = () => {
      triggerCheckWithContext()
    }
    window.addEventListener('focus', focusHandler)

    try {
      appStateListener = await CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          setTimeout(checkClipboard, 300)
        }
      })
    } catch (e) {
      // Not in Capacitor environment or unsupported
    }
  })

  onUnmounted(() => {
    if (visibilityHandler) document.removeEventListener('visibilitychange', visibilityHandler)
    if (focusHandler) window.removeEventListener('focus', focusHandler)
    if (appStateListener) appStateListener.remove()
  })

  const triggerSharePrompt = (shareId) => {
    incomingShareId.value = shareId
    showPrompt.value = true
  }

  return { showPrompt, incomingShareId, confirmImport, dismissImport, triggerSharePrompt }
}
