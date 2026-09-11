<template>
  <Teleport to="body">
    <Transition name="editor-fade">
      <div v-if="show" class="editor-overlay" @click.self="handleCancel">
        <div class="editor-dialog" role="dialog" aria-modal="true" :aria-label="t('imageEditor.title')">
          <div class="editor-handle" aria-hidden="true" />

          <header class="editor-header">
            <div class="editor-title">
              <h3>{{ t('imageEditor.title') }}</h3>
              <p class="editor-subtitle">{{ t('imageEditor.subtitle') }}</p>
            </div>
            <button type="button" class="editor-close" @click="handleCancel">
              <span>{{ t('common.close') }}</span>
            </button>
          </header>

          <div class="editor-tabs" role="tablist" :aria-label="t('common.aria.imageEditFeatures')">
            <button
              v-for="tab in tabOptions"
              :key="tab.value"
              type="button"
              :class="['editor-tab', activeTab === tab.value && 'editor-tab--active']"
              :aria-selected="activeTab === tab.value"
              @click="activeTab = tab.value"
            >
              {{ tab.label }}
            </button>
          </div>

          <div class="editor-actions editor-history-bar">
            <button
              type="button"
              class="editor-btn editor-btn--ghost editor-history-btn"
              :disabled="saving || cutoutLoading || cutoutApplyingMask || !canUndo"
              @click="undoEditorChange"
            >
              {{ t('imageEditor.undo') }}
            </button>
            <button
              type="button"
              class="editor-btn editor-btn--ghost editor-history-btn"
              :disabled="saving || cutoutLoading || cutoutApplyingMask || !canRedo"
              @click="redoEditorChange"
            >
              {{ t('imageEditor.redo') }}
            </button>
          </div>

          <div class="editor-body">
            <section
              ref="previewRef"
              class="editor-preview"
              :class="{
                'editor-preview--plain': activeTab !== 'basic',
                'editor-preview--export': activeTab === 'export'
              }"
            >
              <img
                ref="imageRef"
                :src="previewUrl"
                :alt="t('common.aria.editPreview')"
                class="editor-image"
                :class="{ 'editor-image--export-hidden': activeTab === 'export' }"
              />

              <div
                v-if="activeTab === 'export' && previewUrl"
                class="editor-export-preview"
                :style="whiteBgEnabled ? { background: bgColor } : null"
              >
                <img
                  ref="exportPreviewImageRef"
                  :src="previewUrl"
                  :alt="t('common.aria.whiteBgPreview')"
                  class="editor-export-preview__image"
                  :class="{ 'editor-export-preview__image--picking': colorPickMode }"
                  :style="whiteBgPreviewImageStyle"
                  @pointerdown="onPickPointerDown"
                  @pointermove="onPickPointerMove"
                  @pointerup="onPickPointerUp"
                  @pointercancel="onPickPointerCancel"
                />
              </div>

              <div v-if="colorPickMode" class="editor-pick-hint" role="status">
                <svg class="editor-pick-hint__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M19.53 4.47a2.5 2.5 0 0 0-3.54 0l-1.17 1.17-2.29-2.29a1.25 1.25 0 0 0-1.77 1.77l.59.59-7.06 7.06a.75.75 0 0 0-.22.53v3.18l-1.2 1.2a1.5 1.5 0 1 0 2.12 2.12l1.2-1.2h3.18a.75.75 0 0 0 .53-.22l7.06-7.06.59.59a1.25 1.25 0 0 0 1.77-1.77l-2.29-2.29 1.17-1.17a2.5 2.5 0 0 0 0-3.54ZM7.3 15.3l5.84-5.84 1.4 1.4-5.84 5.84H7.3v-1.4Z"
                    fill="currentColor"
                  />
                </svg>
                <span class="editor-pick-hint__text">{{ t('imageEditor.tapToPick') }}</span>
                <button
                  type="button"
                  class="editor-pick-hint__cancel"
                  @click="exitColorPickMode"
                >
                  {{ t('common.cancel') }}
                </button>
              </div>
            </section>

            <div class="editor-panels">
              <EditorBasicPanel
                v-show="activeTab === 'basic'"
                :saving="saving"
                :simple-mode="simpleMode"
                :cropper-ready="Boolean(cropper)"
                :show-crop-ratio="!simpleMode && !props.aspectRatio"
                :brightness="brightness"
                :contrast="contrast"
                :saturation="saturation"
                :free-angle="freeAngle"
                :crop-ratio="cropRatio"
                @rotate-left="rotateLeft"
                @rotate-right="rotateRight"
                @flip-h="flipHorizontal"
                @reset="resetCropper"
                @record-history="recordEditorHistory"
                @update:brightness="brightness = $event"
                @update:contrast="contrast = $event"
                @update:saturation="saturation = $event"
                @update:free-angle="applyFreeAngle"
                @update:crop-ratio="setCropRatio"
              />

              <EditorCutoutPanel
                v-show="activeTab === 'cutout'"
                :loading="cutoutLoading"
                :saving="saving"
                :progress="cutoutProgress"
                :loading-text="cutoutLoadingText"
                :error-text="errorText"
                :quality-hint="cutoutQualityHint"
                :cloud-available="cloudCutoutAvailable"
                :model-value="cutoutModel"
                @run="runCutout"
                @update:model-value="cutoutModel = $event"
              />

              <EditorExportPanel
                v-show="activeTab === 'export'"
                :white-bg-enabled="whiteBgEnabled"
                :white-bg-style="whiteBgStyle"
                :white-bg-scale-percent="whiteBgScalePercent"
                :bg-color="bgColor"
                :bg-color-picker-open="bgColorPickerOpen"
                :picking-color="pickingColor"
                @update:white-bg-enabled="whiteBgEnabled = $event"
                @update:white-bg-style="whiteBgStyle = $event"
                @update:white-bg-scale-percent="whiteBgScalePercent = $event"
                @update:bg-color="bgColor = $event"
                @toggle-bg-color-picker="bgColorPickerOpen = !bgColorPickerOpen"
                @enter-color-pick="enterColorPickMode"
                @pick-dominant="pickDominantColor"
              />

              <p v-if="errorText" class="editor-error">{{ errorText }}</p>

              <div v-if="saving" class="editor-progress">
                <div class="editor-progress__head">
                  <span>{{ saveProgressText }}</span>
                  <strong>{{ saveProgress }}%</strong>
                </div>
                <div class="editor-progress__track">
                  <div class="editor-progress__fill" :style="{ width: `${saveProgress}%` }" />
                </div>
              </div>
            </div>
          </div>

          <footer class="editor-footer">
            <button type="button" class="editor-btn editor-btn--ghost" :disabled="saving" @click="handleCancel">
              {{ t('common.cancel') }}
            </button>
            <button type="button" class="editor-btn editor-btn--primary" :disabled="saving" @click="handleSave">
              {{ saving ? t('imageEditor.saveProgress', { percent: saveProgress }) : t('imageEditor.saveAndReplace') }}
            </button>
          </footer>
        </div>
      </div>
    </Transition>

    <div
      v-if="colorPickMode && pickMagnifierVisible"
      ref="pickMagnifierRef"
      class="editor-pick-magnifier"
      :style="pickMagnifierStyle"
      role="dialog"
      aria-label="picker"
    >
      <canvas ref="pickCanvasRef" class="editor-pick-magnifier__canvas" :width="PICK_SIZE" :height="PICK_SIZE" />
      <div class="editor-pick-magnifier__footer">
        <span class="editor-pick-magnifier__chip" :style="{ background: pickLiveColor }" aria-hidden="true" />
        <span class="editor-pick-magnifier__hex">{{ pickLiveColor }}</span>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Cropper from 'cropperjs'
import 'cropperjs/dist/cropper.css'
import EditorBasicPanel from '@/components/image/editor/EditorBasicPanel.vue'
import EditorCutoutPanel from '@/components/image/editor/EditorCutoutPanel.vue'
import EditorExportPanel from '@/components/image/editor/EditorExportPanel.vue'
import { useEditorHistory } from '@/composables/image/useEditorHistory'
import { useImageCutout, checkCloudCutoutPermission } from '@/composables/image/useImageCutout'
import { useImageExport } from '@/composables/image/useImageExport'
import '@/components/image/editor/editor-panels.css'

const props = defineProps({
  show: { type: Boolean, default: false },
  sourceFile: { type: Object, default: null },
  simpleMode: { type: Boolean, default: false },
  aspectRatio: { type: Number, default: 0 }
})

const emit = defineEmits(['update:show', 'save'])

const { t } = useI18n()

const imageRef = ref(null)
const exportPreviewImageRef = ref(null)
const previewRef = ref(null)
const activeTab = ref('basic')
const cutoutLoading = ref(false)
const cutoutLoadingText = ref('')
const cutoutProgress = ref(0)
const saving = ref(false)
const saveProgress = ref(0)
const saveProgressText = ref('')
const whiteBgEnabled = ref(true)
const whiteBgStyle = ref('standard')
const whiteBgScalePercent = ref(88)
const bgColor = ref('#ffffff')
const bgColorPickerOpen = ref(false)
const colorPickMode = ref(false)
const pickingColor = ref(false)
const brightness = ref(0)
const contrast = ref(0)
const saturation = ref(0)
const freeAngle = ref(0)
const cropRatio = ref('free')
const errorText = ref('')
const cutoutBrushMode = ref('')
const cutoutBrushSize = ref(28)
const cutoutHasPendingStrokes = ref(false)
const cutoutApplyingMask = ref(false)
const cutoutPreparedImageUrl = ref('')
const cutoutMaskUrl = ref('')
const cutoutQualityHint = ref('')
const cutoutModel = ref('falcon')
const cloudCutoutAvailable = ref(false)
const {
  applyCutoutMask,
  applyCloudCutoutMask,
  createCutoutMask,
  createCloudCutoutMask,
  isCutoutModelReady
} = useImageCutout()
const { exportForUpload } = useImageExport()

const tabOptions = computed(() => {
  if (props.simpleMode) {
    return [{ value: 'basic', label: t('imageEditor.tabBasic') }]
  }
  return [
    { value: 'basic', label: t('imageEditor.tabBasic') },
    { value: 'cutout', label: t('imageEditor.tabCutout') },
    { value: 'export', label: t('imageEditor.tabExport') }
  ]
})

async function refreshCloudCutoutAvailability() {
  cloudCutoutAvailable.value = await checkCloudCutoutPermission().catch(() => false)
}

const editorHistory = useEditorHistory()
const { canUndo, canRedo } = editorHistory

const whiteBgPreviewImageStyle = computed(() => ({
  transform: whiteBgEnabled.value ? `scale(${Math.max(0.4, Number(whiteBgScalePercent.value || 88) / 100)})` : 'scale(1)'
}))

let cropper = null
const previewUrl = ref('')
let flipX = 1
let previousHtmlOverflow = ''
let previousHtmlOverscrollBehavior = ''
let previousBodyOverflow = ''
let previousBodyOverscrollBehavior = ''
let _cutoutPreparedBlob = null
let cutoutCurrentMaskBlob = null
let _cutoutOriginalMaskBlob = null
const cutoutInputImageUrl = ref('')
let cutoutMeta = null
let editorSessionId = 0
let cropperInitToken = 0
let tabTransitionQueue = Promise.resolve()
let historyRestoreDepth = 0
let editorStateSignature = ''
const editorSessionUrls = new Set()

function trackObjectUrl(url) {
  if (url?.startsWith('blob:')) {
    editorSessionUrls.add(url)
  }
}

function clearCutoutSession() {
  cutoutPreparedImageUrl.value = ''
  cutoutMaskUrl.value = ''
  cutoutInputImageUrl.value = ''
  _cutoutPreparedBlob = null
  cutoutCurrentMaskBlob = null
  _cutoutOriginalMaskBlob = null
  cutoutMeta = null
  cutoutBrushMode.value = ''
  cutoutBrushSize.value = 28
  cutoutHasPendingStrokes.value = false
}

function releaseEditorSessionUrls() {
  editorSessionUrls.forEach((url) => {
    URL.revokeObjectURL(url)
  })
  editorSessionUrls.clear()
}

function destroyCropper() {
  if (cropper) {
    cropper.destroy()
    cropper = null
  }
}

function createTrackedObjectUrl(blob) {
  const url = URL.createObjectURL(blob)
  trackObjectUrl(url)
  return url
}

async function readBlobFromObjectUrl(url) {
  if (!url) return null

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(t('imageEditor.readHistoryFailed'))
  }

  return await response.blob()
}

function buildEditorSnapshot() {
  const cropData = cropper?.getData?.(true) || null
  return {
    brightness: Number(brightness.value) || 0,
    contrast: Number(contrast.value) || 0,
    saturation: Number(saturation.value) || 0,
    freeAngle: Number(freeAngle.value) || 0,
    cropRatio: cropRatio.value,
    flipX: Number(flipX) || 1,
    cropData: cropData ? { ...cropData } : null,
    rotation: Number(cropData?.rotate) || Number(freeAngle.value) || 0,
    cutoutPreviewUrl: previewUrl.value || '',
    cutoutMaskUrl: cutoutMaskUrl.value || '',
    cutoutPreparedImageUrl: cutoutPreparedImageUrl.value || '',
    cutoutMeta: cutoutMeta ? { ...cutoutMeta } : null,
    hasCutout: Boolean(cutoutPreparedImageUrl.value && cutoutMaskUrl.value)
  }
}

function recordEditorHistory() {
  if (historyRestoreDepth > 0) return

  const snapshot = buildEditorSnapshot()
  const signature = JSON.stringify(snapshot)
  if (signature === editorStateSignature) return

  editorHistory.snapshot(snapshot)
  editorStateSignature = signature
}

async function applyEditorSnapshot(snapshot) {
  if (!snapshot) return

  historyRestoreDepth += 1
  try {
    errorText.value = ''
    cutoutLoading.value = false
    cutoutApplyingMask.value = false
    cutoutProgress.value = 0
    saveProgress.value = 0
    saveProgressText.value = t('imageEditor.saving')

    brightness.value = Number(snapshot.brightness) || 0
    contrast.value = Number(snapshot.contrast) || 0
    saturation.value = Number(snapshot.saturation) || 0
    freeAngle.value = Number(snapshot.freeAngle) || 0
    if (snapshot.cropRatio !== undefined) {
      cropRatio.value = snapshot.cropRatio
    }
    flipX = Number(snapshot.flipX) || 1

    if (snapshot.hasCutout) {
      destroyCropper()
      clearCutoutSession()
      previewUrl.value = snapshot.cutoutPreviewUrl || ''
      cutoutPreparedImageUrl.value = snapshot.cutoutPreparedImageUrl || ''
      cutoutMaskUrl.value = snapshot.cutoutMaskUrl || ''
      cutoutInputImageUrl.value = snapshot.cutoutPreparedImageUrl || snapshot.cutoutPreviewUrl || ''
      cutoutMeta = snapshot.cutoutMeta ? { ...snapshot.cutoutMeta } : null
      _cutoutPreparedBlob = await readBlobFromObjectUrl(cutoutPreparedImageUrl.value)
      cutoutCurrentMaskBlob = await readBlobFromObjectUrl(cutoutMaskUrl.value)
      _cutoutOriginalMaskBlob = cutoutCurrentMaskBlob
      cutoutBrushMode.value = ''
      cutoutBrushSize.value = 28
      cutoutHasPendingStrokes.value = false
      await nextTick()
    } else {
      clearCutoutSession()
      previewUrl.value = snapshot.cutoutPreviewUrl || ''
      await initCropper()
      await nextTick()
      if (cropper && snapshot.cropData) {
        cropper.setData(snapshot.cropData)
      }
      applyPreviewFilter()
    }

    await nextTick()
    editorStateSignature = JSON.stringify(buildEditorSnapshot())
  } finally {
    historyRestoreDepth = Math.max(0, historyRestoreDepth - 1)
  }
}

async function undoEditorChange() {
  const snapshot = editorHistory.undo()
  if (!snapshot) return
  await applyEditorSnapshot(snapshot)
}

async function redoEditorChange() {
  const snapshot = editorHistory.redo()
  if (!snapshot) return
  await applyEditorSnapshot(snapshot)
}

function isTouchLikeDevice() {
  if (typeof window === 'undefined') return false
  try {
    if ('ontouchstart' in window) return true
    return Boolean(window.matchMedia?.('(pointer: coarse)').matches)
  } catch {
    return false
  }
}

function setPageScrollLock(locked) {
  if (typeof document === 'undefined') return

  const html = document.documentElement
  const body = document.body
  if (!html || !body) return

  const touchLike = isTouchLikeDevice()

  if (touchLike) {
    if (!locked) {
      html.style.overflow = previousHtmlOverflow
      html.style.overscrollBehavior = previousHtmlOverscrollBehavior
      body.style.overflow = previousBodyOverflow
      body.style.overscrollBehavior = previousBodyOverscrollBehavior
    }
    return
  }

  if (locked) {
    previousHtmlOverflow = html.style.overflow
    previousHtmlOverscrollBehavior = html.style.overscrollBehavior
    previousBodyOverflow = body.style.overflow
    previousBodyOverscrollBehavior = body.style.overscrollBehavior

    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    html.style.overscrollBehavior = 'none'
    body.style.overscrollBehavior = 'none'
    return
  }

  html.style.overflow = previousHtmlOverflow
  html.style.overscrollBehavior = previousHtmlOverscrollBehavior
  body.style.overflow = previousBodyOverflow
  body.style.overscrollBehavior = previousBodyOverscrollBehavior
}

function waitForImageLoad(img) {
  return new Promise((resolve) => {
    if (img.complete && img.naturalWidth > 0) {
      resolve()
      return
    }
    const done = () => {
      img.removeEventListener('load', done)
      img.removeEventListener('error', done)
      resolve()
    }
    img.addEventListener('load', done)
    img.addEventListener('error', done)
  })
}

function resolveCropperAspectRatio() {
  if (Number(props.aspectRatio) > 0) {
    return Number(props.aspectRatio)
  }
  if (String(cropRatio.value) === 'free') {
    return NaN
  }
  const ratio = Number(cropRatio.value)
  return Number.isFinite(ratio) && ratio > 0 ? ratio : NaN
}

function setCropRatio(value) {
  cropRatio.value = value
  if (cropper) {
    const ratio = resolveCropperAspectRatio()
    cropper.setAspectRatio(ratio)
  }
  recordEditorHistory()
}

async function initCropper() {
  const token = ++cropperInitToken
  await nextTick()
  if (!imageRef.value || !previewUrl.value) return

  await waitForImageLoad(imageRef.value)
  if (token !== cropperInitToken) return
  if (!imageRef.value || !previewUrl.value) return

  destroyCropper()
  cropper = new Cropper(imageRef.value, {
    viewMode: 1,
    autoCropArea: 1,
    dragMode: 'move',
    background: false,
    responsive: true,
    checkOrientation: true,
    cropBoxMovable: true,
    cropBoxResizable: true,
    minCropBoxWidth: 72,
    minCropBoxHeight: 72,
    zoomOnWheel: false,
    toggleDragModeOnDblclick: false,
    restore: false,
    aspectRatio: resolveCropperAspectRatio(),
    cropend: () => {
      recordEditorHistory()
    },
    ready: () => {
      cropper?.setDragMode('move')
    }
  })
  applyPreviewFilter()
}

function openFromFile(file) {
  editorSessionId += 1
  const sessionId = editorSessionId

  destroyCropper()
  clearCutoutSession()
  releaseEditorSessionUrls()
  editorHistory.reset()
  editorStateSignature = ''

  previewUrl.value = createTrackedObjectUrl(file)
  activeTab.value = 'basic'
  whiteBgEnabled.value = true
  whiteBgStyle.value = 'standard'
  whiteBgScalePercent.value = 88
  bgColor.value = '#ffffff'
  bgColorPickerOpen.value = false
  colorPickMode.value = false
  pickingColor.value = false
  brightness.value = 0
  contrast.value = 0
  saturation.value = 0
  freeAngle.value = 0
  cropRatio.value = Number(props.aspectRatio) > 0 ? Number(props.aspectRatio) : 'free'
  cutoutLoading.value = false
  cutoutApplyingMask.value = false
  cutoutProgress.value = 0
  saveProgress.value = 0
  saveProgressText.value = t('imageEditor.saving')
  errorText.value = ''
  flipX = 1
  void initCropper()
    .then(() => {
      if (sessionId !== editorSessionId) return
      recordEditorHistory()
    })
    .catch(() => {})
}

async function getCurrentBlob() {
  if (!cropper) {
    if (previewUrl.value) {
      const response = await fetch(previewUrl.value)
      if (!response.ok) {
        throw new Error(t('imageEditor.readPreviewFailed'))
      }
      return await response.blob()
    }
    if (!props.sourceFile) throw new Error(t('imageEditor.missingImage'))
    return props.sourceFile
  }

  const croppedCanvas = cropper.getCroppedCanvas({
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high'
  })

  return new Promise((resolve, reject) => {
    croppedCanvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error(t('imageEditor.exportCanvasFailed')))
        return
      }
      resolve(blob)
    }, 'image/png', 1)
  })
}

function normalizeAngle(angle) {
  const value = Number(angle) || 0
  const wrapped = ((value % 360) + 360) % 360
  return wrapped > 180 ? wrapped - 360 : wrapped
}

function getCurrentRotation() {
  if (!cropper) return Number(freeAngle.value) || 0
  const data = cropper.getData(true)
  return Number(data.rotate) || 0
}

function rotateLeft() {
  setFreeAngle(getCurrentRotation() - 90)
}

function rotateRight() {
  setFreeAngle(getCurrentRotation() + 90)
}

function applyFreeAngle(angle) {
  if (!cropper) return false
  const normalized = normalizeAngle(angle)
  freeAngle.value = normalized
  cropper.rotateTo(normalized)
  return true
}

function setFreeAngle(angle) {
  if (!applyFreeAngle(angle)) return
  recordEditorHistory()
}

function flipHorizontal() {
  if (!cropper) return
  flipX *= -1
  cropper.scaleX(flipX)
  recordEditorHistory()
}

function resetCropper() {
  cropper?.reset()
  flipX = 1
  brightness.value = 0
  contrast.value = 0
  saturation.value = 0
  freeAngle.value = 0
  applyPreviewFilter()
  recordEditorHistory()
}

function applyPreviewFilter() {
  if (!cropper?.container) return
  const brightnessPercent = 100 + (Number(brightness.value) || 0)
  const contrastPercent = 100 + (Number(contrast.value) || 0)
  const saturationPercent = 100 + (Number(saturation.value) || 0)
  cropper.container.style.filter = `brightness(${brightnessPercent}%) contrast(${contrastPercent}%) saturate(${saturationPercent}%)`
}

async function runCutout() {
  if (cutoutLoading.value) return
  cutoutLoading.value = true
  cutoutProgress.value = 5
  cutoutLoadingText.value = !isCutoutModelReady()
    ? t('imageEditor.modelPreparing')
    : t('imageEditor.cutoutProcessing')
  errorText.value = ''
  cutoutQualityHint.value = ''

  let usedCloud = false
  let preparedBlob = null
  let maskBlob = null
  let meta = null

  try {
    const inputBlob = await getCurrentBlob()
    cutoutInputImageUrl.value = createTrackedObjectUrl(inputBlob)

    const cloudAllowed = await checkCloudCutoutPermission().catch(() => false)
    if (cloudAllowed) {
      try {
        const cloudResult = await createCloudCutoutMask(inputBlob, {
          model: cutoutModel.value || 'falcon',
          onProgress: ({ percent, text }) => {
            cutoutProgress.value = Number(percent) || 0
            if (text) {
              cutoutLoadingText.value = text
            }
          }
        })
        preparedBlob = cloudResult.preparedBlob
        maskBlob = cloudResult.maskBlob
        meta = cloudResult.meta
        usedCloud = true
      } catch (cloudError) {
        console.warn('[cutout] 云端抠图失败，回退本地:', cloudError?.message)
      }
    }

    if (!usedCloud) {
      const localResult = await createCutoutMask(inputBlob, {
        onProgress: ({ percent, text }) => {
          cutoutProgress.value = Number(percent) || 0
          if (text) {
            cutoutLoadingText.value = text
          }
        }
      })
      preparedBlob = localResult.preparedBlob
      maskBlob = localResult.maskBlob
      meta = localResult.meta
      cutoutQualityHint.value = t('imageEditor.cutoutQualityHint')
    }

    const cutoutBlob = usedCloud
      ? await applyCloudCutoutMask(preparedBlob, maskBlob, meta)
      : await applyCutoutMask(preparedBlob, maskBlob, meta)

    clearCutoutSession()
    _cutoutPreparedBlob = preparedBlob
    cutoutCurrentMaskBlob = maskBlob
    _cutoutOriginalMaskBlob = maskBlob
    cutoutMeta = meta
    cutoutPreparedImageUrl.value = createTrackedObjectUrl(preparedBlob)
    cutoutMaskUrl.value = createTrackedObjectUrl(maskBlob)

    destroyCropper()
    freeAngle.value = 0
    previewUrl.value = createTrackedObjectUrl(cutoutBlob)
    recordEditorHistory()
  } catch (error) {
    errorText.value = error?.message || t('imageEditor.cutoutFailed')
  } finally {
    cutoutLoading.value = false
    cutoutProgress.value = 0
    cutoutLoadingText.value = t('imageEditor.cutoutProcessing')
  }
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b]
    .map((channel) => Math.round(channel).toString(16).padStart(2, '0'))
    .join('')}`
}

async function pickDominantColor() {
  const url = previewUrl.value
  if (!url || pickingColor.value) return
  pickingColor.value = true

  try {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    await new Promise((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error(t('imageEditor.pickFailed')))
      img.src = url
    })

    const sampleSize = 64
    const canvas = document.createElement('canvas')
    canvas.width = sampleSize
    canvas.height = sampleSize
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(img, 0, 0, sampleSize, sampleSize)
    const { data } = ctx.getImageData(0, 0, sampleSize, sampleSize)

    const buckets = new Map()
    for (let index = 0; index < data.length; index += 4) {
      if (data[index + 3] < 128) continue
      const r = data[index]
      const g = data[index + 1]
      const b = data[index + 2]
      const key = ((r >> 5) << 10) | ((g >> 5) << 5) | (b >> 5)
      let entry = buckets.get(key)
      if (!entry) {
        entry = { r: 0, g: 0, b: 0, count: 0 }
        buckets.set(key, entry)
      }
      entry.r += r
      entry.g += g
      entry.b += b
      entry.count += 1
    }

    let best = null
    for (const entry of buckets.values()) {
      if (!best || entry.count > best.count) {
        best = entry
      }
    }

    if (!best) return
    bgColor.value = rgbToHex(best.r / best.count, best.g / best.count, best.b / best.count)
  } catch (error) {
    errorText.value = error?.message || t('imageEditor.pickFailed')
  } finally {
    pickingColor.value = false
  }
}

function enterColorPickMode() {
  if (!previewUrl.value) return
  colorPickMode.value = true
  pickPointerActive = false
  pickMagnifierVisible.value = false
  void ensurePickSourceImage()
}

function exitColorPickMode() {
  colorPickMode.value = false
}

const PICK_SIZE = 144
const PICK_ZOOM = 8
const pickCanvasRef = ref(null)
const pickMagnifierVisible = ref(false)
const pickMagnifierStyle = ref({})
const pickLiveColor = ref('#ffffff')
let pickPointerActive = false
let pickSourceImage = null
let pickSourceUrl = ''
let lastPickPixel = null

function ensurePickSourceImage() {
  const url = previewUrl.value
  if (!url) return Promise.resolve()
  if (pickSourceImage && pickSourceUrl === url && pickSourceImage.complete && pickSourceImage.naturalWidth > 0) {
    return Promise.resolve()
  }
  const img = new Image()
  pickSourceImage = img
  pickSourceUrl = url
  return new Promise((resolve) => {
    img.onload = () => resolve()
    img.onerror = () => resolve()
    img.src = url
  })
}

function eventToPickPixel(event) {
  const img = exportPreviewImageRef.value
  if (!img || !previewUrl.value) return null

  const rect = img.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null

  const naturalWidth = Number(img.naturalWidth) || 0
  const naturalHeight = Number(img.naturalHeight) || 0
  if (!naturalWidth || !naturalHeight) return null

  return {
    x: Math.max(0, Math.min(naturalWidth - 1, Math.round(((event.clientX - rect.left) / rect.width) * naturalWidth))),
    y: Math.max(0, Math.min(naturalHeight - 1, Math.round(((event.clientY - rect.top) / rect.height) * naturalHeight)))
  }
}

function sampleImagePixelAt(img, x, y) {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, -x, -y)
  return ctx.getImageData(0, 0, 1, 1).data
}

function updatePickMagnifierPosition(event) {
  const width = window.innerWidth
  const height = window.innerHeight
  let left = event.clientX + 20
  let top = event.clientY - PICK_SIZE - 32
  if (top < 8) {
    top = event.clientY + 24
  }
  left = Math.min(width - PICK_SIZE - 8, Math.max(8, left))
  top = Math.min(height - PICK_SIZE - 8, Math.max(8, top))
  pickMagnifierStyle.value = { left: `${left}px`, top: `${top}px` }
}

function renderPickMagnifier(pixel) {
  const canvas = pickCanvasRef.value
  const img = pickSourceImage
  if (!canvas || !img || !img.complete || !img.naturalWidth) return

  const ctx = canvas.getContext('2d')
  ctx.save()
  ctx.clearRect(0, 0, PICK_SIZE, PICK_SIZE)
  ctx.translate(PICK_SIZE / 2, PICK_SIZE / 2)
  ctx.scale(PICK_ZOOM, PICK_ZOOM)
  ctx.drawImage(img, -pixel.x, -pixel.y)
  ctx.restore()

  const center = PICK_SIZE / 2
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(center, 0)
  ctx.lineTo(center, PICK_SIZE)
  ctx.moveTo(0, center)
  ctx.lineTo(PICK_SIZE, center)
  ctx.stroke()

  const data = sampleImagePixelAt(img, pixel.x, pixel.y)
  if (data && data[3] >= 128) {
    pickLiveColor.value = rgbToHex(data[0], data[1], data[2])
  }
}

function onPickPointerDown(event) {
  if (!colorPickMode.value) return
  event.preventDefault()
  pickPointerActive = true
  pickMagnifierVisible.value = true
  event.currentTarget.setPointerCapture?.(event.pointerId)
  const pixel = eventToPickPixel(event)
  lastPickPixel = pixel
  updatePickMagnifierPosition(event)
  void ensurePickSourceImage().then(() => {
    if (pickPointerActive && lastPickPixel) {
      renderPickMagnifier(lastPickPixel)
    }
  })
  if (pixel) renderPickMagnifier(pixel)
}

function onPickPointerMove(event) {
  if (!colorPickMode.value || !pickPointerActive) return
  event.preventDefault()
  updatePickMagnifierPosition(event)
  const pixel = eventToPickPixel(event)
  lastPickPixel = pixel
  if (pixel) renderPickMagnifier(pixel)
}

function onPickPointerUp(event) {
  if (!colorPickMode.value || !pickPointerActive) return
  pickPointerActive = false
  pickMagnifierVisible.value = false
  const img = pickSourceImage
  const pixel = eventToPickPixel(event)
  if (img && img.complete && img.naturalWidth && pixel) {
    const data = sampleImagePixelAt(img, pixel.x, pixel.y)
    if (data && data[3] >= 128) {
      bgColor.value = rgbToHex(data[0], data[1], data[2])
    }
  }
  exitColorPickMode()
}

function onPickPointerCancel() {
  pickPointerActive = false
  pickMagnifierVisible.value = false
}

function mapExportProgressText(stage) {
  switch (stage) {
    case 'preparing':
      return t('imageEditor.preparing')
    case 'adjust':
      return t('imageEditor.applyingBC')
    case 'product':
      return t('imageEditor.optimizing')
    case 'whiteBg':
      return t('imageEditor.compositing')
    case 'alpha':
      return t('imageEditor.checkAlpha')
    case 'compress':
      return t('imageEditor.compressing')
    case 'done':
      return t('imageEditor.saveDone')
    default:
      return t('imageEditor.saving')
  }
}

async function handleSave() {
  if (saving.value) return
  saving.value = true
  saveProgress.value = 5
  saveProgressText.value = t('imageEditor.preparing')
  errorText.value = ''

  try {
    const sourceBlob = await getCurrentBlob()
    const exported = await exportForUpload(sourceBlob, {
      targetMaxBytes: 1024 * 1024,
      skipCompression: true,
      applyWhiteBg: props.simpleMode ? false : whiteBgEnabled.value,
      whiteBgStyle: whiteBgStyle.value,
      whiteBgFitRatio: whiteBgScalePercent.value / 100,
      bgColor: bgColor.value,
      brightness: props.simpleMode ? 0 : brightness.value,
      contrast: props.simpleMode ? 0 : contrast.value,
      saturation: props.simpleMode ? 0 : saturation.value,
      onProgress: ({ percent, stage, text }) => {
        saveProgress.value = Number(percent) || 0
        saveProgressText.value = mapExportProgressText(stage) || text
      },
      fileName: props.sourceFile?.name || `image_${Date.now()}`
    })

    emit('save', {
      ...exported,
      compressedUnder1MB: exported.underTarget,
      previewUrl: createTrackedObjectUrl(exported.file)
    })
    emit('update:show', false)
  } catch (error) {
    errorText.value = error?.message || t('imageEditor.saveFailed')
  } finally {
    saving.value = false
    saveProgress.value = 0
    saveProgressText.value = t('imageEditor.saving')
  }
}

function handleCancel() {
  emit('update:show', false)
}

watch(
  () => props.show,
  (visible) => {
    setPageScrollLock(visible)

    if (!visible) {
      editorSessionId += 1
      destroyCropper()
      clearCutoutSession()
      releaseEditorSessionUrls()
      editorHistory.reset()
      editorStateSignature = ''
      previewUrl.value = ''
      colorPickMode.value = false
      return
    }
    void refreshCloudCutoutAvailability()
    if (props.sourceFile) {
      openFromFile(props.sourceFile)
    }
  }
)

watch(
  () => props.sourceFile,
  (file) => {
    if (props.show && file) {
      openFromFile(file)
    }
  }
)

watch([brightness, contrast, saturation], () => {
  applyPreviewFilter()
})

async function commitCrop() {
  if (!cropper) return

  try {
    if (isCropMeaningful()) {
      const blob = await getCurrentBlob()
      destroyCropper()
      flipX = 1
      freeAngle.value = 0
      previewUrl.value = createTrackedObjectUrl(blob)
    } else {
      destroyCropper()
      freeAngle.value = 0
    }
  } catch (error) {
    // 保持当前状态，避免裁切提交失败时丢失预览
  }
}

function isCropMeaningful() {
  if (!cropper) return false
  const data = cropper.getData(true)
  const img = imageRef.value
  const naturalWidth = Number(img?.naturalWidth) || 0
  const naturalHeight = Number(img?.naturalHeight) || 0

  if (Math.abs(Number(data.rotate) || 0) > 0) return true
  if (Number(data.scaleX) !== 1 || Number(data.scaleY) !== 1) return true
  if (!naturalWidth || !naturalHeight) return true
  return (
    Math.abs(Number(data.width) - naturalWidth) > 1 ||
    Math.abs(Number(data.height) - naturalHeight) > 1
  )
}

watch(
  () => activeTab.value,
  (next, prev) => {
    if (next === 'cutout') {
      void refreshCloudCutoutAvailability()
    }
    if (colorPickMode.value && next !== 'export') {
      colorPickMode.value = false
    }
    if (prev === 'basic' && next !== 'basic') {
      tabTransitionQueue = tabTransitionQueue
        .then(() => commitCrop())
        .catch(() => {})
    } else if (next === 'basic' && prev !== 'basic') {
      tabTransitionQueue = tabTransitionQueue
        .then(async () => {
          if (!cropper && previewUrl.value) {
            await initCropper()
          }
        })
        .catch(() => {})
    }
  }
)

onBeforeUnmount(() => {
  setPageScrollLock(false)
  destroyCropper()
  clearCutoutSession()
  releaseEditorSessionUrls()
  editorHistory.reset()
  editorStateSignature = ''
  previewUrl.value = ''
  colorPickMode.value = false
})
</script>

<style scoped>
.editor-overlay {
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

.editor-dialog {
  width: min(100%, 560px);
  max-height: min(90vh, 680px);
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: var(--app-surface);
  border-radius: var(--radius-large, 24px);
  box-shadow: var(--app-shadow, 0 8px 24px rgba(0, 0, 0, 0.06));
  overflow: hidden;
}

.editor-handle {
  display: none;
  width: 36px;
  height: 4px;
  margin: 0 auto 4px;
  border-radius: 999px;
  background: var(--app-text-tertiary);
  opacity: 0.3;
}

.editor-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.editor-title {
  min-width: 0;
}

.editor-title h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--app-text);
}

.editor-subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--app-text-secondary);
}

.editor-close {
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

.editor-tabs {
  display: flex;
  gap: 6px;
  padding: 4px;
  background: var(--app-surface-soft);
  border-radius: var(--radius-small, 14px);
}

.editor-tab {
  flex: 1;
  height: 40px;
  border: none;
  border-radius: calc(var(--radius-small, 14px) - 4px);
  background: transparent;
  color: var(--app-text-secondary);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
}

.editor-tab--active {
  background: var(--app-surface);
  color: var(--app-text);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.editor-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  overflow: hidden;
}

.editor-preview {
  position: relative;
  min-height: 200px;
  max-height: 50vh;
  border-radius: var(--radius-card, 18px);
  overflow: hidden;
  background:
    repeating-conic-gradient(rgba(0, 0, 0, 0.04) 0% 25%, transparent 0% 50%) 0 0 / 16px 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.editor-image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.editor-preview :deep(.cropper-container),
.editor-preview :deep(.cropper-wrap-box),
.editor-preview :deep(.cropper-crop-box) {
  touch-action: none;
}

.editor-preview :deep(.cropper-view-box) {
  outline: 1px solid rgba(255, 255, 255, 0.9);
  box-shadow: 0 0 0 9999px rgba(20, 20, 22, 0.4);
}

.editor-preview :deep(.cropper-line) {
  background-color: rgba(255, 255, 255, 0.7);
}

.editor-preview :deep(.cropper-point) {
  position: absolute;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #ffffff;
  opacity: 1;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
  overflow: visible;
}

.editor-preview :deep(.cropper-point::before) {
  content: '';
  position: absolute;
  inset: -10px;
  border-radius: 999px;
  background: transparent;
}

.editor-preview--plain :deep(.cropper-crop-box),
.editor-preview--plain :deep(.cropper-modal),
.editor-preview--plain :deep(.cropper-line),
.editor-preview--plain :deep(.cropper-point),
.editor-preview--plain :deep(.cropper-dashed),
.editor-preview--plain :deep(.cropper-face),
.editor-preview--plain :deep(.cropper-center),
.editor-preview--plain :deep(.cropper-drag-box) {
  display: none;
}

.editor-preview--plain :deep(.cropper-container) {
  cursor: default;
}

.editor-image--export-hidden {
  opacity: 0;
}

.editor-export-preview {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  border-radius: var(--radius-card, 18px);
  overflow: hidden;
  background: #ffffff;
}

.editor-export-preview__image {
  display: block;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  transform-origin: center center;
  transition: transform 160ms ease;
}

.editor-export-preview__image--picking {
  cursor: crosshair;
  touch-action: none;
}

.editor-pick-hint {
  position: absolute;
  top: 12px;
  left: 50%;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: calc(100% - 24px);
  padding: 8px 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-surface, #ffffff) 90%, transparent);
  border: 1px solid var(--app-border, rgba(20, 20, 22, 0.12));
  box-shadow: 0 4px 16px rgba(20, 20, 22, 0.14);
  transform: translateX(-50%);
}

.editor-pick-hint__icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: var(--app-text-secondary, #6b7280);
}

.editor-pick-hint__text {
  color: var(--app-text, #1f2937);
  font-size: 13px;
  line-height: 1.4;
  white-space: nowrap;
}

.editor-pick-hint__cancel {
  flex-shrink: 0;
  padding: 4px 12px;
  border-radius: 999px;
  color: var(--app-primary, #4f6ef7);
  background: color-mix(in srgb, var(--app-primary, #4f6ef7) 12%, transparent);
  font-size: 13px;
  font-weight: 600;
  transition: background var(--motion-fast, 200ms) ease;
}

.editor-pick-hint__cancel:active {
  background: color-mix(in srgb, var(--app-primary, #4f6ef7) 22%, transparent);
}

.editor-pick-magnifier {
  position: fixed;
  z-index: 2200;
  display: grid;
  gap: 8px;
  justify-items: center;
  padding: 10px;
  border-radius: 18px;
  background: color-mix(in srgb, var(--app-surface, #ffffff) 96%, transparent);
  border: 1px solid var(--app-border, rgba(20, 20, 22, 0.12));
  box-shadow: 0 12px 36px rgba(20, 20, 22, 0.24);
  pointer-events: none;
}

.editor-pick-magnifier__canvas {
  display: block;
  width: 144px;
  height: 144px;
  border-radius: 12px;
  background: repeating-conic-gradient(rgba(0, 0, 0, 0.06) 0% 25%, transparent 0% 50%) 0 0 / 16px 16px;
}

.editor-pick-magnifier__footer {
  display: flex;
  align-items: center;
  gap: 8px;
}

.editor-pick-magnifier__chip {
  display: inline-block;
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  border-radius: 50%;
  box-shadow:
    inset 0 0 0 1px rgba(20, 20, 22, 0.12),
    inset 0 0 0 1px rgba(255, 255, 255, 0.3);
}

.editor-pick-magnifier__hex {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
  letter-spacing: 0.04em;
  color: var(--app-text, #1f2937);
}

.editor-panels {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior-y: contain;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}

.editor-panels::-webkit-scrollbar {
  display: none;
}

.editor-history-bar {
  margin-top: -2px;
}

.editor-history-btn {
  min-height: 38px;
}

.editor-error {
  margin: 0;
  padding: 12px;
  border-radius: var(--radius-card, 18px);
  background: rgba(199, 68, 68, 0.08);
  color: #c74444;
  font-size: 13px;
  line-height: 1.5;
}

.editor-footer {
  display: flex;
  gap: 10px;
  flex-shrink: 0;
}

.editor-footer .editor-btn {
  flex: 1;
}

.editor-fade-enter-active,
.editor-fade-leave-active {
  transition: opacity 0.2s ease;
}

.editor-fade-enter-active .editor-dialog {
  transition: transform 0.3s var(--motion-ease-spring, cubic-bezier(0.175, 0.885, 0.32, 1.275)), opacity 0.2s ease;
}

.editor-fade-leave-active .editor-dialog {
  transition: transform 0.2s var(--motion-ease-emphasis, cubic-bezier(0.22, 1, 0.36, 1)), opacity 0.2s ease;
}

.editor-fade-enter-from,
.editor-fade-leave-to {
  opacity: 0;
}

.editor-fade-enter-from .editor-dialog,
.editor-fade-leave-to .editor-dialog {
  opacity: 0;
  transform: translateY(16px) scale(0.98);
}

@media (max-width: 760px) {
  .editor-overlay {
    align-items: flex-end;
    padding: 0;
  }

  .editor-dialog {
    width: 100%;
    max-height: 94dvh;
    border-radius: 20px 20px 0 0;
    padding: 12px 12px 0;
    overflow: visible;
  }

  .editor-handle {
    display: block;
  }

  .editor-body {
    flex-direction: column;
    gap: 8px;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .editor-preview {
    flex: 2;
    min-height: 200px;
    max-height: 55vh;
  }

  .editor-preview :deep(.cropper-point) {
    width: 16px;
    height: 16px;
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.22);
  }

  .editor-preview :deep(.cropper-point::before) {
    inset: -14px;
  }

  .editor-preview :deep(.cropper-point.point-se),
  .editor-preview :deep(.cropper-point.point-sw),
  .editor-preview :deep(.cropper-point.point-ne),
  .editor-preview :deep(.cropper-point.point-nw) {
    width: 20px;
    height: 20px;
  }

  .editor-preview :deep(.cropper-point.point-se::before),
  .editor-preview :deep(.cropper-point.point-sw::before),
  .editor-preview :deep(.cropper-point.point-ne::before),
  .editor-preview :deep(.cropper-point.point-nw::before) {
    inset: -16px;
  }

  .editor-panels {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  .editor-footer {
    padding: 12px 0 max(12px, env(safe-area-inset-bottom));
    flex-shrink: 0;
  }
}

@media (min-width: 761px) and (max-width: 1024px) {
  .editor-dialog {
    width: min(calc(100vw - 32px), 720px);
    max-height: min(88vh, 700px);
  }

  .editor-body {
    flex-direction: row;
    gap: 14px;
  }

  .editor-preview {
    flex: 1.2;
    height: 100%;
    min-height: 360px;
  }

  .editor-panels {
    flex: 1;
    padding-right: 4px;
  }
}

@media (min-width: 1025px) {
  .editor-dialog {
    width: min(calc(100vw - 48px), 800px);
    max-height: min(86vh, 720px);
  }

  .editor-body {
    flex-direction: row;
    gap: 16px;
  }

  .editor-preview {
    flex: 1.3;
    height: 100%;
    min-height: 420px;
  }

  .editor-panels {
    flex: 1;
    padding-right: 4px;
  }
}

:global(html.theme-dark) .editor-dialog {
  box-shadow: 0 20px 48px rgba(0, 0, 0, 0.4);
}
</style>
