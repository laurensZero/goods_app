<template>
  <div
    :class="['group-card', `group-card--${density}`, { 'group-card--selected': selected, 'group-card--selecting': selectionMode }]"
    @click="handleClick"
    @touchstart.passive="onTouchStart"
    @touchend.prevent="onTouchEnd"
    @touchcancel="onTouchCancel"
    @mousedown="onMouseDown"
    @mouseup="onMouseUp"
    @mouseleave="onMouseLeave"
  >
    <!-- Folder thumbnail grid (2x2) -->
    <div class="group-card__grid">
      <div
        v-for="(thumb, index) in thumbnails"
        :key="index"
        class="group-card__thumb"
      >
        <LazyCachedImage
          v-if="thumb"
          :src="thumb"
          :alt="`thumb-${index}`"
          class="group-card__thumb-img"
          loading="lazy"
          resume-decode-validation
        />
        <div v-else class="group-card__thumb-empty" />
      </div>
      <div
        v-for="n in emptySlots"
        :key="`empty-${n}`"
        class="group-card__thumb"
      >
        <div class="group-card__thumb-empty" />
      </div>
    </div>

    <!-- Group info -->
    <div class="group-card__body">
      <h3 class="group-card__name">{{ group.name || t('goodsGroup.untitled') }}</h3>
      <div class="group-card__spacer" />
      <div class="group-card__bottom">
        <span class="group-card__price">
          {{ formattedPrice }}
          <span v-if="priceCNYHint && density !== 'compact'" class="group-card__price-cny">{{ priceCNYHint }}</span>
        </span>
        <span class="group-card__count">{{ itemCount }} {{ t('goodsGroup.items') }}</span>
      </div>
    </div>

    <!-- Selection overlay -->
    <div v-if="selectionMode" class="group-card__selection">
      <div :class="['group-card__check', { 'group-card__check--on': selected }]">
        <svg v-if="selected" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { getPrimaryGoodsImageUrl } from '@/utils/goods/images'
import { CURRENCY_MAP } from '@/constants/currencies'
import { useExchangeRateStore } from '@/stores/exchangeRate'
import LazyCachedImage from '@/components/image/LazyCachedImage.vue'

const props = defineProps({
  group: { type: Object, required: true },
  items: { type: Array, default: () => [] },
  totalPrice: { type: Number, default: 0 },
  currency: { type: String, default: 'CNY' },
  density: { type: String, default: 'comfortable' },
  selected: { type: Boolean, default: false },
  selectionMode: { type: Boolean, default: false }
})

const exchangeRate = useExchangeRateStore()

const emit = defineEmits(['open-group', 'long-press', 'toggle-select'])
const { t } = useI18n()

let longPressTimer = null
let touchStartX = 0
let touchStartY = 0
let gestureMoved = false

const itemCount = computed(() => props.items.length)
const currencySymbol = computed(() => CURRENCY_MAP[props.currency]?.symbol || '¥')

// CNY hint: convert via exchangeRate store directly for reactivity
const priceCNYHint = computed(() => {
  if (props.currency === 'CNY') return ''
  const v = props.totalPrice || 0
  if (v <= 0) return ''
  // Read exchangeRate.rates to establish reactive dependency
  const rates = exchangeRate.rates
  const cny = exchangeRate.convertToCNY(v, props.currency)
  if (!cny || cny <= 0) return ''
  return `≈ ¥${cny.toFixed(2)}`
})

// Original price with currency symbol (compact mode: show CNY converted price instead)
const formattedPrice = computed(() => {
  const v = props.totalPrice || 0
  if (props.density === 'compact' && props.currency !== 'CNY') {
    const cny = exchangeRate.convertToCNY(v, props.currency)
    if (cny && cny > 0) return `¥${cny.toFixed(2)}`
  }
  return `${currencySymbol.value}${Number.isInteger(v) ? String(v) : v.toFixed(2)}`
})

const thumbnails = computed(() => {
  const thumbs = []
  const items = props.items

  if (props.group.coverMode === 'manual' && props.group.coverItemId) {
    const coverItem = items.find(i => i.id === props.group.coverItemId)
    if (coverItem) thumbs.push(getItemThumbnail(coverItem))
  }

  for (const item of items) {
    if (thumbs.length >= 4) break
    if (props.group.coverMode === 'manual' && item.id === props.group.coverItemId) continue
    const thumb = getItemThumbnail(item)
    if (thumb) thumbs.push(thumb)
  }

  return thumbs
})

const emptySlots = computed(() => Math.max(0, 4 - thumbnails.value.length))

function getItemThumbnail(item) {
  if (!item) return null
  return getPrimaryGoodsImageUrl(item.images, item.coverImage || item.image) || null
}

function onTouchStart(e) {
  const touch = e.touches[0]
  touchStartX = touch.clientX
  touchStartY = touch.clientY
  gestureMoved = false
  longPressTimer = setTimeout(() => {
    longPressTimer = null
    emit('long-press')
  }, 500)
}

function onTouchEnd() {
  if (longPressTimer) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }
  if (gestureMoved) return
  handleClick()
}

function onTouchCancel() {
  if (longPressTimer) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }
  gestureMoved = true
}

function onMouseDown(event) {
  if (event.button !== 0) return
  touchStartX = event.clientX
  touchStartY = event.clientY
  gestureMoved = false
  longPressTimer = setTimeout(() => {
    longPressTimer = null
    emit('long-press')
  }, 500)
}

function onMouseUp() {
  if (longPressTimer) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }
  if (!gestureMoved) handleClick()
}

function onMouseLeave() {
  if (longPressTimer) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }
  gestureMoved = true
}

function handleClick() {
  if (props.selectionMode) {
    emit('toggle-select')
  } else {
    emit('open-group', props.group.id)
  }
}
</script>

<style scoped>
.group-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 9px;
  height: 100%;
  padding: 10px;
  border-radius: var(--radius-card, 18px);
  background: var(--app-surface);
  box-shadow: var(--app-shadow, 0 8px 24px rgba(0, 0, 0, 0.06));
  cursor: pointer;
  user-select: none;
  -webkit-touch-callout: none;
  contain: paint;
  transition: transform 0.22s ease, box-shadow 0.22s ease;
}

.group-card:active {
  transform: scale(var(--press-scale-card, 0.98));
}

@media (hover: hover) {
  .group-card:hover {
    transform: none;
    box-shadow: var(--app-shadow);
  }
}

.group-card--selected {
  filter: brightness(0.88);
}

.group-card--selecting {
  opacity: 0.85;
}

/* Thumbnail grid */
.group-card__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: 4px;
  border-radius: calc(var(--radius-card, 18px) - 6px);
  overflow: hidden;
  aspect-ratio: 1;
  background: var(--app-surface, #fff);
  padding: 0;
}

.group-card__thumb {
  aspect-ratio: 1;
  overflow: hidden;
  background: var(--app-surface-muted, #f0f0f2);
  border-radius: 10px;
  padding: 3px;
}

.group-card__thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  border-radius: 7px;
}

.group-card__thumb-empty {
  width: 100%;
  height: 100%;
  background: var(--app-surface-muted, #f0f0f2);
  border-radius: 7px;
}

/* Body — matches GoodsCard .card-body layout */
.group-card__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.group-card__name {
  display: -webkit-box;
  overflow: hidden;
  color: var(--app-text);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.3;
  min-height: 2.6em;
  letter-spacing: -0.03em;
  line-clamp: 2;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.group-card__spacer {
  flex: 1;
  min-height: 0;
}

.group-card__bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 18px;
}

.group-card__price {
  flex-shrink: 0;
  color: #8e8e93;
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0;
}

.group-card__price-cny {
  font-size: 11px;
  font-weight: 400;
  color: var(--app-text-tertiary);
}

.group-card__count {
  font-size: 11px;
  color: var(--app-text-tertiary);
}

/* Density — compact */
.group-card--compact {
  gap: 9px;
  padding: 10px;
}

.group-card--compact .group-card__grid {
  gap: 3px;
}

.group-card--compact .group-card__name {
  min-height: 2.7em;
}

.group-card--compact .group-card__bottom {
  margin-top: auto;
}

/* Selection — matches GoodsCard .selection-overlay + .check-icon */
.group-card__selection {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 3;
  pointer-events: none;
}

.group-card__check {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1.5px solid rgba(255, 255, 255, 0.82);
  background: rgba(255, 255, 255, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
}

.group-card__check--on {
  background: var(--app-pending, #0e74e9);
  border-color: var(--app-pending, #0e74e9);
}

.group-card__check svg {
  width: 14px;
  height: 14px;
  color: #fff;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>
