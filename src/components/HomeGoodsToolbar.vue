<template>
  <section class="goods-header-section">
    <div class="goods-header-row">
      <div class="goods-header-left">
        <p class="section-label">我的收藏</p>
        <h2 class="section-title">全部谷子<span class="goods-count"> {{ totalQuantity }} 件</span></h2>
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
          :aria-label="sortDirection === 'desc' ? '当前按时间降序，点击切换升序' : '当前按时间升序，点击切换降序'"
          @click="$emit('toggle-sort')"
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M7 6V18" />
            <path d="M4 9L7 6L10 9" />
            <path d="M17 18V6" />
            <path d="M14 15L17 18L20 15" />
          </svg>
        </button>

        <button
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
</template>

<script setup>
defineProps({
  totalQuantity: { type: Number, required: true },
  sortDirection: { type: String, required: true },
  isSortAnimating: { type: Boolean, default: false },
  displayDensity: { type: String, required: true },
  densityModes: { type: Array, required: true }
})

defineEmits(['toggle-sort', 'toggle-timeline', 'set-density'])
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
  font-size: 16px;
  font-weight: 400;
  color: var(--app-text-tertiary);
  margin-left: 4px;
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

@media (prefers-color-scheme: dark) {
  .density-switch__option--active,
  .sort-toggle--asc,
  .timeline-toggle--active {
    background: #f5f5f7;
    color: #141416;
  }
}
</style>
