<template>
  <div class="cutout-mask-editor">
    <div
      ref="stageRef"
      class="cutout-mask-editor__stage"
      :style="stageStyle"
    >
      <canvas ref="imageCanvasRef" class="cutout-mask-editor__canvas" />
      <div ref="fabricHostRef" class="cutout-mask-editor__fabric" />
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { Canvas, PencilBrush } from 'fabric'

const props = defineProps({
  imageUrl: { type: String, default: '' },
  maskUrl: { type: String, default: '' },
  brushMode: { type: String, default: 'erase' },
  brushSize: { type: Number, default: 24 },
  disabled: { type: Boolean, default: false }
})

const emit = defineEmits(['dirty-change'])

const stageRef = ref(null)
const imageCanvasRef = ref(null)
const fabricHostRef = ref(null)

const imageSize = ref({ width: 1, height: 1 })
const stageStyle = computed(() => ({
  aspectRatio: `${imageSize.value.width || 1} / ${imageSize.value.height || 1}`
}))

let fabricCanvas = null
let sourceImage = null
let baseMaskCanvas = null
let syncingPromise = Promise.resolve()

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

function drawSourceImage() {
  if (!imageCanvasRef.value || !sourceImage) return
  const canvas = imageCanvasRef.value
  canvas.width = imageSize.value.width
  canvas.height = imageSize.value.height
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(sourceImage, 0, 0, canvas.width, canvas.height)
}

function syncBrushConfig() {
  if (!fabricCanvas) return
  fabricCanvas.isDrawingMode = !props.disabled
  if (!fabricCanvas.freeDrawingBrush) {
    fabricCanvas.freeDrawingBrush = new PencilBrush(fabricCanvas)
  }

  fabricCanvas.freeDrawingBrush.width = Math.max(4, Number(props.brushSize) || 24)
  fabricCanvas.freeDrawingBrush.color = props.brushMode === 'keep'
    ? 'rgba(34, 197, 94, 0.45)'
    : 'rgba(239, 68, 68, 0.45)'
}

function clearPendingStrokes() {
  if (!fabricCanvas) return
  const objects = fabricCanvas.getObjects()
  objects.forEach((item) => fabricCanvas.remove(item))
  fabricCanvas.requestRenderAll()
  emit('dirty-change', false)
}

function undoStroke() {
  if (!fabricCanvas) return
  const objects = fabricCanvas.getObjects()
  const last = objects[objects.length - 1]
  if (!last) return
  fabricCanvas.remove(last)
  fabricCanvas.requestRenderAll()
  emit('dirty-change', fabricCanvas.getObjects().length > 0)
}

async function commitEdits() {
  if (!baseMaskCanvas) return null
  if (!fabricCanvas || fabricCanvas.getObjects().length === 0) {
    return canvasToBlob(baseMaskCanvas, 'image/png', 1)
  }

  const mergedCanvas = createCanvas(baseMaskCanvas.width, baseMaskCanvas.height)
  const mergedCtx = mergedCanvas.getContext('2d', { willReadFrequently: true })
  mergedCtx.drawImage(baseMaskCanvas, 0, 0)

  const strokeDataUrl = fabricCanvas.toDataURL({
    format: 'png',
    multiplier: 1,
    enableRetinaScaling: false,
    withoutTransform: false
  })

  const strokeImageElement = await loadImage(strokeDataUrl)
  const strokeCanvas = createCanvas(mergedCanvas.width, mergedCanvas.height)
  const strokeCtx = strokeCanvas.getContext('2d', { willReadFrequently: true })
  strokeCtx.drawImage(strokeImageElement, 0, 0, strokeCanvas.width, strokeCanvas.height)

  const mergedImage = mergedCtx.getImageData(0, 0, mergedCanvas.width, mergedCanvas.height)
  const strokeImage = strokeCtx.getImageData(0, 0, strokeCanvas.width, strokeCanvas.height)
  const mergedData = mergedImage.data
  const strokeData = strokeImage.data

  for (let index = 0; index < strokeData.length; index += 4) {
    const strokeAlpha = strokeData[index + 3] / 255
    if (strokeAlpha <= 0.001) continue

    const isErase = strokeData[index] > strokeData[index + 1]

    if (isErase) {
      mergedData[index] = Math.round(mergedData[index] * (1 - strokeAlpha))
      mergedData[index + 1] = Math.round(mergedData[index + 1] * (1 - strokeAlpha))
      mergedData[index + 2] = Math.round(mergedData[index + 2] * (1 - strokeAlpha))
      mergedData[index + 3] = Math.round(mergedData[index + 3] * (1 - strokeAlpha))
      continue
    }

    mergedData[index] = Math.round(mergedData[index] + (255 - mergedData[index]) * strokeAlpha)
    mergedData[index + 1] = Math.round(mergedData[index + 1] + (255 - mergedData[index + 1]) * strokeAlpha)
    mergedData[index + 2] = Math.round(mergedData[index + 2] + (255 - mergedData[index + 2]) * strokeAlpha)
    mergedData[index + 3] = Math.round(mergedData[index + 3] + (255 - mergedData[index + 3]) * strokeAlpha)
  }

  mergedCtx.putImageData(mergedImage, 0, 0)
  baseMaskCanvas = mergedCanvas
  clearPendingStrokes()
  return canvasToBlob(baseMaskCanvas, 'image/png', 1)
}

async function syncEditor() {
  if (!props.imageUrl || !props.maskUrl) return

  syncingPromise = syncingPromise.then(async () => {
    const [image, mask] = await Promise.all([
      loadImage(props.imageUrl),
      loadImage(props.maskUrl)
    ])

    sourceImage = image
    imageSize.value = {
      width: image.naturalWidth || image.width || 1,
      height: image.naturalHeight || image.height || 1
    }

    baseMaskCanvas = createCanvas(imageSize.value.width, imageSize.value.height)
    const maskCtx = baseMaskCanvas.getContext('2d', { willReadFrequently: true })
    maskCtx.clearRect(0, 0, baseMaskCanvas.width, baseMaskCanvas.height)
    maskCtx.drawImage(mask, 0, 0, baseMaskCanvas.width, baseMaskCanvas.height)

    await nextTick()
    drawSourceImage()

    if (!fabricCanvas) {
      const canvasEl = document.createElement('canvas')
      canvasEl.className = 'cutout-mask-editor__draw-canvas'
      fabricHostRef.value?.replaceChildren(canvasEl)

      fabricCanvas = new Canvas(canvasEl, {
        isDrawingMode: !props.disabled,
        selection: false
      })
      fabricCanvas.on('path:created', () => {
        emit('dirty-change', true)
      })
    }

    fabricCanvas.setDimensions({
      width: imageSize.value.width,
      height: imageSize.value.height
    })
    fabricCanvas.getObjects().forEach((item) => {
      item.selectable = false
      item.evented = false
    })
    clearPendingStrokes()
    syncBrushConfig()
  })

  return syncingPromise
}

defineExpose({
  clearPendingStrokes,
  commitEdits,
  undoStroke
})

watch(
  () => [props.imageUrl, props.maskUrl],
  async ([imageUrl, maskUrl]) => {
    if (!imageUrl || !maskUrl) return
    await syncEditor()
  },
  { immediate: true }
)

watch(
  () => [props.brushMode, props.brushSize, props.disabled],
  () => {
    syncBrushConfig()
  }
)

onBeforeUnmount(() => {
  fabricCanvas?.dispose()
  fabricCanvas = null
})
</script>

<style scoped>
.cutout-mask-editor {
  width: 100%;
  overflow: auto;
  -webkit-overflow-scrolling: touch;
  border-radius: var(--radius-card, 18px);
  background:
    repeating-conic-gradient(rgba(0, 0, 0, 0.04) 0% 25%, transparent 0% 50%) 0 0 / 16px 16px;
}

.cutout-mask-editor__stage {
  position: relative;
  display: inline-block;
}

.cutout-mask-editor__canvas,
.cutout-mask-editor__fabric,
.cutout-mask-editor__fabric :deep(canvas) {
  display: block;
}

.cutout-mask-editor__fabric {
  position: absolute;
  inset: 0;
  z-index: 2;
}

.cutout-mask-editor__draw-canvas {
  display: block;
}
</style>
