<template>
  <div class="page statistics-page" :class="{ 'statistics-page--top-jump': topJumpMasking }">
    <main ref="pageBodyRef" class="page-body">
      <!-- Hero -->
      <section class="hero-section">
        <div class="hero-copy">
          <p class="section-label">{{ t('stats.heroLabel') }}</p>
          <h1 class="section-title">{{ t('leaderboard.title') }}</h1>
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

      <!-- Overview Cards (dimension-aware) -->
      <section class="overview-section">
        <div class="overview-grid">
          <article class="overview-card">
            <span class="overview-kicker">{{ t('leaderboard.dimension') }}</span>
            <strong class="overview-value">{{ selectedDimensionLabel }}</strong>
          </article>
          <article class="overview-card">
            <span class="overview-kicker">{{ t('leaderboard.groupCount') }}</span>
            <strong class="overview-value">{{ entries.length }}</strong>
          </article>
          <article class="overview-card">
            <span class="overview-kicker">{{ t('leaderboard.totalItems') }}</span>
            <strong class="overview-value">{{ totalQuantityText }}</strong>
          </article>
          <article class="overview-card">
            <span class="overview-kicker">{{ t('leaderboard.unsetItems') }}</span>
            <strong class="overview-value">{{ emptyGroupCount }}</strong>
          </article>
        </div>
      </section>

      <!-- 出谷回血概览 -->
      <section v-if="saleSummary.hasAny" class="sale-overview-section">
        <button class="sale-overview-card" type="button" @click="runManageForwardNavigation(() => router.push('/manage/sale-ledger'))">
          <div class="sale-overview-figures">
            <div class="sale-overview-figure">
              <span class="sale-overview-kicker">{{ t('sale.recovered') }}</span>
              <strong class="sale-overview-value">¥{{ formatSaleAmount(saleSummary.recoveredTotal) }}</strong>
            </div>
            <div class="sale-overview-figure">
              <span class="sale-overview-kicker">{{ t('sale.listing') }}</span>
              <strong class="sale-overview-value">¥{{ formatSaleAmount(saleSummary.listingTotal) }}</strong>
            </div>
            <div class="sale-overview-figure">
              <span class="sale-overview-kicker">{{ t('sale.totalProfit') }}</span>
              <strong :class="['sale-overview-value', saleSummary.profitTotal > 0 ? 'sale-profit--gain' : saleSummary.profitTotal < 0 ? 'sale-profit--loss' : '']">
                {{ saleSummary.profitTotal > 0 ? '+' : saleSummary.profitTotal < 0 ? '-' : '' }}¥{{ formatSaleAmount(saleSummary.profitTotal) }}
              </strong>
            </div>
          </div>
          <svg class="sale-overview-arrow" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </button>
      </section>

      <!-- Heatmap + Trend side by side on wide screens -->
      <div class="duo-section">
        <div class="duo-main">
          <HeatmapChart
            :heatmap-data="heatmapData"
            :available-years="heatmapYears"
          />
        </div>
        <div class="duo-side">
          <SpendingTrendChart
            :trend-data="trendData"
            :budget-line="budgetLineValue"
            :current-mode="trendMode"
            @update:mode="trendMode = $event"
            @update:window="trendWindow = $event"
          />
        </div>
      </div>

      <!-- Rankings + Distribution -->
      <section class="rankings-section">
        <div class="section-head">
          <div>
            <p class="section-label">{{ t('stats.rankingsTitle') }}</p>
            <h2 class="section-title section-title--sub">{{ t('stats.rankingsTitle') }}</h2>
          </div>
        </div>

        <div class="controls-section">
          <div class="control-group">
            <p class="control-label">{{ t('leaderboard.dimension') }}</p>
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
            <p class="control-label">{{ t('leaderboard.sortMetric') }}</p>
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
        </div>

        <!-- Podium -->
        <div v-if="topThree.length > 0" class="podium-section">
          <article
            v-for="(entry, index) in topThree"
            :key="entry.key"
            :class="['podium-card', `podium-card--${index + 1}`]"
          >
            <span class="podium-rank">#{{ index + 1 }}</span>
            <p class="podium-name">{{ entry.label }}</p>
            <p v-if="entry.meta" class="podium-meta">{{ entry.meta }}</p>
            <strong class="podium-value">{{ formatLeaderboardMetricValue(entry, selectedMetric, t) }}</strong>
          </article>
        </div>

        <!-- View Full Ranking Button -->
        <button
          v-if="sortedEntries.length > 3"
          type="button"
          class="view-full-btn"
          @click="showRankingPopup = true"
        >
          {{ t('stats.viewFullRanking') }}
          <span class="view-full-arrow">→</span>
        </button>

        <!-- Distribution Charts -->
        <div class="charts-grid">
          <div class="chart-card">
            <h3 class="chart-title">{{ t('leaderboard.dimensionRatio') }}</h3>
            <PieChart :entries="entries" labelKey="label" :valueKey="selectedMetric" />
          </div>
          <div class="chart-card">
            <h3 class="chart-title">{{ t('leaderboard.top10') }}</h3>
            <BarChart :entries="sortedEntries.slice(0, 10)" labelKey="label" :valueKey="selectedMetric" :inverse="true" />
          </div>
        </div>
      </section>

      <!-- Goods Extremes -->
      <GoodsExtremes :extremes="goodsExtremes" />
    </main>

    <!-- Ranking Popup -->
    <RankingPopup
      v-model:show="showRankingPopup"
      :entries="sortedEntries"
      :metric="selectedMetric"
    />

    <Teleport to="body">
      <ScrollTopButton :show="showScrollTopButton" @click="scrollToTop" />
    </Teleport>
  </div>
</template>

<script setup>
import { computed, nextTick, onActivated, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useGoodsStore } from '@/stores/goods'
import { buildSaleSummary } from '@/utils/goods/saleStats'
import { usePresetsStore } from '@/stores/presets'
import {
  createLeaderboardDimensionOptions,
  createLeaderboardMetricOptions,
  buildLeaderboardEntries,
  formatLeaderboardMetricValue,
  sortLeaderboardEntries
} from '@/utils/goods/leaderboard'
import {
  buildHeatmapData,
  getHeatmapYears,
  buildSpendingTrendData,
  buildGoodsExtremes,
  buildOverviewStats
} from '@/utils/goods/statistics'
import { useBudgetCalculation } from '@/composables/my/useBudgetCalculation'
import HomeViewModeSwitch from '@/components/home/HomeViewModeSwitch.vue'
import ScrollTopButton from '@/components/common/ScrollTopButton.vue'
import HeatmapChart from '@/components/statistics/HeatmapChart.vue'
import SpendingTrendChart from '@/components/statistics/SpendingTrendChart.vue'
import RankingPopup from '@/components/statistics/RankingPopup.vue'
import GoodsExtremes from '@/components/statistics/GoodsExtremes.vue'
import PieChart from '@/components/statistics/PieChart.vue'
import BarChart from '@/components/statistics/BarChart.vue'
import { scrollToTopAnimated } from '@/utils/scrollToTopAnimated'
import { runManageForwardNavigation, runWithRouteTransition } from '@/utils/routeTransition'

const HOME_MODE_STORAGE_KEY = 'goods_home_mode_v1'
const HOME_MODE_EVENT = 'goods-app:home-mode-change'
const COLLECTION_TAB_STORAGE_KEY = 'goods_collection_tab_v1'
const COLLECTION_TAB_EVENT = 'goods-app:collection-tab-change'

const { t } = useI18n()
const router = useRouter()
const store = useGoodsStore()
const presets = usePresetsStore()
const { monthlyBudget, yearlyBudget, loadBudgetSettings } = useBudgetCalculation()

const HOME_TOP_OPTIONS = computed(() => [
  { value: 'goods', label: t('common.collection') },
  { value: 'wishlist', label: t('nav.tabWishlist') },
  { value: 'stats', label: t('leaderboard.stats') }
])
const LEADERBOARD_DIMENSION_OPTIONS = computed(() => createLeaderboardDimensionOptions(t))
const LEADERBOARD_METRIC_OPTIONS = computed(() => createLeaderboardMetricOptions(t))

// 用视图层列表(含汇率折算字段),与本页其余统计的 CNY 口径一致
const saleSummary = computed(() => buildSaleSummary(store.collectionViewList))

function formatSaleAmount(value) {
  const n = Math.abs(Number(value) || 0)
  return Number.isInteger(n) ? String(n) : n.toFixed(2)
}

const pageBodyRef = ref(null)
const selectedDimension = ref('character')
const selectedMetric = ref('quantity')
const showScrollTopButton = ref(false)
const topJumpMasking = ref(false)
const showRankingPopup = ref(false)
const trendMode = ref('year')
const trendWindow = ref((() => {
  const now = new Date()
  return { startDate: new Date(now.getFullYear(), now.getMonth(), 1), endDate: new Date(now.getFullYear(), 11, 31, 23, 59, 59) }
})())
const SCROLL_TOP_BUTTON_THRESHOLD = 900
let pageScrollRaf = 0
let topJumpMaskTimer = 0

// --- Data ---
const characterPresetIpMap = computed(() =>
  new Map(presets.characters.map((c) => [c.name, c.ip || '']))
)

const list = computed(() => store.collectionViewList)

const leaderboardState = computed(() =>
  buildLeaderboardEntries(list.value, selectedDimension.value, characterPresetIpMap.value, t)
)
const entries = computed(() => leaderboardState.value.entries)
const emptyGroupCount = computed(() => leaderboardState.value.emptyCount)
const sortedEntries = computed(() => sortLeaderboardEntries(entries.value, selectedMetric.value, selectedDimension.value))
const topThree = computed(() => sortedEntries.value.slice(0, 3))
const totalQuantity = computed(() => entries.value.reduce((sum, entry) => sum + Number(entry.quantity || 0), 0))
const totalQuantityText = computed(() => formatLeaderboardMetricValue({ quantity: totalQuantity.value }, 'quantity', t))
const selectedDimensionLabel = computed(() =>
  LEADERBOARD_DIMENSION_OPTIONS.value.find((item) => item.value === selectedDimension.value)?.label || ''
)

const heatmapData = computed(() => buildHeatmapData(list.value))
const heatmapYears = computed(() => getHeatmapYears(list.value))
const trendData = computed(() => {
  if (trendMode.value === 'year') {
    return buildSpendingTrendData(list.value, 'year')
  }
  return buildSpendingTrendData(list.value, trendMode.value, {
    startDate: trendWindow.value.startDate,
    endDate: trendWindow.value.endDate
  })
})
const goodsExtremes = computed(() => buildGoodsExtremes(list.value, t))

const budgetLineValue = computed(() => {
  if (trendMode.value === 'year') return yearlyBudget.value || 0
  // 优先用户单独设置的月预算,未设置才回退年预算/12
  if (trendMode.value === 'month') return monthlyBudget.value || (yearlyBudget.value || 0) / 12
  return 0
})

// --- Scroll ---
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
  if (topJumpMaskTimer) window.clearTimeout(topJumpMaskTimer)
  topJumpMasking.value = true
  topJumpMaskTimer = window.setTimeout(() => {
    topJumpMasking.value = false
    topJumpMaskTimer = 0
  }, 260)
}

// --- Tab switching ---
function persistHomeMode(mode) {
  const normalizedMode = mode === 'recharge' ? 'recharge' : 'goods'
  localStorage.setItem(HOME_MODE_STORAGE_KEY, normalizedMode)
  window.dispatchEvent(new CustomEvent(HOME_MODE_EVENT, { detail: { mode: normalizedMode } }))
}

function persistCollectionTab(tab) {
  const normalizedTab = tab === 'wishlist' || tab === 'stats' ? tab : 'goods'
  localStorage.setItem(COLLECTION_TAB_STORAGE_KEY, normalizedTab)
  window.dispatchEvent(new CustomEvent(COLLECTION_TAB_EVENT, { detail: { tab: normalizedTab } }))
}

function switchTopTab(nextMode) {
  const SUB_ORDER = ['/home', '/wishlist', '/leaderboard/characters']
  const fi = SUB_ORDER.indexOf(router.currentRoute.value.path)
  const toPath = nextMode === 'goods' ? '/home' : nextMode === 'wishlist' ? '/wishlist' : '/leaderboard/characters'
  const ti = SUB_ORDER.indexOf(toPath)
  const direction = (fi !== -1 && ti !== -1 && ti < fi) ? 'forward' : 'back'

  if (nextMode === 'goods') {
    persistCollectionTab('goods')
    persistHomeMode('goods')
    runWithRouteTransition(() => router.push('/home'), { direction, preferFallback: true })
    return
  }

  if (nextMode === 'wishlist') {
    persistCollectionTab('wishlist')
    runWithRouteTransition(() => router.push('/wishlist'), { direction, preferFallback: true })
  }
}

// --- Lifecycle ---
onMounted(() => {
  persistCollectionTab('stats')
  loadBudgetSettings()
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
</script>

<style scoped>
.statistics-page--top-jump .page-body {
  animation: top-jump-mask-strong 260ms ease-out;
}
@keyframes top-jump-mask-strong {
  0% { opacity: 0.72; filter: saturate(88%); }
  100% { opacity: 1; filter: saturate(100%); }
}
.page-body {
  padding-top: calc(env(safe-area-inset-top) + 20px);
}
.hero-section,
.overview-section,
.rankings-section {
  padding: 0 var(--page-padding);
}
.overview-section,
.rankings-section {
  margin-top: var(--section-gap);
}
.hero-section {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}
.hero-copy { flex: 1; max-width: 320px; }
.hero-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  flex: none;
  min-width: 0;
}
.hero-search-placeholder {
  width: var(--icon-button-size);
  height: var(--icon-button-size);
  flex-shrink: 0;
  visibility: hidden;
}
.hero-actions :deep(.mode-switch) { width: auto; max-width: none; }
.hero-actions :deep(.mode-switch__item) { min-width: 48px; padding: 0 8px; }

.section-label, .control-label {
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
.section-title--sub { font-size: 22px; font-weight: 600; }

/* Overview */
.overview-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}
.overview-card {
  padding: 14px;
  border-radius: var(--radius-card);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
}
.overview-kicker {
  color: var(--app-text-tertiary);
  font-size: 11px;
  font-weight: 500;
}
.overview-value {
  display: block;
  margin-top: 8px;
  color: var(--app-text);
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.03em;
}

/* Controls */
.controls-section {
  display: grid;
  gap: 12px;
  margin-top: 16px;
}
.control-group { display: grid; gap: 8px; }
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
.chip-row::-webkit-scrollbar { display: none; }
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
.chip:active { transform: scale(0.97); }
.chip--active {
  background: var(--app-text);
  color: var(--app-surface);
  box-shadow: 0 10px 20px rgba(20, 20, 22, 0.18);
}

/* Podium */
.podium-section {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 16px;
}
.podium-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 140px;
  padding: 14px;
  border-radius: 20px;
  color: #fff;
  box-shadow: var(--app-shadow);
}
.podium-card--1 { background: linear-gradient(145deg, #111318 0%, #41321f 100%); }
.podium-card--2 { background: linear-gradient(145deg, #2b2f39 0%, #4a5567 100%); }
.podium-card--3 { background: linear-gradient(145deg, #332219 0%, #80553b 100%); }
.podium-rank {
  display: inline-flex;
  width: fit-content;
  border-radius: 999px;
  padding: 4px 10px;
  background: rgba(255, 255, 255, 0.12);
  font-size: 12px;
  font-weight: 700;
}
.podium-name { font-size: 15px; font-weight: 700; line-height: 1.35; }
.podium-meta { color: rgba(255, 255, 255, 0.66); font-size: 11px; }
.podium-value { margin-top: auto; font-size: 20px; font-weight: 700; letter-spacing: -0.04em; }

/* View Full Ranking */
.view-full-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  margin-top: 14px;
  padding: 14px;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-card);
  background: var(--app-surface);
  color: var(--app-text);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: background var(--motion-fast) var(--motion-emphasis);
}
.view-full-btn:active { background: var(--app-surface-soft); transform: scale(0.98); }
.view-full-arrow { font-size: 18px; }

/* Charts */
.charts-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 16px;
}
.chart-card {
  background: var(--app-card-bg, var(--app-surface));
  border: 1px solid var(--app-glass-border);
  padding: 12px;
  border-radius: 12px;
}
.chart-title { margin: 0 0 8px 0; font-size: 14px; color: var(--app-text-secondary); }

/* Heatmap + Trend duo layout */
.sale-overview-section {
  padding: 0 var(--page-padding);
  margin-top: var(--section-gap);
}
.sale-overview-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 14px 16px;
  border: none;
  border-radius: var(--radius-card);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
  cursor: pointer;
  text-align: left;
  transition: transform 0.14s ease;
}
.sale-overview-card:active { transform: scale(0.98); }
.sale-overview-figures {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
}
.sale-overview-figure {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.sale-overview-kicker {
  color: var(--app-text-tertiary);
  font-size: 11px;
}
.sale-overview-value {
  color: var(--app-text);
  font-size: 17px;
  font-weight: 700;
}
.sale-profit--gain { color: var(--app-danger, #dc2626); }
.sale-profit--loss { color: var(--app-success, #16a34a); }
.sale-overview-arrow {
  width: 18px;
  height: 18px;
  color: var(--app-text-tertiary);
  flex-shrink: 0;
}

.duo-section {
  padding: 0 var(--page-padding);
  margin-top: var(--section-gap);
  display: flex;
  flex-direction: column;
  gap: var(--section-gap);
}
/* 与全站平板断点(900px)一致:iPad 横屏等场景热力图与趋势图并排,
   避免两图各自拉到全宽(趋势图柱子稀疏、热力图格子被拉扁) */
@media (min-width: 900px) {
  .duo-section {
    flex-direction: row;
    gap: 24px;
    align-items: flex-start;
  }
  .duo-main { flex: 3; min-width: 0; }
  .duo-side { flex: 2; min-width: 0; margin-top: 0; }
}

@media (max-width: 640px) {
  .overview-grid { grid-template-columns: repeat(2, 1fr); }
  .charts-grid { grid-template-columns: 1fr; }
  .chart-card { padding: 10px; }
  .hero-copy { max-width: min(54vw, 320px); }
  .hero-actions { gap: 10px; }
  .hero-actions :deep(.mode-switch__item) { min-width: 52px; padding: 0 10px; }
  .podium-section { gap: 8px; }
  .podium-card { min-height: 120px; padding: 12px; border-radius: 16px; }
  .podium-name { font-size: 13px; }
  .podium-meta { font-size: 10px; }
  .podium-value { font-size: 17px; }
}
</style>
