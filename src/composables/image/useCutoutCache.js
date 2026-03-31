const DB_NAME = 'goods-app-cutout-cache'
const STORE_NAME = 'cutout-results'
const DB_VERSION = 1
const MAX_CACHE_SIZE = 50

let dbPromise = null

function getDb() {
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = event.target.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'hash' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

  return dbPromise
}

async function computeHash(blob) {
  const buffer = await blob.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function base64ToBlob(base64, type = 'image/png') {
  const byteString = atob(base64.split(',')[1])
  const ab = new ArrayBuffer(byteString.length)
  const ia = new Uint8Array(ab)
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i)
  }
  return new Blob([ab], { type })
}

async function getFromCache(hash) {
  try {
    const db = await getDb()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const request = store.get(hash)
      request.onsuccess = () => {
        const result = request.result
        if (!result) {
          resolve(null)
          return
        }
        resolve({
          preparedBlob: base64ToBlob(result.preparedBase64),
          maskBlob: base64ToBlob(result.maskBase64),
          meta: result.meta
        })
      }
      request.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

async function saveToCache(hash, preparedBlob, maskBlob, meta) {
  try {
    const db = await getDb()
    const [preparedBase64, maskBase64] = await Promise.all([
      blobToBase64(preparedBlob),
      blobToBase64(maskBlob)
    ])

    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)

    await new Promise((resolve, reject) => {
      const countRequest = store.count()
      countRequest.onsuccess = () => {
        if (countRequest.result >= MAX_CACHE_SIZE) {
          const cursorRequest = store.openCursor()
          cursorRequest.onsuccess = (event) => {
            const cursor = event.target.result
            if (cursor) {
              cursor.delete()
              cursor.continue()
            }
          }
        }
      }

      store.put({
        hash,
        preparedBase64,
        maskBase64,
        meta,
        timestamp: Date.now()
      })

      tx.oncomplete = resolve
      tx.onerror = reject
    })
  } catch {
    // cache write failed silently
  }
}

export function useCutoutCache() {
  async function getCachedCutout(inputBlob) {
    if (!inputBlob) return null
    const hash = await computeHash(inputBlob)
    return getFromCache(hash)
  }

  async function cacheCutoutResult(inputBlob, preparedBlob, maskBlob, meta) {
    if (!inputBlob || !preparedBlob || !maskBlob) return
    const hash = await computeHash(inputBlob)
    await saveToCache(hash, preparedBlob, maskBlob, meta)
  }

  return {
    getCachedCutout,
    cacheCutoutResult
  }
}
