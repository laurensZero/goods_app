import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import packageJson from '../../package.json'
import { compareVersions, normalizeVersionTag } from '@/utils/githubRelease'
import { fetchWithPlatformBridge } from '@/utils/platformHttp'

const ANNOUNCEMENT_BASE_BY_SOURCE = Object.freeze({
  local: '',
  gist: '',
  github: 'https://laurenszero.github.io/goods_app'
})
const ANNOUNCEMENT_MANIFEST_PATH = 'announcements/manifest.json'
const AVAILABLE_ANNOUNCEMENT_SOURCES = Object.freeze(['auto', 'local', 'gist', 'github'])
const ANNOUNCEMENT_SOURCE_STORAGE_KEY = 'goods_announcement_source'
const ANNOUNCEMENT_RECORD_STORAGE_KEY = 'goods_announcement_record'
const ANNOUNCEMENT_GIST_URL_STORAGE_KEY = 'goods_announcement_gist_url'
const WEB_UPDATE_CHANNEL_STORAGE_KEY = 'goods_web_update_channel'
const REQUEST_TIMEOUT_MS = 15000
const FALLBACK_VERSION = normalizeVersionTag(import.meta.env.VITE_APP_VERSION || packageJson.version || '0.0.0')
const GITHUB_API_BASE = 'https://api.github.com'
const DEFAULT_ANNOUNCEMENT_GIST_URL = 'https://gist.github.com/laurensZero/0a88ab223f6e8c6cc8542401e907154c'

let activeCheckPromise = null

function normalizeSource(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (AVAILABLE_ANNOUNCEMENT_SOURCES.includes(normalized)) return normalized
  return 'auto'
}

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

function normalizeGistManifestUrl(value) {
  const normalized = normalizeUrl(value)
  if (!normalized) return ''
  return normalized
}

function parseGistIdFromUrl(url) {
  const raw = String(url || '').trim()
  if (!raw) return ''

  try {
    const parsed = new URL(raw)
    const hostname = parsed.hostname.toLowerCase()

    if (hostname === 'gist.github.com') {
      const segments = parsed.pathname.split('/').filter(Boolean)
      const gistId = segments[segments.length - 1] || ''
      return gistId.trim()
    }

    if (hostname === 'api.github.com') {
      const matched = parsed.pathname.match(/\/gists\/([a-f0-9]+)/i)
      return matched?.[1] || ''
    }
  } catch {
    return ''
  }

  return ''
}

function parseTime(value) {
  if (!value) return 0
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

function withTimeout(promise, timeoutMs, timeoutMessage) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
    })
  ])
}

function parseManifestPayload(payload) {
  if (payload && typeof payload === 'object') {
    return payload
  }

  if (typeof payload === 'string') {
    return JSON.parse(payload)
  }

  throw new Error('公告配置格式无效。')
}

function buildManifestUrl(source) {
  if (source === 'gist') {
    return resolveGistManifestUrl()
  }
  const base = ANNOUNCEMENT_BASE_BY_SOURCE[source]
  if (source === 'local') {
    return `/${ANNOUNCEMENT_MANIFEST_PATH}`
  }
  if (!base) return ''
  return `${base}/${ANNOUNCEMENT_MANIFEST_PATH}`
}

function resolveSourceCandidates(source) {
  if (source === 'auto') {
    const candidates = []
    if (resolveGistManifestUrl()) {
      candidates.push('gist')
    }
    if (import.meta.env.DEV && !Capacitor.isNativePlatform()) {
      candidates.push('local')
    }
    candidates.push('github')
    return candidates
  }
  return [source]
}

function readPersistedSource() {
  try {
    return normalizeSource(localStorage.getItem(ANNOUNCEMENT_SOURCE_STORAGE_KEY))
  } catch {
    return 'auto'
  }
}

function readPersistedGistUrl() {
  try {
    return normalizeGistManifestUrl(localStorage.getItem(ANNOUNCEMENT_GIST_URL_STORAGE_KEY))
  } catch {
    return ''
  }
}

function persistGistUrl(url) {
  try {
    localStorage.setItem(ANNOUNCEMENT_GIST_URL_STORAGE_KEY, normalizeGistManifestUrl(url))
  } catch {
    // ignore persistence failures
  }
}

function readEnvGistUrl() {
  return normalizeGistManifestUrl(import.meta.env.VITE_ANNOUNCEMENT_GIST_URL || '')
}

function resolveGistManifestUrl() {
  return readPersistedGistUrl() || readEnvGistUrl() || normalizeGistManifestUrl(DEFAULT_ANNOUNCEMENT_GIST_URL)
}

function persistSource(source) {
  try {
    localStorage.setItem(ANNOUNCEMENT_SOURCE_STORAGE_KEY, source)
  } catch {
    // ignore persistence failures
  }
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
    // ignore persistence failures
  }
}

function readCurrentChannel() {
  try {
    const value = String(localStorage.getItem(WEB_UPDATE_CHANNEL_STORAGE_KEY) || '').trim().toLowerCase()
    if (value === 'beta') return 'beta'
    return 'stable'
  } catch {
    return 'stable'
  }
}

function todayKey(date = new Date()) {
  const pad = (part) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function normalizeAnnouncementItem(item) {
  if (!item || typeof item !== 'object') return null

  const id = String(item.id || '').trim()
  if (!id) return null

  const showRule = item.showRule && typeof item.showRule === 'object' ? item.showRule : {}
  const cta = item.cta && typeof item.cta === 'object' ? item.cta : {}

  const channels = Array.isArray(showRule.channels)
    ? showRule.channels
      .map((entry) => String(entry || '').trim().toLowerCase())
      .filter(Boolean)
    : ['stable', 'beta']

  return {
    id,
    enabled: item.enabled !== false,
    priority: Number.isFinite(Number(item.priority)) ? Number(item.priority) : 0,
    title: String(item.title || '').trim(),
    message: String(item.message || '').trim(),
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
      channels: channels.length ? channels : ['stable', 'beta']
    }
  }
}

function normalizeManifest(manifest) {
  const list = Array.isArray(manifest?.announcements)
    ? manifest.announcements.map(normalizeAnnouncementItem).filter(Boolean)
    : []

  return {
    version: Number.isFinite(Number(manifest?.version)) ? Number(manifest.version) : 1,
    updatedAt: String(manifest?.updatedAt || '').trim(),
    announcements: list.sort((left, right) => right.priority - left.priority)
  }
}

async function fetchAnnouncementManifest(url) {
  const gistId = parseGistIdFromUrl(url)
  if (gistId) {
    return fetchAnnouncementManifestFromGistApi(gistId)
  }

  if (Capacitor.isNativePlatform()) {
    try {
      const response = await withTimeout(
        CapacitorHttp.get({
          url,
          headers: {
            Accept: 'application/json'
          }
        }),
        REQUEST_TIMEOUT_MS,
        '拉取公告超时，请稍后再试。'
      )

      const status = Number(response?.status || 0)
      if (status < 200 || status >= 300) {
        throw new Error(`公告配置请求失败（${status || 'unknown'}）。`)
      }

      return parseManifestPayload(response?.data)
    } catch (error) {
      const message = String(error?.message || '')
      if (message.includes('超时')) {
        throw error
      }
      throw new Error(message || '拉取公告失败，请稍后再试。')
    }
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetchWithPlatformBridge(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json'
      },
      cache: 'no-store',
      signal: controller.signal
    })

    if (!response.ok) {
      throw new Error(`公告配置请求失败（${response.status}）。`)
    }

    return response.json()
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('拉取公告超时，请稍后再试。')
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

function pickManifestFileFromGistPayload(payload) {
  const files = payload?.files && typeof payload.files === 'object'
    ? Object.values(payload.files)
    : []

  if (!files.length) return null

  return files.find((file) => /manifest/i.test(String(file?.filename || '')) && /\.json$/i.test(String(file?.filename || '')))
    || files.find((file) => /\.json$/i.test(String(file?.filename || '')))
    || files[0]
}

async function fetchRawText(url) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetchWithPlatformBridge(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json'
      },
      cache: 'no-store',
      signal: controller.signal
    })

    if (!response.ok) {
      throw new Error(`公告配置请求失败（${response.status}）。`)
    }

    return response.text()
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('拉取公告超时，请稍后再试。')
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

async function fetchAnnouncementManifestFromGistApi(gistId) {
  const apiUrl = `${GITHUB_API_BASE}/gists/${gistId}`

  if (Capacitor.isNativePlatform()) {
    const response = await withTimeout(
      CapacitorHttp.get({
        url: apiUrl,
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28'
        }
      }),
      REQUEST_TIMEOUT_MS,
      '拉取公告超时，请稍后再试。'
    )

    const status = Number(response?.status || 0)
    if (status < 200 || status >= 300) {
      throw new Error(`公告配置请求失败（${status || 'unknown'}）。`)
    }

    const payload = parseManifestPayload(response?.data)
    const selectedFile = pickManifestFileFromGistPayload(payload)
    if (!selectedFile) {
      throw new Error('Gist 中未找到可用公告文件。')
    }

    let content = String(selectedFile?.content || '')
    if (!content && selectedFile?.raw_url) {
      content = await fetchRawText(String(selectedFile.raw_url || ''))
    }

    return parseManifestPayload(content)
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetchWithPlatformBridge(apiUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      cache: 'no-store',
      signal: controller.signal
    })

    if (!response.ok) {
      throw new Error(`公告配置请求失败（${response.status}）。`)
    }

    const payload = await response.json()
    const selectedFile = pickManifestFileFromGistPayload(payload)
    if (!selectedFile) {
      throw new Error('Gist 中未找到可用公告文件。')
    }

    let content = String(selectedFile?.content || '')
    if (!content && selectedFile?.raw_url) {
      content = await fetchRawText(String(selectedFile.raw_url || ''))
    }

    return parseManifestPayload(content)
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('拉取公告超时，请稍后再试。')
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

function matchesAnnouncementRule(announcement, context) {
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

export const useAnnouncementStore = defineStore('announcement', () => {
  const initialized = ref(false)
  const isChecking = ref(false)
  const selectedSource = ref('auto')
  const resolvedSource = ref('')
  const appVersion = ref(FALLBACK_VERSION)
  const bundleVersion = ref('')
  const channel = ref('stable')
  const dialogVisible = ref(false)
  const activeAnnouncement = ref(null)
  const latestManifest = ref(null)
  const lastCheckedAt = ref('')
  const lastError = ref('')
  const showRecord = ref({})
  const gistManifestUrl = ref('')

  const hasActiveAnnouncement = computed(() => !!activeAnnouncement.value)

  async function init() {
    if (initialized.value) return

    selectedSource.value = readPersistedSource()
    gistManifestUrl.value = resolveGistManifestUrl()
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
      }
    } catch {
      appVersion.value = FALLBACK_VERSION
      bundleVersion.value = Capacitor.isNativePlatform() ? '' : FALLBACK_VERSION
    } finally {
      initialized.value = true
    }
  }

  async function checkAndDecide(options = {}) {
    if (activeCheckPromise) return activeCheckPromise

    activeCheckPromise = (async () => {
      await init()

      isChecking.value = true
      lastError.value = ''
      activeAnnouncement.value = null
      dialogVisible.value = false

      if (options?.source) {
        selectedSource.value = normalizeSource(options.source)
        persistSource(selectedSource.value)
      }

      if (typeof options?.gistUrl === 'string') {
        setGistManifestUrl(options.gistUrl)
      }

      try {
        const sourceCandidates = resolveSourceCandidates(selectedSource.value)
        let payload = null
        let resolved = ''
        let lastRequestError = null

        for (const source of sourceCandidates) {
          try {
            const url = buildManifestUrl(source)
            if (!url) continue
            payload = await fetchAnnouncementManifest(url)
            resolved = source
            break
          } catch (error) {
            lastRequestError = error
          }
        }

        if (!payload) {
          throw lastRequestError || new Error('未获取到可用公告配置。')
        }

        resolvedSource.value = resolved
        const manifest = normalizeManifest(payload)
        latestManifest.value = manifest

        const now = Date.now()
        const currentDay = todayKey(new Date(now))
        const currentAppVersion = appVersion.value || FALLBACK_VERSION

        const candidate = manifest.announcements.find((announcement) => (
          matchesAnnouncementRule(announcement, {
            now,
            today: currentDay,
            appVersion: currentAppVersion,
            bundleVersion: bundleVersion.value,
            channel: channel.value,
            record: showRecord.value
          })
        )) || null

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

    showRecord.value = {
      ...showRecord.value,
      [id]: {
        ...currentRecord,
        lastShownAt: new Date().toISOString(),
        lastShownDay: currentDay,
        lastShownVersion: appVersion.value || FALLBACK_VERSION
      }
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
      try {
        const openedWindow = window.open(url, '_blank', 'noopener,noreferrer')
        if (!openedWindow) {
          window.location.href = url
        }
      } catch {
        window.location.href = url
      }
    }

    dismissAnnouncement()
  }

  function setGistManifestUrl(url) {
    const normalized = normalizeGistManifestUrl(url)
    gistManifestUrl.value = normalized
    persistGistUrl(normalized)
  }

  return {
    initialized,
    isChecking,
    selectedSource,
    resolvedSource,
    appVersion,
    bundleVersion,
    channel,
    dialogVisible,
    activeAnnouncement,
    latestManifest,
    lastCheckedAt,
    lastError,
    gistManifestUrl,
    hasActiveAnnouncement,
    init,
    checkAndDecide,
    dismissAnnouncement,
    handlePrimaryAction,
    setGistManifestUrl
  }
})
