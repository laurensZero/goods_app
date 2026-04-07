<template>
  <Teleport to="body">
    <Transition name="editor-fade">
      <div v-if="show" class="editor-overlay" @click.self="handleCancel">
        <div class="editor-dialog" role="dialog" aria-modal="true" aria-label="快速编辑图片">
          <div class="editor-handle" aria-hidden="true" />

          <header class="editor-header">
            <div class="editor-title">
              <h3>快速编辑图片</h3>
              <p class="editor-subtitle">裁切、旋转、抠图和导出</p>
            </div>
            <button type="button" class="editor-close" @click="handleCancel">
              <span>关闭</span>
            </button>
          </header>

          <div class="editor-tabs" role="tablist" aria-label="图片编辑功能">
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
              撤销
            </button>
            <button
              type="button"
              class="editor-btn editor-btn--ghost editor-history-btn"
              :disabled="saving || cutoutLoading || cutoutApplyingMask || !canRedo"
              @click="redoEditorChange"
            >
              重做
            </button>
          </div>

          <div class="editor-body">
            <section
              ref="previewRef"
              :class="['editor-preview', whiteBgEnabled && 'editor-preview--white']"
            >
              <img ref="imageRef" :src="previewUrl" alt="编辑预览" class="editor-image" />
              <canvas
                v-show="cutoutBrushMode"
                ref="maskPreviewRef"
                class="editor-mask-preview"
                :style="previewOverlayStyle"
              />
              <div
                v-show="brushDrawingActive"
                ref="brushHostRef"
                class="editor-brush-layer"
                :style="previewOverlayStyle"
              />
            </section>

            <div class="editor-panels">
              <section v-show="activeTab === 'basic'" class="editor-panel">
                <div class="editor-group">
                  <p class="editor-group-title">方向调整</p>
                  <div class="editor-actions">
                    <button type="button" class="editor-btn" :disabled="saving" @click="rotateLeft">
                      左转 90°
                    </button>
                    <button type="button" class="editor-btn" :disabled="saving" @click="rotateRight">
                      右转 90°
                    </button>
                    <button type="button" class="editor-btn" :disabled="saving" @click="flipHorizontal">
                      水平镜像
                    </button>
                    <button type="button" class="editor-btn editor-btn--ghost" :disabled="saving" @click="resetCropper">
                      重置
                    </button>
                  </div>
                </div>

                <div class="editor-group">
                  <p class="editor-group-title">画面校正</p>
                  <label class="editor-slider">
                    <div class="editor-slider__head">
                      <span>亮度</span>
                      <strong>{{ formatSignedValue(brightness) }}</strong>
                    </div>
                    <input v-model.number="brightness" type="range" min="-60" max="60" step="1" @change="recordEditorHistory" />
                  </label>

                  <label class="editor-slider">
                    <div class="editor-slider__head">
                      <span>对比度</span>
                      <strong>{{ formatSignedValue(contrast) }}</strong>
                    </div>
                    <input v-model.number="contrast" type="range" min="-40" max="40" step="1" @change="recordEditorHistory" />
                  </label>
                </div>
              </section>

              <section v-show="activeTab === 'cutout'" class="editor-panel">
                <div class="editor-group">
                  <p class="editor-group-title">智能抠图</p>
                  <button
                    type="button"
                    class="editor-btn editor-btn--primary"
                    :disabled="cutoutLoading || saving"
                    @click="runCutout"
                  >
                    {{ cutoutLoading ? cutoutLoadingText : '一键抠图' }}
                  </button>

                  <button
                    v-if="errorText"
                    type="button"
                    class="editor-btn"
                    :disabled="cutoutLoading || saving"
                    @click="runCutout"
                  >
                    重新尝试
                  </button>

                  <p class="editor-hint">建议先裁切多余边缘，再抠图</p>
                </div>

                <div v-if="brushModeActive" class="editor-group">
                  <p class="editor-group-title">画笔修边</p>

                  <div class="editor-chips">
                    <button
                      type="button"
                      :class="['editor-chip', cutoutBrushMode === 'keep' && 'editor-chip--active']"
                      :disabled="brushEntryDisabled || cutoutApplyingMask || saving"
                      @click="cutoutBrushMode = cutoutBrushMode === 'keep' ? '' : 'keep'"
                    >
                      保留（绿色）
                    </button>
                    <button
                      type="button"
                      :class="['editor-chip', cutoutBrushMode === 'erase' && 'editor-chip--active']"
                      :disabled="brushEntryDisabled || cutoutApplyingMask || saving"
                      @click="cutoutBrushMode = cutoutBrushMode === 'erase' ? '' : 'erase'"
                    >
                      擦除（红色）
                    </button>
                  </div>

                  <p v-if="brushEntryDisabled" class="editor-hint">画笔入口已临时禁用</p>

                  <label v-if="cutoutBrushMode" class="editor-slider">
                    <div class="editor-slider__head">
                      <span>笔刷大小</span>
                      <strong>{{ cutoutBrushSize }}</strong>
                    </div>
                    <input v-model.number="cutoutBrushSize" type="range" min="8" max="96" step="1" />
                  </label>

                  <div class="editor-actions">
                    <button
                      type="button"
                      class="editor-btn"
                      :disabled="!cutoutHasPendingStrokes || cutoutApplyingMask || saving"
                      @click="applyMaskEdits"
                    >
                      {{ cutoutApplyingMask ? '应用中...' : '应用画笔' }}
                    </button>
                    <button
                      type="button"
                      class="editor-btn editor-btn--ghost"
                      :disabled="!cutoutHasPendingStrokes || cutoutApplyingMask || saving"
                      @click="undoBrushStroke"
                    >
                      撤销一笔
                    </button>
                    <button
                      type="button"
                      class="editor-btn editor-btn--ghost"
                      :disabled="cutoutApplyingMask || saving"
                      @click="resetBrushStrokes"
                    >
                      重置画笔
                    </button>
                  </div>
                </div>

                <div v-if="cutoutLoading" class="editor-progress">
                  <div class="editor-progress__head">
                    <span>{{ cutoutLoadingText }}</span>
                    <strong>{{ cutoutProgress }}%</strong>
                  </div>
                  <div class="editor-progress__track">
                    <div class="editor-progress__fill" :style="{ width: `${cutoutProgress}%` }" />
                  </div>
                </div>
              </section>

              <section v-show="activeTab === 'export'" class="editor-panel">
                <div class="editor-group">
                  <p class="editor-group-title">导出设置</p>

                  <div class="editor-export-preview">
                    <div class="editor-export-preview__stage">
                      <img
                        v-if="previewUrl"
                        :src="previewUrl"
                        alt="白底导出预览"
                        class="editor-export-preview__image"
                        :style="whiteBgPreviewImageStyle"
                      />
                    </div>
                    <p class="editor-hint">
                      {{ whiteBgEnabled ? '拖动滑杆可实时预览白底上的主体大小' : '关闭白底时将保留透明底导出' }}
                    </p>
                  </div>

                  <label class="editor-toggle">
                    <div class="editor-toggle__info">
                      <strong>自动补白底</strong>
                      <span>适合证件照、商品图上传</span>
                    </div>
                    <input v-model="whiteBgEnabled" type="checkbox" class="editor-toggle__input" />
                    <span class="editor-toggle__track" aria-hidden="true">
                      <span class="editor-toggle__thumb" />
                    </span>
                  </label>

                  <label v-if="whiteBgEnabled" class="editor-field">
                    <span class="editor-field__label">白底风格</span>
                    <AppSelect
                      v-model="whiteBgStyle"
                      :options="WHITE_BG_STYLE_OPTIONS"
                      placeholder="选择导出风格"
                    />
                  </label>

                  <label v-if="whiteBgEnabled" class="editor-slider">
                    <div class="editor-slider__head">
                      <span>白底主体占比</span>
                      <strong>{{ whiteBgScalePercent }}%</strong>
                    </div>
                    <input v-model.number="whiteBgScalePercent" type="range" min="40" max="100" step="1" />
                  </label>

                  <p class="editor-hint">保存时自动压缩到 1MB 以内</p>
                </div>
              </section>

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
              取消
            </button>
            <button type="button" class="editor-btn editor-btn--primary" :disabled="saving" @click="handleSave">
              {{ saving ? `保存中 ${saveProgress}%` : '保存并替换原图' }}
            </button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import Cropper from 'cropperjs'
import 'cropperjs/dist/cropper.css'
import { Canvas, PencilBrush } from 'fabric'
import AppSelect from '@/components/common/AppSelect.vue'
import { useEditorHistory } from '@/composables/image/useEditorHistory'
import { useImageCutout } from '@/composables/image/useImageCutout'
import { useImageExport } from '@/composables/image/useImageExport'

const props = defineProps({
  show: { type: Boolean, default: false },
  sourceFile: { type: Object, default: null }
})

const emit = defineEmits(['update:show', 'save'])

const imageRef = ref(null)
const previewRef = ref(null)
const brushHostRef = ref(null)
const activeTab = ref('basic')
const cutoutLoading = ref(false)
const cutoutLoadingText = ref('抠图处理中...')
const cutoutProgress = ref(0)
const saving = ref(false)
const saveProgress = ref(0)
const saveProgressText = ref('保存处理中...')
const whiteBgEnabled = ref(true)
const whiteBgStyle = ref('standard')
const whiteBgScalePercent = ref(88)
const brightness = ref(0)
const contrast = ref(0)
const errorText = ref('')
const cutoutBrushMode = ref('')
const cutoutBrushSize = ref(28)
const cutoutHasPendingStrokes = ref(false)
const cutoutApplyingMask = ref(false)
const cutoutPreparedImageUrl = ref('')
const cutoutMaskUrl = ref('')
const {
  applyCutoutMask,
  createCutoutMask,
  isCutoutModelReady
} = useImageCutout()
const { exportForUpload } = useImageExport()

const WHITE_BG_STYLE_OPTIONS = [
  { label: '标准白底', value: 'standard' },
  { label: '商品图增强', value: 'product' }
]

const tabOptions = [
  { value: 'basic', label: '基础调整' },
  { value: 'cutout', label: '智能抠图' },
  { value: 'export', label: '导出设置' }
]

const editorHistory = useEditorHistory()
const { canUndo, canRedo } = editorHistory

const brushModeActive = computed(() => !!cutoutPreparedImageUrl.value && !!cutoutMaskUrl.value)
const brushDrawingActive = computed(() => brushModeActive.value && !!cutoutBrushMode.value)
const brushEntryDisabled = true
const previewRenderBox = ref({ left: 0, top: 0, width: 0, height: 0 })
const previewOverlayStyle = computed(() => ({
  left: `${previewRenderBox.value.left}px`,
  top: `${previewRenderBox.value.top}px`,
  width: `${previewRenderBox.value.width}px`,
  height: `${previewRenderBox.value.height}px`
}))
const whiteBgPreviewImageStyle = computed(() => ({
  transform: whiteBgEnabled.value ? `scale(${Math.max(0.4, Number(whiteBgScalePercent.value || 88) / 100)})` : 'scale(1)'
}))

let cropper = null
let brushCanvas = null
const maskPreviewRef = ref(null)
const previewUrl = ref('')
let flipX = 1
let previousHtmlOverflow = ''
let previousHtmlOverscrollBehavior = ''
let previousBodyOverflow = ''
let previousBodyOverscrollBehavior = ''
let cutoutPreparedBlob = null
let cutoutCurrentMaskBlob = null
let cutoutOriginalMaskBlob = null
const cutoutInputImageUrl = ref('')
let cutoutMeta = null
let editorSessionId = 0
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
  cutoutPreparedBlob = null
  cutoutCurrentMaskBlob = null
  cutoutOriginalMaskBlob = null
  cutoutMeta = null
  cutoutBrushMode.value = ''
  cutoutBrushSize.value = 28
  cutoutHasPendingStrokes.value = false
  destroyBrushCanvas()
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

function destroyBrushCanvas() {
  if (brushCanvas) {
    brushCanvas.dispose()
    brushCanvas = null
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
    throw new Error('读取历史图片失败')
  }

  return await response.blob()
}

function buildEditorSnapshot() {
  const cropData = cropper?.getData?.(true) || null
  return {
    brightness: Number(brightness.value) || 0,
    contrast: Number(contrast.value) || 0,
    flipX: Number(flipX) || 1,
    cropData: cropData ? { ...cropData } : null,
    rotation: Number(cropData?.rotate) || 0,
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
    saveProgressText.value = '保存处理中...'

    brightness.value = Number(snapshot.brightness) || 0
    contrast.value = Number(snapshot.contrast) || 0
    flipX = Number(snapshot.flipX) || 1

    if (snapshot.hasCutout) {
      destroyCropper()
      clearCutoutSession()
      previewUrl.value = snapshot.cutoutPreviewUrl || ''
      cutoutPreparedImageUrl.value = snapshot.cutoutPreparedImageUrl || ''
      cutoutMaskUrl.value = snapshot.cutoutMaskUrl || ''
      cutoutInputImageUrl.value = snapshot.cutoutPreparedImageUrl || snapshot.cutoutPreviewUrl || ''
      cutoutMeta = snapshot.cutoutMeta ? { ...snapshot.cutoutMeta } : null
      cutoutPreparedBlob = await readBlobFromObjectUrl(cutoutPreparedImageUrl.value)
      cutoutCurrentMaskBlob = await readBlobFromObjectUrl(cutoutMaskUrl.value)
      cutoutOriginalMaskBlob = cutoutCurrentMaskBlob
      cutoutBrushMode.value = ''
      cutoutBrushSize.value = 28
      cutoutHasPendingStrokes.value = false
      destroyBrushCanvas()
      await nextTick()
      if (cutoutBrushMode.value) {
        drawMaskPreview()
        syncBrushViewport()
      }
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

async function initCropper() {
  await nextTick()
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
    cropend: () => {
      recordEditorHistory()
    },
    ready: () => {
      cropper?.setDragMode('move')
    }
  })
  applyPreviewFilter()
}

function initBrushCanvas() {
  if (!brushHostRef.value || !cutoutPreparedBlob) return

  destroyBrushCanvas()

  const canvasEl = document.createElement('canvas')
  brushHostRef.value.innerHTML = ''
  brushHostRef.value.appendChild(canvasEl)

  brushCanvas = new Canvas(canvasEl, {
    isDrawingMode: true,
    selection: false
  })

  loadImageFromBlob(cutoutPreparedBlob).then((img) => {
    const w = img.naturalWidth || img.width || 1
    const h = img.naturalHeight || img.height || 1

    updatePreviewRenderBox()
    const box = previewRenderBox.value
    brushCanvas.setDimensions({
      width: box.width || w,
      height: box.height || h
    })
    brushCanvas.requestRenderAll()

    brushCanvas.on('path:created', () => {
      cutoutHasPendingStrokes.value = true
    })
    syncBrushStyle()
  })
}

function updatePreviewRenderBox() {
  const container = previewRef.value
  const image = imageRef.value
  if (!container || !image) return

  const containerWidth = container.clientWidth
  const containerHeight = container.clientHeight
  if (!containerWidth || !containerHeight) return

  const sourceWidth = image.naturalWidth || image.width || 1
  const sourceHeight = image.naturalHeight || image.height || 1
  const scale = Math.min(containerWidth / sourceWidth, containerHeight / sourceHeight)

  const width = Math.max(1, Math.round(sourceWidth * scale))
  const height = Math.max(1, Math.round(sourceHeight * scale))
  const left = Math.round((containerWidth - width) / 2)
  const top = Math.round((containerHeight - height) / 2)

  previewRenderBox.value = { left, top, width, height }
}

function syncBrushViewport() {
  if (!brushCanvas) return
  const box = previewRenderBox.value
  if (!box.width || !box.height) return

  brushCanvas.setViewportTransform([1, 0, 0, 1, 0, 0])
  brushCanvas.setDimensions({
    width: box.width,
    height: box.height
  })
  brushCanvas.requestRenderAll()
}

function createBrushCursor(size, color) {
  const diameter = Math.max(8, Math.round(Number(size) || 24))
  const radius = Math.max(3, Math.round(diameter / 2) - 1)
  const svgSize = diameter + 4
  const center = svgSize / 2
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgSize}" height="${svgSize}" viewBox="0 0 ${svgSize} ${svgSize}"><circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="${color}" stroke-width="2"/></svg>`
  const encoded = encodeURIComponent(svg)
  return `url("data:image/svg+xml,${encoded}") ${Math.round(center)} ${Math.round(center)}, crosshair`
}

function syncBrushStyle() {
  if (!brushCanvas) return
  if (!brushCanvas.freeDrawingBrush || !(brushCanvas.freeDrawingBrush instanceof PencilBrush)) {
    brushCanvas.freeDrawingBrush = new PencilBrush(brushCanvas)
  }
  const brushSize = Math.max(4, Number(cutoutBrushSize.value) || 24)
  const brushColor = cutoutBrushMode.value === 'keep'
    ? 'rgba(34, 197, 94, 0.5)'
    : 'rgba(239, 68, 68, 0.5)'

  brushCanvas.freeDrawingBrush.width = brushSize
  brushCanvas.freeDrawingBrush.color = brushColor
  brushCanvas.freeDrawingBrush.strokeLineCap = 'round'
  brushCanvas.freeDrawingBrush.strokeLineJoin = 'round'
  brushCanvas.freeDrawingBrush.decimate = 0.2
  brushCanvas.freeDrawingCursor = createBrushCursor(brushSize, brushColor)
}

function drawMaskPreview() {
  const canvas = maskPreviewRef.value
  if (!canvas || !cutoutMaskUrl.value) return

  updatePreviewRenderBox()
  const box = previewRenderBox.value
  if (!box.width || !box.height) return

  canvas.width = box.width
  canvas.height = box.height

  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  const paintMaskLayer = () => {
    const maskImg = new Image()
    maskImg.onload = () => {
      ctx.drawImage(maskImg, 0, 0, canvas.width, canvas.height)
      ctx.globalCompositeOperation = 'source-in'
      ctx.fillStyle = cutoutBrushMode.value === 'keep'
        ? 'rgba(34, 197, 94, 0.45)'
        : 'rgba(239, 68, 68, 0.45)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.globalCompositeOperation = 'source-over'
    }
    maskImg.src = cutoutMaskUrl.value
  }

  if (cutoutInputImageUrl.value) {
    const sourceImg = new Image()
    sourceImg.onload = () => {
      ctx.save()
      ctx.globalAlpha = 0.2
      ctx.drawImage(sourceImg, 0, 0, canvas.width, canvas.height)
      ctx.restore()
      paintMaskLayer()
    }
    sourceImg.src = cutoutInputImageUrl.value
    return
  }

  paintMaskLayer()
}

function loadImageFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图片加载失败'))
    }
    img.src = url
  })
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    if (!url) {
      reject(new Error('图片地址不能为空'))
      return
    }
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('图片加载失败'))
    image.src = url
  })
}

function createCanvas(width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  return canvas
}

function canvasToBlob(canvas, type = 'image/png', quality = 1) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('导出蒙版失败'))
        return
      }
      resolve(blob)
    }, type, quality)
  })
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
  brightness.value = 0
  contrast.value = 0
  cutoutLoading.value = false
  cutoutApplyingMask.value = false
  cutoutProgress.value = 0
  saveProgress.value = 0
  saveProgressText.value = '保存处理中...'
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
        throw new Error('读取当前预览图失败')
      }
      return await response.blob()
    }
    if (!props.sourceFile) throw new Error('未找到可编辑图片')
    return props.sourceFile
  }

  const croppedCanvas = cropper.getCroppedCanvas({
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high'
  })

  return new Promise((resolve, reject) => {
    croppedCanvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('生成编辑图失败'))
        return
      }
      resolve(blob)
    }, 'image/png', 1)
  })
}

function rotateLeft() {
  cropper?.rotate(-90)
  recordEditorHistory()
}

function rotateRight() {
  cropper?.rotate(90)
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
  applyPreviewFilter()
  recordEditorHistory()
}

function applyPreviewFilter() {
  if (!cropper?.container) return
  const brightnessPercent = 100 + (Number(brightness.value) || 0)
  const contrastPercent = 100 + (Number(contrast.value) || 0)
  cropper.container.style.filter = `brightness(${brightnessPercent}%) contrast(${contrastPercent}%)`
}

async function runCutout() {
  if (cutoutLoading.value) return
  cutoutLoading.value = true
  cutoutProgress.value = 5
  cutoutLoadingText.value = !isCutoutModelReady()
    ? '模型准备中，请稍候...'
    : '抠图处理中...'
  errorText.value = ''

  try {
    const inputBlob = await getCurrentBlob()
    cutoutInputImageUrl.value = createTrackedObjectUrl(inputBlob)
    const { preparedBlob, maskBlob, meta } = await createCutoutMask(inputBlob, {
      onProgress: ({ percent, text }) => {
        cutoutProgress.value = Number(percent) || 0
        if (text) {
          cutoutLoadingText.value = text
        }
      }
    })
    const cutoutBlob = await applyCutoutMask(preparedBlob, maskBlob, meta)

    clearCutoutSession()
    cutoutPreparedBlob = preparedBlob
    cutoutCurrentMaskBlob = maskBlob
    cutoutOriginalMaskBlob = maskBlob
    cutoutMeta = meta
    cutoutPreparedImageUrl.value = createTrackedObjectUrl(preparedBlob)
    cutoutMaskUrl.value = createTrackedObjectUrl(maskBlob)

    destroyCropper()
    previewUrl.value = createTrackedObjectUrl(cutoutBlob)
    recordEditorHistory()
  } catch (error) {
    errorText.value = error?.message || '抠图失败，请重试'
  } finally {
    cutoutLoading.value = false
    cutoutProgress.value = 0
    cutoutLoadingText.value = '抠图处理中...'
  }
}

function undoBrushStroke() {
  if (!brushCanvas) return
  const objects = brushCanvas.getObjects()
  const last = objects[objects.length - 1]
  if (!last) return
  brushCanvas.remove(last)
  brushCanvas.requestRenderAll()
  cutoutHasPendingStrokes.value = brushCanvas.getObjects().length > 0
}

function resetBrushStrokes() {
  if (!brushCanvas) return
  const objects = brushCanvas.getObjects()
  objects.forEach((item) => brushCanvas.remove(item))
  brushCanvas.requestRenderAll()
  cutoutHasPendingStrokes.value = false
}

async function applyMaskEdits() {
  if (cutoutApplyingMask.value || !cutoutPreparedBlob || !cutoutMeta) return
  cutoutApplyingMask.value = true
  errorText.value = ''

  try {
    if (!brushCanvas || brushCanvas.getObjects().length === 0) return
    const applyMode = cutoutBrushMode.value === 'erase' ? 'erase' : 'keep'

    const strokeDataUrl = brushCanvas.toDataURL({
      format: 'png',
      multiplier: 1,
      enableRetinaScaling: false,
      withoutTransform: false
    })

    const strokeImg = await loadImage(strokeDataUrl)
    const maskCanvas = createCanvas(cutoutPreparedBlob ? cutoutMeta.sourceWidth || cutoutMeta.contentWidth : 1, 1)

    const tempImg = await loadImageFromBlob(cutoutPreparedBlob)
    maskCanvas.width = tempImg.naturalWidth || tempImg.width
    maskCanvas.height = tempImg.naturalHeight || tempImg.height

    const mergedCanvas = createCanvas(maskCanvas.width, maskCanvas.height)
    const mergedCtx = mergedCanvas.getContext('2d', { willReadFrequently: true })

    const origMaskImg = await loadImageFromBlob(cutoutCurrentMaskBlob)
    mergedCtx.drawImage(origMaskImg, 0, 0, mergedCanvas.width, mergedCanvas.height)

    const strokeCanvas = createCanvas(mergedCanvas.width, mergedCanvas.height)
    const strokeCtx = strokeCanvas.getContext('2d', { willReadFrequently: true })
    strokeCtx.drawImage(strokeImg, 0, 0, strokeCanvas.width, strokeCanvas.height)

    const mergedImage = mergedCtx.getImageData(0, 0, mergedCanvas.width, mergedCanvas.height)
    const strokeImage = strokeCtx.getImageData(0, 0, strokeCanvas.width, strokeCanvas.height)
    const mergedData = mergedImage.data
    const strokeData = strokeImage.data

    for (let index = 0; index < strokeData.length; index += 4) {
      const strokeAlpha = strokeData[index + 3] / 255
      if (strokeAlpha <= 0.001) continue

      if (applyMode === 'erase') {
        const nextAlpha = Math.max(0, 1 - strokeAlpha * 1.65)
        mergedData[index] = Math.round(mergedData[index] * nextAlpha)
        mergedData[index + 1] = Math.round(mergedData[index + 1] * nextAlpha)
        mergedData[index + 2] = Math.round(mergedData[index + 2] * nextAlpha)
        mergedData[index + 3] = Math.round(mergedData[index + 3] * nextAlpha)
        continue
      }

      const boost = Math.min(1, strokeAlpha * 1.35)
      mergedData[index] = Math.round(mergedData[index] + (255 - mergedData[index]) * boost)
      mergedData[index + 1] = Math.round(mergedData[index + 1] + (255 - mergedData[index + 1]) * boost)
      mergedData[index + 2] = Math.round(mergedData[index + 2] + (255 - mergedData[index + 2]) * boost)
      mergedData[index + 3] = Math.round(mergedData[index + 3] + (255 - mergedData[index + 3]) * boost)
    }

    mergedCtx.putImageData(mergedImage, 0, 0)
    cutoutCurrentMaskBlob = await canvasToBlob(mergedCanvas, 'image/png', 1)

    const cutoutBlob = await applyCutoutMask(cutoutPreparedBlob, cutoutCurrentMaskBlob, cutoutMeta)
    previewUrl.value = createTrackedObjectUrl(cutoutBlob)

    resetBrushStrokes()
    recordEditorHistory()
  } catch (error) {
    errorText.value = error?.message || '应用画笔失败，请重试'
  } finally {
    cutoutApplyingMask.value = false
    cutoutHasPendingStrokes.value = false
  }
}

async function handleSave() {
  if (saving.value) return
  saving.value = true
  saveProgress.value = 5
  saveProgressText.value = '准备导出...'
  errorText.value = ''

  try {
    if (brushModeActive.value && cutoutHasPendingStrokes.value) {
      await applyMaskEdits()
    }
    const sourceBlob = await getCurrentBlob()
    const exported = await exportForUpload(sourceBlob, {
      targetMaxBytes: 1024 * 1024,
      applyWhiteBg: whiteBgEnabled.value,
      whiteBgStyle: whiteBgStyle.value,
      whiteBgFitRatio: whiteBgScalePercent.value / 100,
      bgColor: '#ffffff',
      brightness: brightness.value,
      contrast: contrast.value,
      onProgress: ({ percent, text }) => {
        saveProgress.value = Number(percent) || 0
        if (text) {
          saveProgressText.value = text
        }
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
    errorText.value = error?.message || '保存失败，请重试'
  } finally {
    saving.value = false
    saveProgress.value = 0
    saveProgressText.value = '保存处理中...'
  }
}

function handleCancel() {
  emit('update:show', false)
}

function formatSignedValue(value) {
  const number = Number(value) || 0
  return number > 0 ? `+${number}` : `${number}`
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

watch(
  () => props.show,
  (visible) => {
    setPageScrollLock(visible)

    if (!visible) {
      editorSessionId += 1
      window.removeEventListener('resize', handlePreviewResize)
      destroyCropper()
      clearCutoutSession()
      releaseEditorSessionUrls()
      editorHistory.reset()
      editorStateSignature = ''
      previewUrl.value = ''
      return
    }

    window.addEventListener('resize', handlePreviewResize)
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

watch([brightness, contrast], () => {
  applyPreviewFilter()
})

watch(
  () => previewUrl.value,
  () => {
    nextTick(() => {
      updatePreviewRenderBox()
      if (cutoutBrushMode.value) {
        drawMaskPreview()
        syncBrushViewport()
      }
    })
  }
)

watch([cutoutBrushMode, cutoutBrushSize], ([mode, size], [oldMode]) => {
  if (mode && oldMode && mode !== oldMode && cutoutHasPendingStrokes.value) {
    resetBrushStrokes()
  }

  if (mode && !brushCanvas) {
    nextTick(() => {
      initBrushCanvas()
    })
  } else {
    syncBrushStyle()
    syncBrushViewport()
  }

  if (mode && maskPreviewRef.value) {
    nextTick(() => setTimeout(() => drawMaskPreview(), 100))
  }
})

function handlePreviewResize() {
  updatePreviewRenderBox()
  if (!cutoutBrushMode.value) return
  drawMaskPreview()
  syncBrushViewport()
}

onBeforeUnmount(() => {
  window.removeEventListener('resize', handlePreviewResize)
  setPageScrollLock(false)
  destroyCropper()
  clearCutoutSession()
  releaseEditorSessionUrls()
  editorHistory.reset()
  editorStateSignature = ''
  previewUrl.value = ''
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

.editor-preview--white {
  background: #ffffff;
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

.editor-preview :deep(.cropper-bg) {
  background-image: none;
  background-color: #ffffff;
}

.editor-preview :deep(.cropper-canvas),
.editor-preview :deep(.cropper-wrap-box),
.editor-preview :deep(.cropper-drag-box) {
  background-color: #ffffff;
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

.editor-mask-preview {
  position: absolute;
  z-index: 5;
  pointer-events: none;
}

.editor-brush-layer {
  position: absolute;
  z-index: 10;
}

.editor-mask-preview,
.editor-brush-layer {
  max-width: 100%;
  max-height: 100%;
}

.editor-brush-layer :deep(canvas) {
  display: block;
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

.editor-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.editor-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  background: var(--app-surface-soft);
  border-radius: var(--radius-card, 18px);
}

.editor-group-title {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--app-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.editor-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.editor-history-bar {
  margin-top: -2px;
}

.editor-history-btn {
  min-height: 38px;
}

.editor-btn {
  flex: 1 1 auto;
  min-height: 42px;
  padding: 0 14px;
  border: none;
  border-radius: var(--radius-small, 14px);
  background: var(--app-surface);
  color: var(--app-text);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  transition: transform var(--motion-fast, 200ms) ease, opacity var(--motion-fast, 200ms) ease;
}

.editor-btn--primary {
  background: var(--app-text);
  color: var(--app-bg);
}

.editor-btn--ghost {
  background: transparent;
  color: var(--app-text-secondary);
}

.editor-btn:active {
  transform: scale(var(--press-scale-button, 0.96));
}

.editor-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.editor-slider {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.editor-slider__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: var(--app-text-secondary);
}

.editor-slider__head strong {
  font-size: 14px;
  color: var(--app-text);
}

.editor-slider input {
  width: 100%;
  accent-color: var(--app-text);
}

.editor-chips {
  display: flex;
  gap: 8px;
}

.editor-chip {
  height: 36px;
  padding: 0 16px;
  border: none;
  border-radius: 999px;
  background: var(--app-surface);
  color: var(--app-text-secondary);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
}

.editor-chip--active {
  background: var(--app-text);
  color: var(--app-bg);
}

.editor-chip:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.editor-toggle {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--app-surface);
  border-radius: var(--radius-card, 18px);
}

.editor-toggle__info {
  flex: 1;
  min-width: 0;
}

.editor-toggle__info strong {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: var(--app-text);
}

.editor-toggle__info span {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  color: var(--app-text-secondary);
}

.editor-toggle__input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.editor-toggle__track {
  position: relative;
  display: inline-flex;
  align-items: center;
  width: 48px;
  height: 28px;
  padding: 3px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.1);
  flex-shrink: 0;
}

.editor-toggle__thumb {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
  transition: transform var(--motion-fast, 200ms) var(--motion-emphasis, cubic-bezier(0.22, 1, 0.36, 1));
}

.editor-toggle__input:checked + .editor-toggle__track {
  background: var(--app-text);
}

.editor-toggle__input:checked + .editor-toggle__track .editor-toggle__thumb {
  transform: translateX(20px);
}

.editor-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.editor-field__label {
  font-size: 13px;
  font-weight: 600;
  color: var(--app-text-secondary);
}

.editor-export-preview {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.editor-export-preview__stage {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 180px;
  padding: 16px;
  border-radius: 16px;
  background: #ffffff;
  box-shadow: inset 0 0 0 1px rgba(20, 20, 22, 0.08);
  overflow: hidden;
}

.editor-export-preview__image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  transform-origin: center center;
  transition: transform 160ms ease;
}

.editor-hint {
  margin: 0;
  font-size: 12px;
  color: var(--app-text-tertiary);
  line-height: 1.5;
}

.editor-progress {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: var(--app-surface-soft);
  border-radius: var(--radius-card, 18px);
}

.editor-progress__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: var(--app-text-secondary);
}

.editor-progress__head strong {
  font-size: 14px;
  color: var(--app-text);
}

.editor-progress__track {
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.06);
}

.editor-progress__fill {
  height: 100%;
  width: 0;
  border-radius: inherit;
  background: var(--app-text);
  transition: width 0.15s ease;
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

/* Transitions */
.editor-fade-enter-active,
.editor-fade-leave-active {
  transition: opacity 0.2s ease;
}

.editor-fade-enter-active .editor-dialog,
.editor-fade-leave-active .editor-dialog {
  transition: transform 0.2s var(--motion-emphasis, cubic-bezier(0.22, 1, 0.36, 1)), opacity 0.2s ease;
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

/* Mobile */
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

/* Tablet */
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

/* Desktop */
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

/* Dark mode */
:global(html.theme-dark) .editor-dialog {
  box-shadow: 0 20px 48px rgba(0, 0, 0, 0.4);
}

:global(html.theme-dark) .editor-toggle__track {
  background: rgba(255, 255, 255, 0.12);
}

:global(html.theme-dark) .editor-progress__track {
  background: rgba(255, 255, 255, 0.08);
}
</style>
