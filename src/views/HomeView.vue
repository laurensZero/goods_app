<template>
  <div
    class="page home-page"
    :class="{ 'home-page--restoring': !homeDisplayReady, 'home-page--top-jump': topJumpMasking }"
    :style="HOME_MOTION_CSS_VARS"
  >
    <main ref="pageBodyRef" class="page-body">
      <section v-if="(homeMode === 'recharge' && !rechargeSelectionMode) || (homeMode !== 'recharge' && !selectionMode)" class="hero-section">
        <div class="hero-copy">
          <p class="hero-label">{{ homeMode === 'goods' ? 'Goods Archive' : 'Recharge Archive' }}</p>
          <h1 class="hero-title">{{ homeMode === 'goods' ? '收藏库' : '充值库' }}</h1>
        </div>

        <div class="hero-actions">
          <button
            v-if="homeMode === 'goods' || homeMode === 'recharge'"
            class="hero-search"
            type="button"
            aria-label="搜索"
            @click="handleHeroSearch"
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20L16.65 16.65" />
            </svg>
          </button>

          <HomeViewModeSwitch
            v-if="homeMode === 'goods' && !selectionMode"
            model-value="goods"
            @update:model-value="switchHomeTopTab"
          />
        </div>
      </section>

      <HomeSelectionHeader
        :show="homeMode === 'goods' && selectionMode"
        :selected-count="selectedIds.size"
        :all-selected="allSelected"
        :header-style="selectionHeaderStyle"
        @back="exitSelectionMode"
        @toggle-all="toggleSelectAll"
      />

      <div v-if="homeMode === 'goods'">
          <section class="summary-section">
            <SummaryCard :total-value="totalValue" :total-count="goodsList.length" />
          </section>

          <HomeGoodsToolbar
            :total-quantity="totalQuantity"
            :sort-direction="sortDirection"
            :sort-mode="sortMode"
            :sort-options="toolbarSortOptions"
            :is-sort-animating="isSortAnimating"
            :display-density="displayDensity"
            :density-modes="densityModes"
            @toggle-sort="toggleSortDirection"
            @set-sort-mode="setSortMode"
            @toggle-timeline="toggleTimelineMode"
            @set-density="setDisplayDensityWithFlip"
          />

          <Transition name="goods-view-switch" mode="out-in">
            <GoodsCardGridSection
              v-if="goodsList.length > 0 && displayDensity !== 'timeline'"
              key="grid"
              ref="goodsGridSectionRef"
              :items="visibleGoodsList"
              :density="displayDensity"
              :grid-style="goodsGridStyle"
              :after-spacer-height="visibleGoodsTailSpacerHeight"
              :transitioning="isDensityAnimating"
              :is-sort-animating="isSortAnimating"
              :selection-mode="selectionMode"
              :selected-ids="selectedIds"
              @long-press="enterSelectionMode"
              @toggle-select="toggleSelect"
              @open-detail="openDetail"
            />

            <section
              v-else-if="goodsList.length > 0"
              key="timeline"
              :class="['goods-section', 'goods-view-pane', { 'goods-view-pane--sorting': isSortAnimating }]"
            >
              <HomeTimelineSection
                :year-groups="visibleTimelineYearGroups"
                :unknown-items="timelineUnknown"
                :show-unknown="showVisibleTimelineUnknown"
                :active-item-id="expandedTimelineItemId"
                :expanded-item="expandedItem"
                :expanded-section-key="expandedSectionKey"
                :item-index-by-id="timelineItemIndexById"
                :unknown-section-key="TIMELINE_UNKNOWN_SECTION_KEY"
                @toggle-item="toggleTimelineItem"
                @open-detail="openDetail"
              />
            </section>

            <section v-else key="empty" class="empty-wrap goods-view-pane">
              <EmptyState
                icon="✦"
                title="还没有收藏记录"
                description="从徽章、手办到卡片，把每一件喜欢的谷子收进这里。"
                action-text="添加第一件"
                @action="goToAdd"
              />
            </section>
          </Transition>
      </div>

      <div v-else>
        <RechargeContent
          ref="rechargeContentRef"
          @selection-change="handleRechargeSelectionChange"
          @open-month-card="openMonthCardCalendar"
        />
      </div>
    </main>

    <Teleport to="body">
      <ScrollTopButton
        :show="showScrollTopButton && isHomeActive && ((homeMode === 'goods' && !selectionMode) || (homeMode === 'recharge' && !rechargeSelectionMode))"
        @click="scrollToTop"
      />
      <button v-if="homeMode === 'goods' && !selectionMode && isHomeActive" class="fab" type="button" aria-label="添加" @click="showAddSheet = true">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 5V19" />
          <path d="M5 12H19" />
        </svg>
      </button>
      <button v-if="homeMode === 'recharge' && isHomeActive && !rechargeSelectionMode" class="fab" type="button" :aria-label="rechargeFabLabel" @click="openRechargeAdd">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 5V19" />
          <path d="M5 12H19" />
        </svg>
      </button>
    </Teleport>

    <AddMethodSheet
      v-if="homeMode === 'goods'"
      v-model="showAddSheet"
      @manual="goToAdd"
      @import="handleImport"
      @account-import="handleAccountImport"
      @taobao-import="handleTaobaoImport"
    />

    <GoodsDeleteConfirm v-if="homeMode === 'goods'" v-model:show="showDeleteConfirm" :selected-count="selectedIds.size" @confirm="confirmDelete" />

    <GoodsBatchEditSheet
      v-if="homeMode === 'goods'"
      ref="batchEditSheetRef"
      v-model:show="showBatchEditSheet"
      :selected-count="selectedIds.size"
      @apply="applyBatchEditPayload"
    />

    <GoodsSelectionActionBar
      :show="homeMode === 'goods' && selectionMode && !showBatchEditSheet"
      :selected-count="selectedIds.size"
      @delete="batchDelete"
      @edit="batchEdit"
    />

  </div>
</template>
<script setup>
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { useGoodsStore } from '@/stores/goods'
import { preloadImages } from '@/utils/imageCache'
import { useGoodsSelection } from '@/composables/goods/useGoodsSelection'
import { useHomePreferences } from '@/composables/home/useHomePreferences'
import { useHomeScrollRestore } from '@/composables/scroll/useHomeScrollRestore'
import { useHomeTimeline } from '@/composables/home/useHomeTimeline'
import { useHomeGoodsList } from '@/composables/home/useHomeGoodsList'
import { useDensityGridViewport } from '@/composables/home/useDensityGridViewport'
import { useGoodsGridDensityFlip } from '@/composables/home/useGoodsGridDensityFlip'
import { addAndroidBackButtonListener } from '@/utils/androidBackButton'
import { HOME_MOTION_CSS_VARS } from '@/constants/homeMotion'
import { HOME_SORT_OPTIONS } from '@/utils/homeSort'
import { runWithViewTransition } from '@/utils/viewTransition'
import HomeSelectionHeader from '@/components/home/HomeSelectionHeader.vue'
import HomeGoodsToolbar from '@/components/home/HomeGoodsToolbar.vue'
import SummaryCard from '@/components/common/SummaryCard.vue'
import GoodsCardGridSection from '@/components/goods/GoodsCardGridSection.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import AddMethodSheet from '@/components/goods/AddMethodSheet.vue'
import ScrollTopButton from '@/components/common/ScrollTopButton.vue'
import GoodsBatchEditSheet from '@/components/goods/GoodsBatchEditSheet.vue'
import GoodsSelectionActionBar from '@/components/goods/GoodsSelectionActionBar.vue'
import GoodsDeleteConfirm from '@/components/goods/GoodsDeleteConfirm.vue'
import HomeTimelineSection from '@/components/home/HomeTimelineSection.vue'
import HomeViewModeSwitch from '@/components/home/HomeViewModeSwitch.vue'
import RechargeContent from '@/components/recharge/RechargeContent.vue'
import { scrollToTopAnimated } from '@/utils/scrollToTopAnimated'

defineOptions({ name: 'HomeView' })

const store = useGoodsStore()
const pageBodyRef = ref(null)
const goodsGridSectionRef = ref(null)
const batchEditSheetRef = ref(null)
const rechargeContentRef = ref(null)
const rechargeSelectionMode = ref(false)
const rechargeFabLabel = '添加充值记录'
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

const homeMode = ref('goods')
const TIMELINE_UNKNOWN_SECTION_KEY = 'timeline:unknown'
const SELECTION_HEADER_HEIGHT = 64
// 视口宽度，用于响应式列数计算
const windowWidth = ref(window.innerWidth)
const _onResize = () => { windowWidth.value = window.innerWidth }
const selectionHeaderTop = ref(0)
const INITIAL_RENDER_ROWS = 6
const LOAD_MORE_ROWS = 4
const LOAD_MORE_THRESHOLD_PX = 720
const INITIAL_TIMELINE_MONTHS = 6
const LOAD_MORE_TIMELINE_MONTHS = 4
const TIMELINE_RESTORE_BUFFER_MONTHS = 3
const TIMELINE_MONTH_ESTIMATED_HEIGHT = 360
const SCROLL_TOP_BUTTON_THRESHOLD = 900
const ROW_HEIGHT_MAP = {
  comfortable: 308,
  standard: 272,
  compact: 236
}
let removeAndroidBackListener = null
let selectionHeaderScrollBound = false
let pageScrollRaf = 0
let elementScrollHandler = null
let windowScrollHandler = null
let mountBootstrapSession = 0
let isRouteLeaving = false

// KeepAlive 激活状态：控制 Teleport FAB 在其他页面不穿透显示
const isHomeActive = ref(true)

const {
  densityModes,
  displayDensity,
  sortDirection,
  sortMode,
  expandedTimelineItemId,
  isDensityAnimating,
  isSortAnimating,
  getResponsiveCols,
  setDisplayDensity,
  toggleTimelineMode,
  toggleSortDirection,
  setSortMode,
  toggleExpandedTimelineItem,
  clearExpandedTimelineItem,
  restoreHomePreferences
} = useHomePreferences(windowWidth)

const timelineSortOptions = HOME_SORT_OPTIONS.filter((option) => option.value === 'acquiredAt')
const toolbarSortOptions = computed(() => (
  displayDensity.value === 'timeline'
    ? (timelineSortOptions.length ? timelineSortOptions : HOME_SORT_OPTIONS)
    : HOME_SORT_OPTIONS
))

const {
  getScrollEl,
  getActiveScrollSource,
  getDomScrollSnapshot,
  markScrollSource,
  readScrollTop,
  getStoredScrollState,
  hasPendingRestore,
  saveScrollPosition,
  applyScrollPosition,
  restorePendingScrollPosition,
  restoreActivatedScrollPosition,
  rememberCurrentScrollPosition,
  clearDisplayedScrollPosition,
  resetStoredScrollOnReload,
  cancelPendingRestore
} = useHomeScrollRestore(pageBodyRef)

const homeDisplayReady = ref(true)
const showScrollTopButton = ref(false)
const topJumpMasking = ref(false)
let topJumpMaskTimer = 0

// 添加方式面板
const showAddSheet = ref(false)
const router = useRouter()
const route = useRoute()
function persistHomeMode(value) {
  localStorage.setItem(HOME_MODE_STORAGE_KEY, value)
  window.dispatchEvent(new CustomEvent(HOME_MODE_EVENT, {
    detail: { mode: value }
  }))
}

function setHomeModeValue(nextMode) {
  const target = nextMode === 'recharge' ? 'recharge' : 'goods'
  if (homeMode.value === target) return

  homeMode.value = target
  persistHomeMode(target)
  if (target === 'recharge') {
    showAddSheet.value = false
    showDeleteConfirm.value = false
    showBatchEditSheet.value = false
    exitSelectionModeQuiet()
  }
}

function switchHomeTopTab(nextMode) {
  const tabOrder = { goods: 0, wishlist: 1, stats: 2 }
  const currentIndex = tabOrder.goods

  if (nextMode === 'wishlist') {
    persistCollectionTab('wishlist')
    saveScrollPosition(true, 'home:navigateToWishlist')
    runWithViewTransition(
      () => router.push('/wishlist'),
      { direction: tabOrder.wishlist >= currentIndex ? 'forward' : 'back' }
    )
    return
  }

  if (nextMode === 'stats') {
    persistCollectionTab('stats')
    saveScrollPosition(true, 'home:navigateToStats')
    runWithViewTransition(
      () => router.push('/leaderboard/characters'),
      { direction: tabOrder.stats >= currentIndex ? 'forward' : 'back' }
    )
    return
  }

  persistCollectionTab('goods')
  setHomeModeValue('goods')
}

function handleExternalHomeModeChange(mode) {
  const nextMode = mode === 'recharge' ? 'recharge' : 'goods'
  if (homeMode.value === nextMode) return
  setHomeModeValue(nextMode)
}

function handleHomeModeEvent(event) {
  handleExternalHomeModeChange(event?.detail?.mode)
}

function handleHomeModeStorage(event) {
  if (event.key !== HOME_MODE_STORAGE_KEY) return
  handleExternalHomeModeChange(event.newValue)
}

function readStoredHomeMode() {
  if (typeof localStorage === 'undefined') return 'goods'
  const storedValue = localStorage.getItem(HOME_MODE_STORAGE_KEY)
  return storedValue === 'recharge' ? 'recharge' : 'goods'
}

function handleHeroSearch() {
  if (homeMode.value === 'goods') {
    saveScrollPosition(true, 'home:handleHeroSearch')
    runWithViewTransition(
      () => router.push('/search'),
      { direction: 'forward' }
    )
    return
  }

  rechargeContentRef.value?.toggleSearch?.()
}

function openRechargeAdd() {
  rechargeContentRef.value?.openAddMethodSheet?.()
}

function handleRechargeSelectionChange(active) {
  rechargeSelectionMode.value = Boolean(active)
}

function navigateFromAddSheet(path, reason) {
  saveScrollPosition(true, reason)
  homeDisplayReady.value = false
  showAddSheet.value = false
  runWithViewTransition(
    () => router.push(path).catch(() => {
      homeDisplayReady.value = true
    }),
    { direction: 'forward' }
  )
}

function handleImport() {
  navigateFromAddSheet('/import', 'home:handleImport')
}

function handleAccountImport() {
  navigateFromAddSheet('/account-import', 'home:handleAccountImport')
}

function handleTaobaoImport() {
  navigateFromAddSheet('/taobao-import', 'home:handleTaobaoImport')
}

function goToAdd() {
  navigateFromAddSheet('/add', 'home:goToAdd')
}

async function refresh() {
  await store.refreshList()
}

function getInitialVisibleCount() {
  return Math.max(getResponsiveCols(displayDensity.value) * INITIAL_RENDER_ROWS, 24)
}

function getLoadMoreStep() {
  return Math.max(getResponsiveCols(displayDensity.value) * LOAD_MORE_ROWS, 16)
}

function estimateVisibleCountForScrollTop(scrollTop = 0, options = {}) {
  if (displayDensity.value === 'timeline') return goodsList.value.length

  const { useFlipViewport = false } = options
  const cols = getResponsiveCols(displayDensity.value)
  const viewportHeight = useFlipViewport
    ? getFlipViewportHeight()
    : (getScrollEl()?.clientHeight || window.innerHeight || 800)
  const rowHeight = ROW_HEIGHT_MAP[displayDensity.value] || 272
  const rowsNeeded = Math.ceil((scrollTop + viewportHeight * 2) / rowHeight)
  const estimatedCount = rowsNeeded * cols + getLoadMoreStep()
  return Math.min(goodsList.value.length, Math.max(getInitialVisibleCount(), estimatedCount))
}

function syncVisibleGoodsCount(scrollTop = 0, options = {}) {
  visibleGoodsCount.value = estimateVisibleCountForScrollTop(scrollTop, options)
}

function syncVisibleGoodsCountForActivatedRestore(scrollTop = 0) {
  const viewportHeight = getFlipViewportHeight()
  const preloadTargetTop = scrollTop + viewportHeight * 2.5
  visibleGoodsCount.value = Math.min(
    goodsList.value.length,
    Math.max(
      visibleGoodsCount.value,
      estimateVisibleCountForScrollTop(preloadTargetTop, { useFlipViewport: true }) + getLoadMoreStep()
    )
  )
}

function maybeLoadMoreGoods() {
  if (displayDensity.value === 'timeline') return
  if (visibleGoodsCount.value >= goodsList.value.length) return

  const el = getScrollEl()
  if (!el) return

  const remaining = el.scrollHeight - el.scrollTop - el.clientHeight
  if (remaining > LOAD_MORE_THRESHOLD_PX) return

  visibleGoodsCount.value = Math.min(goodsList.value.length, visibleGoodsCount.value + getLoadMoreStep())
}

function getInitialVisibleTimelineMonths() {
  return INITIAL_TIMELINE_MONTHS
}

function estimateVisibleTimelineMonths(scrollTop = 0, options = {}) {
  if (displayDensity.value !== 'timeline') return visibleTimelineMonthCount.value

  const { useFlipViewport = false } = options
  const viewportHeight = useFlipViewport
    ? getFlipViewportHeight()
    : (getScrollEl()?.clientHeight || window.innerHeight || 800)
  const estimatedMonths = Math.ceil((scrollTop + viewportHeight * 1.6) / TIMELINE_MONTH_ESTIMATED_HEIGHT) + 1
  return Math.min(allTimelineMonthCount.value, Math.max(getInitialVisibleTimelineMonths(), estimatedMonths))
}

function syncVisibleTimelineMonthCount(scrollTop = 0, options = {}) {
  visibleTimelineMonthCount.value = estimateVisibleTimelineMonths(scrollTop, options)
}

function syncVisibleTimelineMonthCountForActivatedRestore(scrollTop = 0) {
  const viewportHeight = getFlipViewportHeight()
  const preloadTargetTop = scrollTop + viewportHeight * 2
  visibleTimelineMonthCount.value = Math.min(
    allTimelineMonthCount.value,
    Math.max(
      visibleTimelineMonthCount.value,
      estimateVisibleTimelineMonths(preloadTargetTop, { useFlipViewport: true }) + 1
    )
  )
}

function primeActivatedRestoreWindow(state) {
  if (!state) return

  const top = Math.max(0, Number(state.top) || 0)
  syncVisibleGoodsCountForActivatedRestore(top)
  syncVisibleTimelineMonthCountForActivatedRestore(top)
  prepareRestoreState(state)
}

function prepareRestoreState(state) {
  if (!state) return

  if (displayDensity.value === 'timeline') {
    const anchorId = String(state.anchorId || '')
    if (!anchorId) return

    if (timelineUnknownItemIds.value.has(anchorId)) {
      visibleTimelineMonthCount.value = allTimelineMonthCount.value
      return
    }

    const monthIndex = timelineMonthIndexByItemId.value.get(anchorId)
    if (!Number.isFinite(monthIndex) || monthIndex < 0) return

    visibleTimelineMonthCount.value = Math.min(
      allTimelineMonthCount.value,
      Math.max(
        visibleTimelineMonthCount.value,
        getInitialVisibleTimelineMonths(),
        monthIndex + 1 + TIMELINE_RESTORE_BUFFER_MONTHS
      )
    )
    return
  }

  const anchorIndex = Number(state.anchorIndex)
  if (!Number.isFinite(anchorIndex) || anchorIndex < 0) return

  const cols = getResponsiveCols(displayDensity.value)
  const bufferedCount = anchorIndex + cols * 3
  visibleGoodsCount.value = Math.min(
    goodsList.value.length,
    Math.max(visibleGoodsCount.value, getInitialVisibleCount(), bufferedCount)
  )
}

function maybeLoadMoreTimelineMonths() {
  if (displayDensity.value !== 'timeline') return
  if (visibleTimelineMonthCount.value >= allTimelineMonthCount.value) return

  const el = getScrollEl()
  if (!el) return

  const remaining = el.scrollHeight - el.scrollTop - el.clientHeight
  if (remaining > LOAD_MORE_THRESHOLD_PX) return

  visibleTimelineMonthCount.value = Math.min(
    allTimelineMonthCount.value,
    visibleTimelineMonthCount.value + LOAD_MORE_TIMELINE_MONTHS
  )
}

function handlePageScroll() {
  if (isRouteLeaving) return
  if (pageScrollRaf) return
  pageScrollRaf = window.requestAnimationFrame(() => {
    pageScrollRaf = 0
    if (isRouteLeaving) return
    rememberCurrentScrollPosition()
    if (selectionMode.value) updateSelectionHeaderPosition()
    maybeLoadMoreGoods()
    maybeLoadMoreTimelineMonths()
    updateScrollTopButtonVisibility()
  })
}

function updateScrollTopButtonVisibility() {
  showScrollTopButton.value = readScrollTop() >= SCROLL_TOP_BUTTON_THRESHOLD
}

function getGoodsListEl() {
  return goodsGridSectionRef.value?.goodsListEl?.value || goodsGridSectionRef.value?.goodsListEl || null
}

function bindSelectionHeaderScroll() {
  if (selectionHeaderScrollBound) return
  // Guardrail:
  // We intentionally listen to both the page container and window.
  // Different routes / browser states can move the effective scroll source.
  // The handler marks the real source before saving so restore uses the same target later.
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
  selectionHeaderScrollBound = true
}

function unbindSelectionHeaderScroll() {
  if (!selectionHeaderScrollBound) return
  if (elementScrollHandler) {
    getScrollEl()?.removeEventListener('scroll', elementScrollHandler)
    elementScrollHandler = null
  }
  if (windowScrollHandler) {
    window.removeEventListener('scroll', windowScrollHandler)
    windowScrollHandler = null
  }
  selectionHeaderScrollBound = false
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

function shouldMaskHomeDisplay() {
  const storedTop = getStoredScrollState()?.top || 0
  if (storedTop <= 0) return false
  return Math.abs(readScrollTop() - storedTop) > 1
}

onMounted(async () => {
  isRouteLeaving = false
  const sessionId = ++mountBootstrapSession
  handleExternalHomeModeChange(readStoredHomeMode())
  const didResetOnReload = resetStoredScrollOnReload()
  if (sessionId !== mountBootstrapSession) return
  if (didResetOnReload) {
    clearDisplayedScrollPosition()
  }
  homeDisplayReady.value = true
  restoreHomePreferences()
  window.addEventListener('resize', _onResize, { passive: true })
  await refresh()
  if (sessionId !== mountBootstrapSession) return
  syncVisibleGoodsCount()
  syncVisibleTimelineMonthCount()
  await nextTick()
  if (sessionId !== mountBootstrapSession) return
  bindSelectionHeaderScroll()
  updateSelectionHeaderPosition()
  const pendingState = getStoredScrollState()
  if (pendingState?.source) {
    markScrollSource(pendingState.source)
  }
  await restorePendingScrollPosition(syncVisibleGoodsCount, syncVisibleTimelineMonthCount, prepareRestoreState)
  if (sessionId !== mountBootstrapSession) return
  await nextTick()
  if (sessionId !== mountBootstrapSession) return
  homeDisplayReady.value = true
  updateScrollTopButtonVisibility()
  window.addEventListener(HOME_MODE_EVENT, handleHomeModeEvent)
  window.addEventListener('storage', handleHomeModeStorage)
  window.addEventListener('popstate', handleSelectionPopState)
  bindAndroidBackButton()
})

onActivated(async () => {
  isRouteLeaving = false
  isHomeActive.value = true
  handleExternalHomeModeChange(readStoredHomeMode())
  const storedState = getStoredScrollState()
  if (storedState?.source) {
    markScrollSource(storedState.source)
  }
  await restoreActivatedScrollPosition(
    syncVisibleGoodsCountForActivatedRestore,
    syncVisibleTimelineMonthCountForActivatedRestore,
    prepareRestoreState
  )
  await nextTick()
  homeDisplayReady.value = true
  bindSelectionHeaderScroll()
  updateSelectionHeaderPosition()
  updateScrollTopButtonVisibility()
  bindAndroidBackButton()
})

onDeactivated(() => {
  isHomeActive.value = false
  mountBootstrapSession += 1
  cancelPendingRestore()
  if (!hasPendingRestore() && !isRouteLeaving) {
    rememberCurrentScrollPosition()
  }
  exitSelectionModeQuiet()
  unbindSelectionHeaderScroll()
  unbindAndroidBackButton()
})

onBeforeUnmount(() => {
  if (topJumpMaskTimer) {
    window.clearTimeout(topJumpMaskTimer)
    topJumpMaskTimer = 0
  }
  cancelPendingRestore()
  window.removeEventListener('resize', _onResize)
  if (pageScrollRaf) {
    window.cancelAnimationFrame(pageScrollRaf)
    pageScrollRaf = 0
  }
  unbindSelectionHeaderScroll()
  window.removeEventListener(HOME_MODE_EVENT, handleHomeModeEvent)
  window.removeEventListener('storage', handleHomeModeStorage)
  window.removeEventListener('popstate', handleSelectionPopState)
  unbindAndroidBackButton()
  document.body.classList.remove('selection-active')
  if (!hasPendingRestore() && !isRouteLeaving) {
    rememberCurrentScrollPosition()
  }
})

onBeforeRouteLeave(() => {
  isRouteLeaving = true
  saveScrollPosition(false, 'home:onBeforeRouteLeave')
  if (pageScrollRaf) {
    window.cancelAnimationFrame(pageScrollRaf)
    pageScrollRaf = 0
  }
  unbindSelectionHeaderScroll()
})

const { goodsList, totalValue, totalQuantity, goodsById } = useHomeGoodsList(store, sortMode, sortDirection)
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

const visibleGoodsCount = ref(0)
const visibleTimelineMonthCount = ref(INITIAL_TIMELINE_MONTHS)
const visibleGoodsList = computed(() =>
  displayDensity.value === 'timeline'
    ? goodsList.value
    : goodsList.value.slice(0, visibleGoodsCount.value || getInitialVisibleCount())
)
const {
  allTimelineMonthCount,
  timelineMonthIndexByItemId,
  timelineItemIndexById,
  timelineEntryById,
  timelineUnknownItemIds,
  visibleTimelineYearGroups,
  timelineUnknown,
  showVisibleTimelineUnknown
} = useHomeTimeline({
  goodsList,
  displayDensity,
  sortDirection,
  visibleTimelineMonthCount,
  getInitialVisibleTimelineMonths
})
const goodsGridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${getResponsiveCols(displayDensity.value)}, minmax(0, 1fr))`
}))
const visibleGoodsTailSpacerHeight = computed(() => {
  if (displayDensity.value === 'timeline') return 0

  const remainingItems = Math.max(0, goodsList.value.length - visibleGoodsList.value.length)
  if (!remainingItems) return 0

  const cols = getResponsiveCols(displayDensity.value)
  const rowHeight = ROW_HEIGHT_MAP[displayDensity.value] || 272
  const gap = 12
  const remainingRows = Math.ceil(remainingItems / cols)
  return remainingRows > 0
    ? remainingRows * rowHeight + Math.max(0, remainingRows - 1) * gap
    : 0
})
const selectionHeaderStyle = computed(() => ({
  '--selection-header-top': `${selectionHeaderTop.value}px`
}))
const preloadLeadCount = computed(() =>
  displayDensity.value === 'timeline'
    ? 6
    : Math.max(getResponsiveCols(displayDensity.value) * 2, 8)
)
const preloadTargetList = computed(() =>
  (
    displayDensity.value === 'timeline'
      ? [
          ...visibleTimelineYearGroups.value.flatMap((yearGroup) =>
            yearGroup.months.flatMap((monthGroup) => monthGroup.items)
          ),
          ...(showVisibleTimelineUnknown.value ? timelineUnknown.value : [])
        ]
      : visibleGoodsList.value
  ).slice(0, preloadLeadCount.value)
)

watch(
  [() => goodsList.value.length, displayDensity, sortDirection, sortMode, windowWidth],
  () => {
    syncVisibleGoodsCount(readScrollTop(), { useFlipViewport: true })
    syncVisibleTimelineMonthCount(readScrollTop(), { useFlipViewport: true })
  },
  { immediate: true }
)

watch(
  () => preloadTargetList.value.map((item) => item.coverImage).filter(Boolean),
  (urls) => {
    if (urls.length) preloadImages(urls)
  },
  { immediate: true }
)

function openDetail(id) {
  const payload = typeof id === 'object' && id !== null ? id : { id }
  const goodsId = payload.id
  saveScrollPosition(true, `home:openDetail:${goodsId}`)
  primeActivatedRestoreWindow(getStoredScrollState())
  runWithViewTransition(
    () => router.push(`/detail/${goodsId}`),
    {
      goodsId,
      sourceEl: payload.sourceEl || null,
      returnPath: route.fullPath
    }
  )
}

function openMonthCardCalendar() {
  saveScrollPosition(true, 'home:openMonthCardCalendar')
  primeActivatedRestoreWindow(getStoredScrollState())
  runWithViewTransition(
    () => router.push('/recharge/month-cards'),
    { direction: 'forward' }
  )
}

function scrollToTop() {
  triggerTopJumpMask()
  scrollToTopAnimated(getScrollEl, 260, () => {
    updateScrollTopButtonVisibility()
    rememberCurrentScrollPosition()
  }, getActiveScrollSource())
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

// -------- 时间线内联展开 --------
const expandedItem = computed(() =>
  expandedTimelineItemId.value
    ? (displayDensity.value === 'timeline'
        ? timelineEntryById.value.get(expandedTimelineItemId.value) ?? null
        : goodsById.value.get(expandedTimelineItemId.value) ?? null)
    : null
)
const expandedSectionKey = computed(() => {
  if (!expandedItem.value) return ''

  if (displayDensity.value === 'timeline') {
    return expandedItem.value.timelineYearMonth || TIMELINE_UNKNOWN_SECTION_KEY
  }

  const yearMonth = String(expandedItem.value.acquiredAt || '').slice(0, 7)
  return /^\d{4}-\d{2}$/.test(yearMonth) ? yearMonth : TIMELINE_UNKNOWN_SECTION_KEY
})

function toggleTimelineItem(id) {
  toggleExpandedTimelineItem(id)
}

function setDisplayDensityWithFlip(mode) {
  if (displayDensity.value === mode) return
  const captured = densityFlip.capture()
  setDisplayDensity(mode)
  if (captured) densityFlip.animate()
}

watch(displayDensity, (v) => {
  if (v !== 'timeline') clearExpandedTimelineItem()
})

// -------- Multi-select --------
const showDeleteConfirm = ref(false)
const showBatchEditSheet = ref(false)

function closeSelectionOverlays() {
  showDeleteConfirm.value = false
  batchEditSheetRef.value?.close()
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
} = useGoodsSelection(computed(() => store.collectionList), {
  historyKey: 'selectionMode',
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
</script>

<style scoped>
.home-page {
  position: relative;
  background: var(--app-bg-gradient);
}

.home-page--top-jump .page-body {
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

.home-page--restoring {
  opacity: 0.01;
  pointer-events: none;
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

.hero-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.hero-copy {
  max-width: 296px;
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

.hero-search svg {
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

.goods-view-switch-enter-active,
.goods-view-switch-leave-active {
  transition:
    opacity var(--home-motion-view-fade-duration) var(--home-motion-ease-standard),
    transform var(--home-motion-view-transform-duration) var(--home-motion-ease-emphasis);
}

.goods-view-switch-enter-from,
.goods-view-switch-leave-to {
  opacity: 0;
  transform: translateY(12px) scale(0.992);
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

.fab {
  right: 16px;
  background: var(--app-text);
  color: var(--app-surface);
}

.fab svg {
  width: 22px;
  height: 22px;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
}

.fab:active {
  transform: scale(0.96);
}

/* ── 深色模式覆盖 ── */
:global(html.theme-dark) .hero-search {
    background: var(--app-glass);
  }
:global(html.theme-dark) .fab {
    background: var(--app-text);
    color: var(--app-surface);
  }
</style>


