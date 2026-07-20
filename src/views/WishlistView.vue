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
          <h1 class="hero-title">{{ t('common.wishlist') }}</h1>
        </div>

        <div class="hero-actions">
          <button :class="['hero-search', { 'hero-search--active': searchActiveFilterCount > 0 }]" type="button" :aria-label="t('home.wishlist.searchAria')" @click="openSearch">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20L16.65 16.65" />
            </svg>
          </button>

          <button
            v-if="searchActiveFilterCount > 0"
            class="hero-reset"
            type="button"
            :aria-label="t('home.resetFilter')"
            @click="searchResetFilters()"
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M18 6L6 18" />
              <path d="M6 6L18 18" />
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
          :total-count="goodsList.length"
          :trend-items="goodsList"
          :tips-title="t('home.wishlist.budgetTipsTitle')"
          :tips-items="wishlistTipsItems"
        />
      </section>

      <HomeGoodsToolbar
        v-if="goodsList.length > 0"
        :section-label="t('home.wishlist.sectionLabel')"
        :title="t('home.wishlist.allTargets')"
        :total-quantity="totalQuantity"
        :sort-direction="sortDirection"
        :sort-mode="sortMode"
        :sort-options="HOME_SORT_OPTIONS"
        :is-sort-animating="isSortAnimating"
        :display-density="displayDensity"
        :density-modes="densityModes"
        :show-timeline-toggle="false"
        :show-daily-rec-button="false"
        :active-filter-count="searchActiveFilterCount"
        :group-display-mode="groupDisplayMode"
        :group-display-options="groupDisplayOptions"
        @toggle-sort="toggleSortDirection"
        @set-sort-mode="setSortMode"
        @set-density="setDisplayDensityWithFlip"
        @set-group-display-mode="setGroupDisplayMode"
      />

      <GoodsListSkeleton v-if="!store.isReady" />

      <GoodsCardGridSection
        v-else-if="displayList.length > 0"
        ref="goodsGridSectionRef"
        :items="visibleDisplayList"
        :density="displayDensity"
        :grid-style="goodsGridStyle"
        :index-offset="visibleGoodsStartIndex"
        :before-spacer-height="visibleGoodsHeadSpacerHeight"
        :after-spacer-height="visibleGoodsTailSpacerHeight"
        :transitioning="isDensityAnimating"
        :is-sort-animating="isSortAnimating"
        :selection-mode="selectionMode"
        :selected-ids="selectedIds"
        :window-width="windowWidth"
        @long-press="enterSelectionMode"
        @toggle-select="toggleSelect"
        @open-detail="openDetail"
        @open-group="openGroupDetail"
      />

      <section v-else class="empty-wrap">
        <EmptyState
          icon="♡"
          :title="t('home.wishlist.noRecords')"
          :description="t('home.wishlist.noRecordsDesc')"
          :action-text="t('home.wishlist.addWish')"
          @action="openAddSheet"
        />
      </section>
    </main>

    <Teleport v-if="isWishlistActive" to="body">
      <ScrollTopButton :show="showScrollTopButton && !selectionMode" @click="scrollToTop" />

      <button v-if="!selectionMode" class="fab" type="button" :aria-label="t('home.wishlist.addWish')" @click="goToAdd">
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
      @batch-add="handleBatchAdd"
      @import="goToImport"
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
      allow-mark-owned
      @apply="applyBatchEditPayload"
    />

    <GoodsSelectionActionBar
      :show="selectionMode && !showBatchEditSheet"
      :selected-count="selectedIds.size"
      :selected-group-count="selectedGroupCount"
      :selected-goods-count="selectedGoodsCount"
      :cart-item-count="cartItemCount"
      :add-to-group-mode="!!selectedGroupTargetId"
      @delete="batchDelete"
      @dissolve-group="batchDissolveGroups"
      @share="batchShare"
      @edit="batchEdit"
      @add-to-cart="batchAddToCart"
      @create-group="openCreateGroupSheet"
      @add-to-group="addToSelectedGroup"
    />

    <ShareSheet :show="showShareSheet" :goods-items="selectedGoodsItems" @close="showShareSheet = false" />

    <CreateGroupSheet
      v-model:show="showCreateGroupSheet"
      group-type="wishlist"
      :initial-goods-ids="Array.from(selectedIds)"
      @created="handleGroupCreated"
    />

    <GroupFolderSheet
      v-model:show="showGroupFolder"
      :group-id="activeGroupId"
      :density="displayDensity"
      @before-navigate="markGroupRestore"
    />

    <SearchFilterPopup
      v-model:visible="showSearchPopup"
      :filters="searchFilters"
      :category-options="searchCategoryOptions"
      :ip-options="searchIpOptions"
      :character-options="searchCharacterOptions"
      :visible-character-options="searchVisibleCharacterOptions"
      :has-collapsed-character-options="searchHasCollapsedCharacterOptions"
      :show-all-character-options="searchShowAllCharacterOptions"
      :storage-location-tree="[]"
      :has-unassigned-storage-location="false"
      :active-filter-count="searchActiveFilterCount"
      scope="wishlist"
      :search-presets="searchPresetsList"
      :active-preset-id="searchActivePresetId"
      :active-preset-name="searchActivePresetName"
      :format-preset-summary="searchFormatPresetSummary"
      @update-keyword="handleSearchUpdateKeyword"
      @update-field="handleSearchUpdateField"
      @toggle-filter="handleSearchToggleFilter"
      @toggle-character-expand="handleSearchToggleCharacterExpand"
      @reset="searchResetFilters"
      @select-preset="searchApplyPreset"
      @save-preset="searchSaveNewPreset"
      @update-preset="searchUpdateActivePreset"
      @remove-preset="searchRemovePreset"
    />

    <AppToast :message="toastMsg" />
  </div>
</template>

<script setup>
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { useGoodsStore } from '@/stores/goods'
import { useGoodsGroupStore } from '@/stores/goodsGroup'
import { useExchangeRateStore } from '@/stores/exchangeRate'
import { useGoodsSelection } from '@/composables/goods/useGoodsSelection'
import { useHomePreferences } from '@/composables/home/useHomePreferences'
import { createPageScrollRestore, usePageScrollBinder } from '@/composables/scroll'
import { useDensityGridViewport } from '@/composables/home/useDensityGridViewport'
import { useGoodsGridDensityFlip } from '@/composables/home/useGoodsGridDensityFlip'
import { addAndroidBackButtonListener } from '@/utils/platform/androidBackButton'
import { HOME_MOTION_CSS_VARS } from '@/constants/homeMotion'
import GoodsListSkeleton from '@/components/common/GoodsListSkeleton.vue'
import GoodsCardGridSection from '@/components/goods/GoodsCardGridSection.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import SummaryCard from '@/components/common/SummaryCard.vue'
import AddMethodSheet from '@/components/goods/AddMethodSheet.vue'
import { pickLinkedLocalImages } from '@/utils/image/localImage'
import HomeSelectionHeader from '@/components/home/HomeSelectionHeader.vue'
import HomeGoodsToolbar from '@/components/home/HomeGoodsToolbar.vue'
import HomeViewModeSwitch from '@/components/home/HomeViewModeSwitch.vue'
import ScrollTopButton from '@/components/common/ScrollTopButton.vue'
import GoodsBatchEditSheet from '@/components/goods/GoodsBatchEditSheet.vue'
import GoodsSelectionActionBar from '@/components/goods/GoodsSelectionActionBar.vue'
import CreateGroupSheet from '@/components/goods/CreateGroupSheet.vue'
import GroupFolderSheet from '@/components/goods/GroupFolderSheet.vue'
import ShareSheet from '@/components/goods/ShareSheet.vue'
import DangerConfirmDialog from '@/components/common/DangerConfirmDialog.vue'
import AppToast from '@/components/common/AppToast.vue'
import { HOME_SORT_OPTIONS, sortHomeGoodsList } from '@/utils/goods/homeSort'
import { scrollToTopAnimated } from '@/utils/scrollToTopAnimated'
import { addToCart, fetchGoodsDetailForCart } from '@/utils/mihoyo/index'
import { loadMihoyoCookieState } from '@/utils/mihoyo/cookie'
import { getNativeMihoyoCookie } from '@/utils/mihoyo/nativeImport'
import { useToast } from '@/composables/useToast'
import { clearRouteTransitionFallback, runWithRouteTransition, setPendingDetailReturnPath } from '@/utils/routeTransition'
import { prepareGoodsHeroForward, isGoodsHeroAnimating } from '@/utils/platform/nativeGoodsHeroTransition'
import { setImagePreloadPaused } from '@/utils/image/cache'
import { useGoodsBackHero } from '@/composables/goods/useGoodsBackHero'
import { useGoodsSearch } from '@/composables/goods/useGoodsSearch'
import SearchFilterPopup from '@/components/goods/SearchFilterPopup.vue'
import { usePresetsStore } from '@/stores/presets'
import { useFilterPresetsStore } from '@/stores/filterPresets'

defineOptions({ name: 'WishlistView' })

const { t } = useI18n()

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

const HOME_TOP_OPTIONS = computed(() => [
  { value: 'goods', label: t('common.collection') },
  { value: 'wishlist', label: t('nav.tabWishlist') },
  { value: 'stats', label: t('nav.tabStats') }
])
const SCROLL_TOP_BUTTON_THRESHOLD = 900
const SELECTION_HEADER_HEIGHT = 64
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
const GOODS_GRID_MAX_RENDER_CARDS_DEFAULT = 72
const TABLET_BREAKPOINT = 900

function getMaxRenderCards(density) {
  const config = GOODS_GRID_MAX_RENDER_CARDS_MAP[density] || { mobile: 54, tablet: 72 }
  return windowWidth.value >= TABLET_BREAKPOINT ? config.tablet : config.mobile
}
const ROW_HEIGHT_MAP = {
  comfortable: 308,
  standard: 272,
  compact: 236
}

const router = useRouter()
const route = useRoute()
const store = useGoodsStore()
const presetsStore = usePresetsStore()
const filterPresetsStore = useFilterPresetsStore()
const goodsGroupStore = useGoodsGroupStore()
const exchangeRate = useExchangeRateStore()
const pageBodyRef = ref(null)
const goodsGridSectionRef = ref(null)
const windowWidth = ref(window.innerWidth)
const showAddSheet = ref(false)
const showDeleteConfirm = ref(false)
const showBatchEditSheet = ref(false)
const showShareSheet = ref(false)
const showCreateGroupSheet = ref(false)
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
let pageScrollRaf = 0
let topJumpMaskTimer = 0
let isRouteLeaving = false

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
  toggleSortDirection,
  setSortMode,
  setGroupDisplayMode,
  restoreHomePreferences
} = useHomePreferences(windowWidth, {
  allowTimeline: false,
  storageKeys: {
    gridDensity: 'goods-app:wishlist-grid-density',
    sortDirection: 'goods-app:wishlist-sort-direction',
    sortMode: 'goods-app:wishlist-sort-mode',
    groupDisplayMode: 'goods-app:wishlist-group-display-mode',
    expandedTimelineItem: 'goods-app:wishlist-expanded-item-unused'
  }
})

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
} = useGoodsSearch(computed(() => store.wishlistViewList), { scope: 'wishlist' })

const showSearchPopup = ref(false)

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
} = createPageScrollRestore('wishlist')(pageBodyRef)

const { bindPageScroll, unbindPageScroll } = usePageScrollBinder({ getScrollEl, markScrollSource, handlePageScroll })

const {
  tryPlayNativeGoodsBackHero,
  cancelGoodsBackHeroRetry,
  clearDeferredRestoreTimer: clearWishlistBackHeroDeferredRestoreTimer,
  scheduleGoodsBackHeroRetry
} = useGoodsBackHero({ getScrollEl, rootRef: pageBodyRef, maxRetryFrames: 40, guardTimeoutMs: 620 })

const baseGoodsList = computed(() => store.wishlistViewList)
const _wishlistTotals = computed(() => {
  let qty = 0
  let val = 0

  // Build set of goodsIds belonging to manual-price wishlist groups
  const manualGroupMemberIds = new Set()
  const manualGroups = new Map()
  for (const group of goodsGroupStore.wishlistGroups) {
    if (group.summaryMode === 'manual') {
      manualGroups.set(group.id, group)
      for (const item of goodsGroupStore.groupItemsOf(group.id)) {
        manualGroupMemberIds.add(item.goodsId)
      }
    }
  }

  for (const item of searchFilteredList.value) {
    qty += item.quantityNumber
    if (!manualGroupMemberIds.has(item.id)) {
      val += item.totalValueNumber
    }
  }

  // Add manual group totals (converted to CNY)
  for (const [, group] of manualGroups) {
    const amount = Number(group.totalAmount) || 0
    val += exchangeRate.convertToCNY(amount, group.currency || 'CNY')
  }

  return { qty, val: val.toFixed(2) }
})
const totalQuantity = computed(() => _wishlistTotals.value.qty)
const totalValue = computed(() => _wishlistTotals.value.val)
const wishlistTipsItems = computed(() => [
  t('home.wishlist.budgetTip1'),
  t('home.wishlist.budgetTip2'),
  t('home.wishlist.budgetTip3'),
  t('home.wishlist.budgetTip4'),
  t('home.wishlist.budgetTip5')
])

function getInitialVisibleCount() {
  return Math.max(getResponsiveCols(displayDensity.value) * INITIAL_RENDER_ROWS, 24)
}

const visibleGoodsStartIndex = ref(0)
const visibleGoodsRenderCount = ref(getInitialVisibleCount())
const shouldVirtualizeGoodsList = computed(() => displayList.value.length > getMaxRenderCards(displayDensity.value))
const visibleGoodsEndIndex = computed(() =>
  shouldVirtualizeGoodsList.value
    ? Math.min(displayList.value.length, visibleGoodsStartIndex.value + visibleGoodsRenderCount.value)
    : displayList.value.length
)

const goodsList = computed(() => sortHomeGoodsList(searchFilteredList.value, sortMode.value, sortDirection.value))

// Goods groups — merged into displayList with goods
const groupViewItems = computed(() => {
  const goodsMap = new Map(store.list.map(g => [g.id, g]))
  const viewMap = new Map(store.viewList.map(g => [g.id, g]))
  return goodsGroupStore.wishlistGroups.map(group => {
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
const hasSelectedGroup = computed(() => [...selectedIds.value].some(id => groupIdsSet.value.has(id)))
const selectedGroupTargetId = computed(() => {
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
  displayList.value.slice(visibleGoodsStartIndex.value, visibleGoodsEndIndex.value)
)
const GROUP_RESTORE_KEY = '__groupRestoreW'
const showGroupFolder = ref(false)
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

watch(showGroupFolder, (open) => {
  if (!open && !navigatingFromGroup) {
    sessionStorage.removeItem(GROUP_RESTORE_KEY)
  }
  navigatingFromGroup = false
})
const visibleGoodsList = computed(() =>
  shouldVirtualizeGoodsList.value
    ? goodsList.value.slice(visibleGoodsStartIndex.value, visibleGoodsEndIndex.value)
    : goodsList.value
)

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

const goodsGridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${getResponsiveCols(displayDensity.value)}, minmax(0, 1fr))`
}))

const visibleGoodsHeadSpacerHeight = computed(() => {
  if (!shouldVirtualizeGoodsList.value) return 0
  const cols = getResponsiveCols(displayDensity.value)
  const headRows = Math.floor(visibleGoodsStartIndex.value / cols)
  if (headRows <= 0) return 0

  const rowHeight = ROW_HEIGHT_MAP[displayDensity.value] || 272
  return headRows * rowHeight + Math.max(0, headRows - 1) * GOODS_GRID_ROW_GAP
})

const visibleGoodsTailSpacerHeight = computed(() => {
  if (!shouldVirtualizeGoodsList.value) return 0
  const remainingItems = Math.max(0, displayList.value.length - visibleGoodsEndIndex.value)
  if (!remainingItems) return 0

  const cols = getResponsiveCols(displayDensity.value)
  const rowHeight = ROW_HEIGHT_MAP[displayDensity.value] || 272
  const remainingRows = Math.ceil(remainingItems / cols)
  return remainingRows > 0
    ? remainingRows * rowHeight + Math.max(0, remainingRows - 1) * GOODS_GRID_ROW_GAP
    : 0
})

const selectedGoodsItems = computed(() =>
  goodsList.value.filter((item) => selectedIds.value.has(item.id))
)

function closeSelectionOverlays() {
  showDeleteConfirm.value = false
  batchEditSheetRef.value?.close()
  showAddSheet.value = false
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

function resolveGoodsViewportHeight(options = {}) {
  const { useFlipViewport = false, viewportHeight = 0 } = options
  if (Number.isFinite(viewportHeight) && viewportHeight > 0) return viewportHeight
  return useFlipViewport
    ? getFlipViewportHeight()
    : (getScrollEl()?.clientHeight || window.innerHeight || 800)
}

function syncVirtualGoodsViewport(scrollTop = 0, options = {}) {
  if (!shouldVirtualizeGoodsList.value) {
    visibleGoodsStartIndex.value = 0
    visibleGoodsRenderCount.value = displayList.value.length
    return
  }

  const normalizedTop = Math.max(0, Number(scrollTop) || 0)
  const viewportHeight = resolveGoodsViewportHeight(options)
  const cols = getResponsiveCols(displayDensity.value)
  const rowHeight = ROW_HEIGHT_MAP[displayDensity.value] || 272
  const rowSpan = rowHeight + GOODS_GRID_ROW_GAP
  const overscanRows = cols >= 5 ? GOODS_GRID_OVERSCAN_ROWS_WIDE : GOODS_GRID_OVERSCAN_ROWS
  // 根据密度模式和设备类型选择对应的最大渲染卡片数
  const maxRenderCards = getMaxRenderCards(displayDensity.value)
  const viewportRows = Math.max(1, Math.ceil(Math.max(viewportHeight, rowHeight) / rowSpan))
  const startRow = Math.max(0, Math.floor(normalizedTop / rowSpan) - overscanRows)
  const renderRows = Math.max(INITIAL_RENDER_ROWS, viewportRows + overscanRows * 2)
  const startIndex = Math.min(displayList.value.length, startRow * cols)
  const remainingItems = Math.max(0, displayList.value.length - startIndex)
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

function syncVisibleGoodsCount(scrollTop = 0, options = {}) {
  syncVirtualGoodsViewport(scrollTop, options)
}
function syncVisibleTimelineMonthCount() {}

watch(
  [() => displayList.value.length, displayDensity, sortDirection, sortMode, windowWidth],
  () => {
    syncVisibleGoodsCount(readScrollTop(), { useFlipViewport: true })
  },
  { immediate: true }
)

function updateScrollTopButtonVisibility() {
  showScrollTopButton.value = readScrollTop() >= SCROLL_TOP_BUTTON_THRESHOLD
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

function getGoodsListEl() {
  return goodsGridSectionRef.value?.goodsListEl?.value || goodsGridSectionRef.value?.goodsListEl || null
}

// ---- image preload throttle (Android fling detection) ----
const isAndroidNative = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent || '')
let imagePreloadResumeTimer = 0
let lastImageScrollTop = 0
let lastImageScrollAt = 0

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
    syncVisibleGoodsCount(scrollTop)
    if (selectionMode.value) updateSelectionHeaderPosition()
    updateScrollTopButtonVisibility()
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

function openDetail(id) {
  const payload = typeof id === 'object' && id !== null ? id : { id }
  const goodsId = payload.id
  saveScrollPosition(true, `wishlist:openDetail:${goodsId}`)
  clearRouteTransitionFallback()
  prepareGoodsHeroForward({ goodsId, sourceEl: payload.sourceEl || null })
  setPendingDetailReturnPath(route.fullPath)
  router.push(`/detail/${goodsId}`).catch(() => {
    wishlistDisplayReady.value = true
  })
}

function openSearch() {
  showSearchPopup.value = true
}

function handleSearchUpdateKeyword(value) { searchFilters.keyword = value }
function handleSearchUpdateField({ key, value }) { searchFilters[key] = value }
function handleSearchToggleFilter({ key, value }) { searchToggleFilterValue(key, value) }
function handleSearchToggleCharacterExpand() { searchShowAllCharacterOptions.value = !searchShowAllCharacterOptions.value }

function persistHomeMode(mode) {
  const normalizedMode = mode === 'recharge' ? 'recharge' : 'goods'
  localStorage.setItem(HOME_MODE_STORAGE_KEY, normalizedMode)
  window.dispatchEvent(new CustomEvent(HOME_MODE_EVENT, {
    detail: { mode: normalizedMode }
  }))
}

function switchTopTab(nextMode) {
  const SUB_ORDER = ['/home', '/wishlist', '/leaderboard/characters']
  const fi = SUB_ORDER.indexOf(route.path)
  const toPath = nextMode === 'goods' ? '/home' : nextMode === 'stats' ? '/leaderboard/characters' : '/wishlist'
  const ti = SUB_ORDER.indexOf(toPath)
  const direction = (fi !== -1 && ti !== -1 && ti < fi) ? 'forward' : 'back'

  if (nextMode === 'goods') {
    persistCollectionTab('goods')
    persistHomeMode('goods')
    saveScrollPosition(true, 'wishlist:navigateToGoods')
    runWithRouteTransition(
      () => router.push('/home'),
      {
        direction,
        preferFallback: true
      }
    )
    return
  }

  if (nextMode === 'stats') {
    persistCollectionTab('stats')
    saveScrollPosition(true, 'wishlist:navigateToStats')
    runWithRouteTransition(
      () => router.push('/leaderboard/characters'),
      {
        direction,
        preferFallback: true
      }
    )
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

let shouldScrollToTopOnActivated = false

async function navigateFromAddSheet(path, reason) {
  saveScrollPosition(true, reason)
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

async function handleBatchAdd() {
  showAddSheet.value = false
  const images = await pickLinkedLocalImages()
  if (!images.length) return
  saveScrollPosition(true, 'wishlist:handleBatchAdd')
  wishlistDisplayReady.value = false
  try {
    await router.push({ name: 'batch-add', state: { batchImages: JSON.stringify(images), isWishlist: true } })
  } catch {
    wishlistDisplayReady.value = true
  }
}

function goToImport() {
  shouldScrollToTopOnActivated = true
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
  if (showSearchPopup.value) {
    showSearchPopup.value = false
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

function batchDelete() {
  if (selectedIds.value.size === 0) return
  showDeleteConfirm.value = true
}

async function confirmDelete() {
  showDeleteConfirm.value = false
  await store.removeMultipleGoods(selectedIds.value)
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

// 批量加入米游铺购物车
const { toastMsg, showToast } = useToast()
const cartItemCount = ref(0)
const isBatchAddingToCart = ref(false)

async function getMihoyoCookie() {
  // 先尝试 Web 端存储
  try {
    const cookieState = await loadMihoyoCookieState()
    if (cookieState.cookie) return cookieState.cookie
  } catch {
    // ignore
  }
  // 再尝试安卓原生端
  try {
    const nativeCookie = await getNativeMihoyoCookie()
    if (nativeCookie) return nativeCookie
  } catch {
    // ignore
  }
  return ''
}

async function batchAddToCart() {
  if (selectedIds.value.size === 0 || isBatchAddingToCart.value) return

  const cookie = await getMihoyoCookie()
  if (!cookie) {
    showToast(t('toast.pleaseLoginMihoyo'))
    return
  }

  // 获取有 goodsId 的选中物品
  const itemsWithGoodsId = selectedGoodsItems.value.filter(item => item.goodsId)
  if (itemsWithGoodsId.length === 0) {
    showToast(t('toast.cannotGetSkuInfo'))
    return
  }

  isBatchAddingToCart.value = true
  let successCount = 0
  let failCount = 0
  let cartFull = false

  for (const item of itemsWithGoodsId) {
    if (cartFull) break

    try {
      // 获取商品详情（SKU信息）
      const { shopCode, skus } = await fetchGoodsDetailForCart(item.goodsId)
      if (skus.length === 0) {
        failCount++
        continue
      }

      // 尝试匹配 SKU
      let skuId = skus[0].id
      const savedVariant = String(item.variant || '').trim()
      if (savedVariant && skus.length > 1) {
        const matchedSku = skus.find(sku =>
          sku.text.includes(savedVariant) || savedVariant.includes(sku.text)
        )
        if (matchedSku) skuId = matchedSku.id
      }

      // 加入购物车
      const result = await addToCart({
        goodsId: item.goodsId,
        skuId,
        shopCode,
        nums: 1,
        cookie
      })

      if (result.success) {
        successCount++
        cartItemCount.value++
      } else if (result.cartFull) {
        cartFull = true
      } else {
        failCount++
      }
    } catch {
      failCount++
    }

    // 避免请求太快，添加小延迟
    await new Promise(resolve => setTimeout(resolve, 200))
  }

  isBatchAddingToCart.value = false

  // 显示结果
  if (successCount > 0 && failCount === 0) {
    showToast(t('toast.batchAddToCartSuccess', { count: successCount }))
  } else if (successCount > 0 && failCount > 0) {
    showToast(t('toast.batchAddToCartPartial', { success: successCount, fail: failCount }))
  } else if (cartFull) {
    showToast(t('toast.cartFull'))
  } else {
    showToast(t('toast.batchAddToCartFailed'))
  }
}

onMounted(async () => {
  isRouteLeaving = false
  persistCollectionTab('wishlist')
  const didResetOnReload = resetStoredScrollOnReload()
  if (didResetOnReload) {
    clearDisplayedScrollPosition()
  }
  wishlistDisplayReady.value = true
  restoreHomePreferences()
  window.addEventListener('resize', handleResize, { passive: true })
  await nextTick()
  syncVisibleGoodsCount()
  bindPageScroll()
  await restorePendingScrollPosition(syncVisibleGoodsCount, syncVisibleTimelineMonthCount)
  await nextTick()
  wishlistDisplayReady.value = true
  window.requestAnimationFrame(() => {
    tryPlayNativeGoodsBackHero()
  })
  updateScrollTopButtonVisibility()
  window.addEventListener('popstate', handleSelectionPopState)
  bindAndroidBackButton()
})

onActivated(async () => {
  isRouteLeaving = false
  persistCollectionTab('wishlist')
  isWishlistActive.value = true
  cancelGoodsBackHeroRetry()
  clearWishlistBackHeroDeferredRestoreTimer()

  // Restore group folder sheet if returning from detail that was opened from the sheet
  const restoreGroupId = sessionStorage.getItem(GROUP_RESTORE_KEY)
  const isGroupRestore = !!restoreGroupId
  if (isGroupRestore) {
    sessionStorage.removeItem(GROUP_RESTORE_KEY)
    activeGroupId.value = restoreGroupId
    showGroupFolder.value = true
  }
  if (shouldScrollToTopOnActivated) {
    shouldScrollToTopOnActivated = false
    clearDisplayedScrollPosition()
    clearStoredScrollState()
    wishlistDisplayReady.value = true
    bindPageScroll()
    updateScrollTopButtonVisibility()
    bindAndroidBackButton()
    return
  }
  if (shouldMaskWishlistDisplay()) {
    wishlistDisplayReady.value = false
  }
  await restoreActivatedScrollPosition(syncVisibleGoodsCount, syncVisibleTimelineMonthCount)
  await nextTick()
  wishlistDisplayReady.value = true
  if (!isGroupRestore) {
    // Don't run hero back here when sheet is being restored —
    // GroupFolderSheet handles it via onSheetOpened
    scheduleGoodsBackHeroRetry()
  }
  bindPageScroll()
  updateScrollTopButtonVisibility()
  bindAndroidBackButton()
})

onDeactivated(() => {
  isWishlistActive.value = false
  cancelGoodsBackHeroRetry()
  clearWishlistBackHeroDeferredRestoreTimer()
  cancelPendingRestore()
  if (!hasPendingRestore() && !isRouteLeaving) {
    rememberCurrentScrollPosition()
  }
  exitSelectionModeQuiet()
  unbindPageScroll()
  unbindAndroidBackButton()
})

onBeforeUnmount(() => {
  cancelGoodsBackHeroRetry()
  clearWishlistBackHeroDeferredRestoreTimer()
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
  if (!hasPendingRestore() && !isRouteLeaving) {
    rememberCurrentScrollPosition()
  }
  exitSelectionModeQuiet()
})

onBeforeRouteLeave(() => {
  isRouteLeaving = true
  saveScrollPosition(false, 'wishlist:onBeforeRouteLeave')
  if (pageScrollRaf) {
    window.cancelAnimationFrame(pageScrollRaf)
    pageScrollRaf = 0
  }
  unbindPageScroll()
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
  gap: 12px;
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
