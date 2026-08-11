<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  kicker: { type: String, default: '' },
  width: { type: Number, default: 520 },
  minWidth: { type: Number, default: 320 },
  maxWidthRatio: { type: Number, default: 0.92 }
})

const emit = defineEmits(['close'])

const currentWidth = ref(props.width)
const wide = ref(window.innerWidth >= 560)

watch(() => props.open, (v) => {
  if (v) {
    currentWidth.value = props.width
    wide.value = window.innerWidth >= 560
  }
})

watch(() => props.width, (v) => {
  if (props.open) currentWidth.value = v
})

window.addEventListener('resize', () => {
  wide.value = window.innerWidth >= 560
})

const paneStyle = computed(() => {
  if (!wide.value) return { width: '100%' }
  return { width: currentWidth.value + 'px' }
})

function onResizeStart(event) {
  if (!wide.value) return
  event.preventDefault()
  window.addEventListener('pointermove', onResizeMove)
  window.addEventListener('pointerup', onResizeEnd)
  document.body.style.userSelect = 'none'
  document.body.style.cursor = 'ew-resize'
}

function onResizeMove(event) {
  const max = Math.floor(window.innerWidth * props.maxWidthRatio)
  const width = window.innerWidth - event.clientX
  currentWidth.value = Math.max(props.minWidth, Math.min(max, width))
}

function onResizeEnd() {
  window.removeEventListener('pointermove', onResizeMove)
  window.removeEventListener('pointerup', onResizeEnd)
  document.body.style.userSelect = ''
  document.body.style.cursor = ''
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="drawer-layer"
      @keydown.esc="emit('close')"
      tabindex="-1"
    >
      <div class="drawer-mask" @click="emit('close')" />
      <aside class="drawer-panel" :style="paneStyle">
        <span
          v-if="wide"
          class="drawer-resizer"
          role="separator"
          aria-orientation="vertical"
          title="拖动调整宽度"
          @pointerdown="onResizeStart"
        />
        <header class="drawer-head">
          <div>
            <p v-if="kicker" class="card-kicker">{{ kicker }}</p>
            <h3 class="drawer-title">{{ title }}</h3>
          </div>
          <button class="icon-btn drawer-close" type="button" aria-label="关闭" @click="emit('close')">×</button>
        </header>
        <div class="drawer-body">
          <slot />
        </div>
        <footer v-if="$slots.footer" class="drawer-foot">
          <slot name="footer" />
        </footer>
      </aside>
    </div>
  </Teleport>
</template>

<style scoped>
.drawer-layer {
  position: fixed;
  inset: 0;
  z-index: 900;
}

.drawer-mask {
  position: absolute;
  inset: 0;
  background: var(--app-overlay);
  animation: drawer-fade var(--motion-fast) var(--motion-ease-default);
}

.drawer-panel {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  max-width: 100%;
  background: var(--app-surface);
  border-left: 1px solid var(--app-border);
  box-shadow: var(--app-shadow);
  display: flex;
  flex-direction: column;
  animation: drawer-slide var(--motion-medium) var(--motion-ease-emphasis);
}

.drawer-resizer {
  position: absolute;
  top: 0;
  left: -3px;
  bottom: 0;
  width: 6px;
  cursor: ew-resize;
  touch-action: none;
}

.drawer-resizer::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 3px;
  height: 40px;
  border-radius: 999px;
  background: var(--app-border);
  opacity: 0;
  transition: opacity var(--motion-fast) var(--motion-ease-default);
}

.drawer-resizer:hover::after,
.drawer-resizer:active::after {
  opacity: 1;
  background: var(--app-pending, var(--app-text-tertiary));
}

.drawer-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--app-border);
}

.drawer-title {
  margin: 2px 0 0;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--app-text);
}

.drawer-close {
  flex-shrink: 0;
  font-size: 20px;
}

.drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: 18px;
  display: grid;
  gap: 14px;
  align-content: start;
}

.drawer-foot {
  padding: 14px 18px;
  border-top: 1px solid var(--app-border);
  display: flex;
  gap: 10px;
  align-items: center;
}

.drawer-foot :deep(.btn) {
  flex: 1;
}

@keyframes drawer-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes drawer-slide {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}
</style>
