<template>
  <Teleport to="body">
    <Transition name="overlay-fade">
      <div v-if="show" class="quick-editor-mask" @click.self="handleCancel" @wheel.stop @touchmove.stop>
        <div class="quick-editor-card" role="dialog" aria-modal="true" aria-label="快速编辑图片" @wheel.stop @touchmove.stop>
          <div class="quick-editor-handle" aria-hidden="true" />

          <header class="quick-editor-header">
            <div class="quick-editor-heading">
              <p class="quick-editor-kicker">Image Studio</p>
              <h3>快速编辑图片</h3>
              <p class="quick-editor-subtitle">裁切、旋转、抠图和导出设置集中在这里完成。</p>
            </div>
            <button type="button" class="quick-editor-close" @click="handleCancel">关闭</button>
          </header>

          <div class="quick-editor-meta">
            <span v-if="sourceFileLabel" class="quick-editor-meta-pill quick-editor-meta-pill--strong">
              {{ sourceFileLabel }}
            </span>
            <span class="quick-editor-meta-pill">{{ activeTabMeta.label }}</span>
            <span class="quick-editor-meta-pill">{{ activeTabMeta.hint }}</span>
          </div>

          <div class="quick-editor-workbench">
            <section class="quick-editor-preview-shell">
              <div class="quick-editor-preview-head">
                <div>
                  <p class="quick-editor-section-kicker">实时预览</p>
                  <p class="quick-editor-section-title">{{ activeTabMeta.previewTitle }}</p>
                </div>
                <span class="quick-editor-preview-tip">{{ activeTabMeta.previewHint }}</span>
              </div>

              <div class="quick-editor-preview" @touchmove.stop.prevent @wheel.stop.prevent>
                <img ref="imageRef" :src="previewUrl" alt="编辑预览" class="quick-editor-image" />
              </div>
            </section>

            <aside class="quick-editor-sidebar">
              <div class="quick-editor-tabs" role="tablist" aria-label="图片编辑功能">
                <button
                  v-for="tab in tabOptions"
                  :key="tab.value"
                  type="button"
                  :class="['quick-editor-tab', activeTab === tab.value && 'quick-editor-tab--active']"
                  :aria-selected="activeTab === tab.value"
                  @click="activeTab = tab.value"
                >
                  <span class="quick-editor-tab__label">{{ tab.label }}</span>
                  <span class="quick-editor-tab__hint">{{ tab.hint }}</span>
                </button>
              </div>

              <div class="quick-editor-sidebar-scroll">
                <section v-show="activeTab === 'basic'" class="quick-editor-panel">
                  <div class="quick-editor-section">
                    <div class="quick-editor-section-head">
                      <div>
                        <p class="quick-editor-section-kicker">基础操作</p>
                        <p class="quick-editor-section-title">先处理方向和镜像</p>
                      </div>
                      <span class="quick-editor-section-badge">裁切框始终保留</span>
                    </div>

                    <div class="quick-editor-tool-grid">
                      <button type="button" class="quick-editor-tool" :disabled="saving" @click="rotateLeft">
                        <strong>左转 90°</strong>
                        <span>适合把横图快速转正</span>
                      </button>
                      <button type="button" class="quick-editor-tool" :disabled="saving" @click="rotateRight">
                        <strong>右转 90°</strong>
                        <span>切换到另一侧方向</span>
                      </button>
                      <button type="button" class="quick-editor-tool" :disabled="saving" @click="flipHorizontal">
                        <strong>水平镜像</strong>
                        <span>修正自拍或反向素材</span>
                      </button>
                      <button type="button" class="quick-editor-tool" :disabled="saving" @click="resetCropper">
                        <strong>重置编辑</strong>
                        <span>恢复到刚打开时的状态</span>
                      </button>
                    </div>
                  </div>

                  <div class="quick-editor-section quick-editor-section--soft">
                    <div class="quick-editor-section-head">
                      <div>
                        <p class="quick-editor-section-kicker">画面校正</p>
                        <p class="quick-editor-section-title">细调亮度与对比度</p>
                      </div>
                    </div>

                    <label class="quick-editor-range">
                      <div class="quick-editor-range__head">
                        <span>亮度</span>
                        <strong>{{ formatSignedValue(brightness) }}</strong>
                      </div>
                      <input v-model.number="brightness" type="range" min="-60" max="60" step="1" />
                    </label>

                    <label class="quick-editor-range">
                      <div class="quick-editor-range__head">
                        <span>对比度</span>
                        <strong>{{ formatSignedValue(contrast) }}</strong>
                      </div>
                      <input v-model.number="contrast" type="range" min="-40" max="40" step="1" />
                    </label>
                  </div>
                </section>

                <section v-show="activeTab === 'cutout'" class="quick-editor-panel">
                  <div class="quick-editor-section">
                    <div class="quick-editor-section-head">
                      <div>
                        <p class="quick-editor-section-kicker">智能抠图</p>
                        <p class="quick-editor-section-title">移除背景，保留主体</p>
                      </div>
                      <span class="quick-editor-section-badge">适合商品主图</span>
                    </div>

                    <button
                      type="button"
                      class="quick-editor-cta"
                      :disabled="cutoutLoading || saving"
                      @click="runCutout"
                    >
                      {{ cutoutLoading ? cutoutLoadingText : '一键抠图（本地模型）' }}
                    </button>

                    <button
                      v-if="errorText"
                      type="button"
                      class="quick-editor-btn"
                      :disabled="cutoutLoading || saving"
                      @click="runCutout"
                    >
                      重新尝试
                    </button>

                    <div class="quick-editor-info-card">
                      <p>建议先在基础页裁掉多余边缘，再抠图，速度和结果都会更稳定。</p>
                    </div>
                  </div>

                  <div v-if="cutoutLoading" class="quick-editor-progress">
                    <div class="quick-editor-progress-head">
                      <span>{{ cutoutLoadingText }}</span>
                      <strong>{{ cutoutProgress }}%</strong>
                    </div>
                    <div class="quick-editor-progress-track">
                      <div class="quick-editor-progress-fill" :style="{ width: `${cutoutProgress}%` }" />
                    </div>
                  </div>

                  <p class="quick-editor-tip">抠图完成后可以到导出页开启白底，并继续压缩到 1MB 以内。</p>
                </section>

                <section v-show="activeTab === 'export'" class="quick-editor-panel">
                  <div class="quick-editor-section">
                    <div class="quick-editor-section-head">
                      <div>
                        <p class="quick-editor-section-kicker">导出设置</p>
                        <p class="quick-editor-section-title">生成更适合上传的图片</p>
                      </div>
                    </div>

                    <label class="quick-editor-switch">
                      <div class="quick-editor-switch__body">
                        <strong>自动补白底</strong>
                        <span>更适合证件照、商品图或平台上传场景。</span>
                      </div>
                      <input v-model="whiteBgEnabled" type="checkbox" class="quick-editor-switch__input" />
                      <span class="quick-editor-switch__track" aria-hidden="true">
                        <span class="quick-editor-switch__thumb" />
                      </span>
                    </label>

                    <div class="quick-editor-info-card quick-editor-info-card--soft">
                      <p>保存时会自动压缩到 1MB 以内；如果仍然超限，会继续缩小尺寸兜底。</p>
                    </div>
                  </div>
                </section>

                <p v-if="errorText" class="quick-editor-error">{{ errorText }}</p>

                <div v-if="saving" class="quick-editor-progress quick-editor-progress--save">
                  <div class="quick-editor-progress-head">
                    <span>{{ saveProgressText }}</span>
                    <strong>{{ saveProgress }}%</strong>
                  </div>
                  <div class="quick-editor-progress-track">
                    <div class="quick-editor-progress-fill" :style="{ width: `${saveProgress}%` }" />
                  </div>
                </div>
              </div>

              <footer class="quick-editor-footer">
                <button type="button" class="quick-editor-btn quick-editor-btn--ghost" :disabled="saving" @click="handleCancel">
                  取消
                </button>
                <button type="button" class="quick-editor-btn quick-editor-btn--primary" :disabled="saving" @click="handleSave">
                  {{ saving ? `保存中 ${saveProgress}%` : '保存并替换原图' }}
                </button>
              </footer>
            </aside>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import Cropper from 'cropperjs'
import 'cropperjs/dist/cropper.css'
import { useImageCutout } from '@/composables/useImageCutout'
import { useImageExport } from '@/composables/useImageExport'

const props = defineProps({
  show: { type: Boolean, default: false },
  sourceFile: { type: Object, default: null }
})

const emit = defineEmits(['update:show', 'save'])

const imageRef = ref(null)
const activeTab = ref('basic')
const cutoutLoading = ref(false)
const cutoutLoadingText = ref('抠图处理中...')
const cutoutProgress = ref(0)
const saving = ref(false)
const saveProgress = ref(0)
const saveProgressText = ref('保存处理中...')
const whiteBgEnabled = ref(true)
const brightness = ref(0)
const contrast = ref(0)
const errorText = ref('')
const { removeBackgroundWithTimeout, isCutoutModelReady } = useImageCutout()
const { exportForUpload } = useImageExport()

const tabOptions = [
  {
    value: 'basic',
    label: '基础调整',
    hint: '裁切、方向、亮度'
  },
  {
    value: 'cutout',
    label: '智能抠图',
    hint: '去背景、保留主体'
  },
  {
    value: 'export',
    label: '导出设置',
    hint: '白底、压缩、上传'
  }
]

const activeTabMeta = computed(() => {
  if (activeTab.value === 'cutout') {
    return {
      label: '智能抠图',
      hint: '背景去除',
      previewTitle: '观察主体边缘和留白',
      previewHint: '建议先裁切后抠图'
    }
  }

  if (activeTab.value === 'export') {
    return {
      label: '导出设置',
      hint: '上传优化',
      previewTitle: '确认导出前的最终观感',
      previewHint: '白底只在保存时生效'
    }
  }

  return {
    label: '基础调整',
    hint: '裁切与校正',
    previewTitle: '拖动图片调整裁切区域',
    previewHint: '滚轮已禁用，避免误缩放'
  }
})

const sourceFileLabel = computed(() => {
  const name = String(props.sourceFile?.name || '').trim()
  const size = Number(props.sourceFile?.size || 0)
  if (!name && !size) return ''
  if (!size) return name
  return `${name || '当前图片'} · ${formatFileSize(size)}`
})

let cropper = null
const previewUrl = ref('')
let flipX = 1
let previousHtmlOverflow = ''
let previousHtmlOverscrollBehavior = ''
let previousBodyOverflow = ''
let previousBodyOverscrollBehavior = ''

function destroyCropper() {
  if (cropper) {
    cropper.destroy()
    cropper = null
  }
}

function revokePreviewUrl() {
  if (previewUrl.value?.startsWith('blob:')) {
    URL.revokeObjectURL(previewUrl.value)
  }
  previewUrl.value = ''
}

function setPageScrollLock(locked) {
  if (typeof document === 'undefined') return

  const html = document.documentElement
  const body = document.body
  if (!html || !body) return

  if (locked) {
    previousHtmlOverflow = html.style.overflow
    previousHtmlOverscrollBehavior = html.style.overscrollBehavior
    previousBodyOverflow = body.style.overflow
    previousBodyOverscrollBehavior = body.style.overscrollBehavior

    html.style.overflow = 'hidden'
    html.style.overscrollBehavior = 'none'
    body.style.overflow = 'hidden'
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
    ready: () => {
      cropper?.setDragMode('move')
    }
  })
  applyPreviewFilter()
}

function openFromFile(file) {
  revokePreviewUrl()
  previewUrl.value = URL.createObjectURL(file)
  activeTab.value = 'basic'
  whiteBgEnabled.value = true
  brightness.value = 0
  contrast.value = 0
  cutoutProgress.value = 0
  saveProgress.value = 0
  saveProgressText.value = '保存处理中...'
  errorText.value = ''
  flipX = 1
  initCropper()
}

async function getCurrentBlob() {
  if (!cropper) {
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
}

function rotateRight() {
  cropper?.rotate(90)
}

function flipHorizontal() {
  if (!cropper) return
  flipX *= -1
  cropper.scaleX(flipX)
}

function resetCropper() {
  cropper?.reset()
  flipX = 1
  brightness.value = 0
  contrast.value = 0
  applyPreviewFilter()
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
    ? '首次抠图：模型下载中，请稍候...'
    : '抠图处理中...'
  errorText.value = ''

  try {
    const inputBlob = await getCurrentBlob()
    const cutoutBlob = await removeBackgroundWithTimeout(inputBlob, {
      onProgress: ({ percent, text }) => {
        cutoutProgress.value = Number(percent) || 0
        if (text) {
          cutoutLoadingText.value = text
        }
      }
    })
    revokePreviewUrl()
    previewUrl.value = URL.createObjectURL(cutoutBlob)
    await initCropper()
  } catch (error) {
    errorText.value = error?.message || '抠图失败，请重试'
  } finally {
    cutoutLoading.value = false
    cutoutProgress.value = 0
    cutoutLoadingText.value = '抠图处理中...'
  }
}

async function handleSave() {
  if (saving.value) return
  saving.value = true
  saveProgress.value = 5
  saveProgressText.value = '准备导出...'
  errorText.value = ''

  try {
    const sourceBlob = await getCurrentBlob()
    const exported = await exportForUpload(sourceBlob, {
      targetMaxBytes: 1024 * 1024,
      applyWhiteBg: whiteBgEnabled.value,
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
      previewUrl: URL.createObjectURL(exported.file)
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
      destroyCropper()
      return
    }

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

onBeforeUnmount(() => {
  setPageScrollLock(false)
  destroyCropper()
  revokePreviewUrl()
})
</script>

<style scoped>
.quick-editor-mask {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  overflow-y: auto;
  background: var(--app-overlay, rgba(20, 20, 22, 0.22));
  backdrop-filter: blur(var(--app-overlay-blur, 8px)) saturate(var(--app-overlay-saturate, 120%));
  -webkit-backdrop-filter: blur(var(--app-overlay-blur, 8px)) saturate(var(--app-overlay-saturate, 120%));
  overscroll-behavior: contain;
}

.quick-editor-card {
  width: min(100%, 620px);
  max-height: min(92vh, 920px);
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  overflow-y: auto;
  border: 1px solid var(--app-glass-border, rgba(255, 255, 255, 0.52));
  border-radius: 28px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--app-surface) 92%, transparent) 0%, color-mix(in srgb, var(--app-surface) 98%, transparent) 100%);
  box-shadow: 0 24px 60px rgba(17, 20, 22, 0.16);
  overscroll-behavior: contain;
  scrollbar-width: none;
}

.quick-editor-card::-webkit-scrollbar {
  display: none;
}

.quick-editor-handle {
  display: none;
  width: 38px;
  height: 4px;
  margin: 0 auto 2px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-text-tertiary) 34%, transparent);
}

.quick-editor-header,
.quick-editor-section-head,
.quick-editor-preview-head,
.quick-editor-progress-head,
.quick-editor-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.quick-editor-heading {
  min-width: 0;
}

.quick-editor-kicker,
.quick-editor-section-kicker {
  margin: 0;
  color: var(--app-text-tertiary);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.quick-editor-header h3,
.quick-editor-section-title {
  margin: 0;
  color: var(--app-text);
}

.quick-editor-header h3 {
  margin-top: 6px;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.04em;
}

.quick-editor-subtitle {
  margin: 8px 0 0;
  color: var(--app-text-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.quick-editor-section-title {
  margin-top: 4px;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.4;
}

.quick-editor-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.quick-editor-meta-pill,
.quick-editor-section-badge,
.quick-editor-preview-tip {
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  line-height: 28px;
}

.quick-editor-meta-pill {
  background: color-mix(in srgb, var(--app-surface-soft) 78%, var(--app-surface));
  color: var(--app-text-secondary);
}

.quick-editor-meta-pill--strong {
  background: color-mix(in srgb, var(--app-text) 8%, var(--app-surface));
  color: var(--app-text);
}

.quick-editor-section-badge,
.quick-editor-preview-tip {
  background: color-mix(in srgb, var(--app-text) 6%, transparent);
  color: var(--app-text-secondary);
  white-space: nowrap;
}

.quick-editor-close,
.quick-editor-btn,
.quick-editor-tab,
.quick-editor-tool,
.quick-editor-cta {
  border: none;
  font: inherit;
  transition:
    transform var(--motion-fast, 200ms) var(--motion-emphasis, cubic-bezier(0.22, 1, 0.36, 1)),
    background var(--motion-fast, 200ms) ease,
    color var(--motion-fast, 200ms) ease,
    opacity var(--motion-fast, 200ms) ease,
    box-shadow var(--motion-fast, 200ms) ease;
}

.quick-editor-close,
.quick-editor-btn {
  min-height: 42px;
  padding: 0 16px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--app-surface-soft) 80%, var(--app-surface));
  color: var(--app-text);
  font-size: 14px;
  font-weight: 600;
}

.quick-editor-btn--ghost {
  color: var(--app-text-secondary);
}

.quick-editor-btn--primary {
  background: var(--app-text);
  color: var(--app-bg);
  box-shadow: 0 12px 24px color-mix(in srgb, var(--app-text) 20%, transparent);
}

.quick-editor-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  padding: 8px;
  border-radius: 18px;
  background: color-mix(in srgb, var(--app-surface-soft) 88%, var(--app-surface));
}

.quick-editor-tab {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  min-height: 64px;
  padding: 12px 14px;
  border-radius: 14px;
  background: transparent;
  color: var(--app-text-secondary);
  text-align: left;
}

.quick-editor-tab__label {
  color: inherit;
  font-size: 14px;
  font-weight: 700;
}

.quick-editor-tab__hint {
  font-size: 11px;
  line-height: 1.4;
  color: var(--app-text-tertiary);
}

.quick-editor-tab--active {
  background: var(--app-surface);
  color: var(--app-text);
  box-shadow: 0 10px 20px rgba(17, 20, 22, 0.08);
}

.quick-editor-tab--active .quick-editor-tab__hint {
  color: var(--app-text-secondary);
}

.quick-editor-workbench {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 14px;
  min-height: 0;
}

.quick-editor-preview-shell {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border-radius: 22px;
  background: color-mix(in srgb, var(--app-surface-soft) 82%, var(--app-surface));
}

.quick-editor-preview {
  position: relative;
  height: clamp(260px, 42vh, 420px);
  min-height: 260px;
  border-radius: 18px;
  overflow: hidden;
  background:
    linear-gradient(45deg, rgba(255, 255, 255, 0.58) 25%, transparent 25%, transparent 75%, rgba(255, 255, 255, 0.58) 75%, rgba(255, 255, 255, 0.58)),
    linear-gradient(45deg, rgba(20, 20, 22, 0.04) 25%, transparent 25%, transparent 75%, rgba(20, 20, 22, 0.04) 75%, rgba(20, 20, 22, 0.04));
  background-size: 24px 24px;
  background-position: 0 0, 12px 12px;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}

.quick-editor-image {
  display: block;
  max-width: 100%;
}

.quick-editor-preview :deep(.cropper-container),
.quick-editor-preview :deep(.cropper-wrap-box),
.quick-editor-preview :deep(.cropper-crop-box) {
  touch-action: none;
}

.quick-editor-preview :deep(.cropper-bg) {
  background-image: none;
  background-color: transparent;
}

.quick-editor-preview :deep(.cropper-view-box) {
  outline: 1px solid rgba(255, 255, 255, 0.92);
  box-shadow: 0 0 0 9999px rgba(20, 20, 22, 0.44);
}

.quick-editor-preview :deep(.cropper-line) {
  background-color: rgba(255, 255, 255, 0.75);
}

.quick-editor-preview :deep(.cropper-point) {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #ffffff;
  opacity: 1;
  box-shadow: 0 2px 8px rgba(17, 20, 22, 0.22);
}

.quick-editor-sidebar {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 12px;
  min-height: 0;
}

.quick-editor-sidebar-scroll {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  padding-right: 2px;
  padding-bottom: 6px;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}

.quick-editor-sidebar-scroll::-webkit-scrollbar {
  display: none;
}

.quick-editor-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 174px;
  contain: layout paint;
}

.quick-editor-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border-radius: 20px;
  background: var(--app-surface);
  box-shadow: inset 0 0 0 1px var(--app-border);
}

.quick-editor-section--soft {
  background: color-mix(in srgb, var(--app-surface-soft) 72%, var(--app-surface));
  box-shadow: none;
}

.quick-editor-tool-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.quick-editor-tool {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  min-height: 84px;
  padding: 14px;
  border-radius: 18px;
  background: color-mix(in srgb, var(--app-surface-soft) 84%, var(--app-surface));
  color: var(--app-text);
  text-align: left;
}

.quick-editor-tool strong {
  font-size: 14px;
  font-weight: 700;
}

.quick-editor-tool span {
  color: var(--app-text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.quick-editor-range {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 16px;
  background: var(--app-surface);
}

.quick-editor-range__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--app-text-secondary);
  font-size: 13px;
}

.quick-editor-range__head strong {
  color: var(--app-text);
  font-size: 14px;
}

.quick-editor-range input {
  width: 100%;
  accent-color: var(--app-text);
}

.quick-editor-cta {
  min-height: 48px;
  padding: 0 16px;
  border-radius: 16px;
  background: var(--app-text);
  color: var(--app-bg);
  font-size: 15px;
  font-weight: 700;
}

.quick-editor-info-card {
  padding: 12px 14px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--app-text) 6%, transparent);
  color: var(--app-text-secondary);
  font-size: 13px;
  line-height: 1.6;
}

.quick-editor-info-card--soft {
  background: color-mix(in srgb, var(--app-surface-soft) 88%, var(--app-surface));
}

.quick-editor-switch {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  padding: 14px;
  border-radius: 18px;
  background: color-mix(in srgb, var(--app-surface-soft) 76%, var(--app-surface));
}

.quick-editor-switch__body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.quick-editor-switch__body strong {
  color: var(--app-text);
  font-size: 14px;
  font-weight: 700;
}

.quick-editor-switch__body span {
  color: var(--app-text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.quick-editor-switch__input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.quick-editor-switch__track {
  position: relative;
  display: inline-flex;
  align-items: center;
  width: 52px;
  height: 32px;
  padding: 4px;
  border-radius: 999px;
  background: rgba(20, 20, 22, 0.12);
  transition: background var(--motion-fast, 200ms) ease;
}

.quick-editor-switch__thumb {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 2px 8px rgba(17, 20, 22, 0.16);
  transition: transform var(--motion-fast, 200ms) var(--motion-emphasis, cubic-bezier(0.22, 1, 0.36, 1));
}

.quick-editor-switch__input:checked + .quick-editor-switch__track {
  background: var(--app-text);
}

.quick-editor-switch__input:checked + .quick-editor-switch__track .quick-editor-switch__thumb {
  transform: translateX(20px);
}

.quick-editor-tip,
.quick-editor-progress-head {
  color: var(--app-text-secondary);
  font-size: 13px;
  line-height: 1.6;
}

.quick-editor-tip {
  margin: 0;
}

.quick-editor-progress {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 18px;
  background: color-mix(in srgb, var(--app-surface-soft) 84%, var(--app-surface));
}

.quick-editor-progress-head strong {
  color: var(--app-text);
  font-size: 14px;
}

.quick-editor-progress-track {
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(20, 20, 22, 0.08);
}

.quick-editor-progress-fill {
  height: 100%;
  width: 0;
  border-radius: inherit;
  background: var(--app-text);
  transition: width 0.18s ease;
}

.quick-editor-progress--save {
  margin-top: -2px;
}

.quick-editor-error {
  margin: 0;
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(199, 68, 68, 0.08);
  color: #c74444;
  font-size: 13px;
  line-height: 1.5;
}

.quick-editor-footer {
  flex-shrink: 0;
  padding-top: 2px;
}

.quick-editor-footer .quick-editor-btn {
  flex: 1;
}

.quick-editor-close:active,
.quick-editor-btn:active,
.quick-editor-tab:active,
.quick-editor-tool:active,
.quick-editor-cta:active {
  transform: scale(var(--press-scale-button, 0.96));
}

.quick-editor-close:disabled,
.quick-editor-btn:disabled,
.quick-editor-tab:disabled,
.quick-editor-tool:disabled,
.quick-editor-cta:disabled {
  opacity: 0.54;
  cursor: not-allowed;
}

.overlay-fade-enter-active,
.overlay-fade-leave-active {
  transition: opacity 0.22s ease;
}

.overlay-fade-enter-active .quick-editor-card,
.overlay-fade-leave-active .quick-editor-card {
  transition:
    transform 0.22s var(--motion-emphasis, cubic-bezier(0.22, 1, 0.36, 1)),
    opacity 0.22s ease;
}

.overlay-fade-enter-from,
.overlay-fade-leave-to {
  opacity: 0;
}

.overlay-fade-enter-from .quick-editor-card,
.overlay-fade-leave-to .quick-editor-card {
  opacity: 0;
  transform: translateY(12px) scale(0.98);
}

@media (max-width: 760px) {
  .quick-editor-mask {
    align-items: flex-end;
    padding: 0;
  }

  .quick-editor-card {
    width: 100%;
    height: min(96dvh, 820px);
    max-height: none;
    gap: 10px;
    padding: 10px 12px 0;
    overflow: hidden;
    border-right: none;
    border-bottom: none;
    border-left: none;
    border-radius: 28px 28px 0 0;
  }

  .quick-editor-handle {
    display: block;
  }

  .quick-editor-header,
  .quick-editor-preview-head,
  .quick-editor-section-head,
  .quick-editor-progress-head {
    align-items: flex-start;
    flex-direction: column;
  }

  .quick-editor-header {
    align-items: flex-start;
    flex-direction: row;
    justify-content: space-between;
    gap: 10px;
  }

  .quick-editor-close {
    flex-shrink: 0;
    width: auto;
    min-width: 72px;
    padding: 0 14px;
  }

  .quick-editor-heading {
    flex: 1;
  }

  .quick-editor-meta {
    gap: 6px;
  }

  .quick-editor-workbench,
  .quick-editor-sidebar {
    flex: 1;
    min-height: 0;
  }

  .quick-editor-workbench {
    overflow-y: auto;
    padding-bottom: 12px;
    scrollbar-width: none;
  }

  .quick-editor-workbench::-webkit-scrollbar {
    display: none;
  }

  .quick-editor-sidebar {
    gap: 10px;
  }

  .quick-editor-tabs {
    position: sticky;
    top: 0;
    z-index: 2;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    padding: 6px;
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--app-surface) 97%, transparent) 0%, color-mix(in srgb, var(--app-surface-soft) 90%, var(--app-surface)) 100%);
    box-shadow: 0 8px 18px rgba(17, 20, 22, 0.06);
  }

  .quick-editor-tab {
    min-height: 56px;
    padding: 10px 12px;
  }

  .quick-editor-sidebar-scroll {
    min-height: auto;
    padding-bottom: 0;
    overflow: visible;
  }

  .quick-editor-preview {
    height: clamp(180px, 28vh, 250px);
    min-height: 180px;
  }

  .quick-editor-panel {
    min-height: auto;
  }

  .quick-editor-tool-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .quick-editor-tool {
    min-height: 76px;
  }

  .quick-editor-footer {
    position: sticky;
    bottom: 0;
    z-index: 3;
    flex-shrink: 0;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    padding: 12px 0 max(12px, env(safe-area-inset-bottom));
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0) 0%, color-mix(in srgb, var(--app-surface) 96%, transparent) 28%, color-mix(in srgb, var(--app-surface) 100%, transparent) 100%);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
  }

  .quick-editor-footer .quick-editor-btn {
    width: auto;
  }
}

@media (min-width: 900px) {
  .quick-editor-mask {
    padding: 28px;
  }

  .quick-editor-card {
    width: min(calc(100vw - 56px), 1120px);
    max-height: min(92vh, 980px);
    overflow: hidden;
  }

  .quick-editor-workbench {
    flex: 1;
    display: grid;
    grid-template-columns: minmax(0, 1.42fr) minmax(400px, 440px);
    gap: 16px;
    min-height: 0;
  }

  .quick-editor-preview-shell {
    min-height: 0;
    padding: 14px;
  }

  .quick-editor-preview {
    height: 100%;
    min-height: 520px;
  }

  .quick-editor-sidebar {
    min-height: 0;
    padding: 6px 0 0;
  }

  .quick-editor-sidebar-scroll {
    flex: 1;
    padding-bottom: 18px;
  }

  .quick-editor-tabs {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .quick-editor-tab {
    min-height: 58px;
  }

  .quick-editor-tool-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .quick-editor-footer {
    padding-top: 10px;
    border-top: 1px solid var(--app-border);
    background: color-mix(in srgb, var(--app-surface) 94%, transparent);
  }
}

:global(html.theme-dark) .quick-editor-card {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--app-surface) 90%, transparent) 0%, color-mix(in srgb, var(--app-surface) 96%, transparent) 100%);
  border-color: rgba(255, 255, 255, 0.08);
  box-shadow:
    0 20px 48px rgba(0, 0, 0, 0.42),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

:global(html.theme-dark) .quick-editor-preview-shell,
:global(html.theme-dark) .quick-editor-section,
:global(html.theme-dark) .quick-editor-tab--active,
:global(html.theme-dark) .quick-editor-range,
:global(html.theme-dark) .quick-editor-progress,
:global(html.theme-dark) .quick-editor-switch,
:global(html.theme-dark) .quick-editor-tool,
:global(html.theme-dark) .quick-editor-info-card--soft {
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    0 0 0 1px rgba(255, 255, 255, 0.03);
}

:global(html.theme-dark) .quick-editor-preview {
  background:
    linear-gradient(45deg, rgba(255, 255, 255, 0.03) 25%, transparent 25%, transparent 75%, rgba(255, 255, 255, 0.03) 75%, rgba(255, 255, 255, 0.03)),
    linear-gradient(45deg, rgba(255, 255, 255, 0.06) 25%, transparent 25%, transparent 75%, rgba(255, 255, 255, 0.06) 75%, rgba(255, 255, 255, 0.06));
  background-size: 24px 24px;
  background-position: 0 0, 12px 12px;
}
</style>
