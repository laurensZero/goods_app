<template>
  <div :class="['page', 'search-page', { 'search-page--restoring': !searchDisplayReady }]">
    <header v-show="!selectionMode" class="search-header">
      <button class="icon-btn" type="button" aria-label="返回" @click="handleBack">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M15 18L9 12L15 6" />
        </svg>
      </button>
      <SearchBar
        v-model="filters.keyword"
        placeholder="搜索名称、分类、IP、角色、备注"
        autofocus
        class="header-search"
      />
    </header>

    <HomeSelectionHeader
      :show="selectionMode"
      :selected-count="selectedIds.size"
      :all-selected="allSelected"
      :header-style="selectionHeaderStyle"
      @back="exitSelectionMode"
      @toggle-all="toggleSelectAll"
    />

    <main ref="pageBodyRef" class="page-body">
      <div
        class="search-controls"
        :class="{ 'search-controls--selection': selectionMode }"
        :aria-hidden="selectionMode ? 'true' : undefined"
      >
        <section class="content-section">
          <button
            class="advanced-toggle"
            type="button"
            :aria-expanded="advancedExpanded"
            @click="advancedExpanded = !advancedExpanded"
          >
            <div class="advanced-toggle__inner">
              <div class="advanced-toggle__hero">
                <p class="section-label">高级筛选</p>
                <h1 class="section-title section-title--sub section-title--tight">高级筛选</h1>
                <div class="advanced-summary">
                  <span>{{ searchScopeLabel }}</span>
                  <span v-if="activeFilterCount > 0" class="advanced-toggle__count">已启用 {{ activeFilterCount }}</span>
                </div>
              </div>

              <span class="advanced-toggle__icon" aria-hidden="true">
                <svg :class="{ 'advanced-toggle__arrow--open': advancedExpanded }" viewBox="0 0 24 24" fill="none">
                  <path d="M7 10L12 15L17 10" />
                </svg>
              </span>
            </div>
          </button>
        </section>

        <Transition name="advanced-panel">
          <div v-if="advancedExpanded" class="advanced-panel-wrap">
            <section class="content-section">
              <div class="section-head">
                <div>
                  <p class="section-label">筛选方案</p>
                  <h2 class="section-title section-title--sub">保存组合</h2>
                </div>
                <div class="head-actions">
                  <button class="ghost-btn" type="button" @click="togglePresetEditor">
                    {{ presetEditorVisible ? '收起' : '保存当前' }}
                  </button>
                  <button v-if="activeFilterCount > 0" class="ghost-btn" type="button" @click="resetFilters">重置</button>
                </div>
              </div>

              <div v-if="searchPresets.length" class="preset-list">
                <article
                  v-for="preset in searchPresets"
                  :key="preset.id"
                  :class="['preset-card', { 'preset-card--active': activePresetId === preset.id }]"
                >
                  <button class="preset-main" type="button" @click="applyPreset(preset)">
                    <span class="preset-name">{{ preset.name }}</span>
                    <span class="preset-meta">{{ formatPresetSummary(preset.conditions) }}</span>
                  </button>
                  <button class="preset-delete" type="button" aria-label="删除方案" @click.stop="removePreset(preset.id)">
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M18 6L6 18" />
                      <path d="M6 6L18 18" />
                    </svg>
                  </button>
                </article>
              </div>
              <div v-else class="surface-card muted-copy">常用组合可以存成方案，下次一键套用。</div>

              <div v-if="presetEditorVisible" class="surface-card preset-editor">
                <label class="field-label" for="preset-name-input">方案名称</label>
                <input
                  id="preset-name-input"
                  v-model.trim="presetDraftName"
                  class="field-input"
                  type="text"
                  maxlength="24"
                  placeholder="例如：崩铁徽章 50+ 近半年"
                >
                <div class="head-actions">
                  <button class="primary-btn" type="button" :disabled="!canSavePreset" @click="saveNewPreset">保存新方案</button>
                  <button
                    v-if="activePresetId"
                    class="secondary-btn"
                    type="button"
                    :disabled="!canSavePreset"
                    @click="updateActivePreset"
                  >
                    更新当前
                  </button>
                </div>
              </div>
            </section>

            <section class="content-section">
              <div class="section-head">
                <div>
                  <p class="section-label">筛选条件</p>
                  <h2 class="section-title section-title--sub">组合条件</h2>
                </div>
              </div>

              <div class="surface-card filter-card">
                <div class="field-grid">
                  <div class="field-block">
                    <label class="field-label">价格区间</label>
                    <div class="range-row">
                      <input
                        v-model="filters.priceMin"
                        class="field-input"
                        type="number"
                        min="0"
                        inputmode="decimal"
                        placeholder="最低价"
                      >
                      <span class="range-gap">-</span>
                      <input
                        v-model="filters.priceMax"
                        class="field-input"
                        type="number"
                        min="0"
                        inputmode="decimal"
                        placeholder="最高价"
                      >
                    </div>
                  </div>

                  <div class="field-block">
                    <label class="field-label">排序方式</label>
                    <AppSelect v-model="filters.sortBy" :options="GOODS_FILTER_SORT_OPTIONS" placeholder="请选择排序" />
                  </div>

                  <div class="field-block">
                    <label class="field-label">备注</label>
                    <AppSelect v-model="filters.hasNote" :options="GOODS_FILTER_BOOLEAN_OPTIONS" placeholder="不限" />
                  </div>
                </div>

                <div v-if="searchScope === 'collection'" class="field-block">
                  <label class="field-label">收藏状态</label>
                  <div class="chip-wrap">
                    <button
                      v-for="option in GOODS_FILTER_COLLECT_STATUS_OPTIONS"
                      :key="option.value"
                      type="button"
                      :class="['chip', { 'chip--active': filters.collectStatuses.includes(option.value) }]"
                      @click="toggleFilterValue('collectStatuses', option.value)"
                    >
                      {{ option.label }}
                    </button>
                  </div>
                </div>

                <div class="field-block">
                  <label class="field-label">购入时间</label>
                  <div class="chip-wrap">
                    <button
                      v-for="option in GOODS_FILTER_DATE_PRESET_OPTIONS"
                      :key="option.value"
                      type="button"
                      :class="['chip', { 'chip--active': filters.acquiredPreset === option.value }]"
                      @click="filters.acquiredPreset = option.value"
                    >
                      {{ option.label }}
                    </button>
                  </div>
                  <div v-if="filters.acquiredPreset === 'custom'" class="range-row range-row--date">
                    <button class="date-field" type="button" @click="openAcquiredDatePicker('from')">
                      <span :class="{ 'date-field__value--placeholder': !filters.acquiredFrom }">
                        {{ filters.acquiredFrom || '开始日期' }}
                      </span>
                      <svg class="date-field__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <rect x="3" y="5" width="18" height="16" rx="3" />
                        <path d="M8 3V7" />
                        <path d="M16 3V7" />
                        <path d="M3 10H21" />
                      </svg>
                    </button>
                    <span class="range-gap">-</span>
                    <button class="date-field" type="button" @click="openAcquiredDatePicker('to')">
                      <span :class="{ 'date-field__value--placeholder': !filters.acquiredTo }">
                        {{ filters.acquiredTo || '结束日期' }}
                      </span>
                      <svg class="date-field__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <rect x="3" y="5" width="18" height="16" rx="3" />
                        <path d="M8 3V7" />
                        <path d="M16 3V7" />
                        <path d="M3 10H21" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div v-if="categoryOptions.length" class="field-block">
                  <label class="field-label">分类</label>
                  <div class="chip-wrap">
                    <button
                      v-for="option in categoryOptions"
                      :key="option.value"
                      type="button"
                      :class="['chip', { 'chip--active': filters.categories.includes(option.value) }]"
                      @click="toggleFilterValue('categories', option.value)"
                    >
                      {{ option.label }}
                    </button>
                  </div>
                </div>

                <div v-if="ipOptions.length" class="field-block">
                  <label class="field-label">IP</label>
                  <div class="chip-wrap">
                    <button
                      v-for="option in ipOptions"
                      :key="option.value"
                      type="button"
                      :class="['chip', { 'chip--active': filters.ips.includes(option.value) }]"
                      @click="toggleFilterValue('ips', option.value)"
                    >
                      {{ option.label }}
                    </button>
                  </div>
                </div>

                <div v-if="characterOptions.length" class="field-block">
                  <div class="field-head">
                    <label class="field-label">角色</label>
                    <button
                      v-if="hasCollapsedCharacterOptions"
                      class="field-toggle"
                      type="button"
                      @click="showAllCharacterOptions = !showAllCharacterOptions"
                    >
                      {{ showAllCharacterOptions ? '收起角色' : '展开角色' }}
                    </button>
                  </div>
                  <div class="chip-wrap">
                    <button
                      v-for="option in visibleCharacterOptions"
                      :key="option.value"
                      type="button"
                      :class="['chip', { 'chip--active': filters.characters.includes(option.value) }]"
                      @click="toggleFilterValue('characters', option.value)"
                    >
                      {{ option.label }}
                    </button>
                  </div>
                </div>

                <div v-if="showStorageLocationFilter && (storageLocationTree.length || hasUnassignedStorageLocation)" class="field-block">
                  <label class="field-label">存放位置</label>

                  <div class="location-tree">
                    <button
                      v-if="hasUnassignedStorageLocation"
                      type="button"
                      :class="['chip', { 'chip--active': filters.storageLocations.includes(GOODS_FILTER_SPECIAL_VALUES.noStorageLocation) }]"
                      @click="toggleFilterValue('storageLocations', GOODS_FILTER_SPECIAL_VALUES.noStorageLocation)"
                    >
                      未设置位置
                    </button>

                    <StorageLocationFilterTree
                      v-for="node in storageLocationTree"
                      :key="node.path"
                      :node="node"
                      :selected-values="filters.storageLocations"
                      @toggle="toggleFilterValue('storageLocations', $event)"
                    />
                  </div>
                </div>
              </div>
            </section>
          </div>
        </Transition>
      </div>

      <section v-if="results.length > 0" :class="['content-section', { 'content-section--selection': selectionMode }]">
        <div class="section-head">
          <div>
            <p class="section-label">搜索结果</p>
            <h2 class="section-title section-title--sub">找到 {{ results.length }} 件谷子</h2>
            <p v-if="activePresetName" class="section-desc section-desc--compact">当前方案：{{ activePresetName }}</p>
          </div>
        </div>
        <div class="goods-list-container">
          <div v-if="beforeSpacerHeight > 0" :style="{ height: beforeSpacerHeight + 'px' }"></div>
          <div
            v-for="row in visibleRows"
            :key="row.startIndex"
            class="goods-row"
          >
            <SearchGoodsCard
              v-for="(item, i) in row.items"
              :key="item.id"
              :item="item"
              :data-goods-id="item.id"
              :data-scroll-index="row.startIndex + i"
              data-scroll-anchor="goods-card"
              :selected="selectedIds.has(item.id)"
              :selection-mode="selectionMode"
              @long-press="enterSelectionMode(item.id)"
              @toggle-select="toggleSelect(item.id)"
              @open-detail="openDetail"
            />
          </div>
          <div v-if="afterSpacerHeight > 0" :style="{ height: afterSpacerHeight + 'px' }"></div>
        </div>
      </section>

      <section v-else-if="isFiltering" :class="['content-section', { 'content-section--selection': selectionMode }]">
        <EmptyState icon="🔍" title="没有匹配的收藏" :description="emptyDesc" />
      </section>

      <section v-else class="content-section">
        <EmptyState
          icon="✨"
          title="从搜索开始找谷子"
          description="输入关键词，或在需要时展开高级筛选组合条件。"
        />
      </section>
    </main>

    <GoodsDeleteConfirm v-model:show="showDeleteConfirm" :selected-count="selectedIds.size" @confirm="confirmDelete" />
    <GoodsBatchEditSheet
      ref="batchEditSheetRef"
      v-model:show="showBatchEditSheet"
      :selected-count="selectedIds.size"
      :allow-mark-owned="searchScope === 'wishlist'"
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

    <AppDatePicker
      v-model:show="showAcquiredDatePicker"
      v-model="acquiredDatePickerValue"
      :z-index="2000"
      :is-tablet="isTabletViewport"
      :title="acquiredDatePickerTarget === 'from' ? '选择购入开始日期' : '选择购入结束日期'"
      :min-date="minDate"
      :max-date="maxDate"
      @confirm="onAcquiredDateConfirm"
    />
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { useGoodsStore } from '@/stores/goods'
import { usePresetsStore } from '@/stores/presets'
import { useFilterPresetsStore } from '@/stores/filterPresets'
import { useGoodsSelection } from '@/composables/goods/useGoodsSelection'
import { useTabletViewport } from '@/composables/useTabletViewport'
import { addAndroidBackButtonListener } from '@/utils/platform/androidBackButton'
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
import { getHeroBackDurationMs, hasPendingGoodsHeroBack, prepareGoodsHeroForward, playGoodsHeroBack } from '@/utils/platform/nativeGoodsHeroTransition'
import { clearRouteTransitionFallback, runWithRouteTransition, setPendingDetailReturnPath } from '@/utils/routeTransition'
import SearchBar from '@/components/common/SearchBar.vue'
import AppSelect from '@/components/common/AppSelect.vue'
import AppDatePicker from '@/components/common/AppDatePicker.vue'
import SearchGoodsCard from '@/components/goods/SearchGoodsCard.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import HomeSelectionHeader from '@/components/home/HomeSelectionHeader.vue'
import GoodsBatchEditSheet from '@/components/goods/GoodsBatchEditSheet.vue'
import GoodsSelectionActionBar from '@/components/goods/GoodsSelectionActionBar.vue'
import ShareSheet from '@/components/goods/ShareSheet.vue'
import GoodsDeleteConfirm from '@/components/goods/GoodsDeleteConfirm.vue'
import StorageLocationFilterTree from '@/components/storage/StorageLocationFilterTree.vue'
import { formatDate } from '@/utils/format'

const store = useGoodsStore()
const presets = usePresetsStore()
const filterPresetsStore = useFilterPresetsStore()
const route = useRoute()
const router = useRouter()
const { isTabletViewport } = useTabletViewport()

const searchScope = computed(() => (route.query.scope === 'wishlist' ? 'wishlist' : 'collection'))
const searchScopeLabel = computed(() => (searchScope.value === 'wishlist' ? '心愿单' : '收藏库'))
const showStorageLocationFilter = computed(() => searchScope.value === 'collection')
const searchStateHistoryKey = computed(() => `searchViewState:${searchScope.value}`)
const defaultBackPath = computed(() => (searchScope.value === 'wishlist' ? '/wishlist' : '/home'))
const selectionHistoryKey = computed(() => (
  route.query.scope === 'wishlist' ? 'searchSelectionMode:wishlist' : 'searchSelectionMode:collection'
))
const sourceList = computed(() => (
  searchScope.value === 'wishlist' ? store.wishlistViewList : store.collectionViewList
))

const filters = reactive(createDefaultGoodsFilters({ hasImage: 'any' }))
const debouncedKeyword = ref('')
const activePresetId = ref('')
const activePresetName = ref('')
const advancedExpanded = ref(false)
const presetEditorVisible = ref(false)
const presetDraftName = ref('')
const showDeleteConfirm = ref(false)
const showBatchEditSheet = ref(false)
const showShareSheet = ref(false)
const showAcquiredDatePicker = ref(false)
const acquiredDatePickerTarget = ref('from')
const acquiredDatePickerValue = ref(toDatePickerValue(formatDate(new Date(), 'YYYY-MM-DD')))
const batchEditSheetRef = ref(null)
const pageBodyRef = ref(null)
const selectionHeaderTop = ref(0)
const SELECTION_HEADER_HEIGHT = 64
const searchDisplayReady = ref(!hasPendingGoodsHeroBack(route.fullPath))
const minDate = new Date(2000, 0, 1)
const maxDate = new Date(2100, 11, 31)

const selectionHeaderStyle = computed(() => ({
  '--selection-header-top': `${selectionHeaderTop.value}px`
}))

let searchTimeout = null
let removeAndroidBackListener = null
let savedScrollTop = 0
let isRestoringSearchState = false

const searchPresets = computed(() => filterPresetsStore.getPresetsByScope(searchScope.value))

watch(
  () => filters.keyword,
  (value) => {
    if (searchTimeout) clearTimeout(searchTimeout)
    searchTimeout = setTimeout(() => {
      debouncedKeyword.value = String(value || '').trim().toLowerCase()
    }, 180)
  },
  { immediate: true }
)

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

const categoryOptions = computed(() => buildOptionList(
  sourceList.value.map((item) => item.category),
  sourceList.value.some((item) => !String(item.category || '').trim())
    ? { label: '未分类', value: GOODS_FILTER_SPECIAL_VALUES.uncategorized }
    : null
))

const ipOptions = computed(() => buildOptionList(
  sourceList.value.map((item) => item.ip),
  sourceList.value.some((item) => !String(item.ip || '').trim())
    ? { label: '未设置 IP', value: GOODS_FILTER_SPECIAL_VALUES.noIp }
    : null
))

const characterSourceList = computed(() => {
  if (filters.ips.length === 0) return sourceList.value

  return sourceList.value.filter((item) => {
    const itemIp = String(item.ip || '').trim()
    return filters.ips.some((value) => (
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

const showAllCharacterOptions = ref(false)
const hasCollapsedCharacterOptions = computed(() => (
  characterOptions.value.some((option) => option.value !== GOODS_FILTER_SPECIAL_VALUES.noCharacter)
))
const visibleCharacterOptions = computed(() => {
  if (showAllCharacterOptions.value) return characterOptions.value

  return characterOptions.value.filter((option) => (
    option.value === GOODS_FILTER_SPECIAL_VALUES.noCharacter
  ))
})

watch(
  () => filters.characters.slice(),
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
    const nextCharacters = filters.characters.filter((value) => allowedValues.has(value))

    if (nextCharacters.length !== filters.characters.length) {
      filters.characters = nextCharacters
    }
  },
  { immediate: true }
)

const hasUnassignedStorageLocation = computed(() => (
  sourceList.value.some((item) => !normalizeStorageLocationValue(item.storageLocation))
))

const storageLocationCounts = computed(() => {
  const counts = new Map()

  for (const item of sourceList.value) {
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

const effectiveFilters = computed(() => normalizeSearchFilters({
  ...filters,
  keyword: debouncedKeyword.value
}))
const activeFilterCount = computed(() => countActiveGoodsFilters(effectiveFilters.value))
const isFiltering = computed(() => activeFilterCount.value > 0)
const results = computed(() => (
  isFiltering.value ? applyGoodsFilters(sourceList.value, effectiveFilters.value) : []
))

const SEARCH_ROW_GAP = 12
const SEARCH_OVERSCAN_ROWS = 8
const SEARCH_OVERSCAN_ROWS_WIDE = 6
const SEARCH_MAX_RENDER_CARDS = 128
const SEARCH_INITIAL_RENDER_ROWS = 6
const SEARCH_ESTIMATED_ROW_HEIGHT = 340

function getSearchCols() {
  const w = window.innerWidth
  if (w >= 1200) return 5
  if (w >= 900) return 4
  if (w >= 600) return 3
  return 2
}

const measuredRowHeight = ref(0)

function getRowHeight() {
  return measuredRowHeight.value || SEARCH_ESTIMATED_ROW_HEIGHT
}
function getRowSpan() {
  return getRowHeight() + SEARCH_ROW_GAP
}

let pageScrollRaf = 0
const visibleStartRow = ref(0)
const visibleRenderRows = ref(SEARCH_INITIAL_RENDER_ROWS)

const resultRows = computed(() => {
  const cols = getSearchCols()
  const list = results.value
  const rows = []
  for (let i = 0; i < list.length; i += cols) {
    rows.push({ startIndex: i, items: list.slice(i, i + cols) })
  }
  return rows
})

const visibleEndRow = computed(() => (
  Math.min(resultRows.value.length, visibleStartRow.value + visibleRenderRows.value)
))
const visibleRows = computed(() => resultRows.value.slice(visibleStartRow.value, visibleEndRow.value))
const beforeSpacerHeight = computed(() => visibleStartRow.value * getRowSpan())
const afterSpacerHeight = computed(() => Math.max(0, (resultRows.value.length - visibleEndRow.value) * getRowSpan()))

function syncSearchViewport(scrollTop = 0) {
  const normalizedTop = Math.max(0, Number(scrollTop) || 0)
  const vpHeight = pageBodyRef.value?.clientHeight || window.innerHeight || 800
  const cols = getSearchCols()
  const rowSpan = getRowSpan()
  const overscanRows = cols >= 5 ? SEARCH_OVERSCAN_ROWS_WIDE : SEARCH_OVERSCAN_ROWS
  const viewportRows = Math.max(1, Math.ceil(vpHeight / rowSpan))
  const startRow = Math.max(0, Math.floor(normalizedTop / rowSpan) - overscanRows)
  const renderRows = Math.min(
    Math.max(SEARCH_INITIAL_RENDER_ROWS, viewportRows + overscanRows * 2),
    Math.ceil(SEARCH_MAX_RENDER_CARDS / cols)
  )
  visibleStartRow.value = startRow
  visibleRenderRows.value = renderRows
}

function measureRowHeight() {
  const container = pageBodyRef.value?.querySelector('.goods-list-container')
  const firstRow = container?.querySelector('.goods-row')
  if (firstRow) {
    const h = firstRow.getBoundingClientRect().height
    if (h > 50) measuredRowHeight.value = h
  }
}

function handleSearchScroll() {
  if (pageScrollRaf) return
  pageScrollRaf = window.requestAnimationFrame(() => {
    pageScrollRaf = 0
    syncSearchViewport(pageBodyRef.value?.scrollTop || window.scrollY || 0)
  })
}

watch(resultRows, () => {
  if (isRestoringSearchState) return
  visibleStartRow.value = 0
  if (pageBodyRef.value) pageBodyRef.value.scrollTop = 0
  nextTick(() => {
    measureRowHeight()
    syncSearchViewport(0)
  })
})

const canSavePreset = computed(() => presetDraftName.value.trim().length > 0 && activeFilterCount.value > 0)
const emptyDesc = computed(() => (
  debouncedKeyword.value
    ? `没有找到与“${debouncedKeyword.value}”相关的谷子，试试更短的关键词或放宽筛选条件。`
    : '当前筛选条件下没有匹配的收藏。'
))

function assignFilters(nextFilters) {
  const normalized = normalizeSearchFilters(nextFilters)
  Object.assign(filters, normalized)
  debouncedKeyword.value = normalized.keyword.toLowerCase()
}

function buildSearchState() {
  return {
    filters: normalizeSearchFilters(filters),
    activePresetId: activePresetId.value,
    activePresetName: activePresetName.value,
    advancedExpanded: advancedExpanded.value,
    scrollTop: getSearchScrollTop()
  }
}

function hasSearchState(state) {
  return (
    countActiveGoodsFilters(state.filters) > 0 ||
    Boolean(state.activePresetId) ||
    Boolean(state.activePresetName) ||
    Boolean(state.advancedExpanded) ||
    Number(state.scrollTop || 0) > 0
  )
}

function persistSearchState() {
  const state = buildSearchState()
  const nextState = { ...(window.history.state || {}) }

  if (!hasSearchState(state)) {
    delete nextState[searchStateHistoryKey.value]
    window.history.replaceState(nextState, '')
    return
  }

  nextState[searchStateHistoryKey.value] = state
  window.history.replaceState(nextState, '')
}

function restoreSearchState() {
  const state = window.history.state?.[searchStateHistoryKey.value]
  if (!state || typeof state !== 'object') return

  assignFilters(state.filters)
  activePresetId.value = typeof state.activePresetId === 'string' ? state.activePresetId : ''
  activePresetName.value = typeof state.activePresetName === 'string' ? state.activePresetName : ''
  advancedExpanded.value = state.advancedExpanded === true
  savedScrollTop = typeof state.scrollTop === 'number' ? state.scrollTop : 0
}

function clearSearchState() {
  const nextState = { ...(window.history.state || {}) }
  delete nextState[searchStateHistoryKey.value]
  window.history.replaceState(nextState, '')
}

function formatPresetSummary(conditions) {
  const normalized = normalizeSearchFilters(conditions)
  const segments = []

  if (normalized.categories.length) segments.push(normalized.categories.slice(0, 2).join(' / '))
  if (normalized.ips.length) segments.push(normalized.ips.slice(0, 2).join(' / '))
  if (normalized.storageLocations.length) segments.push(normalized.storageLocations[0])
  if (normalized.priceMin !== '' || normalized.priceMax !== '') {
    segments.push(`￥${normalized.priceMin || '0'} - ${normalized.priceMax || '不限'}`)
  }
  if (normalized.acquiredPreset !== 'all') {
    const preset = GOODS_FILTER_DATE_PRESET_OPTIONS.find((item) => item.value === normalized.acquiredPreset)
    if (preset) segments.push(preset.label)
  }

  return segments.length ? segments.slice(0, 3).join(' · ') : '仅关键词或基础条件'
}

function toggleFilterValue(key, value) {
  const current = Array.isArray(filters[key]) ? [...filters[key]] : []
  filters[key] = current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value]
}

function resetFilters() {
  assignFilters(createDefaultGoodsFilters({ hasImage: 'any' }))
  activePresetId.value = ''
  activePresetName.value = ''
  presetDraftName.value = ''
}

function openAcquiredDatePicker(target) {
  acquiredDatePickerTarget.value = target
  const dateString = target === 'from' ? filters.acquiredFrom : (filters.acquiredTo || filters.acquiredFrom)
  acquiredDatePickerValue.value = toDatePickerValue(dateString)
  showAcquiredDatePicker.value = true
}

function onAcquiredDateConfirm({ selectedValues }) {
  const [year, month, day] = normalizeDateParts(selectedValues.join('-'))
  const dateString = `${year}-${month}-${day}`

  if (acquiredDatePickerTarget.value === 'from') {
    filters.acquiredFrom = dateString
    if (filters.acquiredTo && filters.acquiredTo < dateString) {
      filters.acquiredTo = dateString
    }
  } else {
    filters.acquiredTo = dateString
    if (filters.acquiredFrom && filters.acquiredFrom > dateString) {
      filters.acquiredFrom = dateString
    }
  }

  acquiredDatePickerValue.value = [year, month, day]
  showAcquiredDatePicker.value = false
}

function toDatePickerValue(dateString) {
  const [year, month, day] = normalizeDateParts(dateString)
  return [year, month, day]
}

function normalizeDateParts(dateString) {
  const [fallbackYear, fallbackMonth, fallbackDay] = formatDate(new Date(), 'YYYY-MM-DD').split('-')
  if (!dateString) return [fallbackYear, fallbackMonth, fallbackDay]

  const [year = fallbackYear, month = fallbackMonth, day = fallbackDay] = `${dateString}`.split('-')
  return [year, month.padStart(2, '0'), day.padStart(2, '0')]
}

function togglePresetEditor() {
  presetEditorVisible.value = !presetEditorVisible.value
  presetDraftName.value = presetEditorVisible.value && activePresetName.value ? activePresetName.value : ''
}

async function saveNewPreset() {
  if (!canSavePreset.value) return

  const saved = await filterPresetsStore.savePreset({
    name: presetDraftName.value.trim(),
    scope: searchScope.value,
    conditions: normalizeSearchFilters(filters)
  })

  if (!saved) return

  activePresetId.value = saved.id
  activePresetName.value = saved.name
  presetDraftName.value = saved.name
  presetEditorVisible.value = false
}

async function updateActivePreset() {
  if (!activePresetId.value || !canSavePreset.value) return

  const saved = await filterPresetsStore.savePreset({
    id: activePresetId.value,
    name: presetDraftName.value.trim() || activePresetName.value,
    scope: searchScope.value,
    conditions: normalizeSearchFilters(filters)
  })

  if (!saved) return

  activePresetId.value = saved.id
  activePresetName.value = saved.name
  presetDraftName.value = saved.name
  presetEditorVisible.value = false
}

function applyPreset(preset) {
  assignFilters(preset.conditions)
  activePresetId.value = preset.id
  activePresetName.value = preset.name
  presetDraftName.value = preset.name
  advancedExpanded.value = true
}

async function removePreset(id) {
  if (activePresetId.value === id) {
    activePresetId.value = ''
    activePresetName.value = ''
  }

  await filterPresetsStore.removePreset(id)
}

const selectedGoodsItems = computed(() =>
  results.value.filter((item) => selectedIds.value.has(item.id))
)

function closeSelectionOverlays() {
  showDeleteConfirm.value = false
  batchEditSheetRef.value?.close()
  showShareSheet.value = false
}

function getSearchScrollTop() {
  const elTop = pageBodyRef.value?.scrollTop ?? 0
  const winTop = window.scrollY || document.documentElement.scrollTop || 0
  return elTop > 0 ? elTop : winTop
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

function restoreSearchScrollTop(top) {
  if (top == null || top <= 0) return

  const applyScroll = () => {
    if (pageBodyRef.value) pageBodyRef.value.scrollTop = top
    try { document.documentElement.scrollTop = top } catch {}
    try { document.body.scrollTop = top } catch {}
    try { window.scrollTo({ top, behavior: 'instant' }) } catch { window.scrollTo(0, top) }
  }

  applyScroll()
  setTimeout(applyScroll, 50)
  setTimeout(applyScroll, 120)
}

const {
  selectionMode,
  selectedIds,
  allSelected,
  enterSelectionMode,
  toggleSelect,
  toggleSelectAll,
  exitSelectionModeQuiet,
  exitSelectionMode
} = useGoodsSelection(results, {
  historyKey: selectionHistoryKey,
  manageHistory: false,
  onExit: closeSelectionOverlays,
  getScrollTop: getSearchScrollTop,
  restoreScrollTop: restoreSearchScrollTop
})

watch(selectionMode, (active) => {
  if (active) {
    nextTick(() => updateSelectionHeaderPosition())
  } else {
    selectionHeaderTop.value = 0
  }
})

function handleBack() {
  if (selectionMode.value) {
    exitSelectionMode()
    return
  }

  navigateBackToHome()
}

function openDetail(payload) {
  const id = payload?.id || payload
  persistSearchState()
  
  clearRouteTransitionFallback()
  const escaped = CSS.escape(id)
  const sourceElTarget = payload?.sourceEl || document.querySelector(`[data-goods-id="${escaped}"]`) || null
  prepareGoodsHeroForward({ goodsId: id, sourceEl: sourceElTarget })
  
  setPendingDetailReturnPath(route.fullPath)
  router.push(`/detail/${id}`)
}

function navigateBackToHome() {
  if (route.fullPath !== defaultBackPath.value) {
    runWithRouteTransition(
      () => router.replace(defaultBackPath.value),
      {
        direction: 'back',
        preferFallback: true,
        detailTransitionKind: 'search-back'
      }
    )
  }
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

  navigateBackToHome()
  event.preventDefault()
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

function batchEdit() {
  if (selectedIds.value.size === 0) return
  showBatchEditSheet.value = true
}

function batchShare() {
  if (selectedIds.value.size === 0) return
  showShareSheet.value = true
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

async function applyBatchEditPayload(payload) {
  await store.updateMultipleGoods(selectedIds.value, payload)
  exitSelectionModeQuiet()
}

function resolveGoodsCardCover(id) {
  const escaped = CSS.escape(id)
  const rootEl = document.querySelector(`[data-goods-id="${escaped}"]`) || null
  if (rootEl) {
    const coverInsideCard = rootEl.querySelector(`[data-goods-hero-id="${escaped}"]`) || null
    if (coverInsideCard) return coverInsideCard
  }
  const directCover = document.querySelector(`[data-goods-hero-id="${escaped}"]`) || null
  if (directCover) return directCover
  return rootEl
}

function tryPlayNativeGoodsBackHero() {
  return playGoodsHeroBack({
    currentPath: route.fullPath,
    resolveTargetEl: resolveGoodsCardCover
  })
}

let goodsBackHeroRetryRaf = null
function scheduleGoodsBackHeroRetry() {
  cancelGoodsBackHeroRetry()
  let retryCount = 0
  function retry() {
    if (retryCount >= 8) {
      if (hasPendingGoodsHeroBack(route.fullPath)) {
        clearRouteTransitionFallback()
      }
      return
    }
    const played = tryPlayNativeGoodsBackHero()
    if (played) return
    retryCount++
    goodsBackHeroRetryRaf = window.requestAnimationFrame(retry)
  }
  goodsBackHeroRetryRaf = window.requestAnimationFrame(retry)
}

function cancelGoodsBackHeroRetry() {
  if (!goodsBackHeroRetryRaf) return
  window.cancelAnimationFrame(goodsBackHeroRetryRaf)
  goodsBackHeroRetryRaf = null
}

let selectionScrollRaf = 0

function onSelectionScroll() {
  if (selectionScrollRaf) return
  selectionScrollRaf = window.requestAnimationFrame(() => {
    selectionScrollRaf = 0
    if (selectionMode.value) updateSelectionHeaderPosition()
  })
}

onMounted(async () => {
  isRestoringSearchState = true
  restoreSearchState()

  // 1. 先渲染 scroll=0 的内容
  syncSearchViewport(0)
  await nextTick()
  measureRowHeight()

  // 2. 绑定滚动监听
  window.addEventListener('scroll', onSelectionScroll, { passive: true })
  window.addEventListener('scroll', handleSearchScroll, { passive: true })
  pageBodyRef.value?.addEventListener('scroll', handleSearchScroll, { passive: true })
  bindAndroidBackButton()

  // 3. 应用滚动位置，等布局稳定后重新同步
  if (savedScrollTop > 0) {
    restoreSearchScrollTop(savedScrollTop)
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
    syncSearchViewport(savedScrollTop)
    await nextTick()
    measureRowHeight()
  }
  isRestoringSearchState = false
  searchDisplayReady.value = true

  // 4. 一切就绪后再播 hero 动画
  if (hasPendingGoodsHeroBack(route.fullPath)) {
    scheduleGoodsBackHeroRetry()
  }
})

onBeforeUnmount(() => {
  cancelGoodsBackHeroRetry()
  if (searchTimeout) clearTimeout(searchTimeout)
  window.removeEventListener('scroll', onSelectionScroll)
  window.removeEventListener('scroll', handleSearchScroll)
  pageBodyRef.value?.removeEventListener('scroll', handleSearchScroll)
  unbindAndroidBackButton()
  document.body.classList.remove('selection-active')
})

onBeforeRouteLeave((to) => {
  if (to.name === 'detail') {
    persistSearchState()
    return
  }

  clearSearchState()
})
</script>

<style scoped src="../assets/views/SearchView.css"></style>
