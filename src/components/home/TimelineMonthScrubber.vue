<template>
  <template v-if="enabled && months.length > 0">
    <!-- 左右长按热区 -->
    <div
      class="tl-scrub-edge tl-scrub-edge--left"
      :class="{ 'tl-scrub-edge--armed': !scrubbing }"
      :aria-label="t('home.timeline.scrubHint')"
      @pointerdown="onEdgePointerDown($event, 'left')"
    />
    <div
      class="tl-scrub-edge tl-scrub-edge--right"
      :class="{ 'tl-scrub-edge--armed': !scrubbing }"
      :aria-label="t('home.timeline.scrubHint')"
      @pointerdown="onEdgePointerDown($event, 'right')"
    />

    <!-- 滑动中：全屏捕获 + 侧边条 + 浮动月份 -->
    <div
      v-if="scrubbing"
      class="tl-scrub-overlay"
      :class="`tl-scrub-overlay--${side}`"
      @pointerdown="onOverlayPointerDown"
      @pointermove="onOverlayPointerMove"
      @pointerup="endScrub"
      @pointercancel="endScrub"
      @contextmenu.prevent
    >
      <div class="tl-scrub-dim" aria-hidden="true" />

      <div
        ref="railEl"
        class="tl-scrub-rail"
        :class="[`tl-scrub-rail--${side}`, { 'tl-scrub-rail--dense': denseRail }]"
        :style="railStyle"
      >
        <div
          v-for="row in railRows"
          :key="row.key"
          class="tl-scrub-row"
          :class="{
            'tl-scrub-row--year': row.type === 'year',
            'tl-scrub-row--month': row.type === 'month',
            'tl-scrub-row--active': row.type === 'month' && row.index === activeIndex
          }"
        >
          <template v-if="row.type === 'year'">
            <span class="tl-scrub-year">{{ row.year }}</span>
          </template>
          <template v-else>
            <span class="tl-scrub-tick" aria-hidden="true" />
            <span class="tl-scrub-month">{{ row.monthLabel }}</span>
          </template>
        </div>
      </div>

      <div
        class="tl-scrub-preview"
        :class="`tl-scrub-preview--${side}`"
        aria-live="polite"
      >
        <div class="tl-scrub-preview-year">{{ activeYear }}</div>
        <div class="tl-scrub-preview-month">{{ activeMonthLabel }}</div>
        <div v-if="activeMeta" class="tl-scrub-preview-meta">{{ activeMeta }}</div>
      </div>
    </div>
  </template>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatMonthLabel } from '@/utils/format'
import { monthIndexFromRailRatio } from '@/utils/goods/timelineScrubber'

const props = defineProps({
  months: { type: Array, required: true },
  enabled: { type: Boolean, default: true },
  getSectionEl: { type: Function, default: () => null },
  getScrollEl: { type: Function, default: () => null }
})

const emit = defineEmits(['scrub-start', 'scrub-end'])

const { t } = useI18n()

const LONG_PRESS_MS = 380
const LONG_PRESS_SLOP = 12
const RAIL_MIN_ITEM = 18
const RAIL_MAX_HEIGHT_RATIO = 0.62

const scrubbing = ref(false)
const side = ref('left')
const activeIndex = ref(0)
const railEl = ref(null)

let longPressTimer = 0
let edgePointerId = -1
let edgeStartX = 0
let edgeStartY = 0
let activePointerId = -1
let scrollPrevented = false
let rafJump = 0
let lastJumpIndex = -1

const activeMonth = computed(() => props.months[activeIndex.value] || props.months[0] || null)
const activeYear = computed(() => activeMonth.value?.year || '')
const activeMonthLabel = computed(() => {
  if (!activeMonth.value) return ''
  return formatMonthLabel(activeMonth.value.month)
})
const activeMeta = computed(() => {
  if (!activeMonth.value) return ''
  return t('leaderboard.items', { count: activeMonth.value.count || 0 })
})

/** 侧边条行：年份标题 + 月份行（按展示顺序，与 allTimelineMonthList 一致） */
const railRows = computed(() => {
  const rows = []
  let lastYear = null
  props.months.forEach((m, index) => {
    if (m.year !== lastYear) {
      rows.push({ type: 'year', key: `y-${m.year}-${index}`, year: m.year })
      lastYear = m.year
    }
    rows.push({
      type: 'month',
      key: m.yearMonth,
      index,
      monthLabel: padMonth(m.month)
    })
  })
  return rows
})

const denseRail = computed(() => props.months.length > 28)

const railStyle = computed(() => {
  const count = Math.max(1, props.months.length)
  const years = new Set(props.months.map((m) => m.year)).size
  const desired = count * RAIL_MIN_ITEM + years * 22 + 24
  const maxHeight = Math.round((typeof window !== 'undefined' ? window.innerHeight : 800) * RAIL_MAX_HEIGHT_RATIO)
  return {
    maxHeight: `${Math.min(maxHeight, Math.max(160, desired))}px`
  }
})

function padMonth(month) {
  const n = Number(month)
  return Number.isInteger(n) && n >= 1 && n <= 9 ? `0${n}` : String(month ?? '')
}

function clearLongPress() {
  if (longPressTimer) {
    window.clearTimeout(longPressTimer)
    longPressTimer = 0
  }
}

function preventTouchScroll(event) {
  if (scrollPrevented && event.cancelable) event.preventDefault()
}

function setScrollLock(enabled) {
  if (enabled === scrollPrevented) return
  scrollPrevented = enabled
  if (enabled) {
    document.addEventListener('touchmove', preventTouchScroll, { passive: false })
  } else {
    document.removeEventListener('touchmove', preventTouchScroll)
  }
}

function vibrate(ms = 8) {
  try {
    navigator.vibrate?.(ms)
  } catch {}
}

function onEdgePointerDown(event, edgeSide) {
  if (!props.enabled || props.months.length === 0 || scrubbing.value) return
  if (event.pointerType === 'mouse' && event.button !== 0) return

  edgePointerId = event.pointerId
  edgeStartX = event.clientX
  edgeStartY = event.clientY
  side.value = edgeSide
  clearLongPress()
  bindEdgeMoveWatch()

  const clientY = event.clientY
  longPressTimer = window.setTimeout(() => {
    longPressTimer = 0
    beginScrub(edgeSide, clientY)
  }, LONG_PRESS_MS)
}

function onEdgePointerMoveDuringPress(event) {
  if (!longPressTimer || event.pointerId !== edgePointerId) return
  const dx = Math.abs(event.clientX - edgeStartX)
  const dy = Math.abs(event.clientY - edgeStartY)
  if (dx > LONG_PRESS_SLOP || dy > LONG_PRESS_SLOP) {
    clearLongPress()
  }
}

// 在 capture 阶段监听 edge 的移动，避免滚动时误触发
function bindEdgeMoveWatch() {
  window.addEventListener('pointermove', onEdgePointerMoveDuringPress, true)
  window.addEventListener('pointerup', onEdgePointerUpWatch, true)
  window.addEventListener('pointercancel', onEdgePointerUpWatch, true)
}

function unbindEdgeMoveWatch() {
  window.removeEventListener('pointermove', onEdgePointerMoveDuringPress, true)
  window.removeEventListener('pointerup', onEdgePointerUpWatch, true)
  window.removeEventListener('pointercancel', onEdgePointerUpWatch, true)
}

function onEdgePointerUpWatch() {
  clearLongPress()
  if (!scrubbing.value) unbindEdgeMoveWatch()
}

function beginScrub(edgeSide, clientY) {
  if (props.months.length === 0) return
  side.value = edgeSide
  scrubbing.value = true
  activePointerId = edgePointerId
  setScrollLock(true)
  bindScrubPointerWatch()
  emit('scrub-start')

  // 打开当帧 rail 可能尚未挂载，先用估算几何选中附近月份
  const index = resolveIndexFromClientY(clientY)
  if (Number.isFinite(index)) {
    activeIndex.value = index
    scheduleJumpToIndex(index)
  }
}

/** scrub 期间的全局指针监听：触摸目标仍是 edge，不能只靠 overlay */
function bindScrubPointerWatch() {
  window.addEventListener('pointermove', onGlobalScrubPointerMove, true)
  window.addEventListener('pointerup', onGlobalScrubPointerUp, true)
  window.addEventListener('pointercancel', onGlobalScrubPointerUp, true)
}

function unbindScrubPointerWatch() {
  window.removeEventListener('pointermove', onGlobalScrubPointerMove, true)
  window.removeEventListener('pointerup', onGlobalScrubPointerUp, true)
  window.removeEventListener('pointercancel', onGlobalScrubPointerUp, true)
}

function onGlobalScrubPointerMove(event) {
  if (!scrubbing.value) return
  if (activePointerId >= 0 && event.pointerId !== activePointerId) return
  if (event.cancelable) event.preventDefault()
  applyPointerToIndex(event.clientY)
}

function onGlobalScrubPointerUp(event) {
  if (!scrubbing.value) return
  if (activePointerId >= 0 && event.pointerId !== activePointerId) return
  endScrub()
}

function onOverlayPointerDown(event) {
  if (!scrubbing.value) return
  event.preventDefault()
  activePointerId = event.pointerId
  applyPointerToIndex(event.clientY)
}

function onOverlayPointerMove(event) {
  if (!scrubbing.value) return
  if (activePointerId >= 0 && event.pointerId !== activePointerId) return
  event.preventDefault()
  applyPointerToIndex(event.clientY)
}

function estimateRailRect() {
  const count = Math.max(1, props.months.length)
  const years = new Set(props.months.map((m) => m.year)).size
  const desired = count * RAIL_MIN_ITEM + years * 22 + 24
  const maxHeight = Math.round((typeof window !== 'undefined' ? window.innerHeight : 800) * RAIL_MAX_HEIGHT_RATIO)
  const height = Math.min(maxHeight, Math.max(160, desired))
  const top = ((typeof window !== 'undefined' ? window.innerHeight : 800) - height) / 2
  return { top, height }
}

function resolveIndexFromClientY(clientY) {
  if (props.months.length === 0) return 0
  let rect = railEl.value?.getBoundingClientRect?.()
  if (!rect || !(rect.height > 0)) {
    rect = estimateRailRect()
  }
  if (!(rect.height > 0)) return 0
  const ratio = (clientY - rect.top) / rect.height
  return monthIndexFromRailRatio(ratio, props.months.length)
}

function applyPointerToIndex(clientY) {
  const next = resolveIndexFromClientY(clientY)
  if (next !== activeIndex.value) {
    activeIndex.value = next
    vibrate(6)
  }
  scheduleJumpToIndex(next)
}

function scheduleJumpToIndex(index) {
  lastJumpIndex = index
  if (rafJump) return
  rafJump = window.requestAnimationFrame(() => {
    rafJump = 0
    jumpToIndex(lastJumpIndex)
  })
}

function jumpToIndex(index) {
  const month = props.months[index]
  if (!month) return

  const sectionEl = props.getSectionEl?.()
  const scrollEl = props.getScrollEl?.()
  if (!sectionEl || !scrollEl) return

  const monthEl = sectionEl.querySelector(`[data-tl-month="${cssEscape(month.yearMonth)}"]`)
  if (!monthEl) return

  const scrollRect = scrollEl.getBoundingClientRect()
  const monthRect = monthEl.getBoundingClientRect()
  const current = scrollEl.scrollTop
  const delta = monthRect.top - scrollRect.top - 12
  const next = Math.max(0, current + delta)
  if (Math.abs(next - current) > 0.5) {
    scrollEl.scrollTop = next
  }
}

function cssEscape(value) {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value)
  }
  return String(value).replace(/"/g, '\\"')
}

function endScrub() {
  if (!scrubbing.value) return
  // 落点再跳一次，确保松手位置准确
  jumpToIndex(activeIndex.value)
  scrubbing.value = false
  activePointerId = -1
  edgePointerId = -1
  clearLongPress()
  unbindEdgeMoveWatch()
  unbindScrubPointerWatch()
  setScrollLock(false)
  if (rafJump) {
    window.cancelAnimationFrame(rafJump)
    rafJump = 0
  }
  emit('scrub-end', {
    index: activeIndex.value,
    yearMonth: activeMonth.value?.yearMonth || null
  })
}

function consumeBack() {
  if (!scrubbing.value) return false
  endScrub()
  return true
}

function close() {
  endScrub()
}

defineExpose({ consumeBack, close })

watch(scrubbing, (val) => {
  if (!val) {
    unbindEdgeMoveWatch()
    unbindScrubPointerWatch()
  }
})

onBeforeUnmount(() => {
  clearLongPress()
  unbindEdgeMoveWatch()
  unbindScrubPointerWatch()
  setScrollLock(false)
  if (rafJump) {
    window.cancelAnimationFrame(rafJump)
    rafJump = 0
  }
})
</script>

<style scoped>
.tl-scrub-edge {
  position: fixed;
  top: env(safe-area-inset-top, 0px);
  /* 避开底部 TabBar / FAB，防止抢点击与滚动 */
  bottom: calc(88px + env(safe-area-inset-bottom, 0px));
  width: 36px;
  /* 低于 TabBar(60)/FAB(65)，不挡导航与添加按钮 */
  z-index: 50;
  /* 热区不锁 touch-action：边缘仍可正常滚动；仅长按成功后由 overlay 锁定 */
  touch-action: auto;
  background: transparent;
}

.tl-scrub-edge--left {
  left: 0;
}

.tl-scrub-edge--right {
  right: 0;
}

.tl-scrub-edge--armed {
  cursor: ns-resize;
}

.tl-scrub-overlay {
  position: fixed;
  inset: 0;
  z-index: 120;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}

.tl-scrub-dim {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--app-overlay) 55%, transparent);
  pointer-events: none;
}

.tl-scrub-rail {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  padding: 12px 8px;
  min-width: 44px;
  max-height: 62vh;
  overflow: hidden;
  border-radius: 22px;
  background: color-mix(in srgb, var(--app-glass-strong) 92%, transparent);
  border: 1px solid var(--app-glass-border);
  box-shadow: var(--app-shadow-lg);
  backdrop-filter: blur(var(--app-frost-soft-blur)) saturate(var(--app-frost-saturate-soft));
  -webkit-backdrop-filter: blur(var(--app-frost-soft-blur)) saturate(var(--app-frost-saturate-soft));
  pointer-events: none;
}

.tl-scrub-rail--left {
  left: 8px;
}

.tl-scrub-rail--right {
  right: 8px;
}

.tl-scrub-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 16px;
  line-height: 1;
}

.tl-scrub-row--year {
  margin-top: 6px;
  justify-content: flex-start;
  padding: 4px 2px 2px;
}

.tl-scrub-row--year:first-child {
  margin-top: 0;
}

.tl-scrub-year {
  font-size: 12px;
  font-weight: 700;
  color: var(--app-text);
  letter-spacing: 0.02em;
}

.tl-scrub-row--month {
  min-height: 14px;
}

.tl-scrub-tick {
  width: 10px;
  height: 2px;
  border-radius: 2px;
  background: color-mix(in srgb, var(--app-text-tertiary) 55%, transparent);
  flex-shrink: 0;
}

.tl-scrub-month {
  font-size: 11px;
  font-weight: 600;
  color: var(--app-text-secondary);
  font-variant-numeric: tabular-nums;
}

/* 过密时淡出非当前月份数字，保留年份锚点 */
.tl-scrub-rail--dense .tl-scrub-row--month:not(.tl-scrub-row--active) .tl-scrub-month {
  opacity: 0.22;
}

.tl-scrub-row--active .tl-scrub-tick {
  width: 16px;
  height: 3px;
  background: var(--app-text);
}

.tl-scrub-row--active .tl-scrub-month {
  color: var(--app-text);
  font-weight: 700;
  font-size: 12px;
}

.tl-scrub-preview {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  min-width: 108px;
  padding: 14px 16px;
  border-radius: 20px;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  box-shadow: var(--app-shadow-xl);
  text-align: center;
  pointer-events: none;
}

.tl-scrub-preview--left {
  left: 64px;
}

.tl-scrub-preview--right {
  right: 64px;
}

.tl-scrub-preview-year {
  font-size: 13px;
  font-weight: 650;
  color: var(--app-text-tertiary);
  letter-spacing: 0.04em;
  margin-bottom: 4px;
}

.tl-scrub-preview-month {
  font-size: 28px;
  font-weight: 700;
  color: var(--app-text);
  letter-spacing: -0.03em;
  line-height: 1.1;
}

.tl-scrub-preview-meta {
  margin-top: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--app-text-secondary);
}

@media (max-height: 640px) {
  .tl-scrub-preview-month {
    font-size: 22px;
  }

  .tl-scrub-rail {
    max-height: 54vh;
  }
}
</style>
