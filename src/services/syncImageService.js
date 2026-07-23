import { inferGoodsImageStorageMode, normalizeGoodsImageList, parseCloudImageUri } from '@/utils/goods/images'
import { processWithConcurrency } from '@/utils/sync/shared'
import i18n from '@/locales'

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

  async function resolveRemoteImageCloud(remoteManifest) {
    return resolveBackend().getExistingImageCloud(remoteManifest)
  }

  async function hydrateRemoteItemsWithImages(items, imageCloud, imageStats, options = {}) {
    const targetItemIds = options.targetItemIds instanceof Set ? options.targetItemIds : null
    const fileCache = new Map()
    const currentBackend = resolveBackend()
    // Supabase: images have public URLs, no need to download as base64.
    // Replace cloud-image:// references with public URLs directly.
    const isSupabase = typeof currentBackend?.getImagePublicUrl === 'function'

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
          if (storageMode !== 'cloud-local') return imageEntry

          const cloudFileName = String(imageEntry.cloudFileName || parseCloudImageUri(imageEntry.uri)).trim()
          if (!cloudFileName) {
            if (isSupabase) return imageEntry
            throw new Error(i18n.global.t('sync.error.imageRefInvalid', { name: item?.name || item?.id || i18n.global.t('sync.error.unnamedItem') }))
          }

          // Supabase: replace cloud-image:// with public URL, skip download
          if (isSupabase) {
            return {
              ...imageEntry,
              uri: currentBackend.getImagePublicUrl(cloudFileName),
              storageMode: 'remote',
              cloudFileName
            }
          }

          if (!imageCloud) {
            throw new Error(i18n.global.t('sync.error.imageCloudMissing'))
          }

          if (!fileCache.has(cloudFileName)) {
            const imageDataUrl = await trackSyncStep(i18n.global.t('sync.step.readImageFile', { name: cloudFileName }), async () => {
              const fetched = await resolveBackend().readImage(imageCloud, cloudFileName)

              if (!String(fetched || '').startsWith('data:image/')) {
                throw new Error(i18n.global.t('sync.error.remoteImageMissing', { name: cloudFileName }))
              }
              return fetched
            }, {
              startDetail: item?.name ? i18n.global.t('sync.step.restoreItem.start', { name: item.name }) : i18n.global.t('sync.step.restoreItem.startFallback'),
              category: 'image',
              successDetail: () => i18n.global.t('sync.step.restoreItem.success', { name: item?.name || item?.id || cloudFileName })
            })
            fileCache.set(cloudFileName, imageDataUrl)
          }

          const imageDataUrl = fileCache.get(cloudFileName)

          imageStats.restoredImages += 1

          return {
            ...imageEntry,
            uri: imageDataUrl,
            storageMode: 'cloud-local',
            cloudFileName
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
    }, 8)
  }

  async function hydrateEventCoversWithImages(events, imageCloud, imageStats, options = {}) {
    const targetEventIds = options.targetEventIds instanceof Set ? options.targetEventIds : null
    const fileCache = new Map()
    const currentBackend = resolveBackend()
    const isSupabase = typeof currentBackend?.getImagePublicUrl === 'function'

    return processWithConcurrency(events || [], async (event) => {
      const eventId = String(event?.id || '').trim()
      if (targetEventIds && !targetEventIds.has(eventId)) {
        return event
      }

      let nextCoverImage = event?.coverImage
      let nextCoverImageData = event?.coverImageData
      const sourcePhotos = Array.isArray(event?.photos) ? event.photos : []
      let nextPhotos = sourcePhotos

      if (event.coverImage) {
        const storageMode = inferGoodsImageStorageMode(event.coverImage, event?.coverImageData?.storageMode)
        if (storageMode === 'cloud-local') {
          const cloudFileName = String(event.coverImageData?.cloudFileName || parseCloudImageUri(event.coverImage)).trim()
          if (cloudFileName) {
            // Supabase: replace with public URL, skip download
            if (isSupabase) {
              nextCoverImage = currentBackend.getImagePublicUrl(cloudFileName)
              nextCoverImageData = {
                ...event.coverImageData,
                uri: nextCoverImage,
                storageMode: 'remote',
                cloudFileName
              }
            } else if (imageCloud) {
              try {
                if (!fileCache.has(cloudFileName)) {
                  const imageDataUrl = await trackSyncStep(i18n.global.t('sync.step.readEventCoverFile', { name: cloudFileName }), async () => {
                    const fetched = await resolveBackend().readImage(imageCloud, cloudFileName)
                    if (!String(fetched || '').startsWith('data:image/')) {
                      throw new Error(i18n.global.t('sync.error.remoteCoverMissing', { name: cloudFileName }))
                    }
                    return fetched
                  }, {
                    startDetail: event?.name ? i18n.global.t('sync.step.restoreEventCover.start', { name: event.name }) : i18n.global.t('sync.step.restoreEventCover.startFallback'),
                    category: 'image',
                    successDetail: () => i18n.global.t('sync.step.restoreEventCover.success', { name: event?.name || event?.id || cloudFileName })
                  })
                  fileCache.set(cloudFileName, imageDataUrl)
                }

                nextCoverImage = fileCache.get(cloudFileName)
                nextCoverImageData = {
                  ...event.coverImageData,
                  uri: nextCoverImage,
                  storageMode: 'cloud-local',
                  cloudFileName
                }
                imageStats.restoredImages += 1
              } catch {
                // Keep original cover when single file restore fails.
              }
            }
          }
        }
      }

      if (sourcePhotos.length > 0) {
        nextPhotos = await Promise.all(sourcePhotos.map(async (photoEntry, index) => {
          const photoUri = String(photoEntry?.uri || '').trim()
          if (!photoUri) return photoEntry

          const photoStorageMode = inferGoodsImageStorageMode(photoUri, photoEntry?.storageMode)
          if (photoStorageMode !== 'cloud-local') return photoEntry

          const cloudFileName = String(photoEntry?.cloudFileName || parseCloudImageUri(photoUri)).trim()
          if (!cloudFileName) return photoEntry

          // Supabase: replace with public URL, skip download
          if (isSupabase) {
            return {
              ...photoEntry,
              uri: currentBackend.getImagePublicUrl(cloudFileName),
              storageMode: 'remote',
              cloudFileName
            }
          }

          if (!imageCloud) return photoEntry

          try {
            if (!fileCache.has(cloudFileName)) {
              const imageDataUrl = await trackSyncStep(i18n.global.t('sync.step.readEventPhotoFile', { name: cloudFileName }), async () => {
                const fetched = await resolveBackend().readImage(imageCloud, cloudFileName)
                if (!String(fetched || '').startsWith('data:image/')) {
                  throw new Error(i18n.global.t('sync.error.remotePhotoMissing', { name: cloudFileName }))
                }
                return fetched
              }, {
                startDetail: event?.name ? i18n.global.t('sync.step.restoreEventPhoto.start', { name: event.name }) : i18n.global.t('sync.step.restoreEventPhoto.startFallback'),
                category: 'image',
                successDetail: () => i18n.global.t('sync.step.restoreEventPhoto.success', { name: event?.name || event?.id || '?', index: index + 1 })
              })
              fileCache.set(cloudFileName, imageDataUrl)
            }

            imageStats.restoredImages += 1

            return {
              ...photoEntry,
              uri: fileCache.get(cloudFileName),
              storageMode: 'cloud-local',
              cloudFileName
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
    }, 8)
  }

  function buildImageCleanupFiles(existingImageCloud, referencedImageFiles) {
    const currentBackend = resolveBackend()
    // Supabase uses public URLs for synced images, so local items no longer retain cloud-local references.
    // Deleting based on current references would incorrectly remove valid cloud images on the next sync.
    if (typeof currentBackend?.getImagePublicUrl === 'function') {
      return {}
    }

    const files = {}
    for (const filename of Object.keys(existingImageCloud?.files || {})) {
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
    resolveRemoteImageCloud,
    hydrateRemoteItemsWithImages,
    hydrateEventCoversWithImages,
    buildImageCleanupFiles
  }
}
