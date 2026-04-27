import { onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { showConfirmDialog } from 'vant'
import { Clipboard } from '@capacitor/clipboard'
import { App as CapacitorApp } from '@capacitor/app'
import { extractIdsFromInput } from '@/utils/shareGoods'

const LAST_PROCESSED_CLIPBOARD_KEY = 'last_processed_clipboard_hash'

export function useClipboardImport() {
  const router = useRouter()

  // Generate a simple hash/identifier for the text to avoid storing huge strings in local storage
  const hashString = (str) => {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i)
      hash |= 0 // Convert to 32bit integer
    }
    return hash.toString()
  }

  const checkClipboard = async () => {
    try {
      const { value, type } = await Clipboard.read()
      if (!value || type !== 'text/plain') return

      const text = String(value).trim()
      const ids = extractIdsFromInput(text)
      
      // Stop if no valid share link found
      if (!ids.gistId) return

      const textHash = hashString(text)
      const lastProcessed = localStorage.getItem(LAST_PROCESSED_CLIPBOARD_KEY)

      // Only prompt if we haven't processed this exact clipboard text before
      if (lastProcessed === textHash) return

      // Pre-emptively register as processed to avoid concurrent dialogs
      localStorage.setItem(LAST_PROCESSED_CLIPBOARD_KEY, textHash)

      // Prompt user
      try {
        await showConfirmDialog({
          title: '发现分享链接',
          message: '检测到剪切板包含商品分享链接内容，是否立即前往导入？',
          confirmButtonText: '去导入',
          cancelButtonText: '忽略'
        })

        // On confirm, navigate
        router.push({ 
          name: 'share-import', 
          params: { gistId: ids.gistId }, 
          query: ids.shareId ? { s: ids.shareId } : {} 
        })
      } catch (e) {
        // User cancelled, do nothing (already marked as processed)
      }
    } catch (err) {
      console.warn('Clipboard check failed:', err)
    }
  }

  let visibilityHandler = null
  let appStateListener = null

  onMounted(async () => {
    // Initial check when app loads
    checkClipboard()

    // 1. Web fallback (visibility change / focus back)
    visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        checkClipboard()
      }
    }
    document.addEventListener('visibilitychange', visibilityHandler)

    // 2. Capacitor native App state change (onResume)
    try {
      appStateListener = await CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          checkClipboard()
        }
      })
    } catch (e) {
      // Not in Capacitor environment or unsupported
      console.warn('Capacitor App listener not attached', e)
    }
  })

  onUnmounted(() => {
    if (visibilityHandler) {
      document.removeEventListener('visibilitychange', visibilityHandler)
    }
    if (appStateListener) {
      appStateListener.remove()
    }
  })
}
