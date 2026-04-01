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

      <span v-if="event.ticketPrice" class="event-card__ticket">¥{{ event.ticketPrice }}</span>
    </div>

    <div class="event-card__content">
      <h3 class="event-card__title">{{ event.name || '未命名活动' }}</h3>

      <div class="event-card__meta">
        <span class="event-card__tag" :class="typeChipClass">{{ typeLabel }}</span>
        <span class="event-card__pill">{{ dateDisplay || '待补充时间' }}</span>
        <span v-if="event.location" class="event-card__pill">{{ event.location }}</span>
        <span v-if="event.linkedGoodsIds?.length" class="event-card__pill">
          {{ event.linkedGoodsIds.length }} 件关联谷子
        </span>
        <span v-if="event.tags?.length" class="event-card__tag">{{ event.tags[0] }}</span>
      </div>

      <div class="event-card__footer">
        <span v-if="event.photos?.length" class="event-card__subtle">{{ event.photos.length }} 张照片</span>
      </div>
    </div>
  </article>
</template>

<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  event: { type: Object, required: true },
  selected: { type: Boolean, default: false },
  selectionMode: { type: Boolean, default: false }
})

const emit = defineEmits(['long-press', 'toggle-select', 'open-detail'])

const longPressTimer = ref(null)
const longPressTriggered = ref(false)
const startX = ref(0)
const startY = ref(0)
const gestureMoved = ref(false)
const TOUCH_TAP_THRESHOLD = 12
const MOUSE_TAP_THRESHOLD = 6

const TYPE_MAP = {
  exhibition: { label: '展会', cls: 'type-exhibition' },
  market: { label: '市集', cls: 'type-market' },
  exchange: { label: '交换会', cls: 'type-exchange' },
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

.event-card__ticket {
  position: absolute;
  top: 12px;
  right: 12px;
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 700;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  background: rgba(20, 20, 22, 0.72);
  color: #ffffff;
}

.type-exhibition {
  background: rgba(90, 120, 250, 0.16);
  color: #2d56d5;
}

.type-market {
  background: rgba(250, 149, 90, 0.16);
  color: #da6f1d;
}

.type-exchange {
  background: rgba(50, 200, 140, 0.16);
  color: #169866;
}

.type-other {
  background: rgba(142, 142, 147, 0.16);
  color: #666a74;
}

.event-card__content {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 16px 18px;
}

.event-card__title {
  margin: 0;
  color: var(--app-text);
  font-size: 17px;
  font-weight: 700;
  line-height: 1.45;
  letter-spacing: -0.03em;
}

.event-card__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.event-card__pill,
.event-card__tag {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.event-card__pill {
  background: color-mix(in srgb, var(--app-surface-soft) 88%, transparent);
  color: var(--app-text-secondary);
}

.event-card__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  min-height: 20px;
}

.event-card__tag {
  background: rgba(120, 100, 255, 0.1);
  color: #7864ff;
}

.event-card__subtle {
  margin-left: auto;
  color: var(--app-text-tertiary);
  font-size: 12px;
}
</style>
