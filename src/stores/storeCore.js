/**
 * Shared store utilities and factory for CRUD, init, and backup import patterns.
 */
import { ref, shallowRef, triggerRef, computed } from 'vue'
import { useSyncStore } from '@/stores/sync'

// ── Standalone utilities (usable without createStoreCore) ──

/**
 * Create a computed by-ID lookup for a reactive list.
 * Returns a computed getter: (id) => item | undefined
 *
 * @param {import('vue').Ref<Array<{id: string}>>} listRef
 * @returns {import('vue').ComputedRef<(id: string) => object | undefined>}
 */
export function createByIdLookup(listRef) {
  const map = computed(() => new Map(listRef.value.map((item) => [item.id, item])))
  return computed(() => (id) => map.value.get(id))
}

/**
 * Create a sync trigger function for a domain.
 * Uses 2-second debounce via the sync store's autoPushGoods.
 *
 * @param {string} domain - Domain name (e.g. 'goods', 'recharge', 'events')
 * @returns {Function} trigger(ids?) — optional IDs for goods fast path
 */
export function createAutoPush(domain) {
  return function trigger(ids) {
    const syncStore = useSyncStore()
    syncStore.autoPushGoods(domain)
    if (ids && ids.length > 0 && syncStore.markGoodsIdsDirty) {
      syncStore.markGoodsIdsDirty(ids)
    }
  }
}

/**
 * Create a DB init function.
 * Loads rows from DB, normalizes them, assigns to listRef, sets isReady.
 *
 * @param {object} opts
 * @param {Function} opts.dbGet - async () => row[] — load from DB
 * @param {Function} opts.normalizer - (raw) => normalized — normalize one row
 * @param {import('vue').Ref<Array>} opts.listRef - reactive list to populate
 * @param {import('vue').Ref<boolean>} opts.isReadyRef - readiness flag
 * @param {string} [opts.storeName] - for error logging
 */
export function createInit({ dbGet, normalizer, listRef, isReadyRef, storeName = 'store' }) {
  return async function init() {
    if (isReadyRef.value) return
    try {
      const rows = await dbGet()
      listRef.value = rows.map((item) => normalizer(item))
    } catch (e) {
      console.error(`[${storeName}] init failed, starting with empty list:`, e)
      listRef.value = []
    }
    isReadyRef.value = true
  }
}

/**
 * Create a reactive store state with init, CRUD, and backup import.
 *
 * @param {object} opts
 * @param {string} opts.name - Store name for logging (e.g. 'recharge', 'events')
 * @param {boolean} [opts.useShallowRef=false] - Use shallowRef instead of ref
 * @param {Function} opts.dbGet - async () => row[] — load all rows from DB
 * @param {Function} opts.dbSave - async (rows) => void — upsert rows to DB
 * @param {Function} opts.dbDelete - async (ids) => void — delete rows from DB
 * @param {Function} opts.normalizer - (raw) => normalized — normalize one row
 * @param {Function} [opts.validator] - (item) => boolean — validate before add/update
 * @param {string} [opts.syncDomain] - Domain name for auto-push (e.g. 'recharge', 'events')
 * @param {Function} [opts.onAfterDelete] - async (deletedItems) => void — cleanup hook (e.g. delete images)
 * @param {Function} [opts.importNormalizer] - (raw) => normalized — normalizer for import (may differ from normalizer)
 * @param {Function} [opts.onAfterImport] - async () => void — hook after import completes
 * @param {Function} [opts.onBeforeSave] - async (items) => void — hook before saving imported items
 */
export function createStoreCore(opts) {
  const {
    name,
    useShallowRef: useShallow = false,
    dbGet,
    dbSave,
    dbDelete,
    normalizer,
    validator,
    syncDomain,
    onAfterDelete,
    importNormalizer,
    onAfterImport,
    onBeforeSave
  } = opts

  const list = useShallow ? shallowRef([]) : ref([])
  const isReady = ref(false)

  const _byIdMap = computed(() => new Map(list.value.map((item) => [item.id, item])))
  const getById = computed(() => (id) => _byIdMap.value.get(id))

  // ── Sync trigger ──

  function triggerSync() {
    if (syncDomain) useSyncStore().autoPushGoods(syncDomain)
  }

  // ── Init ──

  async function init() {
    if (isReady.value) return
    try {
      const rows = await dbGet()
      list.value = rows.map((item) => normalizer(item))
    } catch (e) {
      console.error(`[${name}] init failed, starting with empty list:`, e)
      list.value = []
    }
    isReady.value = true
  }

  // ── CRUD ──

  async function add(data) {
    const item = normalizer(data)
    if (validator && !validator(item)) return null

    const existingIndex = list.value.findIndex((r) => r.id === item.id)
    if (existingIndex !== -1) {
      list.value[existingIndex] = { ...list.value[existingIndex], ...item }
    } else {
      list.value.unshift(item)
    }
    if (!useShallow) triggerRef(list)

    try {
      await dbSave([item])
    } catch (e) {
      console.error(`[${name}] add failed:`, e)
      throw e
    }
    triggerSync()
    return item
  }

  async function update(id, data) {
    const index = list.value.findIndex((item) => item.id === id)
    if (index < 0) return null

    const next = normalizer({
      ...list.value[index],
      ...data,
      id,
      updatedAt: Date.now()
    })
    if (validator && !validator(next)) return null

    list.value[index] = next
    if (!useShallow) triggerRef(list)

    try {
      await dbSave([next])
    } catch (e) {
      console.error(`[${name}] update failed:`, e)
      throw e
    }
    triggerSync()
    return next
  }

  async function remove(id) {
    const existing = list.value.find((item) => item.id === id)
    if (!existing) return false

    list.value = list.value.filter((item) => item.id !== id)
    try {
      await dbDelete([id])
      if (onAfterDelete) await onAfterDelete([existing])
    } catch (e) {
      console.error(`[${name}] delete failed:`, e)
      throw e
    }
    triggerSync()
    return true
  }

  async function removeMultiple(ids) {
    const targetIds = [...new Set(Array.from(ids || []).filter(Boolean))]
    if (targetIds.length === 0) return 0

    const targetIdSet = new Set(targetIds)
    const removedItems = list.value.filter((item) => targetIdSet.has(item.id))

    list.value = list.value.filter((item) => !targetIdSet.has(item.id))
    try {
      await dbDelete(targetIds)
      if (onAfterDelete) await onAfterDelete(removedItems)
    } catch (e) {
      console.error(`[${name}] multi-delete failed:`, e)
      throw e
    }
    triggerSync()
    return targetIds.length
  }

  // ── Refresh ──

  async function refreshList() {
    try {
      const rows = await dbGet()
      list.value = rows.map((item) => normalizer(item))
    } catch (e) {
      console.error(`[${name}] refreshList failed:`, e)
      throw e
    }
  }

  // ── Backup import ──

  async function importBackup(incoming, { reconcileMissing = false, preserveLocalNewerThan = 0 } = {}) {
    const items = Array.isArray(incoming) ? incoming : []
    if (items.length === 0) {
      return { added: 0, updated: 0, removed: 0, skipped: 0, total: list.value.length }
    }

    const importer = importNormalizer || normalizer
    const existingMap = new Map(list.value.map((item) => [item.id, item]))
    const incomingIds = new Set()
    // Dedup incoming by id — keep latest
    const incomingMap = new Map()
    for (const raw of items) {
      if (!raw?.id) continue
      const existing = incomingMap.get(raw.id)
      if (!existing || Number(raw.updatedAt || 0) > Number(existing.updatedAt || 0)) {
        incomingMap.set(raw.id, raw)
      }
    }

    let added = 0
    let updated = 0
    let skipped = 0
    const recordsToSave = []

    for (const [id, raw] of incomingMap.entries()) {
      incomingIds.add(id)
      const existing = existingMap.get(id)

      if (!existing) {
        recordsToSave.push(importer(raw))
        existingMap.set(id, importer(raw))
        added += 1
        continue
      }

      const incomingTs = Number(raw.updatedAt || 0)
      const existingTs = Number(existing.updatedAt || 0)

      if (incomingTs >= existingTs) {
        const merged = { ...existing, ...raw, id }
        recordsToSave.push(importer(merged))
        existingMap.set(id, importer(merged))
        updated += 1
      } else {
        skipped += 1
      }
    }

    // Reconcile missing
    let removed = 0
    if (reconcileMissing) {
      const preserveTs = Number(preserveLocalNewerThan || 0)
      const idsToRemove = []
      for (const [id, existing] of existingMap.entries()) {
        if (incomingIds.has(id)) continue
        if (preserveTs > 0 && Number(existing.updatedAt || 0) > preserveTs) continue
        idsToRemove.push(id)
      }
      if (idsToRemove.length > 0) {
        const removedItems = idsToRemove.map((id) => existingMap.get(id)).filter(Boolean)
        for (const id of idsToRemove) existingMap.delete(id)
        try {
          await dbDelete(idsToRemove)
          if (onAfterDelete) await onAfterDelete(removedItems)
        } catch (e) {
          console.error(`[${name}] import reconcile delete failed:`, e)
        }
        removed = idsToRemove.length
      }
    }

    if (recordsToSave.length > 0) {
      if (onBeforeSave) await onBeforeSave(recordsToSave)
      await dbSave(recordsToSave)
    }
    if (onAfterImport) await onAfterImport()

    list.value = Array.from(existingMap.values())
    return { added, updated, removed, skipped, total: list.value.length }
  }

  return {
    list,
    isReady,
    getById,
    init,
    add,
    update,
    remove,
    removeMultiple,
    refreshList,
    importBackup
  }
}
