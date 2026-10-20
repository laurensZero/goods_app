import { inferGoodsImageStorageMode, normalizeEventPhotoEntry, normalizeGoodsImageList, parseCloudImageUri } from '@/utils/goods/images'
import { processWithConcurrency } from '@/utils/sync/shared'
import i18n from '@/locales'

// 孤儿图片回收的多设备宽限期：跳过 48 小时内新建的云端文件，
// 避免另一设备刚上传、本设备列表尚未包含其引用时被误删
export const SUPABASE_ORPHAN_GRACE_MS = 48 * 60 * 60 * 1000
// 单次同步最多删除的孤儿文件数，限制误判时的影响范围；剩余的留待后续同步继续回收
export const MAX_ORPHAN_DELETE_PER_SYNC = 200
// 护栏②：本次候选孤儿占「我拥有的托管文件」的比例上限。正常清理（删几件谷子、清空草稿）
// 远低于这个比例；一旦超过，说明本地引用集整体塌了（迁移格式不兼容 / 清数据 / 新装），
// 这时删下去就是把云端图库清空——历史事故就是这么发生的，宁可这次不回收。
export const ORPHAN_DELETE_MAX_RATIO = 0.3

export function createSyncImageService({
  backend,
  getBackend,
  trackSyncStep,
  imageFilePrefix,
  eventCoverPrefix,
  eventPhotoPrefix,
  rechargeImagePrefix,
  batchDraftImagePrefix,
  profileBackgroundPrefix
}) {
  function resolveBackend() {
    return typeof getBackend === 'function' ? (getBackend() || backend) : backend
  }

  // 同步域图片前缀唯一枚举处：新增域必须在此登记，否则孤儿回收不会扫到该前缀的文件
  function listManagedImagePrefixes() {
    return [imageFilePrefix, eventCoverPrefix, eventPhotoPrefix, rechargeImagePrefix, batchDraftImagePrefix, profileBackgroundPrefix]
      .filter((p) => !!p)
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
            const editSourceCloudFileName = String(
              imageEntry.editSourceCloudFileName || parseCloudImageUri(imageEntry.editSourceUri) || ''
            ).trim()
            return {
              ...imageEntry,
              uri: currentBackend.getImagePublicUrl(cloudFileName),
              storageMode: 'remote',
              cloudFileName,
              // 去框底图同样换成公开 URL：另一台设备点「重新编辑外框」时直接拉回本地
              editSourceUri: editSourceCloudFileName
                ? currentBackend.getImagePublicUrl(editSourceCloudFileName)
                : String(imageEntry.editSourceUri || ''),
              editSourceCloudFileName
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
          const photo = normalizeEventPhotoEntry(photoEntry)
          const photoUri = String(photo?.uri || '').trim()
          if (!photoUri) return photoEntry

          const photoStorageMode = inferGoodsImageStorageMode(photoUri, photo?.storageMode)
          if (photoStorageMode !== 'cloud-local') return photoEntry

          const cloudFileName = String(photo?.cloudFileName || parseCloudImageUri(photoUri)).trim()
          if (!cloudFileName) return photoEntry

          // Supabase: replace with public URL, skip download
          if (isSupabase) {
            return {
              ...photo,
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
              ...photo,
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

  // Supabase 模式的孤儿图片检测：在 doPush 末尾调用，返回可安全删除的云端文件名列表。
  // 五重防护：
  //   1) 列表完整性（分页失败 → 拒绝执行）
  //   2) 归属校验（只删文件名里嵌入的实体 ID 属于当前用户的文件，共享桶内他人文件不动）
  //   3) 宽限期（跳过 graceMs 内新建的文件，规避多设备并发上传竞态）
  //   4) 引用集下限（本地一条云端引用都算不出来 → 拒绝执行）
  //   5) 比例上限（候选孤儿超过自持文件的 30% → 拒绝执行）
  // 第 4/5 条是硬护栏：它们不解决"哪张图该删"，只保证"本地状态整体不可信时一张都不删"。
  // 图片被误删后无法从数据库恢复（备份表只有行，没有 Storage 对象），所以这里的
  // 默认动作必须是"不动"，而不是"尽力回收"。
  function collectSupabaseOrphanImageFiles(existingImageCloud, {
    referencedFiles,
    ownedEntityIds,
    now = Date.now(),
    graceMs = SUPABASE_ORPHAN_GRACE_MS
  } = {}) {
    // 列表不完整（分页失败）时拒绝执行，避免基于残缺数据误删
    if (existingImageCloud?.complete !== true) return []
    if (!(ownedEntityIds instanceof Set) || ownedEntityIds.size === 0) return []
    if (!(referencedFiles instanceof Set)) return []

    // 引用集归一化：旧数据可能引用 .txt 别名文件名，统一去掉后缀再比对；
    // 引用还可能携带用户目录前缀（<uid>/goods-image__...，来自用户目录公开 URL 的解析兜底），
    // 而云端文件表以裸文件名为键，必须剥掉目录段，否则被引用文件会被误判为孤儿
    const refs = new Set()
    for (const r of referencedFiles) {
      let n = String(r || '').trim()
      if (!n) continue
      n = n.split('/').pop()
      if (!n) continue
      refs.add(n.endsWith('.txt') ? n.slice(0, -4) : n)
    }

    const prefixes = listManagedImagePrefixes()
    const ownedFiles = []
    const candidates = []
    for (const [key, value] of Object.entries(existingImageCloud.files || {})) {
      // 跳过 .txt 别名条目（与真实文件指向同一对象，避免重复删除）
      if (key.endsWith('.txt')) continue
      const matchedPrefix = prefixes.find((prefix) => key.startsWith(prefix))
      if (!matchedPrefix) continue

      // 归属校验：文件名格式为 <prefix><entityId>__...，实体 ID 本身可能含 '__'，
      // 逐段拼接尝试匹配当前用户拥有的实体 ID；匹配不上视为他人文件，绝不删除
      const rest = key.slice(matchedPrefix.length)
      const parts = rest.split('__')
      let owned = false
      for (let i = 0; i < parts.length - 1; i++) {
        const candidate = parts.slice(0, i + 1).join('__')
        if (ownedEntityIds.has(candidate)) { owned = true; break }
      }
      if (!owned) continue
      ownedFiles.push(key)

      if (refs.has(key)) continue

      // 宽限期：created_at 缺失/无法解析或距今不足 graceMs 的文件一律保留
      const createdMs = Date.parse(String(value?.createdAt || ''))
      if (!Number.isFinite(createdMs)) continue
      if (now - createdMs < graceMs) continue

      candidates.push(key)
    }

    if (candidates.length === 0) return []

    // 护栏④：本地算不出一条云端引用 → 本地状态不可信（新装未拉取、清过数据、
    // 迁移后读取路径不认识新格式…）。此时"孤儿"等于整个云端图库，必须整体放弃。
    if (refs.size === 0) {
      console.warn('[orphan-gc] 本地云端引用集为空，跳过本次回收', { candidates: candidates.length, owned: ownedFiles.length })
      return []
    }

    // 护栏⑤：候选占比过高 → 引用集整体塌方，而不是"用户真的删了这么多图"。
    const ratio = ownedFiles.length > 0 ? candidates.length / ownedFiles.length : 1
    if (ratio > ORPHAN_DELETE_MAX_RATIO) {
      console.warn('[orphan-gc] 候选孤儿占比过高，跳过本次回收', {
        candidates: candidates.length,
        owned: ownedFiles.length,
        ratio: Number(ratio.toFixed(3)),
        limit: ORPHAN_DELETE_MAX_RATIO
      })
      return []
    }

    return candidates.slice(0, MAX_ORPHAN_DELETE_PER_SYNC)
  }

  function buildImageCleanupFiles(existingImageCloud, referencedImageFiles) {
    const currentBackend = resolveBackend()
    // Supabase 模式：孤儿图片回收由 doPush 末尾的 collectSupabaseOrphanImageFiles 专门处理
    // （需要全量本地引用 + 归属校验 + 宽限期），此处的 pipeline 引用集在增量推送时不完整，不能用于删除。
    if (typeof currentBackend?.getImagePublicUrl === 'function') {
      return {}
    }

    const prefixes = listManagedImagePrefixes()
    const files = {}
    for (const filename of Object.keys(existingImageCloud?.files || {})) {
      if (!prefixes.some((prefix) => filename.startsWith(prefix))) continue
      if (referencedImageFiles.has(filename)) continue
      files[filename] = null
    }
    return files
  }

  return {
    resolveRemoteImageCloud,
    hydrateRemoteItemsWithImages,
    hydrateEventCoversWithImages,
    buildImageCleanupFiles,
    collectSupabaseOrphanImageFiles
  }
}
