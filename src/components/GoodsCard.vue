<template>
  <article
    class="goods-card"
    :class="[
      `goods-card--${density || 'comfortable'}`,
      { 'goods-card--transitioning': transitioning },
      { 'goods-card--selected': selected }
    ]"
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
      <div class="card-cover" :style="cachedImgSrc ? {} : { background: coverBg }">
        <img v-if="cachedImgSrc" :src="cachedImgSrc" :alt="item.name" class="cover-img" />
        <span v-else class="cover-initial">{{ coverInitial }}</span>
      </div>
      <div v-if="item.quantity > 1" class="qty-badge">×{{ item.quantity }}</div>
    </div>

    <div class="card-body">
      <h3 class="card-name">{{ item.name }}</h3>

      <div class="card-tags" :class="{ 'card-tags--hidden': !showTags }">
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
      </div>

      <div class="card-bottom-row">
        <span class="card-price">{{ item.price ? `¥${item.price}` : '¥—' }}<span v-if="item.points && (density === 'comfortable' || isTablet)" class="card-price-points">+{{ item.points }}积分</span></span>
        <span class="card-days" :class="{ 'card-days--hidden': !showHoldingDays }">持有 {{ holdingDays }} 天</span>
      </div>
    </div>
  </article>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getCachedImage } from '@/utils/imageCache'

const props = defineProps({
  item: { type: Object, required: true },
  density: { type: String, default: '' },
  transitioning: { type: Boolean, default: false },
  selected: { type: Boolean, default: false },
  selectionMode: { type: Boolean, default: false }
})

const emit = defineEmits(['long-press', 'toggle-select', 'open-detail'])

// -------- Long-press / tap logic --------
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

function handleTap() {
  if (props.selectionMode) {
    emit('toggle-select')
  } else {
    emit('open-detail')
  }
}

// --- Touch ---
function onTouchStart(e) {
  const t = e.touches[0]
  startLongPress(t.clientX, t.clientY)
}

function onTouchMove(e) {
  const t = e.touches[0]
  const dx = Math.abs(t.clientX - touchStartX.value)
  const dy = Math.abs(t.clientY - touchStartY.value)
  if (dx > TOUCH_TAP_THRESHOLD || dy > TOUCH_TAP_THRESHOLD) {
    gestureMoved.value = true
    cancelLongPress()
  }
}

function onTouchEnd(e) {
  cancelLongPress()
  // 阻止 touchend 后 click 事件在移动端重复触发
  e.preventDefault()
  if (longPressTriggered.value || gestureMoved.value) return
  handleTap()
}

// --- Mouse （网页端）---
function onTouchCancel() {
  gestureMoved.value = true
  cancelLongPress()
}

function onMouseDown(e) {
  if (e.button !== 0) return
  startLongPress(e.clientX, e.clientY)
}

function onMouseMove(e) {
  const dx = Math.abs(e.clientX - touchStartX.value)
  const dy = Math.abs(e.clientY - touchStartY.value)
  if (dx > MOUSE_TAP_THRESHOLD || dy > MOUSE_TAP_THRESHOLD) {
    gestureMoved.value = true
    cancelLongPress()
  }
}

function onMouseUp(e) {
  if (e.button !== 0) return
  cancelLongPress()
  if (!longPressTriggered.value && !gestureMoved.value) handleTap()
}

function onMouseLeave() {
  gestureMoved.value = true
  cancelLongPress()
}

const cachedImgSrc = ref('')

watch(
  () => props.item.image,
  async (url) => {
    cachedImgSrc.value = url ? await getCachedImage(url) : ''
  },
  { immediate: true }
)

const colorMap = {
  手办: ['#2c2c2e', '#3a3a3c'],
  挂件: ['#1c3a5e', '#2a5298'],
  徽章: ['#3a1c5e', '#6a3d9a'],
  卡片: ['#1c4a3a', '#2e7d5c'],
  'CD/专辑': ['#4a2c1c', '#8b4513'],
  周边服饰: ['#4a3a1c', '#8b6914'],
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

const showCategory = computed(() => props.density !== 'compact' && !!props.item.category)
const showIp = computed(() => props.density !== 'compact' && !!props.item.ip)
const allCharacters = computed(() => props.item.characters || [])
const showCharacters = computed(() => props.density === 'comfortable' && allCharacters.value.length > 0)
const showTags = computed(() => showCategory.value || showIp.value || showCharacters.value)
const showHoldingDays = computed(() => props.density !== 'compact' && holdingDays.value !== null)

const windowWidth = ref(window.innerWidth)
const _onResize = () => { windowWidth.value = window.innerWidth }
onMounted(() => window.addEventListener('resize', _onResize))
onBeforeUnmount(() => window.removeEventListener('resize', _onResize))
const isTablet = computed(() => windowWidth.value >= 900)
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
  transition:
    transform 0.22s ease,
    box-shadow 0.22s ease;
  animation: card-enter 220ms ease both;
}

.goods-card:active {
  transform: scale(var(--press-scale-card));
}

@media (hover: hover) {
  .goods-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 14px 28px rgba(0, 0, 0, 0.08);
  }
}

.cover-wrap {
  position: relative;
  width: 100%;
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
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
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
  background-size: cover;
  background-position: center;
}

.cover-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 10px;
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
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.card-tags {
  display: flex;
  gap: 5px;
  max-height: 28px;
  flex-wrap: nowrap;
  overflow: hidden;
  opacity: 1;
  transform: translateY(0);
}

.card-tags--hidden {
  max-height: 0;
  opacity: 0;
  transform: translateY(-4px);
}

.card-chip {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  max-width: 100%;
  padding: 2px 8px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.06);
  color: #3a3a3c;
  font-size: 11px;
  font-weight: 500;
  text-overflow: ellipsis;
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
  flex: 0 0 auto;
}

.goods-card--standard {
  gap: 9px;
}

.goods-card--standard .card-cover {
  padding: 4px;
}

.goods-card--standard .card-body {
  gap: 4px;
}

.goods-card--standard .card-name {
  font-size: 15px;
  line-height: 1.3;
}

.goods-card--compact .card-bottom-row {
  margin-top: 0;
}

.goods-card--compact .card-cover {
  padding: 0;
}

.goods-card--compact .cover-img {
  border-radius: 0;
}

.goods-card--compact .card-name {
  min-height: 0;
}

@keyframes card-enter {
  from {
    opacity: 0;
    transform: translateY(10px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* -------- Selection overlay -------- */
/*
  遗罩不被沿中暂暗，仅用于定位勾选图标
  卡片选中效果通过 .goods-card--selected 的 filter 实现
*/
.selection-overlay {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 2;
  pointer-events: none;
}

/* 未选中：透明背景圆形轮廓 */
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

/* 选中：实心深色圆 + 白色勾 */
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

/* 选中卡片：轻度暗化，不加边框 */
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

@media (prefers-color-scheme: dark) {
  /* 通用 chip */
  .card-chip {
    background: rgba(255, 255, 255, 0.08);
    color: var(--app-text-secondary);
  }

  .card-chip.char-chip {
    background: rgba(255, 255, 255, 0.08);
    color: var(--app-text);
  }

  .card-chip.ip-chip {
    background: rgba(100, 170, 255, 0.12);
    color: rgba(100, 170, 255, 0.90);
  }

  /* 多选勾：深色模式下使用浅色填充 */
  .check-icon--checked {
    background: #f5f5f7;
    border-color: #f5f5f7;
  }

  .check-icon--checked svg {
    stroke: #141416;
  }
}
</style>
