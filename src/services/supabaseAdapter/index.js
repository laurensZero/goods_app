// src/services/supabaseAdapter/index.js
// Factory that assembles the Supabase backend adapter from modular parts

import { createSyncBackendAdapter } from '@/services/syncBackendAdapter'
import { getSupabaseClient } from '@/utils/sync/supabaseClient'
import { withRetry } from '@/services/syncRetry'
import { createStorageOps } from './storage'
import { createReader } from './reader'
import { createWriter } from './writer'
import i18n from '@/locales'

export function createSupabaseBackendAdapter({
  trackSyncStep,
  deviceIdRef,
  userIdRef
}) {
  function getDb() {
    return getSupabaseClient()
  }

  const storage = createStorageOps({ getDb, withRetry, userIdRef })
  const reader = createReader({ getDb, trackSyncStep, userIdRef, deviceIdRef })
  const writer = createWriter({ getDb, deviceIdRef, userIdRef })

  async function ensureImageCloud() {
    return storage.ensureStorageBuckets()
  }

  // Wrap writeImages to add trackSyncStep UI feedback
  async function writeImagesWithTracking(cloudId, imageFiles) {
    if (!imageFiles || Object.keys(imageFiles).length === 0) return { uploaded: 0, failed: 0 }
    let result = { uploaded: 0, failed: 0 }
    await trackSyncStep(i18n.global.t('sync.step.uploadSupabaseImages'), async () => {
      result = await storage.writeImages(cloudId, imageFiles)
      return i18n.global.t('sync.step.uploadSupabaseImages.result', { uploaded: result.uploaded, failed: result.failed })
    }, {
      startDetail: i18n.global.t('sync.step.uploadSupabaseImages.start', { count: Object.keys(imageFiles).length }),
      category: 'image',
      successDetail: () => i18n.global.t('sync.step.uploadSupabaseImages.success')
    })
    return result
  }

  return createSyncBackendAdapter({
    ensureImageCloud,
    getExistingImageCloud: storage.getExistingImageCloud,
    readImage: storage.readImage,
    writeImages: writeImagesWithTracking,
    getImagePublicUrl: storage.getImagePublicUrl,
    getPhotoThumbUrl: storage.getPhotoThumbUrl,
    removeImages: storage.removeImages,
    pushAll: writer.pushAll,
    pullAll: reader.pullAll,
    readManifest: reader.readManifest,
    readDeviceRow: reader.readDeviceRow,
    writeDeviceHeartbeat: writer.writeDeviceHeartbeat,
    clearDeviceForceResync: writer.clearDeviceForceResync,
    getDb
  })
}

// Re-export for backward compatibility
export { createSupabaseBackendAdapter as default }
