<template>
  <Teleport to="body">
    <!-- 常驻 + visibility：关闭不卸载，玻璃层可提前合成 -->
    <div
      v-if="booted"
      class="app-sheet-overlay"
      :class="[
        `app-sheet-overlay--${placement}`,
        {
          'app-sheet-overlay--wide': isWide,
          'app-sheet-overlay--glass-blur': glassBlur
        }
      ]"
      :style="overlayStyle"
    >
      <!-- 遮罩压暗：关闭时立刻收，不跟面板 leave 拖泥带水 -->
      <div
        class="app-sheet-scrim"
        :class="{ 'app-sheet-scrim--open': modelValue }"
        @click="onOverlayClick"
      />

      <Transition :name="instant ? '' : 'sheet-pop'">
        <div
          v-show="modelValue"
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
      </Transition>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useWideViewport } from '@/composables/useWideViewport'

let openSeq = 0
const BASE_Z = 90
const Z_STEP = 10

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  forceCenter: { type: Boolean, default: false },
  forceBottom: { type: Boolean, default: false },
  position: { type: String, default: '' },
  closeOnOverlay: { type: Boolean, default: true },
  size: { type: String, default: 'dialog' },
  zIndex: { type: Number, default: undefined },
  lockScroll: { type: Boolean, default: true },
  instant: { type: Boolean, default: false },
  /** 弹窗以外的背景是否模糊；默认只压暗 */
  glassBlur: { type: Boolean, default: false },
  sheetClass: { type: [String, Array, Object], default: '' }
})

const emit = defineEmits(['update:modelValue', 'opened', 'closed'])

const { isWide } = useWideViewport()

const booted = ref(false)
onMounted(() => {
  booted.value = true
})

const placement = computed(() => {
  if (props.position) return props.position
  if (props.forceCenter) return 'center'
  if (props.forceBottom) return 'bottom'
  return isWide.value ? 'center' : 'bottom'
})

const isCentered = computed(() => placement.value === 'center')
const showHandle = computed(() => !isCentered.value)

const localZ = ref(props.zIndex != null ? props.zIndex : BASE_Z)

const overlayVisible = ref(false)

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

const overlayStyle = computed(() => ({
  zIndex: localZ.value,
  visibility: overlayVisible.value ? 'visible' : 'hidden',
  pointerEvents: props.modelValue ? 'auto' : 'none'
}))

watch(
  () => props.modelValue,
  async (open) => {
    if (open) {
      openSeq += 1
      if (props.zIndex == null) {
        localZ.value = BASE_Z + openSeq * Z_STEP
      }
      lockBody()
      overlayVisible.value = true
      if (props.instant) {
        emit('opened')
        return
      }
      await nextTick()
      void document.body.offsetHeight
      emit('opened')
    } else {
      unlockBody()
      // 等面板 leave 动画结束再藏壳
      window.setTimeout(() => {
        if (!props.modelValue) overlayVisible.value = false
      }, 300)
    }
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  unlockBody()
})

function onOverlayClick() {
  if (props.closeOnOverlay) emit('update:modelValue', false)
}

defineExpose({ isWide, isCentered, placement })
</script>

<style scoped>
.app-sheet-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-sheet, 90);
  display: flex;
  justify-content: center;
  padding: 0;
  /* 根不带背景；压暗交给 scrim，方便关闭时立刻消失 */
  pointer-events: none;
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

.app-sheet-scrim {
  position: absolute;
  inset: 0;
  background: var(--app-overlay);
  opacity: 0;
  pointer-events: none;
  /* 默认（关闭）：立刻收；打开时用 --open 覆盖为淡入 */
  transition: none;
}

/* 弹窗以外的背景模糊：模糊加在全屏遮罩上，面板保持实心玻璃 */
.app-sheet-overlay--glass-blur .app-sheet-scrim {
  backdrop-filter: blur(28px) saturate(140%);
  -webkit-backdrop-filter: blur(28px) saturate(140%);
}

.app-sheet-scrim--open {
  opacity: 1;
  pointer-events: auto;
  transition: opacity 0.18s ease;
}

.app-sheet {
  position: relative;
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-height: min(calc(100dvh - var(--tabbar-height, 94px) - env(safe-area-inset-bottom)), 88vh);
  padding: 12px 18px calc(env(safe-area-inset-bottom) + 18px);
  overflow: hidden;
  border-radius: var(--radius-large) var(--radius-large) 0 0;
  border: 1px solid var(--app-glass-border);
  border-bottom: none;
  background: var(--app-glass-strong);
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

/* 旧版 sheet-pop：面板 spring 上滑 + 淡入 */
:global(.sheet-pop-enter-active.app-sheet),
:global(.sheet-pop-leave-active.app-sheet) {
  transition: transform 0.28s var(--motion-ease-spring), opacity 0.24s ease;
}

:global(.sheet-pop-enter-from.app-sheet),
:global(.sheet-pop-leave-to.app-sheet) {
  transform: translateY(26px);
  opacity: 0;
}
</style>
