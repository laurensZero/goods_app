<template>
  <section class="goods-header-section">
    <div class="goods-header-row">
      <div class="goods-header-left">
        <p class="section-label">{{ sectionLabel }}</p>
        <h2 class="section-title">{{ title }}<span class="goods-count"> {{ totalQuantity }} 件</span></h2>
      </div>

      <div class="goods-header-btns">
        <button
          type="button"
          :class="[
            'sort-toggle',
            {
              'sort-toggle--asc': sortDirection === 'asc',
              'sort-toggle--animating': isSortAnimating
            }
          ]"
          :aria-label="sortButtonLabel"
          @click="handleSortClick"
          @touchstart.passive="startSortLongPress"
          @touchend="cancelSortLongPress"
          @touchcancel="cancelSortLongPress"
          @mousedown.left="startSortLongPress"
          @mouseup="cancelSortLongPress"
          @mouseleave="cancelSortLongPress"
          @contextmenu.prevent="openSortSheet"
        >
          <svg class="sort-toggle__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <g class="sort-toggle__group sort-toggle__group--up">
              <path d="M7 18V7" />
              <path d="M3.5 10.5L7 7L10.5 10.5" />
            </g>
            <g class="sort-toggle__group sort-toggle__group--down">
              <path d="M17 6V17" />
              <path d="M13.5 13.5L17 17L20.5 13.5" />
            </g>
          </svg>
        </button>

        <button
          v-if="showTimelineToggle"
          type="button"
          :class="['timeline-toggle', { 'timeline-toggle--active': displayDensity === 'timeline' }]"
          aria-label="切换时间线视图"
          @click="$emit('toggle-timeline')"
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 8v4l2.5 2.5" />
            <circle cx="12" cy="12" r="8" />
          </svg>
        </button>
      </div>

      <div
        v-if="displayDensity !== 'timeline'"
        class="density-switch"
        :style="densitySwitchStyle"
        aria-label="展示密度切换"
      >
        <span class="density-switch__indicator" aria-hidden="true" />
        <button
          v-for="mode in densityModes"
          :key="mode.value"
          type="button"
          :class="['density-switch__option', { 'density-switch__option--active': displayDensity === mode.value }]"
          @click="$emit('set-density', mode.value)"
        >
          {{ mode.label }}
        </button>
      </div>
    </div>
  </section>

  <Popup
    v-model:show="showSortSheet"
    teleport="body"
    :position="popupPosition"
    :round="!isTablet"
    overlay-class="sort-sheet-overlay"
    :class="['sort-sheet', { 'sort-sheet--tablet': isTablet }]"
  >
    <div class="sort-sheet__panel">
      <div v-if="!isTablet" class="sort-sheet__handle" />
      <div class="sort-sheet__head">
        <div>
          <p class="sort-sheet__label">排序方式</p>
          <h3 class="sort-sheet__title">{{ currentSortOption.label }}</h3>
        </div>
        <button class="sort-sheet__dir-btn" type="button" @click="handleDirectionToggle">
          {{ currentDirectionLabel }}
        </button>
      </div>

      <div class="sort-sheet__options">
        <button
          v-for="option in sortOptions"
          :key="option.value"
          type="button"
          :class="['sort-sheet__option', { 'sort-sheet__option--active': sortMode === option.value }]"
          @click="selectSortMode(option.value)"
        >
          <span class="sort-sheet__option-name">{{ option.label }}</span>
          <span class="sort-sheet__option-meta">
            {{ sortDirection === 'asc' ? option.ascLabel : option.descLabel }}
          </span>
        </button>
      </div>
    </div>
  </Popup>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Popup } from 'vant'

const LONG_PRESS_DELAY_MS = 420
const TABLET_BREAKPOINT = 900

const props = defineProps({
  sectionLabel: { type: String, default: '我的收藏' },
  title: { type: String, default: '全部谷子' },
  totalQuantity: { type: Number, required: true },
  sortDirection: { type: String, required: true },
  sortMode: { type: String, required: true },
  sortOptions: { type: Array, default: () => [] },
  isSortAnimating: { type: Boolean, default: false },
  displayDensity: { type: String, required: true },
  densityModes: { type: Array, required: true },
  showTimelineToggle: { type: Boolean, default: true }
})

const emit = defineEmits(['toggle-sort', 'toggle-timeline', 'set-density', 'set-sort-mode'])

const showSortSheet = ref(false)
const windowWidth = ref(window.innerWidth)
const isTablet = computed(() => windowWidth.value >= TABLET_BREAKPOINT)
const popupPosition = computed(() => (isTablet.value ? 'center' : 'bottom'))
let sortLongPressTimer = 0
let suppressNextSortClick = false

function handleResize() {
  windowWidth.value = window.innerWidth
}

const currentSortOption = computed(() =>
  props.sortOptions.find((option) => option.value === props.sortMode) || props.sortOptions[0] || {
    label: '排序',
    ascLabel: '升序',
    descLabel: '降序'
  }
)
const currentDirectionLabel = computed(() => (
  props.sortDirection === 'asc' ? currentSortOption.value.ascLabel : currentSortOption.value.descLabel
))
const hasMultipleSortOptions = computed(() => props.sortOptions.length > 1)
const sortButtonLabel = computed(() => (
  hasMultipleSortOptions.value
    ? `当前按${currentSortOption.value.label}${props.sortDirection === 'asc' ? '升序' : '降序'}，点击切换升降序，长按选择排序方式`
    : `当前按${currentSortOption.value.label}${props.sortDirection === 'asc' ? '升序' : '降序'}，点击切换升降序`
))
const densityModeCount = computed(() => Math.max(props.densityModes.length, 1))
const activeDensityIndex = computed(() => {
  const index = props.densityModes.findIndex((mode) => mode.value === props.displayDensity)
  if (index < 0) return 0
  return Math.min(index, densityModeCount.value - 1)
})
const densitySwitchStyle = computed(() => ({
  '--density-switch-count': densityModeCount.value,
  '--density-switch-index': activeDensityIndex.value
}))

function clearSortLongPressTimer() {
  if (!sortLongPressTimer) return
  window.clearTimeout(sortLongPressTimer)
  sortLongPressTimer = 0
}

function openSortSheet() {
  if (!hasMultipleSortOptions.value) return
  clearSortLongPressTimer()
  suppressNextSortClick = true
  showSortSheet.value = true
}

function startSortLongPress() {
  if (!hasMultipleSortOptions.value) return
  clearSortLongPressTimer()
  sortLongPressTimer = window.setTimeout(() => {
    sortLongPressTimer = 0
    openSortSheet()
  }, LONG_PRESS_DELAY_MS)
}

function cancelSortLongPress() {
  clearSortLongPressTimer()
}

function handleSortClick() {
  if (suppressNextSortClick) {
    suppressNextSortClick = false
    return
  }

  emit('toggle-sort')
}

function handleDirectionToggle() {
  emit('toggle-sort')
}

function selectSortMode(value) {
  emit('set-sort-mode', value)
  showSortSheet.value = false
}

onMounted(() => {
  window.addEventListener('resize', handleResize, { passive: true })
})

onBeforeUnmount(() => {
  clearSortLongPressTimer()
  window.removeEventListener('resize', handleResize)
})
</script>

<style scoped>
.goods-header-section {
  padding: 0 var(--page-padding);
  margin-top: var(--section-gap);
}

.goods-header-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 10px;
  margin-bottom: 14px;
}

.goods-header-left {
  flex: 1;
  min-width: 0;
}

.goods-header-btns {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.goods-count {
  margin-left: 4px;
  color: var(--app-text-tertiary);
  font-size: 16px;
  font-weight: 400;
}

.section-label {
  color: var(--app-text-tertiary);
  font-size: 13px;
}

.section-title {
  margin-top: 4px;
  color: var(--app-text);
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.03em;
}

.density-switch {
  flex-basis: 100%;
  position: relative;
  display: grid;
  grid-template-columns: repeat(var(--density-switch-count, 3), minmax(0, 1fr));
  gap: var(--density-switch-gap, 6px);
  padding: var(--density-switch-pad, 6px);
  --density-switch-gap: 6px;
  --density-switch-pad: 6px;
  --density-switch-height: 36px;
  --density-switch-duration: calc(var(--home-motion-density-duration) + 80ms);
  --density-switch-count: 3;
  --density-switch-index: 0;
  border-radius: 18px;
  background: var(--app-glass);
  box-shadow: var(--app-shadow);
}

@media (min-width: 600px) {
  .density-switch {
    flex-basis: auto;
    display: inline-grid;
    grid-template-columns: repeat(var(--density-switch-count, 3), minmax(0, 1fr));
    order: 2;
  }

  .goods-header-btns {
    order: 3;
  }
}

.density-switch__option {
  min-width: 0;
  position: relative;
  z-index: 1;
  height: var(--density-switch-height, 36px);
  padding: 0 12px;
  border: none;
  border-radius: 14px;
  background: transparent;
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 600;
  transition:
    transform var(--home-motion-density-duration) var(--home-motion-ease-standard),
    color var(--home-motion-density-duration) var(--home-motion-ease-standard);
}

.density-switch__option--active {
  color: #ffffff;
}

.density-switch__indicator {
  position: absolute;
  top: var(--density-switch-pad, 6px);
  left: var(--density-switch-pad, 6px);
  height: var(--density-switch-height, 36px);
  width: calc(
    (100% - (var(--density-switch-gap, 6px) * (var(--density-switch-count, 3) - 1)) - (var(--density-switch-pad, 6px) * 2))
    / var(--density-switch-count, 3)
  );
  border-radius: 14px;
  background: #141416;
  transform: translateX(calc((100% + var(--density-switch-gap, 6px)) * var(--density-switch-index, 0)));
  transition:
    transform var(--density-switch-duration) var(--home-motion-ease-emphasis),
    background var(--home-motion-density-duration) var(--home-motion-ease-standard),
    box-shadow var(--home-motion-density-duration) var(--home-motion-ease-standard);
  box-shadow: 0 6px 14px rgba(20, 20, 22, 0.12);
  will-change: transform;
  pointer-events: none;
  z-index: 0;
}

.density-switch__option:active {
  transform: scale(0.96);
}

.timeline-toggle,
.sort-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border: none;
  border-radius: 18px;
  background: var(--app-glass);
  color: var(--app-text-secondary);
  box-shadow: var(--app-shadow);
  transition:
    transform var(--home-motion-density-duration) var(--home-motion-ease-standard),
    background var(--home-motion-density-duration) var(--home-motion-ease-standard),
    color var(--home-motion-density-duration) var(--home-motion-ease-standard);
  flex-shrink: 0;
}

.timeline-toggle svg,
.sort-toggle__icon {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.timeline-toggle svg {
  transition: transform var(--home-motion-sort-duration) var(--home-motion-ease-emphasis);
}

.sort-toggle__icon {
  overflow: visible;
  transform-origin: center;
  color: #6f7682;
}

.sort-toggle__group {
  transition:
    opacity 180ms ease,
    color 180ms ease;
}

.sort-toggle__group path {
  stroke: currentColor;
  transition: stroke-width 180ms ease, stroke 180ms ease;
}

.sort-toggle__group--up {
  color: #b7bcc5;
  opacity: 1;
}

.sort-toggle__group--down {
  color: #5f6570;
  opacity: 1;
}

.sort-toggle__group--up path {
  stroke-width: 2.15;
}

.sort-toggle__group--down path {
  stroke-width: 2.65;
}

.timeline-toggle--active,
.sort-toggle--asc {
  background: #141416;
  color: #ffffff;
}

.timeline-toggle--active svg {
  transform: rotate(18deg) scale(1.04);
}

.sort-toggle--asc {
  background: var(--app-glass);
  color: var(--app-text-secondary);
}

.sort-toggle--asc .sort-toggle__group--up {
  color: #141416;
}

.sort-toggle--asc .sort-toggle__group--down {
  color: #b7bcc5;
}

.sort-toggle--asc .sort-toggle__group--up path {
  stroke-width: 2.65;
}

.sort-toggle--asc .sort-toggle__group--down path {
  stroke-width: 2.15;
}

.sort-toggle--animating {
  animation: sort-toggle-pulse var(--home-motion-sort-duration) var(--home-motion-ease-emphasis);
}

.sort-toggle--animating .sort-toggle__icon {
  animation: sort-toggle-icon-pulse 220ms var(--home-motion-ease-emphasis);
}

.sort-toggle--asc.sort-toggle--animating .sort-toggle__icon {
  animation-name: sort-toggle-icon-pulse;
}

.timeline-toggle:active,
.sort-toggle:active {
  transform: scale(0.96);
}

@keyframes sort-toggle-pulse {
  0% {
    transform: scale(1);
    box-shadow: var(--app-shadow);
  }

  45% {
    transform: scale(1.08);
    box-shadow: 0 12px 28px rgba(20, 20, 22, 0.16);
  }

  100% {
    transform: scale(1);
    box-shadow: var(--app-shadow);
  }
}

@keyframes sort-toggle-icon-pulse {
  0% {
    transform: scale(0.92);
  }

  55% {
    transform: scale(1.08);
  }

  100% {
    transform: scale(1);
  }
}

.sort-sheet {
  overflow: hidden;
}

:global(.sort-sheet-overlay) {
  background: var(--app-overlay);
  backdrop-filter: blur(14px) saturate(120%);
  -webkit-backdrop-filter: blur(14px) saturate(120%);
}

.sort-sheet--tablet {
  width: min(560px, calc(100vw - 64px));
  max-width: calc(100vw - 64px);
  overflow: visible;
  background: transparent;
  box-shadow: none;
}

.sort-sheet__panel {
  padding: 12px 16px calc(max(env(safe-area-inset-bottom), 16px) + 4px);
  background: var(--app-surface);
}

.sort-sheet--tablet .sort-sheet__panel {
  padding: 18px;
  border: 1px solid var(--app-glass-border);
  border-radius: 24px;
  background: color-mix(in srgb, var(--app-surface) 94%, transparent);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.12);
}

.sort-sheet__handle {
  width: 36px;
  height: 4px;
  margin: 0 auto 14px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-text) 18%, transparent);
}

.sort-sheet__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.sort-sheet--tablet .sort-sheet__head {
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}

.sort-sheet--tablet .sort-sheet__head > div {
  min-width: 0;
}

.sort-sheet__label {
  color: var(--app-text-tertiary);
  font-size: 12px;
}

.sort-sheet__title {
  margin-top: 4px;
  color: var(--app-text);
  font-size: 20px;
  font-weight: 700;
}

.sort-sheet--tablet .sort-sheet__label {
  font-size: 13px;
}

.sort-sheet--tablet .sort-sheet__title {
  font-size: 18px;
}

.sort-sheet__dir-btn {
  min-height: 34px;
  padding: 0 12px;
  border: none;
  border-radius: 999px;
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 600;
}

.sort-sheet--tablet .sort-sheet__dir-btn {
  min-height: 40px;
  padding: 0 16px;
  flex-shrink: 0;
  background: color-mix(in srgb, var(--app-surface-soft) 92%, var(--app-glass));
}

.sort-sheet__options {
  display: grid;
  gap: 10px;
  max-height: min(60vh, 520px);
  overflow: auto;
}

.sort-sheet--tablet .sort-sheet__options {
  gap: 0;
  max-height: min(56vh, 420px);
  padding: 6px;
  border-radius: 20px;
  background: color-mix(in srgb, var(--app-bg) 88%, var(--app-glass));
}

.sort-sheet__option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 14px 16px;
  border: 1px solid var(--app-border);
  border-radius: 16px;
  background: var(--app-surface);
  color: var(--app-text);
  text-align: left;
}

.sort-sheet--tablet .sort-sheet__option {
  padding: 18px 18px;
  border: none;
  border-radius: 16px;
  background: transparent;
  transition: background 0.16s ease, box-shadow 0.16s ease;
}

.sort-sheet--tablet .sort-sheet__option + .sort-sheet__option {
  margin-top: 2px;
}

.sort-sheet__option--active {
  border-color: color-mix(in srgb, var(--app-text) 24%, transparent);
  background: color-mix(in srgb, var(--app-text) 6%, var(--app-surface));
}

.sort-sheet--tablet .sort-sheet__option--active {
  background: rgba(255, 255, 255, 0.48);
  box-shadow: inset 0 0 0 1px rgba(20, 20, 22, 0.14);
}

.sort-sheet--tablet .sort-sheet__option:active {
  background: rgba(20, 20, 22, 0.05);
}

.sort-sheet__option-name {
  font-size: 15px;
  font-weight: 600;
}

.sort-sheet__option-meta {
  color: var(--app-text-tertiary);
  font-size: 13px;
}

:global(html.theme-dark) .density-switch__indicator {
  background: #f5f5f7;
}

:global(html.theme-dark) .density-switch__option--active {
  color: #141416;
}

:global(html.theme-dark) .timeline-toggle--active {
  background: #f5f5f7;
  color: #141416;
}

:global(html.theme-dark) .sort-toggle--asc {
  background: var(--app-glass);
  color: var(--app-text-secondary);
}

:global(html.theme-dark) .sort-toggle__group--up {
  color: #70757f;
}

:global(html.theme-dark) .sort-toggle__group--down {
  color: #f5f5f7;
}

:global(html.theme-dark) .sort-toggle--asc .sort-toggle__group--up {
  color: #f5f5f7;
}

:global(html.theme-dark) .sort-toggle--asc .sort-toggle__group--down {
  color: #70757f;
}

:global(html.theme-dark) .sort-sheet__dir-btn,
:global(html.theme-dark) .sort-sheet__option--active {
  background: rgba(255, 255, 255, 0.08);
}

:global(html.theme-dark) .sort-sheet--tablet .sort-sheet__panel {
  background: rgba(24, 24, 28, 0.8);
  box-shadow: 0 24px 56px rgba(0, 0, 0, 0.42);
}

:global(html.theme-dark) .sort-sheet--tablet .sort-sheet__options {
  background: rgba(255, 255, 255, 0.05);
}

:global(html.theme-dark) .sort-sheet--tablet .sort-sheet__dir-btn {
  background: rgba(255, 255, 255, 0.06);
}

:global(html.theme-dark) .sort-sheet--tablet .sort-sheet__option--active {
  background: rgba(255, 255, 255, 0.08);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12);
}

:global(html.theme-dark) .sort-sheet--tablet .sort-sheet__option:active {
  background: rgba(255, 255, 255, 0.06);
}

@media (prefers-reduced-motion: reduce) {
  .density-switch__indicator,
  .density-switch__option {
    transition-duration: 0ms;
  }
}
</style>
