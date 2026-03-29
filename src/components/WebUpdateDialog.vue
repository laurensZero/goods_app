<template>
  <Transition name="overlay-fade">
    <div v-if="showDialog" class="overlay" @click.self="handleOverlayClick">
      <div class="dialog update-dialog">
        <p class="update-kicker">Bundle Update</p>
        <h3 class="dialog-title">{{ restartReady ? '资源更新已下载完成' : `发现资源更新 v${webUpdateStore.latestVersion}` }}</h3>
        <p class="dialog-desc" v-if="!restartReady">
          当前资源 {{ webUpdateStore.currentVersion || 'builtin' }}，可用资源为 v{{ webUpdateStore.latestVersion }}。
          <template v-if="webUpdateStore.isForceUpdate">本次为强制资源更新，需下载后重启生效。</template>
        </p>
        <p class="dialog-desc" v-else>
          新资源将在重启 App 后生效，是否现在重启？
        </p>

        <div class="version-row">
          <div class="version-pill">
            <span class="version-pill__label">当前</span>
            <strong class="version-pill__value">{{ webUpdateStore.currentVersion || 'builtin' }}</strong>
          </div>
          <div class="version-pill version-pill--accent">
            <span class="version-pill__label">最新</span>
            <strong class="version-pill__value">v{{ webUpdateStore.latestVersion }}</strong>
          </div>
        </div>

        <section v-if="releaseNotesPreview && !restartReady" class="release-notes">
          <p class="release-notes__label">更新说明</p>
          <pre class="release-notes__body">{{ releaseNotesPreview }}</pre>
        </section>

        <p v-if="webUpdateStore.lastError" class="update-error">{{ webUpdateStore.lastError }}</p>
        <p v-if="webUpdateStore.isDownloading" class="update-tip">下载中 {{ webUpdateStore.downloadProgress }}%</p>

        <div class="dialog-actions">
          <button
            v-if="!webUpdateStore.isForceUpdate"
            type="button"
            class="dialog-btn dialog-btn--secondary"
            :disabled="webUpdateStore.isDownloading"
            @click="restartReady ? handleLaterRestart() : webUpdateStore.dismissDialog()"
          >
            {{ restartReady ? '稍后' : '稍后再说' }}
          </button>
          <button
            type="button"
            class="dialog-btn dialog-btn--primary"
            :disabled="webUpdateStore.isDownloading"
            @click="restartReady ? handleRestartNow() : handleStartWebUpdate()"
          >
            {{ restartReady ? '立即重启' : (webUpdateStore.isDownloading ? '下载中…' : '下载并下次启动生效') }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { Capacitor } from '@capacitor/core'
import { useWebUpdateStore } from '@/stores/webUpdate'

const webUpdateStore = useWebUpdateStore()
const restartReady = ref(false)

const showDialog = computed(() => webUpdateStore.dialogVisible && webUpdateStore.hasUpdate)
const releaseNotesPreview = computed(() => {
  const raw = String(webUpdateStore.latestRelease?.notes || webUpdateStore.latestRelease?.body || '').trim()
  if (!raw) return ''
  return raw
})

function handleOverlayClick() {
  if (webUpdateStore.isForceUpdate) return
  webUpdateStore.dismissDialog()
}

async function handleStartWebUpdate() {
  const ok = await webUpdateStore.downloadAndPrepareUpdate()
  if (ok) {
    restartReady.value = true
  }
}

function handleLaterRestart() {
  restartReady.value = false
  webUpdateStore.dismissDialog()
}

async function handleRestartNow() {
  if (!Capacitor.isNativePlatform()) {
    window.location.reload()
    return
  }

  const activated = await webUpdateStore.applyPendingUpdateNow()
  if (!activated && !webUpdateStore.isForceUpdate) {
    restartReady.value = false
    webUpdateStore.dismissDialog()
  }
}

watch(showDialog, (visible) => {
  if (!visible) {
    restartReady.value = false
  }
})
</script>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 1090;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.45);
}

.update-dialog {
  width: min(100%, 480px);
  padding: 24px;
  border-radius: var(--radius-large);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
  max-height: min(86vh, 760px);
  overflow: auto;
}

.update-kicker {
  color: var(--app-text-tertiary);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.dialog-title {
  margin: 8px 0 0;
  color: var(--app-text);
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.04em;
}

.dialog-desc,
.update-tip {
  margin-top: 10px;
  color: var(--app-text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.update-error {
  margin-top: 10px;
  color: #c74444;
  font-size: 13px;
  line-height: 1.5;
}

.version-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 18px;
}

.version-pill {
  padding: 14px 16px;
  border-radius: 16px;
  background: var(--app-surface-soft);
}

.version-pill--accent {
  background: color-mix(in srgb, #5a78fa 12%, var(--app-surface-soft));
}

.version-pill__label {
  display: block;
  color: var(--app-text-tertiary);
  font-size: 12px;
}

.version-pill__value {
  display: block;
  margin-top: 6px;
  color: var(--app-text);
  font-size: 18px;
  font-weight: 700;
}

.release-notes {
  margin-top: 18px;
  padding: 16px;
  border-radius: 16px;
  background: var(--app-surface-soft);
}

.release-notes__label {
  color: var(--app-text);
  font-size: 13px;
  font-weight: 600;
}

.release-notes__body {
  margin-top: 10px;
  color: var(--app-text-secondary);
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
}

.dialog-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 20px;
}

.dialog-btn {
  min-height: 42px;
  padding: 0 18px;
  border: none;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 500;
}

.dialog-btn:disabled {
  opacity: 0.6;
}

.dialog-btn--secondary {
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
}

.dialog-btn--primary {
  background: var(--app-text);
  color: var(--app-bg);
}

.overlay-fade-enter-active,
.overlay-fade-leave-active {
  transition: opacity 0.25s ease;
}

.overlay-fade-enter-from,
.overlay-fade-leave-to {
  opacity: 0;
}
</style>
