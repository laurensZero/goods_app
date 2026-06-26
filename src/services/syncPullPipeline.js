// src/services/syncPullPipeline.js
// Pull pipeline: read remote → diff → hydrate images → merge to local

import { resolveGoodsTrashMaps, getItemTimestamp, getLatestRechargeTimestamp, normalizeBudgetValue, readBudgetSettings, countWishlistSplit } from '@/utils/sync/shared'
import { compareState, compareStateSync } from '@/utils/sync/stateCompare'
import { writePersisted } from '@/utils/platform/storage'
import { MONTHLY_BUDGET_STORAGE_KEY, YEARLY_BUDGET_STORAGE_KEY } from '@/constants/budgetConstants'
import { createLogger } from '@/utils/logger'
import i18n from '@/locales'

const log = createLogger('sync:pullPipeline')

/**
 * Read remote data from the backend.
 * Uses readDomainRows when available (Supabase), falls back to readJson (Gist).
 *
 * @param {object} be - backend adapter
 * @param {object} opts
 * @param {string[]|null} opts.tables - specific tables to read (null = all)
 * @param {number} opts.since - incremental: only rows after this timestamp (ms)
 * @param {boolean} opts.readManifest - whether to read manifest
 * @param {boolean} opts.readPresets - whether to read presets
 * @param {object} opts.gist - Gist object (for Gist backend)
 * @param {object} opts.fallbackGists - { rechargeGist, eventGist } for Gist backend
 */
export async function readRemoteData(be, { tables = null, since = 0, readManifest = true, readPresets = true, gist = null, fallbackGists = {}, trackSyncStep = null } = {}) {
  const result = { goods: [], trash: [], recharge: [], rechargeTrash: [], events: [], groups: [], groupItems: [], presets: null, manifest: null }

  // Helper to wrap a task with trackSyncStep if available
  const wrapStep = (title, task, opts) => trackSyncStep ? trackSyncStep(title, task, opts) : task()

  if (be.readDomainRows) {
    // Supabase direct path — parallel reads
    const tableSet = tables ? new Set(tables) : null
    const readTasks = []

    if (!tableSet || tableSet.has('goods')) {
      readTasks.push(
        wrapStep(
          i18n.global.t('sync.step.readData'),
          () => be.readDomainRows('goods', { since }),
          { startDetail: i18n.global.t('sync.step.readData.start'), category: 'pull',
            successDetail: (data) => { const g = data?.goods || []; const t = data?.trash || []; const c = countWishlistSplit(g); return i18n.global.t('sync.step.readData.success', { collection: c.collection, wishlist: c.wishlist, trash: t.length }) } }
        ).then(data => { result.goods = data.goods || []; result.trash = data.trash || [] })
      )
    }
    if (!tableSet || tableSet.has('recharge_records')) {
      readTasks.push(
        wrapStep(
          i18n.global.t('sync.step.readRecharge'),
          () => be.readDomainRows('recharge', { since }),
          { startDetail: i18n.global.t('sync.step.readRecharge.start'), category: 'pull',
            successDetail: (data) => i18n.global.t('sync.step.readRecharge.success', { source: 'Supabase', count: (data?.recharge || []).length }) }
        ).then(data => { result.recharge = data.recharge || []; result.rechargeTrash = data.rechargeTrash || [] })
      )
    }
    if (!tableSet || tableSet.has('events')) {
      readTasks.push(
        wrapStep(
          i18n.global.t('sync.step.readEvents'),
          () => be.readDomainRows('events', { since }),
          { startDetail: i18n.global.t('sync.step.readEvents.start'), category: 'pull',
            successDetail: (data) => i18n.global.t('sync.step.readEvents.success', { source: 'Supabase', count: (data || []).length }) }
        ).then(data => { result.events = Array.isArray(data) ? data : [] })
      )
    }
    if (!tableSet || tableSet.has('goods_groups')) {
      readTasks.push(
        be.readDomainRows('groups', { since }).then(data => { result.groups = Array.isArray(data) ? data : [] })
      )
    }
    if (!tableSet || tableSet.has('goods_group_items')) {
      readTasks.push(
        be.readDomainRows('groupItems', { since }).then(data => { result.groupItems = Array.isArray(data) ? data : [] })
      )
    }
    if (readManifest) {
      const readManifestFn = be.readManifest || be.getManifest
      if (readManifestFn) {
        readTasks.push(
          readManifestFn.call(be).then(m => { result.manifest = m })
        )
      }
    }
    if (readPresets && be.readPresets) {
      readTasks.push(
        be.readPresets().then(p => { result.presets = p }).catch(e => log.warn('readPresets failed', e))
      )
    }

    await Promise.all(readTasks)
  } else {
    // Gist path — readJson with fallbacks (readJson already has trackSyncStep inside)
    const [remoteData, remoteRecharge, remoteEvents, manifest] = await Promise.all([
      be.readJson({
        title: i18n.global.t('sync.step.readData'), gist, fileName: 'data.json', required: true,
        startDetail: i18n.global.t('sync.step.readData.start'), category: 'pull',
        successDetail: (parsed) => {
          if (!parsed) return i18n.global.t('sync.step.readData.notFound')
          const counts = countWishlistSplit(Array.isArray(parsed.goods) ? parsed.goods : [])
          return i18n.global.t('sync.step.readData.success', { collection: counts.collection, wishlist: counts.wishlist, trash: (parsed.trash || []).length })
        }
      }),
      be.readJson({
        title: i18n.global.t('sync.step.readRecharge'), gist, fileName: 'recharge-data.json', fallbackGist: fallbackGists.rechargeGist,
        startDetail: i18n.global.t('sync.step.readRecharge.start'), category: 'pull',
        successDetail: (parsed, source) => parsed ? i18n.global.t('sync.step.readRecharge.success', { source, count: (parsed.recharge || []).length }) : i18n.global.t('sync.step.readRecharge.notFound')
      }),
      be.readJson({
        title: i18n.global.t('sync.step.readEvents'), gist, fileName: 'events-data.json', fallbackGist: fallbackGists.eventGist,
        startDetail: i18n.global.t('sync.step.readEvents.start'), category: 'pull',
        successDetail: (parsed, source) => parsed ? i18n.global.t('sync.step.readEvents.success', { source, count: (parsed.events || []).length }) : i18n.global.t('sync.step.readEvents.notFound')
      }),
      readManifest ? (be.readManifest || be.getManifest).call(be, gist) : Promise.resolve(null)
    ])
    result.goods = remoteData?.goods || []
    result.trash = remoteData?.trash || []
    result.groups = remoteData?.goodsGroups || []
    result.groupItems = remoteData?.goodsGroupItems || []
    result.presets = remoteData?.presets || null
    result.recharge = remoteRecharge?.recharge || []
    result.rechargeTrash = remoteRecharge?.rechargeTrash || []
    result.events = remoteEvents?.events || []
    result.manifest = manifest
  }

  return result
}

/**
 * Compare local stores with remote data.
 * Pure function — no side effects.
 */
export function diffLocalRemote(localStores, remoteData, { domains = null, incremental = false } = {}) {
  const { goodsStore, rechargeStore, eventsStore, goodsGroupStore } = localStores

  const localResolved = resolveGoodsTrashMaps(goodsStore.list, goodsStore.trashList)
  const remoteResolved = resolveGoodsTrashMaps(remoteData.goods || [], remoteData.trash || [])

  // Collect changed IDs for incremental pull
  const changedGoodsIds = new Set()
  const changedTrashIds = new Set()
  for (const remoteItem of remoteResolved.goodsMap.values()) {
    const localItem = localResolved.goodsMap.get(remoteItem.id) || localResolved.trashMap.get(remoteItem.id)
    if (!localItem || getItemTimestamp(remoteItem) > getItemTimestamp(localItem)) {
      changedGoodsIds.add(remoteItem.id)
    }
  }
  for (const remoteItem of remoteResolved.trashMap.values()) {
    const localItem = localResolved.trashMap.get(remoteItem.id) || localResolved.goodsMap.get(remoteItem.id)
    if (!localItem || getItemTimestamp(remoteItem) > getItemTimestamp(localItem)) {
      changedTrashIds.add(remoteItem.id)
    }
  }

  // Timestamp-based comparison
  const goodsTrashCompare = compareStateSync(
    [...localResolved.goodsMap.values(), ...localResolved.trashMap.values()],
    [...remoteResolved.goodsMap.values(), ...remoteResolved.trashMap.values()]
  )
  const groupsCompare = compareStateSync(
    goodsGroupStore.groupList || [],
    remoteData.groups || []
  )
  const groupItemsCompare = compareStateSync(
    goodsGroupStore.groupItemList || [],
    remoteData.groupItems || []
  )
  const rechargeCompare = compareStateSync(
    rechargeStore.exportBackup({ includeDeleted: false, stripImage: true }) || [],
    remoteData.recharge || []
  )
  const eventCompare = compareStateSync(
    eventsStore.list || [],
    remoteData.events || []
  )

  const hasChanges = goodsTrashCompare.hasChanges || groupsCompare.hasChanges || groupItemsCompare.hasChanges
    || rechargeCompare.hasChanges || eventCompare.hasChanges

  return {
    goodsTrashCompare, groupsCompare, groupItemsCompare, rechargeCompare, eventCompare,
    changedGoodsIds, changedTrashIds,
    hasChanges
  }
}

/**
 * Hydrate remote items with images (restore gist-image:// or public URLs).
 */
export async function hydrateRemoteImages(imageService, be, remoteData, diff) {
  if (!imageService) return

  const imageGist = await imageService.resolveRemoteImageGist(remoteData.manifest)
  const imageStats = { restoredImages: 0 }

  const hydrationTasks = []
  if ((remoteData.goods || []).length > 0 && diff.changedGoodsIds.size > 0) {
    hydrationTasks.push(
      imageService.hydrateRemoteItemsWithImages(remoteData.goods, imageGist, imageStats, { targetItemIds: diff.changedGoodsIds })
        .then(hydrated => { remoteData.goods = hydrated })
    )
  }
  if ((remoteData.trash || []).length > 0 && diff.changedTrashIds.size > 0) {
    hydrationTasks.push(
      imageService.hydrateRemoteItemsWithImages(remoteData.trash, imageGist, imageStats, { targetItemIds: diff.changedTrashIds })
        .then(hydrated => { remoteData.trash = hydrated })
    )
  }
  if ((remoteData.events || []).length > 0) {
    hydrationTasks.push(
      imageService.hydrateEventCoversWithImages(remoteData.events, imageGist, imageStats)
        .then(hydrated => { remoteData.events = hydrated })
    )
  }

  if (hydrationTasks.length > 0) await Promise.all(hydrationTasks)
}

/**
 * Apply remote data to local stores.
 *
 * @param {object} stores - { goodsStore, rechargeStore, eventsStore, goodsGroupStore, presetsStore }
 * @param {object} remoteData - remote data from readRemoteData
 * @param {object} opts
 * @param {boolean} opts.reconcileMissing - if true, delete local items not present in remote
 * @param {object} opts.diff - diff result from diffLocalRemote
 * @param {Function} opts.shouldApplyRemoteItem - conflict resolver
 */
export async function mergeToLocal(stores, remoteData, opts = {}) {
  const { goodsStore, rechargeStore, eventsStore, goodsGroupStore, presetsStore } = stores
  const { reconcileMissing = true, diff, shouldApplyRemoteItem } = opts

  // Compute remote watermark
  let remoteWatermark = 0
  function trackTs(items) {
    for (const item of (items || [])) {
      const ts = Number(item?.updatedAt) || 0
      if (ts > remoteWatermark) remoteWatermark = ts
    }
  }
  trackTs(remoteData.goods); trackTs(remoteData.trash)
  trackTs(remoteData.recharge); trackTs(remoteData.rechargeTrash)
  trackTs(remoteData.events)
  trackTs(remoteData.groups); trackTs(remoteData.groupItems)

  // ── Goods ──
  const goods = remoteData.goods || []
  const trash = remoteData.trash || []

  // Import new + update existing
  if (goods.length > 0) {
    await goodsStore.importGoodsBackup(goods)
    await goodsStore.updateGoodsBackup(goods)
  }
  if (trash.length > 0) {
    await goodsStore.importTrashBackup(trash)
    await goodsStore.updateTrashBackup(trash)
  }

  // Reconcile: delete local items not in remote
  if (reconcileMissing && (goods.length > 0 || trash.length > 0)) {
    const remoteGoodsIds = new Set(goods.map(g => g.id))
    const remoteTrashIds = new Set(trash.map(t => t.id))
    const hasAnyRemote = remoteGoodsIds.size > 0 || remoteTrashIds.size > 0

    if (hasAnyRemote) {
      const localOnlyGoodsIds = goodsStore.list
        .filter(item => !remoteGoodsIds.has(item.id) && !remoteTrashIds.has(item.id))
        .filter(item => getItemTimestamp(item) <= remoteWatermark)
        .map(item => item.id)
      const localOnlyTrashIds = goodsStore.trashList
        .filter(item => !remoteTrashIds.has(item.id) && !remoteGoodsIds.has(item.id))
        .filter(item => getItemTimestamp(item) <= remoteWatermark)
        .map(item => item.id)
      if (localOnlyGoodsIds.length > 0) await goodsStore.deleteGoodsPermanently(localOnlyGoodsIds)
      if (localOnlyTrashIds.length > 0) await Promise.all(localOnlyTrashIds.map(id => goodsStore.deleteTrashItem(id)))
    }
  }

  // ── Recharge ──
  const rechargeArr = remoteData.recharge || []
  const rechargeTrashArr = remoteData.rechargeTrash || []
  const allRecharge = [...rechargeArr, ...rechargeTrashArr]
  if (allRecharge.length > 0) {
    await rechargeStore.importBackup(allRecharge, {
      reconcileMissing,
      preserveLocalNewerThan: remoteWatermark
    })
  }

  // ── Events ──
  const events = remoteData.events || []
  if (events.length > 0) {
    await eventsStore.importEventsBackup(events, {
      reconcileMissing,
      preserveLocalNewerThan: remoteWatermark
    })
  }

  // ── Groups ──
  const groups = remoteData.groups || []
  const groupItems = remoteData.groupItems || []
  if (groups.length > 0 || groupItems.length > 0) {
    await goodsGroupStore.updateGroupsBackup(groups, groupItems)
  }

  // ── Presets ──
  if (remoteData.presets && presetsStore) {
    await presetsStore.replacePresetsSnapshot(remoteData.presets)
  }

  // ── Budget settings ──
  if (remoteData.manifest) {
    const monthly = normalizeBudgetValue(remoteData.manifest.budgetMonthly)
    const yearly = normalizeBudgetValue(remoteData.manifest.budgetYearly)
    if (monthly > 0 || yearly > 0) {
      await Promise.all([
        writePersisted(MONTHLY_BUDGET_STORAGE_KEY, monthly > 0 ? String(monthly) : ''),
        writePersisted(YEARLY_BUDGET_STORAGE_KEY, yearly > 0 ? String(yearly) : '')
      ])
    }
  }

  return { remoteWatermark }
}
