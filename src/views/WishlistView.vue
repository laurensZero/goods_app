<template>
  <div class="page wishlist-page" :class="{ 'wishlist-page--restoring': !wishlistDisplayReady }">
    <main ref="pageBodyRef" class="page-body">
      <section v-if="!selectionMode" class="hero-section">
        <div class="hero-copy">
          <p class="hero-label">Wish Archive</p>
          <h1 class="hero-title">心愿单</h1>
        </div>

        <button class="hero-search" type="button" aria-label="搜索心愿单" @click="openSearch">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20L16.65 16.65" />
          </svg>
        </button>
      </section>

      <HomeSelectionHeader
        :show="selectionMode"
        :selected-count="selectedIds.size"
        :all-selected="allSelected"
        :header-style="selectionHeaderStyle"
        @back="exitSelectionMode"
        @toggle-all="toggleSelectAll"
      />

      <section class="summary-section">
        <SummaryCard
          label="Wishlist Budget"
          storage-key="goods-app:wishlist-total-value-hidden"
          :total-value="totalValue"
          :total-count="baseGoodsList.length"
        />
      </section>

      <section v-if="goodsList.length > 0" class="toolbar-section">
        <div class="toolbar-header">
          <div class="toolbar-copy">
            <p class="toolbar-label">我的心愿</p>
            <h2 class="toolbar-title">全部目标<span class="toolbar-count"> {{ totalQuantity }} 件</span></h2>
          </div>

          <div class="density-switch" aria-label="切换展示密度">
            <button
              v-for="mode in densityModes"
              :key="mode.value"
              type="button"
              :class="['density-switch__option', { 'density-switch__option--active': displayDensity === mode.value }]"
              @click="setDisplayDensity(mode.value)"
            >
              {{ mode.label }}
            </button>
          </div>

          <div class="toolbar-btns">
            <button
              type="button"
              :class="['sort-toggle', { 'sort-toggle--asc': sortDirection === 'asc' }]"
              :aria-label="sortDirection === 'desc' ? '当前按时间降序，点击切换升序' : '当前按时间升序，点击切换降序'"
              @click="toggleSortDirection"
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M7 6V18" />
                <path d="M4 9L7 6L10 9" />
                <path d="M17 18V6" />
                <path d="M14 15L17 18L20 15" />
              </svg>
            </button>
          </div>
        </div>
      </section>

      <section v-if="goodsList.length > 0" class="goods-section">
        <div class="goods-list" :style="goodsGridStyle">
          <GoodsCard
            v-for="(item, index) in goodsList"
            :key="item.id"
            :item="item"
            :density="displayDensity"
            :data-goods-id="item.id"
            :data-scroll-anchor="'goods-card'"
            :data-scroll-index="index"
            :selected="selectedIds.has(item.id)"
            :selection-mode="selectionMode"
            @long-press="enterSelectionMode(item.id)"
            @toggle-select="toggleSelect(item.id)"
            @open-detail="openDetail(item.id)"
          />
        </div>
      </section>

      <section v-else class="empty-wrap">
        <EmptyState
          icon="♡"
          title="还没有心愿记录"
          description="看到想收的谷子时先放进这里，之后再决定什么时候入手。"
          action-text="添加心愿"
          @action="openAddSheet"
        />
      </section>
    </main>

    <Teleport v-if="isWishlistActive" to="body">
      <ScrollTopButton :show="showScrollTopButton && !selectionMode" @click="scrollToTop" />

      <button v-if="!selectionMode" class="fab" type="button" aria-label="添加心愿" @click="goToAdd">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 5V19" />
          <path d="M5 12H19" />
        </svg>
      </button>
    </Teleport>

    <AddMethodSheet
      v-model="showAddSheet"
      :show-taobao-import="false"
      @manual="goToManualAdd"
      @import="goToImport"
    />

    <GoodsDeleteConfirm v-model:show="showDeleteConfirm" :selected-count="selectedIds.size" @confirm="confirmDelete" />

    <GoodsBatchEditSheet
      ref="batchEditSheetRef"
      v-model:show="showBatchEditSheet"
      :selected-count="selectedIds.size"
      allow-mark-owned
      @apply="applyBatchEditPayload"
    />

    <GoodsSelectionActionBar
      :show="selectionMode && !showBatchEditSheet"
      :selected-count="selectedIds.size"
      @delete="batchDelete"
      @edit="batchEdit"
    />
  </div>
</template>

<script setup>
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { useGoodsStore } from '@/stores/goods'
import { useGoodsSelection } from '@/composables/useGoodsSelection'
import { useWishlistScrollRestore } from '@/composables/useWishlistScrollRestore'
import { addAndroidBackButtonListener } from '@/utils/androidBackButton'
import { scrollToTopAnimated } from '@/utils/scrollToTopAnimated'
import GoodsCard from '@/components/GoodsCard.vue'
import EmptyState from '@/components/EmptyState.vue'
import SummaryCard from '@/components/SummaryCard.vue'
import AddMethodSheet from '@/components/AddMethodSheet.vue'
import HomeSelectionHeader from '@/components/HomeSelectionHeader.vue'
import ScrollTopButton from '@/components/ScrollTopButton.vue'
import GoodsBatchEditSheet from '@/components/GoodsBatchEditSheet.vue'
import GoodsSelectionActionBar from '@/components/GoodsSelectionActionBar.vue'
import GoodsDeleteConfirm from '@/components/GoodsDeleteConfirm.vue'

defineOptions({ name: 'WishlistView' })

const DENSITY_STORAGE_KEY = 'goods-app:wishlist-grid-density'
const SORT_STORAGE_KEY = 'goods-app:wishlist-sort-direction'
const SCROLL_TOP_BUTTON_THRESHOLD = 900

const densityModes = [
  { value: 'comfortable', label: '舒展' },
  { value: 'standard', label: '标准' },
  { value: 'compact', label: '紧凑' }
]

const densityBreakpoints = {
  comfortable: [
    { minWidth: 1200, cols: 5 },
    { minWidth: 900, cols: 4 },
    { minWidth: 600, cols: 3 },
    { minWidth: 0, cols: 2 }
  ],
  standard: [
    { minWidth: 1200, cols: 6 },
    { minWidth: 900, cols: 5 },
    { minWidth: 600, cols: 4 },
    { minWidth: 0, cols: 3 }
  ],
  compact: [
    { minWidth: 1200, cols: 8 },
    { minWidth: 900, cols: 6 },
    { minWidth: 600, cols: 5 },
    { minWidth: 0, cols: 4 }
  ]
}

const router = useRouter()
const store = useGoodsStore()
const pageBodyRef = ref(null)
const windowWidth = ref(window.innerWidth)
const showAddSheet = ref(false)
const showDeleteConfirm = ref(false)
const showBatchEditSheet = ref(false)
const batchEditSheetRef = ref(null)
const isWishlistActive = ref(true)
const wishlistDisplayReady = ref(true)
const showScrollTopButton = ref(false)
const displayDensity = ref(localStorage.getItem(DENSITY_STORAGE_KEY) || 'comfortable')
const sortDirection = ref(localStorage.getItem(SORT_STORAGE_KEY) || 'desc')
const selectionHeaderStyle = computed(() => ({ '--selection-header-top': '0px' }))
let removeAndroidBackListener = null
let pageScrollBound = false
let pageScrollRaf = 0
let elementScrollHandler = null
let windowScrollHandler = null

const {
  getScrollEl,
  getActiveScrollSource,
  markScrollSource,
  readScrollTop,
  getStoredScrollState,
  saveScrollPosition,
  applyScrollPosition,
  restorePendingScrollPosition,
  restoreActivatedScrollPosition,
  rememberCurrentScrollPosition,
  clearDisplayedScrollPosition,
  resetStoredScrollOnReload
} = useWishlistScrollRestore(pageBodyRef)

const baseGoodsList = computed(() => store.wishlistViewList)
const totalQuantity = computed(() =>
  baseGoodsList.value.reduce((sum, item) => sum + item.quantityNumber, 0)
)
const totalValue = computed(() =>
  baseGoodsList.value.reduce((sum, item) => sum + item.totalValueNumber, 0).toFixed(2)
)

const goodsList = computed(() => {
  const items = [...baseGoodsList.value]

  items.sort((a, b) => {
    if (a.acquiredTime !== b.acquiredTime) {
      return sortDirection.value === 'asc'
        ? a.acquiredTime - b.acquiredTime
        : b.acquiredTime - a.acquiredTime
    }

    return sortDirection.value === 'asc'
      ? a.sortId.localeCompare(b.sortId)
      : b.sortId.localeCompare(a.sortId)
  })

  return items
})

const goodsGridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${getResponsiveCols(displayDensity.value)}, minmax(0, 1fr))`
}))

function closeSelectionOverlays() {
  showDeleteConfirm.value = false
  batchEditSheetRef.value?.close()
  showAddSheet.value = false
}

const {
  selectionMode,
  selectedIds,
  allSelected,
  enterSelectionMode,
  toggleSelect,
  toggleSelectAll,
  exitSelectionModeQuiet,
  exitSelectionMode,
  handleSelectionPopState
} = useGoodsSelection(goodsList, {
  historyKey: 'wishlistSelectionMode',
  onExit: closeSelectionOverlays,
  getScrollTop: readScrollTop,
  restoreScrollTop: applyScrollPosition
})

function syncVisibleGoodsCount() {}
function syncVisibleTimelineMonthCount() {}

function getResponsiveCols(density) {
  const breakpoints = densityBreakpoints[density] || densityBreakpoints.comfortable
  return (breakpoints.find((item) => windowWidth.value >= item.minWidth) ?? breakpoints[breakpoints.length - 1]).cols
}

function setDisplayDensity(mode) {
  if (!densityModes.some((item) => item.value === mode)) return
  displayDensity.value = mode
  localStorage.setItem(DENSITY_STORAGE_KEY, mode)
}

function toggleSortDirection() {
  sortDirection.value = sortDirection.value === 'desc' ? 'asc' : 'desc'
  localStorage.setItem(SORT_STORAGE_KEY, sortDirection.value)
}

function updateScrollTopButtonVisibility() {
  showScrollTopButton.value = readScrollTop() >= SCROLL_TOP_BUTTON_THRESHOLD
}

function handlePageScroll() {
  if (pageScrollRaf) return
  pageScrollRaf = window.requestAnimationFrame(() => {
    pageScrollRaf = 0
    rememberCurrentScrollPosition()
    updateScrollTopButtonVisibility()
  })
}

function bindPageScroll() {
  if (pageScrollBound) return
  // Guardrail:
  // Wishlist must track both element and window scroll events.
  // This page has regressed repeatedly when the source was hardcoded.
  elementScrollHandler = () => {
    markScrollSource('element')
    handlePageScroll()
  }
  windowScrollHandler = () => {
    markScrollSource('window')
    handlePageScroll()
  }
  getScrollEl()?.addEventListener('scroll', elementScrollHandler, { passive: true })
  window.addEventListener('scroll', windowScrollHandler, { passive: true })
  pageScrollBound = true
}

function unbindPageScroll() {
  if (!pageScrollBound) return
  if (elementScrollHandler) {
    getScrollEl()?.removeEventListener('scroll', elementScrollHandler)
    elementScrollHandler = null
  }
  if (windowScrollHandler) {
    window.removeEventListener('scroll', windowScrollHandler)
    windowScrollHandler = null
  }
  pageScrollBound = false
}

function scrollToTop() {
  scrollToTopAnimated(getScrollEl, 260, () => {
    updateScrollTopButtonVisibility()
    rememberCurrentScrollPosition()
  // Use the current tracked source. Do not hardcode "window" or "element" here.
  }, getActiveScrollSource())
}

function openDetail(id) {
  saveScrollPosition(true, `wishlist:openDetail:${id}`)
  router.push(`/detail/${id}`)
}

function openSearch() {
  saveScrollPosition(true, 'wishlist:openSearch')
  router.push('/search?scope=wishlist')
}

function openAddSheet() {
  showAddSheet.value = true
}

function goToAdd() {
  openAddSheet()
}

function goToManualAdd() {
  showAddSheet.value = false
  saveScrollPosition(true, 'wishlist:goToManualAdd')
  router.push('/add?mode=wishlist')
}

function goToImport() {
  showAddSheet.value = false
  saveScrollPosition(true, 'wishlist:goToImport')
  router.push('/import?mode=wishlist')
}

function handleResize() {
  windowWidth.value = window.innerWidth
}

function shouldMaskWishlistDisplay() {
  const storedTop = getStoredScrollState()?.top || 0
  if (storedTop <= 0) return false
  return Math.abs(readScrollTop() - storedTop) > 1
}

function handleAndroidBackButton(event) {
  if (batchEditSheetRef.value?.consumeBack()) {
    event.preventDefault()
    return
  }

  if (showDeleteConfirm.value) {
    showDeleteConfirm.value = false
    event.preventDefault()
    return
  }

  if (selectionMode.value) {
    exitSelectionMode()
    event.preventDefault()
  }
}

function bindAndroidBackButton() {
  if (removeAndroidBackListener) return
  removeAndroidBackListener = addAndroidBackButtonListener(handleAndroidBackButton)
}

function unbindAndroidBackButton() {
  if (!removeAndroidBackListener) return
  removeAndroidBackListener()
  removeAndroidBackListener = null
}

async function batchDelete() {
  if (selectedIds.value.size === 0) return
  showDeleteConfirm.value = true
}

async function confirmDelete() {
  showDeleteConfirm.value = false
  await store.removeMultipleGoods(selectedIds.value)
  exitSelectionModeQuiet()
}

function batchEdit() {
  if (selectedIds.value.size === 0) return
  showBatchEditSheet.value = true
}

async function applyBatchEditPayload(payload) {
  await store.updateMultipleGoods(selectedIds.value, payload)
  exitSelectionModeQuiet()
}

onMounted(async () => {
  const didResetOnReload = resetStoredScrollOnReload()
  if (didResetOnReload) {
    clearDisplayedScrollPosition()
  }
  const shouldMaskDisplay = shouldMaskWishlistDisplay()
  wishlistDisplayReady.value = !shouldMaskDisplay
  window.addEventListener('resize', handleResize, { passive: true })
  await nextTick()
  bindPageScroll()
  await restorePendingScrollPosition(syncVisibleGoodsCount, syncVisibleTimelineMonthCount)
  await nextTick()
  wishlistDisplayReady.value = true
  updateScrollTopButtonVisibility()
  window.addEventListener('popstate', handleSelectionPopState)
  bindAndroidBackButton()
})

onActivated(async () => {
  isWishlistActive.value = true
  const shouldMaskDisplay = shouldMaskWishlistDisplay()
  if (shouldMaskDisplay) {
    wishlistDisplayReady.value = false
  }
  await restoreActivatedScrollPosition(syncVisibleGoodsCount, syncVisibleTimelineMonthCount)
  await nextTick()
  wishlistDisplayReady.value = true
  bindPageScroll()
  updateScrollTopButtonVisibility()
  bindAndroidBackButton()
})

onDeactivated(() => {
  isWishlistActive.value = false
  if (readScrollTop() > 1) {
    wishlistDisplayReady.value = false
  }
  exitSelectionModeQuiet()
  unbindPageScroll()
  unbindAndroidBackButton()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  if (pageScrollRaf) {
    window.cancelAnimationFrame(pageScrollRaf)
    pageScrollRaf = 0
  }
  unbindPageScroll()
  window.removeEventListener('popstate', handleSelectionPopState)
  unbindAndroidBackButton()
  rememberCurrentScrollPosition()
  exitSelectionModeQuiet()
})

onBeforeRouteLeave(() => {
  saveScrollPosition(true, 'wishlist:onBeforeRouteLeave')
})
</script>

<style scoped>
.wishlist-page {
  position: relative;
}

.wishlist-page--restoring {
  visibility: hidden;
}

.page-body {
  padding-top: calc(env(safe-area-inset-top) + 20px);
}

.hero-section,
.summary-section,
.toolbar-section,
.goods-section,
.empty-wrap {
  padding: 0 var(--page-padding);
}

.summary-section,
.toolbar-section,
.goods-section,
.empty-wrap {
  margin-top: var(--section-gap);
}

.hero-section {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.hero-copy {
  max-width: 320px;
}

.hero-label,
.toolbar-label {
  color: var(--app-text-tertiary);
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.hero-title {
  margin-top: 4px;
  color: var(--app-text);
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.04em;
}

.hero-search {
  width: var(--icon-button-size);
  height: var(--icon-button-size);
  margin-top: 6px;
  border: none;
  border-radius: 50%;
  background: var(--app-glass);
  box-shadow: var(--app-shadow);
  color: var(--app-text);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.hero-search svg,
.sort-toggle svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.fab svg {
  width: 22px;
  height: 22px;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.toolbar-header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 10px;
  margin-bottom: 14px;
}

.toolbar-copy {
  flex: 1;
  min-width: 0;
  order: 0;
}

.toolbar-btns {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  order: 1;
  margin-left: auto;
}

.toolbar-title {
  margin-top: 4px;
  color: var(--app-text);
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.03em;
}

.toolbar-count {
  font-size: 16px;
  font-weight: 400;
  color: var(--app-text-tertiary);
  margin-left: 4px;
}

.sort-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border: none;
  border-radius: 18px;
  background: var(--app-glass);
  color: var(--app-text-secondary);
  box-shadow: var(--app-shadow);
  flex-shrink: 0;
}

.sort-toggle--asc {
  background: #141416;
  color: #ffffff;
}

.sort-toggle--asc svg {
  transform: rotate(180deg);
}

.density-switch {
  flex-basis: 100%;
  order: 2;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  padding: 6px;
  border-radius: 18px;
  background: var(--app-glass);
  box-shadow: var(--app-shadow);
}

.density-switch__option {
  min-width: 0;
  height: 36px;
  padding: 0 12px;
  border: none;
  border-radius: 14px;
  background: transparent;
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 600;
}

.density-switch__option--active {
  background: #141416;
  color: #ffffff;
}

.density-switch__option:active,
.sort-toggle:active,
.fab:active {
  transform: scale(0.96);
}

.goods-list {
  display: grid;
  gap: var(--card-gap);
}

.fab {
  position: fixed;
  right: 16px;
  bottom: calc(var(--tabbar-height) + env(safe-area-inset-bottom));
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--fab-size);
  height: var(--fab-size);
  border: none;
  border-radius: 50%;
  background: #c7375d;
  color: #ffffff;
  box-shadow: var(--app-shadow);
  z-index: 65;
}

@media (min-width: 600px) {
  .density-switch {
    flex-basis: auto;
    display: inline-grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    order: 2;
  }

  .toolbar-btns {
    order: 3;
  }
}

@media (prefers-color-scheme: dark) {
  .sort-toggle--asc,
  .density-switch__option--active {
    background: #f5f5f7;
    color: #141416;
  }
}
</style>
