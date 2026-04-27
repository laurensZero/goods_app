import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { Clipboard } from '@capacitor/clipboard'
import { App as CapacitorApp } from '@capacitor/app'
import { extractIdsFromInput } from '@/utils/shareGoods'

const LAST_PROCESSED_CLIPBOARD_KEY = 'last_processed_clipboard_hash'

export function useClipboardImport() {
  const router = useRouter()
  
  const showPrompt = ref(false)
  const incomingGistId = ref('')
  const incomingShareId = ref('')
  const currentHash = ref('')

  const checkClipboard = async () => {
    if (showPrompt.value) return // 正在提示时不再重复检测
    try {
      const { value } = await Clipboard.read()
      if (!value) return

      const text = String(value).trim()

      // 精确匹配以特定文字开头的内容，避免在平时复制普通 Github 链接或哈希串时被误弹窗骚扰
      // 使用正则包容全角半角感叹号以及前序潜在字符
      if (!text.includes('来收谷子')) {
        return
      }

      const ids = extractIdsFromInput(text)
      
      // Stop if no valid share link found
      if (!ids.gistId) return

      // Use the uniquely extracted gistId+shareId as the consistent deduplication hash.
      // This strictly prevents inconsistencies from whitespace/newline encoding issues 
      // in user's original clipboard string across different contexts tracking.
      const textHash = `${ids.gistId}-${ids.shareId}`
      const lastProcessed = localStorage.getItem(LAST_PROCESSED_CLIPBOARD_KEY)

      // Only prompt if we haven't processed this exact share target before
      if (lastProcessed === textHash) return

      // Show custom prompt dialog UI
      incomingGistId.value = ids.gistId
      incomingShareId.value = ids.shareId
      currentHash.value = textHash
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
      params: { gistId: incomingGistId.value }, 
      query: incomingShareId.value ? { s: incomingShareId.value } : {} 
    })
  }

  const dismissImport = () => {
    showPrompt.value = false
    localStorage.setItem(LAST_PROCESSED_CLIPBOARD_KEY, currentHash.value)
  }

  let visibilityHandler = null
  let focusHandler = null
  let appStateListener = null

  // Ensure polling exactly aligns with DOM event firing in Web Environments to keep 
  // 'User-Activation/Gesture' intact, avoiding 'Document is not focused' NotAllowedError on web Fallback.
  const triggerCheckWithContext = () => {
    checkClipboard()
  }

  onMounted(async () => {
    // Initial check when app loads
    triggerCheckWithContext()

    // 1. Web fallback: visibility change tracking
    visibilityHandler = () => {
      if (document.visibilityState === 'visible') triggerCheckWithContext()
    }
    document.addEventListener('visibilitychange', visibilityHandler)

    // Window focus tracking (for PC / Web desktop switching app)
    focusHandler = () => {
      triggerCheckWithContext()
    }
    window.addEventListener('focus', focusHandler)

    // 2. Capacitor native App state change (onResume)
    try {
      appStateListener = await CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        // Native android/ios may need slight offset, but checking right away is usually fine
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

  return { showPrompt, incomingGistId, incomingShareId, confirmImport, dismissImport }
}
