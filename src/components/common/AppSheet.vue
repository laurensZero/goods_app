<template>
  <Teleport to="body">
    <Transition
      :name="instant ? '' : 'sheet-pop'"
      @after-enter="onAfterEnter"
      @after-leave="onAfterLeave"
    >
      <div
        v-if="modelValue"
        class="app-sheet-overlay"
        :class="[
          `app-sheet-overlay--${placement}`,
          { 'app-sheet-overlay--wide': isWide }
        ]"
        :style="overlayStyle"
        @click.self="onOverlayClick"
      >
        <div
          class="app-sheet"
          :class="[
            `app-sheet--${size}`,
            `app-sheet--${placement}`,
            { 'app-sheet--has-handle': showHandle },
            sheetClass
          ]"
          role="dialog"
          aria-modal="true"
        >
          <div v-if="showHandle" class="app-sheet__handle" aria-hidden="true" />
          <div class="app-sheet__scroll">
            <slot />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useWideViewport } from '@/composables/useWideViewport'

// 打开序号只增不减：后打开的层叠在上，关闭不影响已打开层
let openSeq = 0
const BASE_Z = 90
const Z_STEP = 10

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  /** 强制居中（危险确认等） */
  forceCenter: { type: Boolean, default: false },
  /** 强制底部（覆盖宽屏居中） */
  forceBottom: { type: Boolean, default: false },
  /** bottom | top | center；省略时按 forceCenter/isWide 自动 */
  position: { type: String, default: '' },
  closeOnOverlay: { type: Boolean, default: true },
  /** mobile | dialog | wide */
  size: { type: String, default: 'dialog' },
  zIndex: { type: Number, default: undefined },
  /** 打开时锁住 body 滚动（与 Vant Popup 默认一致） */
  lockScroll: { type: Boolean, default: true },
  /** 跳过入场动画（如详情页返回时接管弹层） */
  instant: { type: Boolean, default: false },
  /** 附加到 .app-sheet 的 class（用于 querySelector 等） */
  sheetClass: { type: [String, Array, Object], default: '' }
})

const emit = defineEmits(['update:modelValue', 'opened', 'closed'])

const { isWide } = useWideViewport() // 短边≥600 且长边≥900，纯像素，不用 UA

const placement = computed(() => {
  if (props.position) return props.position
  if (props.forceCenter) return 'center'
  if (props.forceBottom) return 'bottom'
  return isWide.value ? 'center' : 'bottom'
})

const isCentered = computed(() => placement.value === 'center')
const showHandle = computed(() => !isCentered.value)

const localZ = ref(props.zIndex != null ? props.zIndex : BASE_Z)

const overlayStyle = computed(() => ({ zIndex: localZ.value }))

// 多层弹层共用 body 锁：最后一层关闭才恢复滚动
let bodyLockDepth = 0
let previousBodyOverflow = ''
let holdsBodyLock = false

function lockBody() {
  if (!props.lockScroll || holdsBodyLock) return
  holdsBodyLock = true
  bodyLockDepth += 1
  if (bodyLockDepth === 1) {
    previousBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
}

function unlockBody() {
  if (!holdsBodyLock) return
  holdsBodyLock = false
  bodyLockDepth = Math.max(0, bodyLockDepth - 1)
  if (bodyLockDepth === 0) {
    document.body.style.overflow = previousBodyOverflow
    previousBodyOverflow = ''
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      openSeq += 1
      if (props.zIndex == null) {
        localZ.value = BASE_Z + openSeq * Z_STEP
      }
      lockBody()
      if (props.instant) {
        emit('opened')
      }
    } else {
      unlockBody()
    }
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  unlockBody()
})

function onAfterEnter() {
  emit('opened')
}

function onAfterLeave() {
  emit('closed')
}

function onOverlayClick() {
  if (props.closeOnOverlay) emit('update:modelValue', false)
}

defineExpose({ isWide, isCentered, placement })
</script>

<style scoped>
/* 遮罩只压暗，不整页重糊——模糊交给面板自身 */
.app-sheet-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-sheet, 90);
  display: flex;
  justify-content: center;
  padding: 0;
  background: var(--app-overlay);
}

.app-sheet-overlay--bottom {
  align-items: flex-end;
}

.app-sheet-overlay--top {
  align-items: flex-start;
}

.app-sheet-overlay--center {
  align-items: center;
  padding: 24px;
}

/* 玻璃只作用在弹窗本体：背后内容透过面板时被磨砂，弹窗外保持清晰 */
.app-sheet {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-height: min(calc(100dvh - var(--tabbar-height, 94px) - env(safe-area-inset-bottom)), 88vh);
  padding: 12px 18px calc(env(safe-area-inset-bottom) + 18px);
  overflow: hidden;
  border-radius: var(--radius-large) var(--radius-large) 0 0;
  border: 1px solid var(--app-glass-border);
  border-bottom: none;
  background: color-mix(in srgb, var(--app-glass-strong) 82%, transparent);
  backdrop-filter: blur(40px) saturate(160%);
  -webkit-backdrop-filter: blur(40px) saturate(160%);
  box-shadow: var(--app-shadow);
  color: var(--app-text);
}

.app-sheet-overlay--center .app-sheet {
  width: min(100%, 420px);
  max-height: min(calc(100dvh - 48px), 720px);
  padding: 20px 24px 24px;
  border-radius: var(--radius-large);
  border-bottom: 1px solid var(--app-glass-border);
}

.app-sheet-overlay--top .app-sheet {
  max-height: min(calc(100dvh - env(safe-area-inset-top, 0px)), 92vh);
  padding-top: calc(env(safe-area-inset-top, 0px) + 12px);
  border-radius: 0 0 var(--radius-large) var(--radius-large);
  border-top: none;
  border-bottom: 1px solid var(--app-glass-border);
}

.app-sheet--mobile {
  max-height: min(calc(100dvh - var(--tabbar-height, 94px) - env(safe-area-inset-bottom)), 90vh);
}

.app-sheet--wide {
  width: min(100%, 520px);
}

.app-sheet-overlay--center .app-sheet--wide {
  width: min(100%, 520px);
}

.app-sheet__handle {
  width: 36px;
  height: 4px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-text) 28%, transparent);
  margin: 4px auto 12px;
  flex-shrink: 0;
}

.app-sheet__scroll {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
}

.app-sheet__scroll::-webkit-scrollbar {
  display: none;
}

:global(html.theme-dark) .app-sheet {
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.42);
}

/* 与全局 sheet-pop 一致：遮罩淡入 + 面板上滑（center 为 fade+微上移） */
:global(.sheet-pop-enter-active) .app-sheet,
:global(.sheet-pop-leave-active) .app-sheet {
  transition: transform 0.28s var(--motion-ease-spring), opacity 0.24s ease;
}

:global(.sheet-pop-enter-from) .app-sheet,
:global(.sheet-pop-leave-to) .app-sheet {
  transform: translateY(26px);
  opacity: 0;
}
</style>
