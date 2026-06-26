// src/services/supabaseAdapter/storage.js
// Supabase Storage operations: image upload/download, bucket management

import { EVENT_PHOTO_PREFIX } from '@/constants/syncConstants'
import i18n from '@/locales'

export const GOODS_IMAGE_BUCKET = 'goods-images'
export const EVENT_PHOTO_BUCKET = 'event-photos'

function isBucketNotFoundError(error) {
  const message = String(error?.message || '').toLowerCase()
  return message.includes('not found') || message.includes('does not exist') || message.includes('no such bucket')
}

function isBucketAlreadyExistsError(error) {
  const message = String(error?.message || '').toLowerCase()
  return message.includes('already exists') || message.includes('duplicate')
}

function isBucketCreatePermissionError(error) {
  const code = String(error?.code || '').toUpperCase()
  const message = String(error?.message || '').toLowerCase()
  return code === '42501' || message.includes('row-level security') || message.includes('permission denied') || message.includes('not allowed')
}

export function normalizeBucketName(bucketLike) {
  if (typeof bucketLike === 'string' && bucketLike.trim()) return bucketLike.trim()
  if (bucketLike && typeof bucketLike === 'object') {
    const candidate = bucketLike.id || bucketLike.bucket || bucketLike.bucketName || bucketLike.name || bucketLike.imageBucket || bucketLike.imageGistId
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }
  return GOODS_IMAGE_BUCKET
}

export function resolveStorageBucketByPath(filePath, fallbackBucket = GOODS_IMAGE_BUCKET) {
  const normalizedPath = String(filePath || '').trim()
  if (normalizedPath.startsWith(EVENT_PHOTO_PREFIX)) return EVENT_PHOTO_BUCKET
  return fallbackBucket || GOODS_IMAGE_BUCKET
}

// Strip .txt suffix from Gist-style filenames for Supabase Storage (stores binary, not base64 text)
export function toStoragePath(filePath) {
  return filePath.endsWith('.txt') ? filePath.slice(0, -4) : filePath
}

async function ensureStorageBucket(db, bucketName) {
  const { data, error } = await db.storage.getBucket(bucketName)
  if (data) return { id: bucketName }

  if (error && !isBucketNotFoundError(error)) {
    throw new Error(i18n.global.t('sync.error.supabaseReadBucketFailed', { error: error.message }))
  }

  const { error: createError } = await db.storage.createBucket(bucketName, { public: true })
  if (createError && !isBucketAlreadyExistsError(createError)) {
    if (isBucketCreatePermissionError(createError)) {
      console.warn('[supabase] createBucket permission denied, skip auto-create:', createError.message)
      return { id: bucketName }
    }
    throw new Error(i18n.global.t('sync.error.supabaseCreateBucketFailed', { error: createError.message }))
  }
  return { id: bucketName }
}

async function listStorageBucketFiles(db, bucketName) {
  const { data, error } = await db.storage.from(bucketName).list('', { limit: 10000 })
  if (error || !data) return []
  return data
    .map((file) => String(file?.name || '').trim())
    .filter((name) => !!name && name !== '.emptyFolderPlaceholder')
}

export function createStorageOps({ getDb, withRetry }) {
  // Cache image file listing to avoid expensive Storage API calls on every sync.
  const IMAGE_GIST_CACHE_TTL = 30_000
  let imageGistCache = null
  let imageGistCacheTime = 0

  function invalidateImageGistCache() {
    imageGistCache = null
    imageGistCacheTime = 0
  }

  async function getExistingImageGist() {
    const now = Date.now()
    if (imageGistCache && (now - imageGistCacheTime) < IMAGE_GIST_CACHE_TTL) {
      return imageGistCache
    }

    const db = getDb()
    const files = {}

    const [goodsFiles, eventPhotoFiles] = await Promise.all([
      listStorageBucketFiles(db, GOODS_IMAGE_BUCKET),
      listStorageBucketFiles(db, EVENT_PHOTO_BUCKET)
    ])

    for (const fileName of [...goodsFiles, ...eventPhotoFiles]) {
      files[fileName] = { name: fileName }
      files[fileName + '.txt'] = { name: fileName }
    }
    const result = { id: GOODS_IMAGE_BUCKET, files }
    imageGistCache = result
    imageGistCacheTime = now
    return result
  }

  async function readImage(bucket, filePath) {
    const db = getDb()
    const storagePath = toStoragePath(filePath)
    const fallbackBucket = normalizeBucketName(bucket)
    const bucketName = resolveStorageBucketByPath(storagePath, fallbackBucket)
    const { data, error } = await withRetry(() =>
      db.storage.from(bucketName).download(storagePath)
    )
    if (error || !data) return null
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(data)
    })
  }

  async function writeImages(_, imageFiles) {
    if (!imageFiles || Object.keys(imageFiles).length === 0) return
    const db = getDb()

    const entries = Object.entries(imageFiles)
    let uploaded = 0
    let failed = 0

    const CONCURRENT_UPLOADS = 5
    let index = 0
    async function uploadWorker() {
      while (index < entries.length) {
        const i = index++
        const [filePath, fileObj] = entries[i]
        const storagePath = toStoragePath(filePath)
        const bucketName = resolveStorageBucketByPath(storagePath)
        try {
          if (!fileObj || !fileObj.content) {
            await db.storage.from(bucketName).remove([storagePath])
            continue
          }

          const response = await fetch(fileObj.content)
          const blob = await response.blob()
          const { error } = await db.storage.from(bucketName).upload(storagePath, blob, {
            upsert: true,
            contentType: blob.type || 'image/jpeg'
          })
          if (error) {
            console.warn(`[supabase] upload failed for ${storagePath}:`, error.message)
            failed++
          } else {
            uploaded++
          }
        } catch (e) {
          console.warn(`[supabase] upload error for ${storagePath}:`, e.message)
          failed++
        }
      }
    }

    const workers = Array.from(
      { length: Math.min(CONCURRENT_UPLOADS, entries.length) },
      () => uploadWorker()
    )
    await Promise.all(workers)

    invalidateImageGistCache()
    return { uploaded, failed }
  }

  async function ensureStorageBuckets() {
    const db = getDb()
    await ensureStorageBucket(db, GOODS_IMAGE_BUCKET)
    await ensureStorageBucket(db, EVENT_PHOTO_BUCKET)
    return { id: GOODS_IMAGE_BUCKET }
  }

  function getImagePublicUrl(filePath) {
    const db = getDb()
    const storagePath = toStoragePath(filePath)
    const bucketName = resolveStorageBucketByPath(storagePath)
    const { data } = db.storage.from(bucketName).getPublicUrl(storagePath)
    return data?.publicUrl || ''
  }

  return {
    getExistingImageGist,
    readImage,
    writeImages,
    ensureStorageBuckets,
    getImagePublicUrl,
    invalidateImageGistCache
  }
}
