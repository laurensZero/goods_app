export function createSyncGistService({
  tokenRef,
  gistIdRef,
  imageGistIdRef,
  rechargeGistIdRef,
  eventGistIdRef,
  deviceIdRef,
  constants,
  trackSyncStep,
  createGist,
  getGist,
  updateGist,
  listGists,
  getGistFileContent,
  buildSyncDescription,
  writeSyncKey,
  saveGistId,
  saveImageGistId,
  saveRechargeGistId,
  saveEventGistId,
  saveLastSyncedAt,
  buildSyncPayload,
  buildRechargeSyncData,
  buildEventSyncPayload,
  buildManifest
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

  function ensureAuthorized(error) {
    if (String(error?.message || '').includes('401')) {
      throw new Error('Token 无效或已过期，请重新配置')
    }
  }

  async function ensureImageGist() {
    if (imageGistIdRef.value) {
      try {
        const existing = await getGist(tokenRef.value, imageGistIdRef.value)
        if (existing) return existing
        imageGistIdRef.value = ''
        await writeSyncKey(IMAGE_GIST_ID_KEY, '')
      } catch (error) {
        ensureAuthorized(error)
      }
    }

    const desc = buildSyncDescription(deviceIdRef.value, 'image')
    let matched
    try {
      matched = await listGists(tokenRef.value, 'goods-app-images')
    } catch (e) {
      console.error('[sync] ensureImageGist: listGists failed:', e)
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
      console.error('[sync] ensureImageGist: createGist failed:', e)
      throw e
    }

    await saveImageGistId(created.id)
    return created
  }

  async function ensureRechargeGist() {
    if (rechargeGistIdRef.value) {
      try {
        const existing = await getGist(tokenRef.value, rechargeGistIdRef.value)
        if (existing) return existing
        rechargeGistIdRef.value = ''
        await writeSyncKey(RECHARGE_GIST_ID_KEY, '')
      } catch (error) {
        ensureAuthorized(error)
      }
    }

    const desc = buildSyncDescription(deviceIdRef.value, 'recharge')
    let matched
    try {
      matched = await listGists(tokenRef.value, 'goods-app-recharge-sync')
    } catch (e) {
      console.error('[sync] ensureRechargeGist: listGists failed:', e)
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
      console.error('[sync] ensureRechargeGist: listGists (legacy) failed:', e)
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
      console.error('[sync] ensureRechargeGist: createGist failed:', e)
      throw e
    }

    await saveRechargeGistId(created.id)
    return created
  }

  async function ensureEventGist() {
    if (eventGistIdRef.value) {
      try {
        const existing = await getGist(tokenRef.value, eventGistIdRef.value)
        if (existing) return existing
        eventGistIdRef.value = ''
        await writeSyncKey(EVENT_GIST_ID_KEY, '')
      } catch (error) {
        ensureAuthorized(error)
      }
    }

    const desc = buildSyncDescription(deviceIdRef.value, 'events')
    let matched
    try {
      matched = await listGists(tokenRef.value, 'goods-app-events-sync')
    } catch (e) {
      console.error('[sync] ensureEventGist: listGists failed:', e)
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
      console.error('[sync] ensureEventGist: buildEventSyncPayload failed:', e)
      throw e
    }

    if (Object.keys(imageFiles).length > 0) {
      try {
        await updateGist(tokenRef.value, existingImageGist.id, imageFiles)
      } catch (e) {
        console.error('[sync] ensureEventGist: updateGist (images) failed:', e)
        throw e
      }
    }

    let created
    try {
      created = await createGist(tokenRef.value, desc, {
        [EVENT_DATA_FILENAME]: { content: JSON.stringify(eventData) }
      })
    } catch (e) {
      console.error('[sync] ensureEventGist: createGist failed:', e)
      throw e
    }

    await saveEventGistId(created.id)
    return created
  }

  async function ensureGist() {
    if (gistIdRef.value) {
      try {
        const existing = await getGist(tokenRef.value, gistIdRef.value)
        if (existing) return existing
        gistIdRef.value = ''
        await writeSyncKey(GIST_ID_KEY, '')
      } catch (error) {
        ensureAuthorized(error)
      }
    }

    const desc = buildSyncDescription(deviceIdRef.value)
    let matched
    try {
      matched = await listGists(tokenRef.value, 'goods-app-sync')
    } catch (e) {
      console.error('[sync] ensureGist: listGists failed:', e)
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
      console.error('[sync] ensureGist: ensureImageGist failed:', e)
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
      console.error('[sync] ensureGist: buildSyncPayload failed:', e)
      throw e
    }

    if (Object.keys(imageFiles).length > 0) {
      try {
        await updateGist(tokenRef.value, existingImageGist.id, imageFiles)
      } catch (e) {
        console.error('[sync] ensureGist: updateGist (images) failed:', e)
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
      console.error('[sync] ensureGist: createGist failed:', e)
      throw e
    }

    try {
      await saveGistId(created.id)
      await saveLastSyncedAt(manifest.lastSyncAt)
    } catch (e) {
      console.error('[sync] ensureGist: saveGistId/saveLastSyncedAt failed:', e)
      throw e
    }
    return created
  }

  async function getExistingImageGist(remoteManifest = null) {
    const remoteImageGistId = String(remoteManifest?.imageGistId || imageGistIdRef.value || '').trim()
    if (!remoteImageGistId) return null

    try {
      const gist = await trackSyncStep('检查图片 Gist', async () => {
        const fetched = await getGist(tokenRef.value, remoteImageGistId)
        if (fetched && remoteImageGistId !== imageGistIdRef.value) {
          await saveImageGistId(remoteImageGistId)
        }
        return fetched || null
      }, {
        startDetail: `Gist ${remoteImageGistId}`,
        category: 'image',
        successDetail: (result) => (result ? `已连接 ${remoteImageGistId}` : '未找到图片 Gist')
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
      const gist = await trackSyncStep('检查充值 Gist', async () => {
        const fetched = await getGist(tokenRef.value, targetRechargeGistId)
        return fetched || null
      }, {
        startDetail: `Gist ${targetRechargeGistId}`,
        category: 'recharge',
        successDetail: (result) => (result ? `已连接 ${targetRechargeGistId}` : '未找到充值 Gist')
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
      const gist = await trackSyncStep('检查活动 Gist', async () => {
        const fetched = await getGist(tokenRef.value, targetEventGistId)
        return fetched || null
      }, {
        startDetail: `Gist ${targetEventGistId}`,
        category: 'event',
        successDetail: (result) => (result ? `已连接 ${targetEventGistId}` : '未找到活动 Gist')
      })
      return gist || null
    } catch (error) {
      ensureAuthorized(error)
      return null
    }
  }

  return {
    ensureImageGist,
    ensureRechargeGist,
    ensureEventGist,
    ensureGist,
    getExistingImageGist,
    getExistingRechargeGist,
    getExistingEventGist
  }
}
