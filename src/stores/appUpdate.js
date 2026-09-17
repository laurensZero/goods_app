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
  normalizeVersionTag,
  resolveReleaseAsset,
  resolveReleaseTargetUrl
} from '@/utils/github/release'
import { normalizeUpdateLevel, parseApkSha256FromText, toDirectStorageUrl } from '@/utils/updateHelpers'
import { computeFileSha256 } from '@/utils/platform/fileHash'
import { getSupabaseClient } from '@/utils/sync/supabaseClient'
import i18n from '@/locales'
import { createLogger } from '@/utils/logger'
import { isDevVersionMockEnabled, resolveMockAppVersion } from '@/utils/dev/mockVersion'

const log = createLogger('app-update')

const FALLBACK_VERSION = normalizeVersionTag(import.meta.env.VITE_APP_VERSION || packageJson.version || '0.0.0')
// DEV 浏览器：保留 mock 下载流程用于测试更新 UI
const SUPPORT_WEB_MOCK_DOWNLOAD = import.meta.env.DEV && !Capacitor.isNativePlatform()
// 生产纯 Web（Cloudflare Pages 等）：部署即最新，跳过 APK 更新检测
const SHOULD_SKIP_UPDATE_CHECK = !import.meta.env.DEV && !Capacitor.isNativePlatform()
// dev 浏览器强制弹出 mock 下载对话框的开关：默认关闭（保持与手机端一致的真实版本比较）；
// 需要测试下载流程时设置 localStorage.setItem('goods_dev_mock_update_dialog', '1')
const FORCE_MOCK_DIALOG_KEY = 'goods_dev_mock_update_dialog'

function shouldForceMockDialog() {
  try {
    return String(localStorage.getItem(FORCE_MOCK_DIALOG_KEY) || '').trim() === '1'
  } catch {
    return false
  }
}

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

function resolveUpdateLevelFromRelease(release) {
  const structured = String(release?.update_level || '').trim().toLowerCase()
  if (structured === 'force' || structured === 'prompt' || structured === 'silent') {
    return structured
  }

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
  const structured = String(release?.apk_sha256 || '').trim().toLowerCase()
  if (/^[a-f0-9]{64}$/.test(structured)) return structured
  return parseApkSha256FromText(release?.body)
}

// 从 Supabase ota_releases 读取最新 APK 发布记录（与资源包同一后端，Android 检测更新统一走这里）
async function fetchLatestApkFromSupabase() {
  const client = getSupabaseClient()
  const { data, error } = await client
    .from('ota_releases')
    .select('*')
    .eq('type', 'apk')
    .order('published_at', { ascending: false })
    .limit(1)

  if (error) throw error

  const record = data?.[0]
  const version = normalizeVersionTag(record?.version)
  const storagePath = String(record?.storage_path || '').trim()
  if (!version || !storagePath) return null

  const downloadUrl = toDirectStorageUrl(storagePath)
  const fileName = storagePath.split('/').pop() || ''

  return {
    tag_name: version,
    body: String(record?.notes || '').trim(),
    update_level: normalizeUpdateLevel(record?.update_level),
    apk_sha256: String(record?.sha256 || '').toLowerCase(),
    html_url: downloadUrl,
    source: 'supabase',
    assets: fileName
      ? [{
          name: fileName,
          browser_download_url: downloadUrl,
          fallback_download_url: '',
          size: Number(record?.file_size || 0)
        }]
      : []
  }
}

async function fetchLatestRelease() {
  // Android APK 更新统一走 Supabase ota_releases；其它平台当前无应用内安装包更新源
  if (resolveUpdateTargetPlatform() !== 'android') return null
  return fetchLatestApkFromSupabase()
}

export const useAppUpdateStore = defineStore('appUpdate', () => {
  const initialized = ref(false)
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

    try {
      if (Capacitor.isNativePlatform()) {
        const info = await CapacitorApp.getInfo()
        currentVersion.value = normalizeVersionTag(info?.version || FALLBACK_VERSION) || FALLBACK_VERSION
        currentBuild.value = String(info?.build || '')
      } else {
        currentVersion.value = isDevVersionMockEnabled()
          ? (resolveMockAppVersion() || FALLBACK_VERSION)
          : FALLBACK_VERSION
      }
    } catch {
      currentVersion.value = isDevVersionMockEnabled()
        ? (resolveMockAppVersion() || FALLBACK_VERSION)
        : FALLBACK_VERSION
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
    const downloadUrl = asset?.browser_download_url

    if (!downloadUrl) {
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

      const expectedSha256 = releaseApkSha256.value
      if (!expectedSha256) {
        log.warn('download:missing-apk-sha256')
      }

      const downloadUrls = [downloadUrl, asset?.fallback_download_url]
        .filter((url, index, urls) => url && urls.indexOf(url) === index)
      let downloaded = false
      for (const sourceUrl of downloadUrls) {
        try {
          await Filesystem.downloadFile({
            url: sourceUrl,
            path: filePath,
            directory: Directory.Cache,
            progress: true,
            recursive: true
          })
          downloaded = true
          break
        } catch (downloadErr) {
          log.warn('download:source-failed', { url: sourceUrl }, downloadErr)
        }
      }
      if (!downloaded) throw new Error('所有更新下载源均不可用。')

      if (expectedSha256) {
        downloadSpeed.value = i18n.global.t('about.apkVerifying')
        const actualSha256 = await computeFileSha256(filePath, Directory.Cache)
        if (actualSha256 !== expectedSha256) {
          log.warn('download:sha256-mismatch', { url: downloadUrl })
          await Filesystem.deleteFile({ path: filePath, directory: Directory.Cache }).catch(() => {})
          throw new Error(i18n.global.t('about.apkHashMismatch'))
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
      log.info('download:done', { version: latestVersion.value })
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

        const release = await fetchLatestRelease()
        latestRelease.value = release
        updateLevel.value = resolveUpdateLevelFromRelease(release)
        lastCheckedAt.value = new Date().toISOString()

        if (usingMockDownload.value && source === 'manual' && !hasUpdate.value && shouldForceMockDialog()) {
          forceMockDialog.value = true
        }

        if (hasUpdate.value) {
          lastStatus.value = 'available'
          dialogVisible.value = !isSilentUpdate.value
          log.info('check:update-available', { current: currentVersion.value, latest: latestVersion.value, level: updateLevel.value })
          return { status: 'available', release }
        }

        lastStatus.value = 'latest'
        updateLevel.value = 'prompt'
        if (source === 'manual') {
          dialogVisible.value = false
        }
        return { status: 'latest', release }
      } catch (error) {
        lastCheckedAt.value = new Date().toISOString()
        lastStatus.value = 'error'
        lastError.value = error?.message || i18n.global.t('about.checkUpdateFailedRetry')
        log.error('check:failed', error)
        throw error
      } finally {
        isChecking.value = false
        activeCheckPromise = null
      }
    })()

    return activeCheckPromise
  }

  return {
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
    init,
    dismissDialog,
    openReleasePage,
    downloadAndInstallUpdate,
    checkForUpdates
  }
})
