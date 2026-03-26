import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { Capacitor } from '@capacitor/core'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import {
  compareVersions,
  getLatestRelease,
  normalizeVersionTag,
  resolveReleaseWebBundleAsset
} from '@/utils/githubRelease'

const UPDATE_REPO_OWNER = 'laurensZero'
const UPDATE_REPO_NAME = 'goods_app'

let activeCheckPromise = null

export const useWebUpdateStore = defineStore('webUpdate', () => {
  const initialized = ref(false)
  const supported = ref(false)
  const currentVersion = ref('')
  const currentBundleId = ref('builtin')
  const nativeVersion = ref('')
  const latestVersion = ref('')
  const latestZipUrl = ref('')
  const latestRelease = ref(null)
  const pendingBundleId = ref('')
  const pendingVersion = ref('')
  const isChecking = ref(false)
  const isDownloading = ref(false)
  const downloadProgress = ref(0)
  const lastStatus = ref('idle')
  const lastError = ref('')
  const lastCheckedAt = ref('')

  const hasUpdate = computed(() => {
    if (!latestVersion.value || !currentVersion.value) return false
    return compareVersions(latestVersion.value, currentVersion.value) > 0
  })

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
    } catch (error) {
      lastStatus.value = 'error'
      lastError.value = error?.message || '读取资源版本失败。'
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
        const release = await getLatestRelease(UPDATE_REPO_OWNER, UPDATE_REPO_NAME)
        latestRelease.value = release
        lastCheckedAt.value = new Date().toISOString()

        const webAsset = resolveReleaseWebBundleAsset(release)
        if (!webAsset?.browser_download_url) {
          latestVersion.value = ''
          latestZipUrl.value = ''
          lastStatus.value = 'missing-asset'
          return { status: 'missing-asset', release }
        }

        latestVersion.value = normalizeVersionTag(release?.tag_name || '')
        latestZipUrl.value = webAsset.browser_download_url

        if (!latestVersion.value || !currentVersion.value) {
          lastStatus.value = 'ready'
          return { status: 'ready', release }
        }

        if (compareVersions(latestVersion.value, currentVersion.value) > 0) {
          lastStatus.value = 'available'
          return { status: 'available', release }
        }

        lastStatus.value = 'latest'
        return { status: 'latest', release }
      } catch (error) {
        lastCheckedAt.value = new Date().toISOString()
        if (parseNoUpdateError(error)) {
          lastStatus.value = 'latest'
          return { status: 'latest' }
        }
        lastStatus.value = 'error'
        lastError.value = error?.message || '检查资源更新失败，请稍后再试。'
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
      lastError.value = '未找到可用的资源包（dist.zip）。'
      return false
    }

    isDownloading.value = true
    downloadProgress.value = 0
    lastError.value = ''

    let listener = null
    try {
      listener = await CapacitorUpdater.addListener('download', (state) => {
        const percent = Number(state?.percent)
        if (!Number.isFinite(percent)) return
        downloadProgress.value = Number(Math.max(0, Math.min(100, percent)).toFixed(1))
      })

      const bundle = await CapacitorUpdater.download({
        version: latestVersion.value,
        url: latestZipUrl.value
      })

      if (!bundle?.id) {
        throw new Error('资源包下载成功但未拿到 bundle id。')
      }

      await CapacitorUpdater.next({ id: bundle.id })
      pendingBundleId.value = bundle.id
      pendingVersion.value = normalizeVersionTag(bundle.version || latestVersion.value)
      downloadProgress.value = 100
      lastStatus.value = 'pending'
      return true
    } catch (error) {
      lastStatus.value = 'error'
      lastError.value = error?.message || '下载资源更新失败，请稍后再试。'
      return false
    } finally {
      isDownloading.value = false
      await listener?.remove?.()
    }
  }

  return {
    initialized,
    supported,
    currentVersion,
    currentBundleId,
    nativeVersion,
    latestVersion,
    latestZipUrl,
    latestRelease,
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
    checkForUpdates,
    downloadAndPrepareUpdate
  }
})
