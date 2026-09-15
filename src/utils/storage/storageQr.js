import { SHARE_LANDING_URL } from '@/config/share'

const STORAGE_QR_PREFIX = 'goodsapp://storage/'
const STORAGE_FILTER_STORAGE_KEY = 'goods-app:nfc-storage-filter'
const STORAGE_FILTER_EVENT = 'goods-app:nfc-storage-filter'

function normalizeStorageQrPath(storagePath) {
  const path = String(storagePath || '').trim().replace(/\/$/, '')
  return path
}

export function buildStorageDeepLink(storagePath) {
  const path = normalizeStorageQrPath(storagePath)
  if (!path) return ''
  return `${STORAGE_QR_PREFIX}${encodeURIComponent(path)}`
}

export function buildStorageQrUrl(storagePath) {
  const deepLink = buildStorageDeepLink(storagePath)
  if (!deepLink) return ''

  const params = new URLSearchParams({ storage: deepLink })
  return `${SHARE_LANDING_URL}?${params.toString()}`
}

export function parseStorageQrUrl(input) {
  const text = String(input || '').trim()
  if (!text) return ''

  if (text.startsWith(STORAGE_QR_PREFIX)) {
    try {
      const path = decodeURIComponent(text.slice(STORAGE_QR_PREFIX.length)).replace(/\/$/, '').trim()
      return path || ''
    } catch {
      return ''
    }
  }

  try {
    const url = new URL(text)
    const storageValue = url.searchParams.get('storage') || ''
    if (storageValue) return parseStorageQrUrl(storageValue)

    const storagePath = normalizeStorageQrPath(url.searchParams.get('storagePath') || '')
    return storagePath || ''
  } catch {
    return ''
  }
}

export function persistStorageQrFilter(storagePath) {
  const path = normalizeStorageQrPath(storagePath)
  if (!path) return false

  localStorage.setItem(STORAGE_FILTER_STORAGE_KEY, JSON.stringify({
    storageLocations: [path],
    timestamp: Date.now()
  }))
  window.dispatchEvent(new CustomEvent(STORAGE_FILTER_EVENT))
  return true
}

export { STORAGE_FILTER_STORAGE_KEY, STORAGE_FILTER_EVENT }
