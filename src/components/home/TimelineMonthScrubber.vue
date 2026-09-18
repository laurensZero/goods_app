<template>
  <template v-if="enabled && months.length > 0">
    <!-- 右侧位置指示条：仅滚动时显示；点按/按住打开侧边年月条 -->
    <div
      v-show="indicatorVisible || scrubbing"
      class="tl-scrub-indicator"
      :class="{ 'tl-scrub-indicator--scrubbing': scrubbing }"
      :style="indicatorStyle"
      role="button"
      :aria-label="t('home.timeline.scrubHint')"
      @pointerdown="onIndicatorPointerDown"
    >
      <div class="tl-scrub-indicator__thumb" />
    </div>

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

      <div ref="railEl" class="tl-scrub-rail" :class="`tl-scrub-rail--${side}`">
        <div
          v-for="group in yearGroups"
          :key="group.year"
          class="tl-scrub-year-block"
          :style="yearBlockStyle(group)"
        >
          <div class="tl-scrub-year-label">{{ group.year }}</div>
          <div class="tl-scrub-ticks">
            <div
              v-for="m in group.months"
              :key="m.yearMonth"
              class="tl-scrub-tick"
              :class="{ 'tl-scrub-tick--active': m.index === activeIndex }"
            />
          </div>
        </div>
      </div>

      <div class="tl-scrub-preview" :class="`tl-scrub-preview--${side}`" aria-live="polite">
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
  getScrollEl: { type: Function, default: () => null },
  /** 页面根选择器，KeepAlive 多页时用于限定查询范围，如 .home-page */
  rootSelector: { type: String, default: '' },
  monthAtOffset: { type: Function, default: null },
  offsetOfMonth: { type: Function, default: null }
})

const emit = defineEmits(['scrub-start', 'scrub-end'])

const { t } = useI18n()

const INDICATOR_HIDE_MS = 900
const RAIL_TOP_RATIO = 0.1
const RAIL_BOTTOM_RATIO = 0.12
const SCROLL_TOP_PAD = 20
const THUMB_H = 44
const TRACK_TOP = 88
const TRACK_BOTTOM = 100

const scrubbing = ref(false)
const side = ref('right')
const activeIndex = ref(0)
const railEl = ref(null)
const indicatorVisible = ref(false)
const scrollProgress = ref(0)

let activePointerId = -1
let scrollPrevented = false
let rafJump = 0
let lastJumpIndex = -1
let hideTimer = 0
let scrollRaf = 0
let hasScrubMoved = false
let boundScrollEls = []

function isConnected(el) {
  return Boolean(el && el.isConnected !== false)
}

/** 只解析「当前页」的滚动容器，避免 KeepAlive 下查到别的 .page-body */
function resolveScroller() {
  const fromProps = props.getScrollEl?.()
  if (isConnected(fromProps)) return fromProps

  const sectionEl = props.getSectionEl?.()
  const fromSection = sectionEl?.closest?.('.page-body')
  if (isConnected(fromSection)) return fromSection

  if (props.rootSelector) {
    return document.querySelector(`${props.rootSelector} .page-body`)
  }
  return null
}

function isWindowLikeScroller(el) {
  return !el
    || el === window
    || el === document
    || el === document.scrollingElement
    || el === document.documentElement
    || el === document.body
}

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

const yearGroups = computed(() => {
  const groups = []
  const map = new Map()
  props.months.forEach((m, index) => {
    let group = map.get(m.year)
    if (!group) {
      group = { year: m.year, months: [] }
      map.set(m.year, group)
      groups.push(group)
    }
    group.months.push({ yearMonth: m.yearMonth, month: m.month, index, count: m.count })
  })
  return groups
})

function yearBlockStyle(group) {
  return {
    flexGrow: String(Math.max(1, group.months.length)),
    flexShrink: '1',
    flexBasis: '0'
  }
}

/** 右侧小滚动条：仅指示当前位置（translate3d + 过渡，避免生硬跳位） */
const indicatorStyle = computed(() => {
  const trackTop = TRACK_TOP
  const trackBottom = TRACK_BOTTOM
  const trackH = Math.max(48, (typeof window !== 'undefined' ? window.innerHeight : 800) - trackTop - trackBottom)
  const maxTop = Math.max(0, trackH - THUMB_H)
  const y = scrollProgress.value * maxTop
  return {
    top: `${trackTop}px`,
    height: `${THUMB_H}px`,
    transform: `translate3d(0, ${y.toFixed(2)}px, 0)`
  }
})

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

function quoteAttr(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function findMonthEl(yearMonth) {
  const selector = `[data-tl-month="${quoteAttr(yearMonth)}"]`
  // 只在本页时间线容器内查找，防止命中其它 KeepAlive 页的同名节点
  const sectionEl = props.getSectionEl?.()
  if (isConnected(sectionEl)) {
    return sectionEl.querySelector(selector) || null
  }
  if (props.rootSelector) {
    return document.querySelector(`${props.rootSelector} ${selector}`)
  }
  return null
}

/* ---- 平滑滚动：缓动插值，避免跳月生硬 ---- */
let scrollAnimState = null
let indicatorLerpRaf = 0
let indicatorLerpTarget = 0

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3)
}

function easeOutQuint(t) {
  return 1 - Math.pow(1 - t, 5)
}

function cancelScrollAnim() {
  if (!scrollAnimState) return
  if (scrollAnimState.raf) window.cancelAnimationFrame(scrollAnimState.raf)
  scrollAnimState = null
}

function readWindowScrollTop() {
  return window.scrollY || document.documentElement.scrollTop || 0
}

function writeScrollTop(scroller, value) {
  const next = Math.max(0, value)
  const isWindowScroller = scroller === document.scrollingElement
    || scroller === document.documentElement
    || scroller === document.body
  if (isWindowScroller) {
    window.scrollTo(0, next)
    return
  }
  try { scroller.scrollTop = next } catch {}
}

/**
 * 平滑滚到目标位置。
 * 拖动中用短时 ease-out（跟手又不硬切）；松手 settle 稍长一点。
 */
function animateScrollTo(scroller, target, { settle = false } = {}) {
  cancelScrollAnim()
  const maxScroll = Math.max(0, (scroller.scrollHeight || 0) - (scroller.clientHeight || 0))
  const to = Math.min(maxScroll, Math.max(0, target))
  const from = scroller.scrollTop
  const delta = to - from
  if (Math.abs(delta) < 0.8) return

  const dist = Math.abs(delta)
  // 拖动：140–220ms；松手 settle：200–320ms。大位移稍长，但设上限防拖沓
  const base = settle ? 200 : 140
  const span = settle ? 120 : 80
  const duration = Math.min(base + span, base + dist * 0.06)
  const ease = settle ? easeOutQuint : easeOutCubic
  const start = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()

  const step = (now) => {
    if (!scrollAnimState) return
    const t = Math.min(1, (now - start) / duration)
    const value = from + delta * ease(t)
    writeScrollTop(scroller, value)
    if (t < 1) {
      scrollAnimState.raf = window.requestAnimationFrame(step)
    } else {
      writeScrollTop(scroller, to)
      scrollAnimState = null
    }
  }

  scrollAnimState = {
    raf: window.requestAnimationFrame(step),
    scroller
  }
}

/** 指示条位置用 lerp 跟随，比逐帧改 top 更顺 */
function setIndicatorProgress(progress, { smooth = true } = {}) {
  const next = Math.min(1, Math.max(0, progress))
  indicatorLerpTarget = next
  if (!smooth) {
    scrollProgress.value = next
    return
  }
  if (indicatorLerpRaf) return
  const tick = () => {
    const cur = scrollProgress.value
    const diff = indicatorLerpTarget - cur
    if (Math.abs(diff) < 0.001) {
      scrollProgress.value = indicatorLerpTarget
      indicatorLerpRaf = 0
      return
    }
    // 约 0.18s 收敛
    scrollProgress.value = cur + diff * 0.22
    indicatorLerpRaf = window.requestAnimationFrame(tick)
  }
  indicatorLerpRaf = window.requestAnimationFrame(tick)
}

/** 根据当前滚动位置推算月份索引与进度（指示条须跟手跟随列表滚动） */
function syncFromScroll() {
  const scroller = resolveScroller()
  const sectionEl = props.getSectionEl?.()
  if (!scroller || !isConnected(sectionEl) || props.months.length === 0) return

  const scrollRect = scroller.getBoundingClientRect()
  const sectionRect = sectionEl.getBoundingClientRect()
  // 视口顶在时间线内容坐标系中的偏移
  const offsetInSection = scrollRect.top - sectionRect.top
  const sectionH = sectionEl.offsetHeight || 1
  const progress = Math.min(1, Math.max(0, offsetInSection / sectionH))

  // 手动滚动时直接跟手，不用 lerp 拖尾
  setIndicatorProgress(progress, { smooth: false })

  let index = 0
  if (typeof props.monthAtOffset === 'function') {
    index = props.monthAtOffset(Math.max(0, offsetInSection), props.months)
  } else {
    // 无 metrics 时用 DOM 月份块位置估算
    index = monthIndexFromScroll(offsetInSection)
  }
  const maxIndex = props.months.length - 1
  activeIndex.value = Math.min(maxIndex, Math.max(0, index))
}

function monthIndexFromScroll(offsetInSection) {
  const sectionEl = props.getSectionEl?.()
  if (!isConnected(sectionEl) || props.months.length === 0) return 0
  const sectionRect = sectionEl.getBoundingClientRect()
  let best = 0
  for (let i = 0; i < props.months.length; i++) {
    const el = sectionEl.querySelector(`[data-tl-month="${quoteAttr(props.months[i].yearMonth)}"]`)
    if (!el) continue
    const top = el.getBoundingClientRect().top - sectionRect.top
    if (top <= offsetInSection + 8) best = i
    else break
  }
  return best
}

function showIndicator() {
  if (!props.enabled) {
    indicatorVisible.value = false
    return
  }
  indicatorVisible.value = true
  if (hideTimer) {
    window.clearTimeout(hideTimer)
    hideTimer = 0
  }
  if (!scrubbing.value) {
    hideTimer = window.setTimeout(() => {
      if (!scrubbing.value) indicatorVisible.value = false
    }, INDICATOR_HIDE_MS)
  }
}

function onScroll() {
  if (!props.enabled || scrubbing.value) return
  if (scrollRaf) return
  scrollRaf = window.requestAnimationFrame(() => {
    scrollRaf = 0
    if (!props.enabled || scrubbing.value) return
    syncFromScroll()
    showIndicator()
  })
}

function bindScroll() {
  unbindScroll()
  if (!props.enabled) return

  const primary = resolveScroller()
  const els = []
  if (primary && !isWindowLikeScroller(primary)) {
    els.push(primary)
  } else {
    // 滚动确实在 window 时才监听 window，避免其它 KeepAlive 页滚动误触发
    els.push(window)
  }

  for (const el of els) {
    el.addEventListener('scroll', onScroll, { passive: true })
    boundScrollEls.push(el)
  }
}

function unbindScroll() {
  for (const el of boundScrollEls) {
    try { el.removeEventListener('scroll', onScroll) } catch {}
  }
  boundScrollEls = []
}

function rebindScroll() {
  unbindScroll()
  if (props.enabled) bindScroll()
}

/** 点按右侧小滚动条 → 打开侧边年份条（首次点击不跳转，仅展示当前位置） */
function onIndicatorPointerDown(event) {
  if (!props.enabled || props.months.length === 0) return
  if (event.pointerType === 'mouse' && event.button !== 0) return
  event.preventDefault()
  event.stopPropagation()

  if (hideTimer) {
    window.clearTimeout(hideTimer)
    hideTimer = 0
  }

  // 只同步当前滚动对应的月份，打开侧边条，不按触点 Y 跳转
  syncFromScroll()
  side.value = 'right'
  scrubbing.value = true
  indicatorVisible.value = true
  activePointerId = event.pointerId
  setScrollLock(true)
  bindScrubPointerWatch()
  emit('scrub-start')

  const max = Math.max(1, props.months.length - 1)
  setIndicatorProgress(props.months.length <= 1 ? 0 : activeIndex.value / max, { smooth: false })
  // 手指尚未滑动时保持原位；开始 move 才按 rail Y 选月并滚动
  hasScrubMoved = false
}

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
  hasScrubMoved = true
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
  // 已打开后再点/滑侧边条区域：按位置选月
  hasScrubMoved = true
  applyPointerToIndex(event.clientY)
}

function onOverlayPointerMove(event) {
  if (!scrubbing.value) return
  if (activePointerId >= 0 && event.pointerId !== activePointerId) return
  event.preventDefault()
  applyPointerToIndex(event.clientY)
}

function estimateRailRect() {
  const vh = (typeof window !== 'undefined' && window.innerHeight) || 800
  const height = vh * (1 - RAIL_TOP_RATIO - RAIL_BOTTOM_RATIO)
  const top = vh * RAIL_TOP_RATIO
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
    const max = Math.max(1, props.months.length - 1)
    setIndicatorProgress(props.months.length <= 1 ? 0 : next / max, { smooth: false })
    scheduleJumpToIndex(next)
    return
  }
  // 同一格内拖动：不重复跳转
}

function scheduleJumpToIndex(index) {
  lastJumpIndex = index
  if (rafJump) return
  rafJump = window.requestAnimationFrame(() => {
    rafJump = 0
    jumpToIndex(lastJumpIndex, { settle: !scrubbing.value })
  })
}

function jumpToIndex(index, { settle = false } = {}) {
  const month = props.months[index]
  if (!month) return
  const yearMonth = month.yearMonth
  if (!yearMonth) return

  const monthEl = findMonthEl(yearMonth)
  if (monthEl) {
    const scroller = monthEl.closest('.page-body') || resolveScroller()
    if (!scroller || isWindowLikeScroller(scroller)) {
      const winFrom = readWindowScrollTop()
      const y = monthEl.getBoundingClientRect().top + winFrom - SCROLL_TOP_PAD
      animateWindowTo(y, { settle })
      return
    }

    const scrollHeight = scroller.scrollHeight || 0
    const clientHeight = scroller.clientHeight || 0
    if (scrollHeight <= clientHeight + 2) return

    const scrollerRect = scroller.getBoundingClientRect()
    const monthRect = monthEl.getBoundingClientRect()
    const delta = monthRect.top - scrollerRect.top - SCROLL_TOP_PAD
    const next = Math.max(0, (scroller.scrollTop || 0) + delta)
    animateScrollTo(scroller, next, { settle })
    return
  }

  if (typeof props.offsetOfMonth === 'function') {
    const scroller = resolveScroller()
    const sectionEl = props.getSectionEl?.()
    if (!scroller || !isConnected(sectionEl)) return
    const scrollHeight = scroller.scrollHeight || 0
    const clientHeight = scroller.clientHeight || 0
    if (scrollHeight <= clientHeight + 2) return
    const offsetInSection = props.offsetOfMonth(index, props.months)
    const scrollerRect = scroller.getBoundingClientRect()
    const sectionRect = sectionEl.getBoundingClientRect()
    const base = (scroller.scrollTop || 0) + (sectionRect.top - scrollerRect.top)
    animateScrollTo(scroller, base + offsetInSection - SCROLL_TOP_PAD, { settle })
  }
}

function animateWindowTo(targetY, { settle = false } = {}) {
  cancelScrollAnim()
  const winFrom = readWindowScrollTop()
  const to = Math.max(0, targetY)
  const delta = to - winFrom
  if (Math.abs(delta) < 0.8) return
  const dist = Math.abs(delta)
  const base = settle ? 200 : 140
  const duration = Math.min(base + (settle ? 120 : 80), base + dist * 0.06)
  const ease = settle ? easeOutQuint : easeOutCubic
  const start = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
  const step = (now) => {
    if (!scrollAnimState) return
    const t = Math.min(1, (now - start) / duration)
    window.scrollTo(0, winFrom + delta * ease(t))
    if (t < 1) scrollAnimState.raf = window.requestAnimationFrame(step)
    else {
      window.scrollTo(0, to)
      scrollAnimState = null
    }
  }
  scrollAnimState = { raf: window.requestAnimationFrame(step), scroller: window }
}

function endScrub() {
  if (!scrubbing.value) return
  // 仅在用户实际拖动过后才收尾对齐；纯点击打开则停在原位
  if (hasScrubMoved) {
    jumpToIndex(activeIndex.value, { settle: true })
  }
  scrubbing.value = false
  hasScrubMoved = false
  activePointerId = -1
  unbindScrubPointerWatch()
  setScrollLock(false)
  if (rafJump) {
    window.cancelAnimationFrame(rafJump)
    rafJump = 0
  }
  const max = Math.max(1, props.months.length - 1)
  setIndicatorProgress(props.months.length <= 1 ? 0 : activeIndex.value / max, { smooth: true })
  showIndicator()
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

watch(() => props.enabled, () => {
  rebindScroll()
  if (!props.enabled) {
    indicatorVisible.value = false
    cancelScrollAnim()
    endScrub()
    unbindScroll()
  } else {
    // 重新进入本页时同步一次位置，避免指示条停在旧值
    syncFromScroll()
  }
}, { immediate: true })

watch(scrubbing, (val) => {
  if (!val) unbindScrubPointerWatch()
})

onBeforeUnmount(() => {
  unbindScroll()
  unbindScrubPointerWatch()
  setScrollLock(false)
  cancelScrollAnim()
  if (hideTimer) window.clearTimeout(hideTimer)
  if (scrollRaf) window.cancelAnimationFrame(scrollRaf)
  if (rafJump) window.cancelAnimationFrame(rafJump)
  if (indicatorLerpRaf) window.cancelAnimationFrame(indicatorLerpRaf)
  hideTimer = 0
  scrollRaf = 0
  rafJump = 0
  indicatorLerpRaf = 0
})
</script>

<style scoped>
/* 右侧位置指示条：滚动时才出现，点按打开侧边年月条 */
.tl-scrub-indicator {
  position: fixed;
  /* 贴边，拇指靠右；热区比视觉更宽，方便安卓点按 */
  right: 0;
  z-index: 115;
  width: 36px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-right: 2px;
  touch-action: none;
  cursor: pointer;
  opacity: 0.92;
  will-change: transform, opacity;
  /* 位置由 JS 每帧写 translate3d，这里不做 transform 过渡，保证手动滚动跟手 */
  transition: opacity 0.28s ease;
}

.tl-scrub-indicator__thumb {
  width: 6px;
  height: 100%;
  min-height: 44px;
  margin-right: 2px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-text) 42%, transparent);
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--app-surface) 45%, transparent),
    0 2px 8px rgba(0, 0, 0, 0.14);
  pointer-events: none;
  transition:
    width 0.16s cubic-bezier(0.22, 1, 0.36, 1),
    background 0.16s ease,
    opacity 0.16s ease;
}

.tl-scrub-indicator--scrubbing {
  opacity: 1;
}

.tl-scrub-indicator--scrubbing .tl-scrub-indicator__thumb {
  width: 8px;
  background: color-mix(in srgb, var(--app-text) 72%, transparent);
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
  animation: scrub-dim-in 0.22s ease both;
}

@keyframes scrub-dim-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.tl-scrub-rail {
  position: absolute;
  top: 10vh;
  bottom: 12vh;
  display: flex;
  flex-direction: column;
  width: 52px;
  padding: 10px 6px;
  border-radius: 26px;
  background: color-mix(in srgb, var(--app-glass-strong) 92%, transparent);
  border: 1px solid var(--app-glass-border);
  box-shadow: var(--app-shadow-lg);
  backdrop-filter: blur(var(--app-frost-soft-blur)) saturate(var(--app-frost-saturate-soft));
  -webkit-backdrop-filter: blur(var(--app-frost-soft-blur)) saturate(var(--app-frost-saturate-soft));
  pointer-events: none;
  overflow: hidden;
  will-change: transform, opacity;
  animation: scrub-rail-in 0.24s cubic-bezier(0.22, 1, 0.36, 1) both;
}

@keyframes scrub-rail-in {
  from {
    opacity: 0;
    transform: translate3d(12px, 0, 0) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
  }
}

.tl-scrub-rail--left {
  left: 8px;
}

.tl-scrub-rail--right {
  right: 8px;
}

.tl-scrub-year-block {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 18px;
  margin: 3px 0;
}

.tl-scrub-year-label {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1;
  text-align: center;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: 0.02em;
  color: var(--app-text);
  pointer-events: none;
  text-shadow:
    0 0 6px color-mix(in srgb, var(--app-glass-strong) 90%, transparent),
    0 0 2px var(--app-surface);
}

.tl-scrub-ticks {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: stretch;
  align-items: center;
  padding-top: 16px;
  gap: 0;
}

.tl-scrub-tick {
  flex: 1 1 0;
  width: 10px;
  min-height: 3px;
  max-height: 4px;
  margin: auto 0;
  border-radius: 2px;
  background: color-mix(in srgb, var(--app-text-tertiary) 48%, transparent);
  transition:
    width 0.16s cubic-bezier(0.22, 1, 0.36, 1),
    max-height 0.16s ease,
    background 0.16s ease,
    box-shadow 0.16s ease;
}

.tl-scrub-tick--active {
  width: 20px;
  max-height: 5px;
  height: 4px;
  background: var(--app-text);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--app-text) 14%, transparent);
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
  will-change: transform, opacity;
  animation: scrub-preview-in 0.24s cubic-bezier(0.22, 1, 0.36, 1) both;
}

@keyframes scrub-preview-in {
  from {
    opacity: 0;
    transform: translateY(-50%) scale(0.92);
  }
  to {
    opacity: 1;
    transform: translateY(-50%) scale(1);
  }
}

.tl-scrub-preview--left {
  left: 68px;
}

.tl-scrub-preview--right {
  right: 68px;
}

.tl-scrub-preview-year {
  font-size: 13px;
  font-weight: 650;
  color: var(--app-text-tertiary);
  letter-spacing: 0.04em;
  margin-bottom: 4px;
  transition: opacity 0.15s ease;
}

.tl-scrub-preview-month {
  font-size: 28px;
  font-weight: 700;
  color: var(--app-text);
  letter-spacing: -0.03em;
  line-height: 1.1;
  transition: opacity 0.15s ease, transform 0.18s cubic-bezier(0.22, 1, 0.36, 1);
}

.tl-scrub-preview-meta {
  margin-top: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--app-text-secondary);
  transition: opacity 0.15s ease;
}

@media (max-height: 640px) {
  .tl-scrub-preview-month {
    font-size: 22px;
  }

  .tl-scrub-rail {
    top: 8vh;
    bottom: 10vh;
    width: 46px;
  }

  .tl-scrub-year-label {
    font-size: 11px;
  }
}
</style>
