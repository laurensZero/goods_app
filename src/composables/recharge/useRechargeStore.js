import { computed, ref } from 'vue'

const STORAGE_KEY = 'goods_recharge_records_v1'

const records = ref([])
let initialized = false

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

function saveToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records.value))
  }
  catch (error) {
    console.error('[recharge] save failed:', error)
  }
}

function isValidRechargeRecord(item) {
  const amount = Number(item?.amount || 0)
  return Number.isFinite(amount) && amount >= 0
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      records.value = []
      return
    }

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      records.value = []
      return
    }

    const normalized = parsed.map((item) => normalizeRecord(item))
    const valid = normalized.filter((item) => isValidRechargeRecord(item) && !item.deleted)
    records.value = valid

    if (valid.length !== normalized.length) {
      saveToStorage()
    }
  }
  catch (error) {
    console.error('[recharge] load failed:', error)
    records.value = []
  }
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

export function useRechargeStore() {
  if (!initialized) {
    init()
  }

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

  function init() {
    if (initialized) return
    initialized = true
    loadFromStorage()
  }

  function addRecord(data = {}) {
    const next = normalizeRecord(data)
    if (!isValidRechargeRecord(next)) {
      return null
    }
    records.value.unshift(next)
    saveToStorage()
    return next
  }

  function updateRecord(id, data = {}) {
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

    records.value[index] = next
    saveToStorage()
    return true
  }

  function deleteRecord(target) {
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

  function restoreRecord(id) {
    return false
  }

  function permanentDelete(id) {
    const next = records.value.filter((item) => item.id !== id)
    if (next.length === records.value.length) return false
    records.value = next
    saveToStorage()
    return true
  }

  function clearInvalidRecords() {
    const next = records.value.filter((item) => isValidRechargeRecord(item) && !item.deleted)
    if (next.length === records.value.length) return 0
    const removed = records.value.length - next.length
    records.value = next
    saveToStorage()
    return removed
  }

  function exportBackup({ includeDeleted = true, stripImage = true } = {}) {
    return records.value
      .filter((item) => includeDeleted || !item.deleted)
      .map((item) => toBackupRecord(item, { stripImage }))
  }

  function importBackup(list = []) {
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

    records.value = Array.from(currentMap.values())
    saveToStorage()
    return { added, updated, skipped, total: records.value.length }
  }

  function replaceBackup(list = []) {
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

    records.value = Array.from(incomingMap.values())
    saveToStorage()

    return {
      added,
      updated,
      removed: Math.max(0, currentMap.size - incomingMap.size),
      total: records.value.length
    }
  }

  return {
    records,
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
}
