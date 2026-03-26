import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { Capacitor } from '@capacitor/core'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import {
  compareVersions,
  normalizeVersionTag
} from '@/utils/githubRelease'

const WEB_MANIFEST_URL_BASE = 'https://laurenszero.github.io/goods_app'
const UPDATE_CHANNEL_STORAGE_KEY = 'goods_web_update_channel'
const AVAILABLE_UPDATE_CHANNELS = Object.freeze(['stable', 'beta'])
const REQUEST_TIMEOUT_MS = 15000

let activeCheckPromise = null

async function fetchWebManifest(url) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
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

function normalizeUpdateChannel(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (AVAILABLE_UPDATE_CHANNELS.includes(normalized)) return normalized
  return 'stable'
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

function persistChannel(channel) {
  try {
    localStorage.setItem(UPDATE_CHANNEL_STORAGE_KEY, channel)
  } catch {
    // ignore persistence failures
  }
}

export const useWebUpdateStore = defineStore('webUpdate', () => {
  const initialized = ref(false)
  const supported = ref(false)
  const currentVersion = ref('')
  const currentBundleId = ref('builtin')
  const selectedChannel = ref('stable')
  const nativeVersion = ref('')
  const latestVersion = ref('')
  const latestZipUrl = ref('')
  const latestRelease = ref(null)
  const latestMinNativeVersion = ref('')
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
    if (latestMinNativeVersion.value && nativeVersion.value) {
      if (compareVersions(nativeVersion.value, latestMinNativeVersion.value) < 0) {
        return false
      }
    }
    return compareVersions(latestVersion.value, currentVersion.value) > 0
  })

  const manifestUrl = computed(() => `${WEB_MANIFEST_URL_BASE}/${selectedChannel.value}/manifest.json`)

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
        const manifest = await fetchWebManifest(manifestUrl.value)
        latestRelease.value = manifest
        lastCheckedAt.value = new Date().toISOString()

        latestVersion.value = normalizeVersionTag(manifest?.version || '')
        latestZipUrl.value = normalizeBundleUrl(manifest?.url)
        latestMinNativeVersion.value = normalizeVersionTag(manifest?.minNativeVersion || '')

        if (!latestVersion.value || !latestZipUrl.value) {
          latestVersion.value = ''
          latestZipUrl.value = ''
          latestMinNativeVersion.value = ''
          lastStatus.value = 'missing-asset'
          return { status: 'missing-asset', manifest }
        }

        if (latestMinNativeVersion.value && nativeVersion.value) {
          if (compareVersions(nativeVersion.value, latestMinNativeVersion.value) < 0) {
            lastStatus.value = 'incompatible-native'
            return { status: 'incompatible-native', manifest }
          }
        }

        if (!latestVersion.value || !currentVersion.value) {
          lastStatus.value = 'ready'
          return { status: 'ready', manifest }
        }

        if (compareVersions(latestVersion.value, currentVersion.value) > 0) {
          lastStatus.value = 'available'
          return { status: 'available', manifest }
        }

        lastStatus.value = 'latest'
        return { status: 'latest', manifest }
      } catch (error) {
        lastCheckedAt.value = new Date().toISOString()
        if (parseNoUpdateError(error)) {
          lastStatus.value = 'latest'
          return { status: 'latest' }
        }
        lastStatus.value = 'error'
        lastError.value = normalizeErrorMessage(error, '检查资源更新失败，请稍后再试。')
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
      await CapacitorUpdater.set({ id: targetBundleId })
      return true
    } catch (error) {
      lastStatus.value = 'error'
      lastError.value = normalizeErrorMessage(error, '应用资源更新失败，请手动重启应用。')
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
      await CapacitorUpdater.reset({ toLastSuccessful: false })
      return true
    } catch (error) {
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
    latestMinNativeVersion.value = ''
    lastStatus.value = 'ready'
    lastError.value = ''
  }

  return {
    initialized,
    supported,
    currentVersion,
    currentBundleId,
    selectedChannel,
    availableUpdateChannels: AVAILABLE_UPDATE_CHANNELS,
    manifestUrl,
    nativeVersion,
    latestVersion,
    latestZipUrl,
    latestRelease,
    latestMinNativeVersion,
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
    checkForUpdates,
    downloadAndPrepareUpdate,
    applyPendingUpdateNow,
    resetToBuiltinBundle
  }
})
