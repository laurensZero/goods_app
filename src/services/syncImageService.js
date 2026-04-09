import { inferGoodsImageStorageMode, normalizeGoodsImageList, parseGistImageUri } from '@/utils/goodsImages'

export function createSyncImageService({
  tokenRef,
  imageGistIdRef,
  saveImageGistId,
  trackSyncStep,
  getGist,
  getGistFileContent,
  imageFilePrefix,
  eventCoverPrefix
}) {
  async function resolveRemoteImageGist(remoteManifest) {
    const remoteImageGistId = String(remoteManifest?.imageGistId || imageGistIdRef.value || '').trim()
    if (!remoteImageGistId) return null
    if (remoteImageGistId !== imageGistIdRef.value) {
      await saveImageGistId(remoteImageGistId)
    }

    const gist = await trackSyncStep('读取图片 Gist', async () => {
      const fetched = await getGist(tokenRef.value, remoteImageGistId)
      if (!fetched) {
        throw new Error('未找到图片 Gist')
      }
      return fetched
    }, {
      startDetail: `Gist ${remoteImageGistId}`,
      category: 'image',
      successDetail: () => `已连接 ${remoteImageGistId}`
    })

    return gist
  }

  async function hydrateRemoteItemsWithImages(items, imageGist, imageStats) {
    const fileCache = new Map()

    return Promise.all((items || []).map(async (item) => {
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
          throw new Error('远端数据包含图片引用，但未找到图片 Gist')
        }

        if (!fileCache.has(gistFileName)) {
          const imageDataUrl = await trackSyncStep(`读取图片文件 ${gistFileName}`, async () => {
            const fetched = await getGistFileContent(tokenRef.value, imageGist, gistFileName)
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
    }))
  }

  async function hydrateEventCoversWithImages(events, imageGist, imageStats) {
    const fileCache = new Map()

    return Promise.all((events || []).map(async (event) => {
      if (!event.coverImage) return event

      const storageMode = inferGoodsImageStorageMode(event.coverImage)
      if (storageMode !== 'gist-local') return event

      const gistFileName = String(event.coverImageData?.gistFileName || parseGistImageUri(event.coverImage)).trim()
      if (!gistFileName) return event

      if (!imageGist) return event

      try {
        if (!fileCache.has(gistFileName)) {
          const imageDataUrl = await trackSyncStep(`读取活动封面文件 ${gistFileName}`, async () => {
            const fetched = await getGistFileContent(tokenRef.value, imageGist, gistFileName)
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

        const imageDataUrl = fileCache.get(gistFileName)

        imageStats.restoredImages += 1

        return {
          ...event,
          coverImage: imageDataUrl,
          coverImageData: {
            ...event.coverImageData,
            uri: imageDataUrl
          }
        }
      } catch {
        return event
      }
    }))
  }

  function buildImageCleanupFiles(existingImageGist, referencedImageFiles) {
    const files = {}
    for (const filename of Object.keys(existingImageGist?.files || {})) {
      if (!filename.startsWith(imageFilePrefix) && !filename.startsWith(eventCoverPrefix)) continue
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
