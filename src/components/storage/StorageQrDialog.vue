<template>
  <Transition name="overlay-fade">
    <div v-if="show" class="overlay" @click.self="close">
      <section class="dialog qr-dialog" role="dialog" aria-modal="true" :aria-label="t('storage.qr.title')">
        <header class="qr-head">
          <div>
            <p class="dialog-label">{{ t('storage.qr.label') }}</p>
            <h3 class="dialog-title">{{ t('storage.qr.title') }}</h3>
          </div>
          <button type="button" class="qr-close" :aria-label="t('common.close')" @click="close">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </header>

        <div class="qr-content">
          <div class="qr-card">
            <img v-if="qrDataUrl" class="qr-image" :src="qrDataUrl" :alt="t('storage.qr.imageAlt', { name: nodeName })" />
            <div v-else class="qr-placeholder">{{ t('storage.qr.generating') }}</div>
          </div>

          <div class="qr-meta">
            <p class="qr-node">{{ nodeName }}</p>
            <p class="qr-path">{{ nodePath }}</p>
            <p class="qr-desc">{{ t('storage.qr.desc') }}</p>
          </div>

          <label class="qr-link">
            <span>{{ t('storage.qr.linkLabel') }}</span>
            <textarea readonly :value="qrUrl" />
          </label>
        </div>

        <div class="dialog-actions">
          <button type="button" class="dialog-btn dialog-btn--secondary" @click="copyLink">
            {{ t('storage.qr.copyLink') }}
          </button>
          <button type="button" class="dialog-btn dialog-btn--primary" :disabled="!qrDataUrl" @click="downloadQr">
            {{ t('storage.qr.download') }}
          </button>
        </div>
      </section>
    </div>
  </Transition>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import QRCode from 'qrcode'
import { showFailToast, showSuccessToast } from 'vant'
import { buildStorageQrUrl } from '@/utils/storageQr'

const { t } = useI18n()

const props = defineProps({
  show: Boolean,
  node: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close'])

const qrDataUrl = ref('')

const nodeName = computed(() => String(props.node?.name || '').trim())
const nodePath = computed(() => String(props.node?.path || '').trim())
const qrUrl = computed(() => buildStorageQrUrl(nodePath.value))

watch(
  () => [props.show, qrUrl.value],
  async ([visible, url]) => {
    qrDataUrl.value = ''
    if (!visible || !url) return

    try {
      qrDataUrl.value = await QRCode.toDataURL(url, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 320,
        color: {
          dark: '#141416',
          light: '#ffffff'
        }
      })
    } catch (e) {
      showFailToast(t('storage.qr.generateFailed'))
    }
  },
  { immediate: true }
)

function close() {
  emit('close')
}

async function copyLink() {
  if (!qrUrl.value) return
  try {
    await navigator.clipboard.writeText(qrUrl.value)
    showSuccessToast(t('storage.qr.copySuccess'))
  } catch {
    showFailToast(t('common.copyFailed'))
  }
}

function sanitizeFilename(value) {
  return String(value || '')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 60) || 'storage'
}

function downloadQr() {
  if (!qrDataUrl.value) return

  const link = document.createElement('a')
  link.href = qrDataUrl.value
  link.download = `${sanitizeFilename(nodePath.value)}_QR.png`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
</script>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 1150;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  padding-bottom: calc(24px + env(safe-area-inset-bottom));
  background: rgba(14, 18, 28, 0.38);
}

.qr-dialog {
  width: min(100%, 480px);
  padding: 24px;
  overflow: hidden;
  border-radius: var(--radius-large);
  border: 1px solid var(--app-glass-border);
  background: color-mix(in srgb, var(--app-glass-strong) 92%, var(--app-surface));
  box-shadow: var(--app-shadow);
}

.qr-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.dialog-label {
  color: var(--app-text-tertiary);
  font-size: 12px;
  letter-spacing: 0;
  text-transform: uppercase;
}

.dialog-title {
  margin: 6px 0 0;
  color: var(--app-text);
  font-size: 19px;
  font-weight: 600;
  letter-spacing: 0;
}

.qr-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  border: none;
  border-radius: 50%;
  background: color-mix(in srgb, var(--app-surface-soft) 88%, transparent);
  color: var(--app-text-secondary);
}

.qr-close svg {
  width: 17px;
  height: 17px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
}

.qr-content {
  display: grid;
  gap: 16px;
  margin-top: 20px;
}

.qr-card {
  display: flex;
  align-items: center;
  justify-content: center;
  width: min(100%, 280px);
  aspect-ratio: 1;
  justify-self: center;
  padding: 16px;
  border-radius: 24px;
  background: #ffffff;
  box-shadow:
    inset 0 0 0 1px rgba(20, 20, 22, 0.06),
    0 18px 38px color-mix(in srgb, var(--app-text) 10%, transparent);
}

.qr-image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.qr-placeholder {
  color: #6b7280;
  font-size: 14px;
}

.qr-meta {
  min-width: 0;
  text-align: center;
}

.qr-node {
  color: var(--app-text);
  font-size: 18px;
  font-weight: 700;
  line-height: 1.3;
}

.qr-path,
.qr-desc {
  margin-top: 6px;
  color: var(--app-text-secondary);
  font-size: 13px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.qr-link {
  display: grid;
  gap: 8px;
}

.qr-link span {
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 600;
}

.qr-link textarea {
  width: 100%;
  min-height: 66px;
  resize: none;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--app-text) 10%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, var(--app-surface-soft) 88%, transparent);
  color: var(--app-text-secondary);
  font-size: 12px;
  line-height: 1.45;
  outline: none;
}

.dialog-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 20px;
}

.dialog-btn {
  min-height: 44px;
  padding: 0 14px;
  border: none;
  border-radius: 14px;
  font-size: 14px;
  font-weight: 600;
}

.dialog-btn--primary {
  background: var(--app-text);
  color: var(--app-surface);
}

.dialog-btn--secondary {
  background: color-mix(in srgb, var(--app-glass) 78%, var(--app-surface-soft));
  color: var(--app-text-secondary);
}

.dialog-btn:disabled {
  opacity: 0.5;
}

.dialog-btn:active,
.qr-close:active {
  transform: scale(0.96);
}

.overlay-fade-enter-active,
.overlay-fade-leave-active {
  transition: opacity 0.25s ease;
}

.overlay-fade-enter-active .dialog,
.overlay-fade-leave-active .dialog {
  transition: transform 0.25s ease;
}

.overlay-fade-enter-from,
.overlay-fade-leave-to {
  opacity: 0;
}

.overlay-fade-enter-from .dialog,
.overlay-fade-leave-to .dialog {
  transform: scale(0.95) translateY(8px);
}

@media (max-width: 767px) {
  .overlay {
    align-items: flex-end;
    padding: 16px;
    padding-bottom: calc(var(--tabbar-height) + 24px + env(safe-area-inset-bottom));
  }

  .qr-dialog {
    width: 100%;
    padding: 20px;
    border-bottom-left-radius: 28px;
    border-bottom-right-radius: 28px;
  }

  .dialog-actions {
    margin-inline: -20px;
    padding: 14px 20px calc(4px + max(env(safe-area-inset-bottom), 0px));
  }
}
</style>
