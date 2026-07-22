import { inferGoodsImageStorageMode, normalizeGoodsImageList, parseGistImageUri } from '@/utils/goods/images'
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

  async function resolveRemoteImageGist(remoteManifest) {
    return resolveBackend().getExistingImageGist(remoteManifest)
  }

  async function hydrateRemoteItemsWithImages(items, imageGist, imageStats, options = {}) {
    const targetItemIds = options.targetItemIds instanceof Set ? options.targetItemIds : null
    const fileCache = new Map()
    const currentBackend = resolveBackend()
    // Supabase: images have public URLs, no need to download as base64.
    // Replace gist-image:// references with public URLs directly.
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
          if (storageMode !== 'gist-local') return imageEntry

          const gistFileName = String(imageEntry.gistFileName || parseGistImageUri(imageEntry.uri)).trim()
          if (!gistFileName) {
            if (isSupabase) return imageEntry
            throw new Error(i18n.global.t('sync.error.imageRefInvalid', { name: item?.name || item?.id || i18n.global.t('sync.error.unnamedItem') }))
          }

          // Supabase: replace gist-image:// with public URL, skip download
          if (isSupabase) {
            return {
              ...imageEntry,
              uri: currentBackend.getImagePublicUrl(gistFileName),
              storageMode: 'remote',
              gistFileName
            }
          }

          if (!imageGist) {
            throw new Error(i18n.global.t('sync.error.imageGistMissing'))
          }

          if (!fileCache.has(gistFileName)) {
            const imageDataUrl = await trackSyncStep(i18n.global.t('sync.step.readImageFile', { name: gistFileName }), async () => {
              const fetched = await resolveBackend().readImage(imageGist, gistFileName)

              if (!String(fetched || '').startsWith('data:image/')) {
                throw new Error(i18n.global.t('sync.error.remoteImageMissing', { name: gistFileName }))
              }
              return fetched
            }, {
              startDetail: item?.name ? i18n.global.t('sync.step.restoreItem.start', { name: item.name }) : i18n.global.t('sync.step.restoreItem.startFallback'),
              category: 'image',
              successDetail: () => i18n.global.t('sync.step.restoreItem.success', { name: item?.name || item?.id || gistFileName })
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
    }, 8)
  }

  async function hydrateEventCoversWithImages(events, imageGist, imageStats, options = {}) {
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
        if (storageMode === 'gist-local') {
          const gistFileName = String(event.coverImageData?.gistFileName || parseGistImageUri(event.coverImage)).trim()
          if (gistFileName) {
            // Supabase: replace with public URL, skip download
            if (isSupabase) {
              nextCoverImage = currentBackend.getImagePublicUrl(gistFileName)
              nextCoverImageData = {
                ...event.coverImageData,
                uri: nextCoverImage,
                storageMode: 'remote',
                gistFileName
              }
            } else if (imageGist) {
              try {
                if (!fileCache.has(gistFileName)) {
                  const imageDataUrl = await trackSyncStep(i18n.global.t('sync.step.readEventCoverFile', { name: gistFileName }), async () => {
                    const fetched = await resolveBackend().readImage(imageGist, gistFileName)
                    if (!String(fetched || '').startsWith('data:image/')) {
                      throw new Error(i18n.global.t('sync.error.remoteCoverMissing', { name: gistFileName }))
                    }
                    return fetched
                  }, {
                    startDetail: event?.name ? i18n.global.t('sync.step.restoreEventCover.start', { name: event.name }) : i18n.global.t('sync.step.restoreEventCover.startFallback'),
                    category: 'image',
                    successDetail: () => i18n.global.t('sync.step.restoreEventCover.success', { name: event?.name || event?.id || gistFileName })
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
      }

      if (sourcePhotos.length > 0) {
        nextPhotos = await Promise.all(sourcePhotos.map(async (photoEntry, index) => {
          const photoUri = String(photoEntry?.uri || '').trim()
          if (!photoUri) return photoEntry

          const photoStorageMode = inferGoodsImageStorageMode(photoUri, photoEntry?.storageMode)
          if (photoStorageMode !== 'gist-local') return photoEntry

          const gistFileName = String(photoEntry?.gistFileName || parseGistImageUri(photoUri)).trim()
          if (!gistFileName) return photoEntry

          // Supabase: replace with public URL, skip download
          if (isSupabase) {
            return {
              ...photoEntry,
              uri: currentBackend.getImagePublicUrl(gistFileName),
              storageMode: 'remote',
              gistFileName
            }
          }

          if (!imageGist) return photoEntry

          try {
            if (!fileCache.has(gistFileName)) {
              const imageDataUrl = await trackSyncStep(i18n.global.t('sync.step.readEventPhotoFile', { name: gistFileName }), async () => {
                const fetched = await resolveBackend().readImage(imageGist, gistFileName)
                if (!String(fetched || '').startsWith('data:image/')) {
                  throw new Error(i18n.global.t('sync.error.remotePhotoMissing', { name: gistFileName }))
                }
                return fetched
              }, {
                startDetail: event?.name ? i18n.global.t('sync.step.restoreEventPhoto.start', { name: event.name }) : i18n.global.t('sync.step.restoreEventPhoto.startFallback'),
                category: 'image',
                successDetail: () => i18n.global.t('sync.step.restoreEventPhoto.success', { name: event?.name || event?.id || '?', index: index + 1 })
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
    }, 8)
  }

  function buildImageCleanupFiles(existingImageGist, referencedImageFiles) {
    const files = {}
    const existingFiles = existingImageGist?.files || {}
    const existingCount = Object.keys(existingFiles).filter(name =>
      name.startsWith(imageFilePrefix) || name.startsWith(eventCoverPrefix) || name.startsWith(eventPhotoPrefix)
    ).length

    // Safety: if there are existing images but no referenced files, skip cleanup
    // to prevent accidental deletion when referencedImageFiles is incorrectly empty
    if (existingCount > 0 && referencedImageFiles.size === 0) {
      console.warn('[sync] buildImageCleanupFiles: skipped — existing images exist but referencedImageFiles is empty (possible bug)')
      return files
    }

    for (const filename of Object.keys(existingFiles)) {
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
