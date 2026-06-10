import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import router from '@/router'

export const SALE_REMINDER_DEFAULT_OFFSETS = [1440, 60, 10, 0]
export const SALE_REMINDER_PRESET_OFFSETS = [1440, 60, 10, 0]
export const SALE_REMINDER_CHANNEL_ID = 'sale-reminders'
export const SALE_REMINDER_NOTIFICATION_GROUP = 'goods-sale-reminders'

const SALE_REMINDER_ID_BASE = 900000000
const SALE_REMINDER_ID_RANGE = 1000000000
const NOTIFICATION_MARGIN_MS = 5000

function isNativeNotificationAvailable() {
  return Capacitor.isNativePlatform()
}

export function normalizeSaleAt(value) {
  const normalized = String(value || '').trim()
  if (!normalized) return ''
  const compact = normalized.replace(' ', 'T').slice(0, 16)
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(compact) ? compact : ''
}

export function parseSaleAt(value) {
  const normalized = normalizeSaleAt(value)
  if (!normalized) return null
  const date = new Date(normalized)
  return Number.isFinite(date.getTime()) ? date : null
}

export function normalizeSaleReminderEnabled(value) {
  if (value === true || value === 1) return true
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    return normalized === 'true' || normalized === '1'
  }
  return false
}

export function normalizeSaleReminderOffsets(value) {
  const source = Array.isArray(value)
    ? value
    : (typeof value === 'string' && value.trim()
        ? (() => {
            try {
              const parsed = JSON.parse(value)
              return Array.isArray(parsed) ? parsed : []
            } catch {
              return []
            }
          })()
        : [])

  const normalized = source
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item >= 0 && item <= 43200)

  return [...new Set(normalized)].sort((a, b) => b - a)
}

export function shouldScheduleSaleReminder(item) {
  if (!item?.id || !item?.isWishlist) return false
  if (!normalizeSaleReminderEnabled(item.saleReminderEnabled)) return false
  const saleDate = parseSaleAt(item.saleAt)
  return !!saleDate && saleDate.getTime() > Date.now()
}

export function formatSaleAtDisplay(value) {
  const date = parseSaleAt(value)
  if (!date) return ''
  const pad = (num) => String(num).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function formatReminderOffset(offsetMinutes) {
  const minutes = Number(offsetMinutes)
  if (!Number.isFinite(minutes) || minutes <= 0) return '开售时'
  if (minutes % 1440 === 0) return `提前 ${minutes / 1440} 天`
  if (minutes % 60 === 0) return `提前 ${minutes / 60} 小时`
  return `提前 ${minutes} 分钟`
}

export function getSaleReminderNotificationId(goodsId, offsetMinutes = 0) {
  const input = `${goodsId}:${Number(offsetMinutes) || 0}`
  let hash = 0
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash * 31) + input.charCodeAt(index)) >>> 0
  }
  return SALE_REMINDER_ID_BASE + (hash % SALE_REMINDER_ID_RANGE)
}

export function getSaleReminderNotificationIds(goodsId, offsets = SALE_REMINDER_DEFAULT_OFFSETS) {
  if (!goodsId) return []
  const normalizedOffsets = normalizeSaleReminderOffsets(offsets)
  const source = normalizedOffsets.length ? normalizedOffsets : SALE_REMINDER_DEFAULT_OFFSETS
  return source.map((offset) => getSaleReminderNotificationId(goodsId, offset))
}

function parseNotificationExtra(extra) {
  if (extra && typeof extra === 'object') return extra
  if (typeof extra !== 'string' || !extra.trim()) return {}
  try {
    const parsed = JSON.parse(extra)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function getSaleReminderPendingNotificationIds(goodsId, pending = []) {
  const normalizedGoodsId = String(goodsId || '')
  if (!normalizedGoodsId || !Array.isArray(pending)) return []

  const ids = pending
    .filter((notification) => {
      const extra = parseNotificationExtra(notification?.extra)
      return extra.type === 'sale-reminder' && String(extra.goodsId || '') === normalizedGoodsId
    })
    .map((notification) => Number(notification?.id))
    .filter((id) => Number.isInteger(id))

  return [...new Set(ids)]
}

export async function ensureSaleReminderPermission({ request = false, exact = false } = {}) {
  if (!isNativeNotificationAvailable()) {
    return { display: 'granted', exact_alarm: 'granted', native: false }
  }

  const displayStatus = await LocalNotifications.checkPermissions().catch(() => ({ display: 'prompt' }))
  const resolvedDisplay = displayStatus.display === 'granted' || !request
    ? displayStatus
    : await LocalNotifications.requestPermissions().catch(() => displayStatus)

  let exactStatus = { exact_alarm: 'granted' }
  if (Capacitor.getPlatform() === 'android' && exact) {
    exactStatus = await LocalNotifications.checkExactNotificationSetting().catch(() => ({ exact_alarm: 'prompt' }))
    if (request && exactStatus.exact_alarm !== 'granted') {
      exactStatus = await LocalNotifications.changeExactNotificationSetting().catch(() => exactStatus)
    }
  }

  return {
    ...resolvedDisplay,
    ...exactStatus,
    native: true
  }
}

export async function openSaleReminderExactAlarmSettings() {
  if (!isNativeNotificationAvailable() || Capacitor.getPlatform() !== 'android') {
    return { exact_alarm: 'granted' }
  }
  return LocalNotifications.changeExactNotificationSetting()
}

async function ensureSaleReminderChannel() {
  if (!isNativeNotificationAvailable() || Capacitor.getPlatform() !== 'android') return

  await LocalNotifications.createChannel({
    id: SALE_REMINDER_CHANNEL_ID,
    name: '开售提醒',
    description: '谷子开售前提醒',
    importance: 4,
    visibility: 1,
    vibration: true,
    lights: true,
    lightColor: '#7C5CFF'
  }).catch(() => {})
}

export async function cancelSaleReminderNotifications(goodsId, offsets = SALE_REMINDER_DEFAULT_OFFSETS) {
  if (!isNativeNotificationAvailable() || !goodsId) return
  const ids = new Set(getSaleReminderNotificationIds(goodsId, offsets))
  try {
    const result = await LocalNotifications.getPending()
    for (const id of getSaleReminderPendingNotificationIds(goodsId, result?.notifications)) {
      ids.add(id)
    }
  } catch {
    // Keep the deterministic ID fallback useful when the platform cannot read pending notifications.
  }
  if (ids.size === 0) return
  await LocalNotifications.cancel({
    notifications: [...ids].map((id) => ({ id }))
  }).catch(() => {})
}

export function buildSaleReminderNotifications(item) {
  if (!shouldScheduleSaleReminder(item)) return []

  const saleDate = parseSaleAt(item.saleAt)
  const saleTimeMs = saleDate.getTime()
  const offsets = normalizeSaleReminderOffsets(item.saleReminderOffsets)
  const reminderOffsets = offsets.length ? offsets : SALE_REMINDER_DEFAULT_OFFSETS
  const saleTimeText = formatSaleAtDisplay(item.saleAt)
  const titleName = String(item.name || '谷子').trim() || '谷子'

  return reminderOffsets
    .map((offset) => {
      const triggerAt = new Date(saleTimeMs - (offset * 60000))
      if (triggerAt.getTime() <= Date.now() + NOTIFICATION_MARGIN_MS) return null
      const offsetText = formatReminderOffset(offset)
      const title = offset > 0 ? `${titleName} ${offsetText}开售` : `${titleName} 开售了`
      return {
        id: getSaleReminderNotificationId(item.id, offset),
        title,
        body: offset > 0 ? `开售时间：${saleTimeText}` : '现在到开售时间了。',
        largeBody: `${titleName}\n开售时间：${saleTimeText}`,
        summaryText: saleTimeText,
        channelId: SALE_REMINDER_CHANNEL_ID,
        group: SALE_REMINDER_NOTIFICATION_GROUP,
        autoCancel: true,
        schedule: {
          at: triggerAt,
          allowWhileIdle: offset <= 10
        },
        extra: {
          type: 'sale-reminder',
          goodsId: String(item.id),
          saleAt: normalizeSaleAt(item.saleAt),
          offsetMinutes: offset
        }
      }
    })
    .filter(Boolean)
}

export async function scheduleSaleReminderForItem(item) {
  if (!isNativeNotificationAvailable() || !item?.id) return { scheduled: 0, permission: null }

  await cancelSaleReminderNotifications(item.id, item.saleReminderOffsets)
  if (!shouldScheduleSaleReminder(item)) return { scheduled: 0, permission: null }

  const notifications = buildSaleReminderNotifications(item)
  if (notifications.length === 0) return { scheduled: 0, permission: null }

  const permission = await ensureSaleReminderPermission({ request: false, exact: true })
  if (permission.display !== 'granted') return { scheduled: 0, permission }
  if (permission.exact_alarm && permission.exact_alarm !== 'granted') return { scheduled: 0, permission }

  await ensureSaleReminderChannel()
  await LocalNotifications.schedule({ notifications })
  return { scheduled: notifications.length, permission }
}

export async function syncSaleReminderNotifications(items = []) {
  if (!isNativeNotificationAvailable()) return { scheduled: 0, native: false }

  await ensureSaleReminderChannel()

  let pending = []
  try {
    const result = await LocalNotifications.getPending()
    pending = Array.isArray(result?.notifications) ? result.notifications : []
  } catch {
    pending = []
  }

  const targetById = new Map()
  for (const item of items || []) {
    for (const notification of buildSaleReminderNotifications(item)) {
      targetById.set(notification.id, notification)
    }
  }

  const salePendingIds = pending
    .filter((notification) => parseNotificationExtra(notification?.extra).type === 'sale-reminder')
    .map((notification) => notification.id)
    .filter((id) => Number.isInteger(id))

  const staleIds = salePendingIds.filter((id) => !targetById.has(id))
  if (staleIds.length > 0) {
    await LocalNotifications.cancel({
      notifications: staleIds.map((id) => ({ id }))
    }).catch(() => {})
  }

  const permission = await ensureSaleReminderPermission({ request: false, exact: true })
  if (permission.display !== 'granted') return { scheduled: 0, permission, native: true }
  if (permission.exact_alarm && permission.exact_alarm !== 'granted') return { scheduled: 0, permission, native: true }

  const notificationsToSchedule = [...targetById.values()]
  if (notificationsToSchedule.length > 0) {
    await LocalNotifications.schedule({ notifications: notificationsToSchedule })
  }

  return {
    scheduled: notificationsToSchedule.length,
    cancelled: staleIds.length,
    permission,
    native: true
  }
}

let notificationActionListener = null

export async function registerSaleReminderNotificationNavigation() {
  if (!isNativeNotificationAvailable() || notificationActionListener) return

  notificationActionListener = await LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
    const extra = action?.notification?.extra || {}
    if (extra.type !== 'sale-reminder' || !extra.goodsId) return
    router.push(`/detail/${encodeURIComponent(String(extra.goodsId))}`).catch(() => {})
  }).catch(() => null)
}

export function watchSaleReminderNotifications(goodsStore) {
  if (!isNativeNotificationAvailable() || !goodsStore?.list) return () => {}

  let lastSignature = ''
  let syncTimer = 0

  const buildSignature = () => JSON.stringify((goodsStore.list || [])
    .map((item) => ({
      id: item.id,
      isWishlist: item.isWishlist,
      saleAt: normalizeSaleAt(item.saleAt),
      enabled: normalizeSaleReminderEnabled(item.saleReminderEnabled),
      offsets: normalizeSaleReminderOffsets(item.saleReminderOffsets)
    }))
    .filter((item) => item.saleAt || item.enabled || item.offsets.length)
    .sort((a, b) => String(a.id).localeCompare(String(b.id))))

  const runSync = () => {
    window.clearTimeout(syncTimer)
    syncTimer = window.setTimeout(() => {
      syncTimer = 0
      const signature = buildSignature()
      if (signature === lastSignature) return
      lastSignature = signature
      syncSaleReminderNotifications(goodsStore.list).catch(() => {})
    }, 350)
  }

  runSync()
  const stop = goodsStore.$subscribe(() => {
    runSync()
  }, { detached: true })

  return () => {
    window.clearTimeout(syncTimer)
    stop?.()
  }
}
