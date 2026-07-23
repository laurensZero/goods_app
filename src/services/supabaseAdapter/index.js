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

  const storage = createStorageOps({ getDb, withRetry })
  const reader = createReader({ getDb, trackSyncStep, userIdRef })
  const writer = createWriter({ getDb, deviceIdRef, userIdRef })

  // ── Ensure operations (no-op for Supabase, tables are pre-created) ──

  async function ensureDataGist() {
    return { id: 'supabase-data' }
  }

  async function ensureImageGist() {
    return storage.ensureStorageBuckets()
  }

  async function ensureRechargeGist() {
    return { id: 'supabase-recharge' }
  }

  async function ensureEventGist() {
    return { id: 'supabase-events' }
  }

  async function getExistingRechargeGist() {
    return { id: 'supabase-recharge' }
  }

  async function getExistingEventGist() {
    return { id: 'supabase-events' }
  }

  function getDataGistId() {
    return 'supabase-data'
  }

  async function getDataGist() {
    return { id: 'supabase-data' }
  }

  function isEncryptionEnabled() {
    return false
  }

  // Wrap writeImages to add trackSyncStep UI feedback
  async function writeImagesWithTracking(gistId, imageFiles) {
    if (!imageFiles || Object.keys(imageFiles).length === 0) return
    await trackSyncStep(i18n.global.t('sync.step.uploadSupabaseImages'), async () => {
      const result = await storage.writeImages(gistId, imageFiles)
      return i18n.global.t('sync.step.uploadSupabaseImages.result', { uploaded: result.uploaded, failed: result.failed })
    }, {
      startDetail: i18n.global.t('sync.step.uploadSupabaseImages.start', { count: Object.keys(imageFiles).length }),
      category: 'image',
      successDetail: () => i18n.global.t('sync.step.uploadSupabaseImages.success')
    })
  }

  return createSyncBackendAdapter({
    ensureDataGist,
    ensureImageGist,
    ensureRechargeGist,
    ensureEventGist,
    getExistingImageGist: storage.getExistingImageGist,
    getExistingRechargeGist,
    getExistingEventGist,
    readJson: reader.readJson,
    readImage: storage.readImage,
    writeData: writer.writeData,
    writeImages: writeImagesWithTracking,
    getManifest: reader.getManifest,
    isEncryptionEnabled,
    getDataGistId,
    getDataGist,
    getImagePublicUrl: storage.getImagePublicUrl,
    pushDomainRows: writer.pushDomainRows,
    pullDomainRows: reader.pullDomainRows,
    pullAll: reader.pullAll,
    pushAll: writer.pushAll,
    // New unified interfaces for Phase 2
    readPresets: reader.readPresets,
    writePresets: writer.writePresets,
    writeManifest: writer.writeManifest,
    getDb
  })
}

// Re-export for backward compatibility
export { createSupabaseBackendAdapter as default }
