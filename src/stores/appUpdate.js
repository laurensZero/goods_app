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
  resolveReleaseTargetUrl,
  proxyGitHubDownloadUrl,
  TokenExpiredError
} from '@/utils/github/release'
import { readSyncKey } from '@/utils/sync/storage'
import { AVAILABLE_UPDATE_LEVELS, AVAILABLE_UPDATE_SOURCES, normalizeUpdateLevel, parseApkSha256FromText, resolveSourceCandidates } from '@/utils/updateHelpers'
import { computeFileSha256 } from '@/utils/platform/fileHash'
import i18n from '@/locales'
import { createLogger } from '@/utils/logger'

const log = createLogger('app-update')

const UPDATE_REPO_NAME = 'goods_app'
const UPDATE_REPO_OWNER_BY_SOURCE = Object.freeze({
  github: 'laurensZero',
  gitee: 'laurenszero'
})
const UPDATE_SOURCE_STORAGE_KEY = 'goods_app_update_source'
const SYNC_TOKEN_STORAGE_KEY = 'sync_github_token'
const FALLBACK_VERSION = normalizeVersionTag(import.meta.env.VITE_APP_VERSION || packageJson.version || '0.0.0')
const SUPPORT_WEB_MOCK_DOWNLOAD = import.meta.env.DEV && !Capacitor.isNativePlatform()
const SHOULD_SKIP_UPDATE_CHECK = import.meta.env.DEV && !Capacitor.isNativePlatform() && !SUPPORT_WEB_MOCK_DOWNLOAD

let activeCheckPromise = null

// 原生升级完成后清理下载缓存中的历史 APK（安装器拉起后文件不再需要，供 main.js 调用）
export async function cleanupDownloadedApkFiles() {
  if (!Capacitor.isNativePlatform()) return
  try {
    await Filesystem.rmdir({
      path: 'updates',
      directory: Directory.Cache,
      recursive: true
    })
    log.info('cleanup:apk-cache-removed')
  } catch {
    // updates 目录不存在等情况忽略
  }
}

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

// 从 release body 解析 apk_sha256 元数据（由 build-apk.yml 工作流写入 release notes）
function resolveApkSha256FromRelease(release) {
  return parseApkSha256FromText(release?.body)
}

async function fetchLatestReleaseBySource(source) {
  const owner = UPDATE_REPO_OWNER_BY_SOURCE[source]
  if (!owner) {
    throw new Error(i18n.global.t('about.unsupportedUpdateSource', { source }))
  }

  if (source === 'gitee') {
    return getLatestReleaseFromGitee(owner, UPDATE_REPO_NAME)
  }

  const token = String(await readSyncKey(SYNC_TOKEN_STORAGE_KEY) || '').trim()
  try {
    return await getLatestRelease(owner, UPDATE_REPO_NAME, token)
  } catch (error) {
    if (token && error instanceof TokenExpiredError) {
      return getLatestRelease(owner, UPDATE_REPO_NAME, '')
    }
    throw error
  }
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
  const releaseApkSha256 = computed(() => resolveApkSha256FromRelease(latestRelease.value))
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
    ) {
      return i18n.global.t('about.installPermissionDenied')
    }

    if (raw.includes('bad credentials') || raw.includes('401') || error instanceof TokenExpiredError) {
      return i18n.global.t('about.githubAuthFailed')
    }

    return error?.message || i18n.global.t('about.downloadFailed')
  }

  async function downloadAndInstallUpdate() {
    downloadError.value = ''
    downloadProgress.value = 0
    downloadSpeed.value = ''
    downloadTransferred.value = ''

    if (!hasUpdate.value) {
      downloadError.value = i18n.global.t('about.alreadyLatest')
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

        downloadSpeed.value = i18n.global.t('about.mockDownloadDoneShort')
        return true
      } finally {
        isDownloading.value = false
      }
    }

    const asset = releaseAsset.value
    const rawDownloadUrl = asset?.browser_download_url
    const downloadUrl = proxyGitHubDownloadUrl(rawDownloadUrl)

    if (!rawDownloadUrl) {
      downloadError.value = i18n.global.t('about.noDownloadableAsset')
      return false
    }

    isDownloading.value = true
    log.info('download:start', { version: latestVersion.value, asset: asset?.name })

    let progressListener = null
    try {
      const fileName = normalizePackageFilename(asset?.name)
      const filePath = `updates/${fileName}`
      const startedAt = Date.now()
      const syncToken = String(await readSyncKey(SYNC_TOKEN_STORAGE_KEY) || '').trim()

      await Filesystem.mkdir({
        path: 'updates',
        directory: Directory.Cache,
        recursive: true
      }).catch(() => {
        // ignore if directory already exists
      })

      progressListener = await Filesystem.addListener('progress', (status) => {
        if (status?.url && status.url !== downloadUrl && status.url !== rawDownloadUrl) return

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

      const expectedSha256 = releaseApkSha256.value
      if (!expectedSha256) {
        console.warn('[appUpdate] release 未提供 apk_sha256，跳过完整性校验（旧版 release 兼容）')
      }

      // 候选下载地址：代理地址优先；校验失败时回退直连 GitHub（代理仅作为不可信字节传输通道）
      const candidateUrls = downloadUrl === rawDownloadUrl ? [downloadUrl] : [downloadUrl, rawDownloadUrl]
      let verified = false

      for (const candidateUrl of candidateUrls) {
        // 仅直连 GitHub 时携带同步 token（避免向代理泄露凭据）
        const downloadHeaders = (syncToken && candidateUrl === rawDownloadUrl) ? { Authorization: `Bearer ${syncToken}` } : {}

        let downloadAttempt = 0
        while (downloadAttempt < 2) {
          downloadAttempt += 1
          try {
            await Filesystem.downloadFile({
              url: candidateUrl,
              path: filePath,
              directory: Directory.Cache,
              progress: true,
              recursive: true,
              headers: downloadHeaders
            })
            break
          } catch (downloadErr) {
            if (downloadAttempt >= 2) throw downloadErr
            await sleep(450)
          }
        }

        // 旧版 release 无 apk_sha256：跳过校验（fail-open，见上方 warn）
        if (!expectedSha256) {
          verified = true
          break
        }

        // 下载完成后校验安装包完整性
        downloadSpeed.value = i18n.global.t('about.apkVerifying')
        const actualSha256 = await computeFileSha256(filePath, Directory.Cache)
        if (actualSha256 === expectedSha256) {
          verified = true
          break
        }

        // 校验失败：删除损坏文件；若还有直连候选地址则重试
        log.warn('download:sha256-mismatch', { url: candidateUrl })
        await Filesystem.deleteFile({ path: filePath, directory: Directory.Cache }).catch(() => {})
      }

      if (!verified) {
        throw new Error(i18n.global.t('about.apkHashMismatch'))
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
      log.info('download:done', { version: latestVersion.value, verified })
      return true
    } catch (error) {
      log.error('download:failed', { version: latestVersion.value, progress: downloadProgress.value }, error)
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
            log.warn('check:release-fetch-failed', { source: candidate, error: error?.message })
            lastRequestError = error
          }
        }

        if (!release) {
          throw lastRequestError || new Error(i18n.global.t('about.noVersionInfo'))
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
          log.info('check:update-available', { current: currentVersion.value, latest: latestVersion.value, source: resolvedReleaseSource, level: updateLevel.value })
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
        lastError.value = error?.message || i18n.global.t('about.checkUpdateFailedRetry')
        log.error('check:failed', { source: selectedSource.value }, error)
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
    releaseApkSha256,
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
