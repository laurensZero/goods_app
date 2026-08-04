import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { Capacitor } from '@capacitor/core'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import {
  buildReleaseNotesPreview,
  compareVersions,
  normalizeVersionTag
} from '@/utils/github/release'
import { normalizeUpdateLevel } from '@/utils/updateHelpers'
import { SUPABASE_URL } from '@/config/supabase'
import { getSupabaseClient } from '@/utils/sync/supabaseClient'
import { createLogger } from '@/utils/logger'

const log = createLogger('web-update')

const UPDATE_CHANNEL_STORAGE_KEY = 'goods_web_update_channel'
const AVAILABLE_UPDATE_CHANNELS = Object.freeze(['stable', 'beta'])

let activeCheckPromise = null

function normalizeUpdateChannel(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (AVAILABLE_UPDATE_CHANNELS.includes(normalized)) return normalized
  // 未选择过频道时，dev 模式默认 beta
  return import.meta.env.DEV ? 'beta' : 'stable'
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
    const value = localStorage.getItem(UPDATE_CHANNEL_STORAGE_KEY)
    if (value !== null) return normalizeUpdateChannel(value)
    return import.meta.env.DEV ? 'beta' : 'stable'
  } catch {
    return import.meta.env.DEV ? 'beta' : 'stable'
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
  const selectedChannel = ref(import.meta.env.DEV ? 'beta' : 'stable')
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

  const isForceUpdate = computed(() => hasUpdate.value && updateLevel.value === 'force')
  const isSilentUpdate = computed(() => hasUpdate.value && updateLevel.value === 'silent')

  const releaseNotesPreview = computed(() => {
    if (!hasUpdate.value) return ''

    // 优先使用累积 release notes
    const historyItems = latestVersions.value
    if (Array.isArray(historyItems) && historyItems.length > 0) {
      const current = normalizeVersionTag(currentVersion.value)
      const latest = normalizeVersionTag(latestVersion.value)
      const filtered = historyItems
        .filter((item) => {
          const v = normalizeVersionTag(item.version)
          if (!v) return false
          if (current && compareVersions(v, current) <= 0) return false
          if (latest && compareVersions(v, latest) > 0) return false
          return true
        })
        .sort((a, b) => compareVersions(
          normalizeVersionTag(a.version),
          normalizeVersionTag(b.version)
        ))

      const lines = []
      filtered.forEach((item) => {
        lines.push(`v${normalizeVersionTag(item.version)}`)
        if (item.published_at) {
          const date = new Date(item.published_at)
          if (!Number.isNaN(date.getTime())) {
            const timeStr = date.toLocaleString('zh-CN', {
              timeZone: 'Asia/Shanghai',
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false
            })
            lines.push(`发布时间：${timeStr}`)
          }
        }
        const note = buildReleaseNotesPreview(item.notes)
        if (note) lines.push(note)
        lines.push('')
      })

      const cumulative = lines.join('\n').trim()
      if (cumulative) return cumulative
    }

    return buildReleaseNotesPreview(latestRelease.value?.notes || '')
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
        const client = getSupabaseClient()
        const channel = selectedChannel.value

        // 查询最新 bundle
        const { data, error } = await client
          .from('ota_releases')
          .select('*')
          .eq('channel', channel)
          .eq('type', 'web_bundle')
          .order('published_at', { ascending: false })
          .limit(1)

        if (error) {
          throw new Error(`查询更新信息失败: ${error.message}`)
        }

        if (!data || data.length === 0) {
          throw new Error(`${channel} 频道暂无可用资源包。`)
        }

        const bundle = data[0]
        latestRelease.value = bundle
        latestVersion.value = normalizeVersionTag(bundle.version)
        latestZipUrl.value = `${SUPABASE_URL}/storage/v1/object/public/ota-releases/${bundle.storage_path}`
        latestBundleChecksum.value = normalizeChecksum(bundle.sha256)
        latestMinNativeVersion.value = normalizeVersionTag(bundle.min_native_version || '')
        updateLevel.value = normalizeUpdateLevel(bundle.update_level)
        lastCheckedAt.value = new Date().toISOString()

        // 获取历史版本用于累积 release notes
        const { data: history } = await client
          .from('ota_releases')
          .select('version, notes, published_at')
          .eq('channel', channel)
          .eq('type', 'web_bundle')
          .order('published_at', { ascending: false })
          .limit(3)
        latestVersions.value = history || []

        if (!latestVersion.value || !latestZipUrl.value) {
          latestVersion.value = ''
          latestZipUrl.value = ''
          latestBundleChecksum.value = ''
          latestMinNativeVersion.value = ''
          lastStatus.value = 'missing-asset'
          return { status: 'missing-asset', bundle }
        }

        // 强制校验：bundle 必须携带合法 SHA-256
        if (!latestBundleChecksum.value) {
          latestVersion.value = ''
          latestZipUrl.value = ''
          latestMinNativeVersion.value = ''
          throw new Error(String(bundle.sha256 || '').trim()
            ? '资源包 hash 格式无效，应为 64 位 SHA-256。'
            : '资源包缺少 hash 校验字段，已拒绝该资源更新。')
        }

        if (latestMinNativeVersion.value && nativeVersion.value) {
          if (compareVersions(nativeVersion.value, latestMinNativeVersion.value) < 0) {
            lastStatus.value = 'incompatible-native'
            return { status: 'incompatible-native', bundle }
          }
        }

        if (!latestVersion.value || !currentVersion.value) {
          lastStatus.value = 'ready'
          return { status: 'ready', bundle }
        }

        if (compareVersions(latestVersion.value, currentVersion.value) > 0) {
          lastStatus.value = 'available'
          dialogVisible.value = !isSilentUpdate.value
          log.info('check:update-available', { current: currentVersion.value, latest: latestVersion.value, channel, level: updateLevel.value })
          return { status: 'available', bundle }
        }

        lastStatus.value = 'latest'
        dialogVisible.value = false
        updateLevel.value = 'prompt'
        latestVersions.value = []
        return { status: 'latest', bundle }
      } catch (error) {
        lastCheckedAt.value = new Date().toISOString()
        if (parseNoUpdateError(error)) {
          lastStatus.value = 'latest'
          return { status: 'latest' }
        }
        lastStatus.value = 'error'
        lastError.value = normalizeErrorMessage(error, '检查资源更新失败，请稍后再试。')
        log.error('check:failed', { channel: selectedChannel.value }, error)
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

    // 纵深防御：无校验哈希绝不启动下载
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
    availableUpdateChannels: AVAILABLE_UPDATE_CHANNELS,
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
    dismissDialog,
    checkForUpdates,
    downloadAndPrepareUpdate,
    applyPendingUpdateNow,
    resetToBuiltinBundle
  }
})
