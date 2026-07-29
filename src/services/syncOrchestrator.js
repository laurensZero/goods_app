// src/services/syncOrchestrator.js
// Stateless sync orchestrator — coordinates pull/push via pipeline functions.
// The store only manages state/persistence and delegates to this.

import { buildImageSyncStats, collectReferencedImageState, countWishlistSplit, getItemTimestamp, normalizeBudgetValue, getLatestRechargeTimestamp, shouldPullRechargeByManifest, readBudgetSettings, toTimestampMs } from '@/utils/sync/shared'
import { compareStateSync } from '@/utils/sync/stateCompare'
import { wrapSyncError, PHASE_READ_MANIFEST, PHASE_READ_REMOTE, PHASE_PULL, PHASE_PUSH, PHASE_WRITE_DATA } from './syncError'
import { readRemoteData, diffLocalRemote, hydrateRemoteImages, mergeToLocal } from './syncPullPipeline'
import { buildPayloadAndUploadImages, buildManifest, writeRemoteData, updateLocalRefs } from './syncPushPipeline'
import { flushDbWrites, saveItems, saveEvents, saveGroups, saveGroupItems, saveRechargeRecords } from '@/utils/db'
import { writePersistedTrash } from '@/stores/goodsPersistence'
import { PULL_CLOCK_OVERLAP_MS } from '@/constants/syncConstants'

// 增量拉取的 since 回退一个重叠窗口，吸收设备间时钟偏移（行内 updated_at 为客户端时间）；
// 保持 > 0 以免退化判定被翻转，合并是幂等 LWW，多拉无害
function sinceWithOverlap(sinceMs) {
  return sinceMs > 0 ? Math.max(1, sinceMs - PULL_CLOCK_OVERLAP_MS) : 0
}
import { createLogger } from '@/utils/logger'
import i18n from '@/locales'

const log = createLogger('sync:orchestrator')

// ── crash-safe push：pending-push 标记 ──
// 写远端前持久化标记（ctx 内存 + 存储），推送完整落盘（本地水位线已保存）后清除

async function setPendingPush(ctx, marker) {
  ctx.pendingPush = marker
  if (ctx.savePendingPush) await ctx.savePendingPush(marker)
}

async function dropPendingPush(ctx) {
  ctx.pendingPush = null
  if (ctx.clearPendingPush) await ctx.clearPendingPush()
}

// ── 服务器域水位线（最后已见 manifest synced_at）──
// 行域 lastSyncedAt（拉到行的最大 updated_at，推送方客户端时间域）只作增量拉取的 since；
// 与 manifest.synced_at（服务器时间域）比较大小必须用本水位线：跨域混比在时钟偏移下
// 会把「增量拉取已合并对方推送」的正常状态误判为 remote-ahead / 冲突

function getServerSyncTimeMs(ctx) {
  const ms = toTimestampMs(ctx.lastServerSyncedAt)
  if (ms > 0) return ms
  // 老版本升级：新键尚不存在时回退行域水位线，等价于拆分前行为
  return ctx.lastSyncedAt ? new Date(ctx.lastSyncedAt).getTime() : 0
}

async function saveServerWatermark(ctx, timestamp) {
  if (!timestamp || !ctx.saveLastServerSyncedAt) return
  await ctx.saveLastServerSyncedAt(timestamp)
  ctx.lastServerSyncedAt = timestamp
}

// 中断推送恢复：上次推送若已写入远端但进程在本地水位线保存前被杀，
// 远端清单的最后写入者仍是本设备且时间戳不早于标记时间，说明推送实际已成功，
// 快进本地水位线以复现完整推送的落盘结果，避免下次同步把自己的推送误报为冲突。
// 任何情况下都清除标记：未命中时行为退化为现状（零回归风险）。
export async function reconcilePendingPush(ctx, remoteManifest) {
  const marker = ctx.pendingPush
  if (!marker || !marker.ts) return false

  let recovered = false
  // 用 toTimestampMs 比较：Postgres 回传的 ISO 串是 '+00:00' 形式，字符串比较会失配
  const markerMs = toTimestampMs(marker.ts)
  const remoteMs = toTimestampMs(remoteManifest?.lastSyncAt)
  const remoteDevice = String(remoteManifest?.deviceId || '')
  const sameDevice = remoteDevice !== '' && remoteDevice === String(marker.deviceId || '')
  const localMs = ctx.lastSyncedAt ? new Date(ctx.lastSyncedAt).getTime() : 0
  // 不与 marker 时间比较大小：远端 synced_at 已改为服务器时间，本设备时钟偏快时
  // remote < marker 属正常。标记存在 + 最后写入者是本设备 + 远端晚于本地水位线，即可判定推送已生效
  if (sameDevice && remoteMs > 0 && markerMs > 0 && remoteMs > localMs) {
    await ctx.saveLastSyncedAt(remoteManifest.lastSyncAt)
    if (marker.eventTs) await ctx.saveEventLastSyncedAt(marker.eventTs)
    // 同步修改 ctx，让同一次运行内后续的 localSyncTime 计算立即看到新水位线
    ctx.lastSyncedAt = remoteManifest.lastSyncAt
    await saveServerWatermark(ctx, remoteManifest.lastSyncAt)
    log.warn('recovered interrupted push, fast-forwarded watermark to', remoteManifest.lastSyncAt)
    recovered = true
  }
  await dropPendingPush(ctx)
  return recovered
}

export function createSyncOrchestrator({
  backend,
  payload,
  image,
  conflict,
  useGoodsStore,
  useRechargeStore,
  useEventsStore,
  usePresetsStore,
  useGoodsGroupStore,
  trackSyncStep,
  userIdRef
}) {
  // ── Helpers ──

  function getLocalStores() {
    return {
      goodsStore: useGoodsStore(),
      rechargeStore: useRechargeStore(),
      eventsStore: useEventsStore(),
      goodsGroupStore: useGoodsGroupStore(),
      presetsStore: usePresetsStore()
    }
  }

  // ── pull() — unified pull entry point ──

  async function pull(ctx, opts = {}) {
    const { tables, since = 0, silent = false, forceRecharge = false } = opts
    const be = ctx.backend || backend
    const stores = getLocalStores()
    const isIncremental = since > 0 && !!be.pullAll
    log.info('pull:start', { incremental: isIncremental, since, silent, tables: tables || 'all' })

    try {
      // 1. Read remote data
      // 拉取开始时刻：reader 对 NULL updated_at 的 Date.now() 回退值恒晚于它，
      // mergeToLocal 据此把这类回退值排除在水位线统计外
      const pullStartMs = Date.now()
      const remoteData = await readRemoteData(be, {
        since: sinceWithOverlap(since),
        trackSyncStep
      })

      if (remoteData.manifest?.imageCloudId) {
        await ctx.saveImageCloudId(remoteData.manifest.imageCloudId)
      }

      // 中断推送恢复：上次推送若已写入远端但本地水位线未保存，先快进水位线避免误报冲突
      if (!isIncremental && remoteData.manifest) await reconcilePendingPush(ctx, remoteData.manifest)

      // 2. Incremental mode: direct merge, skip diff/conflict
      if (isIncremental) {
        // 用合并返回的实际落库计数（而非拉取行数）驱动结果提示：
        // 重叠窗口重复拉到的已合并行是幂等空操作，不应计入
        let pullCounts = null
        let remoteWatermark = 0
        await trackSyncStep(
          i18n.global.t('sync.phase.pull'),
          async () => {
            const merged = await mergeToLocal(stores, remoteData, { reconcileMissing: false, pullStartMs })
            pullCounts = merged.counts
            remoteWatermark = merged.remoteWatermark
          },
          {
            startDetail: i18n.global.t('sync.step.readData.startIncremental'),
            category: 'pull',
            successDetail: () => `✓ ${sumPullCounts(pullCounts)} items merged`
          }
        )
        // Web 端确保拉取合并结果落盘后再推进水位线
        await flushDbWrites().catch(() => {})
        // 水位线必须与 sync_pull 的比较列（行内 updated_at，推送方客户端时间域）同域：
        // 用拉到行的最大 updated_at 推进。清单 synced_at 是服务器时间域、new Date() 是
        // 本机时间域，跨域取值在时钟偏移下会令水位线超前而漏拉；无新行时不推进（只进不退）
        // 上限钳制：时钟偏快的设备会把行 updated_at 推到未来，未钳制会令本机水位线
        // 永久超前、跳过其他正常设备的行；钳到清单 synced_at（服务器域），
        // 拿不到清单时退用本机 now + 时钟容差
        const watermarkCapMs = toTimestampMs(remoteData.manifest?.lastSyncAt) || (Date.now() + PULL_CLOCK_OVERLAP_MS)
        if (remoteWatermark > watermarkCapMs) remoteWatermark = watermarkCapMs
        const prevWatermarkMs = ctx.lastSyncedAt ? new Date(ctx.lastSyncedAt).getTime() : 0
        if (remoteWatermark > prevWatermarkMs) {
          const ts = new Date(remoteWatermark).toISOString()
          await ctx.saveLastSyncedAt(ts)
          if (remoteData.events.length > 0) await ctx.saveEventLastSyncedAt(ts)
        }
        // 服务器域水位线推进到本次已见的 manifest synced_at，
        // 让后续 quickPush / fullSync 的 remote-ahead 判定不再误报
        await saveServerWatermark(ctx, remoteData.manifest?.lastSyncAt)
        if (sumPullCounts(pullCounts) === 0) {
          log.info('pull:done', { action: 'no_changes', incremental: true })
          return { action: 'no_changes' }
        }
        log.info('pull:done', { action: 'pulled', incremental: true, ...pullCounts })
        return { action: 'pulled', ...pullCounts }
      }

      // 3. Full mode: diff
      const diff = diffLocalRemote(stores, remoteData)
      if (!diff.hasChanges) {
        await ctx.saveLastSyncedAt(remoteData.manifest?.lastSyncAt || new Date().toISOString())
        await saveServerWatermark(ctx, remoteData.manifest?.lastSyncAt)
        return { action: 'no_changes', ...conflict.getLocalChangesSince(remoteData.manifest?.lastSyncAt ? new Date(remoteData.manifest.lastSyncAt).getTime() : 0) }
      }

      // 4. Conflict detection (non-silent only)
      const localSyncTime = ctx.lastSyncedAt ? new Date(ctx.lastSyncedAt).getTime() : 0
      const localChanges = conflict.getLocalChangesSince(localSyncTime)
      if (!silent && localChanges.hasChanges) {
        log.warn('pull:conflict', { localSyncTime, remoteTime: remoteData.manifest?.lastSyncAt, remoteDevice: remoteData.manifest?.deviceId })
        return {
          action: 'conflict', statusMessage: 'sync.remoteDataDetected',
          conflictData: {
            remoteTime: remoteData.manifest?.lastSyncAt, remoteDevice: remoteData.manifest?.deviceId,
            localTime: ctx.lastSyncedAt, localModifiedTime: ctx.getLatestLocalModifiedAt(),
            ...buildConflictCounts(stores, remoteData, diff), isPullOnly: true
          }
        }
      }

      // 5. Hydrate images + merge
      let restoredCount = 0
      let pullCounts = null
      await trackSyncStep(
        i18n.global.t('sync.step.restoreCollectionImages'),
        async () => {
          // 预热云端文件列表缓存：getImagePublicUrl 依赖它区分
          // 用户目录新文件与根目录旧文件，冷缓存会生成指错位置的 URL
          if (be.getExistingImageCloud) await be.getExistingImageCloud().catch(() => {})
          const imgStats = await hydrateRemoteImages(image, be, remoteData, diff)
          restoredCount = imgStats?.restoredImages || 0
          const merged = await mergeToLocal(stores, remoteData, {
            reconcileMissing: !remoteData.isIncremental, diff,
            shouldApplyRemoteItem: ctx.shouldApplyRemoteItem,
            localSyncTime,
            dirtyGoodsIds: ctx.getDirtyGoodsIds
          })
          pullCounts = merged.counts
          if (be.getImagePublicUrl) {
            const { cleanupBase64Images } = await import('@/stores/goodsSync')
            await cleanupBase64Images(stores.goodsStore.list, stores.goodsStore.trashList, be).catch(() => {})
          }
        },
        {
          startDetail: i18n.global.t('sync.step.restoreCollectionImages.start'),
          category: 'image',
          successDetail: () => i18n.global.t('sync.step.restoreCollectionImages.success', { count: restoredCount })
        }
      )
      await flushDbWrites().catch(() => {})
      if (remoteData.manifest?.lastSyncAt) await ctx.saveLastSyncedAt(remoteData.manifest.lastSyncAt)
      await saveServerWatermark(ctx, remoteData.manifest?.lastSyncAt)
      log.info('pull:done', { action: 'pulled', restoredImages: restoredCount, ...pullCounts })
      return { action: 'pulled', ...pullCounts }
    } catch (e) {
      log.error('pull:failed', e)
      wrapSyncError(e, PHASE_PULL)
    }
  }

  // ── sync() — unified sync entry point ──

  async function sync(ctx, opts = {}) {
    const { dirtyDomains, dirtyGoodsIds, source } = opts
    const be = ctx.backend || backend
    const stores = getLocalStores()
    await ctx.ensureEventsStoreReady()
    log.info('sync:start', {
      source: source || 'unknown',
      dirtyDomains: dirtyDomains ? [...dirtyDomains] : null,
      dirtyGoodsCount: dirtyGoodsIds ? dirtyGoodsIds.size : 0
    })

    try {
      // Quick push path: single goods edit, no remote read needed
      if (canQuickPush(be, dirtyGoodsIds, dirtyDomains)) {
        try {
          const result = await quickPush(ctx, dirtyGoodsIds)
          log.info('sync:quick-push:done', { pushedItems: result.pushedItems, pushedTrash: result.pushedTrash })
          return result
        } catch (e) {
          log.warn('quickPush failed, falling back to full sync', e.message)
          // Fall through to full sync
        }
      }

      return await fullSync(ctx, stores, be, opts)
    } catch (e) {
      log.error('sync:failed', e)
      wrapSyncError(e, PHASE_PUSH)
    }
  }

  function canQuickPush(be, dirtyGoodsIds, dirtyDomains) {
    return be.pushAll
      && dirtyGoodsIds && dirtyGoodsIds.size > 0
      && dirtyDomains && dirtyDomains.size <= 1 && dirtyDomains.has('goods')
  }

  // ── Quick push: direct upsert of specific dirty goods ──

  async function quickPush(ctx, dirtyIds) {
    const be = ctx.backend || backend
    const goodsStore = useGoodsStore()

    const itemsToPush = []
    const trashToPush = []
    for (const id of dirtyIds) {
      const item = goodsStore.list.find(g => g.id === id)
      if (item) { itemsToPush.push(item); continue }
      const trashItem = goodsStore.trashList.find(g => g.id === id)
      if (trashItem) trashToPush.push(trashItem)
    }

    if (itemsToPush.length === 0 && trashToPush.length === 0) {
      throw new Error('QUICK_PUSH_ITEMS_NOT_FOUND')
    }

    // Check for local-only images
    for (const item of [...itemsToPush, ...trashToPush]) {
      if (!Array.isArray(item.images)) continue
      for (const img of item.images) {
        const uri = String(img?.uri || '')
        const mode = String(img?.storageMode || '')
        if (mode === 'linked-local' || mode === 'inline-local' || mode === 'cloud-local' || mode === 'gist-local'
          || uri.startsWith('data:image/') || uri.startsWith('blob:') || uri.startsWith('file:')
          || uri.includes('localhost')) {
          throw new Error('QUICK_PUSH_HAS_LOCAL_IMAGES')
        }
      }
    }

    const db = be.getDb()
    const currentDeviceId = ctx.deviceId || ''

    // Read existing manifest for non-count fields (image_bucket, timestamps, budget)
    let existingManifest = null
    try {
      const uid = typeof userIdRef === 'function' ? userIdRef() : ''
      const { data, error } = await db.from('sync_manifest').select('*').eq('user_id', uid).limit(1)
      if (error) throw error
      if (data && data.length > 0) existingManifest = data[0]
    } catch {
      // 读不到清单就无法确认远端状态，降级走 fullSync（自带重试与冲突检测）
      throw new Error('QUICK_PUSH_MANIFEST_READ_FAILED')
    }

    // 远端清单时间领先「最后已见 manifest」水位线：其他设备已推送而本机尚未拉取，
    // 此时推送并快进水位线会越过对方的行、造成永久漏拉 —— 降级走 fullSync 先比对再推送。
    // 必须同为服务器时间域比较：行域水位线恒早于 manifest.synced_at，混比会常态化误降级
    const remoteSyncedMs = toTimestampMs(existingManifest?.synced_at)
    const localWatermarkMs = getServerSyncTimeMs(ctx)
    if (remoteSyncedMs > localWatermarkMs) {
      throw new Error('QUICK_PUSH_REMOTE_AHEAD')
    }

    // Single RPC: push items + presets + manifest
    const syncTimestamp = new Date().toISOString()
    let presetsData = null
    try { presetsData = await ctx.buildPresetsData() } catch { /* non-fatal */ }

    // crash-safe：先持久化 pending-push 标记再写远端
    await setPendingPush(ctx, { ts: syncTimestamp, deviceId: currentDeviceId })

    const pushResult = await be.pushAll({
      goods: itemsToPush,
      goodsTrash: trashToPush,
      presets: presetsData,
      deviceId: currentDeviceId,
      syncedAt: syncTimestamp,
      imageBucket: existingManifest?.image_bucket ?? 'goods-images',
      rechargeUpdatedAt: existingManifest?.recharge_updated_at ?? null,
      eventUpdatedAt: existingManifest?.event_updated_at ?? null,
      budgetMonthly: existingManifest?.budget_monthly ?? 0,
      budgetYearly: existingManifest?.budget_yearly ?? 0
    })

    // 水位线优先用服务器侧 synced_at（新版 RPC 返回），消除设备时钟偏移
    await ctx.saveLastSyncedAt(pushResult?.syncedAt || syncTimestamp)
    await saveServerWatermark(ctx, pushResult?.syncedAt || syncTimestamp)
    await dropPendingPush(ctx)

    return { action: 'pushed', pushedItems: itemsToPush.length, pushedTrash: trashToPush.length }
  }

  // ── Full sync: read remote → compare → push or pull ──

  async function fullSync(ctx, stores, be, opts = {}) {
    const { dirtyDomains, dirtyGoodsIds } = opts
    const dirty = dirtyDomains
    const isRechargeDirty = !dirty || dirty.has('recharge')
    const isEventsDirty = !dirty || dirty.has('events')
    const isGoodsDirty = !dirty || dirty.has('goods') || dirty.has('presets') || dirty.has('group')
    const isPresetsDirty = !dirty || dirty.has('presets')
    const isBudgetDirty = !dirty || dirty.has('budget')
    const hasDirtyGoodsIds = dirtyGoodsIds && dirtyGoodsIds.size > 0

    // 1. Read manifest — 直查 sync_manifest（manifest-only），
    // 避免 sync_pull 以 since=0 全量拉整库后只留清单丢弃数据行
    let remoteManifest
    try {
      remoteManifest = be.readManifest
        ? await be.readManifest()
        : (await readRemoteData(be, { trackSyncStep })).manifest
    } catch (e) { wrapSyncError(e, PHASE_READ_MANIFEST) }
    if (remoteManifest?.imageCloudId) await ctx.saveImageCloudId(remoteManifest.imageCloudId)

    // 中断推送恢复（crash-safe push）
    await reconcilePendingPush(ctx, remoteManifest)

    // 2. Read remote data (incremental — only changed since last sync)
    const localSyncTime = ctx.lastSyncedAt ? new Date(ctx.lastSyncedAt).getTime() : 0

    let remoteData
    try {
      remoteData = await readRemoteData(be, {
        since: sinceWithOverlap(localSyncTime),
        trackSyncStep
      })
    } catch (e) { wrapSyncError(e, PHASE_READ_REMOTE) }
    remoteData.manifest = remoteManifest

    // 3. Compare
    const remoteTime = remoteManifest?.lastSyncAt ? new Date(remoteManifest.lastSyncAt).getTime() : 0
    // 分支判定用服务器域水位线：remoteTime 是 manifest.synced_at（服务器时间域），
    // 与行域 localSyncTime 混比会把增量拉取后的正常状态误判为远端领先
    const serverSyncTime = getServerSyncTimeMs(ctx)
    const localChanges = conflict.getLocalChangesSince(localSyncTime)

    let hasDataDiff = hasDirtyGoodsIds
    let goodsDiff = null
    if (isGoodsDirty && !hasDirtyGoodsIds) {
      goodsDiff = diffLocalRemote(stores, remoteData, { incremental: remoteData.isIncremental })
      hasDataDiff = goodsDiff.hasChanges
    }
    const hasRechargeDataDiff = isRechargeDirty
      ? (() => {
          const allLocal = stores.rechargeStore.exportBackup({ includeDeleted: true, stripImage: false }) || []
          const localActive = allLocal.filter(r => !r.deleted)
          const localTrash = allLocal.filter(r => r.deleted)
          return compareStateSync(localActive, remoteData.recharge || [], { incremental: false }).hasChanges
            || compareStateSync(localTrash, remoteData.rechargeTrash || [], { incremental: false }).hasChanges
        })()
      : false
    const hasEventDataDiff = isEventsDirty
      ? (() => {
          const allEvents = stores.eventsStore.list || []
          const localActive = allEvents.filter(e => !e.deleted)
          const localTrash = allEvents.filter(e => e.deleted)
          return compareStateSync(localActive, remoteData.events || [], { incremental: false }).hasChanges
            || compareStateSync(localTrash, remoteData.eventsTrash || [], { incremental: false }).hasChanges
        })()
      : false
    const localBudgetSettings = isBudgetDirty ? await readBudgetSettings() : null
    const hasBudgetDiff = isBudgetDirty && localBudgetSettings && (
      normalizeBudgetValue(localBudgetSettings.monthly) !== normalizeBudgetValue(remoteManifest?.budgetMonthly)
      || normalizeBudgetValue(localBudgetSettings.yearly) !== normalizeBudgetValue(remoteManifest?.budgetYearly)
    )
    let hasPresetsDiff = false
    if (isPresetsDirty && remoteData.presets) {
      try {
        const localPresets = await ctx.buildPresetsData()
        hasPresetsDiff = JSON.stringify(localPresets) !== JSON.stringify(remoteData.presets)
      } catch { hasPresetsDiff = true }
    }
    const hasEffectiveDiff = hasDataDiff || hasRechargeDataDiff || hasEventDataDiff || hasBudgetDiff || hasPresetsDiff
    log.info('sync:compare', {
      hasDataDiff, hasRechargeDataDiff, hasEventDataDiff, hasBudgetDiff, hasPresetsDiff,
      remoteTime, localSyncTime, serverSyncTime, localChanges: localChanges.hasChanges
    })

    if (!hasEffectiveDiff) {
      // 远端清单时间（服务器时间域）比本地时钟可靠；远端不更新时维持现有水位线不动
      const noChangeWatermark = remoteTime > serverSyncTime
        ? remoteManifest.lastSyncAt
        : (ctx.lastSyncedAt || new Date().toISOString())
      await ctx.saveLastSyncedAt(noChangeWatermark)
      if (remoteTime > serverSyncTime) await saveServerWatermark(ctx, remoteManifest.lastSyncAt)
      return { action: 'no_changes', ...conflict.getLocalChangesSince(remoteTime || localSyncTime) }
    }

    // 4. Pull or push
    if (remoteTime > serverSyncTime) {
      if (!remoteManifest) {
        // First sync — push local data
        return doPush(ctx, stores, be, { hasDataDiff: true, hasRechargeDataDiff: true, hasEventDataDiff: true, hasPresetsDiff: true })
      }
      if (localChanges.hasChanges) {
        log.warn('sync:conflict', { remoteTime: remoteManifest.lastSyncAt, remoteDevice: remoteManifest.deviceId, localTime: ctx.lastSyncedAt })
        return {
          action: 'conflict', statusMessage: 'sync.conflictDetected',
          conflictData: {
            remoteTime: remoteManifest.lastSyncAt, remoteDevice: remoteManifest.deviceId,
            localTime: ctx.lastSyncedAt, localModifiedTime: ctx.getLatestLocalModifiedAt(),
            ...buildConflictCounts(stores, remoteData)
          }
        }
      }
      // Pull — reuse diff from earlier if available, otherwise compute now
      const diff = goodsDiff || diffLocalRemote(stores, remoteData, { incremental: remoteData.isIncremental })
      let restoredCount = 0
      let pullCounts = null
      await trackSyncStep(
        i18n.global.t('sync.phase.pull'),
        async () => {
          // 预热云端文件列表缓存：getImagePublicUrl 依赖它区分
          // 用户目录新文件与根目录旧文件，冷缓存会生成指错位置的 URL
          if (be.getExistingImageCloud) await be.getExistingImageCloud().catch(() => {})
          const imgStats = await hydrateRemoteImages(image, be, remoteData, diff)
          restoredCount = imgStats?.restoredImages || 0
          const merged = await mergeToLocal(stores, remoteData, {
            reconcileMissing: !remoteData.isIncremental, diff,
            shouldApplyRemoteItem: ctx.shouldApplyRemoteItem,
            localSyncTime,
            dirtyGoodsIds: ctx.getDirtyGoodsIds
          })
          pullCounts = merged.counts
          if (be.getImagePublicUrl) {
            const { cleanupBase64Images } = await import('@/stores/goodsSync')
            await cleanupBase64Images(stores.goodsStore.list, stores.goodsStore.trashList, be).catch(() => {})
          }
        },
        {
          startDetail: i18n.global.t('sync.step.restoreCollectionImages.start'),
          category: 'pull',
          successDetail: () => i18n.global.t('sync.step.restoreCollectionImages.success', { count: restoredCount })
        }
      )
      await flushDbWrites().catch(() => {})
      if (remoteManifest?.lastSyncAt) await ctx.saveLastSyncedAt(remoteManifest.lastSyncAt)
      await saveServerWatermark(ctx, remoteManifest?.lastSyncAt)
      return { action: 'pulled', ...pullCounts }
    }

    // Push (incremental — only send changed items)
    return doPush(ctx, stores, be, { hasDataDiff, hasRechargeDataDiff, hasEventDataDiff, hasBudgetDiff, hasPresetsDiff, hasDirtyGoodsIds, dirtyGoodsIds, remoteData })
  }

  // ── Push implementation ──

  /**
   * Count all unique cloud-referenced image files across all goods + events.
   */
  function countAllReferencedImageFiles(goodsStore, eventsStore) {
    const { referencedFiles } = collectReferencedImageState({
      goods: goodsStore.list,
      trash: goodsStore.trashList,
      events: eventsStore.list || []
    })
    return referencedFiles.size
  }

  async function doPush(ctx, stores, be, opts = {}) {
    const { hasDataDiff, hasRechargeDataDiff, hasEventDataDiff, hasBudgetDiff, hasPresetsDiff, hasDirtyGoodsIds, dirtyGoodsIds, remoteData } = opts

    // Build payload (without uploading images yet)
    let existingImageCloud = await be.getExistingImageCloud()
    const { syncData, rechargeSyncData, eventSyncData, imageStats, allReferencedImageFiles, imageUpdates } = await trackSyncStep(
      i18n.global.t('sync.step.buildGoodsPayload'),
      () => buildPayloadAndUploadImages(
        payload, image, be, {
          existingImageCloud,
          dirtyIds: hasDirtyGoodsIds ? dirtyGoodsIds : null,
          shouldWriteRecharge: hasRechargeDataDiff,
          shouldWriteEvent: hasEventDataDiff
        }
      ),
      {
        startDetail: i18n.global.t('sync.step.buildGoodsPayload.start'),
        category: 'local',
        successDetail: (result) => {
          const syncData = result.syncData
          return i18n.global.t('sync.step.buildGoodsPayload.success', {
            collection: (syncData.goods || []).length,
            trash: (syncData.trash || []).length,
            images: result.imageStats.imageFileCount
          })
        }
      }
    )

    // When only dirty items were processed, imageStats only counts their images.
    // The manifest needs the TOTAL image count across all items.
    if (hasDirtyGoodsIds) {
      imageStats.imageFileCount = countAllReferencedImageFiles(stores.goodsStore, stores.eventsStore)
    }

    // Build manifest
    const syncTimestamp = new Date().toISOString()
    const manifest = buildManifest(payload, imageStats, syncTimestamp, {
      syncData, rechargeSyncData, eventSyncData,
      goodsStore: stores.goodsStore, rechargeStore: stores.rechargeStore, eventsStore: stores.eventsStore,
      hasDirtyGoodsIds, shouldWriteRecharge: hasRechargeDataDiff, shouldWriteEvent: hasEventDataDiff,
      backend: be
    })

    // crash-safe：先持久化 pending-push 标记（含本次推送时间戳），再写远端；
    // 若进程在远端写入成功后、本地水位线保存前被杀，下次同步由 reconcilePendingPush 快进水位线。
    // writeRemoteData 抛错时故意不清除标记：超时可能是"已生效但未确认"，正是标记要恢复的场景
    await setPendingPush(ctx, { ts: manifest.lastSyncAt, eventTs: eventSyncData.updatedAt || manifest.lastSyncAt, deviceId: ctx.deviceId || manifest.deviceId || '' })

    // Write data to remote FIRST — before uploading images.
    let serverSyncedAt = null
    try {
      const writeResult = await trackSyncStep(
        i18n.global.t('sync.step.pushData'),
        () => writeRemoteData(be, {
          syncData, rechargeSyncData, eventSyncData, manifest,
          existingCloud: existingImageCloud,
          remoteData,
          shouldWriteData: hasDataDiff,
          shouldWriteRecharge: hasRechargeDataDiff,
          shouldWriteEvent: hasEventDataDiff,
          shouldWritePresets: hasPresetsDiff,
          fullGoodsList: hasDirtyGoodsIds ? stores.goodsStore.list : null,
          fullTrashList: hasDirtyGoodsIds ? stores.goodsStore.trashList : null
        }),
        {
          startDetail: i18n.global.t('sync.step.pushData.start'),
          category: 'sync',
          successDetail: () => i18n.global.t('sync.step.pushData.success')
        }
      )
      serverSyncedAt = writeResult?.serverSyncedAt || null
    } catch (e) { wrapSyncError(e, PHASE_WRITE_DATA) }

    // Upload images AFTER data is safely written.
    // Track per-file success so local refs/base64 are only replaced for files that
    // actually reached the cloud — failed files keep their local copy and retry next sync.
    const failedImageFiles = new Set()
    const pendingUploadFiles = Object.keys(imageUpdates).filter((name) => imageUpdates[name]?.content)
    if (Object.keys(imageUpdates).length > 0) {
      if (!existingImageCloud) existingImageCloud = await be.ensureImageCloud()
      try {
        const imgResult = await be.writeImages(existingImageCloud.id, imageUpdates)
        if (imgResult?.failed > 0) {
          log.warn(`image upload: ${imgResult.failed} failed, ${imgResult.uploaded} succeeded`)
        }
      }
      catch (e) { log.warn('image upload failed (data already saved):', e) }
      // Verify per-file success by re-listing cloud files (writeImages may partially fail)
      if (pendingUploadFiles.length > 0) {
        try {
          const freshCloud = await be.getExistingImageCloud()
          for (const name of pendingUploadFiles) {
            if (!freshCloud?.files?.[name]) failedImageFiles.add(name)
          }
        } catch (e) {
          // Listing failed — conservatively treat all pending uploads as failed
          for (const name of pendingUploadFiles) failedImageFiles.add(name)
          log.warn('image upload verification failed, keeping local image refs:', e)
        }
        if (failedImageFiles.size > 0) {
          log.warn(`${failedImageFiles.size} image(s) not confirmed in cloud, keeping local originals for retry`)
        }
      }
    } else {
      log.debug('no image updates to upload')
    }

    // Update local refs (skip images whose upload failed)
    await updateLocalRefs(stores.goodsStore, stores.eventsStore, syncData, eventSyncData, be, failedImageFiles)

    // 孤儿图片回收（Supabase）：删除云端不再被引用、且归属当前用户的图片文件。
    // 必须放在 purgeSyncedDeleted 之前：已删除活动的墓碑引用此时仍在本地，其照片会被保留。
    // 整体 try/catch，回收失败绝不影响同步结果。
    if (be.getImagePublicUrl && typeof be.removeImages === 'function') {
      try {
        const { referencedFiles, ownedEntityIds } = collectReferencedImageState({
          goods: stores.goodsStore.list,
          trash: stores.goodsStore.trashList,
          events: stores.eventsStore.list || []
        })
        const orphanFiles = image.collectSupabaseOrphanImageFiles(existingImageCloud, { referencedFiles, ownedEntityIds })
        if (orphanFiles.length > 0) {
          await trackSyncStep(i18n.global.t('sync.step.cleanOrphanImages'), async () => {
            const result = await be.removeImages(orphanFiles)
            return i18n.global.t('sync.step.cleanOrphanImages.result', { removed: result?.removed ?? 0, failed: result?.failed ?? 0 })
          }, { startDetail: i18n.global.t('sync.step.cleanOrphanImages.start', { count: orphanFiles.length }), category: 'image' })
        }
      } catch (e) {
        log.warn('orphan image GC failed (non-fatal):', e)
      }
    }

    // Purge locally-deleted records after successful push (sent to cloud as trash)
    if (stores.rechargeStore.purgeSyncedDeleted) {
      await stores.rechargeStore.purgeSyncedDeleted().catch(() => {})
    }
    if (stores.eventsStore.purgeSyncedDeleted) {
      await stores.eventsStore.purgeSyncedDeleted().catch(() => {})
    }
    if (stores.goodsGroupStore.purgeSyncedDeleted) {
      await stores.goodsGroupStore.purgeSyncedDeleted().catch(() => {})
    }

    // Clean up any remaining base64 images in SQLite (skip files whose upload failed)
    if (be.getImagePublicUrl) {
      const { cleanupBase64Images } = await import('@/stores/goodsSync')
      await cleanupBase64Images(stores.goodsStore.list, stores.goodsStore.trashList, be, { skipFiles: failedImageFiles }).catch(() => {})
    }

    // Save timestamps —— Web 端先把 updateLocalRefs/cleanup 的本地写入落盘再推进水位线；
    // 水位线优先用服务器侧 synced_at（新版 RPC 返回），消除设备时钟偏移
    await flushDbWrites().catch(() => {})
    await ctx.saveLastSyncedAt(serverSyncedAt || manifest.lastSyncAt)
    await ctx.saveEventLastSyncedAt(eventSyncData.updatedAt || manifest.lastSyncAt)
    await saveServerWatermark(ctx, serverSyncedAt || manifest.lastSyncAt)
    await dropPendingPush(ctx)

    // Collect affected goods ids so the caller can re-mark them dirty for retry
    const failedImageItemIds = []
    if (failedImageFiles.size > 0) {
      for (const item of [...(syncData.goods || []), ...(syncData.trash || [])]) {
        if (!Array.isArray(item.images)) continue
        if (item.images.some(img => img?.cloudFileName && failedImageFiles.has(img.cloudFileName))) {
          failedImageItemIds.push(item.id)
        }
      }
    }

    log.info('push:done', {
      totalGoods: (syncData.goods || []).length,
      totalTrash: (syncData.trash || []).length,
      totalRecharge: (rechargeSyncData.recharge || []).length,
      totalEvents: (eventSyncData.events || []).length,
      failedImages: failedImageFiles.size
    })
    return {
      action: 'pushed',
      failedImages: failedImageFiles.size,
      failedImageItemIds,
      ...imageStats,
      totalGoods: (syncData.goods || []).length,
      totalTrash: (syncData.trash || []).length,
      totalRecharge: (rechargeSyncData.recharge || []).length,
      totalEvents: (eventSyncData.events || []).length
    }
  }

  // ── Conflict resolution ──

  async function resolveConflict(ctx, useRemote) {
    log.info('conflict:resolve', { choice: useRemote ? 'use-remote' : 'keep-local' })
    if (useRemote) {
      return pull(ctx, { silent: true })
    }
    // Keep local: force push. Re-running sync() would re-detect the same conflict and loop.
    return forcePush(ctx)
  }

  // ── Force push: bypass conflict detection, local data wins ──

  // "保留本地"强推时，本地条目可能带着比远端更旧的 updatedAt 上传，
  // 其他设备按 LWW 会用远端（更新）副本反向覆盖，静默撤销用户的冲突决策。
  // 推送前把会被覆盖的条目 updatedAt 提升到远端之上，并写回本地保持两端一致。
  async function bumpTimestampsForForcePush(stores, remoteData, conflictRemoteMs) {
    const nowMs = Date.now()
    const buildRemoteTsMap = (...lists) => {
      if (!remoteData) return null
      const map = new Map()
      for (const arr of lists) {
        for (const row of (arr || [])) {
          const ts = getItemTimestamp(row)
          const prev = map.get(row.id)
          if (prev === undefined || ts > prev) map.set(row.id, ts)
        }
      }
      return map
    }
    // map 为 null（远端读取失败）时无从判断哪些条目会被覆盖，全部提升
    const bump = (items, map) => {
      const changed = []
      for (const item of (items || [])) {
        const localTs = getItemTimestamp(item)
        const remoteTs = map ? map.get(item.id) : undefined
        if (map && (remoteTs === undefined || remoteTs < localTs)) continue
        item.updatedAt = Math.max(localTs, remoteTs || 0, conflictRemoteMs, nowMs) + 1
        changed.push(item)
      }
      return changed
    }

    const goodsTsMap = buildRemoteTsMap(remoteData?.goods, remoteData?.trash)
    const changedGoods = bump(stores.goodsStore.list, goodsTsMap)
    const changedTrash = bump(stores.goodsStore.trashList, goodsTsMap)
    const changedRecharge = bump(stores.rechargeStore.records, buildRemoteTsMap(remoteData?.recharge, remoteData?.rechargeTrash))
    const changedEvents = bump(stores.eventsStore.list, buildRemoteTsMap(remoteData?.events, remoteData?.eventsTrash))
    const changedGroups = bump(stores.goodsGroupStore.groupList, buildRemoteTsMap(remoteData?.groups, remoteData?.groupsTrash))
    const changedGroupItems = bump(stores.goodsGroupStore.groupItemList, buildRemoteTsMap(remoteData?.groupItems, remoteData?.groupItemsTrash))

    if (changedGoods.length > 0) await saveItems(changedGoods)
    if (changedTrash.length > 0) await writePersistedTrash(stores.goodsStore.trashList)
    if (changedRecharge.length > 0) await saveRechargeRecords(changedRecharge)
    if (changedEvents.length > 0) await saveEvents(changedEvents)
    if (changedGroups.length > 0) await saveGroups(changedGroups)
    if (changedGroupItems.length > 0) await saveGroupItems(changedGroupItems)

    const total = changedGoods.length + changedTrash.length + changedRecharge.length
      + changedEvents.length + changedGroups.length + changedGroupItems.length
    if (total > 0) log.info('force-push: bumped updatedAt of', total, 'items above remote')
  }

  async function forcePush(ctx) {
    const be = ctx.backend || backend
    const stores = getLocalStores()
    await ctx.ensureEventsStoreReady()
    log.info('force-push:start')

    try {
      // Read remote data so doPush can send incremental diffs; fall back to full push on failure
      let remoteData = null
      try {
        const localSyncTime = ctx.lastSyncedAt ? new Date(ctx.lastSyncedAt).getTime() : 0
        remoteData = await readRemoteData(be, { since: sinceWithOverlap(localSyncTime), trackSyncStep })
      } catch (e) {
        log.warn('forcePush: read remote failed, pushing full data', e.message)
      }
      await bumpTimestampsForForcePush(stores, remoteData, toTimestampMs(ctx.conflictData?.remoteTime))
      return await doPush(ctx, stores, be, {
        hasDataDiff: true, hasRechargeDataDiff: true, hasEventDataDiff: true, hasPresetsDiff: true,
        remoteData
      })
    } catch (e) {
      wrapSyncError(e, PHASE_PUSH)
    }
  }

  async function resolvePullConflict(ctx, confirm) {
    if (!confirm) return { action: 'cancelled', statusMessage: 'sync.pullCancelled' }
    return pull(ctx, { silent: true })
  }

  // ── Count helpers ──

  // 汇总 mergeToLocal 返回的实际落库计数（详见 syncPullPipeline.countAppliedChanges）
  function sumPullCounts(counts) {
    if (!counts) return 0
    return (counts.importedGoods || 0) + (counts.updatedGoods || 0) + (counts.importedTrash || 0)
      + (counts.importedRecharge || 0) + (counts.updatedRecharge || 0)
      + (counts.importedEvents || 0) + (counts.updatedEvents || 0)
      + (counts.importedGroups || 0)
  }

  function buildConflictCounts(stores, remoteData, diff) {
    const remoteGoods = remoteData.goods || []
    const remoteTrash = remoteData.trash || []
    const remoteCounts = countWishlistSplit(remoteGoods)
    return {
      remoteGoodsCount: remoteGoods.length,
      remoteCollectionCount: remoteCounts.collection,
      remoteWishlistCount: remoteCounts.wishlist,
      remoteTrashCount: remoteTrash.length,
      remoteRechargeCount: (remoteData.recharge || []).length,
      remoteEventCount: (remoteData.events || []).length,
      remoteGroupCount: (remoteData.groups || []).length,
      remoteGroupItemCount: (remoteData.groupItems || []).length
    }
  }

  return { pull, sync, resolveConflict, resolvePullConflict }
}
