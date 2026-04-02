<template>
  <div
    class="page wishlist-page"
    :class="{ 'wishlist-page--restoring': !wishlistDisplayReady, 'wishlist-page--top-jump': topJumpMasking }"
    :style="HOME_MOTION_CSS_VARS"
  >
    <main ref="pageBodyRef" class="page-body">
      <section v-if="!selectionMode" class="hero-section">
        <div class="hero-copy">
          <p class="hero-label">Wish Archive</p>
          <h1 class="hero-title">心愿单</h1>
        </div>

        <div class="hero-actions">
          <button class="hero-search" type="button" aria-label="搜索心愿单" @click="openSearch">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20L16.65 16.65" />
            </svg>
          </button>

          <HomeViewModeSwitch
            model-value="wishlist"
            :options="HOME_TOP_OPTIONS"
            @update:model-value="switchTopTab"
          />
        </div>
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
        :sort-mode="sortMode"
        :sort-options="HOME_SORT_OPTIONS"
        :is-sort-animating="isSortAnimating"
        :display-density="displayDensity"
        :density-modes="densityModes"
        :show-timeline-toggle="false"
        @toggle-sort="toggleSortDirection"
        @set-sort-mode="setSortMode"
        @set-density="setDisplayDensityWithFlip"
      />

      <GoodsCardGridSection
        v-if="goodsList.length > 0"
        ref="goodsGridSectionRef"
        :items="goodsList"
        :density="displayDensity"
        :grid-style="goodsGridStyle"
        :transitioning="isDensityAnimating"
        :is-sort-animating="isSortAnimating"
        :selection-mode="selectionMode"
        :selected-ids="selectedIds"
        @long-press="enterSelectionMode"
        @toggle-select="toggleSelect"
        @open-detail="openDetail"
      />

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
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { useGoodsStore } from '@/stores/goods'
import { useGoodsSelection } from '@/composables/goods/useGoodsSelection'
import { useHomePreferences } from '@/composables/home/useHomePreferences'
import { useWishlistScrollRestore } from '@/composables/scroll/useWishlistScrollRestore'
import { useDensityGridViewport } from '@/composables/home/useDensityGridViewport'
import { useGoodsGridDensityFlip } from '@/composables/home/useGoodsGridDensityFlip'
import { addAndroidBackButtonListener } from '@/utils/androidBackButton'
import { HOME_MOTION_CSS_VARS } from '@/constants/homeMotion'
import GoodsCardGridSection from '@/components/goods/GoodsCardGridSection.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import SummaryCard from '@/components/common/SummaryCard.vue'
import AddMethodSheet from '@/components/goods/AddMethodSheet.vue'
import HomeSelectionHeader from '@/components/home/HomeSelectionHeader.vue'
import HomeGoodsToolbar from '@/components/home/HomeGoodsToolbar.vue'
import HomeViewModeSwitch from '@/components/home/HomeViewModeSwitch.vue'
import ScrollTopButton from '@/components/common/ScrollTopButton.vue'
import GoodsBatchEditSheet from '@/components/goods/GoodsBatchEditSheet.vue'
import GoodsSelectionActionBar from '@/components/goods/GoodsSelectionActionBar.vue'
import GoodsDeleteConfirm from '@/components/goods/GoodsDeleteConfirm.vue'
import { HOME_SORT_OPTIONS, sortHomeGoodsList } from '@/utils/homeSort'

defineOptions({ name: 'WishlistView' })

const HOME_MODE_STORAGE_KEY = 'goods_home_mode_v1'
const HOME_MODE_EVENT = 'goods-app:home-mode-change'
const COLLECTION_TAB_STORAGE_KEY = 'goods_collection_tab_v1'
const COLLECTION_TAB_EVENT = 'goods-app:collection-tab-change'

function persistCollectionTab(tab) {
  const normalizedTab = tab === 'wishlist' || tab === 'stats' ? tab : 'goods'
  localStorage.setItem(COLLECTION_TAB_STORAGE_KEY, normalizedTab)
  window.dispatchEvent(new CustomEvent(COLLECTION_TAB_EVENT, {
    detail: { tab: normalizedTab }
  }))
}

const HOME_TOP_OPTIONS = [
  { value: 'goods', label: '收藏' },
  { value: 'wishlist', label: '心愿' },
  { value: 'stats', label: '统计' }
]
const SCROLL_TOP_BUTTON_THRESHOLD = 900
const SELECTION_HEADER_HEIGHT = 64
const ROW_HEIGHT_MAP = {
  comfortable: 308,
  standard: 272,
  compact: 236
}

const router = useRouter()
const store = useGoodsStore()
const pageBodyRef = ref(null)
const goodsGridSectionRef = ref(null)
const windowWidth = ref(window.innerWidth)
const showAddSheet = ref(false)
const showDeleteConfirm = ref(false)
const showBatchEditSheet = ref(false)
const batchEditSheetRef = ref(null)
const isWishlistActive = ref(true)
const wishlistDisplayReady = ref(true)
const showScrollTopButton = ref(false)
const topJumpMasking = ref(false)
const selectionHeaderTop = ref(0)
const selectionHeaderStyle = computed(() => ({
  '--selection-header-top': `${selectionHeaderTop.value}px`
}))
let removeAndroidBackListener = null
let pageScrollBound = false
let pageScrollRaf = 0
let elementScrollHandler = null
let windowScrollHandler = null
let topJumpMaskTimer = 0

const {
  densityModes,
  displayDensity,
  sortDirection,
  sortMode,
  isDensityAnimating,
  isSortAnimating,
  getResponsiveCols,
  setDisplayDensity,
  toggleSortDirection,
  setSortMode,
  restoreHomePreferences
} = useHomePreferences(windowWidth, {
  allowTimeline: false,
  storageKeys: {
    gridDensity: 'goods-app:wishlist-grid-density',
    sortDirection: 'goods-app:wishlist-sort-direction',
    sortMode: 'goods-app:wishlist-sort-mode',
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
  resetStoredScrollOnReload,
  cancelPendingRestore
} = useWishlistScrollRestore(pageBodyRef)

const baseGoodsList = computed(() => store.wishlistViewList)
const totalQuantity = computed(() => (
  baseGoodsList.value.reduce((sum, item) => sum + item.quantityNumber, 0)
))
const totalValue = computed(() => (
  baseGoodsList.value.reduce((sum, item) => sum + item.totalValueNumber, 0).toFixed(2)
))

const goodsList = computed(() => sortHomeGoodsList(baseGoodsList.value, sortMode.value, sortDirection.value))
const isAndroid = /Android/i.test(navigator.userAgent || '')
const lowCores = navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4
const lowMem = navigator.deviceMemory && navigator.deviceMemory <= 4
const isLowPerfDevice = isAndroid || lowCores || lowMem
const {
  getDensityScrollTop,
  getFlipViewportHeight,
  getFlipViewportRect,
  getContainerScrollOffset
} = useDensityGridViewport({
  getScrollEl,
  getActiveScrollSource
})
const densityFlip = useGoodsGridDensityFlip({
  getContainer: () => getGoodsListEl(),
  getDisplayDensity: () => displayDensity.value,
  getResponsiveCols,
  rowHeightMap: ROW_HEIGHT_MAP,
  getDensityScrollTop,
  getFlipViewportHeight,
  getFlipViewportRect,
  getContainerScrollOffset,
  isLowPerfDevice,
  getItemCount: () => goodsList.value.length
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

watch(selectionMode, async (active) => {
  if (!active) {
    selectionHeaderTop.value = 0
    return
  }

  await nextTick()
  updateSelectionHeaderPosition()
})

function syncVisibleGoodsCount() {}
function syncVisibleTimelineMonthCount() {}

function updateScrollTopButtonVisibility() {
  showScrollTopButton.value = readScrollTop() >= SCROLL_TOP_BUTTON_THRESHOLD
}

function updateSelectionHeaderPosition() {
  const spacer = pageBodyRef.value?.querySelector?.('.selection-header-spacer')
  if (!spacer) {
    selectionHeaderTop.value = 0
    return
  }

  const rect = spacer.getBoundingClientRect()
  const maxTop = Math.max(0, window.innerHeight - SELECTION_HEADER_HEIGHT)
  selectionHeaderTop.value = Math.min(maxTop, Math.max(0, rect.top))
}

function getGoodsListEl() {
  return goodsGridSectionRef.value?.goodsListEl?.value || goodsGridSectionRef.value?.goodsListEl || null
}

function handlePageScroll() {
  if (pageScrollRaf) return
  pageScrollRaf = window.requestAnimationFrame(() => {
    pageScrollRaf = 0
    rememberCurrentScrollPosition()
    if (selectionMode.value) updateSelectionHeaderPosition()
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
  triggerTopJumpMask()
  const scrollEl = getScrollEl?.()
  if (scrollEl) {
    scrollEl.scrollTop = 0
  }
  try { document.documentElement.scrollTop = 0 } catch {}
  try { document.body.scrollTop = 0 } catch {}
  try { window.scrollTo(0, 0) } catch {}
  updateScrollTopButtonVisibility()
  rememberCurrentScrollPosition()
}

function triggerTopJumpMask() {
  if (topJumpMaskTimer) {
    window.clearTimeout(topJumpMaskTimer)
  }
  topJumpMasking.value = true
  topJumpMaskTimer = window.setTimeout(() => {
    topJumpMasking.value = false
    topJumpMaskTimer = 0
  }, 260)
}

function openDetail(id) {
  saveScrollPosition(true, `wishlist:openDetail:${id}`)
  router.push(`/detail/${id}`)
}

function openSearch() {
  saveScrollPosition(true, 'wishlist:openSearch')
  router.push('/search?scope=wishlist')
}

function persistHomeMode(mode) {
  const normalizedMode = mode === 'recharge' ? 'recharge' : 'goods'
  localStorage.setItem(HOME_MODE_STORAGE_KEY, normalizedMode)
  window.dispatchEvent(new CustomEvent(HOME_MODE_EVENT, {
    detail: { mode: normalizedMode }
  }))
}

function switchTopTab(nextMode) {
  if (nextMode === 'goods') {
    persistCollectionTab('goods')
    persistHomeMode('goods')
    router.push('/home')
    return
  }

  if (nextMode === 'stats') {
    persistCollectionTab('stats')
    router.push('/leaderboard/characters')
  }
}

function setDisplayDensityWithFlip(mode) {
  if (displayDensity.value === mode) return
  const captured = densityFlip.capture()
  setDisplayDensity(mode)
  if (captured) densityFlip.animate()
}

function openAddSheet() {
  showAddSheet.value = true
}

function goToAdd() {
  openAddSheet()
}

async function navigateFromAddSheet(path, reason) {
  saveScrollPosition(true, reason)
  wishlistDisplayReady.value = false
  showAddSheet.value = false
  try {
    await router.push(path)
  }
  catch {
    wishlistDisplayReady.value = true
  }
}

function goToManualAdd() {
  navigateFromAddSheet('/add?mode=wishlist', 'wishlist:goToManualAdd')
}

function goToImport() {
  navigateFromAddSheet('/import?mode=wishlist', 'wishlist:goToImport')
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
  persistCollectionTab('wishlist')
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
  persistCollectionTab('wishlist')
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
  cancelPendingRestore()
  rememberCurrentScrollPosition()
  if (readScrollTop() > 1) {
    wishlistDisplayReady.value = false
  }
  exitSelectionModeQuiet()
  unbindPageScroll()
  unbindAndroidBackButton()
})

onBeforeUnmount(() => {
  if (topJumpMaskTimer) {
    window.clearTimeout(topJumpMaskTimer)
    topJumpMaskTimer = 0
  }
  cancelPendingRestore()
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

.wishlist-page--top-jump .page-body {
  animation: top-jump-mask-strong 260ms ease-out;
}

@keyframes top-jump-mask-strong {
  0% {
    opacity: 0.72;
    filter: saturate(88%);
  }

  100% {
    opacity: 1;
    filter: saturate(100%);
  }
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

.hero-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
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
  contain: layout paint;
}

.goods-view-pane {
  transform-origin: top center;
  contain: paint;
}

.goods-view-pane--sorting {
  animation: sort-view-refresh var(--home-motion-sort-view-duration) var(--home-motion-ease-standard);
  will-change: opacity, transform;
}

@keyframes sort-view-refresh {
  0% {
    opacity: 0.92;
    transform: translateY(3px);
  }

  100% {
    opacity: 1;
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

:global(html.theme-dark) .hero-search {
    background: var(--app-glass);
  }

:global(html.theme-dark) .fab {
    background: var(--app-text);
    color: var(--app-surface);
  }
</style>
