import { computed, ref } from 'vue'
import { isMihoyoCookieExpiredError, validateMihoyoCookie } from '@/utils/mihoyo'
import {
  clearMihoyoCookieState,
  loadMihoyoCookieState,
  markMihoyoCookieInvalid,
  saveMihoyoCookie
} from '@/utils/mihoyoCookie'

const COOKIE_EXPIRED_MESSAGE = '已保存的 Cookie 可能已失效，请重新输入并更新。'

export function useMihoyoCookieState() {
  const cookieInput = ref('')
  const rememberCookie = ref(false)
  const hasSavedCookie = ref(false)
  const cookieWarningMessage = ref('')
  const savedCookieValue = ref('')
  const savedCookieInvalid = ref(false)

  const cookieValid = computed(() => {
    const value = cookieInput.value.trim()
    return value.length > 20 && validateMihoyoCookie(value)
  })

  const canAutoSubmitSavedCookie = computed(() =>
    Boolean(savedCookieValue.value) && !savedCookieInvalid.value
  )

  async function initializeCookieState() {
    const state = await loadMihoyoCookieState()
    const savedCookie = String(state.cookie || '').trim()

    savedCookieValue.value = savedCookie
    hasSavedCookie.value = Boolean(savedCookie)
    rememberCookie.value = Boolean(savedCookie)
    savedCookieInvalid.value = Boolean(state.invalidAt)
    cookieInput.value = ''
    cookieWarningMessage.value = state.invalidAt ? COOKIE_EXPIRED_MESSAGE : ''
  }

  function applySavedCookieToInput() {
    cookieInput.value = savedCookieValue.value
  }

  async function persistCookieAfterSuccess() {
    const value = cookieInput.value.trim()

    if (!rememberCookie.value || !value) {
      await clearMihoyoCookieState()
      hasSavedCookie.value = false
      savedCookieValue.value = ''
      savedCookieInvalid.value = false
      cookieWarningMessage.value = ''
      return
    }

    await saveMihoyoCookie(value)
    hasSavedCookie.value = true
    savedCookieValue.value = value
    savedCookieInvalid.value = false
    cookieWarningMessage.value = ''
  }

  async function handleCookieFailure(error) {
    const value = cookieInput.value.trim() || savedCookieValue.value.trim()
    if (!rememberCookie.value || !value || !isMihoyoCookieExpiredError(error)) {
      return false
    }

    await markMihoyoCookieInvalid(value, error?.message || '')
    hasSavedCookie.value = true
    savedCookieValue.value = value
    savedCookieInvalid.value = true
    cookieInput.value = ''
    cookieWarningMessage.value = COOKIE_EXPIRED_MESSAGE
    return true
  }

  async function clearSavedCookie(resetInput = true) {
    await clearMihoyoCookieState()
    hasSavedCookie.value = false
    rememberCookie.value = false
    savedCookieValue.value = ''
    savedCookieInvalid.value = false
    cookieWarningMessage.value = ''

    if (resetInput) {
      cookieInput.value = ''
    }
  }

  return {
    cookieInput,
    rememberCookie,
    hasSavedCookie,
    cookieValid,
    cookieWarningMessage,
    canAutoSubmitSavedCookie,
    initializeCookieState,
    applySavedCookieToInput,
    persistCookieAfterSuccess,
    handleCookieFailure,
    clearSavedCookie
  }
}
