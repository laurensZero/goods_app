import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import {
  buildReleaseNotesPreview,
  compareVersions,
  normalizeVersionTag,
  proxyGitHubDownloadUrl
} from '@/utils/github/release'
import { fetchWithPlatformBridge } from '@/utils/platform/http'
import { AVAILABLE_UPDATE_LEVELS, AVAILABLE_UPDATE_SOURCES, normalizeUpdateLevel, resolveSourceCandidates } from '@/utils/updateHelpers'
import { createLogger } from '@/utils/logger'

const log = createLogger('web-update')

const WEB_MANIFEST_BASE_BY_SOURCE = Object.freeze({
  gitee: 'https://gitee.com/laurenszero/goods_app/raw/gh-pages',
  github: 'https://laurenszero.github.io/goods_app'
})
const UPDATE_CHANNEL_STORAGE_KEY = 'goods_web_update_channel'
const UPDATE_SOURCE_STORAGE_KEY = 'goods_web_update_source'
const AVAILABLE_UPDATE_CHANNELS = Object.freeze(['stable', 'beta'])
const REQUEST_TIMEOUT_MS = 15000

let activeCheckPromise = null

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
    try {
      return JSON.parse(payload)
    } catch (e) {
      throw new Error(`资源清单 JSON 解析失败: ${e.message}`)
    }
  }

  throw new Error('资源清单格式无效。')
}

function buildVersionsUrl(manifestUrl) {
  try {
    return new URL('./versions.json', manifestUrl).href
  } catch {
    return ''
  }
}

function normalizeVersionHistoryItem(item) {
  if (!item || typeof item !== 'object') return null

  const version = normalizeVersionTag(item.version || '')
  if (!version) return null

  return {
    version,
    notes: String(item.notes || '').trim(),
    publishedAt: String(item.publishedAt || '').trim()
  }
}

function formatPublishedAtToBeijing(utcIsoString) {
  const raw = String(utcIsoString || '').trim()
  if (!raw) return ''

  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return raw

  return date.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

function buildCumulativeReleaseNotesPreview(historyItems, currentVersion, latestVersion, fallbackNotes = '') {
  const current = normalizeVersionTag(currentVersion)
  const latest = normalizeVersionTag(latestVersion)

  if (!latest || (current && compareVersions(latest, current) <= 0)) {
    return ''
  }

  const filtered = (Array.isArray(historyItems) ? historyItems : [])
    .map(normalizeVersionHistoryItem)
    .filter(Boolean)
    .sort((left, right) => compareVersions(left.version, right.version))
    .filter((item) => {
      if (current && compareVersions(item.version, current) <= 0) return false
      if (latest && compareVersions(item.version, latest) > 0) return false
      return true
    })

  const lines = []
  filtered.forEach((item) => {
    lines.push(`v${item.version}`)
    if (item.publishedAt) {
      lines.push(`发布时间：${formatPublishedAtToBeijing(item.publishedAt)}`)
    }

    const note = buildReleaseNotesPreview(item.notes)
    if (note) {
      lines.push(note)
    }
    lines.push('')
  })

  const cumulative = lines.join('\n').trim()
  if (cumulative) return cumulative

  return buildReleaseNotesPreview(fallbackNotes)
}

async function fetchWebManifest(url) {
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
        '检查资源更新超时，请稍后再试。'
      )

      const status = Number(response?.status || 0)
      if (status < 200 || status >= 300) {
        throw new Error(`资源清单请求失败（${status || 'unknown'}）。`)
      }

      return parseManifestPayload(response?.data)
    } catch (error) {
      const message = String(error?.message || '')
      if (message.includes('超时')) {
        throw error
      }
      throw new Error(message || '检查资源更新失败，请稍后再试。')
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
      throw new Error(`资源清单请求失败（${response.status}）。`)
    }

    return response.json()
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('检查资源更新超时，请稍后再试。')
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

async function fetchWebVersions(url) {
  if (!url) return []

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
        '检查资源更新超时，请稍后再试。'
      )

      const status = Number(response?.status || 0)
      if (status < 200 || status >= 300) {
        return []
      }

      const payload = parseManifestPayload(response?.data)
      return Array.isArray(payload) ? payload : []
    } catch {
      return []
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
      return []
    }

    const payload = await response.json().catch(() => [])
    return Array.isArray(payload) ? payload : []
  } catch {
    return []
  } finally {
    clearTimeout(timeoutId)
  }
}

function normalizeUpdateChannel(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (AVAILABLE_UPDATE_CHANNELS.includes(normalized)) return normalized
  return 'stable'
}

function normalizeUpdateSource(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (AVAILABLE_UPDATE_SOURCES.includes(normalized)) return normalized
  return 'auto'
}

function resolveUpdateLevelFromManifest(manifest) {
  if (manifest?.forceUpdate === true) return 'force'
  if (manifest?.silentUpdate === true) return 'silent'
  return normalizeUpdateLevel(manifest?.updateLevel || manifest?.update_level || 'prompt')
}

function normalizeBundleUrl(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''

  try {
    const parsed = new URL(raw)
    parsed.hostname = parsed.hostname.toLowerCase()
    return parsed.toString()
  } catch {
    return raw
  }
}

function normalizeChecksum(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return ''

  const normalized = raw.startsWith('sha256:') ? raw.slice(7) : raw
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    return ''
  }

  return normalized
}

function resolveBundleUrl(manifestUrl, bundleUrl) {
  const rawBundleUrl = String(bundleUrl || '').trim()
  if (!rawBundleUrl) return ''

  try {
    const resolved = new URL(rawBundleUrl, manifestUrl)
    resolved.hostname = resolved.hostname.toLowerCase()
    return resolved.toString()
  } catch {
    return normalizeBundleUrl(rawBundleUrl)
  }
}

function normalizeErrorMessage(error, fallback) {
  const message = String(error?.message || fallback || '').trim()
  if (!message) return fallback || '操作失败，请稍后重试。'

  const lines = message
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const uniqueLines = []
  for (const line of lines) {
    if (uniqueLines[uniqueLines.length - 1] !== line) {
      uniqueLines.push(line)
    }
  }

  return uniqueLines.join('；') || fallback || '操作失败，请稍后重试。'
}

function readPersistedChannel() {
  try {
    return normalizeUpdateChannel(localStorage.getItem(UPDATE_CHANNEL_STORAGE_KEY))
  } catch {
    return 'stable'
  }
}

function readPersistedSource() {
  try {
    return normalizeUpdateSource(localStorage.getItem(UPDATE_SOURCE_STORAGE_KEY))
  } catch {
    return 'auto'
  }
}

function persistChannel(channel) {
  try {
    localStorage.setItem(UPDATE_CHANNEL_STORAGE_KEY, channel)
  } catch {
    // ignore persistence failures
  }
}

function persistSource(source) {
  try {
    localStorage.setItem(UPDATE_SOURCE_STORAGE_KEY, source)
  } catch {
    // ignore persistence failures
  }
}

function buildManifestUrl(channel, source) {
  const base = WEB_MANIFEST_BASE_BY_SOURCE[source]
  if (!base) return ''
  return `${base}/${channel}/manifest.json`
}

export const useWebUpdateStore = defineStore('webUpdate', () => {
  const initialized = ref(false)
  const supported = ref(false)
  const currentVersion = ref('')
  const currentBundleId = ref('builtin')
  const selectedChannel = ref('stable')
  const selectedSource = ref('auto')
  const resolvedSource = ref('')
  const nativeVersion = ref('')
  const latestVersion = ref('')
  const latestZipUrl = ref('')
  const latestRelease = ref(null)
  const latestVersions = ref([])
  const latestBundleChecksum = ref('')
  const latestMinNativeVersion = ref('')
  const pendingBundleId = ref('')
  const pendingVersion = ref('')
  const isChecking = ref(false)
  const isDownloading = ref(false)
  const dialogVisible = ref(false)
  const updateLevel = ref('prompt')
  const downloadProgress = ref(0)
  const lastStatus = ref('idle')
  const lastError = ref('')
  const lastCheckedAt = ref('')

  const hasUpdate = computed(() => {
    if (!latestVersion.value || !currentVersion.value) return false
    if (latestMinNativeVersion.value && nativeVersion.value) {
      if (compareVersions(nativeVersion.value, latestMinNativeVersion.value) < 0) {
        return false
      }
    }
    return compareVersions(latestVersion.value, currentVersion.value) > 0
  })

  const manifestUrl = computed(() => {
    const source = selectedSource.value === 'auto'
      ? (resolvedSource.value || 'gitee')
      : selectedSource.value
    return buildManifestUrl(selectedChannel.value, source)
  })
  const isForceUpdate = computed(() => hasUpdate.value && updateLevel.value === 'force')
  const isSilentUpdate = computed(() => hasUpdate.value && updateLevel.value === 'silent')
  const releaseNotesPreview = computed(() => buildCumulativeReleaseNotesPreview(
    latestVersions.value,
    currentVersion.value,
    latestVersion.value,
    latestRelease.value?.notes || latestRelease.value?.body || ''
  ))

  async function notifyAppReady() {
    if (!Capacitor.isNativePlatform()) return false

    try {
      await CapacitorUpdater.notifyAppReady()
      return true
    } catch {
      return false
    }
  }

  async function init() {
    if (initialized.value) return

    selectedChannel.value = readPersistedChannel()
    selectedSource.value = readPersistedSource()

    supported.value = Capacitor.isNativePlatform()
    if (!supported.value) {
      lastStatus.value = 'disabled'
      initialized.value = true
      return
    }

    try {
      const result = await CapacitorUpdater.current()
      currentBundleId.value = result?.bundle?.id || 'builtin'
      currentVersion.value = normalizeVersionTag(result?.bundle?.version || result?.native || '')
      nativeVersion.value = normalizeVersionTag(result?.native || '')
      lastStatus.value = 'ready'
      log.info('init', { bundleId: currentBundleId.value, version: currentVersion.value, native: nativeVersion.value })
    } catch (error) {
      lastStatus.value = 'error'
      lastError.value = error?.message || '读取资源版本失败。'
      log.error('init:failed', error)
    } finally {
      initialized.value = true
    }
  }

  function parseNoUpdateError(error) {
    const message = String(error?.message || '')
    if (message.includes('No new version available')) {
      return true
    }
    return false
  }

  async function checkForUpdates() {
    if (activeCheckPromise) return activeCheckPromise

    activeCheckPromise = (async () => {
      await init()
      if (!supported.value) {
        return { status: 'disabled' }
      }

      isChecking.value = true
      lastError.value = ''

      try {
        const sourceCandidates = resolveSourceCandidates(selectedSource.value)
        let manifest = null
        let resolvedManifestSource = ''
        let resolvedManifestUrl = ''
        let lastRequestError = null

        for (const source of sourceCandidates) {
          try {
            const candidateUrl = buildManifestUrl(selectedChannel.value, source)
            manifest = await fetchWebManifest(candidateUrl)
            resolvedManifestSource = source
            resolvedManifestUrl = candidateUrl
            break
          } catch (error) {
            log.warn('check:manifest-fetch-failed', { source, error: error?.message })
            lastRequestError = error
          }
        }

        if (!manifest) {
          throw lastRequestError || new Error('未获取到可用 manifest。')
        }

        resolvedSource.value = resolvedManifestSource
        latestRelease.value = manifest
        updateLevel.value = resolveUpdateLevelFromManifest(manifest)
        lastCheckedAt.value = new Date().toISOString()

        latestVersion.value = normalizeVersionTag(manifest?.version || '')
        latestZipUrl.value = resolveBundleUrl(resolvedManifestUrl, manifest?.url)
        const rawChecksum = manifest?.hash ?? manifest?.checksum ?? manifest?.sha256 ?? ''
        latestBundleChecksum.value = normalizeChecksum(rawChecksum)
        latestMinNativeVersion.value = normalizeVersionTag(manifest?.minNativeVersion || '')
        latestVersions.value = await fetchWebVersions(buildVersionsUrl(resolvedManifestUrl))

        if (!latestVersion.value || !latestZipUrl.value) {
          latestVersion.value = ''
          latestZipUrl.value = ''
          latestBundleChecksum.value = ''
          latestMinNativeVersion.value = ''
          lastStatus.value = 'missing-asset'
          return { status: 'missing-asset', manifest, source: resolvedManifestSource }
        }

        // 强制校验：manifest 必须携带合法 SHA-256，否则拒绝该资源更新（防止未校验的 bundle 被激活）
        if (!latestBundleChecksum.value) {
          latestVersion.value = ''
          latestZipUrl.value = ''
          latestMinNativeVersion.value = ''
          throw new Error(String(rawChecksum || '').trim()
            ? '资源清单 hash 格式无效，应为 64 位 SHA-256。'
            : '资源清单缺少 hash 校验字段，已拒绝该资源更新。')
        }

        if (latestMinNativeVersion.value && nativeVersion.value) {
          if (compareVersions(nativeVersion.value, latestMinNativeVersion.value) < 0) {
            lastStatus.value = 'incompatible-native'
            return { status: 'incompatible-native', manifest, source: resolvedManifestSource }
          }
        }

        if (!latestVersion.value || !currentVersion.value) {
          lastStatus.value = 'ready'
          return { status: 'ready', manifest, source: resolvedManifestSource }
        }

        if (compareVersions(latestVersion.value, currentVersion.value) > 0) {
          lastStatus.value = 'available'
          dialogVisible.value = !isSilentUpdate.value
          log.info('check:update-available', { current: currentVersion.value, latest: latestVersion.value, source: resolvedManifestSource, level: updateLevel.value })
          return { status: 'available', manifest, source: resolvedManifestSource }
        }

        lastStatus.value = 'latest'
        dialogVisible.value = false
        updateLevel.value = 'prompt'
        latestVersions.value = []
        return { status: 'latest', manifest, source: resolvedManifestSource }
      } catch (error) {
        lastCheckedAt.value = new Date().toISOString()
        if (parseNoUpdateError(error)) {
          lastStatus.value = 'latest'
          return { status: 'latest' }
        }
        lastStatus.value = 'error'
        lastError.value = normalizeErrorMessage(error, '检查资源更新失败，请稍后再试。')
        log.error('check:failed', { channel: selectedChannel.value, source: selectedSource.value }, error)
        throw error
      } finally {
        isChecking.value = false
        activeCheckPromise = null
      }
    })()

    return activeCheckPromise
  }

  async function downloadAndPrepareUpdate() {
    await init()
    if (!supported.value) {
      lastError.value = '仅原生环境支持资源增量更新。'
      return false
    }

    if (!latestZipUrl.value || !latestVersion.value) {
      lastError.value = '未找到可用的资源包 URL。'
      return false
    }

    // 纵深防御：无校验哈希绝不启动下载（与 checkForUpdates 的强制校验双保险）
    if (!latestBundleChecksum.value) {
      lastError.value = '资源包缺少校验哈希，已取消下载。'
      return false
    }

    isDownloading.value = true
    downloadProgress.value = 0
    lastError.value = ''
    log.info('download:start', { version: latestVersion.value, url: latestZipUrl.value })

    let listener = null
    try {
      listener = await CapacitorUpdater.addListener('download', (state) => {
        const percent = Number(state?.percent)
        if (!Number.isFinite(percent)) return
        downloadProgress.value = Number(Math.max(0, Math.min(100, percent)).toFixed(1))
      })

      // checksum 必传：CapacitorUpdater 仅在提供 checksum 时才执行校验
      const downloadOptions = {
        version: latestVersion.value,
        url: latestZipUrl.value,
        checksum: latestBundleChecksum.value
      }

      const bundle = await CapacitorUpdater.download(downloadOptions)

      if (!bundle?.id) {
        throw new Error('资源包下载成功但未拿到 bundle id。')
      }

      await CapacitorUpdater.next({ id: bundle.id })
      pendingBundleId.value = bundle.id
      pendingVersion.value = normalizeVersionTag(bundle.version || latestVersion.value)
      downloadProgress.value = 100
      lastStatus.value = 'pending'
      log.info('download:done', { bundleId: bundle.id, version: pendingVersion.value })
      return true
    } catch (error) {
      log.error('download:failed', { version: latestVersion.value, progress: downloadProgress.value }, error)
      await rollbackToCurrentBundle()
      lastStatus.value = 'error'
      lastError.value = normalizeErrorMessage(error, '下载资源更新失败，请稍后再试。')
      return false
    } finally {
      isDownloading.value = false
      await listener?.remove?.()
    }
  }

  async function applyPendingUpdateNow() {
    await init()
    if (!supported.value) {
      lastError.value = '仅原生环境支持资源增量更新。'
      return false
    }

    const targetBundleId = String(pendingBundleId.value || '').trim()
    if (!targetBundleId) {
      lastError.value = '暂无待应用的资源包，请先下载更新。'
      return false
    }

    try {
      log.info('apply:start', { bundleId: targetBundleId, version: pendingVersion.value })
      await CapacitorUpdater.set({ id: targetBundleId })
      return true
    } catch (error) {
      const rolledBack = await rollbackToCurrentBundle()
      log.error('apply:failed', { bundleId: targetBundleId, rolledBack }, error)
      lastStatus.value = 'error'
      lastError.value = normalizeErrorMessage(
        error,
        rolledBack
          ? '应用资源更新失败，已回滚到当前稳定版本。'
          : '应用资源更新失败，请手动重启应用。'
      )
      return false
    }
  }

  async function rollbackToCurrentBundle() {
    await init()
    if (!supported.value) return false

    const fallbackId = String(currentBundleId.value || 'builtin').trim() || 'builtin'
    try {
      await CapacitorUpdater.next({ id: fallbackId })
      pendingBundleId.value = ''
      pendingVersion.value = ''
      log.warn('rollback:done', { fallbackId })
      return true
    } catch (error) {
      log.error('rollback:failed', { fallbackId }, error)
      return false
    }
  }

  async function resetToBuiltinBundle() {
    await init()
    if (!supported.value) {
      lastError.value = '仅原生环境支持资源增量更新。'
      return false
    }

    try {
      log.info('reset-to-builtin:start')
      await CapacitorUpdater.reset({ toLastSuccessful: false })
      return true
    } catch (error) {
      log.error('reset-to-builtin:failed', error)
      lastStatus.value = 'error'
      lastError.value = normalizeErrorMessage(error, '恢复内置资源失败，请手动重启应用。')
      return false
    }
  }

  function setUpdateChannel(channel) {
    const nextChannel = normalizeUpdateChannel(channel)
    if (selectedChannel.value === nextChannel) return

    selectedChannel.value = nextChannel
    persistChannel(nextChannel)

    latestVersion.value = ''
    latestZipUrl.value = ''
    latestRelease.value = null
    latestVersions.value = []
    latestBundleChecksum.value = ''
    latestMinNativeVersion.value = ''
    resolvedSource.value = ''
    dialogVisible.value = false
    updateLevel.value = 'prompt'
    lastStatus.value = 'ready'
    lastError.value = ''
  }

  function setUpdateSource(source) {
    const nextSource = normalizeUpdateSource(source)
    if (selectedSource.value === nextSource) return

    selectedSource.value = nextSource
    persistSource(nextSource)

    latestVersion.value = ''
    latestZipUrl.value = ''
    latestRelease.value = null
    latestVersions.value = []
    latestBundleChecksum.value = ''
    latestMinNativeVersion.value = ''
    resolvedSource.value = ''
    dialogVisible.value = false
    updateLevel.value = 'prompt'
    lastStatus.value = 'ready'
    lastError.value = ''
  }

  function dismissDialog() {
    if (isForceUpdate.value) return
    dialogVisible.value = false
  }

  return {
    initialized,
    supported,
    currentVersion,
    currentBundleId,
    selectedChannel,
    selectedSource,
    resolvedSource,
    availableUpdateChannels: AVAILABLE_UPDATE_CHANNELS,
    availableUpdateSources: AVAILABLE_UPDATE_SOURCES,
    manifestUrl,
    nativeVersion,
    latestVersion,
    latestZipUrl,
    latestRelease,
    latestVersions,
    latestMinNativeVersion,
    updateLevel,
    isForceUpdate,
    isSilentUpdate,
    releaseNotesPreview,
    dialogVisible,
    pendingBundleId,
    pendingVersion,
    isChecking,
    isDownloading,
    downloadProgress,
    hasUpdate,
    lastStatus,
    lastError,
    lastCheckedAt,
    notifyAppReady,
    init,
    setUpdateChannel,
    setUpdateSource,
    dismissDialog,
    checkForUpdates,
    downloadAndPrepareUpdate,
    applyPendingUpdateNow,
    resetToBuiltinBundle
  }
})
