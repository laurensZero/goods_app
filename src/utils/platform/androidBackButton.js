export const APP_BACK_BUTTON_EVENT = 'app-back-button'

export function dispatchAndroidBackButton(detail = {}) {
  return !window.dispatchEvent(new CustomEvent(APP_BACK_BUTTON_EVENT, {
    cancelable: true,
    detail
  }))
}

export function addAndroidBackButtonListener(handler) {
  window.addEventListener(APP_BACK_BUTTON_EVENT, handler)
  return () => window.removeEventListener(APP_BACK_BUTTON_EVENT, handler)
}
