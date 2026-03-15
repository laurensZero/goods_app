<template>
  <div class="page search-page">
    <header v-if="!selectionMode" class="search-header">
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

    <header v-else class="selection-header">
      <button class="icon-btn" type="button" aria-label="退出多选" @click="exitSelectionMode">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M15 18L9 12L15 6" />
        </svg>
      </button>
      <span class="selection-title">已选择 {{ selectedIds.size }} 项</span>
      <button class="ghost-btn" type="button" @click="toggleSelectAll">
        {{ allSelected ? '取消全选' : '全选' }}
      </button>
    </header>

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
            <div class="section-head section-head--compact section-head--no-margin">
              <div class="section-head__copy">
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
                    <input v-model="filters.acquiredFrom" class="field-input" type="date">
                    <span class="range-gap">-</span>
                    <input v-model="filters.acquiredTo" class="field-input" type="date">
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

                <div v-if="storageLocationTree.length || hasUnassignedStorageLocation" class="field-block">
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
        <div class="goods-list">
          <GoodsCard
            v-for="item in results"
            :key="item.id"
            :item="item"
            :selected="selectedIds.has(item.id)"
            :selection-mode="selectionMode"
            @long-press="enterSelectionMode(item.id)"
            @toggle-select="toggleSelect(item.id)"
            @open-detail="openDetail(item.id)"
          />
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
      @edit="batchEdit"
    />
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { useGoodsStore } from '@/stores/goods'
import { usePresetsStore } from '@/stores/presets'
import { useFilterPresetsStore } from '@/stores/filterPresets'
import { useGoodsSelection } from '@/composables/useGoodsSelection'
import { addAndroidBackButtonListener } from '@/utils/androidBackButton'
import {
  GOODS_FILTER_BOOLEAN_OPTIONS,
  GOODS_FILTER_DATE_PRESET_OPTIONS,
  GOODS_FILTER_SORT_OPTIONS,
  GOODS_FILTER_SPECIAL_VALUES,
  applyGoodsFilters,
  countActiveGoodsFilters,
  createDefaultGoodsFilters,
  normalizeGoodsFilterConditions
} from '@/utils/goodsFilters'
import { buildStorageLocationPath, normalizeStorageLocationValue, splitStorageLocationPath } from '@/utils/storageLocations'
import SearchBar from '@/components/SearchBar.vue'
import AppSelect from '@/components/AppSelect.vue'
import GoodsCard from '@/components/GoodsCard.vue'
import EmptyState from '@/components/EmptyState.vue'
import GoodsBatchEditSheet from '@/components/GoodsBatchEditSheet.vue'
import GoodsSelectionActionBar from '@/components/GoodsSelectionActionBar.vue'
import GoodsDeleteConfirm from '@/components/GoodsDeleteConfirm.vue'
import StorageLocationFilterTree from '@/components/StorageLocationFilterTree.vue'

const store = useGoodsStore()
const presets = usePresetsStore()
const filterPresetsStore = useFilterPresetsStore()
const route = useRoute()
const router = useRouter()

const searchScope = computed(() => (route.query.scope === 'wishlist' ? 'wishlist' : 'collection'))
const searchScopeLabel = computed(() => (searchScope.value === 'wishlist' ? '心愿单' : '收藏库'))
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
const batchEditSheetRef = ref(null)
const pageBodyRef = ref(null)

let searchTimeout = null
let removeAndroidBackListener = null
let savedScrollTop = 0

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

function closeSelectionOverlays() {
  showDeleteConfirm.value = false
  batchEditSheetRef.value?.close()
}

function getSearchScrollTop() {
  const elTop = pageBodyRef.value?.scrollTop ?? 0
  const winTop = window.scrollY || document.documentElement.scrollTop || 0
  return elTop > 0 ? elTop : winTop
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
  exitSelectionMode,
  handleSelectionPopState
} = useGoodsSelection(results, {
  historyKey: selectionHistoryKey,
  onExit: closeSelectionOverlays,
  getScrollTop: getSearchScrollTop,
  restoreScrollTop: restoreSearchScrollTop
})

function handleBack() {
  if (selectionMode.value) {
    exitSelectionMode()
    return
  }

  navigateBackToHome()
}

function openDetail(id) {
  persistSearchState()
  router.push(`/detail/${id}`)
}

function navigateBackToHome() {
  const previousPath = window.history.state?.back
  if (previousPath === defaultBackPath.value) {
    router.back()
    return
  }

  if (route.fullPath !== defaultBackPath.value) {
    router.replace(defaultBackPath.value)
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

onMounted(async () => {
  restoreSearchState()

  if (savedScrollTop > 0) {
    await nextTick()
    restoreSearchScrollTop(savedScrollTop)
  }

  window.addEventListener('popstate', handleSelectionPopState)
  bindAndroidBackButton()
})

onBeforeUnmount(() => {
  if (searchTimeout) clearTimeout(searchTimeout)
  window.removeEventListener('popstate', handleSelectionPopState)
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

<style scoped>
.search-page,
.page-body {
  overflow-x: hidden;
}

.search-controls--selection {
  visibility: hidden;
  pointer-events: none;
}

.search-header,
.selection-header {
  position: sticky;
  top: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: calc(env(safe-area-inset-top) + 10px) var(--page-padding) 10px;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--app-glass-strong) 100%, transparent) 0%,
    color-mix(in srgb, var(--app-glass) 82%, transparent) 70%,
    rgba(245, 245, 247, 0) 100%
  );
  backdrop-filter: blur(24px) saturate(140%);
  -webkit-backdrop-filter: blur(24px) saturate(140%);
}

.icon-btn,
.ghost-btn,
.preset-delete {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.icon-btn {
  flex-shrink: 0;
  width: var(--icon-button-size);
  height: var(--icon-button-size);
  border: none;
  border-radius: 50%;
  background: var(--app-glass);
  border: 1px solid var(--app-glass-border);
  box-shadow: var(--app-shadow);
  color: var(--app-text);
}

.icon-btn svg,
.preset-delete svg,
.advanced-toggle__icon svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.icon-btn:active,
.ghost-btn:active,
.primary-btn:active,
.secondary-btn:active,
.chip:active,
.advanced-toggle__icon:active {
  transform: scale(0.96);
}

.header-search,
.selection-title {
  flex: 1;
  min-width: 0;
}

.selection-title {
  text-align: center;
  color: var(--app-text);
  font-size: 16px;
  font-weight: 600;
}

.content-section {
  padding: 0 var(--page-padding);
  margin-top: var(--section-gap);
}

.content-section--selection {
  padding-bottom: calc(env(safe-area-inset-bottom) + 92px);
}

.section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.section-head--compact {
  align-items: center;
}

.section-head--no-margin {
  margin-bottom: 0;
}

.section-head__copy {
  min-width: 0;
}

.advanced-toggle {
  width: 100%;
  padding: 16px 18px;
  border: none;
  border-radius: var(--radius-card);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
  text-align: left;
  transition: transform 0.14s ease, opacity 0.16s ease;
}

.advanced-toggle:active {
  transform: scale(0.988);
}

.head-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.field-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.section-label,
.field-label {
  color: var(--app-text-tertiary);
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.field-toggle {
  padding: 0;
  border: none;
  background: transparent;
  color: var(--app-text-secondary);
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
}

.section-title {
  margin-top: 4px;
  color: var(--app-text);
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.04em;
}

.section-title--sub {
  font-size: 22px;
  font-weight: 600;
}

.section-title--tight {
  margin-top: 2px;
}

.section-desc,
.muted-copy,
.preset-meta,
.advanced-summary {
  margin-top: 8px;
  color: var(--app-text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.section-desc--compact {
  margin-top: 6px;
}

.advanced-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}

.advanced-toggle__count {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
  font-size: 12px;
  font-weight: 600;
  vertical-align: middle;
}

.advanced-toggle__icon,
.surface-card {
  border-radius: var(--radius-card);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
}

.advanced-toggle__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  color: var(--app-text-secondary);
}

.advanced-toggle__arrow--open {
  transform: rotate(180deg);
}

.advanced-panel-wrap {
  display: grid;
  gap: 0;
}

.advanced-panel-enter-active,
.advanced-panel-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.advanced-panel-enter-from,
.advanced-panel-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.surface-card {
  width: 100%;
  padding: 18px;
}

.ghost-btn,
.primary-btn,
.secondary-btn {
  min-height: 40px;
  padding: 0 14px;
  border: none;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  transition: transform 0.16s ease, opacity 0.16s ease;
}

.ghost-btn {
  background: var(--app-glass);
  box-shadow: var(--app-shadow);
  color: var(--app-text);
}

.primary-btn {
  background: #141416;
  color: #fff;
}

.secondary-btn {
  background: var(--app-surface-soft);
  color: var(--app-text);
}

.primary-btn:disabled,
.secondary-btn:disabled {
  opacity: 0.42;
}

.preset-list {
  display: grid;
  gap: 10px;
}

.preset-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 10px;
  border-radius: 20px;
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
}

.preset-card--active {
  outline: 2px solid rgba(20, 20, 22, 0.08);
}

.preset-main {
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 6px 8px;
  border: none;
  border-radius: 14px;
  background: transparent;
  text-align: left;
}

.preset-name {
  overflow: hidden;
  color: var(--app-text);
  font-size: 15px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preset-delete {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 12px;
  background: var(--app-surface-soft);
  color: #d44b3f;
}

.preset-editor,
.filter-card,
.field-block {
  display: grid;
  gap: 12px;
}

.field-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.field-input {
  width: 100%;
  height: 48px;
  padding: 0 14px;
  border: 1px solid rgba(20, 20, 22, 0.08);
  border-radius: 16px;
  background: var(--app-surface);
  color: var(--app-text);
  outline: none;
}

.field-input::placeholder {
  color: var(--app-placeholder);
}

.range-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 10px;
}

.range-row--date {
  margin-top: 2px;
}

.range-gap {
  color: var(--app-text-tertiary);
  font-size: 14px;
  font-weight: 700;
}

.chip-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chip {
  padding: 8px 13px;
  border: none;
  border-radius: 999px;
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 600;
  transition: transform 0.16s ease, background 0.16s ease, color 0.16s ease;
}

.chip--active {
  background: #141416;
  color: #fff;
}

.location-tree {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 10px 8px;
}

.goods-list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--card-gap);
  min-width: 0;
}

@media (min-width: 600px) {
  .goods-list {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (min-width: 900px) {
  .goods-list {
    grid-template-columns: repeat(4, 1fr);
  }
}

@media (min-width: 1200px) {
  .goods-list {
    grid-template-columns: repeat(5, 1fr);
  }
}

:global(html.theme-dark) .search-header,
  :global(html.theme-dark) .selection-header {
    background: linear-gradient(180deg, rgba(18, 18, 22, 0.82) 0%, rgba(18, 18, 22, 0.56) 72%, rgba(15, 15, 16, 0) 100%);
  }

:global(html.theme-dark) .chip--active,
  :global(html.theme-dark) .primary-btn {
    background: #f5f5f7;
    color: #141416;
  }

:global(html.theme-dark) .preset-card--active {
    outline-color: rgba(255, 255, 255, 0.08);
  }
</style>
