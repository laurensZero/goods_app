import { inferGoodsImageStorageMode, normalizeGoodsImageList, parseGistImageUri } from '@/utils/goods/images'
import { processWithConcurrency } from '@/utils/sync/shared'

export function createSyncImageService({
  backend,
  getBackend,
  trackSyncStep,
  imageFilePrefix,
  eventCoverPrefix,
  eventPhotoPrefix
}) {
  function resolveBackend() {
    return typeof getBackend === 'function' ? (getBackend() || backend) : backend
  }

  async function resolveRemoteImageGist(remoteManifest) {
    return resolveBackend().getExistingImageGist(remoteManifest)
  }

  async function hydrateRemoteItemsWithImages(items, imageGist, imageStats, options = {}) {
    const targetItemIds = options.targetItemIds instanceof Set ? options.targetItemIds : null
    const fileCache = new Map()

    return processWithConcurrency(items || [], async (item) => {
      try {
        const itemId = String(item?.id || '').trim()
        if (targetItemIds && !targetItemIds.has(itemId)) {
          return item
        }

        const normalizedImages = normalizeGoodsImageList(item?.images)
        if (normalizedImages.length === 0) return item

        const hydratedImages = await Promise.all(normalizedImages.map(async (imageEntry) => {
          const storageMode = inferGoodsImageStorageMode(imageEntry.uri, imageEntry.storageMode)
          if (storageMode !== 'gist-local') return imageEntry

          const gistFileName = String(imageEntry.gistFileName || parseGistImageUri(imageEntry.uri)).trim()
          if (!gistFileName) {
            throw new Error(`图片引用无效：${item?.name || item?.id || '未命名条目'}`)
          }
          if (!imageGist) {
            throw new Error('远端数据包含图片引用，但未找到图片存储')
          }

          if (!fileCache.has(gistFileName)) {
            const imageDataUrl = await trackSyncStep(`读取图片文件 ${gistFileName}`, async () => {
              const fetched = await resolveBackend().readImage(imageGist, gistFileName)

              if (!String(fetched || '').startsWith('data:image/')) {
                throw new Error(`远端图片缺失：${gistFileName}`)
              }
              return fetched
            }, {
              startDetail: item?.name ? `条目：${item.name}` : '正在恢复图片',
              category: 'image',
              successDetail: () => `已恢复条目 ${item?.name || item?.id || gistFileName} 的图片`
            })
            fileCache.set(gistFileName, imageDataUrl)
          }

          const imageDataUrl = fileCache.get(gistFileName)

          imageStats.restoredImages += 1

          return {
            ...imageEntry,
            uri: imageDataUrl,
            storageMode: 'gist-local',
            gistFileName
          }
        }))

        const primaryImage = hydratedImages.find((entry) => entry.isPrimary) || hydratedImages[0] || null
        const coverImage = primaryImage?.uri || String(item?.coverImage || item?.image || '').trim()

        return {
          ...item,
          image: coverImage,
          coverImage,
          images: hydratedImages
        }
      } catch (e) {
        console.warn(`[sync] hydrateRemoteItemsWithImages: item ${item?.id || '?'} failed, keeping original:`, e)
        return item
      }
    })
  }

  async function hydrateEventCoversWithImages(events, imageGist, imageStats, options = {}) {
    const targetEventIds = options.targetEventIds instanceof Set ? options.targetEventIds : null
    const fileCache = new Map()

    return processWithConcurrency(events || [], async (event) => {
      const eventId = String(event?.id || '').trim()
      if (targetEventIds && !targetEventIds.has(eventId)) {
        return event
      }

      let nextCoverImage = event?.coverImage
      let nextCoverImageData = event?.coverImageData
      const sourcePhotos = Array.isArray(event?.photos) ? event.photos : []
      let nextPhotos = sourcePhotos

      if (imageGist && event.coverImage) {
        const storageMode = inferGoodsImageStorageMode(event.coverImage, event?.coverImageData?.storageMode)
        if (storageMode === 'gist-local') {
          const gistFileName = String(event.coverImageData?.gistFileName || parseGistImageUri(event.coverImage)).trim()
          if (gistFileName) {
            try {
              if (!fileCache.has(gistFileName)) {
                const imageDataUrl = await trackSyncStep(`读取活动封面文件 ${gistFileName}`, async () => {
                  const fetched = await resolveBackend().readImage(imageGist, gistFileName)
                  if (!String(fetched || '').startsWith('data:image/')) {
                    throw new Error(`远端活动封面缺失：${gistFileName}`)
                  }
                  return fetched
                }, {
                  startDetail: event?.name ? `活动：${event.name}` : '正在恢复封面',
                  category: 'image',
                  successDetail: () => `已恢复活动 ${event?.name || event?.id || gistFileName} 的封面`
                })
                fileCache.set(gistFileName, imageDataUrl)
              }

              nextCoverImage = fileCache.get(gistFileName)
              nextCoverImageData = {
                ...event.coverImageData,
                uri: nextCoverImage,
                storageMode: 'gist-local',
                gistFileName
              }
              imageStats.restoredImages += 1
            } catch {
              // Keep original cover when single file restore fails.
            }
          }
        }
      }

      if (imageGist && sourcePhotos.length > 0) {
        nextPhotos = await Promise.all(sourcePhotos.map(async (photoEntry, index) => {
          const photoUri = String(photoEntry?.uri || '').trim()
          if (!photoUri) return photoEntry

          const photoStorageMode = inferGoodsImageStorageMode(photoUri, photoEntry?.storageMode)
          if (photoStorageMode !== 'gist-local') return photoEntry

          const gistFileName = String(photoEntry?.gistFileName || parseGistImageUri(photoUri)).trim()
          if (!gistFileName) return photoEntry

          try {
            if (!fileCache.has(gistFileName)) {
              const imageDataUrl = await trackSyncStep(`读取活动照片文件 ${gistFileName}`, async () => {
                const fetched = await resolveBackend().readImage(imageGist, gistFileName)
                if (!String(fetched || '').startsWith('data:image/')) {
                  throw new Error(`远端活动照片缺失：${gistFileName}`)
                }
                return fetched
              }, {
                startDetail: event?.name ? `活动：${event.name}` : '正在恢复活动照片',
                category: 'image',
                successDetail: () => `已恢复活动 ${(event?.name || event?.id || '?')} 的第 ${index + 1} 张照片`
              })
              fileCache.set(gistFileName, imageDataUrl)
            }

            imageStats.restoredImages += 1

            return {
              ...photoEntry,
              uri: fileCache.get(gistFileName),
              storageMode: 'gist-local',
              gistFileName
            }
          } catch {
            return photoEntry
          }
        }))
      }

      return {
        ...event,
        coverImage: nextCoverImage,
        coverImageData: nextCoverImageData,
        photos: nextPhotos
      }
    })
  }

  function buildImageCleanupFiles(existingImageGist, referencedImageFiles) {
    const currentBackend = resolveBackend()
    // Supabase uses public URLs for synced images, so local items no longer retain gist-local references.
    // Deleting based on current references would incorrectly remove valid cloud images on the next sync.
    if (typeof currentBackend?.getImagePublicUrl === 'function') {
      return {}
    }

    const files = {}
    for (const filename of Object.keys(existingImageGist?.files || {})) {
      if (
        !filename.startsWith(imageFilePrefix)
        && !filename.startsWith(eventCoverPrefix)
        && !filename.startsWith(eventPhotoPrefix)
      ) continue
      if (referencedImageFiles.has(filename)) continue
      files[filename] = null
    }
    return files
  }

  return {
    resolveRemoteImageGist,
    hydrateRemoteItemsWithImages,
    hydrateEventCoversWithImages,
    buildImageCleanupFiles
  }
}
