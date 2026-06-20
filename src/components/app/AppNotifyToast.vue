<template>
  <div class="app-notify-container" :style="containerStyle">
    <TransitionGroup name="app-notify-slide">
      <div
        v-for="item in notifications"
        :key="item.id"
        class="app-notify-toast"
        :style="getSwipeStyle(item)"
        @click="handleClick(item)"
        @touchstart.passive="onTouchStart($event, item)"
        @touchmove.passive="onTouchMove($event, item)"
        @touchend="onTouchEnd($event, item)"
      >
        <div class="app-notify-icon" :class="`app-notify-icon--${item.iconType || 'bell'}`">
          <svg v-if="item.iconType === 'success'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          <svg v-else-if="item.iconType === 'warn'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <svg v-else-if="item.iconType === 'update'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          <svg v-else-if="item.iconType === 'syncing'" class="app-notify-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 11-6.219-8.56"/><polyline points="21 3 21 9 15 9"/></svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
        </div>
        <div class="app-notify-body">
          <div class="app-notify-title">{{ item.text }}</div>
          <div class="app-notify-sub">{{ item.subText }}</div>
          <div v-if="item.saleAt && countdowns[item.id]" class="app-notify-countdown-text">{{ countdowns[item.id] }}</div>
          <div v-if="item.actions?.length" class="app-notify-actions">
            <button
              v-for="action in item.actions"
              :key="action.key"
              class="app-notify-action-btn"
              :class="{ 'app-notify-action-btn--primary': action.primary }"
              @click.stop="handleAction(item, action)"
            >
              {{ action.label }}
            </button>
          </div>
        </div>
        <button class="app-notify-close" @click.stop="dismiss(item.id)">✕</button>
        <div v-if="!item.persistent" class="app-notify-countdown" :style="{ width: countdownProgress[item.id] ?? '100%' }" />
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup>
import { reactive, ref, watch, onUnmounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { parseSaleAt } from '@/utils/saleReminder'
import { useNotifySettingsStore } from '@/stores/notifySettings'

const props = defineProps({
  notifications: { type: Array, default: () => [] },
  duration: { type: Number, default: 6000 }
})

const emit = defineEmits(['dismiss'])
const router = useRouter()
const notifySettingsStore = useNotifySettingsStore()

// 计算容器样式
const containerStyle = computed(() => {
  const position = notifySettingsStore.effectiveSettings.position || 'top-right'
  const style = {
    position: 'fixed',
    top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
    zIndex: 9998,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    pointerEvents: 'none',
    width: 'min(calc(100vw - 24px), 320px)'
  }

  switch (position) {
    case 'top-left':
      style.left = '12px'
      break
    case 'top-center':
      style.left = '50%'
      style.transform = 'translateX(-50%)'
      break
    case 'top-right':
    default:
      style.right = '12px'
      break
  }

  return style
})

// ---- sale countdown ----
const countdowns = reactive({})
let countdownTimer = null

function updateCountdowns() {
  const items = props.notifications.filter((n) => n.saleAt)
  if (items.length === 0 && countdownTimer) {
    window.clearInterval(countdownTimer)
    countdownTimer = null
    return
  }

  const now = Date.now()
  for (const item of items) {
    const date = parseSaleAt(item.saleAt)
    if (!date) { countdowns[item.id] = ''; continue }
    const diff = date.getTime() - now
    if (diff <= 0) { countdowns[item.id] = '已到开售时间'; continue }

    const totalSec = Math.floor(diff / 1000)
    const h = Math.floor(totalSec / 3600)
    const m = Math.floor((totalSec % 3600) / 60)
    const s = totalSec % 60
    const parts = []
    if (h > 0) parts.push(`${h}时`)
    if (m > 0) parts.push(`${m}分`)
    parts.push(`${s}秒`)
    countdowns[item.id] = `距开售 ${parts.join(' ')}`
  }
}

watch(
  () => props.notifications.map((n) => `${n.id}:${n.saleAt || ''}`).join(','),
  () => {
    updateCountdowns()
    if (props.notifications.some((n) => n.saleAt) && !countdownTimer) {
      countdownTimer = window.setInterval(updateCountdowns, 1000)
    }
  },
  { immediate: true }
)

onUnmounted(() => {
  if (countdownTimer) window.clearInterval(countdownTimer)
})

// ---- swipe state ----
const swipeState = reactive({})

function onTouchStart(e, item) {
  const touch = e.touches[0]
  swipeState[item.id] = { startX: touch.clientX, startY: touch.clientY, dx: 0, locked: false }
}

function onTouchMove(e, item) {
  const state = swipeState[item.id]
  if (!state) return
  const touch = e.touches[0]
  const dx = touch.clientX - state.startX
  const dy = touch.clientY - state.startY
  if (!state.locked) {
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) {
      state.locked = true
      return
    }
    if (Math.abs(dx) > 8) state.locked = 'h'
  }
  if (state.locked === 'h') {
    state.dx = dx
  }
}

function onTouchEnd(e, item) {
  const state = swipeState[item.id]
  if (!state) return
  if (state.locked === 'h' && Math.abs(state.dx) > 80 && !item.persistent) {
    dismiss(item.id)
  } else {
    state.dx = 0
  }
  delete swipeState[item.id]
}

function getSwipeStyle(item) {
  const state = swipeState[item.id]
  if (!state || state.locked !== 'h') return {}
  const opacity = Math.max(0.2, 1 - Math.abs(state.dx) / 200)
  return {
    transform: `translateX(${state.dx}px)`,
    opacity,
    transition: 'none'
  }
}

// ---- countdown progress (requestAnimationFrame) ----
const countdownProgress = reactive({})
const countdownTimers = new Map()

function startCountdown(item) {
  if (countdownTimers.has(item.id)) return

  const duration = item.duration || props.duration
  const createdAt = item.createdAt || Date.now()
  let rafId = null

  // 立即设置初始值
  countdownProgress[item.id] = '100%'

  function tick() {
    const elapsed = Date.now() - createdAt
    const progress = Math.max(0, 1 - elapsed / duration)
    countdownProgress[item.id] = `${progress * 100}%`

    if (progress > 0) {
      rafId = requestAnimationFrame(tick)
      countdownTimers.set(item.id, rafId)
    } else {
      countdownTimers.delete(item.id)
      // 保持 0% 而不是删除，避免闪烁
    }
  }

  rafId = requestAnimationFrame(tick)
  countdownTimers.set(item.id, rafId)
}

function stopCountdown(id) {
  const rafId = countdownTimers.get(id)
  if (rafId) {
    cancelAnimationFrame(rafId)
    countdownTimers.delete(id)
  }
  // 不删除 countdownProgress[id]，保持最后的进度值，避免消失时闪烁到 100%
}

// 监听通知列表变化，启动/停止倒计时
watch(() => props.notifications, (newList, oldList) => {
  const newIds = new Set(newList.map(n => n.id))
  const oldIds = new Set((oldList || []).map(n => n.id))

  // 启动新通知的倒计时
  for (const item of newList) {
    if (!item.persistent && !oldIds.has(item.id)) {
      startCountdown(item)
    }
  }

  // 停止已消失通知的倒计时
  for (const id of oldIds) {
    if (!newIds.has(id)) {
      stopCountdown(id)
    }
  }
}, { immediate: true })

onUnmounted(() => {
  for (const rafId of countdownTimers.values()) {
    cancelAnimationFrame(rafId)
  }
  countdownTimers.clear()
})

// ---- actions ----
function dismiss(id) {
  emit('dismiss', id)
}

function handleClick(item) {
  if (item.goodsId && !item.actions?.length) {
    router.push(`/detail/${encodeURIComponent(item.goodsId)}`).catch(() => {})
  }
  if (!item.persistent) {
    dismiss(item.id)
  }
}

function handleAction(item, action) {
  action.callback?.()
  dismiss(item.id)
}
</script>

<style scoped>
.app-notify-container {
  /* 样式已通过 JavaScript 动态设置 */
}

.app-notify-toast {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px 16px;
  border-radius: 16px;
  border: 1px solid var(--app-glass-border);
  background: color-mix(in srgb, var(--app-glass-strong) 92%, transparent);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1), 0 1px 4px rgba(0, 0, 0, 0.06);
  backdrop-filter: blur(var(--app-frost-soft-blur)) saturate(var(--app-frost-saturate));
  -webkit-backdrop-filter: blur(var(--app-frost-soft-blur)) saturate(var(--app-frost-saturate));
  cursor: pointer;
  pointer-events: auto;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  overflow: hidden;
  will-change: transform, opacity;
}

.app-notify-toast:active {
  opacity: 0.85;
  transform: scale(0.98);
}

.app-notify-icon {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  margin-top: 1px;
  color: var(--app-chip-accent-text);
}
.app-notify-icon svg {
  width: 100%;
  height: 100%;
}
.app-notify-icon--success { color: #34c759; }
.app-notify-icon--warn { color: #ff9500; }
.app-notify-icon--update { color: var(--app-chip-accent-text); }
.app-notify-icon--syncing { color: var(--app-chip-accent-text); }

.app-notify-body {
  flex: 1;
  min-width: 0;
}

.app-notify-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--app-text);
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-notify-sub {
  font-size: 12px;
  color: var(--app-text-secondary);
  line-height: 1.3;
  margin-top: 2px;
}

.app-notify-countdown-text {
  font-size: 12px;
  font-weight: 600;
  color: var(--app-chip-accent-text);
  margin-top: 3px;
  letter-spacing: 0.3px;
}

.app-notify-actions {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}

.app-notify-action-btn {
  flex: 1;
  padding: 5px 10px;
  border-radius: 8px;
  border: 1px solid var(--app-border);
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  -webkit-tap-highlight-color: transparent;
}

.app-notify-action-btn:active {
  opacity: 0.7;
}

.app-notify-action-btn--primary {
  background: color-mix(in srgb, var(--app-chip-accent-text) 12%, transparent);
  border-color: color-mix(in srgb, var(--app-chip-accent-text) 30%, transparent);
  color: var(--app-chip-accent-text);
}

.app-notify-action-btn--primary:active {
  background: color-mix(in srgb, var(--app-chip-accent-text) 22%, transparent);
}

.app-notify-close {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: rgba(0, 0, 0, 0.06);
  border-radius: 50%;
  font-size: 11px;
  color: var(--app-text-tertiary);
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

/* ---- countdown bar ---- */
.app-notify-countdown {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 3px;
  background: color-mix(in srgb, var(--app-chip-accent-text) 60%, transparent);
  border-radius: 0 0 16px 16px;
  transition: width 50ms linear;
}

.app-notify-spin {
  animation: app-notify-rotate 1s linear infinite;
}

@keyframes app-notify-rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* ---- slide transition ---- */
.app-notify-slide-enter-active {
  transition: all 0.32s cubic-bezier(0.22, 1, 0.36, 1);
}

.app-notify-slide-leave-active {
  transition: all 0.25s cubic-bezier(0.55, 0, 1, 0.45);
}

.app-notify-slide-enter-from {
  opacity: 0;
  transform: translateX(60px) scale(0.92);
}

.app-notify-slide-leave-to {
  opacity: 0;
  transform: translateX(60px) scale(0.92);
}

.app-notify-slide-move {
  transition: transform 0.3s ease;
}
</style>
