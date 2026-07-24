// src/utils/feedbackDevice.js
// Persistent device ID for feedback association

const STORAGE_KEY = 'goods_feedback_device_id'

/**
 * Get or create a persistent device ID for feedback tracking.
 * Stored in localStorage, survives app restarts.
 * @returns {string} UUID v4
 */
export function getDeviceId() {
  let id = localStorage.getItem(STORAGE_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(STORAGE_KEY, id)
  }
  return id
}
