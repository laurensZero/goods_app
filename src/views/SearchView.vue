<template>
  <div class="page page--transition search-page" :class="{ 'page--leaving': isPageLeaving }">
    <header class="search-header">
      <button class="back-btn" type="button" aria-label="返回" @click="$router.back()">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M15 18L9 12L15 6" />
        </svg>
      </button>
      <SearchBar v-model="keyword" placeholder="搜索名称、分类、IP…" autofocus class="header-search" />
    </header>

    <main class="page-body">
      <section class="filter-panel">
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
      </section>

      <section v-if="results.length > 0" class="results-section">
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
            @open-detail="$router.push('/detail/' + item.id)"
          />
        </div>
      </section>

      <section v-else-if="isFiltering" class="empty-wrap">
        <EmptyState icon="⌕" title="没有匹配的收藏" :description="emptyDesc" />
      </section>

      <section v-else class="empty-wrap">
        <EmptyState
          icon="◎"
          title="搜索你的收藏"
          description="输入关键词，或上方选择分类、IP 快速定位。"
        />
      </section>
    </main>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useGoodsStore } from '@/stores/goods'
import { usePageLeaveAnimation } from '@/composables/usePageLeaveAnimation'
import SearchBar from '@/components/SearchBar.vue'
import GoodsCard from '@/components/GoodsCard.vue'
import EmptyState from '@/components/EmptyState.vue'

const store = useGoodsStore()
const { isPageLeaving } = usePageLeaveAnimation()
const keyword = ref('')
const selectedCategory = ref('')
const selectedIp = ref('')

const categoryOptions = computed(() => [...new Set(store.list.map((g) => g.category).filter(Boolean))])
const ipOptions = computed(() => [...new Set(store.list.map((g) => g.ip).filter(Boolean))])

const isFiltering = computed(() =>
  keyword.value.trim() !== '' || selectedCategory.value !== '' || selectedIp.value !== ''
)

const emptyDesc = computed(() =>
  keyword.value.trim()
    ? `没有找到与“${keyword.value.trim()}”相关的谷子，试试更短的关键词。`
    : '当前筛选条件下没有匹配的收藏。'
)

const results = computed(() => {
  if (!isFiltering.value) return []

  const kw = keyword.value.trim().toLowerCase()

  return store.list.filter((item) => {
    const kwMatch =
      !kw ||
      item.name.toLowerCase().includes(kw) ||
      (item.category && item.category.toLowerCase().includes(kw)) ||
      (item.ip && item.ip.toLowerCase().includes(kw)) ||
      (item.characters && item.characters.some((character) => character.toLowerCase().includes(kw)))

    const catMatch = !selectedCategory.value || item.category === selectedCategory.value
    const ipMatch = !selectedIp.value || item.ip === selectedIp.value

    return kwMatch && catMatch && ipMatch
  })
})
</script>

<style scoped>
.search-header {
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

.back-btn {
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
  transition: transform 0.16s ease;
}

.back-btn:active {
  transform: scale(var(--press-scale-button));
}

.back-btn svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.header-search {
  flex: 1;
  min-width: 0;
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
