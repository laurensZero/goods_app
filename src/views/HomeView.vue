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
          <h1 class="hero-title">{{ t('home.title') }}</h1>
        </div>

        <div class="hero-actions">
          <button
            :class="['hero-search', { 'hero-search--active': searchActiveFilterCount > 0 }]"
            type="button"
            :aria-label="t('common.aria.search')"
            @click="handleHeroSearch"
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20L16.65 16.65" />
            </svg>
          </button>

          <Transition name="filter-reset-fade">
            <button
              v-if="searchActiveFilterCount > 0"
              class="hero-reset"
              type="button"
              :aria-label="t('home.resetFilter')"
              @click="handleResetFilters()"
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M18 6L6 18" />
                <path d="M6 6L18 18" />
              </svg>
            </button>
          </Transition>

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

      <section class="summary-section">
        <SummaryCard :total-value="totalValue" :total-count="goodsList.length" :trend-items="store.collectionViewList" trend-date-field="acquiredAt" />
      </section>

      <HomeGoodsToolbar
        :section-label="t('home.title')"
        :title="t('home.toolbar.allGoods')"
        :total-quantity="totalQuantity"
        :sort-direction="sortDirection"
        :sort-mode="sortMode"
        :sort-options="toolbarSortOptions"
        :is-sort-animating="isSortAnimating"
        :display-density="displayDensity"
        :density-modes="densityModes"
        :active-filter-count="searchActiveFilterCount"
        :group-display-mode="groupDisplayMode"
        :group-display-options="groupDisplayOptions"
        @open-daily-rec="showDailyRec = true"
        @toggle-sort="toggleSortDirection"
        @set-sort-mode="setSortMode"
        @toggle-timeline="toggleTimelineMode"
        @set-density="setDisplayDensityWithFlip"
        @set-group-display-mode="setGroupDisplayMode"
      />

      <Transition name="goods-view-switch" mode="out-in">
        <GoodsListSkeleton v-if="!store.isReady" key="skeleton" />

        <GoodsCardGridSection
          v-else-if="displayList.length > 0 && displayDensity !== 'timeline'"
          key="grid"
          ref="goodsGridSectionRef"
          :items="visibleDisplayList"
          :density="displayDensity"
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
          :window-width="windowWidth"
          :filter-transition-active="filterTransitionActive"
          @long-press="enterSelectionMode"
          @toggle-select="toggleSelect"
          @open-detail="openDetail"
          @open-group="openGroupDetail"
        />

        <section
          v-else-if="goodsList.length > 0"
          key="timeline"
          :class="['goods-section', 'goods-view-pane', { 'goods-view-pane--sorting': isSortAnimating }]"
        >
          <HomeTimelineSection
            ref="timelineSectionRef"
            :year-groups="visibleTimelineYearGroups"
            :unknown-items="timelineUnknown"
            :show-unknown="showVisibleTimelineUnknown"
            :head-spacer-height="prunedTimelineHeadHeight"
            :tail-spacer-height="timelineTailSpacerHeight"
            :item-index-by-id="timelineItemIndexById"
            @tap-item="handleTimelineTap"
          />
        </section>

        <section v-else key="empty" class="empty-wrap goods-view-pane">
          <EmptyState
            icon="✦"
            :title="t('home.empty.title')"
            :description="t('home.empty.description')"
            :action-text="t('home.empty.action')"
            @action="goToAdd"
          />
        </section>
      </Transition>
    </main>

    <Teleport to="body">
      <ScrollTopButton
        :show="showScrollTopButton && isHomeActive && !selectionMode"
        @click="scrollToTop"
      />
      <button v-if="!selectionMode && isHomeActive" class="fab" type="button" :aria-label="t('common.aria.add')" @click="showAddSheet = true">
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

    <DangerConfirmDialog
      v-model:show="showDeleteConfirm"
      :title="t('common.moveToTrash')"
      :description="t('common.moveToTrashDesc')"
      :confirm-text="t('goods.delete.moveToTrash')"
      @confirm="confirmDelete"
    />

    <GoodsBatchEditSheet
      ref="batchEditSheetRef"
      v-model:show="showBatchEditSheet"
      :selected-count="selectedIds.size"
      @apply="applyBatchEditPayload"
    />

    <GoodsSelectionActionBar
      :show="selectionMode && !showBatchEditSheet"
      :selected-count="selectedIds.size"
      :selected-group-count="selectedGroupCount"
      :selected-goods-count="selectedGoodsCount"
      :add-to-group-mode="!!selectedGroupTargetId"
      @delete="batchDelete"
      @dissolve-group="batchDissolveGroups"
      @share="batchShare"
      @edit="batchEdit"
      @create-group="openCreateGroupSheet"
      @add-to-group="addToSelectedGroup"
    />

    <ShareSheet :show="showShareSheet" :goods-items="selectedGoodsItems" @close="showShareSheet = false" />

    <CreateGroupSheet
      v-model:show="showCreateGroupSheet"
      group-type="collection"
      :initial-goods-ids="Array.from(selectedIds)"
      @created="handleGroupCreated"
    />

    <GroupFolderSheet
      ref="groupFolderSheetRef"
      v-model:show="showGroupFolder"
      :group-id="activeGroupId"
      :density="displayDensity"
      @before-navigate="markGroupRestore"
    />

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
            <span v-else class="add-motion-ghost__fallback">{{ (addMotionOverlay.item.name || '').trim().charAt(0).toUpperCase() || t('goods.heroFallback') }}</span>
          </div>
          <div class="add-motion-ghost__body">
            <p class="add-motion-ghost__name">{{ addMotionOverlay.item.name }}</p>
            <p class="add-motion-ghost__meta">{{ t('goods.newItemAdded') }}</p>
          </div>
        </div>
      </div>
    </Teleport>

    <SearchFilterPopup
      v-model:visible="showSearchPopup"
      :filters="searchFilters"
      :category-options="searchCategoryOptions"
      :ip-options="searchIpOptions"
      :character-options="searchCharacterOptions"
      :visible-character-options="searchVisibleCharacterOptions"
      :has-collapsed-character-options="searchHasCollapsedCharacterOptions"
      :show-all-character-options="searchShowAllCharacterOptions"
      :storage-location-tree="searchStorageLocationTree"
      :has-unassigned-storage-location="searchHasUnassignedStorageLocation"
      :active-filter-count="searchActiveFilterCount"
      scope="collection"
      :search-presets="searchPresetsList"
      :active-preset-id="searchActivePresetId"
      :active-preset-name="searchActivePresetName"
      :format-preset-summary="searchFormatPresetSummary"
      @update-keyword="handleSearchUpdateKeyword"
      @update-field="handleSearchUpdateField"
      @toggle-filter="handleSearchToggleFilter"
      @toggle-character-expand="handleSearchToggleCharacterExpand"
      @reset="handleResetFilters"
      @select-preset="searchApplyPreset"
      @save-preset="searchSaveNewPreset"
      @update-preset="searchUpdateActivePreset"
      @remove-preset="searchRemovePreset"
    />

    <DailyRecommendation
      v-model="showDailyRec"
      :items="store.collectionList"
      @open-detail="handleDailyRecDetail"
    />

    <TimelineItemPopup
      v-model="showTimelinePopup"
      :item="popupTimelineItem"
      @open-detail="handleTimelinePopupDetail"
    />

  </div>
</template>
<script setup>
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { useGoodsStore } from '@/stores/goods'
import { useGoodsGroupStore } from '@/stores/goodsGroup'
import { useExchangeRateStore } from '@/stores/exchangeRate'
import { preloadImages, setImagePreloadPaused } from '@/utils/image/cache'
import { useGoodsSelection } from '@/composables/goods/useGoodsSelection'
import { useHomePreferences } from '@/composables/home/useHomePreferences'
import { createPageScrollRestore, usePageScrollBinder } from '@/composables/scroll'
import { useHomeTimeline } from '@/composables/home/useHomeTimeline'
import { useHomeGoodsList } from '@/composables/home/useHomeGoodsList'
import { useDensityGridViewport } from '@/composables/home/useDensityGridViewport'
import { useGoodsGridDensityFlip } from '@/composables/home/useGoodsGridDensityFlip'
import { addAndroidBackButtonListener } from '@/utils/platform/androidBackButton'
import { HOME_MOTION_CSS_VARS } from '@/constants/homeMotion'
import { createHomeSortOptions, sortHomeGoodsList } from '@/utils/goods/homeSort'
import { useVirtualGridMetrics } from '@/composables/goods/useVirtualGridMetrics'
import { useTimelineMetrics } from '@/composables/home/useTimelineMetrics'
import { clearRouteTransitionFallback, runWithRouteTransition, setPendingDetailReturnPath, clearPendingDetailTransitionKind } from '@/utils/routeTransition'
import { hasPendingGoodsHeroBack, isGoodsHeroAnimating, prepareGoodsHeroForward } from '@/utils/platform/nativeGoodsHeroTransition'
import { useGoodsBackHero } from '@/composables/goods/useGoodsBackHero'
import HomeSelectionHeader from '@/components/home/HomeSelectionHeader.vue'
import HomeGoodsToolbar from '@/components/home/HomeGoodsToolbar.vue'
import SummaryCard from '@/components/common/SummaryCard.vue'
import DailyRecommendation from '@/components/home/DailyRecommendation.vue'
import TimelineItemPopup from '@/components/home/TimelineItemPopup.vue'
import GoodsCardGridSection from '@/components/goods/GoodsCardGridSection.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import AddMethodSheet from '@/components/goods/AddMethodSheet.vue'
import { pickLinkedLocalImages } from '@/utils/image/localImage'
import { createBatchId } from '@/composables/batch/useBatchQueue'
import ScrollTopButton from '@/components/common/ScrollTopButton.vue'
import GoodsListSkeleton from '@/components/common/GoodsListSkeleton.vue'
import GoodsBatchEditSheet from '@/components/goods/GoodsBatchEditSheet.vue'
import GoodsSelectionActionBar from '@/components/goods/GoodsSelectionActionBar.vue'
import CreateGroupSheet from '@/components/goods/CreateGroupSheet.vue'
import GroupFolderSheet from '@/components/goods/GroupFolderSheet.vue'
import ShareSheet from '@/components/goods/ShareSheet.vue'
import DangerConfirmDialog from '@/components/common/DangerConfirmDialog.vue'
import HomeTimelineSection from '@/components/home/HomeTimelineSection.vue'
import HomeViewModeSwitch from '@/components/home/HomeViewModeSwitch.vue'
import { scrollToTopAnimated } from '@/utils/scrollToTopAnimated'
import { useI18n } from 'vue-i18n'
import { useGoodsSearch } from '@/composables/goods/useGoodsSearch'
import SearchFilterPopup from '@/components/goods/SearchFilterPopup.vue'
import { STORAGE_FILTER_EVENT, STORAGE_FILTER_STORAGE_KEY } from '@/utils/storageQr'
import { showGlobalToast } from '@/utils/globalToast'

defineOptions({ name: 'HomeView' })
const { t } = useI18n()

const store = useGoodsStore()
const goodsGroupStore = useGoodsGroupStore()
const exchangeRate = useExchangeRateStore()
const pageBodyRef = ref(null)
const goodsGridSectionRef = ref(null)
const timelineSectionRef = ref(null)
const batchEditSheetRef = ref(null)
const addMotionSnapshot = ref(null)
const addMotionRequest = ref(null)
const addMotionOverlay = ref(null)
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

const addMotionGhostStyle = computed(() => {
  const overlay = addMotionOverlay.value
  if (!overlay) return {}

  const start = overlay.startRect
  const end = overlay.endRect
  const startW = Math.max(56, Math.round(start?.width || 0))
  const startH = Math.max(56, Math.round(start?.height || 0))
  const endW = Math.max(56, Math.round(end?.width || 0))
  const endH = Math.max(56, Math.round(end?.height || 0))

  // Ghost is anchored at left:0; top:0 with the startRect dimensions.
  // translate3d positions it; scale(sx, sy) morphs it to the end size.
  if (overlay.phase === 'end') {
    const tx = Math.round(end?.left || 0)
    const ty = Math.round(end?.top || 0)
    const sx = endW / startW
    const sy = endH / startH
    return {
      width: `${startW}px`,
      height: `${startH}px`,
      transform: `translate3d(${tx}px, ${ty}px, 0) scale(${sx}, ${sy})`
    }
  }

  return {
    width: `${startW}px`,
    height: `${startH}px`,
    transform: `translate3d(${Math.round(start?.left || 0)}px, ${Math.round(start?.top || 0)}px, 0) scale(1, 1)`
  }
})

function persistCollectionTab(tab) {
  const normalizedTab = tab === 'wishlist' || tab === 'stats' ? tab : 'goods'
  localStorage.setItem(COLLECTION_TAB_STORAGE_KEY, normalizedTab)
  window.dispatchEvent(new CustomEvent(COLLECTION_TAB_EVENT, {
    detail: { tab: normalizedTab }
  }))
}

const SELECTION_HEADER_HEIGHT = 64
// 视口宽度，用于响应式列数计算
const windowWidth = ref(window.innerWidth)
const _onResize = () => { windowWidth.value = window.innerWidth }
const selectionHeaderTop = ref(0)
const INITIAL_RENDER_ROWS = 6
const GOODS_GRID_ROW_GAP = 12
const GOODS_GRID_OVERSCAN_ROWS = 4
const GOODS_GRID_OVERSCAN_ROWS_WIDE = 3
// 按密度模式和设备类型设置不同的最大渲染卡片数
// 手机端（<900px）列数少，可以加载更少；平板端（≥900px）列数多，需要更多
const GOODS_GRID_MAX_RENDER_CARDS_MAP = {
  comfortable: { mobile: 40, tablet: 56 },  // 手机2-3列，平板4-5列，行高320
  standard: { mobile: 54, tablet: 72 },     // 手机3-4列，平板5-6列，行高284
  compact: { mobile: 64, tablet: 80 }       // 手机4-5列，平板6-8列，行高248
}
const TABLET_BREAKPOINT = 900

function getMaxRenderCards(density) {
  const config = GOODS_GRID_MAX_RENDER_CARDS_MAP[density] || { mobile: 54, tablet: 72 }
  return windowWidth.value >= TABLET_BREAKPOINT ? config.tablet : config.mobile
}
const INITIAL_TIMELINE_MONTHS = 6
const TIMELINE_MAX_RENDER_MONTHS = 14
const TIMELINE_RESTORE_BUFFER_MONTHS = 3
const TIMELINE_MONTH_ESTIMATED_HEIGHT = 360
const TIMELINE_MONTH_OVERSCAN = 3
const TIMELINE_PRUNE_KEEP_BEHIND = 4
const SCROLL_TOP_BUTTON_THRESHOLD = 900
const ROW_HEIGHT_MAP = {
  comfortable: 308,
  standard: 272,
  compact: 236
}
let removeAndroidBackListener = null
let pageScrollRaf = 0
let mountBootstrapSession = 0
let isRouteLeaving = false
let _lastSyncStartRow = -1
let _lastSyncRenderRows = -1
let _lastSyncDensity = ''

// 添加方式面板
const showAddSheet = ref(false)
const showDailyRec = ref(false)
const showTimelinePopup = ref(false)
const popupTimelineItem = ref(null)
const DAILY_REC_RESTORE_KEY = '__dailyRecOpen'

let dailyRecClosingForDetail = false

function handleDailyRecDetail(goodsId) {
  sessionStorage.setItem(DAILY_REC_RESTORE_KEY, '1')
  dailyRecClosingForDetail = true
  showDailyRec.value = false
  nextTick(() => {
    const now = Date.now()
    if (now - lastDetailNavigationTime < 320) return
    lastDetailNavigationTime = now
    saveScrollPosition(true, `home:openDetail:${goodsId}`)
    primeActivatedRestoreWindow(getStoredScrollState())
    clearRouteTransitionFallback()
    runWithRouteTransition(
      () => router.push(`/detail/${goodsId}`).catch(() => {
        homeDisplayReady.value = true
        clearPendingDetailTransitionKind()
      }),
      {
        direction: 'forward',
        returnPath: route.fullPath,
        detailTransitionKind: 'detail-fade'
      }
    )
  })
}

watch(showDailyRec, (open) => {
  // Only clear restore flag on manual close, not on navigate-to-detail close
  if (open) return
  if (dailyRecClosingForDetail) {
    dailyRecClosingForDetail = false
    return
  }
  sessionStorage.removeItem(DAILY_REC_RESTORE_KEY)
})

// KeepAlive 激活状态：控制 Teleport FAB 在其他页面不穿透显示
const isHomeActive = ref(true)

const {
  densityModes,
  displayDensity,
  sortDirection,
  sortMode,
  groupDisplayMode,
  isDensityAnimating,
  isSortAnimating,
  getResponsiveCols,
  setDisplayDensity,
  toggleTimelineMode,
  toggleSortDirection,
  setSortMode,
  setGroupDisplayMode,
  restoreHomePreferences
} = useHomePreferences(windowWidth, { t })

const {
  filters: searchFilters,
  activeFilterCount: searchActiveFilterCount,
  isFiltering: searchIsFiltering,
  filteredItems: searchFilteredList,
  categoryOptions: searchCategoryOptions,
  ipOptions: searchIpOptions,
  characterOptions: searchCharacterOptions,
  visibleCharacterOptions: searchVisibleCharacterOptions,
  hasCollapsedCharacterOptions: searchHasCollapsedCharacterOptions,
  showAllCharacterOptions: searchShowAllCharacterOptions,
  hasUnassignedStorageLocation: searchHasUnassignedStorageLocation,
  storageLocationTree: searchStorageLocationTree,
  searchPresets: searchPresetsList,
  activePresetId: searchActivePresetId,
  activePresetName: searchActivePresetName,
  applyPreset: searchApplyPreset,
  saveNewPreset: searchSaveNewPreset,
  updateActivePreset: searchUpdateActivePreset,
  removePreset: searchRemovePreset,
  resetFilters: searchResetFilters,
  toggleFilterValue: searchToggleFilterValue,
  formatPresetSummary: searchFormatPresetSummary
} = useGoodsSearch(computed(() => store.collectionViewList), { scope: 'collection' })

const showSearchPopup = ref(false)
const filterTransitionActive = ref(false)
let _filterTransitionTimer = 0

function handleResetFilters() {
  searchResetFilters()
  filterTransitionActive.value = false
  cancelAnimationFrame(_filterTransitionTimer)
  _filterTransitionTimer = requestAnimationFrame(() => {
    filterTransitionActive.value = true
    setTimeout(() => { filterTransitionActive.value = false }, 350)
  })
}

const translatedSortOptions = computed(() => createHomeSortOptions(t))
const timelineSortOptions = computed(() => translatedSortOptions.value.filter((option) => option.value === 'acquiredAt'))
const toolbarSortOptions = computed(() => (
  displayDensity.value === 'timeline'
    ? (timelineSortOptions.value.length ? timelineSortOptions.value : translatedSortOptions.value)
    : translatedSortOptions.value
))

const groupDisplayOptions = computed(() => [
  {
    value: 'pinned',
    label: t('home.groupDisplay.pinned'),
    description: t('home.groupDisplay.pinnedDesc')
  },
  {
    value: 'chronological',
    label: t('home.groupDisplay.chronological'),
    description: t('home.groupDisplay.chronologicalDesc')
  },
  {
    value: 'hidden',
    label: t('home.groupDisplay.hidden'),
    description: t('home.groupDisplay.hiddenDesc')
  }
])

const {
  getScrollEl,
  getActiveScrollSource,
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
  cancelPendingRestore
} = createPageScrollRestore('home')(pageBodyRef)

const { bindPageScroll, unbindPageScroll } = usePageScrollBinder({ getScrollEl, markScrollSource, handlePageScroll })

const {
  tryPlayNativeGoodsBackHero,
  cancelGoodsBackHeroRetry,
  clearDeferredRestoreTimer: clearHomeBackHeroDeferredRestoreTimer,
  scheduleGoodsBackHeroRetry
} = useGoodsBackHero({ getScrollEl, rootRef: pageBodyRef })

const homeDisplayReady = ref(true)
const showScrollTopButton = ref(false)
const topJumpMasking = ref(false)
let topJumpMaskTimer = 0
let lastDetailNavigationTime = 0

// 添加方式面板
const router = useRouter()
const route = useRoute()

function switchHomeTopTab(nextMode) {
  const SUB_ORDER = ['/home', '/wishlist', '/leaderboard/characters']
  const fi = SUB_ORDER.indexOf(route.path)
  const toPath = nextMode === 'wishlist' ? '/wishlist' : nextMode === 'stats' ? '/leaderboard/characters' : '/home'
  const ti = SUB_ORDER.indexOf(toPath)
  const direction = (fi !== -1 && ti !== -1 && ti < fi) ? 'forward' : 'back'

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
  showSearchPopup.value = true
}

function handleSearchUpdateKeyword(value) { searchFilters.keyword = value }
function handleSearchUpdateField({ key, value }) { searchFilters[key] = value }
function handleSearchToggleFilter({ key, value }) { searchToggleFilterValue(key, value) }
function handleSearchToggleCharacterExpand() { searchShowAllCharacterOptions.value = !searchShowAllCharacterOptions.value }

function checkNfcStorageFilter() {
  const nfcFilterRaw = localStorage.getItem(STORAGE_FILTER_STORAGE_KEY)
  if (!nfcFilterRaw) return
  localStorage.removeItem(STORAGE_FILTER_STORAGE_KEY)
  try {
    const nfcFilter = JSON.parse(nfcFilterRaw)
    if (nfcFilter.storageLocations?.length) {
      searchFilters.storageLocations = nfcFilter.storageLocations
      showSearchPopup.value = false
    }
  } catch {}
}

let shouldScrollToTopOnActivated = false

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
  shouldScrollToTopOnActivated = true
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
  const images = await pickLinkedLocalImages(10)
  if (!images.length) return
  saveScrollPosition(true, 'home:handleBatchAdd')
  homeDisplayReady.value = false
  runWithRouteTransition(
    () => router.push({ name: 'batch-add', state: { batchImages: JSON.stringify(images), batchId: createBatchId() } }).catch(() => {
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

const gridMetrics = useVirtualGridMetrics({
  getGridEl: () => getGoodsListEl(),
  getCols: () => getResponsiveCols(displayDensity.value),
  getDensity: () => displayDensity.value,
  // 置顶模式下分组卡集中在 displayList 头部，纯分组行比普通行矮，需单独建模
  getLeadingGroupCount: () => (
    !searchIsFiltering.value && groupDisplayMode.value === 'pinned'
      ? groupViewItems.value.length
      : 0
  ),
  fallbackRowHeightMap: ROW_HEIGHT_MAP,
  fallbackRowGap: GOODS_GRID_ROW_GAP
})

const timelineMetrics = useTimelineMetrics({
  getSectionEl: () => timelineSectionRef.value?.sectionEl ?? null,
  fallbackMonthHeight: TIMELINE_MONTH_ESTIMATED_HEIGHT,
  fallbackYearHeaderHeight: 48
})

function syncVirtualGoodsViewport(scrollTop = 0, options = {}) {
  if (displayDensity.value === 'timeline') {
    currentGoodsScrollTop.value = Math.max(0, Number(scrollTop) || 0)
    currentGoodsViewportHeight.value = resolveGoodsViewportHeight(options)
    visibleGoodsStartIndex.value = 0
    visibleGoodsRenderCount.value = displayList.value.length
    return
  }

  const normalizedTop = Math.max(0, Number(scrollTop) || 0)
  const viewportHeight = resolveGoodsViewportHeight(options)
  const cols = getResponsiveCols(displayDensity.value)
  const rowSpan = gridMetrics.getRowSpan()
  const overscanRows = cols >= 5 ? GOODS_GRID_OVERSCAN_ROWS_WIDE : GOODS_GRID_OVERSCAN_ROWS
  // 根据密度模式和设备类型选择对应的最大渲染卡片数
  const maxRenderCards = getMaxRenderCards(displayDensity.value)
  const viewportRows = Math.max(1, Math.ceil(Math.max(viewportHeight, rowSpan) / rowSpan))
  const totalItems = displayList.value.length
  const totalRows = Math.ceil(totalItems / cols)
  // 滚动位置越过列表末尾（回弹、恢复时数据变短等）时钳制到最后一行，
  // 而不是重置回列表头部造成大跳
  const startRow = Math.min(
    Math.max(0, gridMetrics.rowAtOffset(normalizedTop) - overscanRows),
    Math.max(0, totalRows - 1)
  )
  const renderRows = Math.max(INITIAL_RENDER_ROWS, viewportRows + overscanRows * 2)

  // Density changed (or first call) — invalidate cached row values
  const density = displayDensity.value
  if (density !== _lastSyncDensity) {
    _lastSyncDensity = density
    _lastSyncStartRow = -1
    _lastSyncRenderRows = -1
  }

  // Always update cheap refs used by other consumers
  currentGoodsScrollTop.value = normalizedTop
  currentGoodsViewportHeight.value = viewportHeight

  // Only update expensive list refs when the viewport actually crossed a row boundary
  if (startRow !== _lastSyncStartRow || renderRows !== _lastSyncRenderRows) {
    _lastSyncStartRow = startRow
    _lastSyncRenderRows = renderRows

    const startIndex = Math.min(totalItems, startRow * cols)
    const remainingItems = Math.max(0, totalItems - startIndex)
    const renderCount = Math.min(
      remainingItems,
      Math.min(
        maxRenderCards,
        Math.max(cols * 4, renderRows * cols)
      )
    )

    visibleGoodsStartIndex.value = startIndex
    visibleGoodsRenderCount.value = renderCount
  }

  // 首测发生在滚过分组块之后时学不到分组行行距——回到顶部分组行可见时补测
  if (visibleGoodsStartIndex.value === 0 && gridMetrics.needsGroupSpanMeasure()) {
    gridMetrics.scheduleMeasure()
  }
}

function syncVisibleGoodsCount(scrollTop = 0, options = {}) {
  if (displayDensity.value === 'timeline') return
  syncVirtualGoodsViewport(scrollTop, options)
}

function syncVisibleGoodsCountForActivatedRestore(scrollTop = 0) {
  if (displayDensity.value === 'timeline') return
  const viewportHeight = getFlipViewportHeight()
  // Sync with actual scroll position first so existing items at the top
  // of the viewport stay in the render window — avoids a visible flash
  // when KeepAlive preserves the scroll position and the mask is skipped.
  syncVirtualGoodsViewport(scrollTop, { useFlipViewport: true, viewportHeight })
  // Then extend the render window forward to preload upcoming items
  // without shifting the start index.
  const preloadTargetTop = scrollTop + viewportHeight * 2.5
  const cols = getResponsiveCols(displayDensity.value)
  const overscanRows = cols >= 5 ? GOODS_GRID_OVERSCAN_ROWS_WIDE : GOODS_GRID_OVERSCAN_ROWS
  const endRow = gridMetrics.rowAtOffset(preloadTargetTop) + 1 + overscanRows
  const endIndex = Math.min(displayList.value.length, endRow * cols)
  const neededCount = Math.max(0, endIndex - visibleGoodsStartIndex.value)
  const maxRenderCards = getMaxRenderCards(displayDensity.value)
  if (neededCount > visibleGoodsRenderCount.value) {
    visibleGoodsRenderCount.value = Math.min(
      maxRenderCards,
      neededCount
    )
  }
}

function maybeLoadMoreGoods() {
  if (displayDensity.value === 'timeline') return
  syncVisibleGoodsCount(readScrollTop())
}

function getInitialVisibleTimelineMonths() {
  return INITIAL_TIMELINE_MONTHS
}

function _computeTimelineWindow(scrollTop = 0, options = {}) {
  if (displayDensity.value !== 'timeline') {
    return { start: visibleTimelineMonthStart.value, count: visibleTimelineMonthCount.value }
  }

  const total = allTimelineMonthCount.value
  if (total === 0) return { start: 0, count: 0 }

  const initial = getInitialVisibleTimelineMonths()
  // 用逐月实测高度映射滚动偏移 → 月份索引，替代 scrollTop/estHeight 除法估算
  const mo = timelineMetrics.monthAtOffset(scrollTop, allTimelineMonthList.value)
  const startMonth = Math.max(0, mo - TIMELINE_MONTH_OVERSCAN)
  // 限制渲染窗口，超出部分用 tail spacer 填充（和网格模式同理）
  const maxCount = TIMELINE_MAX_RENDER_MONTHS
  const endMonth = Math.min(total, startMonth + maxCount)
  const count = Math.max(initial, Math.min(endMonth - startMonth, maxCount))
  const result = { start: Math.min(startMonth, total - count), count: Math.min(count, total) }

  return result
}

function syncVisibleTimelineMonthCount(scrollTop = 0, options = {}) {
  const win = _computeTimelineWindow(scrollTop, options)
  visibleTimelineMonthStart.value = win.start
  visibleTimelineMonthCount.value = win.count
}

function syncVisibleTimelineMonthCountForActivatedRestore(scrollTop = 0) {
  const viewportHeight = getFlipViewportHeight()
  const preloadTargetTop = scrollTop + viewportHeight * 2
  const win = _computeTimelineWindow(preloadTargetTop, { useFlipViewport: true })

  visibleTimelineMonthStart.value = Math.max(0, Math.min(
    win.start,
    visibleTimelineMonthStart.value
  ))
  visibleTimelineMonthCount.value = Math.min(
    allTimelineMonthCount.value - visibleTimelineMonthStart.value,
    Math.max(
      visibleTimelineMonthCount.value,
      win.count
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

    const total = allTimelineMonthCount.value

    if (timelineUnknownItemIds.value.has(anchorId)) {
      visibleTimelineMonthStart.value = 0
      visibleTimelineMonthCount.value = total
      return
    }

    const monthIndex = timelineMonthIndexByItemId.value.get(anchorId)
    if (!Number.isFinite(monthIndex) || monthIndex < 0) return

    const neededEnd = Math.min(total, monthIndex + 1 + TIMELINE_RESTORE_BUFFER_MONTHS)
    const neededStart = Math.max(0, monthIndex - TIMELINE_PRUNE_KEEP_BEHIND)
    const neededCount = neededEnd - neededStart

    visibleTimelineMonthStart.value = Math.min(neededStart, visibleTimelineMonthStart.value)
    visibleTimelineMonthCount.value = Math.min(
      total - visibleTimelineMonthStart.value,
      Math.max(visibleTimelineMonthCount.value, neededCount)
    )
    return
  }

  const anchorIndex = Number(state.anchorIndex)
  if (!Number.isFinite(anchorIndex) || anchorIndex < 0) return

  const cols = getResponsiveCols(displayDensity.value)
  const rowSpan = gridMetrics.getRowSpan()
  const overscanRows = cols >= 5 ? GOODS_GRID_OVERSCAN_ROWS_WIDE : GOODS_GRID_OVERSCAN_ROWS
  const anchorRow = Math.floor(anchorIndex / cols)
  const restoreTop = Math.max(0, gridMetrics.offsetOfRow(anchorRow) - overscanRows * rowSpan)
  syncVisibleGoodsCount(restoreTop, { useFlipViewport: true })
}

function handlePageScroll() {
  if (isRouteLeaving) return
  if (isGoodsHeroAnimating()) return
  if (pageScrollRaf) return
  pageScrollRaf = window.requestAnimationFrame(() => {
    pageScrollRaf = 0
    if (isRouteLeaving) return
    if (isGoodsHeroAnimating()) return
    const scrollTop = readScrollTop()
    updateImagePreloadThrottle(scrollTop)
    rememberCurrentScrollPosition()
    if (selectionMode.value) updateSelectionHeaderPosition()
    maybeLoadMoreGoods()
    if (displayDensity.value === 'timeline') {
      syncVisibleTimelineMonthCount(scrollTop)
    }
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

function handleAndroidBackButton(event) {
  if (showSearchPopup.value) {
    showSearchPopup.value = false
    event.preventDefault()
    return
  }

  if (showDailyRec.value) {
    showDailyRec.value = false
    event.preventDefault()
    return
  }

  if (showTimelinePopup.value) {
    showTimelinePopup.value = false
    event.preventDefault()
    return
  }

  if (batchEditSheetRef.value?.consumeBack()) {
    event.preventDefault()
    return
  }

  if (showDeleteConfirm.value) {
    showDeleteConfirm.value = false
    event.preventDefault()
    return
  }

  if (showGroupFolder.value) {
    if (groupFolderSheetRef.value?.consumeBack()) {
      event.preventDefault()
      return
    }
    showGroupFolder.value = false
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
  window.addEventListener('resize', _onResize, { passive: true })
  window.addEventListener(STORAGE_FILTER_EVENT, checkNfcStorageFilter)
  await refresh()
  if (sessionId !== mountBootstrapSession) return
  syncVisibleGoodsCount()
  syncVisibleTimelineMonthCount()
  await nextTick()
  if (sessionId !== mountBootstrapSession) return
  bindPageScroll()
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

  // Check for NFC storage filter
  checkNfcStorageFilter()

  // Restore group folder sheet if returning from detail that was opened from the sheet
  const restoreGroupId = sessionStorage.getItem(GROUP_RESTORE_KEY)
  const isGroupRestore = !!restoreGroupId
  if (isGroupRestore) {
    sessionStorage.removeItem(GROUP_RESTORE_KEY)
    activeGroupId.value = restoreGroupId
    showGroupFolder.value = true
    // Don't cancel hero back — the group sheet will play it via onSheetOpened
  } else {
    cancelGoodsBackHeroRetry()
    clearHomeBackHeroDeferredRestoreTimer()
  }

  // Restore daily recommendation sheet if returning from detail
  if (sessionStorage.getItem(DAILY_REC_RESTORE_KEY)) {
    sessionStorage.removeItem(DAILY_REC_RESTORE_KEY)
    showDailyRec.value = true
  }

  if (shouldScrollToTopOnActivated) {
    shouldScrollToTopOnActivated = false
    clearStoredScrollState()
    const el = getScrollEl()
    if (el) el.scrollTop = 0
    else window.scrollTo(0, 0)
    homeDisplayReady.value = true
    bindPageScroll()
    updateSelectionHeaderPosition()
    updateScrollTopButtonVisibility()
    bindAndroidBackButton()
    return
  }
  // 仅 hero 返回动画需要整页遮罩。普通 tab 切换的滚动恢复在同一任务内同步写入
  // scrollTop（命中即返回，不经过 rAF），错误位置不会被绘制；此时整页
  // visibility:hidden 反而制造 100ms+ 的可感知空白闪烁（WishlistView 同场景不遮罩）。
  if (hasPendingGoodsHeroBack(route.fullPath)) {
    homeDisplayReady.value = false
  }
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
  syncAddMotionContext()

  if (isGroupRestore) {
    // Group sheet handles hero back via onSheetOpened — skip main list hero
    homeDisplayReady.value = true
  } else {
    // Try to hide the hero target synchronously before lifting the mask.
    const played = tryPlayNativeGoodsBackHero()
    if (played) {
      homeDisplayReady.value = true
    } else if (hasPendingGoodsHeroBack(route.fullPath)) {
      scheduleGoodsBackHeroRetry(0, {
        onPlayed: () => { homeDisplayReady.value = true },
        onGiveUp: () => { homeDisplayReady.value = true }
      })
    } else {
      homeDisplayReady.value = true
    }
  }
  bindPageScroll()
  updateSelectionHeaderPosition()
  updateScrollTopButtonVisibility()
  bindAndroidBackButton()
})

onDeactivated(() => {
  isHomeActive.value = false
  showDailyRec.value = false
  mountBootstrapSession += 1
  cancelGoodsBackHeroRetry()
  clearHomeBackHeroDeferredRestoreTimer()
  clearImagePreloadThrottleTimer()
  setImagePreloadPaused(false)
  cancelPendingRestore()
  if (!hasPendingRestore() && !isRouteLeaving) {
    rememberCurrentScrollPosition()
  }
  exitSelectionModeQuiet()
  unbindPageScroll()
  unbindAndroidBackButton()
})

onBeforeUnmount(() => {
  gridMetrics.cancelMeasure()
  timelineMetrics.cancelMeasure()
  window.removeEventListener(STORAGE_FILTER_EVENT, checkNfcStorageFilter)
  if (addMotionRaf) {
    window.cancelAnimationFrame(addMotionRaf)
    addMotionRaf = 0
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
  unbindPageScroll()
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
  unbindPageScroll()
})

const { goodsList, totalValue, totalQuantity, goodsById } = useHomeGoodsList(store, sortMode, sortDirection, goodsGroupStore, exchangeRate, searchFilteredList)

// Goods groups — merged into displayList with goods
const groupViewItems = computed(() => {
  const goodsMap = new Map(store.list.map(g => [g.id, g]))
  const viewMap = new Map(store.viewList.map(g => [g.id, g]))
  return goodsGroupStore.collectionGroups.map(group => {
    const members = goodsGroupStore.groupItemsOf(group.id)
      .map(i => goodsMap.get(i.goodsId))
      .filter(Boolean)

    let totalPrice = 0
    let totalPriceCNY = 0
    let currency = 'CNY'

    if (group.summaryMode === 'manual') {
      totalPrice = Number(group.totalAmount) || 0
      currency = group.currency || 'CNY'
      totalPriceCNY = exchangeRate.convertToCNY(totalPrice, currency)
    } else {
      totalPriceCNY = members.reduce((sum, g) => {
        const view = viewMap.get(g.id)
        return sum + (Number(view?.totalValueNumber) || 0)
      }, 0)
      totalPrice = totalPriceCNY
    }

    return {
      id: group.id,
      sortId: group.id,
      _type: 'group',
      _group: group,
      _members: members,
      _totalPrice: totalPrice,
      _totalPriceCNY: totalPriceCNY,
      _currency: currency,
      name: group.name,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
      // Fields for sortHomeGoodsList compatibility
      createdTime: group.createdAt,
      acquiredTime: group.createdAt,
      totalValueNumber: totalPriceCNY
    }
  })
})
const groupIdsSet = computed(() => new Set(groupViewItems.value.map(g => g.id)))
const selectedGroupTargetId = computed(() => {
  // If exactly one group is selected and some goods are selected, return the group id
  const selGroups = [...selectedIds.value].filter(id => groupIdsSet.value.has(id))
  const selGoods = [...selectedIds.value].filter(id => !groupIdsSet.value.has(id))
  return selGroups.length === 1 && selGoods.length > 0 ? selGroups[0] : ''
})
const selectedGroupCount = computed(() => [...selectedIds.value].filter(id => groupIdsSet.value.has(id)).length)
const selectedGoodsCount = computed(() => [...selectedIds.value].filter(id => !groupIdsSet.value.has(id)).length)

const groupedGoodsIds = computed(() => {
  const ids = new Set()
  for (const item of goodsGroupStore.groupItemList) {
    ids.add(item.goodsId)
  }
  return ids
})
const displayList = computed(() => {
  // When filtering, break apart groups and show individual goods
  if (searchIsFiltering.value) {
    return goodsList.value
  }

  // When groups are hidden, show all goods as individual items
  if (groupDisplayMode.value === 'hidden') {
    return goodsList.value
  }

  // When pinned (default), show groups at top
  if (groupDisplayMode.value === 'pinned') {
    return [
      ...groupViewItems.value,
      ...goodsList.value.filter(g => !groupedGoodsIds.value.has(g.id))
    ]
  }

  // When chronological, mix groups into the list following the main sort
  const groups = groupViewItems.value.map(g => ({ ...g, _isGroupView: true }))
  const ungroupedGoods = goodsList.value.filter(g => !groupedGoodsIds.value.has(g.id))
  const mixed = [...groups, ...ungroupedGoods]
  return sortHomeGoodsList(mixed, sortMode.value, sortDirection.value)
})
const visibleDisplayList = computed(() =>
  displayDensity.value === 'timeline'
    ? goodsList.value
    : displayList.value.slice(visibleGoodsStartIndex.value, visibleGoodsEndIndex.value)
)
const GROUP_RESTORE_KEY = '__groupRestore'
const showGroupFolder = ref(false)
const groupFolderSheetRef = ref(null)
const activeGroupId = ref('')
let navigatingFromGroup = false

function openGroupDetail(groupId) {
  activeGroupId.value = groupId
  showGroupFolder.value = true
}

function markGroupRestore() {
  navigatingFromGroup = true
  if (activeGroupId.value) {
    sessionStorage.setItem(GROUP_RESTORE_KEY, activeGroupId.value)
  }
}

// Clear restore flag when sheet closes normally (not from navigation)
watch(showGroupFolder, (open) => {
  if (!open && !navigatingFromGroup) {
    sessionStorage.removeItem(GROUP_RESTORE_KEY)
  }
  navigatingFromGroup = false
})
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
  getItemCount: () => displayList.value.length
})

const currentGoodsScrollTop = ref(0)
const currentGoodsViewportHeight = ref(0)
const visibleGoodsStartIndex = ref(0)
const visibleGoodsRenderCount = ref(getInitialVisibleCount())
const visibleTimelineMonthStart = ref(0)
const visibleTimelineMonthCount = ref(INITIAL_TIMELINE_MONTHS)
const visibleGoodsEndIndex = computed(() => (
  displayDensity.value === 'timeline'
    ? goodsList.value.length
    : Math.min(displayList.value.length, visibleGoodsStartIndex.value + visibleGoodsRenderCount.value)
))
const {
  allTimelineMonthCount,
  allTimelineMonthList,
  timelineMonthIndexByItemId,
  timelineItemIndexById,
  timelineUnknownItemIds,
  visibleTimelineYearGroups,
  prunedTimelineHeadHeight,
  timelineUnknown,
  showVisibleTimelineUnknown
} = useHomeTimeline({
  goodsList,
  displayDensity,
  sortDirection,
  visibleTimelineMonthStart,
  visibleTimelineMonthCount,
  getInitialVisibleTimelineMonths,
  offsetOfMonth: timelineMetrics.offsetOfMonth
})
const goodsGridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${getResponsiveCols(displayDensity.value)}, minmax(0, 1fr))`
}))

// 时间线尾部 spacer：限制渲染窗口后，尾部未渲染月份的高度
const timelineTailSpacerHeight = computed(() => {
  if (displayDensity.value !== 'timeline') return 0
  const total = allTimelineMonthCount.value
  const end = visibleTimelineMonthStart.value + visibleTimelineMonthCount.value
  if (end >= total) return 0
  return timelineMetrics.offsetOfMonth(total, allTimelineMonthList.value)
       - timelineMetrics.offsetOfMonth(end, allTimelineMonthList.value)
})
const visibleGoodsHeadSpacerHeight = computed(() => {
  if (displayDensity.value === 'timeline') return 0

  const cols = getResponsiveCols(displayDensity.value)
  const headRows = Math.floor(visibleGoodsStartIndex.value / cols)
  return gridMetrics.headSpacerHeight(headRows)
})
const visibleGoodsTailSpacerHeight = computed(() => {
  if (displayDensity.value === 'timeline') return 0

  const remainingItems = Math.max(0, displayList.value.length - visibleGoodsEndIndex.value)
  if (!remainingItems) return 0

  const cols = getResponsiveCols(displayDensity.value)
  return gridMetrics.tailSpacerHeight(Math.ceil(remainingItems / cols))
})
const selectionHeaderStyle = computed(() => ({
  '--selection-header-top': `${selectionHeaderTop.value}px`
}))
const isAndroidNative = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent || '')
const preloadLeadCount = computed(() =>
  isAndroidNative
    ? (displayDensity.value === 'timeline'
        ? 5
        : Math.min(8, Math.max(getResponsiveCols(displayDensity.value) + 2, 5)))
    : (displayDensity.value === 'timeline'
        ? 6
        : Math.min(16, Math.max(getResponsiveCols(displayDensity.value) * 2, 10)))
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
      : visibleDisplayList.value
  ).slice(0, preloadLeadCount.value)
)

watch(
  [() => displayList.value.length, displayDensity, sortDirection, sortMode, windowWidth],
  () => {
    _lastSyncStartRow = -1
    _lastSyncRenderRows = -1
    syncVisibleGoodsCount(readScrollTop(), { useFlipViewport: true })
    syncVisibleTimelineMonthCount(readScrollTop(), { useFlipViewport: true })
    gridMetrics.scheduleMeasure()
    if (displayDensity.value === 'timeline') {
      timelineMetrics.scheduleMeasure()
    }
  },
  { immediate: true }
)

// 实测行高落地后按真实行距重算渲染窗口（spacer computed 会随之重新求值）
watch(gridMetrics.metricsVersion, () => {
  _lastSyncStartRow = -1
  _lastSyncRenderRows = -1
  syncVisibleGoodsCount(readScrollTop(), { useFlipViewport: true })
})

// 实测时间线月高落地后重算可见月份窗口（head spacer 随之重新求值）。
// 若 spacer 因高度修正而变化，同步补偿 scrollTop，避免视觉跳变。
watch(timelineMetrics.metricsVersion, () => {
  const oldSpacer = prunedTimelineHeadHeight.value
  syncVisibleTimelineMonthCount(readScrollTop(), { useFlipViewport: true })
  const delta = prunedTimelineHeadHeight.value - oldSpacer
  if (Math.abs(delta) > 0.5) {
    const el = getScrollEl()
    if (el) el.scrollTop += delta
  }
})

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

let _selectionSpacerEl = null
let _selectionHeaderFrameCount = 0
const SELECTION_HEADER_RECT_INTERVAL = 3 // 每 3 帧读取一次 getBoundingClientRect

function _resolveSelectionSpacer() {
  if (_selectionSpacerEl && _selectionSpacerEl.isConnected) return _selectionSpacerEl
  _selectionSpacerEl = pageBodyRef.value?.querySelector?.('.selection-header-spacer') || null
  return _selectionSpacerEl
}

function updateSelectionHeaderPosition() {
  // 帧节流：每 SELECTION_HEADER_RECT_INTERVAL 帧才读取一次 getBoundingClientRect
  _selectionHeaderFrameCount++
  if (_selectionHeaderFrameCount % SELECTION_HEADER_RECT_INTERVAL !== 0) return

  const spacer = _resolveSelectionSpacer()
  if (!spacer) {
    selectionHeaderTop.value = 0
    return
  }

  const rect = spacer.getBoundingClientRect()
  const maxTop = Math.max(0, window.innerHeight - SELECTION_HEADER_HEIGHT)
  selectionHeaderTop.value = Math.min(maxTop, Math.max(0, rect.top))
}

// -------- 时间线弹窗与密度切换 --------
function handleTimelineTap(item) {
  popupTimelineItem.value = item
  showTimelinePopup.value = true
}

function handleTimelinePopupDetail(id) {
  showTimelinePopup.value = false
  openDetail(id)
}

function setDisplayDensityWithFlip(mode) {
  if (displayDensity.value === mode) return
  const captured = densityFlip.capture()
  setDisplayDensity(mode)
  if (captured) densityFlip.animate()
}

// -------- Multi-select --------
const showDeleteConfirm = ref(false)
const showBatchEditSheet = ref(false)
const showShareSheet = ref(false)
const showCreateGroupSheet = ref(false)

const selectedGoodsItems = computed(() =>
  store.collectionList.filter((item) => selectedIds.value.has(item.id))
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
  try {
    await store.removeMultipleGoods(selectedIds.value)
  } catch (e) {
    // 删除失败时保留选中状态，方便用户重试
    console.error('[home] batch delete failed:', e)
    showGlobalToast(t('toast.deleteFailed'))
    return
  }
  exitSelectionModeQuiet()
}

async function batchDissolveGroups() {
  const groupIds = [...selectedIds.value].filter(id => groupIdsSet.value.has(id))
  if (groupIds.length === 0) return
  for (const gid of groupIds) {
    await goodsGroupStore.removeGroup(gid)
  }
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

function openCreateGroupSheet() {
  if (selectedIds.value.size < 2) return
  showCreateGroupSheet.value = true
}

async function addToSelectedGroup() {
  const targetId = selectedGroupTargetId.value
  if (!targetId) return
  const goodsIds = [...selectedIds.value].filter(id => !groupIdsSet.value.has(id))
  if (goodsIds.length === 0) return
  await goodsGroupStore.addItemsToGroup(targetId, goodsIds)
  exitSelectionModeQuiet()
}

function handleGroupCreated(group) {
  showCreateGroupSheet.value = false
  exitSelectionModeQuiet()
  activeGroupId.value = group.id
  showGroupFolder.value = true

  // Auto-switch to pinned mode when creating a new group
  if (groupDisplayMode.value === 'hidden') {
    setGroupDisplayMode('pinned')
  }
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

.hero-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex: 1;
  min-width: 0;
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
  overflow: hidden;
  will-change: transform, opacity;
  /* backdrop-filter disabled during animation to avoid per-frame blur
     recalculation.  The blur is expensive when combined with
     left/top/width/height changes — with transform-only animation the
     compositor can cache the blur layer.  We still keep the blur on
     the static (start) state for visual quality. */
  backdrop-filter: blur(20px) saturate(140%);
  -webkit-backdrop-filter: blur(20px) saturate(140%);
  transition:
    transform 560ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 180ms ease;
}

.add-motion-ghost--active {
  opacity: 0;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
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

.hero-search--active {
  position: relative;
}

.hero-search--active::after {
  content: '';
  position: absolute;
  top: 4px;
  right: 4px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-primary, #07c160);
}

.filter-reset-fade-enter-active,
.filter-reset-fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.filter-reset-fade-enter-from,
.filter-reset-fade-leave-to {
  opacity: 0;
  transform: scale(0.8);
}

.hero-reset {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border: none;
  border-radius: 50%;
  background: var(--app-surface, #fff);
  color: var(--app-text-secondary, #666);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
  transition: transform 0.14s ease, opacity 0.14s ease;
}

.hero-reset:active {
  transform: scale(0.92);
  opacity: 0.8;
}

.hero-reset svg {
  width: 16px;
  height: 16px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
}

.hero-actions :deep(.mode-switch__item) {
  min-width: 48px;
  padding: 0 8px;
}
</style>

<style src="../assets/views/hero.css"></style>


