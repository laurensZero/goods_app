import { defineStore } from 'pinia'
import { computed, ref, shallowRef, triggerRef } from 'vue'
import { addEvent, deleteEvents, getEvents } from '@/utils/db'

function parseTicketPrice(value) {
  const price = Number.parseFloat(value)
  return Number.isFinite(price) ? price : 0
}

function getSortDate(event) {
  return String(event?.startDate || event?.createdAt || '').slice(0, 10)
}

function getYearMonth(dateStr) {
  if (!dateStr) return ''
  return String(dateStr).slice(0, 7)
}

export const useEventsStore = defineStore('events', () => {
  const list = shallowRef([])
  const isReady = ref(false)

  const sortedList = computed(() =>
    [...list.value].sort((a, b) => getSortDate(b).localeCompare(getSortDate(a)))
  )

  const groupedByMonth = computed(() => {
    const grouped = {}

    for (const event of sortedList.value) {
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
          totalTicket: items.reduce((sum, item) => sum + parseTicketPrice(item.ticketPrice), 0),
          items
        }
      })
  })

  const totalTicketAll = computed(() =>
    list.value.reduce((sum, item) => sum + parseTicketPrice(item.ticketPrice), 0)
  )

  const getById = computed(() => (id) => list.value.find((item) => item.id === id))

  async function init() {
    list.value = await getEvents()
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
      photos: Array.isArray(data.photos) ? data.photos : [],
      ticketPrice: String(data.ticketPrice || '').trim(),
      ticketType: String(data.ticketType || '').trim(),
      seatInfo: String(data.seatInfo || '').trim(),
      linkedGoodsIds: Array.isArray(data.linkedGoodsIds) ? data.linkedGoodsIds : [],
      tags: Array.isArray(data.tags) ? data.tags : [],
      createdAt: data.createdAt || now,
      updatedAt: now
    }

    const existingIndex = list.value.findIndex((item) => item.id === id)
    if (existingIndex !== -1) {
      list.value[existingIndex] = { ...list.value[existingIndex], ...record }
    } else {
      list.value.unshift(record)
    }

    triggerRef(list)
    await addEvent(record)
    return record
  }

  async function updateEventRecord(id, data) {
    const index = list.value.findIndex((item) => item.id === id)
    if (index === -1) return null

    list.value[index] = {
      ...list.value[index],
      ...data,
      id,
      updatedAt: Date.now()
    }

    triggerRef(list)
    await addEvent(list.value[index])
    return id
  }

  async function removeEventRecord(id) {
    const existing = list.value.find((item) => item.id === id)
    if (!existing) return

    list.value = list.value.filter((item) => item.id !== id)
    await deleteEvents([id])
  }

  async function removeMultipleEventRecords(ids) {
    const targetIds = [...new Set(Array.from(ids || []).filter(Boolean))]
    if (targetIds.length === 0) return

    list.value = list.value.filter((item) => !targetIds.includes(item.id))
    await deleteEvents(targetIds)
  }

  async function refreshList() {
    list.value = await getEvents()
  }

  async function importEventsBackup(events) {
    const incoming = Array.isArray(events) ? events : []
    let added = 0
    let updated = 0

    for (const event of incoming) {
      if (!event?.id) continue

      const existing = list.value.find((item) => item.id === event.id)
      if (!existing) {
        await addEventRecord(event)
        added += 1
        continue
      }

      const incomingUpdatedAt = Number(event.updatedAt) || 0
      const existingUpdatedAt = Number(existing.updatedAt) || 0
      if (incomingUpdatedAt >= existingUpdatedAt) {
        await updateEventRecord(event.id, event)
        updated += 1
      }
    }

    return { added, updated }
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
    importEventsBackup
  }
})
