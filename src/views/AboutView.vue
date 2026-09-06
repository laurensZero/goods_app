<template>
  <div class="page about-page">
    <NavBar :title="t('about.title')" show-back />

    <main ref="pageBodyRef" class="page-body page-entry">
      <section class="hero-section">
        <article class="hero-card">
          <img class="app-icon" :src="appIconSrc" :alt="t('about.appIcon')" />
          <div class="hero-copy">
            <p class="hero-label">About Goods App</p>
            <h1 class="hero-title">{{ appName }}</h1>
            <p class="hero-desc">{{ t('about.heroDesc') }}</p>
            <div class="hero-meta">
              <span class="hero-chip">{{ t('about.version') }} {{ appVersion }}</span>
              <span class="hero-chip">Android {{ androidVersionName }}</span>
              <span class="hero-chip">{{ t('about.resourceVersion') }} {{ webBundleVersionLabel }}</span>
            </div>
          </div>
        </article>
      </section>

      <section class="content-section">
        <div class="section-head">
          <p class="section-label">App Info</p>
          <h2 class="section-title">{{ t('about.appInfo') }}</h2>
        </div>

        <div class="info-grid">
          <article class="info-card">
            <p class="info-kicker">{{ t('about.appName') }}</p>
            <h3 class="info-value">{{ appName }}</h3>
            <p class="info-desc">{{ t('about.appNameDesc') }}</p>
          </article>

          <article class="info-card">
            <p class="info-kicker">{{ t('about.packageName') }}</p>
            <h3 class="info-value info-value--mono">{{ appId }}</h3>
            <p class="info-desc">{{ t('about.packageNameDesc') }}</p>
          </article>

          <article class="info-card">
            <p class="info-kicker">{{ t('about.androidVersion') }}</p>
            <h3 class="info-value">{{ androidVersionName }}</h3>
            <p class="info-desc">{{ t('about.androidVersionDesc') }}</p>
          </article>

          <article class="info-card">
            <p class="info-kicker">{{ t('about.resourceVersion') }}</p>
            <h3 class="info-value">{{ webBundleVersionLabel }}</h3>
            <p class="info-desc">{{ t('about.resourceVersionDesc') }}</p>
          </article>
        </div>
      </section>

      <section class="content-section">
        <div class="section-head">
          <p class="section-label">App Update</p>
          <h2 class="section-title">{{ t('about.checkUpdate') }}</h2>
        </div>

        <div class="update-grid">
          <article class="update-panel">
            <p class="info-kicker">App Release</p>
            <h3 class="info-value">{{ t('about.currentVersionLabel', { version: updateStore.currentVersion }) }}</h3>
            <p class="info-desc">{{ IS_NATIVE ? t('about.appUpdateDescNative') : t('about.appUpdateDescWeb') }}</p>
            <p class="update-status">{{ updateStatusText }}</p>
            <p v-if="updateStore.downloadError" class="update-status update-status--error">{{ updateStore.downloadError }}</p>
            <div v-if="updateStore.isDownloading" class="update-download-progress">
              <div class="update-download-progress__head">
                <span>{{ t('about.downloadProgress') }}</span>
                <span>{{ updateStore.downloadProgress }}%</span>
              </div>
              <div class="update-download-progress__track" role="progressbar" :aria-valuenow="updateStore.downloadProgress" aria-valuemin="0" aria-valuemax="100">
                <span class="update-download-progress__bar" :style="{ transform: `scaleX(${updateStore.downloadProgress / 100})` }" />
              </div>
              <div class="update-download-progress__meta">
                <span>{{ updateStore.downloadTransferred || t('about.preparing') }}</span>
                <span>{{ updateStore.downloadSpeed || '--' }}</span>
              </div>
            </div>
            <p class="update-meta">{{ t('about.lastChecked', { time: updateCheckedAtLabel }) }}</p>

            <div class="update-actions">
              <button
                type="button"
                class="dialog-btn dialog-btn--secondary"
                :disabled="updateStore.isChecking"
                @click="handleManualCheckUpdate"
              >
                {{ updateStore.isChecking ? t('about.checking') : t('about.manualCheckUpdate') }}
              </button>
              <button
                v-if="updateStore.hasUpdate"
                type="button"
                class="dialog-btn dialog-btn--primary"
                :disabled="updateStore.isDownloading"
                @click="handleStartUpdate"
              >
                {{ updateStore.isDownloading ? t('about.downloading') : (updateStore.supportsInAppDownload ? t('about.downloadAndInstall') : t('about.gotoUpdate')) }}
              </button>
            </div>
          </article>

          <article class="update-panel">
            <p class="info-kicker">Web Bundle</p>
            <h3 class="info-value">{{ t('about.currentResourceLabel', { version: webBundleVersionLabel }) }}</h3>
            <p class="info-desc">{{ t('about.webUpdateDesc') }}</p>
            <div class="update-channel-row">
              <span class="update-channel-label">{{ t('about.updateChannel') }}</span>
              <div class="update-channel-actions">
                <button
                  v-for="channel in webUpdateStore.availableUpdateChannels"
                  :key="channel"
                  type="button"
                  :class="['update-channel-btn', { 'update-channel-btn--active': webUpdateStore.selectedChannel === channel }]"
                  @click="handleWebUpdateChannelChange(channel)"
                >
                  {{ channel }}
                </button>
              </div>
            </div>
            <p class="update-status">{{ webUpdateStatusText }}</p>
            <section v-if="webUpdateReleaseNotesPreview" class="update-notes">
              <p class="update-notes__label">{{ t('about.releaseNotes') }}</p>
              <pre class="update-notes__body">{{ webUpdateReleaseNotesPreview }}</pre>
            </section>
            <p v-if="webUpdateStore.lastError" class="update-status update-status--error">{{ webUpdateStore.lastError }}</p>
            <div v-if="webUpdateStore.isDownloading" class="update-download-progress">
              <div class="update-download-progress__head">
                <span>{{ t('about.downloadProgress') }}</span>
                <span>{{ webUpdateStore.downloadProgress }}%</span>
              </div>
              <div class="update-download-progress__track" role="progressbar" :aria-valuenow="webUpdateStore.downloadProgress" aria-valuemin="0" aria-valuemax="100">
                <span class="update-download-progress__bar" :style="{ transform: `scaleX(${webUpdateStore.downloadProgress / 100})` }" />
              </div>
            </div>
            <p class="update-meta">{{ t('about.lastChecked', { time: webUpdateCheckedAtLabel }) }}</p>
            <div class="update-actions">
              <button
                type="button"
                class="dialog-btn dialog-btn--secondary"
                :disabled="!webUpdateCheckEnabled || webUpdateStore.isChecking"
                @click="handleManualCheckWebUpdate"
              >
                {{ webUpdateStore.isChecking ? t('about.checking') : t('about.checkResourceUpdate') }}
              </button>
              <button
                v-if="webUpdateStore.hasUpdate"
                type="button"
                class="dialog-btn dialog-btn--primary"
                :disabled="webUpdateStore.isDownloading"
                @click="handleStartWebUpdate"
              >
                {{ webUpdateStore.isDownloading ? t('about.downloading') : t('about.downloadAndNextLaunch') }}
              </button>
              <button
                v-if="webUpdateStore.supported"
                type="button"
                class="dialog-btn dialog-btn--ghost"
                @click="showWebUpdateResetDialog = true"
              >
                {{ t('about.restoreBuiltInResource') }}
              </button>
            </div>
          </article>
        </div>
      </section>

      <section class="content-section">
        <div class="section-head">
          <p class="section-label">Resource Management</p>
          <h2 class="section-title">{{ t('about.resourceManagement') }}</h2>
        </div>

        <div class="info-grid">
          <article class="info-card">
            <p class="info-kicker">{{ t('about.localImageCache') }}</p>
            <h3 class="info-value">{{ resourceSizeCacheImage }}</h3>
            <p class="info-desc">{{ t('about.localImageCacheDesc') }}</p>
            <div class="update-actions" style="margin-top: 1rem;">
              <button class="dialog-btn dialog-btn--secondary" @click="handleClearImageCache">{{ t('about.clearImageCache') }}</button>
            </div>
          </article>

          <article class="info-card">
            <p class="info-kicker">{{ t('about.localCutoutModel') }}</p>
            <h3 class="info-value">{{ resourceSizeModel }}</h3>
            <p class="info-desc">{{ t('about.localCutoutModelDesc') }}</p>
            <div class="update-actions" style="margin-top: 1rem;">
              <button
                class="dialog-btn dialog-btn--secondary"
                :disabled="isClearingCutoutModel"
                @click="handleClearCutoutModel"
              >
                {{ isClearingCutoutModel ? t('about.uninstalling') : t('about.uninstallCutoutModel') }}
              </button>
            </div>
          </article>

          <article class="info-card">
            <p class="info-kicker">{{ t('about.updateRemnants') }}</p>
            <h3 class="info-value">{{ resourceSizeUpdate }}</h3>
            <p class="info-desc">{{ t('about.updateRemnantsDesc') }}</p>
            <div class="update-actions" style="margin-top: 1rem;">
              <button class="dialog-btn dialog-btn--secondary" @click="handleClearUpdateCache">{{ t('about.clearUpdateRemnants') }}</button>
            </div>
          </article>
        </div>
      </section>

      <section class="content-section">
        <div class="section-head">
          <p class="section-label">Current Data</p>
          <h2 class="section-title">{{ t('about.currentData') }}</h2>
        </div>

        <div class="stats-grid">
          <article v-for="item in statsCards" :key="item.label" class="stat-card">
            <p class="stat-label">{{ item.label }}</p>
            <p class="stat-value">{{ item.value }}</p>
            <p class="stat-desc">{{ item.desc }}</p>
          </article>
        </div>
      </section>

    </main>

    <Transition name="sheet-pop">
      <div v-if="showWebUpdateRestartDialog" class="overlay" @click.self="cancelWebUpdateRestart">
        <div class="dialog">
          <h3 class="dialog-title">{{ t('about.resourceUpdateReady') }}</h3>
          <p class="dialog-desc">{{ t('about.restartPrompt') }}</p>
          <div class="dialog-actions dialog-actions__right">
            <button type="button" class="dialog-btn dialog-btn--secondary" @click="cancelWebUpdateRestart">{{ t('about.later') }}</button>
            <button type="button" class="dialog-btn dialog-btn--primary" @click="confirmWebUpdateRestart">{{ t('about.restartNow') }}</button>
          </div>
        </div>
      </div>
    </Transition>

    <Transition name="sheet-pop">
      <div v-if="showWebUpdateResetDialog" class="overlay" @click.self="showWebUpdateResetDialog = false">
        <div class="dialog">
          <h3 class="dialog-title">{{ t('about.restoreBuiltinTitle') }}</h3>
          <p class="dialog-desc">{{ t('about.restoreBuiltinDesc') }}</p>
          <div class="dialog-actions dialog-actions__right">
            <button type="button" class="dialog-btn dialog-btn--secondary" @click="showWebUpdateResetDialog = false">{{ t('about.cancel') }}</button>
            <button type="button" class="dialog-btn dialog-btn--primary" @click="confirmResetWebUpdate">{{ t('about.confirmRestore') }}</button>
          </div>
        </div>
      </div>
    </Transition>

    <AppToast :message="toastMsg" />
  </div>
</template>

<script setup>
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import NavBar from '@/components/common/NavBar.vue'
import AppToast from '@/components/common/AppToast.vue'
import { useAppUpdateStore } from '@/stores/appUpdate'
import { useWebUpdateStore } from '@/stores/webUpdate'
import { useGoodsStore } from '@/stores/goods'
import { usePresetsStore } from '@/stores/presets'
import { useSyncStore } from '@/stores/sync'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { scrollToTopAnimated } from '@/utils/scrollToTopAnimated'
import { useI18n } from 'vue-i18n'
import { useToast } from '@/composables/useToast'
import packageJson from '../../package.json'
import capacitorConfig from '../../capacitor.config.json'
import { resolveMockAppVersion, resolveMockBundleVersion, isDevVersionMockEnabled } from '@/utils/dev/mockVersion'

const { t } = useI18n()

const IS_NATIVE = Capacitor.isNativePlatform()

const goodsStore = useGoodsStore()
const presetsStore = usePresetsStore()
const syncStore = useSyncStore()
const updateStore = useAppUpdateStore()
const webUpdateStore = useWebUpdateStore()
const pageBodyRef = ref(null)
const showWebUpdateRestartDialog = ref(false)
const showWebUpdateResetDialog = ref(false)
const isClearingCutoutModel = ref(false)
const { toastMsg, showToast } = useToast()

const appIconSrc = `${import.meta.env.BASE_URL}favicon.svg`
const appName = capacitorConfig.appName || packageJson.name || 'Goods App'
const appId = capacitorConfig.appId || 'unknown'
const appVersion = ref(resolveMockAppVersion() || import.meta.env.VITE_APP_VERSION || packageJson.version || '0.0.0')
const androidVersionName = ref(resolveMockAppVersion() || import.meta.env.VITE_ANDROID_VERSION_NAME || import.meta.env.VITE_APP_VERSION || '1.0')
const webBundleVersionLabel = computed(() => {
  if (isDevVersionMockEnabled()) return resolveMockBundleVersion() || `v${appVersion.value}`
  return webUpdateStore.currentVersion || `v${appVersion.value}`
})

const statsCards = computed(() => [
  {
    label: t('about.collectionItems'),
    value: String(goodsStore.list.length),
    desc: t('about.collectionItemsDesc')
  },
  {
    label: t('about.trash'),
    value: String(goodsStore.trashList.length),
    desc: t('about.trashDesc')
  },
  {
    label: t('about.categoryPresets'),
    value: String(presetsStore.categories.length),
    desc: t('about.categoryPresetsDesc')
  },
  {
    label: t('about.characterPresets'),
    value: String(presetsStore.characters.length),
    desc: t('about.characterPresetsDesc')
  },
  {
    label: t('about.storageLocations'),
    value: String(presetsStore.storageLocations.length),
    desc: t('about.storageLocationsDesc')
  },
  {
    label: t('about.syncStatus'),
    value: syncStore.lastSyncedAt ? t('about.syncStatusConfigured') : t('about.syncStatusNotSynced'),
    desc: syncStore.lastSyncedAt ? t('about.recentSync', { time: formatSyncTime(syncStore.lastSyncedAt) }) : t('about.configureSync')
  }
])

const updateStatusText = computed(() => {
  if (updateStore.isChecking) return t('about.checking')
  if (updateStore.lastStatus === 'disabled') return t('about.versionDisabled')
  if (updateStore.lastStatus === 'available' && updateStore.latestVersion) {
    return t('about.newVersionFound', { version: updateStore.latestVersion })
  }
  if (updateStore.lastStatus === 'latest') return t('about.noUpdate')
  if (updateStore.lastStatus === 'error') return updateStore.lastError || t('about.checkUpdateFailed')
  return t('about.canCheckManuallyDefault')
})

const updateCheckedAtLabel = computed(() => (
  updateStore.lastCheckedAt ? formatSyncTime(updateStore.lastCheckedAt) : t('about.notCheckedYet')
))

const webUpdateStatusText = computed(() => {
  if (!webUpdateCheckEnabled.value) return t('about.webOnlyNativeSupported')
  if (webUpdateStore.isChecking) return t('about.checkingResourceDefault')
  if (webUpdateStore.lastStatus === 'pending' && webUpdateStore.pendingVersion) {
    return t('about.resourceReady', { version: webUpdateStore.pendingVersion })
  }
  if (webUpdateStore.lastStatus === 'available' && webUpdateStore.latestVersion) {
    return t('about.resourceUpdateFound', { version: webUpdateStore.latestVersion })
  }
  if (webUpdateStore.lastStatus === 'incompatible-native' && webUpdateStore.latestMinNativeVersion) {
    return t('about.incompatibleNative', { version: webUpdateStore.latestMinNativeVersion })
  }
  if (webUpdateStore.lastStatus === 'missing-asset') {
    return t('about.missingAsset')
  }
  if (webUpdateStore.lastStatus === 'latest') return t('about.resourceLatest')
  if (webUpdateStore.lastStatus === 'error') return webUpdateStore.lastError || t('about.resourceCheckFailed')
  return t('about.canCheckResourceDefault', { channel: webUpdateStore.selectedChannel })
})

const webUpdateCheckedAtLabel = computed(() => (
  webUpdateStore.lastCheckedAt ? formatSyncTime(webUpdateStore.lastCheckedAt) : t('about.notCheckedYet')
))

const webUpdateCheckEnabled = computed(() => webUpdateStore.supported || isDevVersionMockEnabled())

const webUpdateReleaseNotesPreview = computed(() => {
  return String(webUpdateStore.releaseNotesPreview || '').trim()
})

function formatSyncTime(isoString) {
  if (!isoString) return ''
  const date = new Date(isoString)
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function resetPageScrollTop() {
  scrollToTopAnimated(() => pageBodyRef.value, 0)
}

async function handleManualCheckUpdate() {
  if (updateStore.isChecking) return

  try {
    const result = await updateStore.checkForUpdates({ source: 'manual' })
    if (result?.status === 'disabled') {
      showToast(t('about.webDevDisabled'))
      return
    }

    if (result?.status === 'available') {
      showToast(t('about.newVersionFound', { version: updateStore.latestVersion }), 3200)
      return
    }

    showToast(t('about.noUpdate'))
  } catch (error) {
    showToast(updateStore.lastError || error?.message || t('about.checkUpdateFailed'), 3200)
  }
}

async function handleStartUpdate() {
  if (updateStore.isDownloading) return

  const succeeded = await updateStore.downloadAndInstallUpdate()
  if (succeeded) {
    if (updateStore.usingMockDownload) {
      showToast(t('about.mockDownloadDone'), 2200)
      return
    }
    if (updateStore.supportsInAppDownload) {
      showToast(t('about.updateDownloaded'), 3200)
      return
    }
  }

  if (updateStore.downloadError) {
    showToast(updateStore.downloadError, 3200)
  }
}

async function handleManualCheckWebUpdate() {
  if (!webUpdateCheckEnabled.value || webUpdateStore.isChecking) return

  try {
    const result = await webUpdateStore.checkForUpdates()
    if (result?.status === 'available') {
      showToast(t('about.resourceUpdateFound', { version: webUpdateStore.latestVersion }), 3200)
      return
    }
    if (result?.status === 'incompatible-native') {
      showToast(
        webUpdateStore.latestMinNativeVersion
          ? t('about.nativeVersionTooLow', { version: webUpdateStore.latestMinNativeVersion })
          : t('about.nativeVersionInsufficient'),
        3200
      )
      return
    }
    if (result?.status === 'missing-asset') {
      showToast(t('about.missingVersionUrl'), 3200)
      return
    }
    showToast(t('about.resourceLatest'))
  } catch (error) {
    showToast(webUpdateStore.lastError || error?.message || t('about.resourceCheckFailed'), 3200)
  }
}

async function handleWebUpdateChannelChange(channel) {
  if (webUpdateStore.selectedChannel === channel) return
  webUpdateStore.setUpdateChannel(channel)
  showToast(t('about.resourceChannelChanged', { channel }), 2200)
  await handleManualCheckWebUpdate()
}

async function handleStartWebUpdate() {
  if (webUpdateStore.isDownloading) return

  const succeeded = await webUpdateStore.downloadAndPrepareUpdate()
  if (succeeded) {
    if (!IS_NATIVE) {
      window.location.reload()
      return
    }
    showToast(t('about.applyingUpdate'), 1800)
    const activated = await webUpdateStore.applyPendingUpdateNow()
    if (!activated) {
      showToast(webUpdateStore.lastError || t('about.updateFailed'), 3200)
    }
  }
}

function cancelWebUpdateRestart() {
  showWebUpdateRestartDialog.value = false
  showToast(t('about.updateKeptForRestart'), 2600)
}

async function confirmWebUpdateRestart() {
  showWebUpdateRestartDialog.value = false

  if (!IS_NATIVE) {
    window.location.reload()
    return
  }

  showToast(t('about.applyingUpdate'), 1800)
  const activated = await webUpdateStore.applyPendingUpdateNow()
  if (!activated) {
    showToast(webUpdateStore.lastError || t('about.updateFailed'), 3200)
  }
}

async function confirmResetWebUpdate() {
  showWebUpdateResetDialog.value = false
  showToast(t('about.restoringBuiltin'), 1800)
  const resetOk = await webUpdateStore.resetToBuiltinBundle()
  if (!resetOk) {
    showToast(webUpdateStore.lastError || t('about.restoreFailed'), 3200)
  }
}

onMounted(async () => {
  resetPageScrollTop()
  window.requestAnimationFrame(resetPageScrollTop)

  if (IS_NATIVE) {
    try {
      const info = await CapacitorApp.getInfo()
      const runtimeVersion = String(info?.version || '').trim()
      if (runtimeVersion) {
        appVersion.value = runtimeVersion
        androidVersionName.value = runtimeVersion
      }
    } catch {
      // ignore runtime version read failures and keep fallback values
    }
  }

  syncStore.init()
  void updateStore.init()
  void webUpdateStore.init()
})

onBeforeUnmount(() => {
})

// ======== 资源空间计算 ========
const resourceSizeCacheImage = ref('--')
const resourceSizeModel = ref('--')
const resourceSizeUpdate = ref('--')

async function calculateDirectorySize(path, directory) {
  let total = 0
  try {
    const res = await Filesystem.readdir({ path, directory })
    for (const file of res.files) {
      if (file.type === 'directory') {
        total += await calculateDirectorySize(`${path}/${file.name}`, directory)
      } else {
        total += Number(file.size) || 0
      }
    }
  } catch {
    // 忽略目录不存在的情况
  }
  return total
}

function formatSize(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

async function refreshResourceSizes() {
  if (!IS_NATIVE) {
    resourceSizeCacheImage.value = t('about.webManagedByBrowser')
    resourceSizeModel.value = t('about.webNoSaved')
    resourceSizeUpdate.value = t('about.webNotUsed')
    return
  }

  calculateDirectorySize('img-cache', Directory.Cache).then(size => {
    resourceSizeCacheImage.value = size > 0 ? formatSize(size) : '0 B'
  })
  
  calculateDirectorySize('imgly-assets', Directory.Data).then(size => {
    resourceSizeModel.value = size > 0 ? formatSize(size) : '0 B'
  })

  calculateDirectorySize('updates', Directory.Cache).then(size => {
    resourceSizeUpdate.value = size > 0 ? formatSize(size) : '0 B'
  })
}

onMounted(() => {
  refreshResourceSizes()
})

async function handleClearImageCache() {
  try {
    const { clearAllCache } = await import('@/utils/image/cache')
    await clearAllCache()
    showToast(t('about.imageCacheCleared'))
    refreshResourceSizes()
  } catch (error) {
    showToast(t('about.clearImageCacheFailed'))
  }
}

async function handleClearCutoutModel() {
  if (!IS_NATIVE) {
    showToast(t('about.webNoNativeModel'))
    return
  }
  if (isClearingCutoutModel.value) return

  isClearingCutoutModel.value = true

  try {
    const { clearLocalModelAssets } = await import('@/composables/image/useImageCutout')
    const ok = await clearLocalModelAssets()
    if (ok) {
      showToast(t('about.cutoutModelUninstalled'))
    } else {
      showToast(t('about.clearCutoutModelFailed'))
    }
  } catch (error) {
    console.error('[about] clear cutout model failed:', error)
    showToast(t('about.clearCutoutModelFailed'))
  } finally {
    isClearingCutoutModel.value = false
    refreshResourceSizes()
  }
}

async function handleClearUpdateCache() {
  try {
    if (IS_NATIVE) {
      await Filesystem.rmdir({
        path: 'updates',
        directory: Directory.Cache,
        recursive: true
      })
    }
    const { caches } = window
    if (caches) {
      await caches.delete('app-update-cache')
    }
    showToast(t('about.updateCacheCleared'))
    refreshResourceSizes()
  } catch (error) {
    showToast(t('about.updateCacheEmpty'))
  }
}


</script>

<style scoped src="../assets/views/AboutView.css"></style>

