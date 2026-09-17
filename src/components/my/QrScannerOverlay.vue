<template>
  <Teleport to="body">
    <Transition name="scanner-fade">
      <div
        v-if="modelValue"
        class="scanner-overlay"
        :class="{ 'scanner-overlay--native': nativeMode }"
        @click.self="emit('close')"
      >
        <div
          class="scanner-dialog"
          :class="{ 'scanner-dialog--native': nativeMode }"
          @click.stop
        >
          <div class="scanner-dialog__head">
            <h2 class="scanner-dialog__title">{{ t('my.scanQR') }}</h2>
            <button class="scanner-dialog__close" type="button" :aria-label="t('my.close')" @click="emit('close')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 6 6 18" /><path d="m6 6 12 12" />
              </svg>
            </button>
          </div>

          <div
            class="scanner-viewport"
            :class="{ 'scanner-viewport--native': nativeMode }"
          >
            <video
              v-if="cameraActive"
              :ref="videoRef"
              class="scanner-video"
              :class="{ 'is-ready': scannerReady }"
              autoplay
              playsinline
              muted
              @playing="emit('video-ready')"
            />
            <canvas v-if="!nativeMode" :ref="canvasRef" class="scanner-canvas" />

            <div v-if="scannerReady" class="scanner-frame">
              <span class="scanner-corner scanner-corner--tl" />
              <span class="scanner-corner scanner-corner--tr" />
              <span class="scanner-corner scanner-corner--bl" />
              <span class="scanner-corner scanner-corner--br" />
              <span class="scanner-line" />
            </div>
          </div>

          <p class="scanner-hint">{{ scannerHint }}</p>

          <div class="scanner-dialog__foot">
            <button class="scanner-foot-btn" type="button" @click="emit('gallery-pick')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
              <span>{{ t('my.fromGallery') }}</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { useI18n } from 'vue-i18n'

defineOptions({ name: 'QrScannerOverlay' })

const { t } = useI18n()

defineProps({
  modelValue: { type: Boolean, default: false },
  scannerReady: { type: Boolean, default: false },
  cameraActive: { type: Boolean, default: false },
  nativeMode: { type: Boolean, default: false },
  scannerHint: { type: String, default: '' },
  videoRef: { type: [Function, Object], default: null },
  canvasRef: { type: [Function, Object], default: null }
})

const emit = defineEmits(['update:modelValue', 'close', 'gallery-pick', 'video-ready'])
</script>

<style scoped>
/* ── Scanner overlay (glass dialog) ── */
.scanner-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: color-mix(in srgb, var(--app-overlay) 92%, transparent);
}

.scanner-dialog {
  width: 100%;
  max-width: 360px;
  border-radius: 28px;
  background: color-mix(in srgb, var(--app-glass-strong) 94%, var(--app-surface));
  border: 1px solid var(--app-glass-border);
  box-shadow:
    0 24px 56px color-mix(in srgb, var(--app-text) 16%, transparent),
    0 0 0 1px color-mix(in srgb, var(--app-text) 5%, transparent);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.scanner-dialog__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px 0;
}

.scanner-dialog__title {
  font-size: 17px;
  font-weight: 700;
  color: var(--app-text);
  letter-spacing: -0.02em;
  margin: 0;
}

.scanner-dialog__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: color-mix(in srgb, var(--app-surface-soft) 88%, transparent);
  color: var(--app-text-secondary);
}

.scanner-dialog__close svg {
  width: 16px;
  height: 16px;
}

.scanner-viewport {
  position: relative;
  margin: 16px 20px;
  aspect-ratio: 1;
  border-radius: 16px;
  overflow: hidden;
  background: #0f0f10;
}

.scanner-video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  transition: opacity 0.12s ease;
}

.scanner-video.is-ready {
  opacity: 1;
}

.scanner-canvas {
  position: absolute;
  inset: 0;
  opacity: 0;
  pointer-events: none;
}

/* 原生 ML Kit：相机在 WebView 后面，整条合成链必须透出画面 */
.scanner-overlay--native {
  background: transparent !important;
  padding: 0 !important;
  align-items: stretch !important;
  justify-content: stretch !important;
}

.scanner-dialog--native {
  width: 100%;
  max-width: none;
  height: 100%;
  border: none !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  background: transparent !important;
  overflow: visible !important;
  display: flex;
  flex-direction: column;
  padding: calc(env(safe-area-inset-top, 0px) + 12px) 16px calc(env(safe-area-inset-bottom, 0px) + 16px);
  box-sizing: border-box;
}

.scanner-dialog--native .scanner-dialog__head {
  padding: 0 0 12px;
  flex-shrink: 0;
}

.scanner-dialog--native .scanner-dialog__title {
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);
}

.scanner-dialog--native .scanner-dialog__close {
  background: rgba(0, 0, 0, 0.35);
  color: #fff;
}

.scanner-viewport--native {
  flex: 0 0 auto;
  width: min(72vw, 300px);
  height: min(72vw, 300px);
  max-width: none;
  margin: auto;
  align-self: center;
  background: transparent !important;
  border-radius: 16px;
  overflow: visible;
  /* 挖孔：取景框透明，四周半透明压暗 */
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.52);
}

.scanner-dialog--native .scanner-hint {
  color: rgba(255, 255, 255, 0.92);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  margin: 14px 0 0;
  flex-shrink: 0;
}

.scanner-dialog--native .scanner-dialog__foot {
  padding: 12px 0 0;
  flex-shrink: 0;
}

.scanner-dialog--native .scanner-foot-btn {
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
  backdrop-filter: none;
}

/* 扫码时 WebView 内除扫码层外全部让路，保证 native 相机能透出来 */
:global(html:has(body.barcode-scanner-active)),
:global(body.barcode-scanner-active) {
  background: transparent !important;
  background-color: transparent !important;
}

:global(body.barcode-scanner-active #app) {
  visibility: hidden !important;
  background: transparent !important;
}

:global(body.barcode-scanner-active > :not(.scanner-overlay)) {
  visibility: hidden !important;
  pointer-events: none !important;
}

.scanner-frame {
  position: absolute;
  inset: 8px;
  z-index: 10;
  pointer-events: none;
}

.scanner-corner {
  position: absolute;
  width: 22px;
  height: 22px;
  border-color: rgba(255, 255, 255, 0.86);
  border-style: solid;
}

.scanner-corner--tl { top: 0; left: 0; border-width: 2.5px 0 0 2.5px; border-radius: 4px 0 0 0; }
.scanner-corner--tr { top: 0; right: 0; border-width: 2.5px 2.5px 0 0; border-radius: 0 4px 0 0; }
.scanner-corner--bl { bottom: 0; left: 0; border-width: 0 0 2.5px 2.5px; border-radius: 0 0 0 4px; }
.scanner-corner--br { bottom: 0; right: 0; border-width: 0 2.5px 2.5px 0; border-radius: 0 0 4px 0; }

.scanner-line {
  position: absolute;
  left: 6px;
  right: 6px;
  top: 12px;
  height: 1.5px;
  background: linear-gradient(90deg, transparent, #5ba0ff, transparent);
  animation: scanner-line-sweep 2.6s ease-in-out infinite;
}

@keyframes scanner-line-sweep {
  0%   { top: 12px;  opacity: 0; }
  12%  { opacity: 1; }
  88%  { opacity: 1; }
  100% { top: calc(100% - 16px); opacity: 0; }
}

.scanner-hint {
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 500;
  text-align: center;
  margin: 0 20px 4px;
}

.scanner-dialog__foot {
  padding: 12px 20px 20px;
}

.scanner-foot-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 46px;
  border: none;
  border-radius: 14px;
  background: color-mix(in srgb, var(--app-surface-soft) 88%, transparent);
  color: var(--app-text);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.02em;
  transition: background 0.16s ease;
}

.scanner-foot-btn:active {
  background: color-mix(in srgb, var(--app-text) 8%, transparent);
}

.scanner-foot-btn svg {
  width: 20px;
  height: 20px;
  stroke: currentColor;
}

/* scanner transition */
.scanner-fade-enter-active,
.scanner-fade-leave-active {
  transition: opacity 0.24s ease;
}

.scanner-fade-enter-from,
.scanner-fade-leave-to {
  opacity: 0;
}

:global(html.theme-dark) .scanner-dialog {
  background: color-mix(in srgb, var(--app-glass-strong) 96%, var(--app-surface));
  box-shadow:
    0 24px 56px rgba(0, 0, 0, 0.48),
    0 0 0 1px rgba(255, 255, 255, 0.06);
}

:global(html.theme-dark) .scanner-dialog--native {
  background: transparent !important;
  box-shadow: none !important;
}
</style>
