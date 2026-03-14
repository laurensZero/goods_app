<template>
  <div class="page wishlist-page" :class="{ 'wishlist-page--restoring': !wishlistDisplayReady }" :style="HOME_MOTION_CSS_VARS">
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

      <HomeGoodsToolbar
        v-if="goodsList.length > 0"
        section-label="我的心愿"
        title="全部目标"
        :total-quantity="totalQuantity"
        :sort-direction="sortDirection"
        :is-sort-animating="isSortAnimating"
        :display-density="displayDensity"
        :density-modes="densityModes"
        :show-timeline-toggle="false"
        @toggle-sort="toggleSortDirection"
        @set-density="setDisplayDensity"
      />

      <section
        v-if="goodsList.length > 0"
        :class="['goods-section', 'goods-view-pane', { 'goods-view-pane--sorting': isSortAnimating }]"
      >
        <div
          :class="[
            'goods-list',
            { 'goods-list--density-animating': isDensityAnimating }
          ]"
          :style="goodsGridStyle"
        >
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
import { useHomePreferences } from '@/composables/useHomePreferences'
import { useWishlistScrollRestore } from '@/composables/useWishlistScrollRestore'
import { addAndroidBackButtonListener } from '@/utils/androidBackButton'
import { scrollToTopAnimated } from '@/utils/scrollToTopAnimated'
import { HOME_MOTION_CSS_VARS } from '@/constants/homeMotion'
import GoodsCard from '@/components/GoodsCard.vue'
import EmptyState from '@/components/EmptyState.vue'
import SummaryCard from '@/components/SummaryCard.vue'
import AddMethodSheet from '@/components/AddMethodSheet.vue'
import HomeSelectionHeader from '@/components/HomeSelectionHeader.vue'
import HomeGoodsToolbar from '@/components/HomeGoodsToolbar.vue'
import ScrollTopButton from '@/components/ScrollTopButton.vue'
import GoodsBatchEditSheet from '@/components/GoodsBatchEditSheet.vue'
import GoodsSelectionActionBar from '@/components/GoodsSelectionActionBar.vue'
import GoodsDeleteConfirm from '@/components/GoodsDeleteConfirm.vue'

defineOptions({ name: 'WishlistView' })

const SCROLL_TOP_BUTTON_THRESHOLD = 900

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
const selectionHeaderStyle = computed(() => ({ '--selection-header-top': '0px' }))
let removeAndroidBackListener = null
let pageScrollBound = false
let pageScrollRaf = 0
let elementScrollHandler = null
let windowScrollHandler = null

const {
  densityModes,
  displayDensity,
  sortDirection,
  isDensityAnimating,
  isSortAnimating,
  getResponsiveCols,
  setDisplayDensity,
  toggleSortDirection,
  restoreHomePreferences
} = useHomePreferences(windowWidth, {
  allowTimeline: false,
  storageKeys: {
    gridDensity: 'goods-app:wishlist-grid-density',
    sortDirection: 'goods-app:wishlist-sort-direction',
    expandedTimelineItem: 'goods-app:wishlist-expanded-item-unused'
  }
})

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
const totalQuantity = computed(() => (
  baseGoodsList.value.reduce((sum, item) => sum + item.quantityNumber, 0)
))
const totalValue = computed(() => (
  baseGoodsList.value.reduce((sum, item) => sum + item.totalValueNumber, 0).toFixed(2)
))

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

function batchDelete() {
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
  restoreHomePreferences()
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
.goods-header-section,
.goods-section,
.empty-wrap {
  padding: 0 var(--page-padding);
}

.summary-section,
.goods-header-section,
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

.hero-label {
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
  transition: transform 0.16s ease, background 0.16s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.hero-search svg,
.fab svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.hero-search:active {
  transform: scale(0.96);
}

.goods-list {
  display: grid;
  gap: var(--card-gap);
  align-items: start;
}

.goods-view-pane {
  transform-origin: top center;
}

.goods-view-pane--sorting {
  animation: sort-view-refresh var(--home-motion-sort-view-duration) var(--home-motion-ease-standard);
  will-change: opacity, transform, filter;
}

.goods-list--density-animating {
  animation: density-grid-pulse var(--home-motion-density-duration) var(--home-motion-ease-standard);
  transform-origin: top center;
  will-change: opacity, transform;
}

.goods-list--density-animating :deep(.goods-card) {
  animation: density-card-settle var(--home-motion-density-duration) var(--home-motion-ease-standard);
  will-change: opacity, transform;
}

@keyframes density-grid-pulse {
  0% {
    opacity: 0.78;
    transform: scale(0.987);
  }

  100% {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes density-card-settle {
  0% {
    opacity: 0.76;
    transform: translateY(6px) scale(0.982);
  }

  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes sort-view-refresh {
  0% {
    opacity: 0.84;
    filter: blur(1.5px) saturate(0.96);
    transform: translateY(4px);
  }

  100% {
    opacity: 1;
    filter: blur(0) saturate(1);
    transform: translateY(0);
  }
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
  background: var(--app-text);
  color: var(--app-surface);
  box-shadow: var(--app-shadow);
  transition: transform 0.16s ease, box-shadow 0.16s ease;
  z-index: 65;
}

.fab svg {
  width: 22px;
  height: 22px;
  stroke-width: 2.2;
}

.fab:active {
  transform: scale(0.96);
}

@media (prefers-color-scheme: dark) {
  .hero-search {
    background: var(--app-glass);
  }

  .fab {
    background: var(--app-text);
    color: var(--app-surface);
  }
}
</style>
