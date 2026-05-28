import { ref } from 'vue'

export function useToast() {
  const toastMsg = ref('')
  let toastTimer = null
  let lastToastText = ''
  let lastToastAt = 0

  function showToast(message, duration = 2600) {
    const nextMessage = String(message || '').trim()
    if (!nextMessage) return
    const now = Date.now()
    if (nextMessage === lastToastText && now - lastToastAt < 1200) return
    lastToastText = nextMessage
    lastToastAt = now
    toastMsg.value = nextMessage
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => { toastMsg.value = '' }, duration)
  }

  return {
    toastMsg,
    showToast
  }
}
