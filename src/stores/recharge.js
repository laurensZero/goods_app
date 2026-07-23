// @ts-check
import { defineStore } from 'pinia'
import { computed } from 'vue'
import { getRechargeRecords, addRechargeRecord, saveRechargeRecords, deleteRechargeRecords } from '@/utils/db/index'
import { createStoreCore, createAutoPush } from '@/stores/storeCore'
import { createLogger } from '@/utils/logger'

const STORAGE_KEY = 'goods_recharge_records_v1'
const log = createLogger('recharge')

function normalizeRecord(input = {}) {
  const now = Date.now()
  const amount = Number(input.amount)
  const chargedAt = String(input.chargedAt || '').trim()

  return {
    id: String(input.id || `recharge_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`),
    game: String(input.game || '').trim(),
    itemName: String(input.itemName || '').trim(),
    amount: Number.isFinite(amount) ? amount : 0,
    chargedAt,
    note: String(input.note || '').trim(),
    image: String(input.image || '').trim(),
    deleted: Boolean(input.deleted),
    updatedAt: Number(input.updatedAt || now)
  }
}

function isValidRechargeRecord(item) {
  const amount = Number(item?.amount || 0)
  return Number.isFinite(amount) && amount >= 0
}

function sortByDateDesc(list) {
  const tsCache = new Map()
  for (const item of list) {
    tsCache.set(item, new Date(item.chargedAt).getTime() || 0)
  }
  return [...list].sort((a, b) => {
    const dateDiff = tsCache.get(b) - tsCache.get(a)
    if (dateDiff !== 0) return dateDiff
    return Number(b.updatedAt || 0) - Number(a.updatedAt || 0)
  })
}

function toBackupRecord(item = {}, { stripImage = true } = {}) {
  const normalized = normalizeRecord(item)
  const backup = {
    id: normalized.id,
    game: normalized.game,
    itemName: normalized.itemName,
    amount: normalized.amount,
    chargedAt: normalized.chargedAt,
    note: normalized.note,
    deleted: normalized.deleted,
    updatedAt: normalized.updatedAt
  }

  if (!stripImage) {
    backup.image = normalized.image
  }

  return backup
}

function buildLatestRecordMap(list = []) {
  const map = new Map()

  for (const item of list) {
    const normalized = normalizeRecord(item)
    // Keep deleted records so importBackup can apply remote deletions.
    // isValidRechargeRecord check still applies (amount >= 0 required).
    if (!isValidRechargeRecord(normalized) && !normalized.deleted) continue

    const prev = map.get(normalized.id)
    if (!prev || Number(normalized.updatedAt || 0) >= Number(prev.updatedAt || 0)) {
      map.set(normalized.id, normalized)
    }
  }

  return map
}

export const useRechargeStore = defineStore('recharge', () => {
  const core = createStoreCore({
    name: 'recharge',
    dbGet: getRechargeRecords,
    dbSave: saveRechargeRecords,
    dbDelete: deleteRechargeRecords,
    normalizer: normalizeRecord,
    validator: isValidRechargeRecord,
    syncDomain: 'recharge'
  })

  const { list: records, isReady, getById, init: coreInit, add, update, remove, removeMultiple, refreshList, importBackup: coreImportBackup } = core

  const triggerSync = createAutoPush('recharge')

  // ── Recharge-specific computed ──

  const activeRecords = computed(() => records.value.filter((item) => !item.deleted))
  const deletedRecords = computed(() => records.value.filter((item) => item.deleted))
  const sortedRecords = computed(() => sortByDateDesc(activeRecords.value))
  const totalAmount = computed(() => activeRecords.value.reduce((sum, item) => sum + Number(item.amount || 0), 0))

  const groupedByGame = computed(() => {
    const groups = new Map()
    for (const record of sortedRecords.value) {
      const key = record.game || '未分类游戏'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(record)
    }
    return Array.from(groups.entries()).map(([game, items]) => ({
      game,
      items,
      amount: items.reduce((sum, item) => sum + Number(item.amount || 0), 0)
    }))
  })

  // ── Init with migration ──

  async function migrateFromLocalStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) {
        log.debug('migration:localStorage:skipped', { reason: 'empty' })
        return
      }

      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed) || parsed.length === 0) {
        localStorage.removeItem(STORAGE_KEY)
        log.debug('migration:localStorage:skipped', {
          reason: Array.isArray(parsed) ? 'empty-array' : 'invalid-shape'
        })
        return
      }

      const normalized = parsed.map((item) => normalizeRecord(item))
      const valid = normalized.filter((item) => isValidRechargeRecord(item))
      if (valid.length > 0) {
        await saveRechargeRecords(valid)
        records.value = valid.filter((item) => !item.deleted)
      }

      localStorage.removeItem(STORAGE_KEY)
      log.debug('migration:localStorage', {
        parsed: parsed.length,
        migrated: valid.length,
        invalid: normalized.length - valid.length
      })
    } catch (error) {
      log.error('migration:failed', error)
    }
  }

  async function init() {
    if (isReady.value) {
      log.debug('init:skipped', { reason: 'ready', records: records.value.length })
      return
    }
    log.debug('init:start')
    await migrateFromLocalStorage()
    await coreInit()
    log.debug('init:done', { total: records.value.length, active: activeRecords.value.length, deleted: deletedRecords.value.length })
  }

  // ── Recharge-specific CRUD ──

  async function addRecord(data = {}) {
    const next = normalizeRecord(data)
    if (!isValidRechargeRecord(next)) {
      log.debug('record:add:skipped', { reason: 'invalid', amount: next.amount })
      return null
    }
    try {
      await addRechargeRecord(next)
      records.value.unshift(next)
      triggerSync()
      log.debug('record:add:done', {
        id: next.id,
        game: next.game,
        amount: next.amount,
        chargedAt: next.chargedAt,
        total: records.value.length
      })
      return next
    } catch (error) {
      log.error('record:add:failed', { id: next.id }, error)
      throw error
    }
  }

  async function updateRecord(id, data = {}) {
    const index = records.value.findIndex((item) => item.id === id)
    if (index < 0) {
      log.debug('record:update:skipped', { id, reason: 'not-found' })
      return false
    }

    const next = normalizeRecord({
      ...records.value[index],
      ...data,
      id,
      updatedAt: Date.now()
    })

    if (!isValidRechargeRecord(next)) {
      log.debug('record:update:skipped', { id, reason: 'invalid', amount: next.amount })
      return false
    }

    try {
      await addRechargeRecord(next)
      records.value[index] = next
      triggerSync()
      log.debug('record:update:done', {
        id,
        game: next.game,
        amount: next.amount,
        chargedAt: next.chargedAt
      })
      return true
    } catch (error) {
      log.error('record:update:failed', { id }, error)
      throw error
    }
  }

  async function deleteRecord(target) {
    const id = typeof target === 'string' ? target : String(target?.id || '').trim()
    if (id) {
      return permanentDelete(id)
    }

    if (!target || typeof target !== 'object') {
      log.debug('record:delete:skipped', { reason: 'invalid-target' })
      return false
    }

    const index = records.value.findIndex((item) => (
      item.game === target.game
      && item.itemName === target.itemName
      && Number(item.amount || 0) === Number(target.amount || 0)
      && item.chargedAt === target.chargedAt
      && item.note === target.note
      && item.image === target.image
    ))

    if (index < 0) {
      log.debug('record:delete:skipped', { reason: 'not-found' })
      return false
    }

    return permanentDelete(records.value[index].id)
  }

  function restoreRecord() {
    return false
  }

  async function permanentDelete(id) {
    const target = records.value.find((item) => item.id === id)
    if (!target) {
      log.debug('record:delete:skipped', { id, reason: 'not-found' })
      return false
    }
    if (target.deleted) {
      log.debug('record:delete:skipped', { id, reason: 'already-deleted' })
      return false
    }
    try {
      target.deleted = true
      target.updatedAt = Date.now()
      await addRechargeRecord(target)
      triggerSync()
      log.debug('record:delete:done', { id, total: activeRecords.value.length })
      return true
    } catch (error) {
      log.error('record:delete:failed', { id }, error)
      throw error
    }
  }

  async function purgeSyncedDeleted() {
    const ids = records.value.filter((item) => item.deleted).map((item) => item.id)
    if (ids.length === 0) return 0
    try {
      await deleteRechargeRecords(ids)
      records.value = records.value.filter((item) => !item.deleted)
      log.debug('records:purge:done', { purged: ids.length, remaining: records.value.length })
      return ids.length
    } catch (error) {
      log.error('records:purge:failed', { ids }, error)
      throw error
    }
  }

  async function clearInvalidRecords() {
    // Only remove non-deleted records that fail validation.
    // Deleted records (soft-deleted) are preserved for sync.
    const invalidIds = records.value
      .filter((item) => !item.deleted && !isValidRechargeRecord(item))
      .map((item) => item.id)
    if (invalidIds.length === 0) {
      log.debug('records:cleanup:skipped', { total: records.value.length })
      return 0
    }
    try {
      await deleteRechargeRecords(invalidIds)
      records.value = records.value.filter((item) => !invalidIds.includes(item.id))
      log.debug('records:cleanup:done', { removed: invalidIds.length, total: records.value.length })
      return invalidIds.length
    } catch (error) {
      log.error('records:cleanup:failed', { removed: invalidIds.length }, error)
      throw error
    }
  }

  // ── Backup ──

  function exportBackup({ includeDeleted = true, stripImage = true } = {}) {
    return records.value
      .filter((item) => includeDeleted || !item.deleted)
      .map((item) => toBackupRecord(item, { stripImage }))
  }

  async function importBackup(list = [], { reconcileMissing = false, preserveLocalNewerThan = 0 } = {}) {
    if (!Array.isArray(list) || list.length === 0) {
      const result = { added: 0, updated: 0, removed: 0, skipped: 0, total: records.value.length }
      log.debug('backup:import:skipped', { reason: 'empty', result })
      return result
    }

    const currentMap = new Map(records.value.map((item) => [item.id, item]))
    const incomingMap = buildLatestRecordMap(list)
    let added = 0
    let updated = 0
    let removed = 0
    let skipped = 0

    for (const [id, incoming] of incomingMap.entries()) {
      const existing = currentMap.get(id)

      if (!existing) {
        currentMap.set(id, incoming)
        added += 1
        continue
      }

      // Preserve existing image if incoming has none
      if (!incoming.image && existing.image) {
        incoming.image = existing.image
      }

      if (Number(incoming.updatedAt || 0) >= Number(existing.updatedAt || 0)) {
        currentMap.set(id, incoming)
        updated += 1
      } else {
        skipped += 1
      }
    }

    if (reconcileMissing) {
      const preserveTs = Number(preserveLocalNewerThan || 0)
      for (const id of currentMap.keys()) {
        if (!incomingMap.has(id)) {
          const existing = currentMap.get(id)
          const existingUpdatedAt = Number(existing?.updatedAt || 0)
          if (preserveTs > 0 && existingUpdatedAt > preserveTs) {
            continue
          }
          currentMap.delete(id)
          removed += 1
        }
      }
    }

    if (added === 0 && updated === 0 && removed === 0) {
      const result = { added, updated, removed, skipped, total: records.value.length }
      log.debug('backup:import:noop', {
        incoming: list.length,
        reconcileMissing,
        preserveLocalNewerThan: Boolean(preserveLocalNewerThan),
        result
      })
      return result
    }

    const merged = Array.from(currentMap.values())
    try {
      await saveRechargeRecords(merged)
      records.value = merged
      const result = { added, updated, removed, skipped, total: records.value.length }
      log.debug('backup:import:done', {
        incoming: list.length,
        reconcileMissing,
        preserveLocalNewerThan: Boolean(preserveLocalNewerThan),
        result
      })
      return result
    } catch (error) {
      log.error('backup:import:failed', { incoming: list.length }, error)
      throw error
    }
  }

  async function replaceBackup(list = []) {
    const currentMap = new Map(records.value.map((item) => [item.id, item]))
    const incomingMap = buildLatestRecordMap(Array.isArray(list) ? list : [])
    let added = 0
    let updated = 0

    for (const [id, incoming] of incomingMap.entries()) {
      const existing = currentMap.get(id)
      if (!existing) {
        added += 1
        continue
      }

      if (!incoming.image && existing.image) {
        incoming.image = existing.image
      }

      if (Number(incoming.updatedAt || 0) !== Number(existing.updatedAt || 0)
        || String(incoming.chargedAt || '') !== String(existing.chargedAt || '')
        || Number(incoming.amount || 0) !== Number(existing.amount || 0)) {
        updated += 1
      }
    }

    const incoming = Array.from(incomingMap.values())
    const result = {
      added,
      updated,
      removed: Math.max(0, currentMap.size - incomingMap.size),
      total: incoming.length
    }

    try {
      await saveRechargeRecords(incoming)
      records.value = incoming
      log.debug('backup:replace:done', {
        incoming: Array.isArray(list) ? list.length : 0,
        result
      })
      return result
    } catch (error) {
      log.error('backup:replace:failed', { incoming: Array.isArray(list) ? list.length : 0 }, error)
      throw error
    }
  }

  return {
    records,
    isReady,
    activeRecords,
    deletedRecords,
    sortedRecords,
    totalAmount,
    groupedByGame,
    getById,
    init,
    addRecord,
    updateRecord,
    deleteRecord,
    restoreRecord,
    permanentDelete,
    purgeSyncedDeleted,
    clearInvalidRecords,
    exportBackup,
    importBackup,
    replaceBackup
  }
})
