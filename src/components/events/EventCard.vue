<template>
  <article
    class="event-card"
    :class="{ 'event-card--selected': selected }"
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

    <div class="event-card__media" :class="{ 'event-card__media--empty': !event.coverImage }">
      <img
        v-if="event.coverImage"
        class="event-card__image"
        :src="event.coverImage"
        :alt="event.name || '活动封面'"
        loading="lazy"
      />
      <div v-else class="event-card__placeholder">
        <span>{{ event.name?.trim()?.charAt(0) || '活' }}</span>
      </div>

    </div>

    <div class="event-card__content">
      <h3 class="event-card__title">{{ event.name || '未命名活动' }}</h3>

      <div
        ref="tagsScrollerRef"
        class="event-card__tags-scroll"
        :class="{ 'event-card__tags-scroll--dragging': tagsDragging }"
        @click.stop
        @mousedown.stop="onTagsMouseDown"
        @touchstart.stop
        @touchmove.stop
        @touchend.stop
      >
        <span class="event-card__tag-pill" :class="typeChipClass">{{ typeLabel }}</span>
        <span class="event-card__tag-pill">{{ dateDisplay || '待补充时间' }}</span>
        <span v-if="event.location" class="event-card__tag-pill">{{ event.location }}</span>
        <span v-if="event.linkedGoodsIds?.length" class="event-card__tag-pill">{{ event.linkedGoodsIds.length }} 件关联谷子</span>
        <span v-for="tag in event.tags" :key="tag" class="event-card__tag-pill">{{ tag }}</span>
        <span v-if="event.photos?.length" class="event-card__tag-pill">{{ event.photos.length }} 张照片</span>
      </div>
      
      <div class="event-card__bottom">
        <span v-if="event.ticketPrice" class="event-card__price">¥{{ event.ticketPrice }}</span>
      </div>
    </div>
  </article>
</template>

<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'

const props = defineProps({
  event: { type: Object, required: true },
  selected: { type: Boolean, default: false },
  selectionMode: { type: Boolean, default: false }
})

const emit = defineEmits(['long-press', 'toggle-select', 'open-detail'])

const tagsScrollerRef = ref(null)
const longPressTimer = ref(null)
const longPressTriggered = ref(false)
const startX = ref(0)
const startY = ref(0)
const gestureMoved = ref(false)
const tagsDragging = ref(false)
const TOUCH_TAP_THRESHOLD = 12
const MOUSE_TAP_THRESHOLD = 6
let tagsDragStartX = 0
let tagsDragStartScrollLeft = 0

const TYPE_MAP = {
  exhibition: { label: '展会', cls: 'type-exhibition' },
  concert: { label: '音乐会', cls: 'type-concert' },
  other: { label: '其他', cls: 'type-other' }
}

const typeInfo = computed(() => TYPE_MAP[props.event.type] || TYPE_MAP.other)
const typeLabel = computed(() => typeInfo.value.label)
const typeChipClass = computed(() => typeInfo.value.cls)
const dateDisplay = computed(() => {
  const start = props.event.startDate
  const end = props.event.endDate
  if (!start) return ''
  if (!end || end === start) return start
  return `${start} - ${end}`
})

function startLongPress(x, y) {
  startX.value = x
  startY.value = y
  longPressTriggered.value = false
  gestureMoved.value = false
  longPressTimer.value = window.setTimeout(() => {
    longPressTriggered.value = true
    try {
      navigator.vibrate?.(50)
    } catch {
      // ignore vibration failures
    }
    emit('long-press', props.event.id)
  }, 500)
}

function cancelLongPress() {
  if (!longPressTimer.value) return
  window.clearTimeout(longPressTimer.value)
  longPressTimer.value = null
}

function handleTap() {
  if (props.selectionMode) {
    emit('toggle-select', props.event.id)
    return
  }
  emit('open-detail', props.event.id)
}

function onTouchStart(event) {
  const touch = event.touches[0]
  startLongPress(touch.clientX, touch.clientY)
}

function onTouchMove(event) {
  const touch = event.touches[0]
  const dx = Math.abs(touch.clientX - startX.value)
  const dy = Math.abs(touch.clientY - startY.value)
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
  const dx = Math.abs(event.clientX - startX.value)
  const dy = Math.abs(event.clientY - startY.value)
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

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onTagsMouseMove)
  window.removeEventListener('mouseup', onTagsMouseUp)
})
</script>

<style scoped>
.event-card {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  border-radius: 28px;
  background: var(--app-surface);
  color: var(--app-text);
  text-decoration: none;
  box-shadow: var(--app-shadow);
  overflow: hidden;
  transition: transform 0.16s ease, box-shadow 0.16s ease;
  cursor: pointer;
  user-select: none;
}

.event-card:active {
  transform: scale(var(--press-scale-card));
}

.event-card--selected {
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--color-accent, #315eff) 72%, white),
    var(--app-shadow);
}

.selection-overlay {
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
}

.check-icon {
  position: absolute;
  top: 12px;
  left: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid rgba(255, 255, 255, 0.9);
  box-shadow: 0 4px 10px rgba(20, 20, 22, 0.12);
}

.check-icon--checked {
  background: #141416;
  border-color: #141416;
  color: #fff;
}

.check-icon svg {
  width: 14px;
  height: 14px;
  stroke: currentColor;
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.sel-overlay-enter-active,
.sel-overlay-leave-active {
  transition: opacity 0.18s ease;
}

.sel-overlay-enter-from,
.sel-overlay-leave-to {
  opacity: 0;
}

.event-card__media {
  position: relative;
  aspect-ratio: 4 / 4.6;
  background: linear-gradient(180deg, #2a2d35, #1d2028);
  overflow: hidden;
}

.event-card__media--empty {
  background: linear-gradient(180deg, #2c2f38, #242731);
}

.event-card__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.event-card__placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.84);
  font-size: 42px;
  font-weight: 700;
}

.type-exhibition {
  background: rgba(90, 120, 250, 0.16);
  color: #2d56d5;
}

.type-other {
  background: rgba(142, 142, 147, 0.16);
  color: #666a74;
}

.event-card__content {
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 10px;
  padding: 16px 16px 18px;
  min-height: 0;
}

.event-card__title {
  margin: 0;
  display: -webkit-box;
  overflow: hidden;
  color: var(--app-text);
  font-size: 17px;
  font-weight: 700;
  line-height: 1.45;
  letter-spacing: -0.03em;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.event-card__tags-scroll {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  -ms-overflow-style: none;
  padding-bottom: 4px;
  -webkit-overflow-scrolling: touch;
  touch-action: auto;
  cursor: grab;
}

.event-card__tags-scroll::-webkit-scrollbar {
  display: none;
}

.event-card__tags-scroll--dragging {
  cursor: grabbing;
}

.event-card__tag-pill {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  padding: 5px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-surface-soft) 88%, transparent);
  color: var(--app-text-secondary);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.event-card__tag-pill.type-exhibition {
  background: rgba(90, 120, 250, 0.12);
  color: #355be0;
}

.event-card__tag-pill.type-concert {
  background: rgba(250, 149, 90, 0.14);
  color: #d26f20;
}

.event-card__tag-pill.type-other {
  background: rgba(142, 142, 147, 0.16);
  color: #666a74;
}

.event-card__bottom {
  margin-top: auto;
  min-height: 18px;
}

.event-card__price {
  color: #8e8e93;
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0;
  line-height: 1.2;
}
</style>
