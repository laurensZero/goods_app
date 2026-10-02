<template>
  <div ref="hostRef" class="canvas-preview">
    <canvas
      ref="canvasRef"
      class="canvas-preview__canvas"
      :class="{ 'canvas-preview__canvas--picking': picking }"
      :style="canvasStyle"
    />
  </div>
</template>

<script setup>
/**
 * 外框实时预览：与导出共用 frameRenderer 的同一套绘制逻辑。
 * 组件本体只管尺寸与重绘节流，合成内容全部交给渲染器。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { renderFrameComposition } from '@/utils/image/frameRenderer'

const props = defineProps({
  source: { type: Object, default: null },
  frame: { type: Object, default: null },
  frameColors: { type: Object, default: null },
  bgColor: { type: String, default: '#ffffff' },
  fitRatio: { type: Number, default: 0.88 },
  brightness: { type: Number, default: 0 },
  contrast: { type: Number, default: 0 },
  saturation: { type: Number, default: 0 },
  labels: { type: Object, default: () => ({}) },
  picking: { type: Boolean, default: false },
  padding: { type: Number, default: 12 }
})

const emit = defineEmits(['rendered'])

const hostRef = ref(null)
const canvasRef = ref(null)
const boxSize = ref(0)

let observer = null
let rafId = 0

const canvasStyle = computed(() => (boxSize.value ? { width: `${boxSize.value}px`, height: `${boxSize.value}px` } : {}))

function measure() {
  const host = hostRef.value
  if (!host) return
  const rect = host.getBoundingClientRect()
  const available = Math.min(rect.width, rect.height) - props.padding * 2
  const next = Math.max(1, Math.floor(available))
  if (Math.abs(next - boxSize.value) > 0.5) {
    boxSize.value = next
    schedule()
  }
}

function getCanvas() {
  return canvasRef.value || null
}

function render() {
  rafId = 0
  const canvas = canvasRef.value
  if (!canvas || !boxSize.value) return

  const dpr = Math.min(3, Math.max(1, Number(window.devicePixelRatio) || 1))
  const pixelSize = Math.max(1, Math.round(boxSize.value * dpr))
  if (canvas.width !== pixelSize || canvas.height !== pixelSize) {
    canvas.width = pixelSize
    canvas.height = pixelSize
  }

  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return
  renderFrameComposition(ctx, {
    width: pixelSize,
    height: pixelSize,
    source: props.source,
    frame: props.frame,
    frameColors: props.frameColors,
    fitRatio: props.fitRatio,
    background: { color: props.bgColor },
    adjustments: {
      brightness: props.brightness,
      contrast: props.contrast,
      saturation: props.saturation
    },
    labels: props.labels
  })
  emit('rendered')
}

function schedule() {
  if (rafId) return
  rafId = window.requestAnimationFrame(render)
}

onMounted(() => {
  if (typeof ResizeObserver !== 'undefined' && hostRef.value) {
    observer = new ResizeObserver(measure)
    observer.observe(hostRef.value)
  }
  measure()
  schedule()
})

onBeforeUnmount(() => {
  if (rafId) window.cancelAnimationFrame(rafId)
  rafId = 0
  observer?.disconnect()
  observer = null
})

watch(
  () => [
    props.source,
    props.frame,
    props.frameColors,
    props.bgColor,
    props.fitRatio,
    props.brightness,
    props.contrast,
    props.saturation
  ],
  schedule
)

watch(() => props.labels, schedule, { deep: true })

defineExpose({ getCanvas, render, schedule })
</script>

<style scoped>
.canvas-preview {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1 1 auto;
  align-self: stretch;
  width: 100%;
  height: 100%;
  min-height: 0;
  min-width: 0;
}

.canvas-preview__canvas {
  display: block;
  border-radius: var(--radius-small, 14px);
}

.canvas-preview__canvas--picking {
  cursor: crosshair;
  touch-action: none;
}
</style>
