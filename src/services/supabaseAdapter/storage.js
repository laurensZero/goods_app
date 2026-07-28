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

// 将 dataURL 直接转为 Blob，避免 fetch(dataUrl) 的额外网络栈开销
function dataUrlToBlob(dataUrl) {
  const commaIndex = dataUrl.indexOf(',')
  const meta = dataUrl.slice(0, commaIndex)
  const base64 = dataUrl.slice(commaIndex + 1)
  const mimeMatch = meta.match(/data:([^;]+)/)
  const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream'
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

export function normalizeBucketName(bucketLike) {
  if (typeof bucketLike === 'string' && bucketLike.trim()) return bucketLike.trim()
  if (bucketLike && typeof bucketLike === 'object') {
    const candidate = bucketLike.id || bucketLike.bucket || bucketLike.bucketName || bucketLike.name || bucketLike.imageBucket || bucketLike.imageCloudId
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }
  return GOODS_IMAGE_BUCKET
}

export function resolveStorageBucketByPath(filePath, fallbackBucket = GOODS_IMAGE_BUCKET) {
  const normalizedPath = String(filePath || '').trim()
  if (normalizedPath.startsWith(EVENT_PHOTO_PREFIX)) return EVENT_PHOTO_BUCKET
  return fallbackBucket || GOODS_IMAGE_BUCKET
}

// Strip .txt suffix from legacy filenames for Supabase Storage (stores binary, not base64 text)
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

// 分页列出桶内全部文件；complete=false 表示任一页请求失败（列表不完整，
// 孤儿图片回收会据此拒绝执行，避免基于残缺列表误删）
async function listStorageBucketFiles(db, bucketName, folder = '') {
  const PAGE_SIZE = 1000
  const files = []
  let offset = 0
  let complete = true
  for (;;) {
    const { data, error } = await db.storage.from(bucketName).list(folder, {
      limit: PAGE_SIZE,
      offset,
      sortBy: { column: 'name', order: 'asc' }
    })
    if (error || !data) {
      complete = false
      break
    }
    for (const file of data) {
      const name = String(file?.name || '').trim()
      if (!name || name === '.emptyFolderPlaceholder') continue
      files.push({ name, createdAt: file?.created_at || '' })
    }
    if (data.length < PAGE_SIZE) break
    offset += data.length
  }
  return { files, complete }
}

export function createStorageOps({ getDb, withRetry, userIdRef }) {
  function getUserId() {
    const uid = typeof userIdRef === 'function' ? userIdRef() : (userIdRef?.value || '')
    return String(uid || '').trim()
  }

  // 新上传文件统一放入 "<userId>/" 一级目录（Storage RLS 按目录隔离用户，
  // 防止任意登录用户写/删他人文件）。旧的平铺文件保留在桶根目录，
  // 行内存的完整 public URL 继续可读（桶保持 public read）。
  function toUserScopedPath(storagePath) {
    const uid = getUserId()
    return uid ? `${uid}/${storagePath}` : storagePath
  }

  // Cache image file listing to avoid expensive Storage API calls on every sync.
  const IMAGE_CLOUD_CACHE_TTL = 30_000
  let imageCloudCache = null
  let imageCloudCacheTime = 0

  function invalidateImageCache() {
    imageCloudCache = null
    imageCloudCacheTime = 0
  }

  async function getExistingImageCloud() {
    const now = Date.now()
    if (imageCloudCache && (now - imageCloudCacheTime) < IMAGE_CLOUD_CACHE_TTL) {
      return imageCloudCache
    }

    const db = getDb()
    const uid = getUserId()
    const files = {}

    const record = (list) => {
      for (const file of list) {
        const entry = { name: file.name, createdAt: file.createdAt, storagePath: `${uid}/${file.name}` }
        files[file.name] = entry
        // 旧版 .txt 别名指向同一对象，保证按旧文件名查询也能命中
        files[file.name + '.txt'] = entry
      }
    }

    // 只列出用户目录文件（旧根目录文件已迁移到 {userId}/ 下）
    const listJobs = []
    if (uid) {
      listJobs.push(
        listStorageBucketFiles(db, GOODS_IMAGE_BUCKET, uid),
        listStorageBucketFiles(db, EVENT_PHOTO_BUCKET, uid)
      )
    }
    const results = await Promise.all(listJobs)
    const [goodsScopedRes, eventScopedRes] = results
    if (goodsScopedRes) record(goodsScopedRes.files)
    if (eventScopedRes) record(eventScopedRes.files)

    // complete: 全部列表都完整时才为 true，孤儿图片回收依赖此标记
    const result = { id: GOODS_IMAGE_BUCKET, files, complete: results.every((r) => r.complete) }
    imageCloudCache = result
    imageCloudCacheTime = now
    return result
  }

  // 按云端列表缓存解析文件真实存储路径；缓存未命中（如刚上传的新文件）默认用户目录
  function resolveStoragePath(filePath) {
    const storagePath = toStoragePath(filePath)
    const cached = imageCloudCache?.files?.[storagePath] || imageCloudCache?.files?.[filePath]
    if (cached?.storagePath) return cached.storagePath
    return toUserScopedPath(storagePath)
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  }

  async function readImage(bucket, filePath) {
    const db = getDb()
    const storagePath = toStoragePath(filePath)
    const fallbackBucket = normalizeBucketName(bucket)
    const bucketName = resolveStorageBucketByPath(storagePath, fallbackBucket)

    // 依次尝试：缓存解析路径 → 用户目录 → 根目录旧文件
    const candidates = [resolveStoragePath(filePath)]
    for (const path of [toUserScopedPath(storagePath), storagePath]) {
      if (!candidates.includes(path)) candidates.push(path)
    }
    for (const path of candidates) {
      const { data, error } = await withRetry(() =>
        db.storage.from(bucketName).download(path)
      )
      if (!error && data) return blobToDataUrl(data)
    }
    return null
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
        const uploadPath = toUserScopedPath(storagePath)
        try {
          if (!fileObj || !fileObj.content) {
            // 同时尝试删除新旧两代路径（根目录旧文件在策略迁移后可能被 RLS 拒绝，忽略即可）
            await db.storage.from(bucketName).remove(uploadPath === storagePath ? [storagePath] : [uploadPath, storagePath])
            continue
          }

          const blob = dataUrlToBlob(fileObj.content)
          const { error } = await db.storage.from(bucketName).upload(uploadPath, blob, {
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

    invalidateImageCache()
    return { uploaded, failed }
  }

  // 批量删除云端图片文件（孤儿图片回收用）：按前缀路由到对应桶，每批 100 个
  async function removeImages(fileNames) {
    const names = Array.isArray(fileNames) ? fileNames : []
    let removed = 0
    let failed = 0
    if (names.length === 0) return { removed, failed }

    const db = getDb()
    const BATCH_SIZE = 100

    // 按桶分组（event-photo__ 前缀 → event-photos 桶，其余 → goods-images 桶）；
    // 删除路径经缓存解析到文件实际位置（用户目录新文件 / 根目录旧文件）
    const bucketGroups = new Map()
    for (const name of names) {
      const storagePath = toStoragePath(String(name || '').trim())
      if (!storagePath) continue
      const bucketName = resolveStorageBucketByPath(storagePath)
      if (!bucketGroups.has(bucketName)) bucketGroups.set(bucketName, [])
      bucketGroups.get(bucketName).push(resolveStoragePath(storagePath))
    }

    for (const [bucketName, paths] of bucketGroups) {
      for (let i = 0; i < paths.length; i += BATCH_SIZE) {
        const batch = paths.slice(i, i + BATCH_SIZE)
        try {
          const { error } = await withRetry(() => db.storage.from(bucketName).remove(batch))
          if (error) {
            console.warn(`[supabase] remove failed for ${bucketName}:`, error.message)
            failed += batch.length
          } else {
            removed += batch.length
          }
        } catch (e) {
          console.warn(`[supabase] remove failed for ${bucketName}:`, e.message)
          failed += batch.length
        }
      }
    }

    invalidateImageCache()
    return { removed, failed }
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
    const { data } = db.storage.from(bucketName).getPublicUrl(resolveStoragePath(filePath))
    return data?.publicUrl || ''
  }

  return {
    getExistingImageCloud,
    readImage,
    writeImages,
    removeImages,
    ensureStorageBuckets,
    getImagePublicUrl,
    invalidateImageCache
  }
}
