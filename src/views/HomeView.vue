<template>
  <div class="page home-page" :class="{ 'home-page--restoring': !homeDisplayReady }" :style="HOME_MOTION_CSS_VARS">
    <main ref="pageBodyRef" class="page-body">
      <section v-if="!selectionMode" class="hero-section">
        <div class="hero-copy">
          <p class="hero-label">Goods Archive</p>
          <h1 class="hero-title">收藏库</h1>
        </div>
        <button class="hero-search" type="button" aria-label="搜索" @click="$router.push('/search')">
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
        <SummaryCard :total-value="totalValue" :total-count="goodsList.length" />
      </section>

      <HomeGoodsToolbar
        :total-quantity="totalQuantity"
        :sort-direction="sortDirection"
        :sort-mode="sortMode"
        :sort-options="HOME_SORT_OPTIONS"
        :is-sort-animating="isSortAnimating"
        :display-density="displayDensity"
        :density-modes="densityModes"
        @toggle-sort="toggleSortDirection"
        @set-sort-mode="setSortMode"
        @toggle-timeline="toggleTimelineMode"
        @set-density="setDisplayDensityWithFlip"
      />

      <Transition name="goods-view-switch" mode="out-in">
        <section
          v-if="goodsList.length > 0 && displayDensity !== 'timeline'"
          key="grid"
          :class="['goods-section', 'goods-view-pane', { 'goods-view-pane--sorting': isSortAnimating }]"
        >
          <div
            ref="goodsListRef"
            :class="[
              'goods-list',
              {
                'goods-list--density-animating': isDensityAnimating
              }
            ]"
            :style="goodsGridStyle"
          >
            <GoodsCard
              v-for="(item, index) in visibleGoodsList"
              :key="item.id"
              :item="item"
              :density="displayDensity"
              :transitioning="isDensityAnimating"
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
    </main>

    <Teleport to="body">
      <ScrollTopButton :show="showScrollTopButton && !selectionMode && isHomeActive" @click="scrollToTop" />
      <button v-if="!selectionMode && isHomeActive" class="fab" type="button" aria-label="添加" @click="showAddSheet = true">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 5V19" />
          <path d="M5 12H19" />
        </svg>
      </button>
    </Teleport>

    <AddMethodSheet
      v-model="showAddSheet"
      @manual="goToAdd"
      @import="handleImport"
      @account-import="handleAccountImport"
      @taobao-import="handleTaobaoImport"
    />

    <GoodsDeleteConfirm v-model:show="showDeleteConfirm" :selected-count="selectedIds.size" @confirm="confirmDelete" />

    <GoodsBatchEditSheet
      ref="batchEditSheetRef"
      v-model:show="showBatchEditSheet"
      :selected-count="selectedIds.size"
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
import { preloadImages } from '@/utils/imageCache'
import { useGoodsSelection } from '@/composables/useGoodsSelection'
import { useHomePreferences } from '@/composables/useHomePreferences'
import { useHomeScrollRestore } from '@/composables/useHomeScrollRestore'
import { useHomeTimeline } from '@/composables/useHomeTimeline'
import { useHomeGoodsList } from '@/composables/useHomeGoodsList'
import { addAndroidBackButtonListener } from '@/utils/androidBackButton'
import { scrollToTopAnimated } from '@/utils/scrollToTopAnimated'
import { HOME_MOTION_CSS_VARS } from '@/constants/homeMotion'
import { HOME_SORT_OPTIONS } from '@/utils/homeSort'
import { createDensityFlip } from '@/utils/densityFlip'
import HomeSelectionHeader from '@/components/HomeSelectionHeader.vue'
import HomeGoodsToolbar from '@/components/HomeGoodsToolbar.vue'
import SummaryCard from '@/components/SummaryCard.vue'
import GoodsCard from '@/components/GoodsCard.vue'
import EmptyState from '@/components/EmptyState.vue'
import AddMethodSheet from '@/components/AddMethodSheet.vue'
import ScrollTopButton from '@/components/ScrollTopButton.vue'
import GoodsBatchEditSheet from '@/components/GoodsBatchEditSheet.vue'
import GoodsSelectionActionBar from '@/components/GoodsSelectionActionBar.vue'
import GoodsDeleteConfirm from '@/components/GoodsDeleteConfirm.vue'
import HomeTimelineSection from '@/components/HomeTimelineSection.vue'

defineOptions({ name: 'HomeView' })

const store = useGoodsStore()
const pageBodyRef = ref(null)
const goodsListRef = ref(null)
const batchEditSheetRef = ref(null)
const TIMELINE_UNKNOWN_SECTION_KEY = 'timeline:unknown'
const SELECTION_HEADER_HEIGHT = 64
const DENSITY_DEBUG = import.meta.env.DEV
// 视口宽度，用于响应式列数计算
const windowWidth = ref(window.innerWidth)
const _onResize = () => { windowWidth.value = window.innerWidth }
const selectionHeaderTop = ref(0)
const INITIAL_RENDER_ROWS = 6
const LOAD_MORE_ROWS = 4
const LOAD_MORE_THRESHOLD_PX = 720
const INITIAL_TIMELINE_MONTHS = 6
const LOAD_MORE_TIMELINE_MONTHS = 4
const TIMELINE_RESTORE_BUFFER_MONTHS = 2
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

// 添加方式面板
const showAddSheet = ref(false)
const router = useRouter()
function handleImport() {
  showAddSheet.value = false
  saveScrollPosition(true, 'home:handleImport')
  router.push('/import')
}

function handleAccountImport() {
  showAddSheet.value = false
  saveScrollPosition(true, 'home:handleAccountImport')
  router.push('/account-import')
}

function handleTaobaoImport() {
  showAddSheet.value = false
  saveScrollPosition(true, 'home:handleTaobaoImport')
  router.push('/taobao-import')
}

function goToAdd() {
  showAddSheet.value = false
  saveScrollPosition(true, 'home:goToAdd')
  router.push('/add')
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

function estimateVisibleCountForScrollTop(scrollTop = 0) {
  if (displayDensity.value === 'timeline') return goodsList.value.length

  const cols = getResponsiveCols(displayDensity.value)
  const viewportHeight = getFlipViewportHeight()
  const rowHeight = ROW_HEIGHT_MAP[displayDensity.value] || 272
  const rowsNeeded = Math.ceil((scrollTop + viewportHeight * 2) / rowHeight)
  const estimatedCount = rowsNeeded * cols + getLoadMoreStep()
  return Math.min(goodsList.value.length, Math.max(getInitialVisibleCount(), estimatedCount))
}

function syncVisibleGoodsCount(scrollTop = 0) {
  visibleGoodsCount.value = estimateVisibleCountForScrollTop(scrollTop)
}

function maybeLoadMoreGoods() {
  if (displayDensity.value === 'timeline') return
  if (visibleGoodsCount.value >= goodsList.value.length) return

  const { viewportHeight, scrollTop, scrollHeight } = getDensityScrollMetrics()
  const remaining = scrollHeight - scrollTop - viewportHeight
  if (remaining > LOAD_MORE_THRESHOLD_PX) return

  visibleGoodsCount.value = Math.min(goodsList.value.length, visibleGoodsCount.value + getLoadMoreStep())
}

function getInitialVisibleTimelineMonths() {
  return INITIAL_TIMELINE_MONTHS
}

function estimateVisibleTimelineMonths(scrollTop = 0) {
  if (displayDensity.value !== 'timeline') return visibleTimelineMonthCount.value

  const viewportHeight = getFlipViewportHeight()
  const estimatedMonths = Math.ceil((scrollTop + viewportHeight * 1.6) / TIMELINE_MONTH_ESTIMATED_HEIGHT) + 1
  return Math.min(allTimelineMonthCount.value, Math.max(getInitialVisibleTimelineMonths(), estimatedMonths))
}

function syncVisibleTimelineMonthCount(scrollTop = 0) {
  visibleTimelineMonthCount.value = estimateVisibleTimelineMonths(scrollTop)
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

  const { viewportHeight, scrollTop, scrollHeight } = getDensityScrollMetrics()
  const remaining = scrollHeight - scrollTop - viewportHeight
  if (remaining > LOAD_MORE_THRESHOLD_PX) return

  visibleTimelineMonthCount.value = Math.min(
    allTimelineMonthCount.value,
    visibleTimelineMonthCount.value + LOAD_MORE_TIMELINE_MONTHS
  )
}

function handlePageScroll() {
  if (pageScrollRaf) return
  pageScrollRaf = window.requestAnimationFrame(() => {
    pageScrollRaf = 0
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

function canUseElementViewport() {
  const el = getScrollEl()
  if (!el) return false

  const overflowY = window.getComputedStyle?.(el)?.overflowY || ''
  const allowsElementScroll = overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay'
  if (!allowsElementScroll) return false

  return (el.scrollHeight - el.clientHeight) > 1
}

function getDensityScrollSource() {
  const activeSource = getActiveScrollSource()
  if (activeSource === 'window') return 'window'
  if (activeSource === 'element' && canUseElementViewport()) return 'element'
  return canUseElementViewport() ? 'element' : 'window'
}

function getDensityScrollMetrics() {
  const source = getDensityScrollSource()
  const viewportHeight = source === 'window'
    ? (window.innerHeight || document.documentElement.clientHeight || 800)
    : Math.max(0, getScrollEl()?.clientHeight || 0)
  const scrollTop = source === 'window'
    ? (window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0)
    : (getScrollEl()?.scrollTop || 0)
  const scrollHeight = source === 'window'
    ? Math.max(
        document.documentElement.scrollHeight || 0,
        document.body.scrollHeight || 0,
        getScrollEl()?.scrollHeight || 0
      )
    : (getScrollEl()?.scrollHeight || 0)

  return { source, viewportHeight, scrollTop, scrollHeight }
}

function getFlipViewportHeight() {
  if (getDensityScrollSource() === 'window') {
    return window.innerHeight || document.documentElement.clientHeight || 800
  }
  const rect = getScrollEl()?.getBoundingClientRect()
  if (!rect) return window.innerHeight || document.documentElement.clientHeight || 800
  const visibleTop = Math.max(0, rect.top)
  const visibleBottom = Math.min(window.innerHeight || document.documentElement.clientHeight || 0, rect.bottom)
  const visibleHeight = visibleBottom - visibleTop
  return visibleHeight > 0 ? visibleHeight : (window.innerHeight || document.documentElement.clientHeight || 800)
}

function getFlipViewportRect() {
  if (getDensityScrollSource() === 'window') {
    return {
      top: 0,
      bottom: window.innerHeight || document.documentElement.clientHeight || 0,
      left: 0,
      right: window.innerWidth || document.documentElement.clientWidth || 0
    }
  }
  const rect = getScrollEl()?.getBoundingClientRect()
  if (!rect) return undefined
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0
  return {
    top: Math.max(0, rect.top),
    bottom: Math.min(viewportHeight, rect.bottom),
    left: Math.max(0, rect.left),
    right: Math.min(viewportWidth, rect.right)
  }
}

function getContainerScrollOffset(container) {
  if (!container) return 0
  if (getDensityScrollSource() === 'window') {
    return container.getBoundingClientRect().top + (window.scrollY || document.documentElement.scrollTop || 0)
  }

  const scrollEl = getScrollEl()
  if (!scrollEl) return container.offsetTop || 0
  const containerRect = container.getBoundingClientRect()
  const scrollRect = scrollEl.getBoundingClientRect()
  return containerRect.top - scrollRect.top + scrollEl.scrollTop
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
  const didResetOnReload = resetStoredScrollOnReload()
  if (didResetOnReload) {
    clearDisplayedScrollPosition()
  }
  const shouldMaskDisplay = shouldMaskHomeDisplay()
  homeDisplayReady.value = !shouldMaskDisplay
  restoreHomePreferences()
  window.addEventListener('resize', _onResize, { passive: true })
  await refresh()
  syncVisibleGoodsCount()
  syncVisibleTimelineMonthCount()
  await nextTick()
  bindSelectionHeaderScroll()
  updateSelectionHeaderPosition()
  await restorePendingScrollPosition(syncVisibleGoodsCount, syncVisibleTimelineMonthCount, prepareRestoreState)
  await nextTick()
  homeDisplayReady.value = true
  updateScrollTopButtonVisibility()
  window.addEventListener('popstate', handleSelectionPopState)
  bindAndroidBackButton()
})

onActivated(async () => {
  isHomeActive.value = true
  const shouldMaskDisplay = shouldMaskHomeDisplay()
  if (shouldMaskDisplay) {
    homeDisplayReady.value = false
  }
  await restoreActivatedScrollPosition(syncVisibleGoodsCount, syncVisibleTimelineMonthCount, prepareRestoreState)
  await nextTick()
  homeDisplayReady.value = true
  bindSelectionHeaderScroll()
  updateSelectionHeaderPosition()
  updateScrollTopButtonVisibility()
  bindAndroidBackButton()
})

onDeactivated(() => {
  isHomeActive.value = false
  cancelPendingRestore()
  rememberCurrentScrollPosition()
  if (readScrollTop() > 1) {
    homeDisplayReady.value = false
  }
  exitSelectionModeQuiet()
  unbindSelectionHeaderScroll()
  unbindAndroidBackButton()
})

onBeforeUnmount(() => {
  cancelPendingRestore()
  window.removeEventListener('resize', _onResize)
  if (pageScrollRaf) {
    window.cancelAnimationFrame(pageScrollRaf)
    pageScrollRaf = 0
  }
  unbindSelectionHeaderScroll()
  window.removeEventListener('popstate', handleSelectionPopState)
  unbindAndroidBackButton()
  document.body.classList.remove('selection-active')
  rememberCurrentScrollPosition()
})

onBeforeRouteLeave(() => {
  saveScrollPosition(true, 'home:onBeforeRouteLeave')
})

const { goodsList, totalValue, totalQuantity, goodsById } = useHomeGoodsList(store, sortMode, sortDirection)
const isAndroid = /Android/i.test(navigator.userAgent || '')
const lowCores = navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4
const lowMem = navigator.deviceMemory && navigator.deviceMemory <= 4
const isLowPerfDevice = isAndroid || lowCores || lowMem
const densityFlip = createDensityFlip({
  getContainer: () => goodsListRef.value,
  getItems: (container) => {
    if (!container) return []
    const children = container.children
    const total = children.length
    if (!total) return []
    const rowHeight = ROW_HEIGHT_MAP[displayDensity.value] || 272
    const cols = getResponsiveCols(displayDensity.value)
    const scrollTop = getDensityScrollMetrics().scrollTop
    const viewportHeight = getFlipViewportHeight()
    const relativeScrollTop = Math.max(0, scrollTop - getContainerScrollOffset(container))
    const startRow = Math.max(0, Math.floor(relativeScrollTop / rowHeight) - 1)
    const endRow = Math.ceil((relativeScrollTop + viewportHeight) / rowHeight) + 1
    const startIndex = Math.max(0, startRow * cols)
    const endIndex = Math.min(total, endRow * cols)
    const items = []
    for (let i = startIndex; i < endIndex; i += 1) {
      const el = children[i]
      if (el) items.push(el)
    }
    return items
  },
  getViewport: () => getFlipViewportRect(),
  maxItems: () => (isLowPerfDevice ? 14 : goodsList.value.length > 220 ? 24 : 40),
  overscan: () => (isLowPerfDevice ? 40 : 80),
  duration: () => (isLowPerfDevice ? 200 : 260),
  fade: () => (isLowPerfDevice ? 0.985 : 0.97),
  scale: () => (isLowPerfDevice ? 0.995 : 0.99),
  debugLabel: 'home'
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
  timelineUnknownItemIds,
  visibleTimelineYearGroups,
  timelineUnknown,
  showVisibleTimelineUnknown
} = useHomeTimeline({
  goodsList,
  displayDensity,
  visibleTimelineMonthCount,
  getInitialVisibleTimelineMonths
})
const goodsGridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${getResponsiveCols(displayDensity.value)}, minmax(0, 1fr))`
}))
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
    syncVisibleGoodsCount(readScrollTop())
    syncVisibleTimelineMonthCount(readScrollTop())
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
  saveScrollPosition(true, `home:openDetail:${id}`)
  router.push(`/detail/${id}`)
}

function scrollToTop() {
  scrollToTopAnimated(getScrollEl, 260, () => {
    updateScrollTopButtonVisibility()
    rememberCurrentScrollPosition()
  // Use the currently marked source instead of forcing window/element.
  // Forcing one side previously broke either restore or the scroll-top button.
  }, getActiveScrollSource())
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
  expandedTimelineItemId.value ? goodsById.value.get(expandedTimelineItemId.value) ?? null : null
)
const expandedSectionKey = computed(() => {
  if (!expandedItem.value) return ''

  const yearMonth = String(expandedItem.value.acquiredAt || '').slice(0, 7)
  return /^\d{4}-\d{2}$/.test(yearMonth) ? yearMonth : TIMELINE_UNKNOWN_SECTION_KEY
})

function toggleTimelineItem(id) {
  toggleExpandedTimelineItem(id)
}

function setDisplayDensityWithFlip(mode) {
  if (displayDensity.value === mode) return
  if (DENSITY_DEBUG) {
    const payload = {
      from: displayDensity.value,
      to: mode,
      scrollSource: getActiveScrollSource(),
      flipScrollSource: getDensityScrollSource(),
      mountedCards: goodsListRef.value?.querySelectorAll?.('[data-scroll-anchor="goods-card"]')?.length ?? 0,
      visibleGoodsCount: visibleGoodsCount.value,
      totalGoods: goodsList.value.length
    }
    console.log('[densitySwitch:home] before', payload)
    try {
      const store = Array.isArray(window.__densityDebug) ? window.__densityDebug : []
      store.push({
        at: new Date().toISOString(),
        source: '[densitySwitch:home]',
        phase: 'before',
        ...payload
      })
      window.__densityDebug = store
    } catch {}
  }
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
}

.home-page--restoring {
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


