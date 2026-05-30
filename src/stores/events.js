// @ts-check
import { defineStore } from 'pinia'
import { computed, ref, shallowRef, triggerRef } from 'vue'
import { addEvent, deleteEvents, getEvents, saveEvents } from '@/utils/db/index'
import { normalizeTracks } from '@/utils/tracks'
import { buildGistImageUri, parseGistImageUri } from '@/utils/goods/images'
import { collectManagedLocalImagePathsFromEvent, deleteManagedLocalImages } from '@/utils/image/localImage'
import { signalImageCacheRefresh } from '@/utils/image/cache'
import { useSyncStore } from '@/stores/sync'
import { parseNumericPrice } from '@/stores/goodsHelpers'

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

export const useEventsStore = defineStore('events', () => {
  /** @type {import('vue').ShallowRef<import('@/types/models').EventItem[]>} */
  const list = shallowRef([])
  const isReady = ref(false)

  // Merged: sort + group into a single computed (eliminates intermediate sortedList copy)
  const groupedByMonth = computed(() => {
    const sorted = [...list.value].sort((a, b) => getSortDate(b).localeCompare(getSortDate(a)))
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

  // Derive sortedList from groupedByMonth for backward compatibility
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
    list.value.reduce((sum, item) => sum + parseNumericPrice(item.ticketPrice), 0)
  )

  const _eventsByIdMap = computed(() => new Map(list.value.map((item) => [item.id, item])))
  const getById = computed(() => (id) => _eventsByIdMap.value.get(id))

  async function init() {
    try {
      list.value = await getEvents()
    } catch (e) {
      console.error('[events] init: getEvents failed, starting with empty list:', e)
      list.value = []
    }
    isReady.value = true
  }

  async function addEventRecord(data) {
    const now = Date.now()
    const id = data.id || String(now)
    const record = {
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
      createdAt: data.createdAt || now,
      updatedAt: data.updatedAt || now
    }

    const existingIndex = list.value.findIndex((item) => item.id === id)
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
    useSyncStore().autoPushGoods()
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
    useSyncStore().autoPushGoods()
    return id
  }

  async function removeEventRecord(id) {
    const existing = list.value.find((item) => item.id === id)
    if (!existing) return

    list.value = list.value.filter((item) => item.id !== id)
    try {
      await deleteEvents([id])
      await deleteManagedLocalImages(collectManagedLocalImagePathsFromEvent(existing))
    } catch (e) {
      console.error('[events] removeEventRecord DB write failed:', e)
      throw e
    }
    useSyncStore().autoPushGoods()
  }

  async function removeMultipleEventRecords(ids) {
    const targetIds = [...new Set(Array.from(ids || []).filter(Boolean))]
    if (targetIds.length === 0) return

    const targetIdSet = new Set(targetIds)
    const removedPaths = new Set()
    for (const item of list.value) {
      if (!targetIdSet.has(item.id)) continue
      for (const path of collectManagedLocalImagePathsFromEvent(item)) {
        removedPaths.add(path)
      }
    }

    list.value = list.value.filter((item) => !targetIds.includes(item.id))
    try {
      await deleteEvents(targetIds)
      await deleteManagedLocalImages(removedPaths)
    } catch (e) {
      console.error('[events] removeMultipleEventRecords DB write failed:', e)
      throw e
    }
    useSyncStore().autoPushGoods()
  }

  async function refreshList() {
    try {
      list.value = await getEvents()
    } catch (e) {
      console.error('[events] refreshList failed:', e)
      throw e
    }
  }

  async function importEventsBackup(events, { reconcileMissing = false, preserveLocalNewerThan = 0 } = {}) {
    const incoming = Array.isArray(events) ? events : []
    const incomingIds = new Set()
    let added = 0
    let updated = 0
    let removed = 0

    // Build Map for O(1) lookup instead of O(n) .find() per incoming item
    const existingMap = new Map(list.value.map((item) => [item.id, item]))

    const recordsToSave = []
    const cleanupPaths = new Set()

    for (const event of incoming) {
      if (!event?.id) continue

      incomingIds.add(event.id)

      const existing = existingMap.get(event.id)
      if (!existing) {
        const now = Date.now()
        recordsToSave.push({
          id: event.id,
          name: String(event.name || '').trim(),
          type: String(event.type || '').trim(),
          startDate: String(event.startDate || '').trim(),
          endDate: String(event.endDate || event.startDate || '').trim(),
          location: String(event.location || '').trim(),
          description: String(event.description || '').trim(),
          coverImage: String(event.coverImage || '').trim(),
          coverImageData: event.coverImageData ? { ...event.coverImageData } : null,
          photos: Array.isArray(event.photos) ? event.photos : [],
          tracks: normalizeTracks(event.tracks),
          ticketPrice: String(event.ticketPrice || '').trim(),
          ticketType: String(event.ticketType || '').trim(),
          seatInfo: String(event.seatInfo || '').trim(),
          otherExpenses: normalizeOtherExpenses(event.otherExpenses),
          linkedGoodsIds: Array.isArray(event.linkedGoodsIds) ? event.linkedGoodsIds : [],
          tags: Array.isArray(event.tags) ? event.tags : [],
          createdAt: event.createdAt || now,
          updatedAt: event.updatedAt || now
        })
        added += 1
        continue
      }

      const incomingUpdatedAt = Number(event.updatedAt) || 0
      const existingUpdatedAt = Number(existing.updatedAt) || 0

      const incomingCoverFileName = String(event?.coverImageData?.gistFileName || parseGistImageUri(event?.coverImage) || '').trim()
      const existingCoverFileName = String(existing?.coverImageData?.gistFileName || parseGistImageUri(existing?.coverImage) || '').trim()
      const shouldBackfillCoverImageData = !!incomingCoverFileName && !existingCoverFileName

      if (incomingUpdatedAt > existingUpdatedAt || shouldBackfillCoverImageData) {
        const normalizedCoverImageData = event?.coverImageData && typeof event.coverImageData === 'object'
          ? {
              ...event.coverImageData,
              uri: event.coverImageData.uri || (incomingCoverFileName ? buildGistImageUri(incomingCoverFileName) : '')
            }
          : (incomingCoverFileName
              ? {
                  uri: buildGistImageUri(incomingCoverFileName),
                  storageMode: 'gist-local',
                  gistFileName: incomingCoverFileName
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

    await refreshList()
    return { added, updated, removed }
  }

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
      // Notify image cache to refresh object URLs so UI picks up updated public URLs
      try {
        signalImageCacheRefresh('resume')
      } catch (e) {
        // ignore
      }
    }
  }

  return {
    list,
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
    refreshList,
    importEventsBackup,
    markMediaAsRemote
  }
})
