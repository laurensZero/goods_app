<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps({
  /** 贴附边缘：top / bottom */
  position: { type: String, default: 'top' },
  /** 常开模式（active=true 时 opacity 走 CSS 类） */
  active: { type: Boolean, default: false },
  /** 低端机/用户关闭时彻底不渲染 */
  disabled: { type: Boolean, default: false },
  /** 覆盖默认层级（默认顶缘 30 / 底缘 55，低于 TabBar 的 60） */
  zIndex: { type: Number, default: 0 },
  /** 条带高度（Number px 或任意 CSS 长度字符串） */
  height: { type: [Number, String], default: 128 },
  /**
   * 自管滚动侦听模式：scroll 事件 + 常驻 interval 双通道，直接写 fader 的
   * DOM opacity 与各层 backdrop-filter 半径（0→RAMP 缓入映射）。不经 Vue
   * 渲染链（patch 会抹掉命令式样式，假死成"resize 才出现"）；单用 scroll
   * 事件会丢静默恢复，单用 rAF 会在窗口被遮挡时暂停假死。
   * 半径生长是真渐进的关键：只渐变透明度 = 渐变"全模糊图层"的浓度，观感仍是突变。
   */
  auto: { type: Boolean, default: false },
})

// 低端机降 2 步：backdrop-filter 层数直接决定合成开销
const lowPerf = typeof navigator !== 'undefined' && (
  (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4)
  || (navigator.deviceMemory && navigator.deviceMemory <= 4)
)

// 模糊半径逐层翻倍 + 重叠 mask 带 → 近似 iOS 连续 progressive blur。
const STEPS_4 = [
  { blur: 6, solid: 18, fade: 55 },
  { blur: 14, solid: 12, fade: 40 },
  { blur: 28, solid: 8, fade: 28 },
  { blur: 56, solid: 5, fade: 16 },
]
const STEPS_2 = [
  { blur: 12, solid: 15, fade: 50 },
  { blur: 48, solid: 6, fade: 20 },
]

const steps = computed(() => (lowPerf ? STEPS_2 : STEPS_4))

function layerStyle(index) {
  const step = steps.value[index]
  const dir = props.position === 'top' ? 'to bottom' : 'to top'
  const mask = `linear-gradient(${dir}, black 0%, black ${step.solid}%, transparent ${step.fade}%)`
  return {
    backdropFilter: `blur(${step.blur}px) saturate(160%)`,
    WebkitBackdropFilter: `blur(${step.blur}px) saturate(160%)`,
    maskImage: mask,
    WebkitMaskImage: mask,
  }
}

const RAMP_PX = 300

const root = ref(null)
const fader = ref(null)
let pollId = 0
let onScroll = null
let cleanupAuto = null

function computeProgress() {
  // 双滚动源：window（.page 仅 min-height 时 document 滚）+ 各页 .page-body
  let top = window.scrollY
  document.querySelectorAll('.page .page-body').forEach((el) => {
    if (el.scrollTop > top) top = el.scrollTop
  })
  const linear = Math.min(Math.max(top / RAMP_PX, 0), 1)
  // 缓入曲线：刚离开顶部时模糊增长慢（"渐渐出现"），深滚后趋满档
  return Math.pow(linear, 1.5)
}

function applyProgress() {
  const p = computeProgress()
  // 透明度先到位（150px 内到全显），模糊半径随 p 继续生长（300px 满档）——
  // 只渐变透明度的话，图层是全强度半径，过半就"已经很糊"，观感仍是突变
  if (fader.value) fader.value.style.opacity = String(Math.min(p * 1.4, 1))
  if (lowPerf) return
  const radiusScale = 0.35 + 0.65 * p
  fader.value?.querySelectorAll('.progressive-blur__layer').forEach((el, i) => {
    const step = steps.value[i]
    const v = `blur(${(step.blur * radiusScale).toFixed(1)}px) saturate(160%)`
    el.style.backdropFilter = v
    el.style.setProperty('-webkit-backdrop-filter', v)
  })
}

function bindAuto() {
  // 双通道：scroll 事件提供滚动中的逐帧平滑；常驻 interval 兜底
  // 滚动位置恢复/钳位的静默写入（不发事件）。窗口被遮挡时 rAF 会暂停
  // （visibilityState 仍是 visible，假死），interval 被节流到 1s 也能自愈。
  onScroll = () => applyProgress()
  document.addEventListener('scroll', onScroll, { capture: true, passive: true })
  window.addEventListener('scroll', onScroll, { passive: true })
  pollId = setInterval(applyProgress, 250)
  applyProgress()
  cleanupAuto = () => {
    document.removeEventListener('scroll', onScroll, true)
    window.removeEventListener('scroll', onScroll)
    if (pollId) clearInterval(pollId)
    pollId = 0
  }
}

onMounted(() => {
  if (props.auto) bindAuto()
  else if (fader.value) fader.value.style.opacity = props.active ? '1' : '0'
})

watch(() => props.active, (on) => {
  if (!props.auto && fader.value) fader.value.style.opacity = on ? '1' : '0'
})

onBeforeUnmount(() => {
  if (cleanupAuto) cleanupAuto()
  cleanupAuto = null
})

const rootStyle = computed(() => ({
  height: typeof props.height === 'number' ? `${props.height}px` : props.height,
  ...(props.zIndex ? { zIndex: String(props.zIndex) } : null),
}))
</script>

<template>
  <div
    v-if="!disabled"
    ref="root"
    class="progressive-blur"
    :class="[`progressive-blur--${position}`, { 'progressive-blur--active': auto || active }]"
    :style="rootStyle"
    aria-hidden="true"
  >
    <div ref="fader" class="progressive-blur__fader">
      <div
        v-for="(step, i) in steps"
        :key="i"
        class="progressive-blur__layer"
        :style="layerStyle(i)"
      ></div>
      <div class="progressive-blur__scrim"></div>
    </div>
  </div>
</template>

<style scoped>
/* 滚动边缘渐进模糊：多步 backdrop-filter + 重叠 mask 渐变近似 iOS progressive blur。
   硬约束：整条 opacity 逐帧写样式（auto 模式直写 DOM），禁止动画 backdrop-filter
   数值；高度 ≤128px；层数 4（低端 2）；scrim 仅兜底，不做底色 wash（廉价感来源）。 */
.progressive-blur {
  position: fixed;
  left: 0;
  right: 0;
  pointer-events: none;
}

/* fader 的 opacity 由 JS 命令式写入：不能用 Vue 绑定——组件 patch 会用
   vnode style 覆盖命令式值，导致"滚动不更新、重渲染才出现"的假死 */
.progressive-blur__fader {
  position: absolute;
  inset: 0;
  opacity: 0;
}

.progressive-blur--top {
  top: 0;
  /* 必须显式 z-index：页面内容多为 position:relative 的定位元素，
     同层定位元素按 DOM 顺序绘制，本组件是 .page 第一个子节点，
     不加 z-index 会被后绘制的内容整体盖住（曾导致整层模糊不可见）。 */
  z-index: 30;
}

.progressive-blur--bottom {
  bottom: 0;
  z-index: 55;
}

.progressive-blur--active {
  opacity: 1;
}

.progressive-blur__layer {
  position: absolute;
  inset: 0;
}

/* scrim：仅兜底——不支持 backdrop-filter 的环境用渐变渐隐顶替；
   支持时压到 0.25，只负责极轻微的底色统一，不做可读性 wash */
.progressive-blur__scrim {
  position: absolute;
  inset: 0;
}

.progressive-blur--top .progressive-blur__scrim {
  background: linear-gradient(
    to bottom,
    color-mix(in srgb, var(--app-bg) 60%, transparent) 0%,
    color-mix(in srgb, var(--app-bg) 25%, transparent) 50%,
    transparent 100%
  );
}

.progressive-blur--bottom .progressive-blur__scrim {
  background: linear-gradient(
    to top,
    color-mix(in srgb, var(--app-bg) 60%, transparent) 0%,
    color-mix(in srgb, var(--app-bg) 25%, transparent) 50%,
    transparent 100%
  );
}

@supports (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)) {
  .progressive-blur__scrim {
    opacity: 0.25;
  }
}
</style>
