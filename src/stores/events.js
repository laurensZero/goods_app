// @ts-check
import { defineStore } from 'pinia'
import { computed, triggerRef } from 'vue'
import { addEvent, deleteEvents, getEvents, saveEvents } from '@/utils/db/index'
import { normalizeTracks } from '@/utils/tracks'
import { buildCloudImageUri, parseCloudImageUri } from '@/utils/goods/images'
import { collectManagedLocalImagePathsFromEvent, deleteManagedLocalImages } from '@/utils/image/localImage'
import { signalImageCacheRefresh } from '@/utils/image/cache'
import { parseNumericPrice } from '@/stores/goodsHelpers'
import { createStoreCore, createAutoPush } from '@/stores/storeCore'
import { replaceEventBase64WithPublicUrls } from '@/stores/goodsMigrations'

function normalizeOtherExpenses(expenses) {
  if (!Array.isArray(expenses)) return []

  return expenses
    .map((item, index) => ({
      id: String(item?.id || `expense_${Date.now()}_${index}`),
      name: String(item?.name || '').trim(),
      amount: String(item?.amount || '').trim()
    }))
    .filter((item) => item.name || item.amount)
}

function getSortDate(event) {
  if (event?.startDate) return event.startDate
  if (!event || !event.createdAt) return '0000-00-00'
  const d = new Date(event.createdAt)
  if (Number.isNaN(d.getTime())) return '0000-00-00'
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getYearMonth(dateStr) {
  if (!dateStr) return ''
  return String(dateStr).slice(0, 7)
}

function diffRemovedManagedImagePaths(previousEvent, nextEvent) {
  const previousPaths = collectManagedLocalImagePathsFromEvent(previousEvent)
  const nextPaths = collectManagedLocalImagePathsFromEvent(nextEvent)
  return [...previousPaths].filter((path) => !nextPaths.has(path))
}

function normalizeEvent(data) {
  const now = Date.now()
  const id = data.id || String(now)
  return {
    id,
    name: String(data.name || '').trim(),
    type: String(data.type || '').trim(),
    startDate: String(data.startDate || '').trim(),
    endDate: String(data.endDate || data.startDate || '').trim(),
    location: String(data.location || '').trim(),
    description: String(data.description || '').trim(),
    coverImage: String(data.coverImage || '').trim(),
    coverImageData: data.coverImageData ? { ...data.coverImageData } : null,
    photos: Array.isArray(data.photos) ? data.photos : [],
    tracks: normalizeTracks(data.tracks),
    ticketPrice: String(data.ticketPrice || '').trim(),
    ticketType: String(data.ticketType || '').trim(),
    seatInfo: String(data.seatInfo || '').trim(),
    otherExpenses: normalizeOtherExpenses(data.otherExpenses),
    linkedGoodsIds: Array.isArray(data.linkedGoodsIds) ? data.linkedGoodsIds : [],
    tags: Array.isArray(data.tags) ? data.tags : [],
    deleted: Boolean(data.deleted),
    createdAt: data.createdAt || now,
    updatedAt: data.updatedAt || now
  }
}

export const useEventsStore = defineStore('events', () => {
  const core = createStoreCore({
    name: 'events',
    useShallowRef: true,
    dbGet: getEvents,
    dbSave: saveEvents,
    dbDelete: deleteEvents,
    normalizer: normalizeEvent,
    syncDomain: 'events',
    onAfterDelete: async (deletedItems) => {
      const paths = new Set()
      for (const item of deletedItems) {
        for (const path of collectManagedLocalImagePathsFromEvent(item)) {
          paths.add(path)
        }
      }
      if (paths.size > 0) await deleteManagedLocalImages(paths)
    }
  })

  const { list, isReady, getById, init: coreInit, refreshList } = core

  const triggerSync = createAutoPush('events')

  // ── Events-specific computed ──

  const activeList = computed(() => list.value.filter((item) => !item.deleted))

  const groupedByMonth = computed(() => {
    const sorted = [...activeList.value].sort((a, b) => getSortDate(b).localeCompare(getSortDate(a)))
    const grouped = {}

    for (const event of sorted) {
      const yearMonth = getYearMonth(event.startDate)
      const key = yearMonth && yearMonth.length >= 7 ? yearMonth : 'undated'
      if (!grouped[key]) grouped[key] = []
      grouped[key].push(event)
    }

    return Object.entries(grouped)
      .sort(([a], [b]) => {
        if (a === 'undated') return 1
        if (b === 'undated') return -1
        return b.localeCompare(a)
      })
      .map(([yearMonth, items]) => {
        const isUndated = yearMonth === 'undated'
        const [year, month] = isUndated ? ['', ''] : yearMonth.split('-')

        return {
          yearMonth,
          year: isUndated ? '' : year,
          month: isUndated ? '' : String(parseInt(month, 10)),
          isUndated,
          count: items.length,
          totalTicket: items.reduce((sum, item) => sum + parseNumericPrice(item.ticketPrice), 0),
          items
        }
      })
  })

  const sortedList = computed(() => {
    const result = []
    for (const group of groupedByMonth.value) {
      for (const item of group.items) {
        result.push(item)
      }
    }
    return result
  })

  const totalTicketAll = computed(() =>
    activeList.value.reduce((sum, item) => sum + parseNumericPrice(item.ticketPrice), 0)
  )

  // ── Init ──

  async function init() {
    if (isReady.value) return
    await coreInit()
    replaceEventBase64WithPublicUrls(list).catch(() => {})
  }

  // ── CRUD wrappers ──

  async function addEventRecord(data) {
    const record = normalizeEvent(data)
    const existingIndex = list.value.findIndex((item) => item.id === record.id)
    if (existingIndex !== -1) {
      list.value[existingIndex] = { ...list.value[existingIndex], ...record }
    } else {
      list.value.unshift(record)
    }
    triggerRef(list)
    try {
      await addEvent(record)
    } catch (e) {
      console.error('[events] addEventRecord DB write failed:', e)
      throw e
    }
    triggerSync()
    return record
  }

  async function updateEventRecord(id, data, preserveTimestamp = false) {
    const index = list.value.findIndex((item) => item.id === id)
    if (index === -1) return null

    const previous = list.value[index]
    const normalizedData = {
      ...data,
      tracks: normalizeTracks(data?.tracks),
      otherExpenses: normalizeOtherExpenses(data?.otherExpenses)
    }

    const next = {
      ...previous,
      ...normalizedData,
      id,
      updatedAt: preserveTimestamp ? (data.updatedAt || Date.now()) : Date.now()
    }
    const removedPaths = diffRemovedManagedImagePaths(previous, next)
    list.value[index] = next

    triggerRef(list)
    try {
      await addEvent(next)
      await deleteManagedLocalImages(removedPaths)
    } catch (e) {
      console.error('[events] updateEventRecord DB write failed:', e)
      throw e
    }
    triggerSync()
    return id
  }

  async function removeEventRecord(id) {
    const index = list.value.findIndex((item) => item.id === id)
    if (index === -1) return
    const existing = list.value[index]
    if (existing.deleted) return

    const deleted = { ...existing, deleted: true, updatedAt: Date.now() }
    list.value = [...list.value.slice(0, index), deleted, ...list.value.slice(index + 1)]
    try {
      await addEvent(deleted)
    } catch (e) {
      console.error('[events] removeEventRecord DB write failed:', e)
      throw e
    }
    triggerSync()
  }

  async function removeMultipleEventRecords(ids) {
    const targetIds = [...new Set(Array.from(ids || []).filter(Boolean))]
    if (targetIds.length === 0) return

    const targetIdSet = new Set(targetIds)
    const now = Date.now()
    let changed = false
    list.value = list.value.map(item => {
      if (!targetIdSet.has(item.id) || item.deleted) return item
      changed = true
      return { ...item, deleted: true, updatedAt: now }
    })
    if (!changed) return

    try {
      await saveEvents(list.value.filter((item) => targetIdSet.has(item.id) && item.deleted))
    } catch (e) {
      console.error('[events] removeMultipleEventRecords DB write failed:', e)
      throw e
    }
    triggerSync()
  }

  async function purgeSyncedDeleted() {
    const ids = list.value.filter((item) => item.deleted).map((item) => item.id)
    if (ids.length === 0) return 0
    try {
      const removedPaths = new Set()
      for (const item of list.value) {
        if (!item.deleted) continue
        for (const path of collectManagedLocalImagePathsFromEvent(item)) {
          removedPaths.add(path)
        }
      }
      await Promise.all([deleteEvents(ids), deleteManagedLocalImages(removedPaths)])
      list.value = list.value.filter((item) => !item.deleted)
      return ids.length
    } catch (e) {
      console.error('[events] purgeSyncedDeleted failed:', e)
      throw e
    }
  }

  // ── Backup import (events-specific: coverImageData backfill, image cleanup) ──

  async function importEventsBackup(events, { reconcileMissing = false, preserveLocalNewerThan = 0 } = {}) {
    const incoming = Array.isArray(events) ? events : []
    const incomingIds = new Set()
    let added = 0
    let updated = 0
    let removed = 0

    const existingMap = new Map(list.value.map((item) => [item.id, item]))

    const recordsToSave = []
    const cleanupPaths = new Set()

    for (const event of incoming) {
      if (!event?.id) continue

      incomingIds.add(event.id)

      const existing = existingMap.get(event.id)
      if (!existing) {
        const now = Date.now()
        recordsToSave.push(normalizeEvent({ ...event, createdAt: event.createdAt || now, updatedAt: event.updatedAt || now }))
        added += 1
        continue
      }

      const incomingUpdatedAt = Number(event.updatedAt) || 0
      const existingUpdatedAt = Number(existing.updatedAt) || 0

      // Apply remote deletion if incoming timestamp is newer.
      // 时间戳相等且本地已是删除态时跳过——增量拉取的时钟重叠窗口会反复拉回本机
      // 刚推送的行，无变化也重写会导致每次拉取都全量刷新视图。
      if (event.deleted && incomingUpdatedAt >= existingUpdatedAt) {
        if (!existing.deleted || incomingUpdatedAt > existingUpdatedAt) {
          recordsToSave.push(normalizeEvent({ ...existing, deleted: true, updatedAt: incomingUpdatedAt }))
          updated += 1
        }
        continue
      }

      const incomingCoverFileName = String(event?.coverImageData?.cloudFileName || parseCloudImageUri(event?.coverImage) || '').trim()
      const existingCoverFileName = String(existing?.coverImageData?.cloudFileName || parseCloudImageUri(existing?.coverImage) || '').trim()
      const shouldBackfillCoverImageData = !!incomingCoverFileName && !existingCoverFileName

      if (incomingUpdatedAt > existingUpdatedAt || shouldBackfillCoverImageData) {
        const normalizedCoverImageData = event?.coverImageData && typeof event.coverImageData === 'object'
          ? {
              ...event.coverImageData,
              uri: event.coverImageData.uri || (incomingCoverFileName ? buildCloudImageUri(incomingCoverFileName) : '')
            }
          : (incomingCoverFileName
              ? {
                  uri: buildCloudImageUri(incomingCoverFileName),
                  storageMode: 'cloud-local',
                  cloudFileName: incomingCoverFileName
                }
              : null)

        const next = {
          ...existing,
          ...event,
          id: event.id,
          coverImageData: normalizedCoverImageData || existing.coverImageData || null,
          updatedAt: shouldBackfillCoverImageData ? existingUpdatedAt : event.updatedAt
        }
        next.tracks = normalizeTracks(next.tracks)
        recordsToSave.push(next)
        for (const path of diffRemovedManagedImagePaths(existing, next)) {
          cleanupPaths.add(path)
        }
        updated += 1
      }
    }

    if (recordsToSave.length > 0) {
      await saveEvents(recordsToSave)
    }
    if (cleanupPaths.size > 0) {
      await deleteManagedLocalImages(cleanupPaths)
    }

    if (reconcileMissing) {
      const preserveTs = Number(preserveLocalNewerThan || 0)
      const missingIds = list.value
        .filter((item) => {
          if (!item?.id || incomingIds.has(item.id)) return false
          const localUpdatedAt = Number(item.updatedAt || 0)
          if (preserveTs > 0 && localUpdatedAt > preserveTs) return false
          return true
        })
        .map((item) => item.id)

      if (missingIds.length > 0) {
        removed = missingIds.length
        const removedPaths = new Set()
        for (const item of list.value) {
          if (!missingIds.includes(item.id)) continue
          for (const path of collectManagedLocalImagePathsFromEvent(item)) {
            removedPaths.add(path)
          }
        }
        await Promise.all([deleteEvents(missingIds), deleteManagedLocalImages(removedPaths)])
      }
    }

    // 无变化不刷新：全量 refreshList 会整体替换 list 并触发所有依赖视图重渲染
    if (added > 0 || updated > 0 || removed > 0) {
      await refreshList()
    }
    return { added, updated, removed }
  }

  // ── Mark media as remote ──

  async function markMediaAsRemote(preparedMediaByEventId) {
    if (!(preparedMediaByEventId instanceof Map) || preparedMediaByEventId.size === 0) return

    const updatedRecords = []
    for (let index = 0; index < list.value.length; index += 1) {
      const current = list.value[index]
      const payload = preparedMediaByEventId.get(current?.id)
      if (!payload) continue

      const next = {
        ...current,
        coverImage: payload.coverImage ?? current.coverImage,
        coverImageData: payload.coverImageData ?? current.coverImageData,
        photos: Array.isArray(payload.photos) ? payload.photos : (Array.isArray(current.photos) ? current.photos : [])
      }

      list.value[index] = next
      updatedRecords.push(next)
    }

    if (updatedRecords.length > 0) {
      await saveEvents(updatedRecords)
      triggerRef(list)
      try {
        signalImageCacheRefresh('resume')
      } catch (e) {
        // ignore
      }
    }
  }

  return {
    list,
    activeList,
    sortedList,
    groupedByMonth,
    totalTicketAll,
    getById,
    isReady,
    init,
    addEventRecord,
    updateEventRecord,
    removeEventRecord,
    removeMultipleEventRecords,
    purgeSyncedDeleted,
    refreshList,
    importEventsBackup,
    markMediaAsRemote
  }
})
