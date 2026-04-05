<template>
  <div class="page leaderboard-page" :class="{ 'leaderboard-page--top-jump': topJumpMasking }">
    <main ref="pageBodyRef" class="page-body">
      <section class="hero-section">
        <div class="hero-copy">
          <p class="section-label">{{ dimensionMeta.heroLabel }}</p>
          <h1 class="section-title">数据统计</h1>
          <p class="section-desc">{{ dimensionMeta.description }}</p>
        </div>

        <div class="hero-actions">
          <span class="hero-search-placeholder" aria-hidden="true" />
          <HomeViewModeSwitch
            model-value="stats"
            :options="HOME_TOP_OPTIONS"
            @update:model-value="switchTopTab"
          />
        </div>
      </section>

      <section class="summary-section">
        <div class="summary-grid">
          <article class="summary-card">
            <span class="summary-kicker">统计维度</span>
            <strong class="summary-value">{{ selectedDimensionLabel }}</strong>
          </article>
          <article class="summary-card">
            <span class="summary-kicker">分组数量</span>
            <strong class="summary-value">{{ entries.length }}</strong>
          </article>
          <article class="summary-card">
            <span class="summary-kicker">总件数</span>
            <strong class="summary-value">{{ totalQuantity }}</strong>
          </article>
          <article class="summary-card">
            <span class="summary-kicker">未设置项</span>
            <strong class="summary-value">{{ emptyGroupCount }}</strong>
          </article>
        </div>
      </section>

      <section class="controls-section">
        <div class="control-group">
          <p class="control-label">统计维度</p>
          <div class="chip-row">
            <button
              v-for="dimension in LEADERBOARD_DIMENSION_OPTIONS"
              :key="dimension.value"
              type="button"
              :class="['chip', { 'chip--active': selectedDimension === dimension.value }]"
              @click="selectedDimension = dimension.value"
            >
              {{ dimension.label }}
            </button>
          </div>
        </div>

        <div class="control-group">
          <p class="control-label">排序指标</p>
          <div class="chip-row">
            <button
              v-for="metric in LEADERBOARD_METRIC_OPTIONS"
              :key="metric.value"
              type="button"
              :class="['chip', { 'chip--active': selectedMetric === metric.value }]"
              @click="selectedMetric = metric.value"
            >
              {{ metric.label }}
            </button>
          </div>
        </div>
      </section>

      <section v-if="topThree.length > 0" class="podium-section">
        <article
          v-for="(entry, index) in topThree"
          :key="entry.key"
          :class="['podium-card', `podium-card--${index + 1}`]"
        >
          <span class="podium-rank">#{{ index + 1 }}</span>
          <p class="podium-name">{{ entry.label }}</p>
          <p v-if="entry.meta" class="podium-meta">{{ entry.meta }}</p>
          <strong class="podium-value">{{ formatLeaderboardMetricValue(entry, selectedMetric) }}</strong>
        </article>
      </section>

      <section class="list-section">
        <div class="section-head">
          <div>
            <p class="section-label">Full Ranking</p>
            <h2 class="section-title section-title--sub">{{ dimensionMeta.title }}</h2>
          </div>
        </div>

        <div v-if="sortedEntries.length > 0" class="ranking-list">
          <article v-for="(entry, index) in sortedEntries" :key="entry.key" class="ranking-item">
            <div class="ranking-index">{{ index + 1 }}</div>
            <div class="ranking-body">
              <div class="ranking-main">
                <div>
                  <p class="ranking-name">{{ entry.label }}</p>
                  <p v-if="entry.meta" class="ranking-sub">{{ entry.meta }}</p>
                </div>
                <p class="ranking-value">{{ formatLeaderboardMetricValue(entry, selectedMetric) }}</p>
              </div>
              <div class="ranking-meta">
                <span class="ranking-chip">{{ entry.quantity }} 件</span>
                <span class="ranking-chip">总价 ¥{{ entry.totalValue.toFixed(2) }}</span>
                <span class="ranking-chip">均价 ¥{{ entry.averageUnitPrice.toFixed(2) }}</span>
              </div>
            </div>
          </article>
        </div>

        <EmptyState
          v-else
          icon="📊"
          title="还没有统计数据"
          description="先录入一些收藏，再回来查看多维统计。"
        />
      </section>
    </main>

    <Teleport to="body">
      <ScrollTopButton :show="showScrollTopButton" @click="scrollToTop" />
    </Teleport>
  </div>
</template>

<script setup>
import { computed, nextTick, onActivated, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useGoodsStore } from '@/stores/goods'
import { usePresetsStore } from '@/stores/presets'
import {
  LEADERBOARD_DIMENSION_OPTIONS,
  LEADERBOARD_METRIC_OPTIONS,
  buildLeaderboardEntries,
  formatLeaderboardMetricValue,
  getLeaderboardDimensionMeta,
  sortLeaderboardEntries
} from '@/utils/goodsLeaderboard'
import EmptyState from '@/components/common/EmptyState.vue'
import HomeViewModeSwitch from '@/components/home/HomeViewModeSwitch.vue'
import ScrollTopButton from '@/components/common/ScrollTopButton.vue'
import { scrollToTopAnimated } from '@/utils/scrollToTopAnimated'

const HOME_MODE_STORAGE_KEY = 'goods_home_mode_v1'
const HOME_MODE_EVENT = 'goods-app:home-mode-change'
const COLLECTION_TAB_STORAGE_KEY = 'goods_collection_tab_v1'
const COLLECTION_TAB_EVENT = 'goods-app:collection-tab-change'
const HOME_TOP_OPTIONS = [
  { value: 'goods', label: '收藏' },
  { value: 'wishlist', label: '心愿' },
  { value: 'stats', label: '统计' }
]

const router = useRouter()
const store = useGoodsStore()
const presets = usePresetsStore()
const pageBodyRef = ref(null)
const selectedDimension = ref('character')
const selectedMetric = ref('quantity')
const showScrollTopButton = ref(false)
const topJumpMasking = ref(false)
const SCROLL_TOP_BUTTON_THRESHOLD = 900
let pageScrollRaf = 0
let topJumpMaskTimer = 0

function updateScrollTopButtonVisibility() {
  const top = pageBodyRef.value?.scrollTop || window.scrollY || document.documentElement.scrollTop || 0
  showScrollTopButton.value = top >= SCROLL_TOP_BUTTON_THRESHOLD
}

function handlePageScroll() {
  if (pageScrollRaf) return
  pageScrollRaf = window.requestAnimationFrame(() => {
    pageScrollRaf = 0
    updateScrollTopButtonVisibility()
  })
}

function resetPageScrollTop() {
  scrollToTopAnimated(() => pageBodyRef.value, 260, () => {
    updateScrollTopButtonVisibility()
  })
}

function scrollToTop() {
  triggerTopJumpMask()
  resetPageScrollTop()
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

function persistHomeMode(mode) {
  const normalizedMode = mode === 'recharge' ? 'recharge' : 'goods'
  localStorage.setItem(HOME_MODE_STORAGE_KEY, normalizedMode)
  window.dispatchEvent(new CustomEvent(HOME_MODE_EVENT, {
    detail: { mode: normalizedMode }
  }))
}

function persistCollectionTab(tab) {
  const normalizedTab = tab === 'wishlist' || tab === 'stats' ? tab : 'goods'
  localStorage.setItem(COLLECTION_TAB_STORAGE_KEY, normalizedTab)
  window.dispatchEvent(new CustomEvent(COLLECTION_TAB_EVENT, {
    detail: { tab: normalizedTab }
  }))
}

function switchTopTab(nextMode) {
  if (nextMode === 'goods') {
    persistCollectionTab('goods')
    persistHomeMode('goods')
    router.push('/home')
    return
  }

  if (nextMode === 'wishlist') {
    persistCollectionTab('wishlist')
    router.push('/wishlist')
  }
}

onMounted(() => {
  persistCollectionTab('stats')
  resetPageScrollTop()
  window.requestAnimationFrame(resetPageScrollTop)
  nextTick(() => {
    pageBodyRef.value?.addEventListener('scroll', handlePageScroll, { passive: true })
    window.addEventListener('scroll', handlePageScroll, { passive: true })
    updateScrollTopButtonVisibility()
  })
})

onActivated(() => {
  persistCollectionTab('stats')
  nextTick(updateScrollTopButtonVisibility)
})

onBeforeUnmount(() => {
  if (topJumpMaskTimer) {
    window.clearTimeout(topJumpMaskTimer)
    topJumpMaskTimer = 0
  }
  if (pageScrollRaf) {
    window.cancelAnimationFrame(pageScrollRaf)
    pageScrollRaf = 0
  }
  pageBodyRef.value?.removeEventListener('scroll', handlePageScroll)
  window.removeEventListener('scroll', handlePageScroll)
})

const characterPresetIpMap = computed(() =>
  new Map(presets.characters.map((character) => [character.name, character.ip || '']))
)

const leaderboardState = computed(() =>
  buildLeaderboardEntries(store.collectionViewList, selectedDimension.value, characterPresetIpMap.value)
)

const entries = computed(() => leaderboardState.value.entries)
const emptyGroupCount = computed(() => leaderboardState.value.emptyCount)
const sortedEntries = computed(() => sortLeaderboardEntries(entries.value, selectedMetric.value, selectedDimension.value))
const topThree = computed(() => sortedEntries.value.slice(0, 3))
const totalQuantity = computed(() => entries.value.reduce((sum, entry) => sum + Number(entry.quantity || 0), 0))
const dimensionMeta = computed(() => getLeaderboardDimensionMeta(selectedDimension.value))
const selectedDimensionLabel = computed(() =>
  LEADERBOARD_DIMENSION_OPTIONS.find((item) => item.value === selectedDimension.value)?.label || '角色'
)
</script>

<style scoped>
.leaderboard-page--top-jump .page-body {
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

.page-body {
  padding-top: calc(env(safe-area-inset-top) + 20px);
}

.hero-section,
.summary-section,
.controls-section,
.podium-section,
.list-section {
  padding: 0 var(--page-padding);
}

.summary-section,
.controls-section,
.podium-section,
.list-section {
  margin-top: var(--section-gap);
}

.hero-section {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.hero-copy {
  max-width: 320px;
}

.hero-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  flex-shrink: 0;
}

.hero-search-placeholder {
  width: var(--icon-button-size);
  height: var(--icon-button-size);
  margin-top: 6px;
  flex-shrink: 0;
  visibility: hidden;
}

.hero-actions :deep(.mode-switch) {
  width: auto;
  max-width: none;
}

.section-label,
.control-label {
  color: var(--app-text-tertiary);
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.section-title {
  margin-top: 4px;
  color: var(--app-text);
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.04em;
}

.section-title--sub {
  font-size: 22px;
  font-weight: 600;
}

.section-desc {
  margin-top: 8px;
  color: var(--app-text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.summary-card,
.ranking-item {
  padding: 18px;
  border-radius: var(--radius-card);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
}

.summary-kicker {
  color: var(--app-text-tertiary);
  font-size: 12px;
}

.summary-value {
  display: block;
  margin-top: 10px;
  color: var(--app-text);
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.04em;
}

.controls-section {
  display: grid;
  gap: 14px;
}

.control-group {
  display: grid;
  gap: 10px;
}

.chip-row {
  display: flex;
  gap: 8px;
  padding: 6px;
  overflow-x: auto;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-surface) 28%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--app-text) 6%, transparent);
  scrollbar-width: none;
}

.chip-row::-webkit-scrollbar {
  display: none;
}

.chip {
  flex-shrink: 0;
  border: none;
  border-radius: 999px;
  padding: 10px 16px;
  background: color-mix(in srgb, var(--app-surface) 82%, transparent);
  color: var(--app-text-secondary);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--app-text) 5%, transparent);
  font-size: 14px;
  font-weight: 600;
  transition: background var(--motion-fast) var(--motion-emphasis), color var(--motion-fast) var(--motion-emphasis), transform var(--motion-fast) var(--motion-emphasis);
}

.chip:active {
  transform: scale(0.97);
}

.chip--active {
  background: #141416;
  color: #fff;
  box-shadow: 0 10px 20px rgba(20, 20, 22, 0.18);
}

.podium-section {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.podium-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 152px;
  padding: 16px;
  border-radius: 22px;
  color: #fff;
  box-shadow: var(--app-shadow);
}

.podium-card--1 {
  background: linear-gradient(145deg, #111318 0%, #41321f 100%);
}

.podium-card--2 {
  background: linear-gradient(145deg, #2b2f39 0%, #4a5567 100%);
}

.podium-card--3 {
  background: linear-gradient(145deg, #332219 0%, #80553b 100%);
}

.podium-rank {
  display: inline-flex;
  width: fit-content;
  border-radius: 999px;
  padding: 4px 10px;
  background: rgba(255, 255, 255, 0.12);
  font-size: 12px;
  font-weight: 700;
}

.podium-name {
  font-size: 16px;
  font-weight: 700;
  line-height: 1.35;
}

.podium-meta {
  color: rgba(255, 255, 255, 0.66);
  font-size: 12px;
}

.podium-value {
  margin-top: auto;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.04em;
}

.section-head {
  margin-bottom: 14px;
}

.ranking-list {
  display: grid;
  gap: 10px;
}

.ranking-item {
  display: flex;
  gap: 12px;
}

.ranking-index {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: 14px;
  background: rgba(20, 20, 22, 0.06);
  color: var(--app-text);
  font-size: 15px;
  font-weight: 700;
}

.ranking-body {
  flex: 1;
  min-width: 0;
}

.ranking-main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.ranking-name,
.ranking-value {
  color: var(--app-text);
  font-size: 16px;
  font-weight: 700;
}

.ranking-sub {
  margin-top: 4px;
  color: var(--app-text-secondary);
  font-size: 13px;
}

.ranking-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.ranking-chip {
  border-radius: 999px;
  padding: 5px 10px;
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
  font-size: 12px;
}

@media (max-width: 640px) {
  .hero-copy {
    max-width: min(54vw, 320px);
  }

  .hero-actions {
    gap: 10px;
  }

  .hero-actions :deep(.mode-switch__item) {
    min-width: 52px;
    padding: 0 10px;
  }

  .podium-section {
    gap: 8px;
  }

  .podium-card {
    min-height: 132px;
    padding: 12px;
    border-radius: 18px;
  }

  .podium-name {
    font-size: 14px;
  }

  .podium-meta {
    font-size: 11px;
  }

  .podium-value {
    font-size: 18px;
  }

  .ranking-main {
    flex-direction: column;
  }
}

@media (prefers-color-scheme: dark) {
  .chip--active {
    background: #f5f5f7;
    color: #141416;
  }
}
</style>
