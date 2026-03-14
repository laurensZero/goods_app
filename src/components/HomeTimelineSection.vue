<template>
  <div class="tl-wrapper">
    <div v-for="yearGroup in yearGroups" :key="yearGroup.year" class="tl-year-block">
      <div class="tl-year-header">
        <span class="tl-year-num">{{ yearGroup.year }}</span>
        <span class="tl-year-meta">{{ yearGroup.yearCount }} 件 / {{ formatPrice(yearGroup.yearTotal) }}</span>
      </div>

      <div
        v-for="(monthGroup, midx) in yearGroup.months"
        :key="monthGroup.yearMonth"
        class="tl-month-group"
        :class="{ 'tl-month-group--last': midx === yearGroup.months.length - 1 }"
      >
        <div class="tl-month-rail" aria-hidden="true">
          <div class="tl-month-dot" />
          <div class="tl-month-line" />
        </div>
        <div class="tl-month-content">
          <div class="tl-month-header">
            <span class="tl-month-label">{{ monthGroup.month }} 月</span>
            <div class="tl-month-meta">
              <span class="tl-month-count">{{ monthGroup.count }} 件</span>
              <span v-if="monthGroup.totalSpend > 0" class="tl-month-spend">{{ formatPrice(monthGroup.totalSpend) }}</span>
            </div>
          </div>
          <div class="tl-thumb-grid">
            <button
              v-for="item in monthGroup.items"
              :key="item.id"
              type="button"
              class="tl-thumb-btn"
              :data-goods-id="item.id"
              data-scroll-anchor="timeline-thumb"
              :data-scroll-index="itemIndexById.get(item.id) ?? -1"
              :class="{ 'tl-thumb-btn--active': activeItemId === item.id }"
              @click="$emit('toggle-item', item.id)"
            >
              <div class="tl-thumb-img-wrap">
                <LazyCachedImage
                  v-if="item.image"
                  class="tl-thumb-img"
                  :src="item.image"
                  :alt="item.name"
                  root-margin="120px 0px"
                />
                <div v-else class="tl-thumb-empty">暂无</div>
              </div>
            </button>
          </div>
          <transition name="tl-expand">
            <TimelineExpandCard
              v-if="expandedItem && expandedSectionKey === monthGroup.yearMonth"
              :item="expandedItem"
              @open-detail="$emit('open-detail', expandedItem.id)"
            />
          </transition>
        </div>
      </div>
    </div>

    <div v-if="showUnknown" class="tl-month-group tl-month-group--last">
      <div class="tl-month-rail" aria-hidden="true">
        <div class="tl-month-dot tl-month-dot--muted" />
        <div class="tl-month-line" />
      </div>
      <div class="tl-month-content">
        <div class="tl-month-header">
          <span class="tl-month-label">日期未知</span>
          <div class="tl-month-meta">
            <span class="tl-month-count">{{ unknownItems.length }} 件</span>
          </div>
        </div>
        <div class="tl-thumb-grid">
          <button
            v-for="item in unknownItems"
            :key="item.id"
            type="button"
            class="tl-thumb-btn"
            :data-goods-id="item.id"
            data-scroll-anchor="timeline-thumb"
            :data-scroll-index="itemIndexById.get(item.id) ?? -1"
            :class="{ 'tl-thumb-btn--active': activeItemId === item.id }"
            @click="$emit('toggle-item', item.id)"
          >
            <div class="tl-thumb-img-wrap">
              <LazyCachedImage
                v-if="item.image"
                class="tl-thumb-img"
                :src="item.image"
                :alt="item.name"
                root-margin="120px 0px"
              />
              <div v-else class="tl-thumb-empty">暂无</div>
            </div>
          </button>
        </div>
        <transition name="tl-expand">
          <TimelineExpandCard
            v-if="expandedItem && expandedSectionKey === unknownSectionKey"
            :item="expandedItem"
            @open-detail="$emit('open-detail', expandedItem.id)"
          />
        </transition>
      </div>
    </div>
  </div>
</template>

<script setup>
import { formatPrice } from '@/utils/format'
import LazyCachedImage from '@/components/LazyCachedImage.vue'
import TimelineExpandCard from '@/components/TimelineExpandCard.vue'

defineProps({
  yearGroups: { type: Array, required: true },
  unknownItems: { type: Array, required: true },
  showUnknown: { type: Boolean, default: false },
  activeItemId: { type: String, default: null },
  expandedItem: { type: Object, default: null },
  expandedSectionKey: { type: String, default: '' },
  itemIndexById: { type: Map, required: true },
  unknownSectionKey: { type: String, required: true }
})

defineEmits(['toggle-item', 'open-detail'])
</script>

<style scoped>
.tl-wrapper {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.tl-year-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tl-year-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0 10px;
}

.tl-year-num {
  font-size: 20px;
  font-weight: 700;
  color: var(--app-text-secondary);
  letter-spacing: -0.02em;
  line-height: 1;
}

.tl-year-meta {
  font-size: 12px;
  font-weight: 500;
  color: var(--app-text-tertiary);
}

.tl-month-group {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  column-gap: 16px;
}

.tl-month-group--last {
  padding-bottom: 0;
}

.tl-month-rail {
  position: relative;
  display: flex;
  justify-content: center;
}

.tl-month-dot {
  position: relative;
  z-index: 1;
  width: 12px;
  height: 12px;
  margin-top: 8px;
  border-radius: 50%;
  background: #141416;
  box-shadow: 0 0 0 5px color-mix(in srgb, var(--app-surface) 72%, transparent);
}

.tl-month-line {
  position: absolute;
  top: 20px;
  bottom: -24px;
  left: 50%;
  width: 2px;
  transform: translateX(-50%);
  background: linear-gradient(180deg, color-mix(in srgb, var(--app-text-tertiary) 28%, transparent), transparent);
}

.tl-month-group--last .tl-month-line {
  display: none;
}

.tl-month-dot--muted {
  background: color-mix(in srgb, var(--app-text-tertiary) 58%, transparent);
}

.tl-month-content {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.tl-month-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.tl-month-label {
  font-size: 18px;
  font-weight: 650;
  color: var(--app-text);
  letter-spacing: -0.03em;
}

.tl-month-meta {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  flex-shrink: 0;
}

.tl-month-count,
.tl-month-spend {
  font-size: 13px;
  font-weight: 600;
  color: color-mix(in srgb, var(--app-text) 76%, var(--app-text-tertiary));
}

.tl-thumb-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  content-visibility: auto;
  contain-intrinsic-size: 1px 240px;
}

@media (min-width: 600px) {
  .tl-thumb-grid {
    grid-template-columns: repeat(5, 1fr);
  }
}

@media (min-width: 900px) {
  .tl-thumb-grid {
    grid-template-columns: repeat(7, 1fr);
  }
}

@media (min-width: 1200px) {
  .tl-thumb-grid {
    grid-template-columns: repeat(9, 1fr);
  }
}

.tl-thumb-btn {
  display: flex;
  flex-direction: column;
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
  transition: transform 0.15s ease, opacity 0.15s ease;
  content-visibility: auto;
  contain-intrinsic-size: 132px 132px;
}

.tl-thumb-btn:active {
  transform: scale(0.94);
  opacity: 0.8;
}

.tl-thumb-img-wrap {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 14px;
  overflow: hidden;
  background: var(--app-surface-soft, #eeeff2);
  box-shadow: 0 6px 16px rgba(17, 20, 22, 0.06);
  border: 1px solid color-mix(in srgb, var(--app-text-tertiary) 10%, transparent);
  transition: box-shadow 0.2s ease, outline-color 0.2s ease, outline-offset 0.2s ease;
}

.tl-thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  display: block;
  background: transparent;
}

.tl-thumb-empty {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--app-text-tertiary);
  font-size: 14px;
}

.tl-thumb-btn--active {
  transform: scale(1.04);
  z-index: 1;
  position: relative;
}

.tl-thumb-btn--active .tl-thumb-img-wrap {
  outline: 2px solid var(--app-text);
  outline-offset: 3px;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.2), 0 3px 8px rgba(0, 0, 0, 0.1);
}

@media (prefers-color-scheme: dark) {
  .tl-month-count {
    color: var(--app-text-secondary);
  }

  .tl-month-line {
    background: color-mix(in srgb, var(--app-text-secondary) 18%, transparent);
  }

  .tl-month-spend {
    color: color-mix(in srgb, var(--app-text) 80%, var(--app-text-secondary));
  }

  .tl-thumb-img-wrap {
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.24);
    border-color: rgba(255, 255, 255, 0.08);
  }

  .tl-thumb-btn--active .tl-thumb-img-wrap {
    outline: 2px solid rgba(245, 245, 247, 0.8);
    outline-offset: 3px;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.44), 0 3px 8px rgba(0, 0, 0, 0.24);
  }
}
</style>
