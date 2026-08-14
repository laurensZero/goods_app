<template>
  <section
    v-if="queue.length > 0"
    class="confirm-card"
    :class="{
      'confirm-card--queue': queue.length > 1,
      'confirm-card--tablet': isTablet,
    }"
  >
    <div class="confirm-card__inner">
      <!-- 手机端：左右滑动切换待确认商品，每张卡片 = 一个商品 -->
      <div v-if="!isTablet" ref="deckEl" class="sku-deck" @scroll="handleDeckScroll">
        <div v-for="(entry, index) in queue" :key="entry.uid" class="sku-deck__slide" :data-uid="entry.uid">
          <slot
            name="slide"
            :entry="entry"
            :index="index"
            :active="entry.uid === activeUid"
            :is-tablet="isTablet"
          />
        </div>
      </div>

      <!-- 平板端：当前商品主卡片 -->
      <div v-else class="confirm-card__body">
        <slot
          name="slide"
          :entry="activeEntry"
          :index="activeIndex"
          :active="true"
          :is-tablet="true"
        />
      </div>

      <!-- 平板端：队列卡片铺在主卡片右侧，点击切换 -->
      <div v-if="isTablet && queue.length > 1" class="queue-cards">
        <button
          v-for="entry in queue"
          :key="entry.uid"
          type="button"
          class="queue-card"
          :class="{ 'queue-card--active': entry.uid === activeUid }"
          @click="$emit('activate', entry.uid)"
        >
          <slot name="queue-card" :entry="entry">
            <span class="queue-card__thumb">
              <img v-if="entry.coverUrl" :src="entry.coverUrl" alt="" loading="lazy" />
              <span v-else>{{ (entry.name || '谷').charAt(0) }}</span>
            </span>
            <span class="queue-card__copy">
              <span class="queue-card__name">{{ entry.name }}</span>
              <span
                class="queue-card__sku"
                :class="{ 'queue-card__sku--pending': !entry.selectedSkus.length && !entry.error }"
              >
                {{ entry.error || (queueSummary ? queueSummary(entry) : defaultSummary(entry)) }}
              </span>
            </span>
            <span
              class="queue-card__remove"
              :aria-label="t('mihoyoStock.remove')"
              @click.stop="$emit('remove', entry.uid)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </span>
          </slot>
        </button>
      </div>
    </div>

    <!-- 手机端：滑动指示点 -->
    <div v-if="!isTablet && queue.length > 1" class="sku-deck-dots">
      <span
        v-for="entry in queue"
        :key="entry.uid"
        class="sku-deck-dot"
        :class="{ 'sku-deck-dot--on': entry.uid === activeUid }"
      />
    </div>

    <!-- 底部操作：由使用方注入（取消 / 确认） -->
    <div class="confirm-actions">
      <slot name="actions" />
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

defineOptions({ name: 'MihoyoGoodsQueuePanel' })

const props = defineProps({
  queue: { type: Array, required: true },
  activeUid: { type: String, default: '' },
  isTablet: { type: Boolean, default: false },
  // (entry) => string —— 队列卡片摘要文案；缺省时用默认摘要
  queueSummary: { type: Function, default: null },
})

const emit = defineEmits(['activate', 'remove', 'deck-scroll'])

const { t } = useI18n()

const activeEntry = computed(() => props.queue.find((e) => e.uid === props.activeUid) || null)
const activeIndex = computed(() => props.queue.findIndex((e) => e.uid === props.activeUid))

// 默认摘要：整件 / 单款式名 / 已选 N 款
function defaultSummary(entry) {
  const list = entry.selectedSkus || []
  if (list.length === 0) return t('mihoyoStock.selectSkuHint')
  if (list.length === 1) return list[0].text || list[0].key
  return t('mihoyoStock.skuSelectedCount', { count: list.length })
}

// 暴露滑动卡片容器，供使用方 scrollDeckToActive / onDeckScroll 使用
const deckEl = ref(null)
defineExpose({
  get deckEl() {
    return deckEl.value
  },
})

// ── 滑动容器高度跟随当前卡片 ──
// 手机端多张卡片横向滑动时，flex 容器默认会拉伸到最高那张卡片的高度，
// 导致翻到较矮的卡片时下方出现一大块空白（尤其前面卡片展开了「修改信息」）。
// 这里让容器高度 = 当前激活卡片的实际高度，切换卡片 / 内容展开收起时
// 通过 ResizeObserver 自动同步，空白区随之消失。
let deckHeightObserver = null
let deckScrollFrame = 0

function setDeckHeight(slide) {
  const deck = deckEl.value
  if (!deck || !slide) return
  const height = Math.ceil(slide.getBoundingClientRect().height)
  if (height > 0) deck.style.height = `${height}px`
}

function findSlide(uid) {
  const deck = deckEl.value
  if (!deck || !uid) return null
  return Array.from(deck.children).find((slide) => slide.dataset.uid === uid) || null
}

function syncDeckHeight(uid = props.activeUid) {
  if (deckHeightObserver) {
    deckHeightObserver.disconnect()
    deckHeightObserver = null
  }
  const deck = deckEl.value
  const slide = findSlide(uid)
  if (!slide) return
  // 监听所有卡片：当前卡片展开/收起后，ResizeObserver 能立即重新计算高度。
  deckHeightObserver = new ResizeObserver(() => {
    setDeckHeight(findSlide(props.activeUid))
  })
  Array.from(deck.children).forEach((item) => deckHeightObserver.observe(item))
  setDeckHeight(slide)
}

function handleDeckScroll() {
  emit('deck-scroll')
  if (deckScrollFrame) cancelAnimationFrame(deckScrollFrame)
  deckScrollFrame = requestAnimationFrame(() => {
    deckScrollFrame = 0
    const deck = deckEl.value
    if (!deck || !deck.clientWidth) return
    const index = Math.max(0, Math.min(
      Math.round(deck.scrollLeft / deck.clientWidth),
      deck.children.length - 1,
    ))
    setDeckHeight(deck.children[index])
  })
}

onMounted(syncDeckHeight)

watch(
  () => props.activeUid,
  () => nextTick(syncDeckHeight)
)

watch(
  () => props.queue.length,
  () => nextTick(syncDeckHeight)
)

watch(
  () => props.isTablet,
  () => nextTick(syncDeckHeight)
)

onBeforeUnmount(() => {
  if (deckScrollFrame) cancelAnimationFrame(deckScrollFrame)
  deckScrollFrame = 0
  if (deckHeightObserver) {
    deckHeightObserver.disconnect()
    deckHeightObserver = null
  }
})
</script>

<style scoped>
.confirm-card {
  width: 100%;
  max-width: none;
  padding: 16px;
  border-radius: 20px;
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
}

.confirm-card__inner {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* 手机端：左右滑动卡片，一屏一卡 */
.sku-deck {
  display: flex;
  /* 卡片不拉伸到最高那张的高度，容器高度由 JS 跟随当前激活卡片 */
  align-items: flex-start;
  overflow-x: auto;
  /* 非当前卡片更高时只裁剪不出现纵向滚动条（它本就在屏幕外） */
  overflow-y: hidden;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
  /* 切换卡片/展开收起时高度平滑过渡 */
  transition: height 0.25s ease;
}

.sku-deck::-webkit-scrollbar {
  display: none;
}

.sku-deck__slide {
  flex: 0 0 100%;
  min-width: 0;
  scroll-snap-align: start;
  scroll-snap-stop: always;
}

/* 滑动指示点 */
.sku-deck-dots {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 14px;
}

.sku-deck-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--app-border);
  transition: background 0.2s, width 0.2s;
}

.sku-deck-dot--on {
  width: 18px;
  border-radius: 4px;
  background: var(--app-chip-accent-text);
}

/* 底部操作区（按钮样式由使用方提供） */
.confirm-actions {
  display: flex;
  gap: 10px;
  margin-top: 16px;
}

/* 平板端：多选队列与主卡片并排铺开 */
.confirm-card__body {
  flex: 1;
  min-width: 0;
}

.confirm-card--tablet .confirm-card__inner {
  flex-direction: row;
  align-items: flex-start;
}

.queue-cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  flex-shrink: 0;
}

.confirm-card--tablet .queue-cards {
  width: 240px;
  max-height: 420px;
  overflow-y: auto;
}

.queue-card {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px;
  border: 1px solid var(--app-border);
  border-radius: 12px;
  background: var(--app-surface-soft);
  color: var(--app-text);
  text-align: left;
  cursor: pointer;
}

.queue-card--active {
  border-color: var(--app-chip-accent-text);
  background: color-mix(in srgb, var(--app-chip-accent-text) 8%, var(--app-surface-soft));
}

.queue-card__thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 9px;
  overflow: hidden;
  flex-shrink: 0;
  background: var(--app-surface);
  color: var(--app-text-tertiary);
  font-size: 14px;
}

.queue-card__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.queue-card__copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.queue-card__name {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queue-card__sku {
  font-size: 11px;
  color: var(--app-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queue-card__sku--pending {
  color: var(--app-text-tertiary);
}

.queue-card__remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--app-text-tertiary);
  cursor: pointer;
  flex-shrink: 0;
}

.queue-card__remove svg {
  width: 14px;
  height: 14px;
  stroke: currentColor;
}

.queue-card__remove:active {
  background: color-mix(in srgb, var(--app-text) 8%, transparent);
  color: #ff3b30;
}
</style>
