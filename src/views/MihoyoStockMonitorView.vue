<template>
  <div class="page monitor-page" :class="{ 'monitor-page--tablet': isTabletViewport }">
    <NavBar :title="t('nav.mihoyoStockMonitor')" show-back />

    <main class="page-body">
      <section v-if="!authStore.isLoggedIn" class="state-card state-card--empty">
        <span class="state-card__icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="11" width="18" height="10" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </span>
        <h2 class="state-card__title">{{ t('mihoyoStock.needLogin') }}</h2>
        <p class="state-card__desc">{{ t('mihoyoStock.needLoginDesc') }}</p>
        <button class="primary-btn" type="button" @click="goToLogin">{{ t('mihoyoStock.goToLogin') }}</button>
      </section>

      <section v-else>
        <section class="hero-card">
          <div class="hero-card__copy">
            <p class="hero-card__label">Stock Monitor</p>
            <h1 class="hero-card__title">{{ t('mihoyoStock.title') }}</h1>
            <p class="hero-card__desc">{{ t('mihoyoStock.desc') }}</p>
          </div>
          <div class="hero-card__stats">
            <article class="stat-pill">
              <span class="stat-pill__value">{{ monitorStore.count }}</span>
              <span class="stat-pill__label">{{ t('mihoyoStock.monitored') }}</span>
            </article>
            <article class="stat-pill">
              <span class="stat-pill__value stat-pill__value--stock">{{ inStockCount }}</span>
              <span class="stat-pill__label">{{ t('mihoyoStock.inStock') }}</span>
            </article>
          </div>
        </section>

        <!-- 添加/搜索区：可搜名称/角色，也可直接粘贴链接或商品 ID -->
        <section class="add-card search-card">
          <div class="add-card__copy">
            <p class="add-card__label">{{ t('mihoyoStock.addLabel') }}</p>
            <p class="add-card__desc">{{ t('mihoyoStock.addDesc') }}</p>
          </div>
          <div class="add-card__row">
            <input
              v-model="inputValue"
              class="add-input"
              type="text"
              :placeholder="t('mihoyoStock.addPlaceholder')"
              :disabled="adding || searching || loading"
              @keyup.enter="handleSubmit"
            />
            <button
              class="add-btn"
              type="button"
              :disabled="adding || searching || loading || !inputValue.trim()"
              @click="handleSubmit"
            >
              <svg v-if="adding || searching" class="spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="9" stroke-dasharray="60" />
              </svg>
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <span>{{ adding || searching ? t('mihoyoStock.searching') : t('mihoyoStock.search') }}</span>
            </button>
          </div>

          <p v-if="searchError" class="search-error">{{ searchError }}</p>

          <div v-if="visibleSearchResults.length > 0" class="search-results-toolbar">
            <span class="search-results-toolbar__hint">{{ t('mihoyoStock.resultCount', { count: visibleSearchResults.length }) }}</span>
          </div>

          <div
            v-if="visibleSearchResults.length > 0"
            class="search-results"
            :class="{ 'search-results--tablet': isTabletViewport }"
          >
            <button
              v-for="item in visibleSearchResults"
              :key="String(item?.goods_id)"
              type="button"
              class="search-result-card"
              @click="onSearchResultClick(item)"
            >
              <span class="search-result-thumb">
                <img v-if="getSearchResultCover(item)" :src="getSearchResultCover(item)" :alt="item.name" loading="lazy" />
                <span v-else>{{ (item.name || '?').charAt(0) }}</span>
              </span>
              <span class="search-result-name">{{ item.name }}</span>
              <span v-if="isQueued(item)" class="search-result-queued">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                {{ t('mihoyoStock.inQueue') }}
              </span>
            </button>
          </div>

          <div v-if="showSearchToggle" class="search-results-toggle-wrap">
            <button
              type="button"
              class="search-results-toggle"
              :class="{ 'search-results-toggle--expanded': searchExpanded }"
              @click="toggleSearchExpanded"
            >
              {{ searchExpanded ? t('mihoyoStock.collapseResults') : t('mihoyoStock.expandMore') }}
            </button>
          </div>

          <div v-if="showSearchLoadMoreStatus" ref="searchLoadMoreRef" class="search-results-status">
            <span v-if="searchLoadingMore">{{ t('mihoyoStock.loadingMore') }}</span>
            <template v-else>
              <span>{{ t('mihoyoStock.scrollForMore') }}</span>
              <button type="button" class="search-results-load-more" @click="loadMoreSearchResults">
                {{ t('mihoyoStock.loadMore') }}
              </button>
            </template>
          </div>
        </section>

        <!-- SKU 选择确认区：手机端左右滑动卡片逐个选 SKU；平板端选择卡片 + 队列卡片并排 -->
        <!-- 与米游铺批量导入共用同一套队列面板（MihoyoGoodsQueuePanel + useMihoyoGoodsQueue） -->
        <MihoyoGoodsQueuePanel
          ref="queuePanelRef"
          :queue="queue"
          :active-uid="activeUid"
          :is-tablet="isTabletViewport"
          @activate="activateQueueEntry($event, { scrollDeck: true })"
          @remove="removeFromQueue($event)"
          @deck-scroll="onDeckScroll"
        >
          <template #slide="{ entry }">
            <MihoyoSkuPickerCard
              :entry="entry"
              :show-remove="queue.length > 1"
              :counter="queue.length > 1 ? `${queue.indexOf(entry) + 1} / ${queue.length}` : ''"
              :large-thumb="true"
              @select-sku="selectSku(entry, $event)"
              @select-whole="selectWholeGoods(entry)"
              @expand="expandSkuPicker(entry)"
              @collapse="collapseSkuPicker(entry)"
              @retry="retryLoadVariants(entry)"
              @remove="removeFromQueue(entry.uid)"
            />
          </template>

          <template #actions>
            <button
              class="confirm-btn confirm-btn--ghost"
              type="button"
              :disabled="adding"
              @click="clearQueue"
            >
              {{ t('mihoyoStock.cancel') }}
            </button>
            <button
              class="confirm-btn confirm-btn--primary"
              type="button"
              :disabled="adding"
              @click="confirmQueue"
            >
              <svg v-if="adding" class="spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="9" stroke-dasharray="60" />
              </svg>
              <span>{{ queue.length > 1 ? t('mihoyoStock.confirmAll') : t('mihoyoStock.confirmAdd') }}</span>
            </button>
          </template>
        </MihoyoGoodsQueuePanel>

        <section class="list-card">
          <div class="list-card__head">
            <div class="list-card__copy">
              <p class="list-card__label">Records</p>
              <h2 class="list-card__title">
                {{ monitorStore.items.length > 0 ? t('mihoyoStock.monitorCount', { count: monitorStore.items.length }) : t('mihoyoStock.empty') }}
              </h2>
            </div>
            <button
              class="refresh-btn"
              type="button"
              :disabled="loading || monitorStore.rechecking || recheckCooldownLeft > 0"
              @click="handleRefresh"
            >
              <svg v-if="monitorStore.rechecking" class="spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="9" stroke-dasharray="60" />
              </svg>
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 12a9 9 0 11-6.219-8.56" />
                <polyline points="21 3 21 9 15 9" />
              </svg>
              <span v-if="monitorStore.rechecking">{{ t('mihoyoStock.rechecking') }}</span>
              <span v-else-if="recheckCooldownLeft > 0">{{ t('mihoyoStock.cooldown', { s: recheckCooldownLeft }) }}</span>
              <span v-else>{{ t('mihoyoStock.refresh') }}</span>
            </button>
          </div>

          <section v-if="loading && monitorStore.items.length === 0" class="state-card state-card--loading">
            <span class="spinner" />
            <p class="state-card__desc">{{ t('common.loading') }}</p>
          </section>

          <section v-else-if="loadError" class="state-card state-card--empty">
            <span class="state-card__icon state-card__icon--danger">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v5" />
                <path d="M12 16h.01" />
              </svg>
            </span>
            <h2 class="state-card__title">{{ loadError }}</h2>
            <button class="primary-btn" type="button" @click="loadList">{{ t('mihoyoStock.retry') }}</button>
          </section>

          <section v-else-if="monitorStore.items.length === 0" class="state-card state-card--empty">
            <span class="state-card__icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <path d="M3.27 6.96L12 12.01l8.73-5.05" />
                <path d="M12 22.08V12" />
              </svg>
            </span>
            <h2 class="state-card__title">{{ t('mihoyoStock.emptyTitle') }}</h2>
            <p class="state-card__desc">{{ t('mihoyoStock.emptyDesc') }}</p>
          </section>

          <section v-else class="monitor-list">
            <article
              v-for="item in monitorStore.items"
              :key="item.id"
              class="monitor-item"
            >
              <div class="monitor-item__thumb">
                <img
                  v-if="item.cover_url"
                  :src="item.cover_url"
                  class="monitor-item__thumb-img"
                  loading="lazy"
                  alt=""
                />
                <span v-else class="monitor-item__thumb-fallback">{{ (item.name || '谷').charAt(0) }}</span>
              </div>
              <div class="monitor-item__copy">
                <div class="monitor-item__topline">
                  <h3 class="monitor-item__title">{{ item.name || t('mihoyoStock.unnamed') }}</h3>
                  <span :class="['monitor-status', statusClass(item)]">{{ statusLabel(item) }}</span>
                </div>
                <div class="monitor-item__meta">
                  <span v-if="item.sku_name" class="monitor-meta-pill monitor-meta-pill--sku">{{ item.sku_name }}</span>
                  <span
                    v-if="item.in_stock && item.stock_count > 0"
                    class="monitor-meta-pill monitor-meta-pill--stock"
                  >
                    {{ t('mihoyoStock.stockCount', { count: item.stock_count }) }}
                  </span>
                  <span class="monitor-meta-pill">{{ priceText(item) }}</span>
                  <span v-if="item.last_checked_at" class="monitor-item__checked">
                    {{ t('mihoyoStock.checkedAt', { time: formatCheckedAt(item.last_checked_at) }) }}
                  </span>
                </div>
              </div>
              <button
                class="monitor-item__remove"
                type="button"
                :aria-label="t('mihoyoStock.remove')"
                :disabled="removingId === item.id"
                @click="handleRemove(item)"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </article>
          </section>
        </section>

        <p class="monitor-note">{{ t('mihoyoStock.note') }}</p>
      </section>

      <AppToast :message="toastMsg" />
    </main>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import NavBar from '@/components/common/NavBar.vue'
import AppToast from '@/components/common/AppToast.vue'
import MihoyoSkuPickerCard from '@/components/my/mihoyoStock/MihoyoSkuPickerCard.vue'
import MihoyoGoodsQueuePanel from '@/components/my/mihoyoStock/MihoyoGoodsQueuePanel.vue'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'
import { useMihoyoStockMonitorStore } from '@/stores/mihoyoStockMonitor'
import { useMihoyoGoodsSearch } from '@/composables/import/useMihoyoGoodsSearch'
import { useMihoyoGoodsQueue } from '@/composables/import/useMihoyoGoodsQueue'
import { useTabletViewport } from '@/composables/useTabletViewport'
import { parseMihoyoUrl, isMihoyoGiftUrl } from '@/utils/mihoyo'

defineOptions({ name: 'MihoyoStockMonitorView' })

const { t } = useI18n()
const router = useRouter()
const { toastMsg, showToast } = useToast()

const authStore = useAuthStore()
const monitorStore = useMihoyoStockMonitorStore()
const { isTabletViewport, updateViewport } = useTabletViewport()

const inputValue = ref('')
const adding = ref(false)
const loading = ref(false)
const loadError = ref('')
const removingId = ref('')
const recheckCooldownLeft = ref(0)
let recheckCooldownTimer = null

// ── 米游铺商品搜索（复用导入页同款搜索引擎，含角色感知） ──
const search = useMihoyoGoodsSearch({ scrollRootSelector: '.monitor-page .page-body' })
const {
  searchKeyword,
  searchExpanded,
  searching,
  searchLoadingMore,
  searchError,
  variantSearchHint,
  searchLoadMoreRef,
  visibleSearchResults,
  showSearchToggle,
  showSearchLoadMoreStatus,
  getSearchResultCover,
  handleGoodsSearch,
  loadMoreSearchResults,
  toggleSearchExpanded,
} = search

// ── 待确认添加队列（搜索/URL 解析后先选 SKU 再入库，支持多选逐个处理） ──
// 与米游铺批量导入共用同一套队列逻辑（useMihoyoGoodsQueue + MihoyoGoodsQueuePanel）
const queuePanelRef = ref(null)
const {
  queue,
  activeUid,
  isQueued,
  getQueuedEntry,
  enqueueGoods,
  selectSku,
  selectWholeGoods,
  expandSkuPicker,
  collapseSkuPicker,
  retryLoadVariants,
  activateQueueEntry,
  onDeckScroll,
  removeFromQueue,
  clearQueue,
} = useMihoyoGoodsQueue({
  hint: () => variantSearchHint.value,
  getDeckEl: () => queuePanelRef.value?.deckEl || null,
})

const inStockCount = computed(() => monitorStore.items.filter((i) => !!i.in_stock).length)

function formatCheckedAt(value) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function priceText(item) {
  const cents = Number(item.price_cents) || 0
  if (cents <= 0) return t('mihoyoStock.noPrice')
  const yuan = cents / 100
  return (yuan % 1 === 0 ? yuan.toFixed(0) : yuan.toFixed(2)) + t('mihoyoStock.priceUnit')
}

function statusLabel(item) {
  if (item.in_stock) return t('mihoyoStock.statusInStock')
  if (!item.last_checked_at) return t('mihoyoStock.statusChecking')
  return t('mihoyoStock.statusSoldOut')
}

function statusClass(item) {
  if (item.in_stock) return 'monitor-status--stock'
  if (!item.last_checked_at) return 'monitor-status--checking'
  return 'monitor-status--sold'
}

function goToLogin() {
  router.push('/manage/sync')
}

async function loadList() {
  if (!authStore.isLoggedIn) return
  loading.value = true
  loadError.value = ''
  try {
    await monitorStore.load()
  } catch (e) {
    loadError.value = e.message || t('common.loadingFailed')
  } finally {
    loading.value = false
  }
}

// ── 手动重检：逐个检测所有监控商品是否有货（带冷却限制） ──
function startRecheckCooldownTick() {
  stopRecheckCooldownTick()
  const tick = () => {
    recheckCooldownLeft.value = monitorStore.getRecheckCooldownRemaining()
    if (recheckCooldownLeft.value > 0) {
      recheckCooldownTimer = setTimeout(tick, 300)
    }
  }
  tick()
}

function stopRecheckCooldownTick() {
  if (recheckCooldownTimer) {
    clearTimeout(recheckCooldownTimer)
    recheckCooldownTimer = null
  }
}

async function handleRefresh() {
  if (!authStore.isLoggedIn || monitorStore.rechecking) return
  // 没有监控商品时退化为普通拉取（无请求可发，无需冷却）
  if (!monitorStore.items.length) {
    await loadList()
    return
  }
  const result = await monitorStore.recheckAll()
  startRecheckCooldownTick()
  if (result.rateLimited) {
    showToast(t('mihoyoStock.recheckWait'))
    return
  }
  if (result.checked > 0) {
    showToast(t('mihoyoStock.recheckDone', { count: result.checked }))
  } else {
    showToast(t('mihoyoStock.recheckFail'))
  }
}

// ── 待确认队列：单个/多个商品逐个选 SKU 后统一确认；同一商品可多选多个 SKU ──
// 队列增删、款式加载、自动选款、滑动/切换逻辑均来自共享 useMihoyoGoodsQueue（见上方）

// 搜索点击：点一个商品就加入待选 SKU 队列，逐个确认后统一入库（已在队列的再次点击 = 移出队列）
function onSearchResultClick(item) {
  if (!item?.goods_id) return
  const existing = getQueuedEntry(item)
  if (existing) {
    removeFromQueue(existing.uid)
    showToast(t('mihoyoStock.removedFromQueue'))
    return
  }
  search.selectSearchResult(item)
  const priceYuan = Number(item?.price)
  enqueueGoods({
    goodsId: item.goods_id,
    name: item?.name || '',
    priceCents: priceYuan > 0 ? Math.round(priceYuan * 100) : 0,
    coverUrl: getSearchResultCover(item) || item?.cover_url || '',
  })
}

// 合并输入框提交：链接/商品 ID → 解析进入 SKU 选择；否则当作关键词搜索
function handleSubmit() {
  const raw = inputValue.value.trim()
  if (!raw || adding.value || searching.value) return
  if (isMihoyoGiftUrl(raw) || /^\d{6,}$/.test(raw)) {
    handleAdd()
  } else {
    searchKeyword.value = raw
    handleGoodsSearch()
  }
}

// URL / 商品 ID 输入：解析后进入 SKU 选择流程
async function handleAdd() {
  const raw = inputValue.value.trim()
  if (!raw || adding.value) return
  adding.value = true
  search.resetSearchState()
  try {
    // 兼容直接粘贴 19 位 goods_id 与完整商品链接
    const url = /^\d{6,}$/.test(raw) ? `https://www.mihoyogift.com/goods/${raw}` : raw
    const parsed = await parseMihoyoUrl(url)
    enqueueGoods({
      goodsId: parsed.goodsId,
      name: parsed.name,
      priceCents: parsed.price ? Math.round(parsed.price * 100) : 0,
      coverUrl: parsed.image,
    })
    inputValue.value = ''
  } catch (e) {
    showToast(e.message || t('common.failed'))
  } finally {
    adding.value = false
  }
}

async function confirmQueue() {
  if (adding.value || !queue.value.length) return
  adding.value = true
  try {
    let added = 0
    let hasStock = false
    for (const entry of queue.value) {
      // 每个选中的 SKU 各生成一条监控；未选任何 SKU 则整件商品监控
      const targets = entry.selectedSkus.length ? entry.selectedSkus : [null]
      try {
        for (const sku of targets) {
          const row = await monitorStore.add({
            goodsId: entry.goodsId,
            name: entry.name,
            priceCents: entry.priceCents,
            coverUrl: sku?.cover_url || entry.coverUrl,
            skuKey: sku?.key || '',
            skuName: sku?.text || '',
          })
          added += 1
          if (row.in_stock) hasStock = true
        }
      } catch (e) {
        entry.error = e.message || t('common.failed')
      }
    }
    // 成功项出队；失败项保留并显示错误，可重试或取消
    const failed = queue.value.filter((e) => e.error)
    queue.value = failed
    if (failed.length && !failed.some((e) => e.uid === activeUid.value)) {
      activateQueueEntry(failed[0].uid, { scrollDeck: true })
    } else if (!failed.length) {
      activeUid.value = ''
    }
    if (added > 0) {
      showToast(hasStock ? t('mihoyoStock.addSuccessNow') : t('mihoyoStock.addSuccess'))
    } else if (failed.length) {
      showToast(failed[0].error)
    }
  } finally {
    adding.value = false
  }
}

async function handleRemove(item) {
  removingId.value = item.id
  try {
    await monitorStore.remove(item.id)
    showToast(t('mihoyoStock.removeSuccess'))
  } catch (e) {
    showToast(e.message || t('common.failed'))
  } finally {
    removingId.value = ''
  }
}

onMounted(() => {
  updateViewport()
  // 进入页面时同步上次手动重检剩余的冷却时间（store 内存态，同会话内导航仍生效）
  startRecheckCooldownTick()
  if (authStore.isLoggedIn && !monitorStore.isInitialized) {
    loadList()
  }
})

onBeforeUnmount(() => {
  stopRecheckCooldownTick()
})
</script>

<style scoped>
.monitor-page {
  min-height: 100dvh;
}

.page-body {
  padding-bottom: 40px;
}

.page-body > section {
  padding: 0 var(--page-padding);
  margin-top: var(--section-gap);
}

/* 包装层内部的卡片之间保留标准间距（首卡不额外加，避免与包装层 margin 叠加） */
.page-body > section > section + section {
  margin-top: var(--section-gap);
}

/* Hero */
.hero-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 20px;
  border-radius: var(--radius-large);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
}

.hero-card__label {
  color: var(--app-text-tertiary);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.hero-card__title {
  margin-top: 4px;
  color: var(--app-text);
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.03em;
}

.hero-card__desc {
  margin-top: 6px;
  color: var(--app-text-secondary);
  font-size: 13px;
  line-height: 1.5;
  max-width: 220px;
}

.hero-card__stats {
  display: flex;
  gap: 10px;
  flex-shrink: 0;
}

.stat-pill {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 60px;
  padding: 10px 12px;
  border-radius: 14px;
  background: var(--app-surface-soft);
}

.stat-pill__value {
  color: var(--app-text);
  font-size: 20px;
  font-weight: 700;
}

.stat-pill__value--stock {
  color: #34c759;
}

.stat-pill__label {
  color: var(--app-text-tertiary);
  font-size: 11px;
}

/* Add */
.add-card {
  padding: 16px;
  border-radius: 20px;
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
}

.add-card__label {
  color: var(--app-text);
  font-size: 15px;
  font-weight: 600;
}

.add-card__desc {
  margin-top: 3px;
  color: var(--app-text-secondary);
  font-size: 13px;
  line-height: 1.4;
}

.add-card__row {
  display: flex;
  gap: 10px;
  margin-top: 12px;
}

.add-input {
  flex: 1;
  min-width: 0;
  padding: 12px 14px;
  border: 1px solid var(--app-border);
  border-radius: 12px;
  background: var(--app-surface-soft);
  color: var(--app-text);
  font-size: 14px;
  outline: none;
}

.add-input:focus {
  border-color: var(--app-chip-accent-text);
}

.add-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 16px;
  border: none;
  border-radius: 12px;
  background: var(--app-text);
  color: var(--app-surface);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;
}

/* 分屏设置页会给所有 .add-btn 注入紧凑按钮样式，这里恢复监控页搜索按钮的完整尺寸。 */
.monitor-page.monitor-page--tablet .add-btn {
  width: auto;
  min-width: 88px;
  height: 40px;
  margin-top: 0;
  padding: 0 16px;
  border: none;
  border-radius: 12px;
  background: var(--app-text);
  box-shadow: none;
  white-space: nowrap;
}

.add-btn svg {
  width: 16px;
  height: 16px;
  stroke: currentColor;
}

.add-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 平板下输入框不无限拉伸，避免搜索按钮被挤成一小点 */
.monitor-page--tablet .add-card__row {
  width: 100%;
  max-width: none;
}

/* 搜索结果 */
.search-error {
  margin-top: 8px;
  color: #ff3b30;
  font-size: 12px;
  line-height: 1.4;
}

.search-results {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}

/* 平板双栏 */
.search-results--tablet {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.search-result-card {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: var(--app-surface-soft);
  color: var(--app-text);
  text-align: left;
  cursor: pointer;
}

.search-result-thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 10px;
  overflow: hidden;
  flex-shrink: 0;
  background: var(--app-surface);
  color: var(--app-text-tertiary);
  font-size: 16px;
}

.search-result-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.search-result-name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

/* 已在待选队列中的搜索结果标记 */
.search-result-queued {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  padding: 3px 8px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--app-chip-accent-text) 10%, var(--app-surface));
  color: var(--app-chip-accent-text);
  font-size: 11px;
  font-weight: 600;
}

.search-result-queued svg {
  width: 11px;
  height: 11px;
  stroke: currentColor;
}

/* 搜索结果工具栏：结果数提示 */
.search-results-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 12px;
}

.search-results-toolbar__hint {
  color: var(--app-text-tertiary);
  font-size: 12px;
}

.search-results-toggle-wrap {
  margin-top: 8px;
  text-align: center;
}

.search-results-toggle {
  border: none;
  background: transparent;
  color: var(--app-chip-accent-text);
  font-size: 13px;
  cursor: pointer;
  padding: 4px 10px;
}

.search-results-status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 10px;
  color: var(--app-text-tertiary);
  font-size: 12px;
}

.search-results-load-more {
  border: none;
  background: transparent;
  color: var(--app-chip-accent-text);
  font-size: 12px;
  cursor: pointer;
}

/* 队列面板（滑动卡片 / 平板队列条 / 指示点）样式由共享组件 MihoyoGoodsQueuePanel 提供，
   这里只保留「底部操作按钮」样式（按钮由本页通过插槽注入面板）。 */

.confirm-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 11px 0;
  border: none;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.confirm-btn svg {
  width: 16px;
  height: 16px;
  stroke: currentColor;
}

.confirm-btn--ghost {
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
}

.confirm-btn--primary {
  background: var(--app-text);
  color: var(--app-surface);
}

.confirm-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* List */
.list-card {
  padding: 16px;
  border-radius: 20px;
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
}

.list-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.list-card__label {
  color: var(--app-text-tertiary);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.list-card__title {
  margin-top: 2px;
  color: var(--app-text);
  font-size: 16px;
  font-weight: 600;
}

.refresh-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border: 1px solid var(--app-border);
  border-radius: 10px;
  background: transparent;
  color: var(--app-text-secondary);
  font-size: 13px;
  cursor: pointer;
}

.refresh-btn svg {
  width: 14px;
  height: 14px;
  stroke: currentColor;
}

.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.monitor-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.monitor-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 14px;
  background: var(--app-surface-soft);
}

.monitor-item__thumb {
  width: 52px;
  height: 52px;
  border-radius: 10px;
  overflow: hidden;
  flex-shrink: 0;
  background: var(--app-surface);
}

.monitor-item__thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.monitor-item__thumb-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: var(--app-text-tertiary);
  font-size: 18px;
}

.monitor-item__copy {
  position: relative;
  flex: 1;
  min-width: 0;
}

.monitor-item__topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 34px;
  padding-right: 68px;
  gap: 8px;
}

.monitor-item__title {
  color: var(--app-text);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.monitor-status {
  position: absolute;
  top: 50%;
  right: 0;
  flex-shrink: 0;
  padding: 3px 8px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.2;
  transform: translateY(-50%);
}

.monitor-status--stock {
  background: rgba(52, 199, 89, 0.14);
  color: #34c759;
}

.monitor-status--sold {
  background: rgba(255, 59, 48, 0.12);
  color: #ff3b30;
}

.monitor-status--checking {
  background: rgba(255, 149, 0, 0.14);
  color: #ff9500;
}

.monitor-item__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  margin-top: 6px;
}

.monitor-meta-pill {
  padding: 2px 8px;
  border-radius: 8px;
  background: var(--app-surface);
  color: var(--app-text-secondary);
  font-size: 11px;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.monitor-meta-pill--sku {
  background: color-mix(in srgb, var(--app-chip-accent-text) 10%, var(--app-surface));
  color: var(--app-chip-accent-text);
}

.monitor-meta-pill--stock {
  background: rgba(52, 199, 89, 0.14);
  color: #34c759;
}

.monitor-item__checked {
  color: var(--app-text-tertiary);
  font-size: 11px;
}

.monitor-item__remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--app-text-tertiary);
  cursor: pointer;
  flex-shrink: 0;
}

.monitor-item__remove svg {
  width: 16px;
  height: 16px;
  stroke: currentColor;
}

.monitor-item__remove:active {
  background: color-mix(in srgb, var(--app-text) 8%, transparent);
  color: #ff3b30;
}

.monitor-item__remove:disabled {
  opacity: 0.5;
}

/* State cards */
.state-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 36px 20px;
  border-radius: 20px;
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
  text-align: center;
}

.state-card__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: 16px;
  background: rgba(84, 184, 253, 0.12);
  color: #54b8fd;
}

.state-card__icon svg {
  width: 26px;
  height: 26px;
  stroke: currentColor;
}

.state-card__icon--danger {
  background: rgba(255, 59, 48, 0.12);
  color: #ff3b30;
}

.state-card__title {
  color: var(--app-text);
  font-size: 16px;
  font-weight: 600;
}

.state-card__desc {
  color: var(--app-text-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.primary-btn {
  margin-top: 6px;
  padding: 10px 20px;
  border: none;
  border-radius: 12px;
  background: var(--app-text);
  color: var(--app-surface);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.monitor-note {
  margin-top: 14px;
  color: var(--app-text-tertiary);
  font-size: 12px;
  line-height: 1.5;
}

.spinner {
  animation: spin 0.9s linear infinite;
  stroke: currentColor;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
