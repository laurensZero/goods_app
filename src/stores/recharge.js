// @ts-check
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { getRechargeRecords, addRechargeRecord, saveRechargeRecords, deleteRechargeRecords } from '@/utils/db'
import { useSyncStore } from '@/stores/sync'

const STORAGE_KEY = 'goods_recharge_records_v1'

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
  return [...list].sort((a, b) => {
    const dateDiff = new Date(b.chargedAt).getTime() - new Date(a.chargedAt).getTime()
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
    if (normalized.deleted) continue
    if (!isValidRechargeRecord(normalized)) continue

    const prev = map.get(normalized.id)
    if (!prev || Number(normalized.updatedAt || 0) >= Number(prev.updatedAt || 0)) {
      map.set(normalized.id, normalized)
    }
  }

  return map
}

export const useRechargeStore = defineStore('recharge', () => {
  const records = ref([])
  const isReady = ref(false)

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

  async function loadFromDB() {
    try {
      const rows = await getRechargeRecords()
      const normalized = rows.map((item) => normalizeRecord(item))
      const valid = normalized.filter((item) => isValidRechargeRecord(item) && !item.deleted)
      records.value = valid
    } catch (error) {
      console.error('[recharge] load from DB failed:', error)
      records.value = []
    }
  }

  async function migrateFromLocalStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return

      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed) || parsed.length === 0) {
        localStorage.removeItem(STORAGE_KEY)
        return
      }

      const normalized = parsed.map((item) => normalizeRecord(item))
      const valid = normalized.filter((item) => isValidRechargeRecord(item))
      if (valid.length > 0) {
        await saveRechargeRecords(valid)
        records.value = valid.filter((item) => !item.deleted)
      }

      localStorage.removeItem(STORAGE_KEY)
      console.log(`[recharge] migrated ${valid.length} records from localStorage to SQLite`)
    } catch (error) {
      console.error('[recharge] migration from localStorage failed:', error)
    }
  }

  async function init() {
    if (isReady.value) return
    await migrateFromLocalStorage()
    await loadFromDB()
    isReady.value = true
  }

  async function addRecord(data = {}) {
    const next = normalizeRecord(data)
    if (!isValidRechargeRecord(next)) {
      return null
    }
    await addRechargeRecord(next)
    records.value.unshift(next)
    useSyncStore().autoPushGoods()
    return next
  }

  async function updateRecord(id, data = {}) {
    const index = records.value.findIndex((item) => item.id === id)
    if (index < 0) return false

    const next = normalizeRecord({
      ...records.value[index],
      ...data,
      id,
      updatedAt: Date.now()
    })

    if (!isValidRechargeRecord(next)) {
      return false
    }

    await addRechargeRecord(next)
    records.value[index] = next
    useSyncStore().autoPushGoods()
    return true
  }

  async function deleteRecord(target) {
    const id = typeof target === 'string' ? target : String(target?.id || '').trim()
    if (id) {
      return permanentDelete(id)
    }

    if (!target || typeof target !== 'object') return false

    const index = records.value.findIndex((item) => (
      item.game === target.game
      && item.itemName === target.itemName
      && Number(item.amount || 0) === Number(target.amount || 0)
      && item.chargedAt === target.chargedAt
      && item.note === target.note
      && item.image === target.image
    ))

    if (index < 0) return false

    return permanentDelete(records.value[index].id)
  }

  function restoreRecord() {
    return false
  }

  async function permanentDelete(id) {
    const next = records.value.filter((item) => item.id !== id)
    if (next.length === records.value.length) return false
    await deleteRechargeRecords([id])
    records.value = next
    useSyncStore().autoPushGoods()
    return true
  }

  async function clearInvalidRecords() {
    const next = records.value.filter((item) => isValidRechargeRecord(item) && !item.deleted)
    if (next.length === records.value.length) return 0
    const removed = records.value.length - next.length
    const removedIds = records.value
      .filter((item) => !next.includes(item))
      .map((item) => item.id)
    if (removedIds.length > 0) {
      await deleteRechargeRecords(removedIds)
    }
    records.value = next
    return removed
  }

  function exportBackup({ includeDeleted = true, stripImage = true } = {}) {
    return records.value
      .filter((item) => includeDeleted || !item.deleted)
      .map((item) => toBackupRecord(item, { stripImage }))
  }

  async function importBackup(list = []) {
    if (!Array.isArray(list) || list.length === 0) {
      return { added: 0, updated: 0, skipped: 0, total: records.value.length }
    }

    const currentMap = new Map(records.value.map((item) => [item.id, item]))
    const incomingMap = buildLatestRecordMap(list)
    let added = 0
    let updated = 0
    let skipped = 0

    for (const [id, incoming] of incomingMap.entries()) {
      const existing = currentMap.get(id)

      if (!existing) {
        currentMap.set(id, incoming)
        added += 1
        continue
      }

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

    if (added === 0 && updated === 0) {
      return { added, updated, skipped, total: records.value.length }
    }

    const merged = Array.from(currentMap.values())
    await saveRechargeRecords(merged)
    records.value = merged
    return { added, updated, skipped, total: records.value.length }
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

      if (JSON.stringify(incoming) !== JSON.stringify(existing)) {
        updated += 1
      }
    }

    const incoming = Array.from(incomingMap.values())
    await saveRechargeRecords(incoming)
    records.value = incoming

    return {
      added,
      updated,
      removed: Math.max(0, currentMap.size - incomingMap.size),
      total: records.value.length
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
    init,
    addRecord,
    updateRecord,
    deleteRecord,
    restoreRecord,
    permanentDelete,
    clearInvalidRecords,
    exportBackup,
    importBackup,
    replaceBackup
  }
})
