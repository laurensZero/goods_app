<template>
  <div
    class="page goods-picker-page"
    :class="{ 'goods-picker-page--restoring': !pickerDisplayReady }"
  >
    <main class="page-body">
      <section class="hero-section">
        <div class="hero-copy">
          <div class="hero-topline">
            <button class="hero-back" type="button" aria-label="返回" @click="handleBack">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M15 18L9 12L15 6" />
              </svg>
            </button>

            <div>
              <p class="hero-label">LINK GOODS</p>
              <h1 class="hero-title">选择关联谷子</h1>
            </div>
          </div>
        </div>
      </section>

      <section class="search-section">
        <input
          v-model.trim="keyword"
          class="picker-search"
          type="text"
          placeholder="搜索名称、分类、IP"
        />
      </section>

      <section class="toolbar-section">
        <div class="toolbar-copy">
          <p class="toolbar-label">可选收藏</p>
          <h2 class="toolbar-title">全部谷子 <span>{{ filteredGoodsList.length }} 件</span></h2>
        </div>

        <div class="toolbar-actions">
          <button class="toolbar-btn" type="button" :aria-label="sortButtonLabel" @click="toggleSortDirection">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M8 7v10" />
              <path d="M5 14l3 3 3-3" />
              <path d="M16 17V7" />
              <path d="M13 10l3-3 3 3" />
            </svg>
          </button>

          <button class="toolbar-sort-chip" type="button" @click="showSortSheet = true">
            {{ currentSortOption.label }}
          </button>
        </div>
      </section>

      <section class="summary-strip">
        <span class="summary-strip__selected">已选择 {{ selectedIds.size }} 项</span>
        <span class="summary-strip__total">共 {{ filteredGoodsList.length }} 项可选</span>
      </section>

      <GoodsCardGridSection
        v-if="filteredGoodsList.length > 0"
        :items="filteredGoodsList"
        :density="displayDensity"
        :grid-style="goodsGridStyle"
        :selection-mode="true"
        :selected-ids="selectedIds"
        @toggle-select="toggleSelect"
        @open-detail="toggleSelect"
      />

      <section v-else class="empty-wrap">
        <EmptyState
          icon="🔎"
          title="没有匹配的谷子"
          description="换个关键词试试，或者直接返回继续编辑活动。"
        />
      </section>
    </main>

    <Teleport to="body">
      <div class="picker-actions">
        <button class="picker-action picker-action--ghost" type="button" @click="handleBack">取消</button>
        <button class="picker-action picker-action--primary" type="button" @click="confirmSelection">
          完成{{ selectedIds.size > 0 ? ` (${selectedIds.size})` : '' }}
        </button>
      </div>
    </Teleport>

    <Popup
      v-model:show="showSortSheet"
      teleport="body"
      :position="popupPosition"
      :round="!isTablet"
      overlay-class="sort-sheet-overlay"
      :class="['sort-sheet', { 'sort-sheet--tablet': isTablet }]"
    >
      <div class="sort-sheet__panel">
        <div v-if="!isTablet" class="sort-sheet__handle" />
        <div class="sort-sheet__head">
          <div>
            <p class="sort-sheet__label">排序方式</p>
            <h3 class="sort-sheet__title">{{ currentSortOption.label }}</h3>
          </div>
          <button class="sort-sheet__dir-btn" type="button" @click="toggleSortDirection">
            {{ sortDirection === 'asc' ? currentSortOption.ascLabel : currentSortOption.descLabel }}
          </button>
        </div>

        <div class="sort-sheet__options">
          <button
            v-for="option in SORT_OPTIONS"
            :key="option.value"
            type="button"
            :class="['sort-sheet__option', { 'sort-sheet__option--active': sortMode === option.value }]"
            @click="setSortMode(option.value)"
          >
            <span class="sort-sheet__option-name">{{ option.label }}</span>
            <span class="sort-sheet__option-meta">
              {{ sortDirection === 'asc' ? option.ascLabel : option.descLabel }}
            </span>
          </button>
        </div>
      </div>
    </Popup>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Popup } from 'vant'
import EmptyState from '@/components/common/EmptyState.vue'
import GoodsCardGridSection from '@/components/goods/GoodsCardGridSection.vue'
import { useGoodsSelection } from '@/composables/goods/useGoodsSelection'
import { useGoodsStore } from '@/stores/goods'
import { sortHomeGoodsList } from '@/utils/homeSort'
import { writeEventLinkedGoodsPickerResult } from '@/utils/eventLinkedGoodsPicker'
import { runWithViewTransition } from '@/utils/viewTransition'

defineOptions({ name: 'EventGoodsPickerView' })

const SORT_STORAGE_KEY = 'goods-app:event-picker-sort-mode'
const SORT_DIRECTION_STORAGE_KEY = 'goods-app:event-picker-sort-direction'
const TABLET_BREAKPOINT = 900
const GRID_BREAKPOINTS = [
  { minWidth: 900, cols: 6 },
  { minWidth: 0, cols: 3 }
]
const SORT_OPTIONS = [
  { value: 'createdAt', label: '添加时间', descLabel: '最近添加', ascLabel: '最早添加' },
  { value: 'acquiredAt', label: '购入时间', descLabel: '最近购入', ascLabel: '最早购入' },
  { value: 'name', label: '名称', descLabel: '名称 Z-A', ascLabel: '名称 A-Z' }
]

const router = useRouter()
const route = useRoute()
const goodsStore = useGoodsStore()
const keyword = ref('')
const pickerDisplayReady = ref(false)
const showSortSheet = ref(false)
const sortMode = ref(readStoredSortMode())
const sortDirection = ref(readStoredSortDirection())
const displayDensity = ref('standard')
const windowWidth = ref(typeof window === 'undefined' ? 390 : window.innerWidth)

const isTablet = computed(() => windowWidth.value >= TABLET_BREAKPOINT)
const popupPosition = computed(() => (isTablet.value ? 'center' : 'bottom'))
const currentSortOption = computed(() => (
  SORT_OPTIONS.find((option) => option.value === sortMode.value) || SORT_OPTIONS[0]
))
const sortButtonLabel = computed(() => (
  `当前按${currentSortOption.value.label}${sortDirection.value === 'asc' ? '升序' : '降序'}排序`
))

const baseGoodsList = computed(() => goodsStore.collectionViewList || goodsStore.collectionList || [])
const sortedGoodsList = computed(() => sortHomeGoodsList(baseGoodsList.value, sortMode.value, sortDirection.value))
const filteredGoodsList = computed(() => {
  const query = keyword.value.trim().toLowerCase()
  if (!query) return sortedGoodsList.value

  return sortedGoodsList.value.filter((item) => {
    const name = String(item.name || '').toLowerCase()
    const category = String(item.category || '').toLowerCase()
    const ip = String(item.ip || '').toLowerCase()
    return name.includes(query) || category.includes(query) || ip.includes(query)
  })
})

const goodsGridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${getResponsiveCols()}, minmax(0, 1fr))`
}))

const {
  selectedIds,
  toggleSelect
} = useGoodsSelection(filteredGoodsList, {
  historyKey: 'eventGoodsPickerSelectionMode'
})

function readStoredSortMode() {
  const value = localStorage.getItem(SORT_STORAGE_KEY)
  return SORT_OPTIONS.some((option) => option.value === value) ? value : 'createdAt'
}

function readStoredSortDirection() {
  const value = localStorage.getItem(SORT_DIRECTION_STORAGE_KEY)
  return value === 'asc' ? 'asc' : 'desc'
}

function syncWindowWidth() {
  windowWidth.value = window.innerWidth
}

function parseInitialSelectedIds() {
  const raw = String(route.query.selected || '')
  return raw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
}

function getResponsiveCols() {
  return (GRID_BREAKPOINTS.find((item) => windowWidth.value >= item.minWidth) ?? GRID_BREAKPOINTS[GRID_BREAKPOINTS.length - 1]).cols
}

function toggleSortDirection() {
  sortDirection.value = sortDirection.value === 'desc' ? 'asc' : 'desc'
}

function setSortMode(value) {
  sortMode.value = value
  showSortSheet.value = false
}

function handleBack() {
  runWithViewTransition(() => {
    const returnTo = String(route.query.returnTo || '').trim()
    if (returnTo && window.history.length <= 1) {
      router.replace(returnTo)
      return
    }
    router.back()
  }, { direction: 'back' })
}

function confirmSelection() {
  writeEventLinkedGoodsPickerResult([...selectedIds.value])
  runWithViewTransition(() => {
    const returnTo = String(route.query.returnTo || '').trim()
    if (returnTo && window.history.length <= 1) {
      router.replace(returnTo)
      return
    }
    router.back()
  }, { direction: 'back' })
}

onMounted(async () => {
  window.addEventListener('resize', syncWindowWidth, { passive: true })

  if (!goodsStore.isReady) {
    await goodsStore.init()
  } else {
    await goodsStore.refreshList()
  }

  selectedIds.value = new Set(parseInitialSelectedIds())
  document.body.classList.add('selection-active')
  await nextTick()
  pickerDisplayReady.value = true
})

onBeforeUnmount(() => {
  localStorage.setItem(SORT_STORAGE_KEY, sortMode.value)
  localStorage.setItem(SORT_DIRECTION_STORAGE_KEY, sortDirection.value)
  window.removeEventListener('resize', syncWindowWidth)
  document.body.classList.remove('selection-active')
})
</script>

<style scoped>
.goods-picker-page {
  min-height: 100dvh;
  background: var(--app-bg-gradient);
}

.goods-picker-page--restoring {
  visibility: hidden;
}

.page-body {
  width: min(100%, 1680px);
  margin: 0 auto;
  padding: calc(env(safe-area-inset-top) + 14px) var(--page-padding) 120px;
}

.hero-section,
.search-section,
.toolbar-section,
.summary-strip,
.goods-section,
.empty-wrap {
  margin-top: 12px;
}

.hero-section {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-top: 0;
}

.hero-topline {
  display: flex;
  align-items: center;
  gap: 12px;
}

.hero-back,
.toolbar-btn,
.toolbar-sort-chip,
.picker-action,
.sort-sheet__dir-btn,
.sort-sheet__option {
  border: none;
}

.hero-back,
.toolbar-btn,
.toolbar-sort-chip {
  background: var(--app-glass);
  box-shadow: var(--app-shadow);
  color: var(--app-text);
}

.hero-back,
.toolbar-btn {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.hero-back svg,
.toolbar-btn svg {
  width: 20px;
  height: 20px;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.hero-label,
.toolbar-label,
.sort-sheet__label {
  color: var(--app-text-tertiary);
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.hero-title,
.toolbar-title {
  color: var(--app-text);
  letter-spacing: -0.04em;
}

.hero-title {
  margin-top: 4px;
  font-size: 24px;
  font-weight: 700;
}

.toolbar-sort-chip {
  min-width: 92px;
  height: 42px;
  padding: 0 16px;
  border-radius: 16px;
  font-size: 13px;
  font-weight: 700;
}

.picker-search {
  width: 100%;
  height: 54px;
  padding: 0 18px;
  border: 1px solid color-mix(in srgb, var(--app-border) 88%, transparent);
  border-radius: 18px;
  background: var(--app-surface);
  color: var(--app-text);
  font-size: 16px;
  box-shadow: var(--app-shadow);
}

.toolbar-section {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
}

.toolbar-title {
  margin-top: 4px;
  font-size: 22px;
  font-weight: 700;
}

.toolbar-title span {
  color: var(--app-text-tertiary);
  font-size: 15px;
  font-weight: 400;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.summary-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 8px;
  color: var(--app-text-secondary);
  font-size: 14px;
}

.summary-strip__selected {
  color: var(--app-text);
  font-weight: 700;
}

.empty-wrap {
  padding-top: 56px;
}

.picker-actions {
  position: fixed;
  left: 50%;
  bottom: max(12px, env(safe-area-inset-bottom));
  display: grid;
  grid-template-columns: 1fr 1.35fr;
  gap: 10px;
  width: min(calc(100vw - 24px), 460px);
  transform: translateX(-50%);
  padding: 10px;
  border: 1px solid var(--app-glass-border);
  border-radius: 24px;
  background: var(--app-glass-strong);
  backdrop-filter: blur(24px) saturate(145%);
  -webkit-backdrop-filter: blur(24px) saturate(145%);
  box-shadow: 0 14px 34px rgba(20, 20, 22, 0.12);
  z-index: 80;
}

.picker-action {
  height: 52px;
  border-radius: 16px;
  font-size: 15px;
  font-weight: 700;
}

.picker-action--ghost {
  background: color-mix(in srgb, var(--app-glass) 76%, var(--app-surface));
  color: var(--app-text-secondary);
}

.picker-action--primary {
  background: #141416;
  color: #fff;
}

.sort-sheet {
  background: transparent;
}

:global(.sort-sheet-overlay) {
  background: rgba(20, 20, 22, 0.18);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.sort-sheet__panel {
  background: var(--app-surface);
}

.sort-sheet--tablet {
  width: min(520px, calc(100vw - 48px));
}

.sort-sheet--tablet .sort-sheet__panel {
  border-radius: 28px;
  overflow: hidden;
}

.sort-sheet__handle {
  width: 40px;
  height: 4px;
  border-radius: 999px;
  background: rgba(20, 20, 22, 0.12);
  margin: 10px auto 4px;
}

.sort-sheet__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 18px 12px;
}

.sort-sheet__title {
  margin-top: 4px;
  color: var(--app-text);
  font-size: 22px;
  font-weight: 700;
}

.sort-sheet__dir-btn {
  min-width: 88px;
  height: 38px;
  padding: 0 14px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-surface-soft) 84%, white);
  color: var(--app-text);
  font-size: 13px;
  font-weight: 700;
}

.sort-sheet__options {
  display: flex;
  flex-direction: column;
  padding: 8px 12px 14px;
}

.sort-sheet__option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  min-height: 56px;
  padding: 0 14px;
  border-radius: 18px;
  background: transparent;
  color: var(--app-text);
  text-align: left;
}

.sort-sheet__option--active {
  background: color-mix(in srgb, var(--app-surface-soft) 84%, white);
}

.sort-sheet__option-name {
  font-size: 15px;
  font-weight: 700;
}

.sort-sheet__option-meta {
  color: var(--app-text-tertiary);
  font-size: 13px;
}

@media (max-width: 899px) {
  .page-body {
    width: min(100%, 1100px);
  }
}

@media (max-width: 720px) {
  .page-body {
    padding-bottom: 128px;
  }

  .hero-section,
  .toolbar-section,
  .summary-strip {
    flex-direction: column;
    align-items: stretch;
  }

  .toolbar-actions,
  .summary-strip {
    justify-content: space-between;
  }

  .hero-title {
    font-size: 22px;
  }

  .toolbar-title {
    font-size: 20px;
  }

  .picker-search {
    height: 50px;
    font-size: 15px;
  }
}
</style>
