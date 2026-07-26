<template>
  <div class="page sale-ledger-page">
    <NavBar :title="t('sale.ledgerTitle')" show-back />

    <main class="page-body">
      <section class="hero-section">
        <div class="hero-copy">
          <p class="hero-label">Sale Ledger</p>
          <h1 class="hero-title">{{ t('sale.ledgerHeroTitle') }}</h1>
          <p class="hero-desc">{{ t('sale.ledgerHeroDesc') }}</p>
        </div>

        <div class="summary-grid">
          <article class="summary-card">
            <span class="summary-kicker">{{ t('sale.recovered') }}</span>
            <strong class="summary-value">¥{{ formatAmount(summary.recoveredTotal) }}</strong>
          </article>
          <article class="summary-card">
            <span class="summary-kicker">{{ t('sale.listing') }}</span>
            <strong class="summary-value">¥{{ formatAmount(summary.listingTotal) }}</strong>
          </article>
          <article class="summary-card">
            <span class="summary-kicker">{{ t('sale.totalProfit') }}</span>
            <strong :class="['summary-value', profitClass(summary.profitTotal)]">{{ formatProfit(summary.profitTotal) }}</strong>
          </article>
          <article class="summary-card">
            <span class="summary-kicker">{{ t('sale.soldCount') }}</span>
            <strong class="summary-value">{{ summary.soldCount }}</strong>
          </article>
        </div>
      </section>

      <section class="tab-section">
        <div class="tab-bar">
          <button
            :class="['tab-btn', { 'tab-btn--active': activeTab === 'sold' }]"
            type="button"
            @click="setTab('sold')"
          >
            {{ t('sale.tabSold') }} ({{ ledger.soldRows.length }})
          </button>
          <button
            :class="['tab-btn', { 'tab-btn--active': activeTab === 'listing' }]"
            type="button"
            @click="setTab('listing')"
          >
            {{ t('sale.tabListing') }} ({{ ledger.listingRows.length }})
          </button>
        </div>
      </section>

      <section class="list-section" :class="`list-section--${swapDirection}`">
        <Transition name="ledger-swap" mode="out-in">
        <div :key="activeTab">
        <div v-if="activeRows.length > 0" class="ledger-list">
          <button
            v-for="(row, index) in activeRows"
            :key="`${row.item.id}-${row.unitIndex ?? 'all'}-${index}`"
            class="ledger-card"
            type="button"
            @click="openDetail(row.item.id)"
          >
            <div class="ledger-thumb">
              <LazyCachedImage v-if="getThumb(row.item)" :src="getThumb(row.item)" :alt="row.item.name" class="ledger-thumb__img" />
              <span v-else>{{ row.item.name.trim().charAt(0).toUpperCase() }}</span>
            </div>

            <div class="ledger-body">
              <p class="ledger-name">
                {{ row.item.name }}
                <span v-if="row.unitIndex != null" class="ledger-unit">{{ t('sale.unitLabel', { n: row.unitIndex + 1 }) }}</span>
                <span v-else-if="row.count > 1" class="ledger-unit">×{{ row.count }}</span>
              </p>

              <div class="ledger-meta">
                <span v-if="row.platform" class="ledger-chip">{{ row.platform }}</span>
                <span v-if="row.at" class="ledger-date">{{ row.at }}</span>
              </div>

              <div class="ledger-figures">
                <template v-if="row.hasPrice">
                  <span class="ledger-figure">
                    <span class="ledger-figure__label">{{ activeTab === 'sold' ? t('sale.dealPrice') : t('sale.listingPrice') }}</span>
                    <span class="ledger-figure__value">¥{{ formatAmount(row.price) }}</span>
                  </span>
                  <span class="ledger-figure">
                    <span class="ledger-figure__label">{{ t('sale.cost') }}</span>
                    <span class="ledger-figure__value">¥{{ formatAmount(row.cost) }}</span>
                  </span>
                  <span v-if="activeTab === 'sold'" class="ledger-figure">
                    <span class="ledger-figure__label">{{ t('sale.profit') }}</span>
                    <span :class="['ledger-figure__value', profitClass(row.profit)]">{{ formatProfit(row.profit) }}</span>
                  </span>
                </template>
                <span v-else class="ledger-no-price">{{ t('sale.noPriceRecorded') }}</span>
              </div>
            </div>
          </button>
        </div>

        <EmptyState
          v-else
          icon="¥"
          :title="activeTab === 'sold' ? t('sale.empty') : t('sale.emptyListing')"
          :description="activeTab === 'sold' ? t('sale.emptyDesc') : t('sale.emptyListingDesc')"
        />
        </div>
        </Transition>
      </section>
    </main>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useGoodsStore } from '@/stores/goods'
import { buildSaleLedger, buildSaleSummary } from '@/utils/goods/saleStats'
import { getPrimaryGoodsImageUrl } from '@/utils/goods/images'
import { runWithRouteTransition } from '@/utils/routeTransition'
import NavBar from '@/components/common/NavBar.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import LazyCachedImage from '@/components/image/LazyCachedImage.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const store = useGoodsStore()

const activeTab = ref('sold')
// tab 顺序 [已出, 在售]:向右切换内容从右滑入,向左切换从左滑入
const swapDirection = ref('forward')

function setTab(tab) {
  if (tab === activeTab.value) return
  swapDirection.value = tab === 'listing' ? 'forward' : 'back'
  activeTab.value = tab
}

// 用视图层列表(含汇率折算字段),外币商品的成本按 CNY 口径参与盈亏
const ledger = computed(() => buildSaleLedger(store.collectionViewList))
const summary = computed(() => buildSaleSummary(store.collectionViewList))
const activeRows = computed(() =>
  activeTab.value === 'sold' ? ledger.value.soldRows : ledger.value.listingRows
)

function getThumb(item) {
  return getPrimaryGoodsImageUrl(item.images, item.coverImage || item.image) || null
}

function formatAmount(value) {
  const n = Number(value) || 0
  return Number.isInteger(n) ? String(n) : n.toFixed(2)
}

// |n| < 0.005(不足一分)视为持平,浮点噪声不显示成 -¥0.00 的亏损
function formatProfit(value) {
  const n = Number(value) || 0
  if (Math.abs(n) < 0.005) return '¥0'
  const sign = n > 0 ? '+' : '-'
  return `${sign}¥${formatAmount(Math.abs(n))}`
}

function profitClass(value) {
  const n = Number(value) || 0
  if (Math.abs(n) < 0.005) return ''
  return n > 0 ? 'profit--gain' : 'profit--loss'
}

function openDetail(id) {
  // 账本行没有 hero 源元素,走 fade 转场(与首页时间线模式一致):
  // 前进滑入,返回时 DetailView 读取 detail-fade 标记走同款滑出
  runWithRouteTransition(
    () => router.push(`/detail/${id}`),
    {
      direction: 'forward',
      preferFallback: true,
      returnPath: route.fullPath,
      detailTransitionKind: 'detail-fade'
    }
  )
}
</script>

<style scoped>
.sale-ledger-page {
  min-height: 100dvh;
  background: var(--app-bg);
  color: var(--app-text);
}

.page-body {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 16px 16px max(24px, env(safe-area-inset-bottom));
  max-width: 720px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
}

.hero-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.hero-copy { display: flex; flex-direction: column; gap: 4px; }
.hero-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--app-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin: 0;
}
.hero-title { font-size: 24px; font-weight: 700; margin: 0; }
.hero-desc { font-size: 13px; color: var(--app-text-secondary); margin: 0; }

.summary-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.summary-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 16px;
  border-radius: var(--radius-card, 18px);
  background: color-mix(in srgb, var(--app-glass) 76%, var(--app-surface));
  border: 1px solid color-mix(in srgb, var(--app-border) 78%, transparent);
}

.summary-kicker { font-size: 12px; color: var(--app-text-tertiary); }
.summary-value { font-size: 20px; font-weight: 700; color: var(--app-text); }

.tab-bar {
  display: flex;
  gap: 6px;
  padding: 4px;
  border-radius: var(--radius-small, 14px);
  background: color-mix(in srgb, var(--app-glass) 76%, var(--app-surface));
  border: 1px solid color-mix(in srgb, var(--app-border) 78%, transparent);
}

.tab-btn {
  flex: 1;
  height: 38px;
  border: none;
  border-radius: 11px;
  background: transparent;
  color: var(--app-text-secondary);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.14s ease, color 0.14s ease;
}

.tab-btn--active {
  background: var(--app-surface);
  color: var(--app-text);
  font-weight: 600;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
}

.ledger-list { display: flex; flex-direction: column; gap: 10px; }

.ledger-card {
  display: flex;
  gap: 12px;
  width: 100%;
  padding: 12px;
  border-radius: var(--radius-card, 18px);
  background: color-mix(in srgb, var(--app-glass) 76%, var(--app-surface));
  border: 1px solid color-mix(in srgb, var(--app-border) 78%, transparent);
  cursor: pointer;
  text-align: left;
  transition: background 0.14s ease;
}
.ledger-card:active { background: var(--app-selection-bg); }

.ledger-thumb {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  overflow: hidden;
  flex-shrink: 0;
  background: var(--app-surface-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 600;
  color: var(--app-text-tertiary);
}
.ledger-thumb__img { width: 100%; height: 100%; object-fit: cover; }

.ledger-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ledger-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--app-text);
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ledger-unit {
  font-size: 12px;
  font-weight: 500;
  color: var(--app-text-tertiary);
  margin-left: 4px;
}

.ledger-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

.ledger-chip {
  font-size: 11px;
  color: var(--app-chip-accent-text, #2070c0);
  background: var(--app-chip-accent-bg, rgba(32, 112, 192, 0.12));
  padding: 1px 8px;
  border-radius: 999px;
}

.ledger-date { font-size: 12px; color: var(--app-text-tertiary); }

.ledger-figures { display: flex; gap: 16px; flex-wrap: wrap; }

.ledger-figure { display: flex; flex-direction: column; gap: 1px; }
.ledger-figure__label { font-size: 11px; color: var(--app-text-tertiary); }
.ledger-figure__value { font-size: 14px; font-weight: 600; color: var(--app-text); }

.ledger-no-price { font-size: 13px; color: var(--app-text-tertiary); }

.profit--gain { color: var(--app-success, #16a34a) !important; }
.profit--loss { color: var(--app-danger, #dc2626) !important; }

/* 已出/在售内容切换过渡(方向随 tab 顺序) */
.ledger-swap-enter-active,
.ledger-swap-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}
.list-section--forward .ledger-swap-enter-from { opacity: 0; transform: translateX(18px); }
.list-section--forward .ledger-swap-leave-to { opacity: 0; transform: translateX(-18px); }
.list-section--back .ledger-swap-enter-from { opacity: 0; transform: translateX(-18px); }
.list-section--back .ledger-swap-leave-to { opacity: 0; transform: translateX(18px); }

/* 平板适配(与全站 900px 断点一致) */
@media (min-width: 900px) {
  .page-body {
    max-width: 1040px;
    padding: 24px 32px max(32px, env(safe-area-inset-bottom));
    gap: 24px;
  }

  .hero-title { font-size: 28px; }

  .summary-grid {
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
  }

  .summary-card { padding: 18px 20px; }
  .summary-value { font-size: 24px; }

  .tab-bar { max-width: 420px; margin: 0 auto; }

  .ledger-list {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    align-items: start;
  }

  .ledger-thumb { width: 64px; height: 64px; }
}
</style>
