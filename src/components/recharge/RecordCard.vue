<template>
  <article
    :class="['record-card', {
      'record-card--selection': selectionMode,
      'record-card--selected': selected
    }]"
    @touchstart="onTouchStart"
    @touchmove="onTouchMove"
    @touchend="onTouchEnd"
    @touchcancel="onTouchCancel"
    @mousedown.left="onMouseDown"
    @mousemove="onMouseMove"
    @mouseup="onMouseUp"
    @mouseleave="onMouseLeave"
    @contextmenu.prevent
    @click="onClick"
  >
    <div v-if="selectionMode" class="record-select-indicator" aria-hidden="true">
      <span :class="['record-select-indicator__dot', { 'record-select-indicator__dot--active': selected }]" />
    </div>

    <div class="record-thumb-wrap">
      <LazyCachedImage
        v-if="resolvedImage"
        :src="resolvedImage"
        :alt="record.itemName || '充值项目图片'"
        class="record-thumb"
        loading="lazy"
      />
      <div v-else class="record-thumb record-thumb--fallback">{{ recordInitial }}</div>
    </div>

    <div class="record-body">
      <div class="record-head">
        <p class="record-name">{{ record.itemName || '未命名项目' }}</p>
        <p class="record-amount">¥{{ amountText }}</p>
      </div>

      <div class="record-meta">
        <span class="record-chip">{{ record.game || '未分类游戏' }}</span>
        <span class="record-chip">{{ record.chargedAt || '未填写日期' }}</span>
      </div>

      <p v-if="record.note" class="record-note">{{ record.note }}</p>
    </div>
  </article>
</template>

<script setup>
import { computed, ref } from 'vue'
import LazyCachedImage from '@/components/image/LazyCachedImage.vue'
import rechargeDistribution from '@/constants/recharge-options-distribution.json'

const GAME_LABEL_MAP = {
  hk4e_cn: '原神',
  hkrpg_cn: '星穹铁道',
  bh3_cn: '崩坏3',
  nap_cn: '绝区零'
}

const presetImageMap = (() => {
  const map = new Map()
  const nameMap = new Map()
  const source = rechargeDistribution || {}

  for (const value of Object.values(source)) {
    const gameBiz = String(value?.gameBiz || '').trim()
    const gameLabel = GAME_LABEL_MAP[gameBiz] || gameBiz
    const options = Array.isArray(value?.options) ? value.options : []

    for (const option of options) {
      const name = normalizeItemName(String(option?.name || '').trim())
      const amount = Number(option?.amount || 0)
      const image = String(option?.image || '').trim()
      if (!gameLabel || !name || !Number.isFinite(amount) || amount <= 0 || !image) continue

      const key = buildImageLookupKey(gameLabel, name, amount)
      if (!map.has(key)) {
        map.set(key, image)
      }

      const nameKey = buildImageLookupKey(gameLabel, name, 0)
      if (!nameMap.has(nameKey)) {
        nameMap.set(nameKey, image)
      }
    }
  }

  return { map, nameMap }
})()

function normalizeItemName(name) {
  let text = String(name || '').trim().replace(/\s+/g, '')
  if (!text) return ''

  text = text.replace(/x\d+$/iu, '')
  text = text.replace(/^\d+创世结晶$/u, '创世结晶')
  text = text.replace(/^\d+菲林底片$/u, '菲林底片')
  return text.trim()
}

function buildImageLookupKey(game, name, amount) {
  return `${String(game || '').trim()}::${normalizeItemName(name)}::${Number(amount || 0).toFixed(2)}`
}

function resolvePresetImage(record) {
  const game = String(record?.game || '').trim()
  const nameRaw = String(record?.itemName || '').trim()
  const name = normalizeItemName(nameRaw)
  const amount = Number(record?.amount || 0)
  if (!game || !name || !Number.isFinite(amount)) return ''

  const nameKey = buildImageLookupKey(game, name, 0)

  if (amount <= 0) {
    return presetImageMap.nameMap.get(nameKey) || ''
  }

  const candidates = [amount]
  const countMatch = nameRaw.match(/x(\d+)$/iu)
  if (countMatch) {
    const count = Number(countMatch[1])
    if (Number.isFinite(count) && count > 1) {
      const perUnit = amount / count
      if (Number.isFinite(perUnit) && perUnit > 0) {
        candidates.push(perUnit)
      }
    }
  }

  for (const candidateAmount of candidates) {
    const key = buildImageLookupKey(game, name, candidateAmount)
    const matched = presetImageMap.map.get(key)
    if (matched) return matched
  }

  return presetImageMap.nameMap.get(nameKey) || ''
}

const props = defineProps({
  record: {
    type: Object,
    required: true
  },
  selectionMode: {
    type: Boolean,
    default: false
  },
  selected: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['hold', 'click'])

const LONG_PRESS_MS = 420
const TOUCH_MOVE_THRESHOLD = 12
const MOUSE_MOVE_THRESHOLD = 6

const amountText = computed(() => Number(props.record.amount || 0).toFixed(2))
const resolvedImage = computed(() => {
  const direct = String(props.record.image || '').trim()
  if (direct) return direct
  return resolvePresetImage(props.record)
})
const recordInitial = computed(() => {
  const source = String(props.record.itemName || props.record.game || '?').trim()
  return source.charAt(0).toUpperCase() || '?'
})

const longPressTimer = ref(0)
const startX = ref(0)
const startY = ref(0)
const suppressClick = ref(false)

function clearLongPressTimer() {
  if (!longPressTimer.value) return
  window.clearTimeout(longPressTimer.value)
  longPressTimer.value = 0
}

function startLongPress(x, y) {
  startX.value = x
  startY.value = y
  clearLongPressTimer()
  longPressTimer.value = window.setTimeout(() => {
    longPressTimer.value = 0
    suppressClick.value = true
    try { navigator.vibrate?.(50) } catch {}
    emit('hold', props.record)
  }, LONG_PRESS_MS)
}

function checkMove(x, y, threshold) {
  if (Math.abs(x - startX.value) > threshold || Math.abs(y - startY.value) > threshold) {
    clearLongPressTimer()
  }
}

function onTouchStart(event) {
  const touch = event.touches[0]
  if (!touch) return
  startLongPress(touch.clientX, touch.clientY)
}

function onTouchMove(event) {
  const touch = event.touches[0]
  if (!touch) return
  checkMove(touch.clientX, touch.clientY, TOUCH_MOVE_THRESHOLD)
}

function onTouchEnd() {
  clearLongPressTimer()
}

function onTouchCancel() {
  clearLongPressTimer()
}

function onMouseDown(event) {
  startLongPress(event.clientX, event.clientY)
}

function onMouseMove(event) {
  checkMove(event.clientX, event.clientY, MOUSE_MOVE_THRESHOLD)
}

function onMouseUp() {
  clearLongPressTimer()
}

function onMouseLeave() {
  clearLongPressTimer()
}

function onClick() {
  if (suppressClick.value) {
    suppressClick.value = false
    return
  }

  emit('click', props.record)
}
</script>

<style scoped>
.record-card {
  position: relative;
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr);
  gap: 10px;
  align-items: start;
  min-width: 0;
  padding: 10px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--app-surface-soft) 42%, var(--app-surface));
  box-shadow: inset 0 0 0 1px var(--app-border);
  transition: transform var(--motion-fast) var(--motion-emphasis);
}

.record-card:active {
  transform: scale(var(--press-scale-card));
}

.record-card--selection {
  cursor: pointer;
}

.record-card--selected {
  box-shadow:
    inset 0 0 0 2px color-mix(in srgb, var(--app-text) 22%, transparent),
    0 10px 22px rgba(20, 20, 22, 0.08);
  background: color-mix(in srgb, var(--app-surface-soft) 72%, var(--app-surface));
}

.record-select-indicator {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-surface) 88%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--app-text) 10%, transparent);
}

.record-select-indicator__dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: transparent;
  transition: background var(--motion-fast) var(--motion-emphasis), transform var(--motion-fast) var(--motion-emphasis);
}

.record-select-indicator__dot--active {
  background: var(--app-text);
  transform: scale(1.05);
}

.record-thumb-wrap {
  width: 56px;
  height: 56px;
  overflow: hidden;
  border-radius: 12px;
  background: #ffffff;
}

.record-thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: #ffffff;
}

.record-thumb.lazy-image-placeholder,
.record-thumb.lazy-image-fallback {
  flex-direction: row;
  gap: 0;
}

.record-thumb.lazy-image-placeholder span,
.record-thumb.lazy-image-fallback span {
  display: none;
}

.record-thumb.lazy-image-placeholder .lazy-image-placeholder__dot {
  width: 16px;
  height: 16px;
}

.record-thumb--fallback {
  color: #ffffff;
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.04em;
}

.record-body {
  min-width: 0;
}

.record-card--selection .record-body {
  padding-right: 28px;
}

.record-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.record-name {
  color: var(--app-text);
  font-size: 14px;
  font-weight: 700;
  line-height: 1.35;
  letter-spacing: -0.02em;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.record-amount {
  color: var(--app-text);
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.03em;
  white-space: nowrap;
}

.record-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.record-chip {
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-surface-soft) 88%, transparent);
  color: var(--app-text-secondary);
  font-size: 11px;
  line-height: 22px;
}

.record-note {
  margin-top: 8px;
  color: var(--app-text-secondary);
  font-size: 12px;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

:global(html.theme-dark) .record-thumb--fallback {
  background: linear-gradient(135deg, #f5f5f7 0%, #9ca3af 100%);
  color: #141416;
}

:global(html.theme-dark) .record-card--selected {
  box-shadow:
    inset 0 0 0 2px rgba(255, 255, 255, 0.14),
    0 12px 26px rgba(0, 0, 0, 0.26);
}

:global(html.theme-dark) .record-select-indicator {
  background: rgba(255, 255, 255, 0.08);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
}

:global(html.theme-dark) .record-select-indicator__dot--active {
  background: #f5f5f7;
}
</style>
