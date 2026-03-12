<template>
  <div class="page page--transition search-page" :class="{ 'page--leaving': isPageLeaving }">
    <header v-if="!selectionMode" class="search-header">
      <button class="back-btn" type="button" aria-label="返回" @click="handleBack">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M15 18L9 12L15 6" />
        </svg>
      </button>
      <SearchBar v-model="keyword" placeholder="搜索名称、分类、IP…" autofocus class="header-search" />
    </header>

    <header v-else class="selection-header">
      <button class="sel-back-btn" type="button" aria-label="退出多选" @click="exitSelectionMode">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M15 18L9 12L15 6" />
        </svg>
      </button>
      <span class="sel-title">已选择 {{ selectedIds.size }} 项</span>
      <button class="sel-all-btn" type="button" @click="toggleSelectAll">
        {{ allSelected ? '取消全选' : '全选' }}
      </button>
    </header>

    <main ref="pageBodyRef" class="page-body">
      <section v-if="!selectionMode" class="filter-panel">
        <div v-if="categoryOptions.length" class="filter-row">
          <span class="filter-row-label">分类</span>
          <div class="filter-chips">
            <button
              v-for="opt in categoryOptions"
              :key="opt"
              type="button"
              :class="['filter-chip', { 'filter-chip--active': selectedCategory === opt }]"
              @click="selectedCategory = selectedCategory === opt ? '' : opt"
            >
              {{ opt }}
            </button>
          </div>
        </div>

        <div v-if="ipOptions.length" class="filter-row">
          <span class="filter-row-label">IP</span>
          <div class="filter-chips">
            <button
              v-for="opt in ipOptions"
              :key="opt"
              type="button"
              :class="['filter-chip', { 'filter-chip--active': selectedIp === opt }]"
              @click="selectedIp = selectedIp === opt ? '' : opt"
            >
              {{ opt }}
            </button>
          </div>
        </div>

        <div class="filter-row">
          <span class="filter-row-label filter-row-label--character">角色</span>
          <div class="filter-chips">
            <button
              v-for="opt in characterFilterOptions"
              :key="opt"
              type="button"
              :class="['filter-chip', { 'filter-chip--active': selectedCharacter === opt }]"
              @click="selectedCharacter = selectedCharacter === opt ? '' : opt"
            >
              {{ opt }}
            </button>
          </div>
        </div>
      </section>

      <section v-if="results.length > 0" :class="['results-section', { 'results-section--selection': selectionMode }]">
        <div class="section-head">
          <div>
            <p class="section-label">搜索结果</p>
            <h2 class="section-title">找到 {{ results.length }} 件收藏</h2>
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

      <section v-else-if="isFiltering" :class="['empty-wrap', { 'empty-wrap--selection': selectionMode }]">
        <EmptyState icon="🔍" title="没有匹配的收藏" :description="emptyDesc" />
      </section>

      <section v-else class="empty-wrap">
        <EmptyState
          icon="✨"
          title="搜索你的收藏"
          description="输入关键词，或使用上方筛选快速定位；分类、IP、角色名都支持直接搜索。"
        />
      </section>
    </main>

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
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { useGoodsStore } from '@/stores/goods'
import { usePageLeaveAnimation } from '@/composables/usePageLeaveAnimation'
import { useGoodsSelection } from '@/composables/useGoodsSelection'
import { addAndroidBackButtonListener } from '@/utils/androidBackButton'
import SearchBar from '@/components/SearchBar.vue'
import GoodsCard from '@/components/GoodsCard.vue'
import EmptyState from '@/components/EmptyState.vue'
import GoodsBatchEditSheet from '@/components/GoodsBatchEditSheet.vue'
import GoodsSelectionActionBar from '@/components/GoodsSelectionActionBar.vue'
import GoodsDeleteConfirm from '@/components/GoodsDeleteConfirm.vue'

const UNCATEGORIZED_OPTION = '未分类'
const NO_IP_OPTION = '未设置IP'
const NO_CHARACTER_OPTION = '未设置角色'
const SEARCH_STATE_HISTORY_KEY = 'searchViewState'
const HOME_PATH = '/home'

const store = useGoodsStore()
const route = useRoute()
const router = useRouter()
const { isPageLeaving } = usePageLeaveAnimation()

const keyword = ref('')
const selectedCategory = ref('')
const selectedIp = ref('')
const selectedCharacter = ref('')
const showDeleteConfirm = ref(false)
const showBatchEditSheet = ref(false)
const batchEditSheetRef = ref(null)
const pageBodyRef = ref(null)
let removeAndroidBackListener = null
let savedScrollTop = 0

function buildSearchState() {
  return {
    keyword: keyword.value,
    selectedCategory: selectedCategory.value,
    selectedIp: selectedIp.value,
    selectedCharacter: selectedCharacter.value,
  }
}

function hasSearchState(state) {
  return !!(
    state.keyword.trim()
    || state.selectedCategory
    || state.selectedIp
    || state.selectedCharacter
  )
}

function persistSearchState() {
  const state = buildSearchState()
  const nextState = { ...(window.history.state || {}) }

  if (!hasSearchState(state)) {
    delete nextState[SEARCH_STATE_HISTORY_KEY]
    window.history.replaceState(nextState, '')
    return
  }

  nextState[SEARCH_STATE_HISTORY_KEY] = {
    ...state,
    scrollTop: getSearchScrollTop(),
  }
  window.history.replaceState(nextState, '')
}

function restoreSearchState() {
  const state = window.history.state?.[SEARCH_STATE_HISTORY_KEY]
  if (!state || typeof state !== 'object') return

  keyword.value = typeof state.keyword === 'string' ? state.keyword : ''
  selectedCategory.value = typeof state.selectedCategory === 'string' ? state.selectedCategory : ''
  selectedIp.value = typeof state.selectedIp === 'string' ? state.selectedIp : ''
  selectedCharacter.value = typeof state.selectedCharacter === 'string' ? state.selectedCharacter : ''
  savedScrollTop = typeof state.scrollTop === 'number' ? state.scrollTop : 0
}

function clearSearchState() {
  const nextState = { ...(window.history.state || {}) }
  delete nextState[SEARCH_STATE_HISTORY_KEY]
  window.history.replaceState(nextState, '')
}

const categoryOptions = computed(() => {
  const categories = [...new Set(store.list.map((item) => String(item.category || '').trim()).filter(Boolean))]
  return store.list.some((item) => !String(item.category || '').trim())
    ? [UNCATEGORIZED_OPTION, ...categories]
    : categories
})

const ipOptions = computed(() => [
  ...(store.list.some((item) => !String(item.ip || '').trim()) ? [NO_IP_OPTION] : []),
  ...new Set(store.list.map((item) => String(item.ip || '').trim()).filter(Boolean))
])

const characterOptions = computed(() => [
  ...(store.list.some((item) => !Array.isArray(item.characters) || item.characters.length === 0) ? [NO_CHARACTER_OPTION] : []),
  ...new Set(
    store.list.flatMap((item) =>
      Array.isArray(item.characters)
        ? item.characters.map((character) => String(character).trim()).filter(Boolean)
        : []
    )
  )
])

const characterFilterOptions = computed(() =>
  characterOptions.value.includes(NO_CHARACTER_OPTION) ? [NO_CHARACTER_OPTION] : []
)

const isFiltering = computed(() =>
  keyword.value.trim() !== ''
    || selectedCategory.value !== ''
    || selectedIp.value !== ''
    || selectedCharacter.value !== ''
)

const emptyDesc = computed(() =>
  keyword.value.trim()
    ? `没有找到与“${keyword.value.trim()}”相关的谷子，试试更短的关键字。`
    : '当前筛选条件下没有匹配的收藏。'
)

const results = computed(() => {
  if (!isFiltering.value) return []

  const kw = keyword.value.trim().toLowerCase()

  return store.list.filter((item) => {
    const name = String(item.name || '')
    const category = String(item.category || '').trim()
    const ip = String(item.ip || '').trim()
    const characters = Array.isArray(item.characters) ? item.characters : []
    const tags = Array.isArray(item.tags) ? item.tags : []

    const kwMatch =
      !kw ||
      name.toLowerCase().includes(kw) ||
      category.toLowerCase().includes(kw) ||
      ip.toLowerCase().includes(kw) ||
      characters.some((character) => String(character).toLowerCase().includes(kw)) ||
      tags.some((tag) => String(tag).toLowerCase().includes(kw))

    const catMatch = !selectedCategory.value
      || (selectedCategory.value === UNCATEGORIZED_OPTION ? !category : category === selectedCategory.value)
    const ipMatch = !selectedIp.value
      || (selectedIp.value === NO_IP_OPTION ? !ip : ip === selectedIp.value)
    const characterMatch = !selectedCharacter.value
      || (selectedCharacter.value === NO_CHARACTER_OPTION
        ? characters.length === 0
        : characters.includes(selectedCharacter.value))

    return kwMatch && catMatch && ipMatch && characterMatch
  })
})

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
  historyKey: 'searchSelectionMode',
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

  if (previousPath === HOME_PATH) {
    router.back()
    return
  }

  if (route.path !== HOME_PATH) {
    router.replace(HOME_PATH)
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

.search-header,
.selection-header {
  position: sticky;
  top: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: calc(env(safe-area-inset-top) + 10px) var(--page-padding) 10px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--app-glass-strong) 100%, transparent) 0%, color-mix(in srgb, var(--app-glass) 82%, transparent) 70%, rgba(245, 245, 247, 0) 100%);
  backdrop-filter: blur(24px) saturate(140%);
  -webkit-backdrop-filter: blur(24px) saturate(140%);
}

.back-btn,
.sel-back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: var(--icon-button-size);
  height: var(--icon-button-size);
  border: none;
  border-radius: 50%;
  background: var(--app-glass);
  border: 1px solid var(--app-glass-border);
  box-shadow: var(--app-shadow);
  color: var(--app-text);
  transition: transform 0.16s ease, opacity 0.16s ease;
}

.back-btn:active,
.sel-back-btn:active {
  transform: scale(var(--press-scale-button));
}

.back-btn svg,
.sel-back-btn svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.header-search,
.sel-title {
  flex: 1;
  min-width: 0;
}

.sel-title {
  text-align: center;
  color: var(--app-text);
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.sel-all-btn {
  height: 40px;
  padding: 0 14px;
  border: none;
  border-radius: 999px;
  background: var(--app-glass);
  border: 1px solid var(--app-glass-border);
  box-shadow: var(--app-shadow);
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  transition: transform 0.16s ease, opacity 0.16s ease;
}

.sel-all-btn:active {
  transform: scale(0.96);
}

.filter-panel,
.results-section,
.empty-wrap {
  padding: 0 var(--page-padding);
}

.filter-panel {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.filter-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  gap: 8px;
  min-width: 0;
}

.filter-row-label {
  display: inline-flex;
  align-items: center;
  align-self: center;
  width: 28px;
  color: var(--app-text-tertiary);
  font-size: 12px;
  font-weight: 600;
}

.filter-row-label--character {
  width: auto;
}

.filter-row-label--character::after {
  content: '可直接搜索角色名';
  margin-left: 8px;
  color: var(--app-text-tertiary);
  font-size: 11px;
  font-weight: 400;
  white-space: nowrap;
}

.filter-chips {
  display: flex;
  flex: 1;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  gap: 6px;
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  padding-bottom: 2px;
  touch-action: pan-x;
}

.filter-chips::-webkit-scrollbar {
  display: none;
}

.filter-chip {
  flex-shrink: 0;
  padding: 5px 12px;
  border: 1.5px solid var(--app-border);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.7);
  color: var(--app-text);
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  transition: all 0.15s ease;
}

.filter-chip:active {
  transform: scale(0.96);
}

.filter-chip--active {
  border-color: #141416;
  background: #141416;
  color: #ffffff;
}

.results-section,
.empty-wrap {
  margin-top: var(--section-gap);
  min-width: 0;
}

.results-section--selection,
.empty-wrap--selection {
  padding-bottom: calc(env(safe-area-inset-bottom) + 92px);
}

.section-head {
  margin-bottom: 14px;
}

.section-label {
  color: var(--app-text-tertiary);
  font-size: 13px;
}

.section-title {
  margin-top: 4px;
  color: var(--app-text);
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.03em;
}

.goods-list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--card-gap);
  min-width: 0;
}

@media (max-width: 599px) {
  .filter-row-label--character::after {
    display: none;
  }
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

  /* 筛选面板改为两列并排（分类 & IP 各一列，角色独占一行） */
  .filter-panel {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    column-gap: 24px;
  }

  .filter-row:last-child {
    grid-column: 1 / -1;
  }
}

@media (min-width: 1200px) {
  .goods-list {
    grid-template-columns: repeat(5, 1fr);
  }
}

@media (prefers-color-scheme: dark) {
  /* 搜索/选择顶栏：白色渐变改深色渐变 */
  .search-header,
  .selection-header {
    background:
      linear-gradient(180deg, rgba(18, 18, 22, 0.82) 0%, rgba(18, 18, 22, 0.56) 72%, rgba(15, 15, 16, 0) 100%);
  }

  /* 返回 / 全选 按钮 */
  .back-btn,
  .sel-back-btn,
  .sel-all-btn {
    background: var(--app-glass);
    border-color: var(--app-glass-border);
  }

  /* 筛选胶囊 */
  .filter-chip {
    background: rgba(255, 255, 255, 0.06);
  }

  .filter-chip--active {
    background: #f5f5f7;
    border-color: #f5f5f7;
    color: #141416;
  }
}
</style>
