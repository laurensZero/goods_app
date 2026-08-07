import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import packageJson from '../../package.json'
import { compareVersions, normalizeVersionTag } from '@/utils/github/release'
import { getSupabaseClient } from '@/utils/sync/supabaseClient'
import { readPersisted } from '@/utils/platform/storage'
import {
  isDevVersionMockEnabled,
  MOCK_APP_VERSION_KEY,
  MOCK_BUNDLE_VERSION_KEY,
  resolveMockAppVersion,
  resolveMockBundleVersion
} from '@/utils/dev/mockVersion'
import router from '@/router'

const ANNOUNCEMENT_RECORD_STORAGE_KEY = 'goods_announcement_record'
const ANNOUNCEMENT_LIST_READ_KEY = 'goods_announcement_list_read'
const WEB_UPDATE_CHANNEL_STORAGE_KEY = 'goods_web_update_channel'
const FALLBACK_VERSION = normalizeVersionTag(import.meta.env.VITE_APP_VERSION || packageJson.version || '0.0.0')

let activeCheckPromise = null

function normalizeShowMode(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'daily' || normalized === 'per_version' || normalized === 'every_enter') return normalized
  return 'once'
}

function normalizeUrl(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== 'https:') return ''
    return parsed.toString()
  } catch {
    return ''
  }
}

function parseTime(value) {
  if (!value) return 0
  if (typeof value === 'number') return value
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return 0
  return timestamp
}

function pickFirstVersionValue(values = []) {
  for (const value of values) {
    const normalized = normalizeVersionTag(value || '')
    if (normalized) return normalized
  }
  return ''
}

function normalizeVersionRule(source = {}, options = {}) {
  const exactKeys = Array.isArray(options.exactKeys) ? options.exactKeys : []
  const minKeys = Array.isArray(options.minKeys) ? options.minKeys : []
  const maxKeys = Array.isArray(options.maxKeys) ? options.maxKeys : []

  const exact = pickFirstVersionValue(exactKeys.map((key) => source?.[key]))
  const min = pickFirstVersionValue(minKeys.map((key) => source?.[key]))
  const max = pickFirstVersionValue(maxKeys.map((key) => source?.[key]))

  return {
    exact,
    min,
    max,
    hasConstraint: !!(exact || min || max)
  }
}

function matchesVersionRule(currentVersion, rule) {
  const normalizedCurrent = normalizeVersionTag(currentVersion || '')
  if (!rule?.hasConstraint) return true
  if (!normalizedCurrent) return false

  if (rule.exact && compareVersions(normalizedCurrent, rule.exact) !== 0) return false
  if (rule.min && compareVersions(normalizedCurrent, rule.min) < 0) return false
  if (rule.max && compareVersions(normalizedCurrent, rule.max) > 0) return false

  return true
}

function todayKey(date = new Date()) {
  const pad = (part) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function readPersistedRecord() {
  try {
    const raw = localStorage.getItem(ANNOUNCEMENT_RECORD_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed
  } catch {
    return {}
  }
}

function persistRecord(record) {
  try {
    localStorage.setItem(ANNOUNCEMENT_RECORD_STORAGE_KEY, JSON.stringify(record || {}))
  } catch {
    // ignore
  }
}

function readListReadRecord() {
  try {
    const raw = localStorage.getItem(ANNOUNCEMENT_LIST_READ_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed
  } catch {
    return {}
  }
}

function persistListReadRecord(record) {
  try {
    localStorage.setItem(ANNOUNCEMENT_LIST_READ_KEY, JSON.stringify(record || {}))
  } catch {
    // ignore
  }
}

function readCurrentChannel() {
  try {
    const value = String(localStorage.getItem(WEB_UPDATE_CHANNEL_STORAGE_KEY) || '').trim().toLowerCase()
    if (value === 'beta') return 'beta'
    if (value === 'stable') return 'stable'
    // 未选择过频道时，dev 模式默认 beta
    return import.meta.env.DEV ? 'beta' : 'stable'
  } catch {
    return import.meta.env.DEV ? 'beta' : 'stable'
  }
}

function normalizeRow(row) {
  if (!row || typeof row !== 'object') return null

  const id = String(row.id || '').trim()
  if (!id) return null

  const showRule = row.show_rule && typeof row.show_rule === 'object' ? row.show_rule : {}
  const cta = row.cta && typeof row.cta === 'object' ? row.cta : {}

  const channels = Array.isArray(showRule.channels)
    ? showRule.channels
      .map((entry) => String(entry || '').trim().toLowerCase())
      .filter(Boolean)
    : ['stable', 'beta']

  return {
    id,
    enabled: row.enabled !== false,
    priority: Number.isFinite(Number(row.priority)) ? Number(row.priority) : 0,
    title: String(row.title || '').trim(),
    message: String(row.message || '').trim(),
    imageUrl: normalizeUrl(row.image_url),
    customCss: String(row.custom_css || '').trim(),
    cta: {
      text: String(cta.text || '').trim(),
      url: normalizeUrl(cta.url),
      action: String(cta.action || 'dismiss').trim().toLowerCase() || 'dismiss'
    },
    showRule: {
      showMode: normalizeShowMode(showRule.showMode),
      startAt: parseTime(showRule.startAt),
      endAt: parseTime(showRule.endAt),
      appVersionRule: normalizeVersionRule(showRule, {
        exactKeys: ['appVersion', 'ver', 'targetAppVersion', 'exactAppVersion'],
        minKeys: ['minAppVersion', 'appVersionMin', 'verMin', 'appVersionGte', 'verGte'],
        maxKeys: ['maxAppVersion', 'appVersionMax', 'verMax', 'appVersionLte', 'verLte']
      }),
      bundleVersionRule: normalizeVersionRule(showRule, {
        exactKeys: ['bundleVersion', 'targetBundleVersion', 'exactBundleVersion'],
        minKeys: ['minBundleVersion', 'bundleVersionMin', 'bundleVersionGte'],
        maxKeys: ['maxBundleVersion', 'bundleVersionMax', 'bundleVersionLte']
      }),
      channels: channels.length ? channels : ['stable', 'beta'],
      logic: ['and', 'or'].includes(showRule.logic) ? showRule.logic : 'and',
      conditions: Array.isArray(showRule.conditions)
        ? showRule.conditions.map((c) => {
            if (typeof c === 'string') return { type: c }
            if (c && typeof c === 'object' && c.type) return { type: c.type, ...c }
            return null
          }).filter(Boolean)
        : []
    }
  }
}

// ── 通用条件执行器 ──
// 云端通过 show_rule.conditions 下发查询 JSON，app 端执行
// 支持三种 type: local / db / flag
// logic: "and" | "or"，默认 "and"

// db 条件仅允许查询本地业务表，防止云端下发任意表名做 count 探测
const DB_COND_TABLE_WHITELIST = ['goods', 'events', 'recharge_records', 'goods_groups', 'goods_group_items']

const EXECUTORS = {
  // { type: "local", key: "xxx", exists?: boolean, equals?: string }
  // 自动兼容 localStorage + Capacitor Preferences（原生端）
  local: async (cond) => {
    try {
      const key = cond.key || ''
      if (!key) return false
      const stored = await readPersisted(key)
      if (cond.exists === false) return stored === null
      if (cond.exists === true) return stored !== null
      if (cond.equals !== undefined) return stored === String(cond.equals)
      return stored !== null
    } catch { return false }
  },

  // { type: "sync_configured" }
  // 检查 Supabase 同步是否已配置（URL + Key 都存在）
  sync_configured: async () => {
    try {
      const url = await readPersisted('sync_supabase_url')
      const key = await readPersisted('sync_supabase_anon_key')
      return !!(url && key)
    } catch { return false }
  },

  // { type: "db", table: "goods", op: "count>="|"count>"|"count="|"count<"|"count<="|"exists"|"empty", value?: number }
  db: async (cond) => {
    try {
      const table = cond.table || ''
      if (!table) return false
      if (!DB_COND_TABLE_WHITELIST.includes(table)) {
        console.warn(`[announcement] db condition table not allowed: ${table}`)
        return false
      }
      const db = getSupabaseClient()
      const op = cond.op || 'count>='
      const value = Number(cond.value) || 0

      const { count } = await db.from(table).select('id', { count: 'exact', head: true })
      const n = count || 0

      if (op === 'exists') return n > 0
      if (op === 'empty') return n === 0
      if (op === 'count>=') return n >= value
      if (op === 'count>') return n > value
      if (op === 'count=') return n === value
      if (op === 'count<') return n < value
      if (op === 'count<=') return n <= value
      return false
    } catch { return false }
  },

  // { type: "flag", key: "xxx", value: "yyy" }
  flag: async (cond) => {
    try {
      const key = cond.key || ''
      if (!key) return false
      const stored = await readPersisted(key)
      return stored === String(cond.value)
    } catch { return false }
  }
}

async function evaluateQuery(conditions, logic = 'and') {
  if (!conditions || !conditions.length) return true
  const results = await Promise.all(
    conditions.map(async (cond) => {
      const executor = EXECUTORS[cond.type]
      if (!executor) {
        console.warn(`[announcement] unknown condition type: ${cond.type}`)
        return true
      }
      return executor(cond)
    })
  )
  if (logic === 'or') return results.some(Boolean)
  return results.every(Boolean)
}

async function matchesAnnouncementRule(announcement, context) {
  if (!announcement?.enabled) return false

  const now = context.now
  const startAt = Number(announcement?.showRule?.startAt || 0)
  const endAt = Number(announcement?.showRule?.endAt || 0)
  if (startAt > 0 && now < startAt) return false
  if (endAt > 0 && now > endAt) return false

  const channels = Array.isArray(announcement?.showRule?.channels) ? announcement.showRule.channels : []
  if (channels.length > 0 && !channels.includes(context.channel)) return false

  if (!matchesVersionRule(context.appVersion, announcement?.showRule?.appVersionRule)) return false
  if (!matchesVersionRule(context.bundleVersion, announcement?.showRule?.bundleVersionRule)) return false

  const conditions = announcement?.showRule?.conditions || []
  const logic = announcement?.showRule?.logic || 'and'
  if (conditions.length > 0) {
    const conditionsMet = await evaluateQuery(conditions, logic)
    if (!conditionsMet) return false
  }

  const record = context.record?.[announcement.id] || {}
  const showMode = announcement?.showRule?.showMode || 'once'

  if (showMode === 'once') {
    if (record.dismissedAt || record.lastShownAt) return false
    return true
  }

  if (showMode === 'daily') {
    if (record.lastShownDay === context.today) return false
    return true
  }

  if (showMode === 'per_version') {
    if (record.lastShownVersion === context.appVersion) return false
    return true
  }

  if (showMode === 'every_enter') {
    return true
  }

  return true
}

async function fetchAnnouncements() {
  const db = getSupabaseClient()
  const { data, error } = await db
    .from('announcements')
    .select('id, enabled, priority, title, message, cta, show_rule, image_url, custom_css')
    .eq('enabled', true)
    .order('priority', { ascending: false })

  if (error) throw new Error(error.message || '拉取公告失败，请稍后再试。')
  return (data || []).map(normalizeRow).filter(Boolean)
}

export const useAnnouncementStore = defineStore('announcement', () => {
  const initialized = ref(false)
  const isChecking = ref(false)
  const appVersion = ref(FALLBACK_VERSION)
  const bundleVersion = ref('')
  const channel = ref('stable')
  const dialogVisible = ref(false)
  const activeAnnouncement = ref(null)
  const lastCheckedAt = ref('')
  const lastError = ref('')
  const showRecord = ref({})

  // ── 公告列表（小喇叭） ──
  const allAnnouncements = ref([])
  const listVisible = ref(false)
  const listLoading = ref(false)
  const listReadRecord = ref({})
  const listOpenedAt = ref(0)

  // ── 更新日志（仅 beta 频道） ──
  const changelogEntries = ref([])
  const changelogLoading = ref(false)
  const isBetaChannel = computed(() => channel.value === 'beta')

  const hasActiveAnnouncement = computed(() => !!activeAnnouncement.value)

  const unreadCount = computed(() => {
    if (!allAnnouncements.value.length) return 0
    const read = listReadRecord.value
    return allAnnouncements.value.filter((a) => {
      const id = String(a.id || '').trim()
      if (!id) return false
      return !read[id]
    }).length
  })

  async function init() {
    if (initialized.value) return

    channel.value = readCurrentChannel()
    showRecord.value = readPersistedRecord()

    try {
      if (Capacitor.isNativePlatform()) {
        const info = await CapacitorApp.getInfo()
        appVersion.value = normalizeVersionTag(info?.version || FALLBACK_VERSION) || FALLBACK_VERSION
        try {
          const bundleInfo = await CapacitorUpdater.current()
          bundleVersion.value = normalizeVersionTag(bundleInfo?.bundle?.version || '')
        } catch {
          bundleVersion.value = ''
        }
      } else {
        appVersion.value = FALLBACK_VERSION
        bundleVersion.value = FALLBACK_VERSION
        if (isDevVersionMockEnabled()) {
          appVersion.value = resolveMockAppVersion() || FALLBACK_VERSION
          bundleVersion.value = resolveMockBundleVersion() || FALLBACK_VERSION
          console.info(
            `[announcement] dev 版本模拟 app=${appVersion.value} bundle=${bundleVersion.value}；`
            + `可用 localStorage 设置 ${MOCK_APP_VERSION_KEY} / ${MOCK_BUNDLE_VERSION_KEY} 覆盖，置空恢复默认最新`
          )
        }
      }
    } catch {
      appVersion.value = FALLBACK_VERSION
      bundleVersion.value = Capacitor.isNativePlatform() ? '' : FALLBACK_VERSION
      if (isDevVersionMockEnabled()) {
        appVersion.value = resolveMockAppVersion() || FALLBACK_VERSION
        bundleVersion.value = resolveMockBundleVersion() || FALLBACK_VERSION
      }
    } finally {
      initialized.value = true
    }
  }

  async function checkAndDecide() {
    if (activeCheckPromise) return activeCheckPromise

    activeCheckPromise = (async () => {
      await init()

      isChecking.value = true
      lastError.value = ''
      activeAnnouncement.value = null
      dialogVisible.value = false

      try {
        const announcements = await fetchAnnouncements()

        const now = Date.now()
        const currentDay = todayKey(new Date(now))
        const currentAppVersion = appVersion.value || FALLBACK_VERSION

        // 同时加载列表已读记录，用于计算红点
        listReadRecord.value = readListReadRecord()

        // 第一遍：弹窗候选（受 showRecord 约束，遵循 once/daily 模式）
        let candidate = null
        for (const announcement of announcements) {
          const result = await matchesAnnouncementRule(announcement, {
            now,
            today: currentDay,
            appVersion: currentAppVersion,
            bundleVersion: bundleVersion.value,
            channel: channel.value,
            record: showRecord.value
          })
          if (result) {
            candidate = announcement
            break
          }
        }

        // 第二遍：列表缓存（不受弹窗 showRecord 约束，展示所有符合条件的公告）
        const eligible = []
        for (const announcement of announcements) {
          const result = await matchesAnnouncementRule(announcement, {
            now,
            today: currentDay,
            appVersion: currentAppVersion,
            bundleVersion: bundleVersion.value,
            channel: channel.value,
            record: {}
          })
          if (result) {
            eligible.push(announcement)
          }
        }
        allAnnouncements.value = eligible

        if (!candidate) {
          return { status: 'idle', reason: 'no_match' }
        }

        activeAnnouncement.value = candidate
        dialogVisible.value = true
        markAnnouncementShown(candidate)

        return { status: 'show', announcement: candidate }
      } catch (error) {
        lastError.value = error?.message || '检查公告失败。'
        return { status: 'error', error }
      } finally {
        lastCheckedAt.value = new Date().toISOString()
        isChecking.value = false
        activeCheckPromise = null
      }
    })()

    return activeCheckPromise
  }

  function markAnnouncementShown(announcement) {
    const id = String(announcement?.id || '').trim()
    if (!id) return

    const currentDay = todayKey()
    const currentRecord = showRecord.value[id] && typeof showRecord.value[id] === 'object'
      ? showRecord.value[id]
      : {}

    const newRecord = {
      ...currentRecord,
      lastShownAt: new Date().toISOString(),
      lastShownDay: currentDay,
      lastShownVersion: appVersion.value || FALLBACK_VERSION
    }
    showRecord.value = {
      ...showRecord.value,
      [id]: newRecord
    }
    persistRecord(showRecord.value)
  }

  function dismissAnnouncement() {
    const id = String(activeAnnouncement.value?.id || '').trim()
    if (id) {
      const currentRecord = showRecord.value[id] && typeof showRecord.value[id] === 'object'
        ? showRecord.value[id]
        : {}
      showRecord.value = {
        ...showRecord.value,
        [id]: {
          ...currentRecord,
          dismissedAt: new Date().toISOString()
        }
      }
      persistRecord(showRecord.value)
    }

    dialogVisible.value = false
    activeAnnouncement.value = null
  }

  function handlePrimaryAction() {
    const cta = activeAnnouncement.value?.cta || null
    const action = String(cta?.action || '').trim().toLowerCase()
    const url = String(cta?.url || '').trim()

    if (action === 'open_url' && url) {
      window.open(url, '_blank')
    } else if (action === 'navigate' && url) {
      router.push(url)
    }

    dismissAnnouncement()
  }

  // ── 公告列表方法 ──

  async function fetchAllForList() {
    if (listLoading.value) return
    listLoading.value = true
    try {
      await init()
      listReadRecord.value = readListReadRecord()

      const announcements = await fetchAnnouncements()
      const now = Date.now()
      const currentDay = todayKey(new Date(now))
      const currentAppVersion = appVersion.value || FALLBACK_VERSION

      // 列表视图不使用弹窗的 showRecord，确保所有符合条件的公告都能展示
      const eligible = []
      for (const announcement of announcements) {
        const result = await matchesAnnouncementRule(announcement, {
          now,
          today: currentDay,
          appVersion: currentAppVersion,
          bundleVersion: bundleVersion.value,
          channel: channel.value,
          record: {}
        })
        if (result) {
          eligible.push(announcement)
        }
      }
      allAnnouncements.value = eligible
      return eligible
    } catch (error) {
      lastError.value = error?.message || '拉取公告列表失败。'
      allAnnouncements.value = []
      return []
    } finally {
      listLoading.value = false
    }
  }

  async function fetchChangelog() {
    if (!isBetaChannel.value) return
    if (changelogLoading.value) return
    changelogLoading.value = true
    try {
      await init()
      const db = getSupabaseClient()
      const { data, error } = await db
        .from('ota_releases')
        .select('version, notes, published_at')
        .eq('channel', 'beta')
        .eq('type', 'web_bundle')
        .order('published_at', { ascending: false })
        .limit(10)

      if (error) {
        console.warn('[announcement] fetchChangelog error:', error.message)
        changelogEntries.value = []
        return
      }
      changelogEntries.value = (data || []).map((row) => ({
        version: String(row.version || '').trim(),
        notes: String(row.notes || '').trim(),
        publishedAt: row.published_at || ''
      })).filter((e) => e.version)
    } catch (e) {
      console.warn('[announcement] fetchChangelog failed:', e.message)
      changelogEntries.value = []
    } finally {
      changelogLoading.value = false
    }
  }

  function openList() {
    listOpenedAt.value = Date.now()
    listVisible.value = true
  }

  function closeList() {
    // 防止打开瞬间被移动端 click 事件重定向误关（300ms 保护窗口）
    if (Date.now() - listOpenedAt.value < 300) return
    listVisible.value = false
  }

  function markAllRead() {
    const record = { ...listReadRecord.value }
    for (const a of allAnnouncements.value) {
      const id = String(a.id || '').trim()
      if (id) {
        record[id] = new Date().toISOString()
      }
    }
    listReadRecord.value = record
    persistListReadRecord(record)
  }

  function markOneRead(announcementId) {
    const id = String(announcementId || '').trim()
    if (!id) return
    const record = { ...listReadRecord.value, [id]: new Date().toISOString() }
    listReadRecord.value = record
    persistListReadRecord(record)
  }

  return {
    initialized,
    isChecking,
    appVersion,
    bundleVersion,
    channel,
    dialogVisible,
    activeAnnouncement,
    lastCheckedAt,
    lastError,
    hasActiveAnnouncement,
    allAnnouncements,
    listVisible,
    listLoading,
    listReadRecord,
    unreadCount,
    changelogEntries,
    changelogLoading,
    isBetaChannel,
    init,
    checkAndDecide,
    dismissAnnouncement,
    handlePrimaryAction,
    fetchAllForList,
    fetchChangelog,
    openList,
    closeList,
    markAllRead,
    markOneRead
  }
})
