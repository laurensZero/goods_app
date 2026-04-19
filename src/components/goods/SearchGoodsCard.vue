<template>
  <article
    class="search-goods-card"
    :class="{ 'search-goods-card--selected': selected }"
    :data-goods-id="item.id"
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
        :style="!item.coverImage ? { background: coverBg } : {}"
        :data-goods-hero-id="item.id"
      >
        <LazyCachedImage v-if="item.coverImage" :src="item.coverImage" :alt="item.name" :lazy="false" class="cover-img" />
        <span v-else class="cover-initial">{{ coverInitial }}</span>
      </div>
      <div v-if="item.isWishlist" class="wishlist-badge">心愿</div>
      <div v-if="item.quantity > 1" class="qty-badge">×{{ item.quantity }}</div>
    </div>

    <div class="card-body">
      <h3 class="card-name">{{ item.name }}</h3>

      <div v-if="chips.length" class="card-tags">
        <span v-for="chip in chips" :key="chip.key" :class="['card-chip', chip.className]">
          {{ chip.label }}
        </span>
      </div>
      <div v-else class="card-tags card-tags--empty" aria-hidden="true"></div>

      <div class="card-bottom-row">
        <span class="card-price">
          {{ priceText }}
          <span v-if="showPoints" class="card-price-points">+{{ item.points }}积分</span>
        </span>
        <span v-if="showHoldingDays" class="card-days">持有 {{ holdingDays }} 天</span>
        <span v-else class="card-days card-days--placeholder" aria-hidden="true"></span>
      </div>
    </div>
  </article>
</template>

<script setup>
import { computed, ref } from 'vue'
import LazyCachedImage from '@/components/image/LazyCachedImage.vue'

const props = defineProps({
  item: { type: Object, required: true },
  selected: { type: Boolean, default: false },
  selectionMode: { type: Boolean, default: false }
})

const emit = defineEmits(['long-press', 'toggle-select', 'open-detail'])

const longPressTimer = ref(null)
const longPressTriggered = ref(false)
const touchStartX = ref(0)
const touchStartY = ref(0)
const gestureMoved = ref(false)

const TOUCH_TAP_THRESHOLD = 12
const MOUSE_TAP_THRESHOLD = 6

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

const coverEl = ref(null)

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
  gestureMoved.value = true
  cancelLongPress()
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

const coverInitial = computed(() => (props.item.name ?? '?').trim().charAt(0).toUpperCase() || '?')

const holdingDays = computed(() => {
  const date = props.item.acquiredAt
  if (!date) return null
  const diff = Date.now() - new Date(date).getTime()
  const days = Math.floor(diff / 86400000)
  return days >= 0 ? days : null
})

const chips = computed(() => {
  const next = []
  if (props.item.category) next.push({ key: `category:${props.item.category}`, label: props.item.category, className: '' })
  if (props.item.ip) next.push({ key: `ip:${props.item.ip}`, label: props.item.ip, className: 'ip-chip' })
  return next
})

const showHoldingDays = computed(() => !props.item.isWishlist && holdingDays.value !== null)
const showPoints = computed(() => !props.item.isWishlist && props.item.points)

function hasPriceValue(value) {
  return value !== '' && value != null
}

const priceText = computed(() => {
  if (props.item.isWishlist) {
    return hasPriceValue(props.item.price) ? `目标 ¥${props.item.price}` : '心愿单'
  }
  if (props.item.actualPrice !== '' && props.item.actualPrice != null) {
    return `到手 ¥${props.item.actualPrice}`
  }
  return hasPriceValue(props.item.price) ? `¥${props.item.price}` : '¥—'
})
</script>

<style scoped>
.search-goods-card {
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
  contain: layout paint style;
  transition: transform 0.22s ease, box-shadow 0.22s ease;
}

.search-goods-card:active {
  transform: scale(var(--press-scale-card));
}

.cover-wrap {
  position: relative;
  width: 100%;
}

.card-cover {
  width: 100%;
  aspect-ratio: 1 / 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 14px;
  background: #f5f5f7;
}

.cover-img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center bottom;
}

.cover-initial {
  color: rgba(255, 255, 255, 0.86);
  font-size: 44px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.05em;
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
  pointer-events: none;
}

.qty-badge {
  position: absolute;
  right: 7px;
  bottom: 7px;
  z-index: 2;
  padding: 2px 6px;
  border-radius: 7px;
  background: rgba(20, 20, 22, 0.7);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
  pointer-events: none;
}

.card-body {
  display: grid;
  grid-template-rows: minmax(2.7em, auto) 28px 20px;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.card-name {
  margin: 0;
  display: -webkit-box;
  overflow: hidden;
  color: var(--app-text);
  font-size: 16px;
  font-weight: 600;
  line-height: 1.35;
  letter-spacing: -0.03em;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.card-tags {
  display: flex;
  align-items: center;
  gap: 5px;
  overflow: hidden;
}

.card-tags--empty {
  pointer-events: none;
}

.card-chip {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.06);
  color: #3a3a3c;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
}

.card-chip.ip-chip {
  background: rgba(28, 53, 88, 0.1);
  color: #1c3558;
}

.card-bottom-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.card-price {
  color: #8e8e93;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.2;
  white-space: nowrap;
}

.card-price-points {
  margin-left: 4px;
}

.card-days {
  color: #b0b0bc;
  font-size: 11px;
  line-height: 1.2;
  white-space: nowrap;
}

.card-days--placeholder {
  visibility: hidden;
}

.selection-overlay {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 3;
  pointer-events: none;
}

.check-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  border: 1.5px solid rgba(255, 255, 255, 0.82);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.12);
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

.search-goods-card--selected {
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
</style>
