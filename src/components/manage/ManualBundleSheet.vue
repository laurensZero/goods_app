<template>
  <AppSheet
    :model-value="modelValue"
    sheet-class="manual-bundle-sheet"
    size="wide"
    @update:model-value="(v) => { if (!v) close() }"
    @closed="resetView()"
  >
    <p class="dialog-title">{{ t('about.manualBundleTitle') }}</p>
    <p class="dialog-desc">{{ t('about.manualBundleDesc') }}</p>

    <div class="manual-bundle-toolbar">
      <button
        type="button"
        class="dialog-btn dialog-btn--primary"
        :disabled="busy"
        @click="handlePickLocalZip"
      >
        {{ t('about.pickLocalBundle') }}
      </button>
      <button
        type="button"
        class="dialog-btn dialog-btn--secondary"
        :disabled="busy || webUpdateStore.isListingHistory"
        @click="loadHistory"
      >
        {{ webUpdateStore.isListingHistory ? t('about.checking') : t('about.refreshBundleList') }}
      </button>
    </div>

    <p v-if="webUpdateStore.lastError" class="manual-bundle-error">{{ webUpdateStore.lastError }}</p>
    <p v-if="statusText" class="manual-bundle-status">{{ statusText }}</p>

    <div class="manual-bundle-list">
      <button
        v-for="item in historyItems"
        :key="`${item.id || item.version}`"
        type="button"
        class="manual-bundle-item"
        :class="{ 'manual-bundle-item--active': item.version === webUpdateStore.currentVersion }"
        :disabled="busy"
        @click="handleInstallRemote(item)"
      >
        <div class="manual-bundle-item__main">
          <p class="manual-bundle-item__version">v{{ item.version }}</p>
          <p class="manual-bundle-item__meta">
            {{ formatTime(item.published_at) }}
            <span v-if="item.file_size"> · {{ formatSize(item.file_size) }}</span>
          </p>
          <p v-if="item.notes" class="manual-bundle-item__notes">{{ previewNotes(item.notes) }}</p>
        </div>
        <div v-if="item.version === webUpdateStore.currentVersion" class="manual-bundle-item__tags">
          <span class="manual-bundle-tag">
            {{ t('about.bundleCurrent') }}
          </span>
        </div>
      </button>

      <p v-if="!historyItems.length && !webUpdateStore.isListingHistory" class="manual-bundle-empty">
        {{ t('about.manualBundleEmpty') }}
      </p>
    </div>

    <div class="dialog-actions dialog-actions__right">
      <button type="button" class="dialog-btn dialog-btn--secondary" @click="close">{{ t('about.cancel') }}</button>
    </div>
  </AppSheet>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppSheet from '@/components/common/AppSheet.vue'
import { useWebUpdateStore } from '@/stores/webUpdate'
import { useDialogBackButton } from '@/composables/useDialogBackButton'
import { FilePicker } from '@capawesome/capacitor-file-picker'
import { Capacitor } from '@capacitor/core'

const props = defineProps({
  modelValue: { type: Boolean, default: false }
})

const emit = defineEmits(['update:model-value', 'installed'])

const { t } = useI18n()
const webUpdateStore = useWebUpdateStore()
const statusText = ref('')
const busy = ref(false)

const historyItems = computed(() => webUpdateStore.bundleHistory || [])

useDialogBackButton(close, () => props.modelValue)

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    statusText.value = ''
    // 历史列表需要网络；失败不挡本地应急安装
    void loadHistory()
  },
  { immediate: true }
)

function close() {
  emit('update:model-value', false)
}

function resetView() {
  statusText.value = ''
}

async function loadHistory() {
  if (webUpdateStore.isListingHistory) return
  try {
    await webUpdateStore.fetchBundleHistory()
  } catch {
    statusText.value = t('about.manualBundleHistoryUnavailable')
  }
}

function formatTime(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return String(iso)
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatSize(bytes) {
  const n = Number(bytes) || 0
  if (n <= 0) return ''
  const k = 1024
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(k)))
  return `${(n / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function previewNotes(notes) {
  const text = String(notes || '').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  return text.length > 80 ? `${text.slice(0, 80)}…` : text
}

async function finishInstall(ok, successKey) {
  if (ok) {
    statusText.value = t(successKey)
    emit('installed')
    close()
    return
  }
  statusText.value = webUpdateStore.lastError || t('about.manualBundleInstallFailed')
}

async function handleInstallRemote(item) {
  if (busy.value || !item) return
  if (item.version === webUpdateStore.currentVersion) {
    statusText.value = t('about.resourceLatest')
    return
  }
  busy.value = true
  statusText.value = t('about.manualBundleVerifying')
  try {
    const ok = await webUpdateStore.installRemoteRelease(item)
    await finishInstall(ok, 'about.manualBundleInstallQueued')
  } finally {
    busy.value = false
  }
}

async function readPickedZipBytes(picked) {
  if (picked?.blob instanceof Blob) {
    return new Uint8Array(await picked.blob.arrayBuffer())
  }
  if (picked?.data) {
    const binary = atob(String(picked.data))
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  }
  if (picked?.path) {
    const converted = Capacitor.convertFileSrc(picked.path)
    const response = await fetch(converted)
    if (!response.ok) throw new Error('读取本地资源包失败。')
    return new Uint8Array(await response.arrayBuffer())
  }
  throw new Error('未读取到资源包文件。')
}

async function handlePickLocalZip() {
  if (busy.value) return
  busy.value = true
  statusText.value = t('about.manualBundleVerifying')
  try {
    const result = await FilePicker.pickFiles({
      types: ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'],
      limit: 1,
      readData: false
    })
    const picked = result?.files?.[0]
    if (!picked) {
      statusText.value = ''
      return
    }
    const bytes = await readPickedZipBytes(picked)
    const ok = await webUpdateStore.installLocalBundleZip(bytes)
    await finishInstall(ok, 'about.manualBundleInstallQueued')
  } catch (error) {
    if (!String(error?.message || '').includes('canceled')) {
      statusText.value = webUpdateStore.lastError || error?.message || t('about.manualBundleInstallFailed')
    } else {
      statusText.value = ''
    }
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.dialog-title {
  margin: 0 0 8px;
  color: var(--app-text);
  font-size: 18px;
  font-weight: 600;
}

.dialog-desc {
  margin: 0 0 16px;
  color: var(--app-text-secondary);
  font-size: 14px;
  line-height: 1.5;
}

.dialog-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 20px;
}

.dialog-actions__right {
  display: flex;
  gap: 10px;
}

.dialog-btn {
  min-height: 42px;
  padding: 0 18px;
  border: none;
  border-radius: var(--radius-xs);
  font-size: 14px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
}

.dialog-btn--ghost,
.dialog-btn--secondary {
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
}

.dialog-btn--primary {
  background: var(--app-text);
  color: var(--app-bg);
}

.dialog-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.manual-bundle-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 12px;
}

.manual-bundle-error {
  margin: 0 0 8px;
  color: var(--app-danger, #d64545);
  font-size: 13px;
}

.manual-bundle-status {
  margin: 0 0 8px;
  color: var(--app-text-secondary);
  font-size: 13px;
}

.manual-bundle-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 46vh;
  overflow: auto;
  margin-bottom: 8px;
}

.manual-bundle-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-xs);
  background: var(--app-surface-soft);
  color: var(--app-text);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.manual-bundle-item:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.manual-bundle-item--active {
  border-color: var(--app-text-tertiary, var(--app-border));
  background: var(--app-bg);
}

.manual-bundle-item__version {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.manual-bundle-item__meta {
  margin: 4px 0 0;
  color: var(--app-text-secondary);
  font-size: 12px;
}

.manual-bundle-item__notes {
  margin: 6px 0 0;
  color: var(--app-text-secondary);
  font-size: 12px;
  line-height: 1.45;
}

.manual-bundle-item__tags {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  flex-shrink: 0;
}

.manual-bundle-tag {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--app-bg);
  color: var(--app-text-secondary);
  font-size: 11px;
  white-space: nowrap;
}

.manual-bundle-empty {
  margin: 12px 0;
  color: var(--app-text-secondary);
  font-size: 13px;
  text-align: center;
}

@media (max-width: 768px) {
  .dialog-actions,
  .dialog-actions__right,
  .manual-bundle-toolbar {
    flex-direction: column;
    width: 100%;
  }

  .dialog-btn {
    width: 100%;
  }
}
</style>
