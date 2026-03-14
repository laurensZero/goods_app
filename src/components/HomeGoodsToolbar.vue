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
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M7 6V18" />
            <path d="M4 9L7 6L10 9" />
            <path d="M17 18V6" />
            <path d="M14 15L17 18L20 15" />
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

      <div v-if="displayDensity !== 'timeline'" class="density-switch" aria-label="展示密度切换">
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

  <Popup v-model:show="showSortSheet" teleport="body" position="bottom" round class="sort-sheet">
    <div class="sort-sheet__panel">
      <div class="sort-sheet__handle" />
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
import { computed, onBeforeUnmount, ref } from 'vue'
import { Popup } from 'vant'

const LONG_PRESS_DELAY_MS = 420

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
let sortLongPressTimer = 0
let suppressNextSortClick = false

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
const sortButtonLabel = computed(() => (
  `当前按${currentSortOption.value.label}${props.sortDirection === 'asc' ? '升序' : '降序'}，点击切换升降序，长按选择排序方式`
))

function clearSortLongPressTimer() {
  if (!sortLongPressTimer) return
  window.clearTimeout(sortLongPressTimer)
  sortLongPressTimer = 0
}

function openSortSheet() {
  clearSortLongPressTimer()
  suppressNextSortClick = true
  showSortSheet.value = true
}

function startSortLongPress() {
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

onBeforeUnmount(() => {
  clearSortLongPressTimer()
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
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  padding: 6px;
  border-radius: 18px;
  background: var(--app-glass);
  box-shadow: var(--app-shadow);
}

@media (min-width: 600px) {
  .density-switch {
    flex-basis: auto;
    display: inline-grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    order: 2;
  }

  .goods-header-btns {
    order: 3;
  }
}

.density-switch__option {
  min-width: 0;
  height: 36px;
  padding: 0 12px;
  border: none;
  border-radius: 14px;
  background: transparent;
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 600;
  transition:
    transform var(--home-motion-density-duration) var(--home-motion-ease-standard),
    background var(--home-motion-density-duration) var(--home-motion-ease-standard),
    color var(--home-motion-density-duration) var(--home-motion-ease-standard);
}

.density-switch__option--active {
  background: #141416;
  color: #ffffff;
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
.sort-toggle svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform var(--home-motion-sort-duration) var(--home-motion-ease-emphasis);
}

.timeline-toggle--active,
.sort-toggle--asc {
  background: #141416;
  color: #ffffff;
}

.timeline-toggle--active svg {
  transform: rotate(18deg) scale(1.04);
}

.sort-toggle--asc svg {
  transform: rotate(180deg);
}

.sort-toggle--animating {
  animation: sort-toggle-pulse var(--home-motion-sort-duration) var(--home-motion-ease-emphasis);
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

.sort-sheet {
  overflow: hidden;
}

.sort-sheet__panel {
  padding: 12px 16px calc(max(env(safe-area-inset-bottom), 16px) + 4px);
  background: var(--app-surface);
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

.sort-sheet__options {
  display: grid;
  gap: 10px;
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

.sort-sheet__option--active {
  border-color: color-mix(in srgb, var(--app-text) 24%, transparent);
  background: color-mix(in srgb, var(--app-text) 6%, var(--app-surface));
}

.sort-sheet__option-name {
  font-size: 15px;
  font-weight: 600;
}

.sort-sheet__option-meta {
  color: var(--app-text-tertiary);
  font-size: 13px;
}

:global(html.theme-dark) .density-switch__option--active,
:global(html.theme-dark) .sort-toggle--asc,
:global(html.theme-dark) .timeline-toggle--active {
  background: #f5f5f7;
  color: #141416;
}

:global(html.theme-dark) .sort-sheet__dir-btn,
:global(html.theme-dark) .sort-sheet__option--active {
  background: rgba(255, 255, 255, 0.08);
}
</style>
