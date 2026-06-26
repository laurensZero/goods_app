import { createSyncBackendAdapter } from './syncBackendAdapter'
import {
  createGist,
  getGist,
  updateGist,
  listGists,
  getGistFileContent,
  buildSyncDescription
} from '@/utils/github/gist'
import { encrypt, decrypt, isEncrypted } from '@/utils/sync/cryptoManager'
import { readSyncKey, writeSyncKey } from '@/utils/sync/storage'
import { withRetry } from './syncRetry'
import { createLogger } from '@/utils/logger'
import i18n from '@/locales'

const log = createLogger('sync:gist')

export function createGistBackendAdapter({
  tokenRef,
  gistIdRef,
  imageGistIdRef,
  rechargeGistIdRef,
  eventGistIdRef,
  deviceIdRef,
  encryptionEnabledRef,
  ensureEncryptionKey,
  constants,
  trackSyncStep
}) {
  const {
    GIST_ID_KEY,
    IMAGE_GIST_ID_KEY,
    RECHARGE_GIST_ID_KEY,
    EVENT_GIST_ID_KEY,
    DATA_FILENAME,
    RECHARGE_DATA_FILENAME,
    EVENT_DATA_FILENAME,
    MANIFEST_FILENAME
  } = constants

  // ── Persistence helpers ──

  async function saveGistId(id) {
    gistIdRef.value = id
    await writeSyncKey(GIST_ID_KEY, id)
  }

  async function saveImageGistId(id) {
    imageGistIdRef.value = id
    await writeSyncKey(IMAGE_GIST_ID_KEY, id)
  }

  async function saveRechargeGistId(id) {
    rechargeGistIdRef.value = id
    await writeSyncKey(RECHARGE_GIST_ID_KEY, id)
  }

  async function saveEventGistId(id) {
    eventGistIdRef.value = id
    await writeSyncKey(EVENT_GIST_ID_KEY, id)
  }

  async function writeSyncKeyVal(key, value) {
    await writeSyncKey(key, value)
  }

  function ensureAuthorized(error) {
    if (String(error?.message || '').includes('401')) {
      throw new Error(i18n.global.t('sync.error.tokenInvalid'))
    }
  }

  // ── Gist lifecycle (absorbed from syncGistService) ──

  async function ensureImageGist() {
    if (imageGistIdRef.value) {
      try {
        const existing = await getGist(tokenRef.value, imageGistIdRef.value)
        if (existing) return existing
        imageGistIdRef.value = ''
        await writeSyncKeyVal(IMAGE_GIST_ID_KEY, '')
      } catch (error) {
        ensureAuthorized(error)
      }
    }

    const desc = buildSyncDescription(deviceIdRef.value, 'image')
    let matched
    try {
      matched = await listGists(tokenRef.value, 'goods-app-images')
    } catch (e) {
      log.error('gist:image:list:failed', e)
      throw e
    }
    if (matched.length > 0) {
      await saveImageGistId(matched[0].id)
      return getGist(tokenRef.value, matched[0].id)
    }

    let created
    try {
      created = await createGist(tokenRef.value, desc, {
        'README.md': { content: '# goods-app image store\n\nThis gist stores synced local images.' }
      })
    } catch (e) {
      log.error('gist:image:create:failed', e)
      throw e
    }

    await saveImageGistId(created.id)
    return created
  }

  async function ensureRechargeGist(buildRechargeSyncData) {
    if (rechargeGistIdRef.value) {
      try {
        const existing = await getGist(tokenRef.value, rechargeGistIdRef.value)
        if (existing) return existing
        rechargeGistIdRef.value = ''
        await writeSyncKeyVal(RECHARGE_GIST_ID_KEY, '')
      } catch (error) {
        ensureAuthorized(error)
      }
    }

    const desc = buildSyncDescription(deviceIdRef.value, 'recharge')
    let matched
    try {
      matched = await listGists(tokenRef.value, 'goods-app-recharge-sync')
    } catch (e) {
      log.error('gist:recharge:list:failed', e)
      throw e
    }
    if (matched.length > 0) {
      await saveRechargeGistId(matched[0].id)
      return getGist(tokenRef.value, matched[0].id)
    }

    let legacyCandidates
    try {
      legacyCandidates = await listGists(tokenRef.value, 'goods-app-sync')
    } catch (e) {
      log.error('gist:recharge:list-legacy:failed', e)
      throw e
    }
    const legacyMatch = legacyCandidates.find((gist) => gist?.files?.[RECHARGE_DATA_FILENAME])
    if (legacyMatch) {
      await saveRechargeGistId(legacyMatch.id)
      return getGist(tokenRef.value, legacyMatch.id)
    }

    let rechargeData, created
    try {
      rechargeData = buildRechargeSyncData({ incremental: false })
      created = await createGist(tokenRef.value, desc, {
        [RECHARGE_DATA_FILENAME]: { content: JSON.stringify(rechargeData) }
      })
    } catch (e) {
      log.error('gist:recharge:create:failed', e)
      throw e
    }

    await saveRechargeGistId(created.id)
    return created
  }

  async function ensureEventGist(buildEventSyncPayload) {
    if (eventGistIdRef.value) {
      try {
        const existing = await getGist(tokenRef.value, eventGistIdRef.value)
        if (existing) return existing
        eventGistIdRef.value = ''
        await writeSyncKeyVal(EVENT_GIST_ID_KEY, '')
      } catch (error) {
        ensureAuthorized(error)
      }
    }

    const desc = buildSyncDescription(deviceIdRef.value, 'events')
    let matched
    try {
      matched = await listGists(tokenRef.value, 'goods-app-events-sync')
    } catch (e) {
      log.error('gist:event:list:failed', e)
      throw e
    }
    if (matched.length > 0) {
      await saveEventGistId(matched[0].id)
      return getGist(tokenRef.value, matched[0].id)
    }

    let existingImageGist, eventData, imageFiles
    try {
      existingImageGist = await ensureImageGist()
      const payload = await buildEventSyncPayload({ existingImageGist })
      eventData = payload.eventData
      imageFiles = payload.imageFiles
    } catch (e) {
      log.error('gist:event:build-payload:failed', e)
      throw e
    }

    if (Object.keys(imageFiles).length > 0) {
      try {
        await updateGist(tokenRef.value, existingImageGist.id, imageFiles)
      } catch (e) {
        log.error('gist:event:update-images:failed', { imageCount: Object.keys(imageFiles).length }, e)
        throw e
      }
    }

    let created
    try {
      created = await createGist(tokenRef.value, desc, {
        [EVENT_DATA_FILENAME]: { content: JSON.stringify(eventData) }
      })
    } catch (e) {
      log.error('gist:event:create:failed', e)
      throw e
    }

    await saveEventGistId(created.id)
    return created
  }

  async function ensureDataGist({ buildSyncPayload, buildRechargeSyncData, buildEventSyncPayload, buildManifest }) {
    if (gistIdRef.value) {
      try {
        const existing = await getGist(tokenRef.value, gistIdRef.value)
        if (existing) return existing
        gistIdRef.value = ''
        await writeSyncKeyVal(GIST_ID_KEY, '')
      } catch (error) {
        ensureAuthorized(error)
      }
    }

    const desc = buildSyncDescription(deviceIdRef.value)
    let matched
    try {
      matched = await listGists(tokenRef.value, 'goods-app-sync')
    } catch (e) {
      log.error('gist:data:list:failed', e)
      throw e
    }
    if (matched.length > 0) {
      await saveGistId(matched[0].id)
      const existing = await getGist(tokenRef.value, matched[0].id)
      try {
        const manifestContent = existing ? await getGistFileContent(tokenRef.value, existing, MANIFEST_FILENAME) : null
        const manifest = manifestContent ? JSON.parse(manifestContent) : null
        if (manifest?.imageGistId) {
          await saveImageGistId(manifest.imageGistId)
        }
      } catch {
        // ignore
      }
      return existing
    }

    let existingImageGist
    try {
      existingImageGist = await ensureImageGist()
    } catch (e) {
      log.error('gist:data:ensure-image:failed', e)
      throw e
    }

    let syncData, imageStats, imageFiles, rechargeSyncData, eventData
    try {
      const payload = await buildSyncPayload({ existingImageGist })
      syncData = payload.syncData
      imageStats = payload.imageStats
      imageFiles = payload.imageFiles
      rechargeSyncData = buildRechargeSyncData({ incremental: false })
      const eventPayload = await buildEventSyncPayload({ existingImageGist })
      eventData = eventPayload.eventData
    } catch (e) {
      log.error('gist:data:build-payload:failed', e)
      throw e
    }

    if (Object.keys(imageFiles).length > 0) {
      try {
        await updateGist(tokenRef.value, existingImageGist.id, imageFiles)
      } catch (e) {
        log.error('gist:data:update-images:failed', { imageCount: Object.keys(imageFiles).length }, e)
        throw e
      }
    }

    let manifest, created
    try {
      manifest = buildManifest(imageStats)
      created = await createGist(tokenRef.value, desc, {
        [DATA_FILENAME]: { content: JSON.stringify(syncData) },
        [RECHARGE_DATA_FILENAME]: { content: JSON.stringify(rechargeSyncData) },
        [EVENT_DATA_FILENAME]: { content: JSON.stringify(eventData) },
        [MANIFEST_FILENAME]: { content: JSON.stringify(manifest) }
      })
    } catch (e) {
      log.error('gist:data:create:failed', e)
      throw e
    }

    try {
      await saveGistId(created.id)
    } catch (e) {
      log.error('gist:data:save-id:failed', e)
      throw e
    }
    return created
  }

  // ── Existing Gist lookups (absorbed from syncGistService) ──

  async function getExistingImageGist(remoteManifest = null) {
    const remoteImageGistId = String(remoteManifest?.imageGistId || imageGistIdRef.value || '').trim()
    if (!remoteImageGistId) return null

    try {
      const gist = await trackSyncStep(i18n.global.t('sync.step.checkImageGist'), async () => {
        const fetched = await getGist(tokenRef.value, remoteImageGistId)
        if (fetched && remoteImageGistId !== imageGistIdRef.value) {
          await saveImageGistId(remoteImageGistId)
        }
        return fetched || null
      }, {
        startDetail: `Gist ${remoteImageGistId}`,
        category: 'image',
        successDetail: (result) => (result ? i18n.global.t('sync.step.checkImageGist.connected', { id: remoteImageGistId }) : i18n.global.t('sync.step.checkImageGist.notFound'))
      })
      return gist || null
    } catch (error) {
      ensureAuthorized(error)
      return null
    }
  }

  async function getExistingRechargeGist() {
    const targetRechargeGistId = String(rechargeGistIdRef.value || '').trim()
    if (!targetRechargeGistId) return null

    try {
      const gist = await trackSyncStep(i18n.global.t('sync.step.checkRechargeGist'), async () => {
        const fetched = await getGist(tokenRef.value, targetRechargeGistId)
        return fetched || null
      }, {
        startDetail: `Gist ${targetRechargeGistId}`,
        category: 'recharge',
        successDetail: (result) => (result ? i18n.global.t('sync.step.checkRechargeGist.connected', { id: targetRechargeGistId }) : i18n.global.t('sync.step.checkRechargeGist.notFound'))
      })
      return gist || null
    } catch (error) {
      ensureAuthorized(error)
      return null
    }
  }

  async function getExistingEventGist() {
    const targetEventGistId = String(eventGistIdRef.value || '').trim()
    if (!targetEventGistId) return null

    try {
      const gist = await trackSyncStep(i18n.global.t('sync.step.checkEventGist'), async () => {
        const fetched = await getGist(tokenRef.value, targetEventGistId)
        return fetched || null
      }, {
        startDetail: `Gist ${targetEventGistId}`,
        category: 'event',
        successDetail: (result) => (result ? i18n.global.t('sync.step.checkEventGist.connected', { id: targetEventGistId }) : i18n.global.t('sync.step.checkEventGist.notFound'))
      })
      return gist || null
    } catch (error) {
      ensureAuthorized(error)
      return null
    }
  }

  // ── Read operations (absorbed from syncStore.readJsonFromGistWithTrace) ──

  async function readJson({
    title,
    gist,
    fileName,
    startDetail = '',
    category = '',
    required = false,
    missingMessage = '',
    fallbackGist = null,
    fallbackFileName = fileName,
    successDetail = null
  }) {
    const result = await trackSyncStep(title, async () => {
      let content = await withRetry(() => getGistFileContent(tokenRef.value, gist, fileName))
      let source = i18n.global.t('sync.source.mainGist')

      if (!content && fallbackGist) {
        content = await withRetry(() => getGistFileContent(tokenRef.value, fallbackGist, fallbackFileName))
        source = i18n.global.t('sync.source.fallbackGist')
      }

      if (!content) {
        if (required) {
          throw new Error(missingMessage || i18n.global.t('sync.error.fileNotFound', { fileName }))
        }
        return null
      }

      let parsed
      if (isEncrypted(content)) {
        log.debug('data:decrypt:detected', { fileName, source })
        const key = await ensureEncryptionKey()
        if (!key) {
          throw new Error(i18n.global.t('sync.error.encryptionKeyMissing'))
        }
        const decrypted = await decrypt(content, key)
        try {
          parsed = JSON.parse(decrypted)
        } catch (e) {
          throw new Error(i18n.global.t('sync.error.decryptJsonFailed', { fileName, error: e.message }))
        }
        log.debug('data:decrypt:done', { fileName, source })
      } else {
        try {
          parsed = JSON.parse(content)
        } catch (e) {
          throw new Error(i18n.global.t('sync.error.jsonParseFailed', { fileName, error: e.message }))
        }
      }

      return {
        parsed,
        source
      }
    }, {
      startDetail,
      category,
      successDetail: (value) => {
        if (!successDetail) return ''
        return successDetail(value?.parsed ?? null, value?.source || i18n.global.t('sync.source.mainGist'))
      }
    })

    return result?.parsed ?? null
  }

  async function readImage(gist, fileName) {
    const content = await withRetry(() => getGistFileContent(tokenRef.value, gist, fileName))
    if (!content) return null

    if (isEncrypted(content)) {
      const key = ensureEncryptionKey ? await ensureEncryptionKey() : null
      if (key) {
        return await decrypt(content, key)
      }
    }
    return content
  }

  // ── Write operations (absorbed from syncExecutionService) ──

  async function writeData(gistId, dataMap) {
    const processedMap = {}
    for (const [fileName, entry] of Object.entries(dataMap)) {
      if (fileName === MANIFEST_FILENAME) {
        // manifest.json must always be plaintext — sync reads it before decryption
        processedMap[fileName] = { content: JSON.stringify(entry.content) }
      } else {
        processedMap[fileName] = { content: await encryptContentIfNeeded(entry.content, fileName) }
      }
    }
    return withRetry(() => updateGist(tokenRef.value, gistId, processedMap))
  }

  async function writeImages(gistId, imageFiles) {
    if (!imageFiles || Object.keys(imageFiles).length === 0) return

    const BATCH_SIZE = 30
    const MAX_CONCURRENT = 3
    const entries = Object.entries(imageFiles)
    const totalBatches = Math.ceil(entries.length / BATCH_SIZE)

    const batches = []
    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      batches.push({
        batch: entries.slice(i, i + BATCH_SIZE),
        batchNum: Math.floor(i / BATCH_SIZE) + 1
      })
    }

    await trackSyncStep(i18n.global.t('sync.step.uploadImageGist', { batches: totalBatches }), async () => {
      for (let i = 0; i < batches.length; i += MAX_CONCURRENT) {
        const chunk = batches.slice(i, i + MAX_CONCURRENT)
        const results = await Promise.allSettled(chunk.map(async ({ batch }) => {
          let encryptedBatch = Object.fromEntries(batch)
          if (encryptionEnabledRef?.value && ensureEncryptionKey) {
            try {
              const key = await ensureEncryptionKey()
              if (key) {
                encryptedBatch = {}
                for (const [fileName, fileObj] of batch) {
                  if (!fileObj) {
                    encryptedBatch[fileName] = null
                  } else if (fileObj.content && typeof fileObj.content === 'string') {
                    encryptedBatch[fileName] = { content: await encrypt(fileObj.content, key) }
                  } else {
                    encryptedBatch[fileName] = fileObj
                  }
                }
              }
            } catch (e) {
              log.warn('image:encrypt:failed-plaintext-upload', { batchSize: batch.length }, e)
            }
          }
          return withRetry(() => updateGist(tokenRef.value, gistId, encryptedBatch))
        }))
        const failures = results.filter(r => r.status === 'rejected')
        if (failures.length > 0) {
          log.error('image:batch-upload:failed', {
            failed: failures.length,
            total: chunk.length
          }, failures.map(r => r.reason))
        }
      }
      return i18n.global.t('sync.step.uploadImageGist.batchDone', { batches: totalBatches })
    }, {
      startDetail: i18n.global.t('sync.step.uploadImageGist.start', { batches: totalBatches, batchSize: BATCH_SIZE, concurrent: MAX_CONCURRENT }),
      category: 'image',
      successDetail: () => i18n.global.t('sync.step.uploadImageGist.success')
    })
  }

  async function getManifest(gist) {
    try {
      const content = await withRetry(() => getGistFileContent(tokenRef.value, gist, MANIFEST_FILENAME))
      return content ? JSON.parse(content) : null
    } catch {
      return null
    }
  }

  function isEncryptionEnabled() {
    return !!(encryptionEnabledRef?.value)
  }

  function getDataGistId() {
    return gistIdRef.value
  }

  async function getDataGist() {
    if (!gistIdRef.value) return null
    return getGist(tokenRef.value, gistIdRef.value)
  }

  // ── Internal helpers ──

  async function encryptContentIfNeeded(data, fileName = '') {
    if (!encryptionEnabledRef?.value || !ensureEncryptionKey) return JSON.stringify(data)
    try {
      const key = await ensureEncryptionKey()
      if (!key) return JSON.stringify(data)
      log.debug('data:encrypt:done', { fileName })
      return await encrypt(data, key)
    } catch (e) {
      log.warn('data:encrypt:failed-plaintext-upload', { fileName }, e)
      return JSON.stringify(data)
    }
  }

  // ── Unified domain interface (thin wrappers over readJson/writeData) ──

  async function readDomainRows(domain, { since = 0 } = {}) {
    // Gist doesn't support incremental reads — always read full JSON
    const gist = await getDataGist()
    if (!gist) return domain === 'goods' ? { goods: [], trash: [] } : domain === 'recharge' ? { recharge: [], rechargeTrash: [] } : []

    if (domain === 'goods') {
      const parsed = await readJson({ title: 'read goods', gist, fileName: DATA_FILENAME })
      return { goods: parsed?.goods || [], trash: parsed?.trash || [] }
    }
    if (domain === 'recharge') {
      const existingRechargeGist = await getExistingRechargeGist()
      const parsed = await readJson({ title: 'read recharge', gist, fileName: RECHARGE_DATA_FILENAME, fallbackGist: existingRechargeGist, fallbackFileName: RECHARGE_DATA_FILENAME })
      return parsed ? { recharge: parsed.recharge || [], rechargeTrash: parsed.rechargeTrash || [] } : { recharge: [], rechargeTrash: [] }
    }
    if (domain === 'events') {
      const existingEventGist = await getExistingEventGist()
      const parsed = await readJson({ title: 'read events', gist, fileName: EVENT_DATA_FILENAME, fallbackGist: existingEventGist, fallbackFileName: EVENT_DATA_FILENAME })
      return parsed?.events || []
    }
    if (domain === 'groups') {
      const parsed = await readJson({ title: 'read groups', gist, fileName: DATA_FILENAME })
      return parsed?.goodsGroups || []
    }
    if (domain === 'groupItems') {
      const parsed = await readJson({ title: 'read group items', gist, fileName: DATA_FILENAME })
      return parsed?.goodsGroupItems || []
    }
    return []
  }

  async function writeDomainRows(domain, { localItems = [] } = {}) {
    const gistId = getDataGistId()
    if (!gistId) throw new Error('No data gist configured')

    if (domain === 'goods') {
      const dataMap = { [DATA_FILENAME]: { content: { goods: localItems, trash: [] } } }
      await writeData(gistId, dataMap)
      return
    }
    if (domain === 'recharge') {
      const dataMap = { [RECHARGE_DATA_FILENAME]: { content: { recharge: localItems, rechargeTrash: [] } } }
      await writeData(gistId, dataMap)
      return
    }
    if (domain === 'events') {
      const dataMap = { [EVENT_DATA_FILENAME]: { content: { events: localItems } } }
      await writeData(gistId, dataMap)
      return
    }
    // groups/groupItems are stored inside data.json — not supported as separate writes
  }

  return createSyncBackendAdapter({
    ensureDataGist,
    ensureImageGist,
    ensureRechargeGist,
    ensureEventGist,
    getExistingImageGist,
    getExistingRechargeGist,
    getExistingEventGist,
    readJson,
    readImage,
    writeData,
    writeImages,
    getManifest,
    isEncryptionEnabled,
    getDataGistId,
    getDataGist,
    readDomainRows,
    writeDomainRows
  })
}
