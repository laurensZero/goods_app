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

    <main class="page-body">
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

        <div v-if="characterOptions.length" class="filter-row">
          <span class="filter-row-label">角色</span>
          <div class="filter-chips">
            <button
              v-for="opt in characterOptions"
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
          description="输入关键字，或用上方筛选快速定位；分类、IP、角色都支持直接筛空值。"
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
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { useRouter } from 'vue-router'
import { useGoodsStore } from '@/stores/goods'
import { usePageLeaveAnimation } from '@/composables/usePageLeaveAnimation'
import { useGoodsSelection } from '@/composables/useGoodsSelection'
import SearchBar from '@/components/SearchBar.vue'
import GoodsCard from '@/components/GoodsCard.vue'
import EmptyState from '@/components/EmptyState.vue'
import GoodsBatchEditSheet from '@/components/GoodsBatchEditSheet.vue'
import GoodsSelectionActionBar from '@/components/GoodsSelectionActionBar.vue'
import GoodsDeleteConfirm from '@/components/GoodsDeleteConfirm.vue'

const UNCATEGORIZED_OPTION = '未分类'
const NO_IP_OPTION = '未设置IP'
const NO_CHARACTER_OPTION = '未设置角色'

const store = useGoodsStore()
const router = useRouter()
const { isPageLeaving } = usePageLeaveAnimation()

const keyword = ref('')
const selectedCategory = ref('')
const selectedIp = ref('')
const selectedCharacter = ref('')
const showDeleteConfirm = ref(false)
const showBatchEditSheet = ref(false)
const batchEditSheetRef = ref(null)
let nativeBackButtonHandle = null

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

    const kwMatch =
      !kw ||
      name.toLowerCase().includes(kw) ||
      category.toLowerCase().includes(kw) ||
      ip.toLowerCase().includes(kw) ||
      characters.some((character) => String(character).toLowerCase().includes(kw))

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
  onExit: closeSelectionOverlays
})

function handleBack() {
  if (selectionMode.value) {
    exitSelectionMode()
    return
  }

  router.back()
}

function openDetail(id) {
  router.push(`/detail/${id}`)
}

async function bindNativeBackButton() {
  if (!Capacitor.isNativePlatform() || nativeBackButtonHandle) return

  nativeBackButtonHandle = await App.addListener('backButton', ({ canGoBack }) => {
    if (batchEditSheetRef.value?.consumeBack()) return
    if (showDeleteConfirm.value) {
      showDeleteConfirm.value = false
      return
    }
    if (selectionMode.value) {
      exitSelectionMode()
      return
    }
    if (canGoBack) {
      window.history.back()
      return
    }
    App.minimizeApp().catch(() => App.exitApp())
  })
}

async function unbindNativeBackButton() {
  if (!nativeBackButtonHandle) return
  await nativeBackButtonHandle.remove()
  nativeBackButtonHandle = null
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
  window.addEventListener('popstate', handleSelectionPopState)
  await bindNativeBackButton()
})

onBeforeUnmount(() => {
  window.removeEventListener('popstate', handleSelectionPopState)
  void unbindNativeBackButton()
  document.body.classList.remove('selection-active')
})
</script>

<style scoped>
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
    linear-gradient(180deg, rgba(245, 245, 247, 0.96) 0%, rgba(245, 245, 247, 0.82) 70%, rgba(245, 245, 247, 0) 100%);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
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
  background: rgba(255, 255, 255, 0.78);
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
  background: rgba(255, 255, 255, 0.78);
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
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.filter-row-label {
  flex-shrink: 0;
  width: 28px;
  color: var(--app-text-tertiary);
  font-size: 12px;
  font-weight: 600;
}

.filter-chips {
  display: flex;
  flex: 1;
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
}
</style>
