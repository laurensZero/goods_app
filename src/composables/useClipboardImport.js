import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { Clipboard } from '@capacitor/clipboard'
import { App as CapacitorApp } from '@capacitor/app'
import { extractIdsFromInput } from '@/utils/share/goods'

const LAST_PROCESSED_CLIPBOARD_KEY = 'last_processed_clipboard_hash'
const PROCESSED_CLIPBOARD_KEY = 'processed_clipboard_share_ids'
// 已处理 shareId 集合上限，避免 localStorage 无限增长
const MAX_PROCESSED_IDS = 20

const showPrompt = ref(false)
const incomingShareId = ref('')
const currentHash = ref('')

// 冷却状态必须是模块级：useClipboardImport 被 App.vue 与 ClipboardDialog 各实例化一次，
// 若冷却留在实例闭包内，同一时机会触发两次 Clipboard.read()（Android 12+ 每次都弹系统提示）
let lastCheckTime = 0
const CHECK_COOLDOWN_MS = 2000

// 读取已处理 shareId 列表（兼容旧版单条记录）
function readProcessedIds() {
  try {
    const raw = localStorage.getItem(PROCESSED_CLIPBOARD_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    }
    const legacy = localStorage.getItem(LAST_PROCESSED_CLIPBOARD_KEY)
    return legacy ? [legacy] : []
  } catch (e) {
    return []
  }
}

function markProcessedId(id) {
  if (!id) return
  const ids = readProcessedIds().filter((x) => x !== id)
  ids.push(id)
  while (ids.length > MAX_PROCESSED_IDS) ids.shift()
  try {
    localStorage.setItem(PROCESSED_CLIPBOARD_KEY, JSON.stringify(ids))
  } catch (e) {
    // ignore
  }
}

export function useClipboardImport() {
  const router = useRouter()

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

      if (readProcessedIds().includes(shareId)) return

      incomingShareId.value = shareId
      currentHash.value = shareId
      showPrompt.value = true
    } catch (err) {
      console.warn('Clipboard check failed:', err)
    }
  }

  const confirmImport = () => {
    showPrompt.value = false
    markProcessedId(currentHash.value)
    router.push({
      name: 'share-import',
      params: { shareId: incomingShareId.value }
    })
  }

  const dismissImport = () => {
    showPrompt.value = false
    markProcessedId(currentHash.value)
  }

  let appStateListener = null

  // 剪贴板读取会触发 Android 12+ 系统提示，仅在冷启动与恢复前台时各检查一次
  onMounted(async () => {
    checkClipboard()

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
    if (appStateListener) appStateListener.remove()
  })

  const triggerSharePrompt = (shareId) => {
    incomingShareId.value = shareId
    showPrompt.value = true
  }

  return { showPrompt, incomingShareId, confirmImport, dismissImport, triggerSharePrompt }
}
