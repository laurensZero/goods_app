<template>
  <div
    ref="modeSwitchRef"
    class="mode-switch"
    :class="modeSwitchClasses"
    role="tablist"
    :aria-label="ariaLabel"
    :style="modeSwitchStyle"
  >
    <span
      ref="indicatorRef"
      class="mode-switch__indicator"
      :class="{ 'mode-switch__indicator--animating': isArcAnimating }"
      aria-hidden="true"
    />

    <button
      v-for="option in normalizedOptions"
      :key="option.value"
      type="button"
      class="mode-switch__item"
      :class="{ 'mode-switch__item--active': modelValue === option.value }"
      role="tab"
      :aria-selected="modelValue === option.value"
      :aria-label="option.ariaLabel || option.label"
      @click="$emit('update:modelValue', option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useTabletViewport } from '@/composables/useTabletViewport'

const props = defineProps({
  modelValue: {
    type: String,
    default: 'goods'
  },
  ariaLabel: {
    type: String,
    default: '首页内容切换'
  },
  options: {
    type: Array,
    default: () => ([
      { value: 'goods', label: '收藏' },
      { value: 'wishlist', label: '心愿' },
      { value: 'stats', label: '统计' }
    ])
  }
})

defineEmits(['update:modelValue'])

const modeSwitchRef = ref(null)
const indicatorRef = ref(null)
const isArcAnimating = ref(false)
const lastDisplacement = ref(0)
const prefersReducedMotion = ref(false)
const indicatorAnimation = ref(null)

const { isTabletViewport, viewportWidth } = useTabletViewport()

let reducedMotionQuery = null

function handleReducedMotionChange(event) {
  prefersReducedMotion.value = event.matches
}

onMounted(() => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return
  }

  reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  prefersReducedMotion.value = reducedMotionQuery.matches

  if (typeof reducedMotionQuery.addEventListener === 'function') {
    reducedMotionQuery.addEventListener('change', handleReducedMotionChange)
    return
  }

  if (typeof reducedMotionQuery.addListener === 'function') {
    reducedMotionQuery.addListener(handleReducedMotionChange)
  }
})

onBeforeUnmount(() => {
  indicatorAnimation.value?.cancel()

  if (!reducedMotionQuery) {
    return
  }

  if (typeof reducedMotionQuery.removeEventListener === 'function') {
    reducedMotionQuery.removeEventListener('change', handleReducedMotionChange)
    return
  }

  if (typeof reducedMotionQuery.removeListener === 'function') {
    reducedMotionQuery.removeListener(handleReducedMotionChange)
  }
})

const normalizedOptions = computed(() =>
  props.options.map((option) => ({
    value: option.value,
    label: option.label,
    ariaLabel: option.ariaLabel || option.label
  }))
)

const currentIndex = computed(() => {
  const index = normalizedOptions.value.findIndex((option) => option.value === props.modelValue)
  return index >= 0 ? index : 0
})

const modeSwitchClasses = computed(() => ({
  'mode-switch--tablet': isTabletViewport.value,
  'mode-switch--long-distance': isTabletViewport.value && lastDisplacement.value >= 2
}))

function getTabletDurationMs(displacement) {
  const width = viewportWidth.value || (typeof window === 'undefined' ? 900 : window.innerWidth)
  const normalizedWidth = Math.min(Math.max(width, 900), 1400)
  const displacementBoost = Math.min(Math.max(displacement, 1), 2) * 16
  const viewportBoost = ((normalizedWidth - 900) / 500) * 8
  const duration = 272 + displacementBoost + viewportBoost
  return Math.round(Math.min(Math.max(duration, 280), 320))
}

function parsePx(value, fallback = 0) {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function getIndicatorMetrics() {
  if (!modeSwitchRef.value) {
    return null
  }

  const rootStyle = window.getComputedStyle(modeSwitchRef.value)
  const count = Math.max(normalizedOptions.value.length, 1)
  const gap = parsePx(rootStyle.columnGap || rootStyle.gap, 6)
  const pad = parsePx(rootStyle.getPropertyValue('--mode-switch-pad'), 4)
  const trackWidth = modeSwitchRef.value.clientWidth - (pad * 2)

  if (trackWidth <= 0) {
    return null
  }

  const indicatorWidth = (trackWidth - (gap * (count - 1))) / count
  const step = indicatorWidth + gap

  if (!Number.isFinite(step) || step <= 0) {
    return null
  }

  return { step }
}

function animateIndicatorArc(fromIndex, toIndex, displacement, durationMs) {
  if (!indicatorRef.value || typeof indicatorRef.value.animate !== 'function') {
    return
  }

  const metrics = getIndicatorMetrics()
  if (!metrics) {
    return
  }

  const fromX = fromIndex * metrics.step
  const toX = toIndex * metrics.step
  const midpointX = (fromX + toX) / 2
  const arcHeight = Math.min(14, 6 + (Math.min(displacement, 2) * 3))
  const blurAmount = displacement >= 2 ? 0.7 : 0.35
  const opacityDip = displacement >= 2 ? 0.94 : 0.97

  indicatorAnimation.value?.cancel()
  isArcAnimating.value = true

  indicatorAnimation.value = indicatorRef.value.animate(
    [
      {
        transform: `translate3d(${fromX}px, 0px, 0px)`,
        filter: 'blur(0px)',
        opacity: 1,
        offset: 0
      },
      {
        transform: `translate3d(${midpointX}px, ${-arcHeight}px, 0px)`,
        filter: `blur(${blurAmount}px)`,
        opacity: opacityDip,
        offset: 0.5
      },
      {
        transform: `translate3d(${toX}px, 0px, 0px)`,
        filter: 'blur(0px)',
        opacity: 1,
        offset: 1
      }
    ],
    {
      duration: durationMs,
      easing: 'cubic-bezier(0.15, 0.85, 0.35, 1)',
      fill: 'forwards'
    }
  )

  indicatorAnimation.value.onfinish = () => {
    isArcAnimating.value = false
    indicatorAnimation.value = null
  }

  indicatorAnimation.value.oncancel = () => {
    isArcAnimating.value = false
    indicatorAnimation.value = null
  }
}

watch(currentIndex, async (nextIndex, previousIndex) => {
  const displacement = Math.abs(nextIndex - previousIndex)
  lastDisplacement.value = displacement

  const shouldUseArc = isTabletViewport.value && !prefersReducedMotion.value && displacement > 0
  if (!shouldUseArc) {
    indicatorAnimation.value?.cancel()
    isArcAnimating.value = false
    return
  }

  await nextTick()
  animateIndicatorArc(previousIndex, nextIndex, displacement, getTabletDurationMs(displacement))
})

const modeSwitchStyle = computed(() => {
  const tabletDuration = getTabletDurationMs(lastDisplacement.value)

  return {
    '--mode-switch-index': currentIndex.value,
    '--mode-switch-count': normalizedOptions.value.length || 1,
    '--mode-switch-duration': isTabletViewport.value ? `${tabletDuration}ms` : '220ms',
    '--mode-switch-ease': isTabletViewport.value
      ? 'cubic-bezier(0.15, 0.85, 0.35, 1)'
      : 'var(--home-motion-ease-emphasis)'
  }
})
</script>

<style scoped>
.mode-switch {
  --mode-switch-gap: 6px;
  --mode-switch-pad: 4px;
  --mode-switch-height: 32px;
  --mode-switch-duration: 220ms;
  --mode-switch-ease: var(--home-motion-ease-emphasis);
  --mode-switch-count: 3;
  --mode-switch-index: 0;
  position: relative;
  display: inline-grid;
  grid-template-columns: repeat(var(--mode-switch-count, 3), minmax(0, 1fr));
  gap: var(--mode-switch-gap);
  padding: var(--mode-switch-pad);
  border-radius: 999px;
  background: var(--app-glass);
  box-shadow: var(--app-shadow);
  contain: paint;
}

.mode-switch__indicator {
  position: absolute;
  top: var(--mode-switch-pad, 4px);
  left: var(--mode-switch-pad, 4px);
  height: var(--mode-switch-height, 32px);
  width: calc(
    (100% - (var(--mode-switch-gap, 6px) * (var(--mode-switch-count, 3) - 1)) - (var(--mode-switch-pad, 4px) * 2))
    / var(--mode-switch-count, 3)
  );
  border-radius: 999px;
  background: #141416;
  transform: translate3d(calc((100% + var(--mode-switch-gap, 6px)) * var(--mode-switch-index, 0)), 0, 0) translateZ(0);
  transition:
    transform var(--mode-switch-duration) var(--mode-switch-ease),
    filter var(--mode-switch-duration) var(--mode-switch-ease),
    opacity var(--mode-switch-duration) var(--mode-switch-ease),
    background var(--home-motion-density-duration) var(--home-motion-ease-standard),
    box-shadow var(--home-motion-density-duration) var(--home-motion-ease-standard);
  box-shadow: 0 6px 14px rgba(20, 20, 22, 0.12);
  will-change: transform, filter, opacity;
  pointer-events: none;
  z-index: 0;
}

.mode-switch__indicator--animating {
  transition:
    background var(--home-motion-density-duration) var(--home-motion-ease-standard),
    box-shadow var(--home-motion-density-duration) var(--home-motion-ease-standard);
}

.mode-switch--tablet.mode-switch--long-distance .mode-switch__indicator {
  box-shadow: 0 8px 18px rgba(20, 20, 22, 0.14);
}

.mode-switch__item {
  position: relative;
  z-index: 1;
  min-width: 58px;
  height: var(--mode-switch-height, 32px);
  padding: 0 12px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 600;
  transition:
    transform var(--home-motion-density-duration) var(--home-motion-ease-standard),
    color var(--home-motion-density-duration) var(--home-motion-ease-standard);
}

.mode-switch__item:active {
  transform: scale(0.96);
}

.mode-switch__item--active {
  color: #ffffff;
}

@media (prefers-reduced-motion: reduce) {
  .mode-switch__indicator {
    filter: none !important;
    opacity: 1 !important;
  }
}
</style>
