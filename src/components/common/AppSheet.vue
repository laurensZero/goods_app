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

      <Transition name="sheet-pop">
        <div
          v-if="modelValue"
          class="app-sheet"
          :class="[
            `app-sheet--${size}`,
            `app-sheet--${placement}`,
            { 'app-sheet--has-handle': showHandle, 'is-instant': instant },
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

const BASE_Z = 90
const Z_STEP = 10
/** 全局单调递增的面板 z 水位：后开的一定压住先开的（含嵌套弹层） */
let topZ = BASE_Z

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  /**
   * 弹出方向（一条参数）：
   * - auto（默认）：手机底部上滑，平板/宽屏居中
   * - top / bottom / left / right / center：强制指定
   */
  placement: {
    type: String,
    default: 'auto',
    validator: (v) => ['auto', 'top', 'bottom', 'left', 'right', 'center'].includes(v)
  },
  /** @deprecated 请改用 placement="center" */
  forceCenter: { type: Boolean, default: false },
  /** @deprecated 请改用 placement="bottom" */
  forceBottom: { type: Boolean, default: false },
  /** @deprecated 请改用 placement */
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
  if (props.placement && props.placement !== 'auto') return props.placement
  if (props.position) return props.position
  if (props.forceCenter) return 'center'
  if (props.forceBottom) return 'bottom'
  return isWide.value ? 'center' : 'bottom'
})

const isCentered = computed(() => placement.value === 'center')
/** 把手只给从边缘滑入的面板；居中/左右侧滑不需要 */
const showHandle = computed(() => ['top', 'bottom'].includes(placement.value))

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
      if (props.zIndex == null) {
        // 单调抬高：嵌套打开历史/设置时一定盖住宿主弹层
        topZ = Math.max(topZ, localZ.value) + Z_STEP
        localZ.value = topZ
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
        if (!props.modelValue) {
          overlayVisible.value = false
          emit('closed')
        }
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

.app-sheet-overlay--left {
  align-items: stretch;
  justify-content: flex-start;
  padding: 0;
}

.app-sheet-overlay--right {
  align-items: stretch;
  justify-content: flex-end;
  padding: 0;
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

.app-sheet-scrim--open {
  opacity: 1;
  pointer-events: auto;
  transition: opacity 0.18s ease;
}

/* 弹窗覆盖区域：所有 AppSheet 面板自身都有毛玻璃（backdrop-filter） */
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
  background: color-mix(in srgb, var(--app-glass-strong) 72%, transparent);
  backdrop-filter: blur(40px) saturate(160%);
  -webkit-backdrop-filter: blur(40px) saturate(160%);
  box-shadow: var(--app-shadow);
  color: var(--app-text);
}

/* glassBlur：弹窗以外的全屏背景也模糊（可选） */
.app-sheet-overlay--glass-blur .app-sheet-scrim {
  backdrop-filter: blur(28px) saturate(140%);
  -webkit-backdrop-filter: blur(28px) saturate(140%);
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

/* 左右侧滑：占满高度，窄栏 */
.app-sheet-overlay--left .app-sheet,
.app-sheet-overlay--right .app-sheet {
  height: 100%;
  max-height: 100dvh;
  width: min(88vw, 360px);
  padding-top: calc(env(safe-area-inset-top, 0px) + 16px);
  padding-bottom: calc(env(safe-area-inset-bottom) + 16px);
}

.app-sheet-overlay--left .app-sheet {
  border-radius: 0 var(--radius-large) var(--radius-large) 0;
  border-left: none;
}

.app-sheet-overlay--right .app-sheet {
  border-radius: var(--radius-large) 0 0 var(--radius-large);
  border-right: none;
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

/* flex:1 + 列向 flex：宿主可用 flex:1/min-height:0 钉住输入栏；
   默认内容仍按自然高度撑开并由本层滚动 */
.app-sheet__scroll {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
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

/* sheet-pop：按 placement 方向滑入 + 淡入 */
:global(.sheet-pop-enter-active.app-sheet),
:global(.sheet-pop-leave-active.app-sheet) {
  transition: transform 0.28s var(--motion-ease-spring), opacity 0.24s ease;
}

:global(.sheet-pop-enter-from.app-sheet),
:global(.sheet-pop-leave-to.app-sheet) {
  opacity: 0;
}

:global(.sheet-pop-enter-from.app-sheet--bottom),
:global(.sheet-pop-leave-to.app-sheet--bottom) {
  transform: translateY(26px);
  opacity: 0;
}

:global(.sheet-pop-enter-from.app-sheet--top),
:global(.sheet-pop-leave-to.app-sheet--top) {
  transform: translateY(-26px);
  opacity: 0;
}

:global(.sheet-pop-enter-from.app-sheet--left),
:global(.sheet-pop-leave-to.app-sheet--left) {
  transform: translateX(-28%);
  opacity: 0;
}

:global(.sheet-pop-enter-from.app-sheet--right),
:global(.sheet-pop-leave-to.app-sheet--right) {
  transform: translateX(28%);
  opacity: 0;
}

:global(.sheet-pop-enter-from.app-sheet--center),
:global(.sheet-pop-leave-to.app-sheet--center) {
  transform: translateY(12px) scale(0.98);
  opacity: 0;
}

/* 跳过动画：hero 返回等场景 */
.app-sheet.is-instant,
:global(.sheet-pop-enter-active.app-sheet.is-instant),
:global(.sheet-pop-leave-active.app-sheet.is-instant) {
  transition: none !important;
  transform: none !important;
  opacity: 1 !important;
}
</style>
