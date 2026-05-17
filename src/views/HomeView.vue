<template>
  <div
    class="page home-page"
    :class="{ 'home-page--restoring': !homeDisplayReady, 'home-page--top-jump': topJumpMasking }"
    :style="HOME_MOTION_CSS_VARS"
  >
    <main ref="pageBodyRef" class="page-body">
      <section v-if="!selectionMode" class="hero-section">
        <div class="hero-copy">
          <p class="hero-label">Goods Archive</p>
          <h1 class="hero-title">收藏库</h1>
        </div>

        <div class="hero-actions">
          <button
            v-if="!searchModeActive"
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
            v-if="!selectionMode"
            model-value="goods"
            @update:model-value="switchHomeTopTab"
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

      <Transition name="search-mode-panel" mode="out-in" @after-leave="handleSearchModePanelAfterLeave">
        <GoodsSearchPanel
          v-if="searchModeActive && !selectionMode"
          :active="searchModeActive"
          v-model:advanced-expanded="advancedExpanded"
          :filters="searchFilters"
          :source-list="searchSourceList"
          :storage-location-tree-source="presets.storageLocationTree"
          scope-label="收藏库"
          @close="closeSearchMode"
          @reset="resetSearchFilters"
        />
      </Transition>

      <section v-if="!searchModeActive && !searchModeTransitioning" class="summary-section">
        <SummaryCard :total-value="totalValue" :total-count="goodsList.length" :trend-items="goodsList" trend-date-field="acquiredAt" />
      </section>

      <HomeGoodsToolbar
        v-if="!searchModeActive && !searchModeTransitioning"
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
        <GoodsListSkeleton v-if="!store.isReady" key="skeleton" />

        <GoodsCardGridSection
          v-else-if="displayedGoodsList.length > 0 && effectiveDisplayDensity !== 'timeline'"
          key="grid"
          ref="goodsGridSectionRef"
          :items="visibleGoodsList"
          :density="effectiveDisplayDensity"
          :grid-style="goodsGridStyle"
          :index-offset="visibleGoodsStartIndex"
          :before-spacer-height="visibleGoodsHeadSpacerHeight"
          :after-spacer-height="visibleGoodsTailSpacerHeight"
          :transitioning="isDensityAnimating"
          :is-sort-animating="isSortAnimating"
          :add-motion-snapshot="addMotionSnapshot"
          :add-motion-request="addMotionRequest"
          :low-perf-motion="isLowPerfDevice"
          :auto-play-motion="false"
          :selection-mode="selectionMode"
          :selected-ids="selectedIds"
          @long-press="enterSelectionMode"
          @toggle-select="toggleSelect"
          @open-detail="openDetail"
        />

        <section
          v-else-if="displayedGoodsList.length > 0"
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
            :icon="searchModeActive ? '🔍' : '✦'"
            :title="searchModeActive ? '没有匹配的收藏' : '还没有收藏记录'"
            :description="searchModeActive ? '试试更短的关键词，或者切换搜索范围。' : '从徽章、手办到卡片，把每一件喜欢的谷子收进这里。'"
            :action-text="searchModeActive ? '关闭搜索' : '添加第一件'"
            @action="searchModeActive ? closeSearchMode() : goToAdd()"
          />
        </section>
      </Transition>
    </main>

    <Teleport to="body">
      <ScrollTopButton
        :show="showScrollTopButton && isHomeActive && !selectionMode"
        @click="scrollToTop"
      />
      <button v-if="!selectionMode && isHomeActive && !searchModeActive" class="fab" type="button" aria-label="添加" @click="showAddSheet = true">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 5V19" />
          <path d="M5 12H19" />
        </svg>
      </button>
    </Teleport>

    <AddMethodSheet
      v-model="showAddSheet"
      @manual="goToAdd"
      @batch-add="handleBatchAdd"
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
      @share="batchShare"
      @edit="batchEdit"
    />

    <ShareSheet :show="showShareSheet" :goods-items="selectedGoodsItems" @close="showShareSheet = false" />

    <Teleport to="body">
      <div v-if="addMotionOverlay" class="add-motion-layer" aria-hidden="true">
        <div class="add-motion-ghost" :class="{ 'add-motion-ghost--active': addMotionOverlay.phase === 'end' }" :style="addMotionGhostStyle">
          <div class="add-motion-ghost__cover">
            <img
              v-if="addMotionOverlay.item.coverImage"
              :src="addMotionOverlay.item.coverImage"
              :alt="addMotionOverlay.item.name"
              class="add-motion-ghost__img"
            />
            <span v-else class="add-motion-ghost__fallback">{{ (addMotionOverlay.item.name || '').trim().charAt(0).toUpperCase() || '谷' }}</span>
          </div>
          <div class="add-motion-ghost__body">
            <p class="add-motion-ghost__name">{{ addMotionOverlay.item.name }}</p>
            <p class="add-motion-ghost__meta">新谷子已加入</p>
          </div>
        </div>
      </div>
    </Teleport>

  </div>
</template>
<script setup>
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { useGoodsStore } from '@/stores/goods'
import { usePresetsStore } from '@/stores/presets'
import { preloadImages, setImagePreloadPaused } from '@/utils/image/cache'
import { useGoodsSelection } from '@/composables/goods/useGoodsSelection'
import { useHomePreferences } from '@/composables/home/useHomePreferences'
import { useHomeScrollRestore } from '@/composables/scroll/useHomeScrollRestore'
import { useHomeTimeline } from '@/composables/home/useHomeTimeline'
import { useHomeGoodsList } from '@/composables/home/useHomeGoodsList'
import { useDensityGridViewport } from '@/composables/home/useDensityGridViewport'
import { useGoodsGridDensityFlip } from '@/composables/home/useGoodsGridDensityFlip'
import { useGoodsListCore } from '@/composables/goods/useGoodsListCore'
import { addAndroidBackButtonListener } from '@/utils/platform/androidBackButton'
import { HOME_MOTION_CSS_VARS } from '@/constants/homeMotion'
import { HOME_SORT_OPTIONS } from '@/utils/goods/homeSort'
import {
  GOODS_FILTER_BOOLEAN_OPTIONS,
  GOODS_FILTER_COLLECT_STATUS_OPTIONS,
  GOODS_FILTER_DATE_PRESET_OPTIONS,
  GOODS_FILTER_SORT_OPTIONS,
  GOODS_FILTER_SPECIAL_VALUES,
  applyGoodsFilters,
  countActiveGoodsFilters,
  createDefaultGoodsFilters,
  normalizeGoodsFilterConditions
} from '@/utils/goods/filters'
import { buildStorageLocationPath, normalizeStorageLocationValue, splitStorageLocationPath } from '@/utils/storageLocations'
import { clearRouteTransitionFallback, runWithRouteTransition, setPendingDetailReturnPath, clearPendingDetailTransitionKind } from '@/utils/routeTransition'
import { getHeroBackDurationMs, getHeroBackPendingTtlMs, hasPendingGoodsHeroBack, isGoodsHeroAnimating, prepareGoodsHeroForward, playGoodsHeroBack } from '@/utils/platform/nativeGoodsHeroTransition'
import HomeSelectionHeader from '@/components/home/HomeSelectionHeader.vue'
import HomeGoodsToolbar from '@/components/home/HomeGoodsToolbar.vue'
import SummaryCard from '@/components/common/SummaryCard.vue'
import GoodsCardGridSection from '@/components/goods/GoodsCardGridSection.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import AddMethodSheet from '@/components/goods/AddMethodSheet.vue'
import { pickLinkedLocalImages } from '@/utils/image/localImage'
import ScrollTopButton from '@/components/common/ScrollTopButton.vue'
import GoodsListSkeleton from '@/components/common/GoodsListSkeleton.vue'
import GoodsBatchEditSheet from '@/components/goods/GoodsBatchEditSheet.vue'
import GoodsSelectionActionBar from '@/components/goods/GoodsSelectionActionBar.vue'
import ShareSheet from '@/components/goods/ShareSheet.vue'
import GoodsDeleteConfirm from '@/components/goods/GoodsDeleteConfirm.vue'
import HomeTimelineSection from '@/components/home/HomeTimelineSection.vue'
import HomeViewModeSwitch from '@/components/home/HomeViewModeSwitch.vue'
import GoodsSearchPanel from '@/components/goods/GoodsSearchPanel.vue'
import { scrollToTopAnimated } from '@/utils/scrollToTopAnimated'

defineOptions({ name: 'HomeView' })

const store = useGoodsStore()
const presets = usePresetsStore()
const pageBodyRef = ref(null)
const goodsGridSectionRef = ref(null)
const batchEditSheetRef = ref(null)
const addMotionSnapshot = ref(null)
const addMotionRequest = ref(null)
const addMotionOverlay = ref(null)
const searchModeActive = ref(false)
const searchModeTransitioning = ref(false)
const searchScope = ref('collection')
const searchFilters = reactive(createDefaultGoodsFilters({ hasImage: 'any' }))
const advancedExpanded = ref(false)
const showAllCharacterOptions = ref(false)
const searchModeHistoryKey = 'homeSearchState'
let homeSearchRestoreContext = null
const COLLECTION_TAB_STORAGE_KEY = 'goods_collection_tab_v1'
const COLLECTION_TAB_EVENT = 'goods-app:collection-tab-change'
const ADD_MOTION_SNAPSHOT_KEY = 'goods-app:add-motion-snapshot-v1'
const ADD_MOTION_REQUEST_KEY = 'goods-app:add-motion-request-v1'
let addMotionRaf = 0
let addMotionOverlayRaf = 0
let addMotionOverlayClearTimer = 0
let imagePreloadResumeTimer = 0
let lastImageScrollTop = 0
let lastImageScrollAt = 0
let searchModeSyncTimer = 0

const addMotionGhostStyle = computed(() => {
  const overlay = addMotionOverlay.value
  if (!overlay) return {}

  const rect = overlay.phase === 'end' ? overlay.endRect : overlay.startRect
  const width = Math.max(56, Math.round(rect?.width || 0))
  const height = Math.max(56, Math.round(rect?.height || 0))
  return {
    left: `${Math.round(rect?.left || 0)}px`,
    top: `${Math.round(rect?.top || 0)}px`,
    width: `${width}px`,
    height: `${height}px`,
    opacity: overlay.phase === 'end' ? '0' : '1',
    transform: overlay.phase === 'end' ? 'translate3d(0, 0, 0) scale(1)' : 'translate3d(0, 0, 0) scale(0.92)'
  }
})

function persistCollectionTab(tab) {
  const normalizedTab = tab === 'wishlist' || tab === 'stats' ? tab : 'goods'
  localStorage.setItem(COLLECTION_TAB_STORAGE_KEY, normalizedTab)
  window.dispatchEvent(new CustomEvent(COLLECTION_TAB_EVENT, {
    detail: { tab: normalizedTab }
  }))
}

function normalizeSearchFilters(input = {}) {
  return normalizeGoodsFilterConditions({
    ...input,
    hasImage: 'any'
  })
}

function buildOptionList(values, specialOption = null) {
  const base = [...new Set(values.map((item) => String(item || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
    .map((value) => ({ label: value, value }))

  return specialOption ? [specialOption, ...base] : base
}

function toggleFilterValue(key, value) {
  const current = Array.isArray(searchFilters[key]) ? [...searchFilters[key]] : []
  searchFilters[key] = current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value]
}

function resetSearchFilters() {
  assignSearchFilters(createDefaultGoodsFilters({ hasImage: 'any' }))
  persistSearchState()
}

function toggleSearchAdvanced() {
  advancedExpanded.value = !advancedExpanded.value
  persistSearchState()
}

function assignSearchFilters(nextFilters) {
  const normalized = normalizeSearchFilters(nextFilters)
  Object.assign(searchFilters, normalized)
}

function serializeSearchFilters() {
  return {
    keyword: searchFilters.keyword,
    categories: searchFilters.categories.slice(),
    ips: searchFilters.ips.slice(),
    characters: searchFilters.characters.slice(),
    storageLocations: searchFilters.storageLocations.slice(),
    priceMin: searchFilters.priceMin,
    priceMax: searchFilters.priceMax,
    acquiredPreset: searchFilters.acquiredPreset,
    acquiredFrom: searchFilters.acquiredFrom,
    acquiredTo: searchFilters.acquiredTo,
    hasImage: searchFilters.hasImage,
    hasNote: searchFilters.hasNote,
    collectStatuses: searchFilters.collectStatuses.slice(),
    sortBy: searchFilters.sortBy
  }
}

function buildSearchState() {
  return {
    scope: searchScope.value,
    active: searchModeActive.value,
    advancedExpanded: advancedExpanded.value,
    filters: serializeSearchFilters()
  }
}

function persistSearchState() {
  if (typeof window === 'undefined') return
  const nextState = { ...(window.history.state || {}) }

  if (!searchModeActive.value) {
    delete nextState[searchModeHistoryKey]
    window.history.replaceState(nextState, '')
    return
  }

  nextState[searchModeHistoryKey] = buildSearchState()
  window.history.replaceState(nextState, '')
}

function restoreSearchStateFromHistory() {
  const state = window.history.state?.[searchModeHistoryKey]
  if (!state || typeof state !== 'object') return false

  // KeepAlive already preserves live state; only restore on fresh mount
  if (searchModeActive.value) return true

  searchScope.value = state.scope === 'wishlist' ? 'wishlist' : 'collection'
  searchModeActive.value = state.active !== false
  advancedExpanded.value = state.advancedExpanded === true

  if (state.filters && typeof state.filters === 'object') {
    assignSearchFilters(state.filters)
  } else {
    resetSearchFilters()
  }

  return true
}

function captureHomeSearchRestoreContext() {
  if (!searchModeActive.value) {
    homeSearchRestoreContext = null
    return
  }

  homeSearchRestoreContext = {
    active: true,
    scope: searchScope.value,
    advancedExpanded: advancedExpanded.value,
    filters: serializeSearchFilters()
  }
}

function restoreHomeSearchStateFromContext() {
  if (!homeSearchRestoreContext || typeof homeSearchRestoreContext !== 'object') return false

  searchScope.value = homeSearchRestoreContext.scope === 'wishlist' ? 'wishlist' : 'collection'
  searchModeActive.value = homeSearchRestoreContext.active !== false
  advancedExpanded.value = homeSearchRestoreContext.advancedExpanded === true

  if (homeSearchRestoreContext.filters && typeof homeSearchRestoreContext.filters === 'object') {
    assignSearchFilters(homeSearchRestoreContext.filters)
  }

  return true
}

function applySearchModeState(scope = 'collection', options = {}) {
  const { resetFilters = true } = options
  searchScope.value = scope === 'wishlist' ? 'wishlist' : 'collection'
  if (resetFilters) {
    resetSearchFilters()
  }
  searchModeActive.value = true
  searchModeTransitioning.value = false
  advancedExpanded.value = false
}

function syncSearchModeFromRoute() {
  if (String(route.query.mode || '') === 'search') {
    const nextScope = route.query.scope === 'wishlist' ? 'wishlist' : 'collection'
    if (!searchModeActive.value) {
      applySearchModeState(nextScope, {
        resetFilters: false
      })
    } else {
      searchScope.value = nextScope
    }
    return true
  }

  if (searchModeActive.value) {
    searchModeTransitioning.value = true
    searchModeActive.value = false
    advancedExpanded.value = false
  }

  return false
}

function updateSearchModeRoute(active) {
  if (typeof window === 'undefined') return

  if (searchModeSyncTimer) {
    window.clearTimeout(searchModeSyncTimer)
    searchModeSyncTimer = 0
  }

  searchModeSyncTimer = window.setTimeout(() => {
    searchModeSyncTimer = 0
    const nextQuery = { ...route.query }

    if (active) {
      nextQuery.mode = 'search'
      if (searchScope.value === 'wishlist') {
        nextQuery.scope = 'wishlist'
      } else {
        delete nextQuery.scope
      }
    } else {
      delete nextQuery.mode
      delete nextQuery.scope
    }

    router.replace({ path: '/home', query: nextQuery })
      .then(() => persistSearchState())
      .catch(() => {})
  }, 0)
}

function openSearchMode(scope = 'collection') {
  homeSearchRestoreContext = null
  applySearchModeState(scope)
  updateSearchModeRoute(true)
}

async function closeSearchMode(options = {}) {
  const { immediate = false, syncRoute = true } = options
  if (advancedExpanded.value) {
    advancedExpanded.value = false
    if (!immediate) {
      await nextTick()
    }
  }

  searchModeTransitioning.value = true
  searchModeActive.value = false
  resetSearchFilters()
  homeSearchRestoreContext = null
  if (syncRoute) {
    updateSearchModeRoute(false)
  }
  const el = getScrollEl()
  if (el) el.scrollTop = 0
  window.scrollTo({ top: 0, behavior: 'instant' })
}

function toggleSearchMode() {
  if (searchModeActive.value) {
    closeSearchMode()
    return
  }

  openSearchMode('collection')
}

function handleSearchModePanelAfterLeave() {
  searchModeTransitioning.value = false
}

const TIMELINE_UNKNOWN_SECTION_KEY = 'timeline:unknown'
const SELECTION_HEADER_HEIGHT = 64
// 视口宽度，用于响应式列数计算
const windowWidth = ref(window.innerWidth)
const _onResize = () => { windowWidth.value = window.innerWidth }
const selectionHeaderTop = ref(0)
const INITIAL_RENDER_ROWS = 6
const GOODS_GRID_ROW_GAP = 12
const GOODS_GRID_OVERSCAN_ROWS = 4
const GOODS_GRID_OVERSCAN_ROWS_WIDE = 3
const GOODS_GRID_MAX_RENDER_CARDS = 96
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
const HOME_BACK_HERO_GUARD_TIMEOUT_MS = Math.max(320, getHeroBackPendingTtlMs() + 120)
let removeAndroidBackListener = null
let selectionHeaderScrollBound = false
let pageScrollRaf = 0
let elementScrollHandler = null
let windowScrollHandler = null
let mountBootstrapSession = 0
let goodsBackHeroRetryRaf = 0
let homeBackHeroDeferredRestoreTimer = 0
let isRouteLeaving = false

// 添加方式面板
const showAddSheet = ref(false)

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
  clearStoredScrollState,
  resetStoredScrollOnReload,
  cancelPendingRestore,
  isRestoring
} = useHomeScrollRestore(pageBodyRef)

const homeDisplayReady = ref(true)
const showScrollTopButton = ref(false)
const topJumpMasking = ref(false)
let topJumpMaskTimer = 0
let lastDetailNavigationTime = 0

// 添加方式面板
const router = useRouter()
const route = useRoute()

async function switchHomeTopTab(nextMode) {
  const SUB_ORDER = ['/home', '/wishlist', '/leaderboard/characters']
  const fi = SUB_ORDER.indexOf(route.path)
  const toPath = nextMode === 'wishlist' ? '/wishlist' : nextMode === 'stats' ? '/leaderboard/characters' : '/home'
  const ti = SUB_ORDER.indexOf(toPath)
  const direction = (fi !== -1 && ti !== -1 && ti < fi) ? 'forward' : 'back'

  if (searchModeActive.value) {
    await closeSearchMode({ immediate: true, syncRoute: false })
  }

  if (nextMode === 'wishlist') {
    persistCollectionTab('wishlist')
    saveScrollPosition(true, 'home:navigateToWishlist')
    runWithRouteTransition(
      () => router.push('/wishlist'),
      {
        direction,
        preferFallback: true
      }
    )
    return
  }

  if (nextMode === 'stats') {
    persistCollectionTab('stats')
    saveScrollPosition(true, 'home:navigateToStats')
    runWithRouteTransition(
      () => router.push('/leaderboard/characters'),
      {
        direction,
        preferFallback: true
      }
    )
    return
  }

  persistCollectionTab('goods')
}

function handleHeroSearch() {
  toggleSearchMode()
}

function navigateFromAddSheet(path, reason) {
  saveScrollPosition(true, reason)
  homeDisplayReady.value = false
  showAddSheet.value = false
  runWithRouteTransition(
    () => router.push(path).catch(() => {
      homeDisplayReady.value = true
    }),
    { direction: 'forward', fallbackTransitionKind: 'detail-fade' }
  )
}

function readSessionJson(key, { remove = false } = {}) {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    if (remove) sessionStorage.removeItem(key)
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function writeSessionJson(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore
  }
}

function clearAddMotionOverlay() {
  if (addMotionOverlayRaf) {
    window.cancelAnimationFrame(addMotionOverlayRaf)
    addMotionOverlayRaf = 0
  }
  if (addMotionOverlayClearTimer) {
    window.clearTimeout(addMotionOverlayClearTimer)
    addMotionOverlayClearTimer = 0
  }
  addMotionOverlay.value = null
}

function resolveAddMotionTargetRect(id) {
  const normalized = String(id || '')
  if (!normalized) return null
  const escaped = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(normalized)
    : normalized.replace(/"/g, '\\"')
  const rootEl = getScrollEl() || pageBodyRef.value || document
  const target = rootEl?.querySelector?.(`[data-goods-id="${escaped}"]`) || null
  const rect = target?.getBoundingClientRect?.()
  if (!rect || !rect.width || !rect.height) return null
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height
  }
}

function getFallbackMotionTargetRect() {
  const viewportWidth = window.innerWidth || 360
  const viewportHeight = window.innerHeight || 640
  return {
    left: Math.max(16, Math.min(viewportWidth - 160, viewportWidth * 0.12)),
    top: Math.max(120, Math.min(viewportHeight - 220, viewportHeight * 0.34)),
    width: Math.min(320, viewportWidth - 32),
    height: 92
  }
}

function getAddMotionRect(payload) {
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

function createAddMotionOverlay(payload) {
  const itemId = String(payload?.id || '')
  const item = goodsById.value.get(itemId)
  if (!item) return false

  const startRect = getAddMotionRect(payload)
  const endRect = resolveAddMotionTargetRect(itemId) || getFallbackMotionTargetRect()

  clearAddMotionOverlay()
  addMotionOverlay.value = {
    token: String(payload?.token || ''),
    item,
    phase: 'start',
    startRect,
    endRect
  }

  addMotionOverlayRaf = window.requestAnimationFrame(() => {
    addMotionOverlayRaf = 0
    if (!addMotionOverlay.value || addMotionOverlay.value.token !== String(payload?.token || '')) return
    addMotionOverlay.value = {
      ...addMotionOverlay.value,
      phase: 'end'
    }
    addMotionOverlayClearTimer = window.setTimeout(() => {
      clearAddMotionOverlay()
    }, 560)
  })

  return true
}

function captureAddMotionSnapshot() {
  if (isLowPerfDevice) return
  const cards = goodsGridSectionRef.value?.captureVisibleItemRects?.(40) || []
  if (!cards.length) return

  writeSessionJson(ADD_MOTION_SNAPSHOT_KEY, {
    token: Date.now(),
    cards
  })
}

function syncAddMotionContext() {
  if (addMotionRaf) {
    window.cancelAnimationFrame(addMotionRaf)
    addMotionRaf = 0
  }

  const nextSnapshot = readSessionJson(ADD_MOTION_SNAPSHOT_KEY) || null
  const nextRequest = readSessionJson(ADD_MOTION_REQUEST_KEY, { remove: true }) || null

  addMotionSnapshot.value = nextSnapshot
  addMotionRequest.value = nextRequest
  if (!nextRequest) {
    clearAddMotionOverlay()
    return
  }

  window.requestAnimationFrame(() => {
    createAddMotionOverlay(nextRequest)
    goodsGridSectionRef.value?.playAddMotion?.(nextRequest)
  })
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

async function handleBatchAdd() {
  showAddSheet.value = false
  const images = await pickLinkedLocalImages()
  if (!images.length) return
  saveScrollPosition(true, 'home:handleBatchAdd')
  homeDisplayReady.value = false
  runWithRouteTransition(
    () => router.push({ name: 'batch-add', state: { batchImages: JSON.stringify(images) } }).catch(() => {
      homeDisplayReady.value = true
    }),
    { direction: 'forward', fallbackTransitionKind: 'detail-fade' }
  )
}

function goToAdd() {
  captureAddMotionSnapshot()
  navigateFromAddSheet('/add', 'home:goToAdd')
}

async function refresh() {
  await store.refreshList()
}

function getInitialVisibleCount() {
  return Math.max(getResponsiveCols(displayDensity.value) * INITIAL_RENDER_ROWS, 24)
}

function resolveGoodsViewportHeight(options = {}) {
  const { useFlipViewport = false, viewportHeight = 0 } = options
  if (Number.isFinite(viewportHeight) && viewportHeight > 0) return viewportHeight
  return useFlipViewport
    ? getFlipViewportHeight()
    : (getScrollEl()?.clientHeight || window.innerHeight || 800)
}

function syncVirtualGoodsViewport(scrollTop = 0, options = {}) {
  if (displayDensity.value === 'timeline') {
    currentGoodsScrollTop.value = Math.max(0, Number(scrollTop) || 0)
    currentGoodsViewportHeight.value = resolveGoodsViewportHeight(options)
    visibleGoodsStartIndex.value = 0
    visibleGoodsRenderCount.value = goodsList.value.length
    return
  }

  const normalizedTop = Math.max(0, Number(scrollTop) || 0)
  const viewportHeight = resolveGoodsViewportHeight(options)
  const cols = getResponsiveCols(effectiveDisplayDensity.value)
  const rowHeight = ROW_HEIGHT_MAP[effectiveDisplayDensity.value] || 272
  const rowSpan = rowHeight + GOODS_GRID_ROW_GAP
  const baseOverscan = cols >= 5 ? GOODS_GRID_OVERSCAN_ROWS_WIDE : GOODS_GRID_OVERSCAN_ROWS
  const overscanRows = searchModeActive.value ? Math.max(baseOverscan, 10) : baseOverscan
  const maxRenderCards = GOODS_GRID_MAX_RENDER_CARDS
  const viewportRows = Math.max(1, Math.ceil(Math.max(viewportHeight, rowHeight) / rowSpan))
  const startRow = Math.max(0, Math.floor(normalizedTop / rowSpan) - overscanRows)
  const renderRows = Math.max(INITIAL_RENDER_ROWS, viewportRows + overscanRows * 2)
  const startIndex = Math.min(displayedGoodsList.value.length, startRow * cols)
  const remainingItems = Math.max(0, displayedGoodsList.value.length - startIndex)
  const renderCount = Math.min(
    remainingItems,
    Math.min(
      maxRenderCards,
      Math.max(cols * 4, renderRows * cols)
    )
  )

  currentGoodsScrollTop.value = normalizedTop
  currentGoodsViewportHeight.value = viewportHeight
  visibleGoodsStartIndex.value = startIndex
  visibleGoodsRenderCount.value = renderCount
}

function syncVisibleGoodsCount(scrollTop = 0, options = {}) {
  if (effectiveDisplayDensity.value === 'timeline') return
  syncVirtualGoodsViewport(scrollTop, options)
}

function syncVisibleGoodsCountForActivatedRestore(scrollTop = 0) {
  if (effectiveDisplayDensity.value === 'timeline') return
  const viewportHeight = getFlipViewportHeight()
  const preloadTargetTop = scrollTop + viewportHeight * 2.5
  syncVirtualGoodsViewport(preloadTargetTop, { useFlipViewport: true, viewportHeight })
}

function maybeLoadMoreGoods() {
  if (effectiveDisplayDensity.value === 'timeline') return
  syncVisibleGoodsCount(readScrollTop())
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
  const rowHeight = ROW_HEIGHT_MAP[displayDensity.value] || 272
  const rowSpan = rowHeight + GOODS_GRID_ROW_GAP
  const overscanRows = cols >= 5 ? GOODS_GRID_OVERSCAN_ROWS_WIDE : GOODS_GRID_OVERSCAN_ROWS
  const anchorRow = Math.floor(anchorIndex / cols)
  const restoreTop = Math.max(0, anchorRow * rowSpan - overscanRows * rowSpan)
  syncVisibleGoodsCount(restoreTop, { useFlipViewport: true })
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
  if (isRestoring.value) return
  if (isGoodsHeroAnimating()) return
  if (pageScrollRaf) return
  pageScrollRaf = window.requestAnimationFrame(() => {
    pageScrollRaf = 0
    if (isRouteLeaving) return
    if (isRestoring.value) return
    if (isGoodsHeroAnimating()) return
    updateImagePreloadThrottle(readScrollTop())
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

function clearImagePreloadThrottleTimer() {
  if (!imagePreloadResumeTimer) return
  window.clearTimeout(imagePreloadResumeTimer)
  imagePreloadResumeTimer = 0
}

function updateImagePreloadThrottle(scrollTop = 0) {
  if (!isAndroidNative) return

  const now = typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
  const normalizedTop = Math.max(0, Number(scrollTop) || 0)

  if (!lastImageScrollAt) {
    lastImageScrollTop = normalizedTop
    lastImageScrollAt = now
    return
  }

  const delta = Math.abs(normalizedTop - lastImageScrollTop)
  const elapsed = Math.max(1, now - lastImageScrollAt)
  const velocity = delta / elapsed
  const isFlinging = delta >= 160 || velocity >= 2.2

  lastImageScrollTop = normalizedTop
  lastImageScrollAt = now

  setImagePreloadPaused(isFlinging)
  clearImagePreloadThrottleTimer()
  imagePreloadResumeTimer = window.setTimeout(() => {
    setImagePreloadPaused(false)
    imagePreloadResumeTimer = 0
  }, isFlinging ? 160 : 96)
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
    return
  }

  if (searchModeActive.value) {
    closeSearchMode()
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
  const didResetOnReload = resetStoredScrollOnReload()
  if (sessionId !== mountBootstrapSession) return
  if (didResetOnReload) {
    clearDisplayedScrollPosition()
  } else if (!hasPendingRestore()) {
    // 冷启动时不复用上一次会话的滚动位置，避免 app 重启后直接回到旧的底部位置。
    clearStoredScrollState()
    clearDisplayedScrollPosition()
  }
  homeDisplayReady.value = true
  restoreHomePreferences()
  if (!restoreSearchStateFromHistory()) {
    syncSearchModeFromRoute()
  }
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
  syncAddMotionContext()
  window.requestAnimationFrame(() => {
    tryPlayNativeGoodsBackHero()
  })
  updateScrollTopButtonVisibility()
  window.addEventListener('popstate', handleSelectionPopState)
  bindAndroidBackButton()
})

onActivated(async () => {
  isRouteLeaving = false
  isHomeActive.value = true
  cancelGoodsBackHeroRetry()
  clearHomeBackHeroDeferredRestoreTimer()
  if (shouldMaskHomeDisplay()) {
    homeDisplayReady.value = false
  }
  const storedState = getStoredScrollState()
  if (storedState?.source) {
    markScrollSource(storedState.source)
  }
  if (!restoreHomeSearchStateFromContext() && !restoreSearchStateFromHistory()) {
    syncSearchModeFromRoute()
  }
  deferActivatedRestoreAfterGoodsBackHero(() => {
    void (async () => {
      await restoreActivatedScrollPosition(
        syncVisibleGoodsCountForActivatedRestore,
        syncVisibleTimelineMonthCountForActivatedRestore,
        prepareRestoreState
      )
      await nextTick()
      syncAddMotionContext()
      homeDisplayReady.value = true
      scheduleGoodsBackHeroRetry()
      bindSelectionHeaderScroll()
      updateSelectionHeaderPosition()
      updateScrollTopButtonVisibility()
      bindAndroidBackButton()
    })()
  })
})

watch(
  () => [route.query.mode, route.query.scope],
  () => {
    if (!isHomeActive.value) return
    syncSearchModeFromRoute()
  }
)

onDeactivated(() => {
  isHomeActive.value = false
  mountBootstrapSession += 1
  homeSearchRestoreContext = null
  if (searchModeSyncTimer) {
    window.clearTimeout(searchModeSyncTimer)
    searchModeSyncTimer = 0
  }
  cancelGoodsBackHeroRetry()
  clearHomeBackHeroDeferredRestoreTimer()
  clearImagePreloadThrottleTimer()
  setImagePreloadPaused(false)
  cancelPendingRestore()
  if (!hasPendingRestore() && !isRouteLeaving) {
    rememberCurrentScrollPosition()
  }
  exitSelectionModeQuiet()
  unbindSelectionHeaderScroll()
  unbindAndroidBackButton()
})

onBeforeUnmount(() => {
  if (addMotionRaf) {
    window.cancelAnimationFrame(addMotionRaf)
    addMotionRaf = 0
  }
  if (searchModeSyncTimer) {
    window.clearTimeout(searchModeSyncTimer)
    searchModeSyncTimer = 0
  }
  clearAddMotionOverlay()
  cancelGoodsBackHeroRetry()
  clearHomeBackHeroDeferredRestoreTimer()
  clearImagePreloadThrottleTimer()
  setImagePreloadPaused(false)
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
  persistSearchState()
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

const searchSourceList = computed(() => (
  searchScope.value === 'wishlist' ? store.wishlistViewList : store.collectionViewList
))

const categoryOptions = computed(() => buildOptionList(
  searchSourceList.value.map((item) => item.category),
  searchSourceList.value.some((item) => !String(item.category || '').trim())
    ? { label: '未分类', value: GOODS_FILTER_SPECIAL_VALUES.uncategorized }
    : null
))

const ipOptions = computed(() => buildOptionList(
  searchSourceList.value.map((item) => item.ip),
  searchSourceList.value.some((item) => !String(item.ip || '').trim())
    ? { label: '未设置 IP', value: GOODS_FILTER_SPECIAL_VALUES.noIp }
    : null
))

const characterSourceList = computed(() => {
  if (searchFilters.ips.length === 0) return searchSourceList.value

  return searchSourceList.value.filter((item) => {
    const itemIp = String(item.ip || '').trim()
    return searchFilters.ips.some((value) => (
      value === GOODS_FILTER_SPECIAL_VALUES.noIp ? !itemIp : value === itemIp
    ))
  })
})

const characterOptions = computed(() => buildOptionList(
  characterSourceList.value.flatMap((item) => (Array.isArray(item.characters) ? item.characters : [])),
  characterSourceList.value.some((item) => !Array.isArray(item.characters) || item.characters.length === 0)
    ? { label: '未设置角色', value: GOODS_FILTER_SPECIAL_VALUES.noCharacter }
    : null
))

const hasCollapsedCharacterOptions = computed(() => (
  characterOptions.value.some((option) => option.value !== GOODS_FILTER_SPECIAL_VALUES.noCharacter)
))

const visibleCharacterOptions = computed(() => {
  if (showAllCharacterOptions.value) return characterOptions.value

  return characterOptions.value.filter((option) => option.value === GOODS_FILTER_SPECIAL_VALUES.noCharacter)
})

watch(
  () => searchFilters.characters.slice(),
  (selectedValues) => {
    if (selectedValues.some((value) => value !== GOODS_FILTER_SPECIAL_VALUES.noCharacter)) {
      showAllCharacterOptions.value = true
    }
  },
  { immediate: true }
)

watch(
  () => characterOptions.value.map((option) => option.value),
  (nextOptions) => {
    const allowedValues = new Set(nextOptions)
    const nextCharacters = searchFilters.characters.filter((value) => allowedValues.has(value))

    if (nextCharacters.length !== searchFilters.characters.length) {
      searchFilters.characters = nextCharacters
    }
  },
  { immediate: true }
)

const hasUnassignedStorageLocation = computed(() => (
  searchSourceList.value.some((item) => !normalizeStorageLocationValue(item.storageLocation))
))

const storageLocationCounts = computed(() => {
  const counts = new Map()

  for (const item of searchSourceList.value) {
    const normalizedPath = normalizeStorageLocationValue(item.storageLocation)
    if (!normalizedPath) continue

    const pathParts = []
    for (const part of splitStorageLocationPath(normalizedPath)) {
      pathParts.push(part)
      const currentPath = buildStorageLocationPath(pathParts)
      counts.set(currentPath, (counts.get(currentPath) || 0) + 1)
    }
  }

  return counts
})

const storageLocationTree = computed(() => {
  const attachCounts = (nodes = []) => nodes.map((node) => ({
    name: node.name,
    path: node.path,
    depth: Math.max(0, Number(node.depth || 1) - 1),
    itemCount: storageLocationCounts.value.get(node.path) || 0,
    children: attachCounts(node.children || [])
  }))

  return attachCounts(presets.storageLocationTree)
})

const searchNormalizedFilters = computed(() => normalizeSearchFilters({
  ...searchFilters,
  keyword: String(searchFilters.keyword || '').trim().toLowerCase()
}))

const searchResults = computed(() => applyGoodsFilters(searchSourceList.value, searchNormalizedFilters.value))
const activeSearchFilterCount = computed(() => countActiveGoodsFilters(searchNormalizedFilters.value))

const displayedGoodsList = computed(() => (
  searchModeActive.value ? searchResults.value : goodsList.value
))

const effectiveDisplayDensity = computed(() => (
  searchModeActive.value && displayDensity.value === 'timeline'
    ? 'standard'
    : displayDensity.value
))

const homeListCore = useGoodsListCore(displayedGoodsList, {
  density: effectiveDisplayDensity,
  getResponsiveCols,
  rowHeightMap: ROW_HEIGHT_MAP,
  getScrollEl,
  getViewportHeight: ({ useFlipViewport = false } = {}) => (
    useFlipViewport ? getFlipViewportHeight() : (getScrollEl()?.clientHeight || window.innerHeight || 800)
  ),
  initialRenderRows: INITIAL_RENDER_ROWS,
  rowGap: GOODS_GRID_ROW_GAP,
  overscanRows: GOODS_GRID_OVERSCAN_ROWS,
  overscanRowsWide: GOODS_GRID_OVERSCAN_ROWS_WIDE,
  maxRenderCards: GOODS_GRID_MAX_RENDER_CARDS,
  getActiveScrollSource
})

const currentGoodsScrollTop = homeListCore.currentScrollTop
const currentGoodsViewportHeight = homeListCore.currentViewportHeight
const visibleGoodsStartIndex = homeListCore.visibleStartIndex
const visibleGoodsRenderCount = homeListCore.visibleRenderCount
const visibleGoodsEndIndex = homeListCore.visibleEndIndex
const visibleGoodsList = homeListCore.visibleItems
const goodsGridStyle = homeListCore.gridStyle
const visibleGoodsHeadSpacerHeight = homeListCore.visibleHeadSpacerHeight
const visibleGoodsTailSpacerHeight = homeListCore.visibleTailSpacerHeight
const visibleTimelineMonthCount = ref(INITIAL_TIMELINE_MONTHS)
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
const selectionHeaderStyle = computed(() => ({
  '--selection-header-top': `${selectionHeaderTop.value}px`
}))
const isAndroidNative = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent || '')
const preloadLeadCount = computed(() =>
  isAndroidNative
  ? (effectiveDisplayDensity.value === 'timeline'
        ? 5
    : Math.min(8, Math.max(getResponsiveCols(effectiveDisplayDensity.value) + 2, 5)))
  : (effectiveDisplayDensity.value === 'timeline'
        ? 6
    : Math.min(16, Math.max(getResponsiveCols(effectiveDisplayDensity.value) * 2, 10)))
)
const preloadTargetList = computed(() =>
  (
    effectiveDisplayDensity.value === 'timeline'
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
  [() => displayedGoodsList.value.length, effectiveDisplayDensity, sortDirection, sortMode, windowWidth, searchModeActive, searchScope, advancedExpanded],
  () => {
    if (hasPendingGoodsHeroBack(route.fullPath) || isGoodsHeroAnimating()) {
      return
    }
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
  // 防止快速连续点击导致的多次导航
  const now = Date.now()
  if (now - lastDetailNavigationTime < 320) {
    return
  }
  lastDetailNavigationTime = now
  
  const payload = typeof id === 'object' && id !== null ? id : { id }
  const goodsId = payload.id
  saveScrollPosition(true, `home:openDetail:${goodsId}`)
  primeActivatedRestoreWindow(getStoredScrollState())
  captureHomeSearchRestoreContext()
  if (displayDensity.value === 'timeline') {
    clearRouteTransitionFallback()
    runWithRouteTransition(
      () => router.push(`/detail/${goodsId}`).catch(() => {
        homeDisplayReady.value = true
        clearPendingDetailTransitionKind()
      }),
      {
        direction: 'forward',
        preferFallback: true,
        returnPath: route.fullPath,
        detailTransitionKind: 'detail-fade'
      }
    )
    return
  }

  clearRouteTransitionFallback()
  prepareGoodsHeroForward({ goodsId, sourceEl: payload.sourceEl || null })
  setPendingDetailReturnPath(route.fullPath)
  router.push(`/detail/${goodsId}`).catch(() => {
    homeDisplayReady.value = true
  })
}

function resolveGoodsCardCover(goodsId) {
  const normalized = String(goodsId || '')
  if (!normalized) return null
  const escaped = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(normalized)
    : normalized.replace(/"/g, '\\"')
  const rootEl = getScrollEl() || pageBodyRef.value || document
  const cardRoot = rootEl?.querySelector?.(`[data-goods-id="${escaped}"]`) || null
  if (cardRoot) {
    const coverInsideCard = cardRoot.querySelector?.(`[data-goods-hero-id="${escaped}"]`) || null
    if (coverInsideCard) return coverInsideCard
  }
  const directCover = rootEl?.querySelector?.(`[data-goods-hero-id="${escaped}"]`) || null
  if (directCover) return directCover
  return cardRoot
}

function tryPlayNativeGoodsBackHero() {
  return playGoodsHeroBack({
    currentPath: route.fullPath,
    resolveTargetEl: resolveGoodsCardCover
  })
}

function cancelGoodsBackHeroRetry() {
  if (!goodsBackHeroRetryRaf) return
  window.cancelAnimationFrame(goodsBackHeroRetryRaf)
  goodsBackHeroRetryRaf = 0
}

function clearHomeBackHeroDeferredRestoreTimer() {
  if (!homeBackHeroDeferredRestoreTimer) return
  window.clearTimeout(homeBackHeroDeferredRestoreTimer)
  homeBackHeroDeferredRestoreTimer = 0
}

function scheduleGoodsBackHeroRetry(attempt = 0, hooks = null) {
  cancelGoodsBackHeroRetry()
  goodsBackHeroRetryRaf = window.requestAnimationFrame(() => {
    goodsBackHeroRetryRaf = 0
    const played = tryPlayNativeGoodsBackHero()
    if (played) {
      hooks?.onPlayed?.()
      return
    }
    if (!hasPendingGoodsHeroBack(route.fullPath)) {
      hooks?.onGiveUp?.()
      return
    }
    scheduleGoodsBackHeroRetry(attempt + 1, hooks)
  })
}

function deferActivatedRestoreAfterGoodsBackHero(runRestore) {
  const safeRunRestore = typeof runRestore === 'function' ? runRestore : () => {}
  const hasPendingBackHero = hasPendingGoodsHeroBack(route.fullPath)
  if (!hasPendingBackHero) {
    safeRunRestore()
    return
  }

  clearHomeBackHeroDeferredRestoreTimer()
  let settled = false
  const settle = () => {
    if (settled) return
    settled = true
    clearHomeBackHeroDeferredRestoreTimer()
    safeRunRestore()
  }

  scheduleGoodsBackHeroRetry(0, {
    onPlayed: () => {
      homeBackHeroDeferredRestoreTimer = window.setTimeout(() => {
        homeBackHeroDeferredRestoreTimer = 0
        settle()
      }, Math.max(0, getHeroBackDurationMs() + 16))
    },
    onGiveUp: settle
  })

  homeBackHeroDeferredRestoreTimer = window.setTimeout(() => {
    homeBackHeroDeferredRestoreTimer = 0
    settle()
  }, HOME_BACK_HERO_GUARD_TIMEOUT_MS)
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

// -------- 閺冨爼妫跨痪鍨敶閼辨柨鐫嶅鈧?--------
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
const showShareSheet = ref(false)

const selectedGoodsItems = computed(() =>
  displayedGoodsList.value.filter((item) => selectedIds.value.has(item.id))
)

function closeSelectionOverlays() {
  showDeleteConfirm.value = false
  batchEditSheetRef.value?.close()
  showShareSheet.value = false
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
} = useGoodsSelection(displayedGoodsList, {
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

function batchShare() {
  if (selectedIds.value.size === 0) return
  showShareSheet.value = true
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
  overflow-anchor: none;
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
  flex: 0 0 auto;
  min-width: 0;
  white-space: nowrap;
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
    flex: 0 0 auto;
    transition: transform 0.16s ease, background 0.16s ease;
    display: inline-flex;
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

.search-section {
  position: relative;
  margin-top: 8px;
  padding: 0 var(--page-padding) 0;
  display: grid;
  gap: 12px;
}

.search-section__bar-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.search-section__bar {
  flex: 1;
  min-width: 0;
}

.search-section__close {
  width: var(--icon-button-size);
  height: var(--icon-button-size);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  background: var(--app-glass);
  color: var(--app-text);
  box-shadow: var(--app-shadow);
  flex-shrink: 0;
  transition: transform 0.16s ease, background 0.16s ease;
}

.search-section__close svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.search-section__close:active,
.search-section__chip-btn:active,
.search-section__toggle:active,
.search-section__chip:active,
.search-section__field-toggle:active {
  transform: scale(0.98);
}

.search-section__toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 14px 16px;
  border: none;
  border-radius: 18px;
  background:
    radial-gradient(120% 100% at 0% 0%, color-mix(in srgb, var(--app-glass) 72%, transparent), transparent 60%),
    color-mix(in srgb, var(--app-surface) 84%, var(--app-glass));
  box-shadow: var(--app-shadow);
  color: var(--app-text);
  text-align: left;
}

.search-section__toggle-main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  min-width: 0;
}

.search-section__toggle-copy {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.search-section__eyebrow {
  color: var(--app-text-tertiary);
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.search-section__title {
  margin-top: 4px;
  font-size: 17px;
  font-weight: 800;
  letter-spacing: -0.03em;
}

.search-section__summary {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  color: var(--app-text-secondary);
  font-size: 12px;
}

.search-section__toggle-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  color: var(--app-text-tertiary);
}

.search-section__toggle-icon svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform 0.2s ease;
}

.search-section__toggle-icon--open {
  transform: rotate(180deg);
}

.search-section__panel-wrap {
  position: absolute;
  left: var(--page-padding);
  right: var(--page-padding);
  top: calc(100% + 12px);
  z-index: 4;
  display: grid;
  gap: 12px;
}

.search-section__card {
  display: grid;
  gap: 14px;
  padding: 16px;
  border-radius: 22px;
  background: color-mix(in srgb, var(--app-surface) 86%, var(--app-glass));
  border: 1px solid color-mix(in srgb, var(--app-glass-border) 90%, transparent);
  box-shadow: var(--app-shadow);
}

.search-section__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.search-section__sub-title {
  margin-top: 4px;
  font-size: 16px;
  font-weight: 800;
}

.search-section__actions {
  display: inline-flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.search-section__chip-btn {
  border: none;
  border-radius: 999px;
  padding: 8px 12px;
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.search-section__field-grid {
  display: grid;
  gap: 14px;
}

.search-section__field-block {
  display: grid;
  gap: 10px;
}

.search-section__field-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.search-section__field-toggle {
  border: none;
  border-radius: 999px;
  padding: 6px 10px;
  background: var(--app-surface-soft);
  color: var(--app-text-tertiary);
  font-size: 12px;
  font-weight: 600;
}

.search-section__label {
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 700;
}

.search-section__range-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.search-section__range-row--date {
  flex-wrap: wrap;
}

.search-section__range-gap {
  color: var(--app-text-tertiary);
  flex-shrink: 0;
}

.search-section__input {
  width: 100%;
  min-width: 0;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--app-glass-border) 90%, transparent);
  border-radius: 16px;
  background: var(--app-surface-soft);
  color: var(--app-text);
  font-size: 14px;
}

.search-section__input:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--app-text) 30%, transparent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--app-text) 8%, transparent);
}

.search-section__chip-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.search-section__chip {
  border: none;
  border-radius: 999px;
  padding: 9px 12px;
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
  font-size: 12px;
  font-weight: 600;
  transition: transform 0.16s ease, background 0.16s ease, color 0.16s ease;
}

.search-section__chip--active {
  background: #141416;
  color: #fff;
}

.search-section__location-tree {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 8px;
}

.search-section__location-tree :deep(.location-node) {
  max-width: 100%;
}

.search-section__location-tree :deep(.location-node__chip) {
  max-width: min(100%, 420px);
}

.search-mode-panel-enter-active,
.search-advanced-panel-enter-active {
  transition:
    opacity 180ms ease,
    transform 180ms cubic-bezier(0.22, 0.8, 0.22, 1);
  will-change: opacity, transform;
}

.search-mode-panel-leave-active,
.search-advanced-panel-leave-active {
  transition:
    opacity 0.08s ease,
    transform 0.08s cubic-bezier(0.22, 0.8, 0.22, 1);
}

.search-mode-panel-enter-from,
.search-mode-panel-leave-to {
  opacity: 0;
  transform: translateX(12px);
}

.search-advanced-panel-enter-from,
.search-advanced-panel-leave-to {
  opacity: 0;
  transform: translateX(12px);
}

.search-advanced-panel-enter-to,
.search-advanced-panel-leave-from {
  opacity: 1;
  transform: translateX(0);
}

@media (prefers-reduced-motion: reduce) {
  .search-mode-panel-enter-active,
  .search-advanced-panel-enter-active,
  .search-mode-panel-leave-active,
  .search-advanced-panel-leave-active {
    transition: opacity 120ms ease;
  }

  .search-mode-panel-enter-from,
  .search-mode-panel-leave-to,
  .search-advanced-panel-enter-from,
  .search-advanced-panel-leave-to {
    transform: none;
  }
}

:global(html.theme-dark) .search-section__toggle,
:global(html.theme-dark) .search-section__card {
  background:
    radial-gradient(120% 100% at 0% 0%, color-mix(in srgb, var(--app-glass) 58%, transparent), transparent 60%),
    color-mix(in srgb, var(--app-surface) 78%, var(--app-glass));
}

:global(html.theme-dark) .search-section__chip-btn,
:global(html.theme-dark) .search-section__field-toggle,
:global(html.theme-dark) .search-section__chip,
:global(html.theme-dark) .search-section__input {
  background: color-mix(in srgb, var(--app-surface-soft) 72%, var(--app-glass));
}

:global(html.theme-dark) .search-section__chip--active {
  background: #f5f5f7;
  color: #141416;
}

:global(html.theme-dark) .search-section__close {
  background: var(--app-glass);
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

.add-motion-layer {
  position: fixed;
  inset: 0;
  z-index: 120;
  pointer-events: none;
}

.add-motion-ripple {
  position: fixed;
  border-radius: 22px;
  border: 2px solid color-mix(in srgb, var(--app-text) 28%, transparent);
  box-shadow:
    0 0 0 0 color-mix(in srgb, var(--app-text) 18%, transparent),
    0 0 24px color-mix(in srgb, var(--app-text) 26%, transparent);
  transform: translate3d(0, 0, 0) scale(0.72);
  opacity: 0.9;
  animation: add-motion-ripple 560ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

.add-motion-ghost {
  position: fixed;
  left: 0;
  top: 0;
  display: grid;
  grid-template-columns: 84px 1fr;
  gap: 14px;
  align-items: center;
  padding: 12px;
  border-radius: 22px;
  background:
    radial-gradient(120% 100% at 0% 0%, color-mix(in srgb, var(--app-glass) 78%, transparent), transparent 58%),
    color-mix(in srgb, var(--app-surface) 84%, var(--app-glass));
  border: 1px solid color-mix(in srgb, var(--app-glass-border) 84%, transparent);
  box-shadow:
    0 22px 46px rgba(0, 0, 0, 0.2),
    0 0 0 1px color-mix(in srgb, var(--app-text) 6%, transparent);
  backdrop-filter: blur(20px) saturate(140%);
  -webkit-backdrop-filter: blur(20px) saturate(140%);
  overflow: hidden;
  will-change: left, top, width, height, transform, opacity;
  transition:
    left 560ms cubic-bezier(0.22, 1, 0.36, 1),
    top 560ms cubic-bezier(0.22, 1, 0.36, 1),
    width 560ms cubic-bezier(0.22, 1, 0.36, 1),
    height 560ms cubic-bezier(0.22, 1, 0.36, 1),
    transform 560ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 180ms ease;
}

.add-motion-ghost--active {
  opacity: 0;
}

.add-motion-ghost__cover {
  width: 84px;
  height: 84px;
  border-radius: 18px;
  overflow: hidden;
  background: var(--app-surface-soft);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--app-glass-border) 60%, transparent);
  flex-shrink: 0;
}

.add-motion-ghost__img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.add-motion-ghost__fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--app-text-tertiary);
  font-size: 28px;
  font-weight: 700;
}

.add-motion-ghost__body {
  min-width: 0;
}

.add-motion-ghost__name {
  margin: 0;
  color: var(--app-text);
  font-size: 16px;
  font-weight: 800;
  line-height: 1.25;
  letter-spacing: -0.04em;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.add-motion-ghost__meta {
  margin: 4px 0 0;
  color: var(--app-text-tertiary);
  font-size: 12px;
  line-height: 1.2;
}

@keyframes add-motion-ripple {
  0% {
    transform: translate3d(0, 0, 0) scale(0.72);
    opacity: 0.92;
  }

  70% {
    transform: translate3d(0, 0, 0) scale(1.08);
    opacity: 0.35;
  }

  100% {
    transform: translate3d(0, 0, 0) scale(1.22);
    opacity: 0;
  }
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

:global(html.theme-dark) .hero-search {
    background: var(--app-glass);
  }
:global(html.theme-dark) .fab {
    background: var(--app-text);
    color: var(--app-surface);
  }
</style>


