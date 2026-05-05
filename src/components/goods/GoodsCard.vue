<template>
  <article
    class="goods-card"
    :class="[
      `goods-card--${density || 'comfortable'}`,
      { 'goods-card--transitioning': transitioning },
      { 'goods-card--selected': selected },
      { 'goods-card--motion': Boolean(motionStyle) }
    ]"
    :style="motionStyle || undefined"
    @touchstart="onTouchStart"
    @touchmove="onTouchMove"
    @touchend="onTouchEnd"
    @touchcancel="onTouchCancel"
    @mousedown="onMouseDown"
    @mousemove="onMouseMove"
    @mouseup="onMouseUp"
    @mouseleave="onMouseLeave"
    @contextmenu.prevent
  >
    <Transition name="sel-overlay">
      <div v-if="selectionMode" class="selection-overlay">
        <div :class="['check-icon', { 'check-icon--checked': selected }]">
          <svg v-if="selected" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
      </div>
    </Transition>

    <div class="cover-wrap">
      <div
        ref="coverEl"
        :class="['card-cover', { 'card-cover--with-image': item.coverImage }]"
        :data-goods-hero-id="String(item.id || '')"
        :style="coverStyle"
      >
        <LazyCachedImage
          v-if="item.coverImage"
          :src="item.coverImage"
          :alt="item.name"
          :lazy="!preferEagerCoverLoad"
          :root-margin="preferEagerCoverLoad ? '180px 0px' : '520px 0px'"
          class="cover-img"
        />
        <span v-if="!item.coverImage" class="cover-initial">{{ coverInitial }}</span>
      </div>
      <div
        v-if="item.isWishlist"
        :class="['wishlist-badge', { 'wishlist-badge--compact': density === 'compact' }]"
      >
        心愿
      </div>
      <div v-if="item.quantity > 1" class="qty-badge">×{{ item.quantity }}</div>
    </div>

    <div class="card-body">
      <h3 class="card-name">{{ item.name }}</h3>

      <div
        ref="tagsScrollerRef"
        class="card-tags"
        :class="{ 'card-tags--hidden': !showTags, 'card-tags--dragging': tagsDragging }"
        @click.stop
        @mousedown.stop="onTagsMouseDown"
        @touchstart.stop
        @touchmove.stop
        @touchend.stop
      >
        <span class="card-chip" :class="{ 'card-chip--hidden': !showCategory }">{{ item.category }}</span>
        <span class="card-chip ip-chip" :class="{ 'card-chip--hidden': !showIp }">{{ item.ip }}</span>
        <span
          v-for="character in allCharacters"
          :key="character"
          class="card-chip char-chip"
          :class="{ 'card-chip--hidden': !showCharacters }"
        >
          {{ character }}
        </span>
        <span
          v-for="tag in allCustomTags"
          :key="tag"
          class="card-chip tag-chip"
          :class="{ 'card-chip--hidden': !showCustomTags }"
        >
          #{{ tag }}
        </span>
      </div>

      <div class="card-bottom-row">
        <span class="card-price">
          {{ priceText }}
          <span v-if="priceCNYHint" class="card-price-cny">{{ priceCNYHint }}</span>
          <span v-if="showPoints" class="card-price-points">+{{ item.points }}积分</span>
        </span>
        <span class="card-days" :class="{ 'card-days--hidden': !showHoldingDays }">持有 {{ holdingDays }} 天</span>
      </div>
    </div>
  </article>
</template>

<script setup>
import { computed, ref } from 'vue'
import LazyCachedImage from '@/components/image/LazyCachedImage.vue'
import { useExchangeRateStore } from '@/stores/exchangeRate'
import { CURRENCY_MAP } from '@/constants/currencies'

const props = defineProps({
  item: { type: Object, required: true },
  density: { type: String, default: '' },
  transitioning: { type: Boolean, default: false },
  selected: { type: Boolean, default: false },
  selectionMode: { type: Boolean, default: false },
  motionStyle: { type: Object, default: null }
})

const emit = defineEmits(['long-press', 'toggle-select', 'open-detail'])
const tagsScrollerRef = ref(null)
const coverEl = ref(null)

const longPressTimer = ref(null)
const longPressTriggered = ref(false)
const touchStartX = ref(0)
const touchStartY = ref(0)
const gestureMoved = ref(false)
const tagsDragging = ref(false)
const TOUCH_TAP_THRESHOLD = 12
const MOUSE_TAP_THRESHOLD = 6
const preferEagerCoverLoad = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent || '')
let tagsDragStartX = 0
let tagsDragStartScrollLeft = 0

function startLongPress(x, y) {
  touchStartX.value = x
  touchStartY.value = y
  longPressTriggered.value = false
  gestureMoved.value = false
  longPressTimer.value = setTimeout(() => {
    longPressTriggered.value = true
    try { navigator.vibrate?.(50) } catch {}
    emit('long-press')
  }, 500)
}

function cancelLongPress() {
  if (longPressTimer.value) {
    clearTimeout(longPressTimer.value)
    longPressTimer.value = null
  }
}

function handleTap() {
  if (props.selectionMode) {
    emit('toggle-select')
  } else {
    emit('open-detail', {
      id: props.item.id,
      sourceEl: coverEl.value
    })
  }
}

function onTouchStart(event) {
  const touch = event.touches[0]
  startLongPress(touch.clientX, touch.clientY)
}

function onTouchMove(event) {
  const touch = event.touches[0]
  const dx = Math.abs(touch.clientX - touchStartX.value)
  const dy = Math.abs(touch.clientY - touchStartY.value)
  if (dx > TOUCH_TAP_THRESHOLD || dy > TOUCH_TAP_THRESHOLD) {
    gestureMoved.value = true
    cancelLongPress()
  }
}

function onTouchEnd(event) {
  cancelLongPress()
  event.preventDefault()
  if (longPressTriggered.value || gestureMoved.value) return
  handleTap()
}

function onTouchCancel() {
  gestureMoved.value = true
  cancelLongPress()
}

function onMouseDown(event) {
  if (event.button !== 0) return
  startLongPress(event.clientX, event.clientY)
}

function onMouseMove(event) {
  if (!longPressTimer.value) return
  const dx = Math.abs(event.clientX - touchStartX.value)
  const dy = Math.abs(event.clientY - touchStartY.value)
  if (dx > MOUSE_TAP_THRESHOLD || dy > MOUSE_TAP_THRESHOLD) {
    gestureMoved.value = true
    cancelLongPress()
  }
}

function onMouseUp(event) {
  if (event.button !== 0) return
  cancelLongPress()
  if (!longPressTriggered.value && !gestureMoved.value) handleTap()
}

function onMouseLeave() {
  if (!longPressTimer.value && !longPressTriggered.value) return
  gestureMoved.value = true
  cancelLongPress()
}

function onTagsMouseDown(event) {
  if (event.button !== 0) return
  const scroller = tagsScrollerRef.value
  if (!scroller) return

  tagsDragging.value = true
  tagsDragStartX = event.clientX
  tagsDragStartScrollLeft = scroller.scrollLeft
  cancelLongPress()
  gestureMoved.value = true

  window.addEventListener('mousemove', onTagsMouseMove)
  window.addEventListener('mouseup', onTagsMouseUp)
}

function onTagsMouseMove(event) {
  const scroller = tagsScrollerRef.value
  if (!tagsDragging.value || !scroller) return

  const deltaX = event.clientX - tagsDragStartX
  scroller.scrollLeft = tagsDragStartScrollLeft - deltaX
}

function onTagsMouseUp() {
  tagsDragging.value = false
  window.removeEventListener('mousemove', onTagsMouseMove)
  window.removeEventListener('mouseup', onTagsMouseUp)
}

const colorMap = {
  手办: ['#2c2c2e', '#3a3a3c'],
  挂件: ['#1c3a5e', '#2a5298'],
  徽章: ['#3a1c5e', '#6a3d9a'],
  卡片: ['#1c4a3a', '#2e7d5c'],
  'CD/专辑': ['#4a2c1c', '#8b4513'],
  服饰: ['#4a3a1c', '#8b6914'],
  其他: ['#3a3a3a', '#5a5a5a']
}

const coverBg = computed(() => {
  const [from, to] = colorMap[props.item.category] ?? ['#2c2c2e', '#3a3a3c']
  return `linear-gradient(135deg, ${from}, ${to})`
})

const coverStyle = computed(() => {
  const style = {}
  if (!props.item.coverImage) {
    style.background = coverBg.value
  }
  return style
})

const coverInitial = computed(() => (props.item.name ?? '?').trim().charAt(0).toUpperCase() || '?')

const holdingDays = computed(() => {
  const date = props.item.acquiredAt
  if (!date) return null

  const diff = Date.now() - new Date(date).getTime()
  const days = Math.floor(diff / 86400000)
  return days >= 0 ? days : null
})

const showCategory = computed(() => props.density !== 'compact' && !!props.item.category)
const showIp = computed(() => props.density !== 'compact' && !!props.item.ip)
const allCharacters = computed(() => props.item.characters || [])
const allCustomTags = computed(() => props.item.tags || [])
const showCharacters = computed(() => props.density === 'comfortable' && allCharacters.value.length > 0)
const showCustomTags = computed(() => props.density === 'comfortable' && allCustomTags.value.length > 0)
const showTags = computed(() => showCategory.value || showIp.value || showCharacters.value || showCustomTags.value)
const windowWidth = ref(window.innerWidth)
const isTablet = computed(() => windowWidth.value >= 900)
const showHoldingDays = computed(() => !props.item.isWishlist && props.density !== 'compact' && holdingDays.value !== null)
const showPoints = computed(() => !props.item.isWishlist && props.item.points && (props.density === 'comfortable' || isTablet.value))
const unitActualPriceText = computed(() => {
  const quantity = Math.max(1, Number(props.item.quantity) || 1)
  if (quantity < 2 || props.item.isWishlist) return ''

  const sym = CURRENCY_MAP[props.item.actualPriceCurrency]?.symbol || '¥'
  const list = Array.isArray(props.item.unitActualPriceList) ? props.item.unitActualPriceList : []
  const normalized = list
    .map((value) => {
      const numeric = Number.parseFloat(String(value || '').trim())
      if (!Number.isFinite(numeric) || numeric < 0) return ''
      return `${sym}${Math.round(numeric * 100) / 100}`
    })
    .filter(Boolean)

  if (normalized.length < 2) return ''
  return normalized.join(' / ')
})

function hasPriceValue(value) {
  return value !== '' && value != null
}

const exchangeRate = useExchangeRateStore()
const itemCurrencySymbol = computed(() => CURRENCY_MAP[props.item.currency]?.symbol || '¥')
const actualPriceCurrencySymbol = computed(() => CURRENCY_MAP[props.item.actualPriceCurrency]?.symbol || '¥')

const priceText = computed(() => {
  const sym = itemCurrencySymbol.value
  const apSym = actualPriceCurrencySymbol.value

  if (props.item.isWishlist) {
    return hasPriceValue(props.item.price) ? `目标 ${sym}${props.item.price}` : '心愿单'
  }

  if (unitActualPriceText.value) {
    return unitActualPriceText.value
  }

  if (props.item.actualPrice !== '' && props.item.actualPrice != null) {
    return `到手 ${apSym}${props.item.actualPrice}`
  }

  return hasPriceValue(props.item.price) ? `${sym}${props.item.price}` : `${sym}—`
})

const priceCNYHint = computed(() => {
  const useActual = props.item.actualPrice !== '' && props.item.actualPrice != null
  const rawPrice = useActual ? props.item.actualPrice : props.item.price
  const currency = useActual ? (props.item.actualPriceCurrency || 'CNY') : (props.item.currency || 'CNY')
  if (currency === 'CNY') return ''
  const num = parseFloat(rawPrice)
  if (isNaN(num) || num <= 0) return ''
  const cny = exchangeRate.convertToCNY(num, currency)
  if (!cny || cny <= 0) return ''
  return `≈ ¥${cny.toFixed(2)}`
})
</script>

<style scoped>
.goods-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  padding: 10px;
  border-radius: var(--radius-card);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
  cursor: pointer;
  user-select: none;
  -webkit-touch-callout: none;
  contain: paint;
  background-clip: padding-box;
  isolation: isolate;
  transition:
    transform 0.22s ease,
    box-shadow 0.22s ease;
}

.goods-card--motion {
  will-change: transform, opacity;
}

.goods-card--transitioning {
  transition: none;
}

.goods-card--transitioning .card-tags,
.goods-card--transitioning .card-chip,
.goods-card--transitioning .card-days,
.goods-card--transitioning .check-icon,
.goods-card--transitioning .selection-overlay {
  transition: none !important;
  animation: none !important;
}

.goods-card:active {
  transform: scale(var(--press-scale-card));
}

@media (hover: hover) {
  .goods-card:hover {
    transform: none;
    box-shadow: var(--app-shadow);
  }
}

.cover-wrap {
  position: relative;
  width: 100%;
}

.wishlist-badge {
  position: absolute;
  top: 7px;
  left: 7px;
  z-index: 2;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(211, 61, 87, 0.92);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.3;
  letter-spacing: 0.02em;
  box-shadow: 0 6px 14px rgba(211, 61, 87, 0.2);
  pointer-events: none;
}

.wishlist-badge--compact {
  top: -6px;
  left: -6px;
  padding: 2px 7px;
  font-size: 10px;
  line-height: 1.2;
  background: rgba(211, 61, 87, 0.86);
  box-shadow: 0 4px 10px rgba(211, 61, 87, 0.16);
}

.qty-badge {
  position: absolute;
  bottom: 7px;
  right: 7px;
  background: rgba(20, 20, 22, 0.7);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  border-radius: 7px;
  padding: 2px 6px;
  line-height: 1.4;
  pointer-events: none;
  z-index: 2;
  letter-spacing: 0.02em;
}

.card-cover {
  width: 100%;
  aspect-ratio: 1 / 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 10px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--app-glass-border) 78%, transparent);
  background: color-mix(in srgb, var(--app-surface-soft) 92%, var(--app-surface));
  background-size: cover;
  background-position: center;
}

.card-cover--with-image {
  padding: 0;
}

.cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  border-radius: inherit;
  backface-visibility: hidden;
  transform: translateZ(0);
}

.cover-initial {
  color: rgba(255, 255, 255, 0.86);
  font-size: 44px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.05em;
  user-select: none;
}

.card-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.card-name {
  display: -webkit-box;
  overflow: hidden;
  color: var(--app-text);
  font-size: 16px;
  font-weight: 600;
  line-height: 1.35;
  letter-spacing: -0.03em;
  line-clamp: 2;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.card-tags {
  display: flex;
  gap: 5px;
  max-height: 28px;
  flex-wrap: nowrap;
  overflow-x: auto;
  overflow-y: hidden;
  opacity: 1;
  transform: translateY(0);
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
  touch-action: auto;
  cursor: grab;
}

.card-tags--hidden {
  min-height: 0;
  max-height: 0;
  opacity: 0;
  transform: translateY(-4px);
}

.card-tags::-webkit-scrollbar {
  display: none;
}

.card-tags--dragging {
  cursor: grabbing;
}

.card-chip {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.06);
  color: #3a3a3c;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  opacity: 1;
  transform: scale(1);
}

.card-chip--hidden {
  max-width: 0;
  padding: 0;
  opacity: 0;
  transform: scale(0.94);
}

.card-chip.ip-chip {
  background: rgba(28, 53, 88, 0.1);
  color: #1c3558;
}

.card-chip.char-chip {
  background: rgba(20, 20, 22, 0.08);
  color: #141416;
}

.card-chip.tag-chip {
  background: rgba(75, 49, 93, 0.12);
  color: #5b3578;
}

.card-bottom-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 18px;
  margin-top: auto;
  overflow: hidden;
  flex-wrap: nowrap;
}

.card-price {
  flex-shrink: 0;
  color: #8e8e93;
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0;
  line-height: 1.2;
}

.card-price-cny {
  color: var(--app-text-tertiary);
  font-size: 11px;
  font-weight: 400;
}

.card-price-points {
  margin-left: 4px;
  font-size: 14px;
  font-weight: 500;
  color: #8e8e93;
}

.card-days {
  overflow: hidden;
  color: #b0b0bc;
  font-size: 11px;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 84px;
  opacity: 1;
  transform: translateX(0);
  transition:
    max-width 0.24s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.18s ease,
    transform 0.24s cubic-bezier(0.22, 1, 0.36, 1);
}

.card-days--hidden {
  max-width: 0;
  opacity: 0;
  transform: translateX(6px);
}

.goods-card--compact .card-body {
  gap: 4px;
}

.goods-card--standard {
  gap: 9px;
}

.goods-card--standard .card-cover {
  padding: 4px;
}

.goods-card--standard .card-cover--with-image {
  padding: 0;
}

.goods-card--standard .card-body {
  gap: 4px;
}

.goods-card--standard .card-tags {
  margin-top: auto;
  min-height: 28px;
  align-items: center;
}

.goods-card--standard .card-name {
  font-size: 15px;
  line-height: 1.3;
  min-height: 2.6em;
}

.goods-card--comfortable {
  gap: 9px;
}

.goods-card--comfortable .card-cover {
  padding: 4px;
}

.goods-card--comfortable .card-cover--with-image {
  padding: 0;
}

.goods-card--comfortable .card-body {
  gap: 4px;
}

.goods-card--comfortable .card-tags {
  margin-top: auto;
  min-height: 28px;
  align-items: center;
}

.goods-card--comfortable .card-name {
  font-size: 15px;
  line-height: 1.3;
  min-height: 2.6em;
}

.goods-card--compact .card-bottom-row {
  margin-top: auto;
}

.goods-card--compact .card-cover {
  padding: 0;
}

.goods-card--compact .card-name {
  min-height: 2.7em; /* 保证一行时高度也占两行，严格对齐价格栏 */
}

.selection-overlay {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 3;
  pointer-events: none;
}

.check-icon {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1.5px solid rgba(255, 255, 255, 0.82);
  background: rgba(255, 255, 255, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.18s ease, border-color 0.18s ease;
  flex-shrink: 0;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
}

.check-icon--checked {
  background: #141416;
  border-color: #141416;
}

.check-icon svg {
  width: 11px;
  height: 11px;
  stroke: #fff;
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.goods-card--selected {
  filter: brightness(0.88);
}

.sel-overlay-enter-active,
.sel-overlay-leave-active {
  transition: opacity 0.18s ease;
}

.sel-overlay-enter-from,
.sel-overlay-leave-to {
  opacity: 0;
}

:global(html.theme-dark .goods-card .card-chip) {
    border: none !important;
    background: rgba(255, 255, 255, 0.08) !important;
    color: #ffffff !important;
    font-weight: 600 !important;
    box-shadow: none !important;
  }

:global(html.theme-dark .goods-card .card-chip.char-chip) {
    background: rgba(93, 226, 160, 0.08) !important;
    color: #5de2a0 !important;
  }

:global(html.theme-dark .goods-card .card-chip.ip-chip) {
    background: rgba(74, 122, 236, 0.12) !important;
    color: #8ab4f8 !important;
  }

:global(html.theme-dark .goods-card .card-chip.tag-chip) {
    background: rgba(201, 148, 255, 0.14) !important;
    color: #f1dcff !important;
  }

:global(html.theme-dark) .card-cover {
    border-color: color-mix(in srgb, var(--app-glass-border) 88%, transparent);
  }

:global(html.theme-dark) .check-icon--checked {
    background: #f5f5f7;
    border-color: #f5f5f7;
  }

:global(html.theme-dark) .check-icon--checked svg {
    stroke: #141416;
  }
</style>
