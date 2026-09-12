<template>
  <Teleport to="body">
    <Transition name="collage-fade">
      <div v-if="show" class="collage-overlay" @click.self="handleCancel">
        <div class="collage-dialog" role="dialog" aria-modal="true" :aria-label="t('collage.title')">
          <div class="collage-handle" aria-hidden="true" />

          <header class="collage-header">
            <div class="collage-title">
              <h3>{{ t('collage.title') }}</h3>
              <p class="collage-subtitle">{{ t('collage.dialogSubtitle') }}</p>
            </div>
            <button type="button" class="collage-close" @click="handleCancel">
              <span>{{ t('common.close') }}</span>
            </button>
          </header>

          <div class="collage-body">
            <section class="collage-stage">
              <div
                ref="hostRef"
                class="collage-stage__host"
                :class="{ 'collage-stage__host--transparent': transparentBackground }"
                @pointerdown="handleHostPointerDown($event)"
              >
                <canvas ref="canvasElRef" class="collage-stage__canvas" />
                <div v-if="!objectCount && ready" class="collage-stage__empty">
                  <p>{{ t('collage.emptyHint') }}</p>
                </div>
              </div>
            </section>

            <div class="collage-side">
              <div class="collage-snap-row">
                <label class="collage-snap-toggle">
                  <input
                    :checked="snapEnabled"
                    type="checkbox"
                    @change="setSnapEnabled($event.target.checked)"
                  />
                  <span>{{ t('collage.snapEnabled') }}</span>
                </label>
                <p class="collage-meta">{{ t('collage.snapHint') }}</p>
              </div>

              <CollageObjectBar :visible="hasSelection" @action="onObjectAction" @align="onAlign" />

              <div class="collage-panels">
                <div class="collage-group">
                  <p class="collage-group__title">{{ t('collage.ratio') }}</p>
                  <div class="collage-chips">
                    <button
                      v-for="item in ratioOptions"
                      :key="item.key"
                      type="button"
                      :class="['collage-chip', { 'collage-chip--active': ratioKey === item.key }]"
                      @click="setRatio(item.key)"
                    >
                      {{ item.label }}
                    </button>
                  </div>
                </div>

                <div class="collage-group">
                  <p class="collage-group__title">{{ t('collage.background') }}</p>
                  <div class="collage-bg-row">
                    <button
                      type="button"
                      :class="['collage-chip', { 'collage-chip--active': !transparentBackground }]"
                      @click="setTransparent(false)"
                    >
                      {{ t('collage.solidColor') }}
                    </button>
                    <button
                      type="button"
                      :class="['collage-chip', { 'collage-chip--active': transparentBackground }]"
                      @click="setTransparent(true)"
                    >
                      {{ t('collage.transparent') }}
                    </button>
                    <button
                      v-for="color in bgPresets"
                      :key="color"
                      type="button"
                      class="collage-swatch"
                      :class="{ 'collage-swatch--active': !transparentBackground && backgroundColor === color }"
                      :style="{ background: color }"
                      :aria-label="color"
                      @click="setSolidColor(color)"
                    />
                  </div>
                </div>

                <div class="collage-group">
                  <p class="collage-group__title">{{ t('collage.addImages') }}</p>
                  <button type="button" class="collage-btn" :disabled="busy || !canAddMore" @click="pickImages">
                    {{ busy ? t('collage.working') : t('collage.pickMore') }}
                  </button>
                  <p class="collage-meta">{{ t('collage.countMeta', { count: objectCount, max: maxImages }) }}</p>
                </div>

                <p v-if="errorText" class="collage-error">{{ errorText }}</p>
              </div>
            </div>
          </div>

          <footer class="collage-footer">
            <button type="button" class="collage-btn collage-btn--ghost" :disabled="busy" @click="handleCancel">
              {{ t('common.cancel') }}
            </button>
            <button type="button" class="collage-btn collage-btn--primary" :disabled="busy || !objectCount" @click="handleSave">
              {{ busy ? t('collage.exporting') : t('collage.saveAndReplace') }}
            </button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { showToast } from 'vant'
import CollageObjectBar from '@/components/image/collage/CollageObjectBar.vue'
import { useCollageCanvas } from '@/composables/image/useCollageCanvas'
import { pickLinkedLocalImages } from '@/utils/image/localImage'
import { COLLAGE_EXPORT_EDGES, COLLAGE_MAX_IMAGES, COLLAGE_RATIO_PRESETS } from '@/utils/image/collageLayout'
import { useDialogBackButton } from '@/composables/useDialogBackButton'

const props = defineProps({
  show: { type: Boolean, default: false }
})

const emit = defineEmits(['update:show', 'save'])

const { t } = useI18n()

const bgPresets = ['#ffffff', '#f5f5f7', '#1c1c1e', '#000000']
const maxImages = COLLAGE_MAX_IMAGES

const {
  hostRef,
  canvasElRef,
  ready,
  objectCount,
  hasSelection,
  ratioKey,
  backgroundColor,
  transparentBackground,
  exportEdge,
  busy,
  errorText,
  snapEnabled,
  canAddMore,
  init,
  dispose,
  setRatio,
  setSolidColor,
  setTransparent,
  setSnapEnabled,
  alignActive,
  fitActiveToCanvas,
  addImagesFromFiles,
  removeActive,
  duplicateActive,
  moveActive,
  handleHostPointerDown,
  exportCollage
} = useCollageCanvas()

const ratioOptions = computed(() =>
  COLLAGE_RATIO_PRESETS.map((item) => ({
    key: item.key,
    label: t(`collage.ratio_${item.key}`)
  }))
)

useDialogBackButton(handleCancel, () => props.show)

async function openSession() {
  dispose()
  ratioKey.value = '1:1'
  backgroundColor.value = '#ffffff'
  transparentBackground.value = false
  snapEnabled.value = true
  await nextTick()
  await init()
  setRatio('1:1')
}

watch(
  () => props.show,
  async (visible) => {
    if (visible) {
      // post：等 v-if 画布节点挂载后再初始化，避免量到 0 或读到旧节点
      await nextTick()
      await openSession()
    } else {
      dispose()
    }
  },
  { flush: 'post' }
)

async function pickImages() {
  if (!canAddMore.value) {
    showToast(t('collage.maxImages'))
    return
  }
  try {
    const picked = await pickLinkedLocalImages(COLLAGE_MAX_IMAGES)
    if (!picked?.length) return

    const files = await Promise.all(
      picked.map(async (item) => {
        if (item?.file instanceof File) return item.file
        if (!item?.uri) return null
        const response = await fetch(item.uri)
        if (!response.ok) return null
        const blob = await response.blob()
        return new File([blob], item.localPath || `image_${Date.now()}.png`, {
          type: blob.type || 'image/png'
        })
      })
    )

    const added = await addImagesFromFiles(files.filter(Boolean))
    if (added > 0) {
      showToast(t('collage.added', { count: added }))
    }
  } catch (error) {
    showToast(error?.message || t('collage.addFailed'))
  }
}

function onObjectAction(action) {
  if (action === 'delete') removeActive()
  else if (action === 'duplicate') duplicateActive()
  else moveActive(action)
}

function onAlign(mode) {
  if (mode === 'fit') fitActiveToCanvas()
  else alignActive(mode)
}

async function handleSave() {
  try {
    const result = await exportCollage({
      format: 'png',
      maxEdge: exportEdge.value || COLLAGE_EXPORT_EDGES[1]
    })
    emit('save', {
      file: result.file,
      blob: result.blob,
      width: result.width,
      height: result.height
    })
    emit('update:show', false)
  } catch {
    showToast(t('collage.exportFailed'))
  }
}

function handleCancel() {
  emit('update:show', false)
}
</script>

<style scoped>
.collage-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: var(--app-overlay, rgba(20, 20, 22, 0.22));
  backdrop-filter: blur(var(--app-overlay-blur, 8px));
  -webkit-backdrop-filter: blur(var(--app-overlay-blur, 8px));
}

.collage-dialog {
  width: min(100%, 560px);
  max-height: min(92vh, 720px);
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: var(--app-surface);
  border-radius: var(--radius-large, 24px);
  box-shadow: var(--app-shadow, 0 8px 24px rgba(0, 0, 0, 0.06));
  overflow: hidden;
  overflow: clip;
}

@media (min-width: 761px) {
  .collage-dialog {
    width: min(100%, 920px);
    max-height: min(90vh, 760px);
  }
}

.collage-handle {
  display: none;
  width: 36px;
  height: 4px;
  margin: 0 auto 4px;
  border-radius: 999px;
  background: var(--app-text-tertiary);
  opacity: 0.3;
}

.collage-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.collage-title h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--app-text);
}

.collage-subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--app-text-secondary);
}

.collage-close {
  flex-shrink: 0;
  height: 36px;
  padding: 0 14px;
  border: none;
  border-radius: var(--radius-small, 14px);
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
}

.collage-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: hidden;
}

.collage-stage {
  flex: 1 1 auto;
  min-height: 280px;
}

.collage-side {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

.collage-snap-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
  background: var(--app-surface-soft);
  border-radius: 12px;
}

.collage-snap-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--app-text);
  cursor: pointer;
}

.collage-snap-toggle input {
  accent-color: var(--app-text);
}

@media (min-width: 761px) {
  .collage-body {
    flex-direction: row;
    gap: 14px;
  }

  .collage-stage {
    flex: 1.35 1 0;
    min-width: 0;
    min-height: 420px;
  }

  .collage-side {
    flex: 1 1 260px;
    width: 280px;
    max-width: 300px;
    min-height: 0;
    overflow: hidden;
  }

  .collage-panels {
    flex: 1;
    max-height: none;
    min-height: 0;
  }
}

.collage-stage__host {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  min-height: 260px;
  border-radius: var(--radius-card, 18px);
  overflow: hidden;
  background:
    repeating-conic-gradient(rgba(0, 0, 0, 0.04) 0% 25%, transparent 0% 50%) 0 0 / 16px 16px;
  isolation: isolate;
}

@media (min-width: 761px) {
  .collage-stage__host {
    min-height: 400px;
  }
}

.collage-stage__host--transparent {
  background:
    repeating-conic-gradient(rgba(0, 0, 0, 0.06) 0% 25%, transparent 0% 50%) 0 0 / 16px 16px;
}

.collage-stage__host :deep(.canvas-container) {
  position: absolute !important;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  /* 不要用 max-width/max-height：会独立压缩宽高，导致预览被拉扁而导出仍是原比例 */
  overflow: hidden;
}

.collage-stage__canvas,
.collage-stage__host :deep(canvas) {
  display: block;
  /* 交给 fabric setDimensions 精确控制尺寸 */
}

.collage-stage__empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  color: var(--app-text-tertiary);
  font-size: 14px;
  text-align: center;
  padding: 16px;
}

.collage-panels {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-right: 2px;
}

.collage-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: var(--app-surface-soft);
  border-radius: var(--radius-card, 18px);
}

.collage-group__title {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--app-text-secondary);
}

.collage-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.collage-chip {
  min-height: 34px;
  padding: 0 12px;
  border: none;
  border-radius: 999px;
  background: var(--app-surface);
  color: var(--app-text-secondary);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
}

.collage-chip--active {
  background: var(--app-text);
  color: var(--app-bg);
}

.collage-bg-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.collage-swatch {
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 10px;
  box-shadow: inset 0 0 0 1px rgba(20, 20, 22, 0.12);
  cursor: pointer;
}

.collage-swatch--active {
  outline: 2px solid var(--app-text);
  outline-offset: 2px;
}

.collage-btn {
  flex: 1;
  min-height: 44px;
  padding: 0 14px;
  border: none;
  border-radius: var(--radius-small, 14px);
  background: var(--app-surface);
  color: var(--app-text);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
}

.collage-btn--primary {
  background: var(--app-text);
  color: var(--app-bg);
}

.collage-btn--ghost {
  background: transparent;
  color: var(--app-text-secondary);
}

.collage-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.collage-meta {
  margin: 0;
  font-size: 12px;
  color: var(--app-text-tertiary);
}

.collage-error {
  margin: 0;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(199, 68, 68, 0.08);
  color: #c74444;
  font-size: 13px;
}

.collage-footer {
  display: flex;
  gap: 10px;
  flex-shrink: 0;
}

.collage-footer .collage-btn {
  flex: 1;
}

.collage-fade-enter-active,
.collage-fade-leave-active {
  transition: opacity 0.2s ease;
}

.collage-fade-enter-active .collage-dialog,
.collage-fade-leave-active .collage-dialog {
  transition: transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.1), opacity 0.2s ease;
}

.collage-fade-enter-from,
.collage-fade-leave-to {
  opacity: 0;
}

.collage-fade-enter-from .collage-dialog,
.collage-fade-leave-to .collage-dialog {
  opacity: 0;
  transform: translateY(16px) scale(0.98);
}

@media (max-width: 760px) {
  .collage-overlay {
    align-items: flex-end;
    padding: 0;
  }

  .collage-dialog {
    width: 100%;
    max-height: 94dvh;
    border-radius: 20px 20px 0 0;
    padding: 12px 12px 0;
  }

  .collage-handle {
    display: block;
  }

  .collage-body {
    flex-direction: column;
  }

  .collage-stage {
    flex: 1 1 auto;
    min-height: 42vh;
    max-height: 48vh;
  }

  .collage-side {
    flex: 0 1 auto;
    max-height: 38vh;
    overflow-y: auto;
  }

  .collage-footer {
    padding: 12px 0 max(12px, env(safe-area-inset-bottom));
  }
}
</style>
