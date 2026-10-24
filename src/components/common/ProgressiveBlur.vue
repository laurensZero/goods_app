<script setup>
import { computed } from 'vue'

const props = defineProps({
  /** 贴附边缘：top / bottom */
  position: { type: String, default: 'top' },
  /** 是否启用（滚动后翻 true；false 时整条 opacity 0，浏览器跳过合成） */
  active: { type: Boolean, default: false },
  /** 低端机/用户关闭时彻底不渲染 */
  disabled: { type: Boolean, default: false },
  /** 覆盖默认层级（默认顶缘 30 / 底缘 55，低于 TabBar 的 60） */
  zIndex: { type: Number, default: 0 },
  /** 跳变（滚动恢复/回顶）时跳过淡入淡出，帧内生效 */
  instant: { type: Boolean, default: false },
  /** 条带高度（Number px 或任意 CSS 长度字符串） */
  height: { type: [Number, String], default: 128 },
})

// 低端机降 2 步：backdrop-filter 层数直接决定合成开销
const lowPerf = typeof navigator !== 'undefined' && (
  (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4)
  || (navigator.deviceMemory && navigator.deviceMemory <= 4)
)

// 模糊半径逐层翻倍 + 重叠 mask 带 → 近似 iOS 连续 progressive blur。
// solid=纯模糊段(%)，fade=渐隐止点(%)。方向由 position 决定。
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

const rootStyle = computed(() => ({
  height: typeof props.height === 'number' ? `${props.height}px` : props.height,
  ...(props.zIndex ? { zIndex: String(props.zIndex) } : null),
}))
</script>

<template>
  <div
    v-if="!disabled"
    class="progressive-blur"
    :class="[`progressive-blur--${position}`, { 'progressive-blur--active': active, 'progressive-blur--instant': instant }]"
    :style="rootStyle"
    aria-hidden="true"
  >
    <div
      v-for="(step, i) in steps"
      :key="i"
      class="progressive-blur__layer"
      :style="layerStyle(i)"
    ></div>
    <div class="progressive-blur__scrim"></div>
  </div>
</template>

<style scoped>
/* 滚动边缘渐进模糊：多步 backdrop-filter + 重叠 mask 渐变近似 iOS progressive blur。
   硬约束：只动整条 opacity（合成器友好），禁止动画 backdrop-filter 数值；
   高度 ≤96px；层数 4（低端 2）；scrim 仅兜底，不再用背景色刷内容（廉价感来源）。 */
.progressive-blur {
  position: fixed;
  left: 0;
  right: 0;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.2s var(--motion-ease-default);
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

.progressive-blur--instant {
  transition: none;
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
