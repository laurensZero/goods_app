<template>
  <Transition name="sheet-pop">
    <div v-if="showDialog" class="overlay" @click.self="store.dismiss()">
      <div
        class="dialog birthday-dialog"
        :style="accentStyle"
        @pointerdown="onPointerDown"
        @pointerup="onPointerUp"
      >
        <div class="birthday-ribbon" aria-hidden="true">🎂</div>
        <p class="birthday-kicker">Happy Birthday</p>

        <Transition :name="`birthday-slide-${slideDirection}`" mode="out-in">
          <div :key="current.id" class="birthday-slide">
            <h3 class="dialog-title">{{ t('birthday.todayTitle', { name: current.name }) }}</h3>

            <p class="birthday-meta">
              <span v-if="current.ip" class="birthday-meta__ip">{{ current.ip }}</span>
              <span>{{ t('birthday.dateLabel', { month: current.month, day: current.day }) }}</span>
            </p>

            <p class="birthday-message">
              {{ current.message || t('birthday.defaultMessage', { name: current.name }) }}
            </p>

            <div class="birthday-stats">
              <div class="birthday-stat">
                <span class="birthday-stat__value">{{ t('birthday.countValue', { count: formatQuantity(current.quantity) }) }}</span>
                <span class="birthday-stat__label">{{ t('birthday.countLabel') }}</span>
              </div>
              <div class="birthday-stat">
                <span class="birthday-stat__value">¥ {{ formatMoney(current.totalValue) }}</span>
                <span class="birthday-stat__label">{{ t('birthday.spendLabel') }}</span>
              </div>
            </div>

            <div v-if="wallImages.length" class="birthday-wall" :class="{ 'birthday-wall--fading': wallFading }">
              <div
                v-for="(url, index) in wallImages"
                :key="`${current.id}-${index}`"
                class="birthday-wall-item"
              >
                <LazyCachedImage :src="url" alt="" />
              </div>
            </div>
          </div>
        </Transition>

        <div v-if="birthdays.length > 1" class="birthday-pager" role="tablist">
          <button
            v-for="(entry, index) in birthdays"
            :key="entry.id"
            type="button"
            class="birthday-dot"
            :class="{ 'birthday-dot--active': index === activeIndex }"
            :aria-label="entry.name"
            @click="goTo(index)"
          />
        </div>

        <div class="dialog-actions">
          <button type="button" class="dialog-btn dialog-btn--secondary" @click="handleRefresh">
            {{ t('birthday.refresh') }}
          </button>
          <button type="button" class="dialog-btn dialog-btn--primary" @click="store.dismiss()">
            {{ t('common.known') }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCharacterBirthdayStore } from '@/stores/characterBirthday'
import LazyCachedImage from '@/components/image/LazyCachedImage.vue'

const { t } = useI18n()
const store = useCharacterBirthdayStore()

const activeIndex = ref(0)
const slideDirection = ref('next')
const wallFading = ref(false)
const birthdays = computed(() => store.visibleBirthdays)
const showDialog = computed(() => store.dialogVisible && birthdays.value.length > 0)
const current = computed(() => birthdays.value[Math.min(activeIndex.value, birthdays.value.length - 1)] || birthdays.value[0])

// 手机 3×3 共 9 张；宽屏（与卡片拉宽同断点）4 列 12 张
const wideQuery = window.matchMedia('(min-width: 768px)')
const isWide = ref(wideQuery.matches)
const onWideChange = (event) => { isWide.value = event.matches }
wideQuery.addEventListener('change', onWideChange)
onBeforeUnmount(() => wideQuery.removeEventListener('change', onWideChange))

const wallImages = computed(() => (
  (shuffledWalls.value[current.value?.id] || current.value?.imageUrls || []).slice(0, isWide.value ? 12 : 9)
))

function shuffleUrls(urls) {
  const list = [...urls]
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[list[i], list[j]] = [list[j], list[i]]
  }
  return list
}

// 每次打开弹窗重新洗牌：从收集池（最多 30 张）里随机换一批展示
const shuffledWalls = ref({})
watch(showDialog, (visible) => {
  if (!visible) return
  activeIndex.value = 0
  const map = {}
  for (const entry of birthdays.value) {
    map[entry.id] = shuffleUrls(entry.imageUrls || [])
  }
  shuffledWalls.value = map
})

// color 来自云端表，仅接受 #RGB/#RRGGBB(AA)，防止注入任意 CSS 值
const accentStyle = computed(() => {
  const color = String(current.value?.color || '').trim()
  if (!/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(color)) return {}
  return { '--birthday-accent': color }
})

function goTo(index) {
  if (index === activeIndex.value) return
  slideDirection.value = index > activeIndex.value ? 'next' : 'prev'
  activeIndex.value = index
}

function handleRefresh() {
  if (wallFading.value) return
  wallFading.value = true
  setTimeout(() => {
    const map = {}
    for (const entry of birthdays.value) {
      map[entry.id] = shuffleUrls(entry.imageUrls || [])
    }
    shuffledWalls.value = map
    wallFading.value = false
  }, 180)
}

// pointer 事件同时覆盖触屏滑动与 PC 鼠标拖拽
let pointerStartX = 0
function onPointerDown(event) {
  pointerStartX = event.clientX ?? 0
}
function onPointerUp(event) {
  if (birthdays.value.length < 2) return
  const deltaX = (event.clientX ?? 0) - pointerStartX
  if (Math.abs(deltaX) < 48) return
  const total = birthdays.value.length
  slideDirection.value = deltaX < 0 ? 'next' : 'prev'
  activeIndex.value = (activeIndex.value + (deltaX < 0 ? 1 : total - 1)) % total
}

function formatQuantity(value) {
  const numeric = Number(value || 0)
  if (!Number.isFinite(numeric)) return '0'
  const text = numeric.toFixed(2).replace(/\.00$/, '').replace(/(\.[0-9]*?)0+$/, '$1')
  return text === '-0' ? '0' : text
}

function formatMoney(value) {
  return Number(value || 0).toFixed(2)
}
</script>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-dialog-high);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--app-overlay);
  backdrop-filter: blur(var(--app-frost-soft-blur)) saturate(var(--app-frost-saturate));
  -webkit-backdrop-filter: blur(var(--app-frost-soft-blur)) saturate(var(--app-frost-saturate));
}

.birthday-dialog {
  --birthday-accent: #e2557f;
  /* 拖拽切换轮播时避免框选文字 */
  user-select: none;
  -webkit-user-select: none;
  transition: border-color 0.25s ease;
  position: relative;
  width: min(100%, 420px);
  max-height: 82vh;
  padding: 24px;
  border-radius: var(--radius-large);
  border-top: 4px solid var(--birthday-accent);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
  overflow-y: auto;
  scrollbar-width: none;
}

.birthday-dialog::-webkit-scrollbar {
  display: none;
}

.birthday-ribbon {
  position: absolute;
  top: 16px;
  right: 20px;
  font-size: 28px;
  line-height: 1;
}

.birthday-kicker {
  color: var(--birthday-accent);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.dialog-title {
  margin: 8px 0 0;
  color: var(--app-text);
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.04em;
}

.birthday-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  color: var(--app-text-tertiary);
  font-size: 13px;
}

.birthday-meta__ip {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
  font-weight: 500;
}

.birthday-message {
  margin-top: 12px;
  color: var(--app-text-secondary);
  font-size: 14px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

.birthday-stats {
  display: flex;
  gap: 12px;
  margin-top: 16px;
}

.birthday-stat {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px;
  border-radius: var(--radius-xs);
  background: var(--app-surface-soft);
}

.birthday-stat__value {
  color: var(--app-text);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.birthday-stat__label {
  color: var(--app-text-tertiary);
  font-size: 12px;
}

.birthday-wall {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  margin-top: 16px;
  transition: opacity 0.18s ease;
}

.birthday-wall--fading {
  opacity: 0;
}

.birthday-wall-item {
  aspect-ratio: 1;
  border-radius: var(--radius-xs);
  overflow: hidden;
  background: var(--app-surface-soft);
  /* 避免 PC 上原生图片拖拽劫持轮播手势 */
  pointer-events: none;
  -webkit-user-drag: none;
}

.birthday-wall-item :deep(.lazy-image-root) {
  width: 100%;
  height: 100%;
}

/* 轮播切换：按方向滑入滑出 */
.birthday-slide-next-enter-active,
.birthday-slide-next-leave-active,
.birthday-slide-prev-enter-active,
.birthday-slide-prev-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.birthday-slide-next-enter-from,
.birthday-slide-prev-leave-to {
  opacity: 0;
  transform: translateX(32px);
}

.birthday-slide-next-leave-to,
.birthday-slide-prev-enter-from {
  opacity: 0;
  transform: translateX(-32px);
}

.birthday-pager {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-top: 16px;
}

.birthday-dot {
  width: 8px;
  height: 8px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--app-surface-soft);
  transition: background 0.2s ease, transform 0.2s ease;
}

.birthday-dot--active {
  background: var(--birthday-accent);
  transform: scale(1.25);
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}

.dialog-btn {
  min-height: 42px;
  padding: 0 18px;
  border: none;
  border-radius: var(--radius-xs);
  font-size: 14px;
  font-weight: 500;
}

.dialog-btn--primary {
  background: var(--birthday-accent);
  color: #fff;
}

.dialog-btn--secondary {
  background: var(--app-surface-soft);
  color: var(--app-text);
}

/* 平板/桌面：横向拉宽，加高弹窗上下空间避免按钮被截断 */
@media (min-width: 768px) {
  .birthday-dialog {
    width: min(100%, 580px);
    max-height: 88vh;
    padding: 28px 32px 24px;
  }

  .birthday-wall {
    grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
  }
}
</style>
