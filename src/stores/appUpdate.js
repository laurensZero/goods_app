import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { FileOpener } from '@capawesome-team/capacitor-file-opener'
import packageJson from '../../package.json'
import {
  buildReleaseNotesPreview,
  compareVersions,
  getLatestRelease,
  getLatestReleaseFromGitee,
  normalizeVersionTag,
  resolveReleaseAsset,
  resolveReleaseTargetUrl
} from '@/utils/githubRelease'
import { readSyncKey } from '@/utils/syncStorage'

const UPDATE_REPO_NAME = 'goods_app'
const UPDATE_REPO_OWNER_BY_SOURCE = Object.freeze({
  github: 'laurensZero',
  gitee: 'laurenszero'
})
const UPDATE_SOURCE_STORAGE_KEY = 'goods_app_update_source'
const SYNC_TOKEN_STORAGE_KEY = 'sync_github_token'
const AVAILABLE_UPDATE_SOURCES = Object.freeze(['auto', 'gitee', 'github'])
const FALLBACK_VERSION = normalizeVersionTag(import.meta.env.VITE_APP_VERSION || packageJson.version || '0.0.0')
const SUPPORT_WEB_MOCK_DOWNLOAD = import.meta.env.DEV && !Capacitor.isNativePlatform()
const SHOULD_SKIP_UPDATE_CHECK = import.meta.env.DEV && !Capacitor.isNativePlatform() && !SUPPORT_WEB_MOCK_DOWNLOAD
const AVAILABLE_UPDATE_LEVELS = Object.freeze(['force', 'prompt', 'silent'])

let activeCheckPromise = null

function normalizeUpdateSource(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (AVAILABLE_UPDATE_SOURCES.includes(normalized)) return normalized
  return 'auto'
}

function resolveUpdateTargetPlatform() {
  if (Capacitor.isNativePlatform()) {
    return Capacitor.getPlatform()
  }

  const userAgent = String(navigator.userAgent || '').toLowerCase()
  if (userAgent.includes('tauri')) {
    if (userAgent.includes('windows')) return 'windows'
    if (userAgent.includes('mac os') || userAgent.includes('macintosh')) return 'darwin'
    if (userAgent.includes('linux')) return 'linux'
  }

  return 'android'
}

function readPersistedSource() {
  try {
    return normalizeUpdateSource(localStorage.getItem(UPDATE_SOURCE_STORAGE_KEY))
  } catch {
    return 'auto'
  }
}

function persistSource(source) {
  try {
    localStorage.setItem(UPDATE_SOURCE_STORAGE_KEY, source)
  } catch {
    // ignore persistence failures
  }
}

function resolveSourceCandidates(source) {
  if (source === 'auto') return ['gitee', 'github']
  return [source]
}

function normalizeUpdateLevel(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (AVAILABLE_UPDATE_LEVELS.includes(normalized)) return normalized
  return 'prompt'
}

function resolveUpdateLevelFromRelease(release) {
  const body = String(release?.body || '').trim()
  if (!body) return 'prompt'

  const explicitMatch = body.match(/(?:update[_-]?level|更新级别)\s*[:=]\s*(force|prompt|silent)/i)
  if (explicitMatch?.[1]) {
    return normalizeUpdateLevel(explicitMatch[1])
  }

  const tagMatch = body.match(/\[(?:update[_-]?level)\s*:\s*(force|prompt|silent)\]/i)
  if (tagMatch?.[1]) {
    return normalizeUpdateLevel(tagMatch[1])
  }

  return 'prompt'
}

async function fetchLatestReleaseBySource(source) {
  const owner = UPDATE_REPO_OWNER_BY_SOURCE[source]
  if (!owner) {
    throw new Error(`不支持的更新源：${source}`)
  }

  if (source === 'gitee') {
    return getLatestReleaseFromGitee(owner, UPDATE_REPO_NAME)
  }

  const token = String(await readSyncKey(SYNC_TOKEN_STORAGE_KEY) || '').trim()
  return getLatestRelease(owner, UPDATE_REPO_NAME, token)
}

export const useAppUpdateStore = defineStore('appUpdate', () => {
  const initialized = ref(false)
  const selectedSource = ref('auto')
  const resolvedSource = ref('')
  const currentVersion = ref(FALLBACK_VERSION)
  const currentBuild = ref('')
  const latestRelease = ref(null)
  const isChecking = ref(false)
  const dialogVisible = ref(false)
  const lastCheckedAt = ref('')
  const lastError = ref('')
  const lastStatus = ref('idle')
  const isDownloading = ref(false)
  const downloadError = ref('')
  const downloadProgress = ref(0)
  const downloadSpeed = ref('')
  const downloadTransferred = ref('')
  const forceMockDialog = ref(false)
  const updateLevel = ref('prompt')
  const nativeAndroidDownloadEnabled = computed(() => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android')
  const usingMockDownload = computed(() => !nativeAndroidDownloadEnabled.value && SUPPORT_WEB_MOCK_DOWNLOAD)

  const latestVersion = computed(() => normalizeVersionTag(latestRelease.value?.tag_name || ''))
  const hasUpdate = computed(() => (
    forceMockDialog.value
    || (
    !!latestVersion.value
    && compareVersions(latestVersion.value, currentVersion.value) > 0
    )
  ))
  const updateTargetPlatform = computed(() => resolveUpdateTargetPlatform())
  const releaseTargetUrl = computed(() => resolveReleaseTargetUrl(latestRelease.value, updateTargetPlatform.value))
  const releaseAsset = computed(() => resolveReleaseAsset(latestRelease.value, updateTargetPlatform.value))
  const supportsInAppDownload = computed(() => nativeAndroidDownloadEnabled.value || usingMockDownload.value)
  const releaseNotesPreview = computed(() => buildReleaseNotesPreview(latestRelease.value?.body))
  const isForceUpdate = computed(() => hasUpdate.value && updateLevel.value === 'force')
  const isSilentUpdate = computed(() => hasUpdate.value && updateLevel.value === 'silent')

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  function formatBytes(bytes) {
    const value = Number(bytes)
    if (!Number.isFinite(value) || value <= 0) return '0 B'

    const units = ['B', 'KB', 'MB', 'GB']
    let unitIndex = 0
    let size = value

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex += 1
    }

    const precision = size >= 100 ? 0 : size >= 10 ? 1 : 2
    return `${size.toFixed(precision)} ${units[unitIndex]}`
  }

  async function init() {
    if (initialized.value) return

    selectedSource.value = readPersistedSource()

    try {
      if (Capacitor.isNativePlatform()) {
        const info = await CapacitorApp.getInfo()
        currentVersion.value = normalizeVersionTag(info?.version || FALLBACK_VERSION) || FALLBACK_VERSION
        currentBuild.value = String(info?.build || '')
      } else {
        currentVersion.value = FALLBACK_VERSION
      }
    } catch {
      currentVersion.value = FALLBACK_VERSION
    } finally {
      initialized.value = true
    }
  }

  function dismissDialog() {
    if (isForceUpdate.value) return
    dialogVisible.value = false
  }

  function openReleasePage() {
    const url = releaseTargetUrl.value
    if (!url) return false

    dialogVisible.value = false

    try {
      const openedWindow = window.open(url, '_blank', 'noopener,noreferrer')
      if (!openedWindow) {
        window.location.href = url
      }
      return true
    } catch {
      window.location.href = url
      return true
    }
  }

  function normalizePackageFilename(filename) {
    const normalized = String(filename || '').trim().replace(/[^a-zA-Z0-9._-]+/g, '_')
    if (!normalized) {
      return `goods_app_v${latestVersion.value || currentVersion.value || 'latest'}.apk`
    }
    return normalized
  }

  function resolveDownloadErrorMessage(error) {
    const raw = String(error?.message || '').toLowerCase()
    if (
      raw.includes('unknown sources')
      || raw.includes('install_unknown_apps')
      || raw.includes('permission')
      || raw.includes('not allowed')
      || raw.includes('权限')
    ) {
      return '未授予安装权限。请到系统设置 > 应用 > 谷子收纳 > 安装未知应用，开启“允许来自此来源”。'
    }

    return error?.message || '下载更新包失败，请稍后再试。'
  }

  async function downloadAndInstallUpdate() {
    downloadError.value = ''
    downloadProgress.value = 0
    downloadSpeed.value = ''
    downloadTransferred.value = ''

    if (!hasUpdate.value) {
      downloadError.value = '当前已是最新版本。'
      return false
    }

    if (!supportsInAppDownload.value) {
      return openReleasePage()
    }

    if (usingMockDownload.value) {
      isDownloading.value = true

      try {
        const totalBytes = 28 * 1024 * 1024
        let progress = 0

        while (progress < 100) {
          progress = Math.min(100, progress + Math.floor(Math.random() * 9) + 3)
          downloadProgress.value = progress
          const transferred = Math.floor((totalBytes * progress) / 100)
          downloadTransferred.value = `${formatBytes(transferred)} / ${formatBytes(totalBytes)}`
          const mockSpeed = 2.5 * 1024 * 1024 + Math.random() * 4.5 * 1024 * 1024
          downloadSpeed.value = `${formatBytes(mockSpeed)}/s`
          await sleep(140)
        }

        downloadSpeed.value = '模拟完成'
        return true
      } finally {
        isDownloading.value = false
      }
    }

    const asset = releaseAsset.value
    const downloadUrl = asset?.browser_download_url

    if (!downloadUrl) {
      downloadError.value = '未找到可下载的更新包。'
      return false
    }

    isDownloading.value = true

    let progressListener = null
    try {
      const fileName = normalizePackageFilename(asset?.name)
      const filePath = `updates/${fileName}`
      const startedAt = Date.now()

      await Filesystem.mkdir({
        path: 'updates',
        directory: Directory.Cache,
        recursive: true
      }).catch(() => {
        // ignore if directory already exists
      })

      progressListener = await Filesystem.addListener('progress', (status) => {
        if (status?.url && status.url !== downloadUrl) return

        const downloadedBytes = Number(status?.bytes || 0)
        const totalBytes = Number(status?.contentLength || 0)
        if (totalBytes > 0) {
          const progress = Math.min(100, (downloadedBytes / totalBytes) * 100)
          downloadProgress.value = Number(progress.toFixed(1))
          downloadTransferred.value = `${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}`
        } else {
          downloadTransferred.value = formatBytes(downloadedBytes)
        }

        const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 0.2)
        const bytesPerSecond = downloadedBytes / elapsedSeconds
        downloadSpeed.value = `${formatBytes(bytesPerSecond)}/s`
      })

      let downloadAttempt = 0
      while (downloadAttempt < 2) {
        downloadAttempt += 1
        try {
          await Filesystem.downloadFile({
            url: downloadUrl,
            path: filePath,
            directory: Directory.Cache,
            progress: true,
            recursive: true
          })
          break
        } catch (downloadErr) {
          if (downloadAttempt >= 2) throw downloadErr
          await sleep(450)
        }
      }

      const { uri } = await Filesystem.getUri({
        path: filePath,
        directory: Directory.Cache
      })

      await FileOpener.openFile({
        path: uri,
        mimeType: 'application/vnd.android.package-archive'
      })

      downloadProgress.value = 100
      dialogVisible.value = false
      return true
    } catch (error) {
      downloadError.value = resolveDownloadErrorMessage(error)
      return false
    } finally {
      await progressListener?.remove?.()
      isDownloading.value = false
    }
  }

  async function checkForUpdates({ source = 'manual' } = {}) {
    if (activeCheckPromise) return activeCheckPromise

    activeCheckPromise = (async () => {
      await init()
      isChecking.value = true
      lastError.value = ''
      forceMockDialog.value = false

      try {
        if (SHOULD_SKIP_UPDATE_CHECK) {
          lastCheckedAt.value = new Date().toISOString()
          lastStatus.value = 'disabled'
          dialogVisible.value = false
          return { status: 'disabled', release: null }
        }

        const sourceCandidates = resolveSourceCandidates(selectedSource.value)
        let release = null
        let resolvedReleaseSource = ''
        let lastRequestError = null

        for (const candidate of sourceCandidates) {
          try {
            release = await fetchLatestReleaseBySource(candidate)
            resolvedReleaseSource = candidate
            break
          } catch (error) {
            lastRequestError = error
          }
        }

        if (!release) {
          throw lastRequestError || new Error('未获取到可用版本信息。')
        }

        resolvedSource.value = resolvedReleaseSource
        latestRelease.value = release
        updateLevel.value = resolveUpdateLevelFromRelease(release)
        lastCheckedAt.value = new Date().toISOString()

        if (usingMockDownload.value && source === 'manual' && !hasUpdate.value) {
          forceMockDialog.value = true
        }

        if (hasUpdate.value) {
          lastStatus.value = 'available'
          dialogVisible.value = !isSilentUpdate.value
          return { status: 'available', release, source: resolvedReleaseSource }
        }

        lastStatus.value = 'latest'
        updateLevel.value = 'prompt'
        if (source === 'manual') {
          dialogVisible.value = false
        }
        return { status: 'latest', release, source: resolvedReleaseSource }
      } catch (error) {
        lastCheckedAt.value = new Date().toISOString()
        lastStatus.value = 'error'
        lastError.value = error?.message || '检查更新失败，请稍后再试。'
        throw error
      } finally {
        isChecking.value = false
        activeCheckPromise = null
      }
    })()

    return activeCheckPromise
  }

  function setUpdateSource(source) {
    const nextSource = normalizeUpdateSource(source)
    if (selectedSource.value === nextSource) return

    selectedSource.value = nextSource
    persistSource(nextSource)
    resolvedSource.value = ''
    latestRelease.value = null
    updateLevel.value = 'prompt'
    lastStatus.value = 'idle'
    lastError.value = ''
  }

  return {
    selectedSource,
    resolvedSource,
    availableUpdateSources: AVAILABLE_UPDATE_SOURCES,
    currentVersion,
    currentBuild,
    latestRelease,
    latestVersion,
    hasUpdate,
    isChecking,
    dialogVisible,
    lastCheckedAt,
    lastError,
    lastStatus,
    isDownloading,
    downloadError,
    downloadProgress,
    downloadSpeed,
    downloadTransferred,
    releaseTargetUrl,
    releaseAsset,
    supportsInAppDownload,
    usingMockDownload,
    releaseNotesPreview,
    updateLevel,
    isForceUpdate,
    isSilentUpdate,
    setUpdateSource,
    init,
    dismissDialog,
    openReleasePage,
    downloadAndInstallUpdate,
    checkForUpdates
  }
})
