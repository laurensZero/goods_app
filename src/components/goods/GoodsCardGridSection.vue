<template>
  <section :class="['goods-section', 'goods-view-pane', { 'goods-view-pane--sorting': isSortAnimating }]">
    <div
      ref="goodsListEl"
      :class="[
        'goods-list',
        { 'goods-list--density-animating': transitioning }
      ]"
      :style="gridStyle"
    >
      <div
        v-if="beforeSpacerHeight > 0"
        class="goods-list-spacer"
        aria-hidden="true"
        :style="{ height: `${beforeSpacerHeight}px` }"
      />
      <GoodsCard
        v-for="(item, index) in items"
        :key="item.id"
        :ref="(instance) => setCardRef(item.id, instance)"
        :item="item"
        :density="density"
        :transitioning="transitioning"
        :motion-style="cardMotionStyles[item.id]"
        :data-goods-id="item.id"
        :data-scroll-anchor="'goods-card'"
        :data-scroll-index="index + indexOffset"
        :selected="selectedIds?.has?.(item.id) ?? false"
        :selection-mode="selectionMode"
        @long-press="emit('long-press', item.id)"
        @toggle-select="emit('toggle-select', item.id)"
        @open-detail="(payload) => emit('open-detail', payload || item.id)"
      />
      <div
        v-if="afterSpacerHeight > 0"
        class="goods-list-spacer"
        aria-hidden="true"
        :style="{ height: `${afterSpacerHeight}px` }"
      />
    </div>
  </section>
</template>

<script setup>
import { nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { HOME_MOTION } from '@/constants/homeMotion'
import GoodsCard from '@/components/goods/GoodsCard.vue'

defineOptions({ name: 'GoodsCardGridSection' })

const props = defineProps({
  items: {
    type: Array,
    default: () => []
  },
  density: {
    type: String,
    required: true
  },
  gridStyle: {
    type: Object,
    default: () => ({})
  },
  transitioning: {
    type: Boolean,
    default: false
  },
  isSortAnimating: {
    type: Boolean,
    default: false
  },
  selectionMode: {
    type: Boolean,
    default: false
  },
  selectedIds: {
    type: Object,
    default: null
  },
  indexOffset: {
    type: Number,
    default: 0
  },
  beforeSpacerHeight: {
    type: Number,
    default: 0
  },
  afterSpacerHeight: {
    type: Number,
    default: 0
  },
  addMotionSnapshot: {
    type: Object,
    default: null
  },
  addMotionRequest: {
    type: Object,
    default: null
  },
  lowPerfMotion: {
    type: Boolean,
    default: false
  },
  autoPlayMotion: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['long-press', 'toggle-select', 'open-detail'])

const goodsListEl = ref(null)
const cardRefs = new Map()
const cardMotionStyles = reactive({})

let motionClearTimer = 0
let motionRunToken = 0
let motionRetryRaf = 0

function setCardRef(id, instance) {
  const key = String(id || '')
  if (!key) return
  if (instance) {
    cardRefs.set(key, instance)
  } else {
    cardRefs.delete(key)
  }
}

function getElement(instance) {
  if (!instance) return null
  return instance.$el || instance
}

function getRect(instance) {
  const el = getElement(instance)
  if (!el?.getBoundingClientRect) return null
  const rect = el.getBoundingClientRect()
  if (!rect.width || !rect.height) return null
  return rect
}

function captureVisibleItemRects(limit = 40) {
  const rects = []
  const max = Math.max(0, Number(limit) || 0)
  if (!max) return rects

  for (const item of props.items) {
    const instance = cardRefs.get(String(item.id || ''))
    const rect = getRect(instance)
    if (!rect) continue

    rects.push({
      id: String(item.id || ''),
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height
    })

    if (rects.length >= max) break
  }

  return rects
}

function clearMotionStyles() {
  for (const key of Object.keys(cardMotionStyles)) {
    delete cardMotionStyles[key]
  }
}

function cancelMotionRetry() {
  if (!motionRetryRaf) return
  window.cancelAnimationFrame(motionRetryRaf)
  motionRetryRaf = 0
}

function getOriginRect(payload) {
  const rect = payload?.originRect
  if (rect && Number.isFinite(rect.left) && Number.isFinite(rect.top) && Number.isFinite(rect.width) && Number.isFinite(rect.height)) {
    return rect
  }

  const viewportWidth = window.innerWidth || 360
  const viewportHeight = window.innerHeight || 640
  return {
    left: viewportWidth * 0.78,
    top: viewportHeight * 0.82,
    width: 56,
    height: 56
  }
}

function resolveMotionDuration() {
  return 320
}

function resolveMotionEasing() {
  return HOME_MOTION.easeEmphasis
}

function applyStartStyle(id, dx, dy, scale, opacity, zIndex) {
  cardMotionStyles[id] = {
    transform: `translate(${dx}px, ${dy}px) scale(${scale})`,
    opacity: `${opacity}`,
    transition: 'none',
    willChange: 'transform, opacity',
    zIndex: String(zIndex)
  }
}

function applyEndStyle(id, durationMs, zIndex) {
  cardMotionStyles[id] = {
    transform: 'translate(0, 0) scale(1)',
    opacity: '1',
    transition: `transform ${durationMs}ms ${resolveMotionEasing()}, opacity ${durationMs}ms ${resolveMotionEasing()}`,
    willChange: 'auto',
    zIndex: String(zIndex)
  }
}

async function playAddMotion(payload) {
  const requestId = String(payload?.token || '')
  const targetId = String(payload?.id || '')
  const snapshot = props.addMotionSnapshot

  if (!requestId || !targetId || !snapshot || !Array.isArray(snapshot.cards) || snapshot.cards.length === 0) {
    clearMotionStyles()
    return
  }

  const snapshotMap = new Map(snapshot.cards.map((card) => [String(card.id || ''), card]))
  const originRect = getOriginRect(payload)
  const motionDuration = resolveMotionDuration()
  const nextStyles = []
  const visibleItems = props.items.slice(0, Math.min(props.items.length, 40))

  for (const item of visibleItems) {
    const id = String(item.id || '')
    if (!id) continue

    const instance = cardRefs.get(id)
    const lastRect = getRect(instance)
    if (!lastRect) continue

    const previousRect = snapshotMap.get(id)
    const sourceRect = previousRect || (id === targetId ? originRect : null)
    if (!sourceRect) continue

    const dx = Math.round(sourceRect.left - lastRect.left)
    const dy = Math.round(sourceRect.top - lastRect.top)
    const isTarget = id === targetId

    if (!dx && !dy && !isTarget) continue

    nextStyles.push({
      id,
      dx,
      dy,
      scale: isTarget ? 0.82 : 0.975,
      opacity: isTarget ? 0 : 0.88,
      zIndex: isTarget ? 3 : 1
    })
  }

  if (!nextStyles.length) {
    cancelMotionRetry()
    motionRetryRaf = window.requestAnimationFrame(() => {
      motionRetryRaf = 0
      void playAddMotion(payload)
    })
    return
  }

  motionRunToken += 1
  const token = motionRunToken

  clearMotionStyles()
  for (const item of nextStyles) {
    applyStartStyle(item.id, item.dx, item.dy, item.scale, item.opacity, item.zIndex)
  }

  await nextTick()
  await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)))

  if (token !== motionRunToken) return

  for (const item of nextStyles) {
    applyEndStyle(item.id, motionDuration, item.zIndex)
  }

  if (motionClearTimer) window.clearTimeout(motionClearTimer)
  motionClearTimer = window.setTimeout(() => {
    if (token !== motionRunToken) return
    clearMotionStyles()
  }, motionDuration + 120)
}

watch(
  () => [props.addMotionRequest?.token, props.addMotionSnapshot?.token],
  () => {
    if (props.lowPerfMotion) {
      const payload = props.addMotionRequest
      const targetId = String(payload?.id || '')
      const instance = targetId ? cardRefs.get(targetId) : null
      const lastRect = getRect(instance)
      if (!targetId || !lastRect || !payload) {
        clearMotionStyles()
        return
      }

      const originRect = getOriginRect(payload)
      const dx = Math.round(originRect.left - lastRect.left)
      const dy = Math.round(originRect.top - lastRect.top)
      motionRunToken += 1
      clearMotionStyles()
      applyStartStyle(targetId, dx, dy, 0.9, 0, 3)
      void nextTick().then(() => {
        window.requestAnimationFrame(() => {
          applyEndStyle(targetId, 180, 3)
          if (motionClearTimer) window.clearTimeout(motionClearTimer)
          motionClearTimer = window.setTimeout(clearMotionStyles, 240)
        })
      })
      return
    }

    if (props.autoPlayMotion) {
      void playAddMotion(props.addMotionRequest)
    }
  },
  { flush: 'post' }
)

onBeforeUnmount(() => {
  if (motionClearTimer) window.clearTimeout(motionClearTimer)
  cancelMotionRetry()
  clearMotionStyles()
})

defineExpose({
  goodsListEl,
  captureVisibleItemRects,
  playAddMotion
})
</script>

<style scoped>
.goods-list {
  display: grid;
  gap: var(--card-gap);
  align-items: start;
  contain: layout paint;
}

.goods-view-pane {
  transform-origin: top center;
  contain: paint;
}

.goods-view-pane--sorting {
  pointer-events: none;
}

.goods-list-spacer {
  grid-column: 1 / -1;
  pointer-events: none;
}
</style>
