import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { Capacitor } from '@capacitor/core'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import {
  buildReleaseNotesPreview,
  compareVersions,
  normalizeVersionTag
} from '@/utils/github/release'
import { normalizeUpdateLevel, toDirectStorageUrls } from '@/utils/updateHelpers'
import { getSupabaseClient } from '@/utils/sync/supabaseClient'
import { createLogger } from '@/utils/logger'
import { isDevVersionMockEnabled, resolveMockAppVersion, resolveMockBundleVersion } from '@/utils/dev/mockVersion'
import { verifyBundleZipAuth } from '@/utils/bundleAuth'
import { sha256Hex } from '@/utils/platform/fileHash'
import { startLocalFileServer, stopLocalFileServer } from '@/utils/platform/localFileServer'
import { Filesystem, Directory } from '@capacitor/filesystem'

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
  const latestZipFallbackUrl = ref('')
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
  const bundleHistory = ref([])
  const isListingHistory = ref(false)
  const isInstallingManual = ref(false)

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
      if (isDevVersionMockEnabled()) {
        // PC dev 模拟：仅开放检测，不做实际下载/应用；版本号用 mock 模拟
        currentVersion.value = resolveMockBundleVersion() || ''
        nativeVersion.value = resolveMockAppVersion() || ''
        lastStatus.value = 'ready'
      } else {
        lastStatus.value = 'disabled'
      }
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
      if (!supported.value && !isDevVersionMockEnabled()) {
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
        // 与数据面一致：当前端点在前，另一端内置点兜底
        const zipUrls = toDirectStorageUrls(bundle.storage_path)
        latestZipUrl.value = zipUrls[0] || ''
        latestZipFallbackUrl.value = zipUrls[1] || ''
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
          latestZipFallbackUrl.value = ''
          latestBundleChecksum.value = ''
          latestMinNativeVersion.value = ''
          lastStatus.value = 'missing-asset'
          return { status: 'missing-asset', bundle }
        }

        // 强制校验：bundle 必须携带合法 SHA-256
        if (!latestBundleChecksum.value) {
          latestVersion.value = ''
          latestZipUrl.value = ''
          latestZipFallbackUrl.value = ''
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

  /** 列出当前频道历史资源包（供长按手动选择）。 */
  async function fetchBundleHistory(limit = 12) {
    await init()
    isListingHistory.value = true
    lastError.value = ''
    try {
      const client = getSupabaseClient()
      const channel = selectedChannel.value
      const { data, error } = await client
        .from('ota_releases')
        .select('*')
        .eq('channel', channel)
        .eq('type', 'web_bundle')
        .order('published_at', { ascending: false })
        .limit(Math.max(1, Math.min(50, Number(limit) || 12)))

      if (error) {
        throw new Error(`查询资源包列表失败: ${error.message}`)
      }

      bundleHistory.value = (data || []).map((row) => ({
        ...row
      }))
      return bundleHistory.value
    } catch (error) {
      // 历史列表失败不写入 lastError，避免离线时干扰本地应急安装
      log.error('history:failed', { channel: selectedChannel.value }, error)
      bundleHistory.value = []
      throw error
    } finally {
      isListingHistory.value = false
    }
  }

  function applyReleaseMeta(bundle) {
    latestRelease.value = bundle
    latestVersion.value = normalizeVersionTag(bundle.version)
    const zipUrls = toDirectStorageUrls(bundle.storage_path)
    latestZipUrl.value = zipUrls[0] || ''
    latestZipFallbackUrl.value = zipUrls[1] || ''
    latestBundleChecksum.value = normalizeChecksum(bundle.sha256)
    latestMinNativeVersion.value = normalizeVersionTag(bundle.min_native_version || '')
    updateLevel.value = normalizeUpdateLevel(bundle.update_level)
    lastCheckedAt.value = new Date().toISOString()
  }

  /**
   * 手动安装指定远程资源包（走云端 URL + sha256，与自动更新同路径）。
   * @param {object} release ota_releases 行
   */
  async function installRemoteRelease(release) {
    await init()
    if (!supported.value) {
      lastError.value = '仅原生环境支持资源增量更新。'
      return false
    }

    isInstallingManual.value = true
    lastError.value = ''
    try {
      const version = normalizeVersionTag(release?.version)
      const checksum = normalizeChecksum(release?.sha256)

      if (!version || !checksum) {
        throw new Error('资源包缺少 version 或 hash，已拒绝安装。')
      }

      if (release?.min_native_version && nativeVersion.value) {
        if (compareVersions(nativeVersion.value, normalizeVersionTag(release.min_native_version)) < 0) {
          throw new Error(`需要先升级到 Android ${normalizeVersionTag(release.min_native_version)} 再安装此资源包。`)
        }
      }

      applyReleaseMeta(release)
      return await downloadAndPrepareUpdate()
    } catch (error) {
      // 前置校验失败不改 lastStatus 里已生效的包，也不触发回滚
      lastError.value = normalizeErrorMessage(error, '手动安装资源包失败。')
      log.error('install-remote:failed', { version: release?.version }, error)
      return false
    } finally {
      isInstallingManual.value = false
    }
  }

  function bytesToBase64(bytes) {
    let binary = ''
    const chunk = 0x8000
    const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
    for (let i = 0; i < view.length; i += chunk) {
      binary += String.fromCharCode(...view.subarray(i, i + chunk))
    }
    return btoa(binary)
  }

  /**
   * 手动安装本地 zip：校验内嵌 goods-bundle.auth.json 后交给 CapGo。
   * 认证/读文件/下载失败只报错，绝不回滚或切换当前生效 bundle。
   * @param {Uint8Array} zipBytes
   */
  async function installLocalBundleZip(zipBytes) {
    await init()
    if (!supported.value) {
      lastError.value = '仅原生环境支持资源增量更新。'
      return false
    }

    isInstallingManual.value = true
    lastError.value = ''
    let listener = null
    let nextApplied = false
    try {
      const bytes = zipBytes instanceof Uint8Array ? zipBytes : new Uint8Array(zipBytes)
      const authResult = await verifyBundleZipAuth(bytes)
      const version = normalizeVersionTag(authResult.version) || `local-${Date.now()}`
      const checksum = await sha256Hex(bytes)

      isDownloading.value = true
      downloadProgress.value = 0

      await Filesystem.mkdir({ path: 'updates', directory: Directory.Cache, recursive: true }).catch(() => {})
      const fileName = `manual-bundle-${version}.zip`
      const filePath = `updates/${fileName}`
      await Filesystem.writeFile({
        path: filePath,
        directory: Directory.Cache,
        data: bytesToBase64(bytes),
        recursive: true
      })
      const { uri } = await Filesystem.getUri({ path: filePath, directory: Directory.Cache })
      if (!uri) {
        throw new Error('无法读取本地资源包路径。')
      }

      // CapGo download 只吃 http/https（HttpURLConnection）。云端是 HTTPS 直链，
      // 本地用回环 HTTP 喂同一条安装链路；file:// / 绝对路径会 Failed to download。
      const pathWithoutScheme = String(uri).replace(/^file:\/\//, '')

      listener = await CapacitorUpdater.addListener('download', (state) => {
        const percent = Number(state?.percent)
        if (!Number.isFinite(percent)) return
        downloadProgress.value = Number(Math.max(0, Math.min(100, percent)).toFixed(1))
      })

      const localHttpUrl = await startLocalFileServer(pathWithoutScheme)
      let bundle = null
      let lastDownloadError = null
      try {
        bundle = await CapacitorUpdater.download({
          version,
          url: localHttpUrl,
          checksum
        })
      } catch (error) {
        lastDownloadError = error
        log.warn('install-local:source-failed', { url: localHttpUrl }, error)
      } finally {
        await stopLocalFileServer()
      }
      if (!bundle && lastDownloadError) throw lastDownloadError

      if (!bundle?.id) {
        throw new Error('资源包安装成功但未拿到 bundle id。')
      }

      await CapacitorUpdater.next({ id: bundle.id })
      nextApplied = true
      pendingBundleId.value = bundle.id
      pendingVersion.value = version
      currentVersion.value = version
      downloadProgress.value = 100
      lastStatus.value = 'pending'
      log.info('install-local:done', { bundleId: bundle.id, version })
      return true
    } catch (error) {
      // 仅当已经 next() 到新包、后续步骤失败时才回滚；下载/验签失败不要动当前 bundle
      if (nextApplied) {
        await rollbackToCurrentBundle()
      }
      lastStatus.value = 'error'
      lastError.value = normalizeErrorMessage(error, '本地资源包安装失败。')
      log.error('install-local:failed', { nextApplied }, error)
      return false
    } finally {
      isDownloading.value = false
      isInstallingManual.value = false
      await listener?.remove?.()
    }
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
    let nextApplied = false
    try {
      listener = await CapacitorUpdater.addListener('download', (state) => {
        const percent = Number(state?.percent)
        if (!Number.isFinite(percent)) return
        downloadProgress.value = Number(Math.max(0, Math.min(100, percent)).toFixed(1))
      })

      // 下载时按当前数据面端点重算，避免切端点后仍用检查时的旧 URL
      const freshUrls = latestRelease.value?.storage_path
        ? toDirectStorageUrls(latestRelease.value.storage_path)
        : [latestZipUrl.value, latestZipFallbackUrl.value]
      const downloadUrls = freshUrls
        .filter((url, index, urls) => url && urls.indexOf(url) === index)
      let bundle = null
      let lastError = null
      for (const downloadUrl of downloadUrls) {
        try {
          bundle = await CapacitorUpdater.download({
            version: latestVersion.value,
            url: downloadUrl,
            checksum: latestBundleChecksum.value
          })
          break
        } catch (error) {
          lastError = error
          log.warn('download:source-failed', { url: downloadUrl }, error)
        }
      }
      if (!bundle && lastError) throw lastError

      if (!bundle?.id) {
        throw new Error('资源包下载成功但未拿到 bundle id。')
      }

      await CapacitorUpdater.next({ id: bundle.id })
      nextApplied = true
      pendingBundleId.value = bundle.id
      pendingVersion.value = normalizeVersionTag(bundle.version || latestVersion.value)
      downloadProgress.value = 100
      lastStatus.value = 'pending'
      log.info('download:done', { bundleId: bundle.id, version: pendingVersion.value })
      return true
    } catch (error) {
      log.error('download:failed', { version: latestVersion.value, progress: downloadProgress.value, nextApplied }, error)
      // 只有已经 next() 到新包才需要拨回；纯下载失败不要动当前 bundle
      if (nextApplied) {
        await rollbackToCurrentBundle()
      }
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

    // 回退只允许拨回「当前正在用的那套资源」。读不到当前 id 时宁可不动，
    // 也不要 next('builtin') —— 那等于把用户踢回 APK 内置前端。
    let fallbackId = String(currentBundleId.value || '').trim()
    if (!fallbackId || fallbackId === 'builtin') {
      try {
        const result = await CapacitorUpdater.current()
        const liveId = String(result?.bundle?.id || '').trim()
        if (liveId) {
          currentBundleId.value = liveId
          fallbackId = liveId
        }
      } catch (error) {
        log.warn('rollback:read-current:failed', error)
      }
    }

    if (!fallbackId || fallbackId === 'builtin') {
      // 当前就是内置包，或 CapGo 状态异常：不要写 next，避免误切
      pendingBundleId.value = ''
      pendingVersion.value = ''
      log.warn('rollback:skip', { fallbackId })
      return false
    }

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
    latestZipFallbackUrl.value = ''
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
    bundleHistory,
    isListingHistory,
    isInstallingManual,
    notifyAppReady,
    init,
    setUpdateChannel,
    dismissDialog,
    checkForUpdates,
    fetchBundleHistory,
    installRemoteRelease,
    installLocalBundleZip,
    downloadAndPrepareUpdate,
    applyPendingUpdateNow,
    resetToBuiltinBundle
  }
})
