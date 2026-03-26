import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import packageJson from '../../package.json'
import {
  buildReleaseNotesPreview,
  compareVersions,
  getLatestRelease,
  normalizeVersionTag,
  resolveReleaseTargetUrl
} from '@/utils/githubRelease'

const UPDATE_REPO_OWNER = 'laurensZero'
const UPDATE_REPO_NAME = 'goods_app'
const FALLBACK_VERSION = normalizeVersionTag(import.meta.env.VITE_APP_VERSION || packageJson.version || '0.0.0')
const SHOULD_SKIP_UPDATE_CHECK = import.meta.env.DEV && !Capacitor.isNativePlatform()

let activeCheckPromise = null

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

  const latestVersion = computed(() => normalizeVersionTag(latestRelease.value?.tag_name || ''))
  const hasUpdate = computed(() => (
    !!latestVersion.value
    && compareVersions(latestVersion.value, currentVersion.value) > 0
  ))
  const releaseTargetUrl = computed(() => resolveReleaseTargetUrl(latestRelease.value))
  const releaseNotesPreview = computed(() => buildReleaseNotesPreview(latestRelease.value?.body))

  async function init() {
    if (initialized.value) return

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

  async function checkForUpdates({ source = 'manual' } = {}) {
    if (activeCheckPromise) return activeCheckPromise

    activeCheckPromise = (async () => {
      await init()
      isChecking.value = true
      lastError.value = ''

      try {
        if (SHOULD_SKIP_UPDATE_CHECK) {
          lastCheckedAt.value = new Date().toISOString()
          lastStatus.value = 'disabled'
          dialogVisible.value = false
          return { status: 'disabled', release: null }
        }

        const release = await getLatestRelease(UPDATE_REPO_OWNER, UPDATE_REPO_NAME)
        latestRelease.value = release
        lastCheckedAt.value = new Date().toISOString()

        if (hasUpdate.value) {
          lastStatus.value = 'available'
          dialogVisible.value = true
          return { status: 'available', release }
        }

        lastStatus.value = 'latest'
        if (source === 'manual') {
          dialogVisible.value = false
        }
        return { status: 'latest', release }
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
    releaseTargetUrl,
    releaseNotesPreview,
    init,
    dismissDialog,
    openReleasePage,
    checkForUpdates
  }
})
