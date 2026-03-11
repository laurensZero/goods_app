<template>
  <div class="page home-page">
    <main ref="pageBodyRef" class="page-body">
      <section v-if="!selectionMode" class="hero-section">
        <div class="hero-copy">
          <p class="hero-label">谷子收藏 / Goods Archive</p>
        </div>
        <button class="hero-search" type="button" aria-label="搜索" @click="$router.push('/search')">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20L16.65 16.65" />
          </svg>
        </button>
      </section>

      <template v-else>
        <section class="selection-header-spacer" aria-hidden="true" />
        <section class="selection-header" :style="selectionHeaderStyle">
        <button class="sel-back-btn" type="button" aria-label="退出多选" @click="exitSelectionMode">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <span class="sel-title">已选择 {{ selectedIds.size }} 项</span>
        <button class="sel-all-btn" type="button" @click="toggleSelectAll">
          {{ allSelected ? '取消全选' : '全选' }}
        </button>
        </section>
      </template>

      <section class="summary-section">
        <SummaryCard :total-value="totalValue" :total-count="goodsList.length" />
      </section>

      <section class="goods-header-section">
        <div class="goods-header-row">
          <div class="goods-header-left">
            <p class="section-label">我的收藏</p>
            <h2 class="section-title">全部谷子<span class="goods-count"> {{ totalQuantity }} 件</span></h2>
          </div>
          <!-- 排序 + 时间线切换 -->
          <div class="goods-header-btns">
            <button
              type="button"
              :class="['sort-toggle', { 'sort-toggle--asc': sortDirection === 'asc' }]"
              :aria-label="sortDirection === 'desc' ? '当前按时间降序，点击切换升序' : '当前按时间升序，点击切换降序'"
              @click="toggleSortDirection"
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M7 6V18" />
                <path d="M4 9L7 6L10 9" />
                <path d="M17 18V6" />
                <path d="M14 15L17 18L20 15" />
              </svg>
            </button>
            <button
              type="button"
              :class="['timeline-toggle', { 'timeline-toggle--active': displayDensity === 'timeline' }]"
              aria-label="切换时间线视图"
              @click="toggleTimelineMode"
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 8v4l2.5 2.5" />
                <circle cx="12" cy="12" r="8" />
              </svg>
            </button>
          </div>
          <!-- 密度切换器：手机独占一行（flex-basis:100%），平板同行 -->
          <div v-if="displayDensity !== 'timeline'" class="density-switch" aria-label="展示密度切换">
            <button
              v-for="mode in densityModes"
              :key="mode.value"
              type="button"
              :class="['density-switch__option', { 'density-switch__option--active': displayDensity === mode.value }]"
              @click="setDisplayDensity(mode.value)"
            >
              {{ mode.label }}
            </button>
          </div>
        </div>
      </section>

      <section v-if="goodsList.length > 0 && displayDensity !== 'timeline'" class="goods-section">
        <div
          :class="['goods-list', { 'goods-list--density-animating': isDensityAnimating }]"
          :style="goodsGridStyle"
        >
          <GoodsCard
            v-for="item in visibleGoodsList"
            :key="item.id"
            :item="item"
            :density="displayDensity"
            :selected="selectedIds.has(item.id)"
            :selection-mode="selectionMode"
            @long-press="enterSelectionMode(item.id)"
            @toggle-select="toggleSelect(item.id)"
            @open-detail="openDetail(item.id)"
          />
        </div>
      </section>

      <!-- 时间线模式 -->
      <template v-if="displayDensity === 'timeline' && goodsList.length > 0">
        <div class="tl-wrapper goods-section">
          <div class="tl-year-block" v-for="yearGroup in visibleTimelineYearGroups" :key="yearGroup.year">
            <div class="tl-year-header">
              <span class="tl-year-num">{{ yearGroup.year }}</span>
              <span class="tl-year-meta">{{ yearGroup.yearCount }} 件 · {{ formatPrice(yearGroup.yearTotal) }}</span>
            </div>

            <div
              v-for="(monthGroup, midx) in yearGroup.months"
              :key="monthGroup.yearMonth"
              class="tl-month-group"
              :class="{ 'tl-month-group--last': midx === yearGroup.months.length - 1 }"
            >
              <div class="tl-month-rail" aria-hidden="true">
                <div class="tl-month-dot" />
                <div class="tl-month-line" />
              </div>
              <div class="tl-month-content">
                <div class="tl-month-header">
                  <span class="tl-month-label">{{ monthGroup.month }} 月</span>
                  <div class="tl-month-meta">
                    <span class="tl-month-count">{{ monthGroup.count }} 件</span>
                    <span v-if="monthGroup.totalSpend > 0" class="tl-month-spend">{{ formatPrice(monthGroup.totalSpend) }}</span>
                  </div>
                </div>
                <div class="tl-thumb-grid">
                  <button
                    v-for="item in monthGroup.items"
                    :key="item.id"
                    type="button"
                    class="tl-thumb-btn"
                    :class="{ 'tl-thumb-btn--active': expandedItemId === item.id }"
                    @click="toggleTimelineItem(item.id)"
                  >
                    <div class="tl-thumb-img-wrap">
                      <LazyCachedImage
                        v-if="item.image"
                        class="tl-thumb-img"
                        :src="item.image"
                        :alt="item.name"
                        root-margin="120px 0px"
                      />
                      <div v-else class="tl-thumb-empty">✦</div>
                    </div>
                  </button>
                </div>
                <transition name="tl-expand">
                  <TimelineExpandCard
                    v-if="expandedItem && expandedSectionKey === monthGroup.yearMonth"
                    :item="expandedItem"
                    @open-detail="openDetail(expandedItem.id)"
                  />
                </transition>
              </div>
            </div>
          </div>

          <div v-if="showVisibleTimelineUnknown" class="tl-month-group tl-month-group--last">
            <div class="tl-month-rail" aria-hidden="true">
              <div class="tl-month-dot tl-month-dot--muted" />
              <div class="tl-month-line" />
            </div>
            <div class="tl-month-content">
              <div class="tl-month-header">
                <span class="tl-month-label">日期未知</span>
                <div class="tl-month-meta">
                  <span class="tl-month-count">{{ timelineUnknown.length }} 件</span>
                </div>
              </div>
              <div class="tl-thumb-grid">
                <button
                  v-for="item in timelineUnknown"
                  :key="item.id"
                  type="button"
                  class="tl-thumb-btn"
                  :class="{ 'tl-thumb-btn--active': expandedItemId === item.id }"
                  @click="toggleTimelineItem(item.id)"
                >
                  <div class="tl-thumb-img-wrap">
                    <LazyCachedImage
                      v-if="item.image"
                      class="tl-thumb-img"
                      :src="item.image"
                      :alt="item.name"
                      root-margin="120px 0px"
                    />
                    <div v-else class="tl-thumb-empty">✦</div>
                  </div>
                </button>
              </div>
              <transition name="tl-expand">
                <TimelineExpandCard
                  v-if="expandedItem && expandedSectionKey === TIMELINE_UNKNOWN_SECTION_KEY"
                  :item="expandedItem"
                  @open-detail="openDetail(expandedItem.id)"
                />
              </transition>
            </div>
          </div>
        </div>
      </template>

      <section v-else-if="goodsList.length === 0" class="empty-wrap">
        <EmptyState
          icon="✦"
          title="还没有收藏记录"
          description="从徽章、手办到卡片，把每一件喜欢的谷子收进这里。"
          action-text="添加第一件"
          @action="goToAdd"
        />
      </section>
    </main>

    <Teleport to="body">
      <button v-if="!selectionMode && isHomeActive" class="fab" type="button" aria-label="添加" @click="showAddSheet = true">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 5V19" />
          <path d="M5 12H19" />
        </svg>
      </button>
    </Teleport>

    <AddMethodSheet
      v-model="showAddSheet"
      @manual="goToAdd"
      @import="handleImport"
      @account-import="handleAccountImport"
      @taobao-import="handleTaobaoImport"
    />

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
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useGoodsStore } from '@/stores/goods'
import { preloadImages } from '@/utils/imageCache'
import { formatPrice } from '@/utils/format'
import { useGoodsSelection } from '@/composables/useGoodsSelection'
import { addAndroidBackButtonListener } from '@/utils/androidBackButton'
import SummaryCard from '@/components/SummaryCard.vue'
import GoodsCard from '@/components/GoodsCard.vue'
import EmptyState from '@/components/EmptyState.vue'
import AddMethodSheet from '@/components/AddMethodSheet.vue'
import GoodsBatchEditSheet from '@/components/GoodsBatchEditSheet.vue'
import GoodsSelectionActionBar from '@/components/GoodsSelectionActionBar.vue'
import GoodsDeleteConfirm from '@/components/GoodsDeleteConfirm.vue'
import LazyCachedImage from '@/components/LazyCachedImage.vue'
import TimelineExpandCard from '@/components/TimelineExpandCard.vue'

defineOptions({ name: 'HomeView' })

const store = useGoodsStore()
const pageBodyRef = ref(null)
const batchEditSheetRef = ref(null)
const DENSITY_STORAGE_KEY = 'goods-app:home-density'
const HOME_SCROLL_STORAGE_KEY = 'home-scroll'
const HOME_SCROLL_RESTORE_PENDING_KEY = 'home-scroll-restore-pending'
const TIMELINE_UNKNOWN_SECTION_KEY = 'timeline:unknown'
const densityModes = [
  { value: 'comfortable', label: '舒适', columns: 2 },
  { value: 'standard', label: '标准', columns: 3 },
  { value: 'compact', label: '紧凑', columns: 4 }
]
const densityColumnsMap = Object.fromEntries(densityModes.map((mode) => [mode.value, mode.columns]))

const displayDensity = ref('comfortable')
const sortDirection = ref('desc')
const isDensityAnimating = ref(false)
// 视口宽度，用于响应式列数计算
const windowWidth = ref(window.innerWidth)
const _onResize = () => { windowWidth.value = window.innerWidth }
// 各密度在不同断点下的列数：[{ minWidth, cols }] 降序排列
const densityBreakpoints = {
  comfortable: [{ minWidth: 1200, cols: 5 }, { minWidth: 900, cols: 4 }, { minWidth: 600, cols: 3 }, { minWidth: 0, cols: 2 }],
  standard:    [{ minWidth: 1200, cols: 6 }, { minWidth: 900, cols: 5 }, { minWidth: 600, cols: 4 }, { minWidth: 0, cols: 3 }],
  compact:     [{ minWidth: 1200, cols: 8 }, { minWidth: 900, cols: 6 }, { minWidth: 600, cols: 5 }, { minWidth: 0, cols: 4 }],
}
function getResponsiveCols(density) {
  const bps = densityBreakpoints[density]
  if (!bps) return densityColumnsMap[density] || 2
  return (bps.find(b => windowWidth.value >= b.minWidth) ?? bps[bps.length - 1]).cols
}
const SELECTION_HEADER_INITIAL_OFFSET = 20
const INITIAL_RENDER_ROWS = 6
const LOAD_MORE_ROWS = 4
const LOAD_MORE_THRESHOLD_PX = 720
const INITIAL_TIMELINE_MONTHS = 6
const LOAD_MORE_TIMELINE_MONTHS = 4
const TIMELINE_MONTH_ESTIMATED_HEIGHT = 360
const ROW_HEIGHT_MAP = {
  comfortable: 308,
  standard: 272,
  compact: 236
}
const selectionHeaderTopOffset = ref(SELECTION_HEADER_INITIAL_OFFSET)
const minDate = new Date(2000, 0, 1)
const maxDate = new Date(2100, 11, 31)
let densityAnimationTimer = 0
let removeAndroidBackListener = null
let selectionHeaderScrollBound = false
let pageScrollRaf = 0
let selectionHeaderScrollStart = 0

// 模块级变量，KeepAlive 激活期间稳定保存滚动位置
let _savedScrollTop = 0

// KeepAlive 激活状态：控制 Teleport FAB 在其他页面不穿透显示
const isHomeActive = ref(true)

// 添加方式面板
const showAddSheet = ref(false)
const router = useRouter()
function handleImport() {
  showAddSheet.value = false
  saveScrollPosition()
  router.push('/import')
}

function handleAccountImport() {
  showAddSheet.value = false
  saveScrollPosition()
  router.push('/account-import')
}

function handleTaobaoImport() {
  showAddSheet.value = false
  saveScrollPosition()
  router.push('/taobao-import')
}

function goToAdd() {
  showAddSheet.value = false
  saveScrollPosition()
  router.push('/add')
}

async function refresh() {
  await store.refreshList()
}

function getScrollEl() {
  return pageBodyRef.value || document.querySelector('.home-page .page-body')
}

// 同时读取 page-body.scrollTop 和 window.scrollY，取非零的那个
function readScrollTop() {
  const elTop = getScrollEl()?.scrollTop ?? 0
  const winTop = window.scrollY || document.documentElement.scrollTop || 0
  return elTop > 0 ? elTop : winTop
}

function saveScrollPosition() {
  const top = readScrollTop()
  _savedScrollTop = top
  sessionStorage.setItem(HOME_SCROLL_STORAGE_KEY, String(top))
  sessionStorage.setItem(HOME_SCROLL_RESTORE_PENDING_KEY, '1')
}

function applyScrollPosition(top) {
  if (!top || top <= 0) return
  const setAll = () => {
    const el = getScrollEl()
    if (el) el.scrollTop = top
    try { document.documentElement.scrollTop = top } catch {}
    try { document.body.scrollTop = top } catch {}
    try { window.scrollTo({ top, behavior: 'instant' }) } catch { window.scrollTo(0, top) }
  }
  setAll() // 立即同步执行，避免第一帧闪烁到顶部
  const delays = [50, 100, 200]
  delays.forEach(delay => setTimeout(setAll, delay))
}

function getInitialVisibleCount() {
  return Math.max(getResponsiveCols(displayDensity.value) * INITIAL_RENDER_ROWS, 24)
}

function getLoadMoreStep() {
  return Math.max(getResponsiveCols(displayDensity.value) * LOAD_MORE_ROWS, 16)
}

function estimateVisibleCountForScrollTop(scrollTop = 0) {
  if (displayDensity.value === 'timeline') return goodsList.value.length

  const cols = getResponsiveCols(displayDensity.value)
  const viewportHeight = getScrollEl()?.clientHeight || window.innerHeight || 800
  const rowHeight = ROW_HEIGHT_MAP[displayDensity.value] || 272
  const rowsNeeded = Math.ceil((scrollTop + viewportHeight * 2) / rowHeight)
  const estimatedCount = rowsNeeded * cols + getLoadMoreStep()
  return Math.min(goodsList.value.length, Math.max(getInitialVisibleCount(), estimatedCount))
}

function syncVisibleGoodsCount(scrollTop = 0) {
  visibleGoodsCount.value = estimateVisibleCountForScrollTop(scrollTop)
}

function maybeLoadMoreGoods() {
  if (displayDensity.value === 'timeline') return
  if (visibleGoodsCount.value >= goodsList.value.length) return

  const el = getScrollEl()
  if (!el) return

  const remaining = el.scrollHeight - el.scrollTop - el.clientHeight
  if (remaining > LOAD_MORE_THRESHOLD_PX) return

  visibleGoodsCount.value = Math.min(goodsList.value.length, visibleGoodsCount.value + getLoadMoreStep())
}

function getInitialVisibleTimelineMonths() {
  return INITIAL_TIMELINE_MONTHS
}

function estimateVisibleTimelineMonths(scrollTop = 0) {
  if (displayDensity.value !== 'timeline') return visibleTimelineMonthCount.value

  const viewportHeight = getScrollEl()?.clientHeight || window.innerHeight || 800
  const estimatedMonths = Math.ceil((scrollTop + viewportHeight * 1.6) / TIMELINE_MONTH_ESTIMATED_HEIGHT) + 1
  return Math.min(allTimelineMonthCount.value, Math.max(getInitialVisibleTimelineMonths(), estimatedMonths))
}

function syncVisibleTimelineMonthCount(scrollTop = 0) {
  visibleTimelineMonthCount.value = estimateVisibleTimelineMonths(scrollTop)
}

function maybeLoadMoreTimelineMonths() {
  if (displayDensity.value !== 'timeline') return
  if (visibleTimelineMonthCount.value >= allTimelineMonthCount.value) return

  const el = getScrollEl()
  if (!el) return

  const remaining = el.scrollHeight - el.scrollTop - el.clientHeight
  if (remaining > LOAD_MORE_THRESHOLD_PX) return

  visibleTimelineMonthCount.value = Math.min(
    allTimelineMonthCount.value,
    visibleTimelineMonthCount.value + LOAD_MORE_TIMELINE_MONTHS
  )
}

function handlePageScroll() {
  if (pageScrollRaf) return
  pageScrollRaf = window.requestAnimationFrame(() => {
    pageScrollRaf = 0
    if (selectionMode.value) updateSelectionHeaderOffset()
    maybeLoadMoreGoods()
    maybeLoadMoreTimelineMonths()
  })
}

function bindSelectionHeaderScroll() {
  if (selectionHeaderScrollBound) return
  getScrollEl()?.addEventListener('scroll', handlePageScroll, { passive: true })
  window.addEventListener('scroll', handlePageScroll, { passive: true })
  selectionHeaderScrollBound = true
}

function unbindSelectionHeaderScroll() {
  if (!selectionHeaderScrollBound) return
  getScrollEl()?.removeEventListener('scroll', handlePageScroll)
  window.removeEventListener('scroll', handlePageScroll)
  selectionHeaderScrollBound = false
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

onMounted(async () => {
  restoreDisplayDensity()
  window.addEventListener('resize', _onResize, { passive: true })
  await refresh()
  syncVisibleGoodsCount()
  syncVisibleTimelineMonthCount()
  await nextTick()
  bindSelectionHeaderScroll()
  updateSelectionHeaderOffset()
  const shouldRestore = sessionStorage.getItem(HOME_SCROLL_RESTORE_PENDING_KEY) === '1'
  const stored = _savedScrollTop || Number(sessionStorage.getItem(HOME_SCROLL_STORAGE_KEY) || 0)
  if (shouldRestore) {
    syncVisibleGoodsCount(stored)
    syncVisibleTimelineMonthCount(stored)
    await nextTick()
    applyScrollPosition(stored)
    sessionStorage.removeItem(HOME_SCROLL_RESTORE_PENDING_KEY)
  }
  window.addEventListener('popstate', handleSelectionPopState)
  bindAndroidBackButton()
})

onActivated(async () => {
  isHomeActive.value = true
  // KeepAlive 保留了 DOM，先读取当前真实滚动位置（KeepAlive 会保留 DOM 状态）
  const domTop = getScrollEl()?.scrollTop ?? 0
  const shouldRestore = sessionStorage.getItem(HOME_SCROLL_RESTORE_PENDING_KEY) === '1'
  const storedTop = shouldRestore
    ? (_savedScrollTop || Number(sessionStorage.getItem(HOME_SCROLL_STORAGE_KEY) || 0))
    : 0

  // 优先复用 KeepAlive 已保留的 DOM 位置，避免返回时先显示顶部再回跳。
  if (domTop > 0) {
    syncVisibleGoodsCount(domTop)
    syncVisibleTimelineMonthCount(domTop)
    if (shouldRestore) {
      sessionStorage.removeItem(HOME_SCROLL_RESTORE_PENDING_KEY)
    }
    bindSelectionHeaderScroll()
    updateSelectionHeaderOffset()
    bindAndroidBackButton()
    return
  }

  syncVisibleGoodsCount(storedTop)
  syncVisibleTimelineMonthCount(storedTop)
  if (storedTop > 0) {
    applyScrollPosition(storedTop)
  }
  await nextTick()
  if (storedTop > 0) {
    applyScrollPosition(storedTop)
  }
  bindSelectionHeaderScroll()
  updateSelectionHeaderOffset()
  if (shouldRestore) {
    sessionStorage.removeItem(HOME_SCROLL_RESTORE_PENDING_KEY)
  }
  bindAndroidBackButton()
})

onDeactivated(() => {
  isHomeActive.value = false
  // 不在此处调用 saveScrollPosition：onDeactivated 触发时 window.scrollY 可能已被路由重置为 0
  // 滚动位置已由 openDetail / handleImport / goToAdd 在跳转前显式保存
  exitSelectionModeQuiet()
  unbindSelectionHeaderScroll()
  unbindAndroidBackButton()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', _onResize)
  if (densityAnimationTimer) {
    window.clearTimeout(densityAnimationTimer)
    densityAnimationTimer = 0
  }
  if (pageScrollRaf) {
    window.cancelAnimationFrame(pageScrollRaf)
    pageScrollRaf = 0
  }
  unbindSelectionHeaderScroll()
  window.removeEventListener('popstate', handleSelectionPopState)
  unbindAndroidBackButton()
  document.body.classList.remove('selection-active')
  // 仅在值大于 0 时才覆盖，避免卸载时 DOM 已清空导致用 0 覆盖正确值
  const top = readScrollTop()
  if (top > 0) {
    _savedScrollTop = top
    sessionStorage.setItem(HOME_SCROLL_STORAGE_KEY, String(top))
  }
})

watch(displayDensity, (value) => {
  localStorage.setItem(DENSITY_STORAGE_KEY, value)
})

const goodsList = computed(() => {
  const items = [...store.list]

  items.sort((a, b) => {
    const aTime = a.acquiredAt ? new Date(a.acquiredAt).getTime() : 0
    const bTime = b.acquiredAt ? new Date(b.acquiredAt).getTime() : 0

    if (aTime !== bTime) {
      return sortDirection.value === 'asc' ? aTime - bTime : bTime - aTime
    }

    return sortDirection.value === 'asc'
      ? String(a.id).localeCompare(String(b.id))
      : String(b.id).localeCompare(String(a.id))
  })

  return items
})
const goodsById = computed(() => new Map(goodsList.value.map((item) => [item.id, item])))
const visibleGoodsCount = ref(0)
const visibleTimelineMonthCount = ref(INITIAL_TIMELINE_MONTHS)
const visibleGoodsList = computed(() =>
  displayDensity.value === 'timeline'
    ? goodsList.value
    : goodsList.value.slice(0, visibleGoodsCount.value || getInitialVisibleCount())
)
const totalValue = computed(() =>
  goodsList.value.reduce((sum, g) => sum + (Number(g.price) || 0) * (Number(g.quantity) || 1), 0).toFixed(2)
)
const totalQuantity = computed(() =>
  goodsList.value.reduce((sum, g) => sum + (Number(g.quantity) || 1), 0)
)

// ── 时间线年月分组 ──
const timelineYearGroups = computed(() => {
  const monthMap = {}
  for (const item of goodsList.value) {
    if (!item.acquiredAt) continue
    const ym = String(item.acquiredAt).slice(0, 7)
    if (!/^\d{4}-\d{2}$/.test(ym)) continue
    if (!monthMap[ym]) monthMap[ym] = []
    monthMap[ym].push(item)
  }
  const yearMap = {}
  Object.entries(monthMap).forEach(([ym, items]) => {
    const year = ym.slice(0, 4)
    if (!yearMap[year]) yearMap[year] = {}
    yearMap[year][ym] = items
  })
  return Object.entries(yearMap)
    .sort(([a], [b]) => sortDirection.value === 'asc' ? a.localeCompare(b) : b.localeCompare(a))
    .map(([year, ymMap]) => {
      const months = Object.entries(ymMap)
        .sort(([a], [b]) => sortDirection.value === 'asc' ? a.localeCompare(b) : b.localeCompare(a))
        .map(([ym, items]) => {
          const [, m] = ym.split('-')
          const totalSpend = items.reduce((sum, g) => { const p = parseFloat(g.price); return sum + (isNaN(p) ? 0 : p) }, 0)
          return { yearMonth: ym, month: String(parseInt(m, 10)), count: items.length, totalSpend, items }
        })
      const yearTotal = months.reduce((s, m) => s + m.totalSpend, 0)
      const yearCount = months.reduce((s, m) => s + m.count, 0)
      return { year, months, yearTotal, yearCount }
    })
})
const allTimelineMonthCount = computed(() =>
  timelineYearGroups.value.reduce((sum, yearGroup) => sum + yearGroup.months.length, 0)
)
const visibleTimelineYearGroups = computed(() => {
  if (displayDensity.value !== 'timeline') return timelineYearGroups.value

  let remaining = visibleTimelineMonthCount.value || getInitialVisibleTimelineMonths()
  const groups = []

  for (const yearGroup of timelineYearGroups.value) {
    if (remaining <= 0) break
    const months = yearGroup.months.slice(0, remaining)
    if (months.length > 0) {
      groups.push({
        ...yearGroup,
        yearCount: months.reduce((sum, month) => sum + month.count, 0),
        yearTotal: months.reduce((sum, month) => sum + month.totalSpend, 0),
        months
      })
      remaining -= months.length
    }
  }

  return groups
})
const timelineUnknown = computed(() =>
  goodsList.value.filter((item) => {
    if (!item.acquiredAt) return true
    return !/^\d{4}-\d{2}$/.test(String(item.acquiredAt).slice(0, 7))
  })
)
const showVisibleTimelineUnknown = computed(() =>
  timelineUnknown.value.length > 0 && visibleTimelineMonthCount.value >= allTimelineMonthCount.value
)
const goodsGridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${getResponsiveCols(displayDensity.value)}, minmax(0, 1fr))`
}))
const selectionHeaderStyle = computed(() => ({
  '--selection-header-offset': `${selectionHeaderTopOffset.value}px`
}))
const preloadLeadCount = computed(() =>
  displayDensity.value === 'timeline'
    ? 6
    : Math.max(getResponsiveCols(displayDensity.value) * 2, 8)
)
const preloadTargetList = computed(() =>
  (
    displayDensity.value === 'timeline'
      ? [
          ...visibleTimelineYearGroups.value.flatMap((yearGroup) =>
            yearGroup.months.flatMap((monthGroup) => monthGroup.items)
          ),
          ...(showVisibleTimelineUnknown.value ? timelineUnknown.value : [])
        ]
      : visibleGoodsList.value
  ).slice(0, preloadLeadCount.value)
)

watch(
  [() => goodsList.value.length, displayDensity, sortDirection, windowWidth],
  () => {
    syncVisibleGoodsCount(readScrollTop())
    syncVisibleTimelineMonthCount(readScrollTop())
  },
  { immediate: true }
)

watch(
  () => preloadTargetList.value.map((item) => item.image).filter(Boolean),
  (urls) => {
    if (urls.length) preloadImages(urls)
  },
  { immediate: true }
)

function setDisplayDensity(mode) {
  if (!densityColumnsMap[mode] || displayDensity.value === mode) return

  if (densityAnimationTimer) {
    window.clearTimeout(densityAnimationTimer)
    densityAnimationTimer = 0
  }

  displayDensity.value = mode
  isDensityAnimating.value = true
  densityAnimationTimer = window.setTimeout(() => {
    isDensityAnimating.value = false
    densityAnimationTimer = 0
  }, 170)
}

// 时间线模式切换（独立于密度切换）
function toggleTimelineMode() {
  if (displayDensity.value === 'timeline') {
    const stored = localStorage.getItem(DENSITY_STORAGE_KEY)
    displayDensity.value = densityColumnsMap[stored] ? stored : 'comfortable'
  } else {
    displayDensity.value = 'timeline'
  }
}

function toggleSortDirection() {
  sortDirection.value = sortDirection.value === 'desc' ? 'asc' : 'desc'
}

function restoreDisplayDensity() {
  const storedDensity = localStorage.getItem(DENSITY_STORAGE_KEY)
  if (storedDensity && densityModes.find(m => m.value === storedDensity)) {
    // 手机端不恢复 tile 模式（按钮不可见，避免困惑）
    if (storedDensity === 'tile' && window.innerWidth < 600) return
    displayDensity.value = storedDensity
  }
}

function updateSelectionHeaderOffset() {
  const scrolled = Math.min(
    Math.max(0, readScrollTop() - selectionHeaderScrollStart),
    SELECTION_HEADER_INITIAL_OFFSET
  )
  selectionHeaderTopOffset.value = Math.max(0, SELECTION_HEADER_INITIAL_OFFSET - scrolled)
}

function openDetail(id) {
  saveScrollPosition()
  router.push(`/detail/${id}`)
}

// -------- 时间线内联展开 --------
const expandedItemId = ref(null)
const expandedItem = computed(() =>
  expandedItemId.value ? goodsById.value.get(expandedItemId.value) ?? null : null
)
const expandedSectionKey = computed(() => {
  if (!expandedItem.value) return ''

  const yearMonth = String(expandedItem.value.acquiredAt || '').slice(0, 7)
  return /^\d{4}-\d{2}$/.test(yearMonth) ? yearMonth : TIMELINE_UNKNOWN_SECTION_KEY
})

function toggleTimelineItem(id) {
  expandedItemId.value = expandedItemId.value === id ? null : id
}

watch(displayDensity, (v) => {
  if (v !== 'timeline') expandedItemId.value = null
})

// -------- Multi-select --------
const showDeleteConfirm = ref(false)
const showBatchEditSheet = ref(false)

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
} = useGoodsSelection(computed(() => store.list), {
  historyKey: 'selectionMode',
  onExit: closeSelectionOverlays,
  getScrollTop: readScrollTop,
  restoreScrollTop: applyScrollPosition
})

watch(selectionMode, (active) => {
  if (active) {
    selectionHeaderScrollStart = readScrollTop()
    selectionHeaderTopOffset.value = SELECTION_HEADER_INITIAL_OFFSET
    return
  }

  selectionHeaderScrollStart = 0
  selectionHeaderTopOffset.value = SELECTION_HEADER_INITIAL_OFFSET
})

async function batchDelete() {
  if (selectedIds.value.size === 0) return
  showDeleteConfirm.value = true
}

async function confirmDelete() {
  showDeleteConfirm.value = false
  await store.removeMultipleGoods(selectedIds.value)
  exitSelectionModeQuiet()
}

function batchEdit() {
  if (selectedIds.value.size === 0) return
  showBatchEditSheet.value = true
}

async function applyBatchEditPayload(payload) {
  await store.updateMultipleGoods(selectedIds.value, payload)
  exitSelectionModeQuiet()
}
</script>

<style scoped>
.home-page {
  position: relative;
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

.hero-copy {
  max-width: 296px;
}

.hero-label {
  color: var(--app-text-tertiary);
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.hero-search {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--icon-button-size);
  height: var(--icon-button-size);
  margin-top: 6px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.84);
  box-shadow: var(--app-shadow);
  color: var(--app-text);
  flex-shrink: 0;
  transition: transform 0.16s ease, background 0.16s ease;
}

.hero-search svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.hero-search:active {
  transform: scale(0.96);
}

.goods-header-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 10px;
  margin-bottom: 14px;
}

.goods-header-left {
  flex: 1;
  min-width: 0;
}

.goods-header-btns {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.goods-count {
  font-size: 16px;
  font-weight: 400;
  color: var(--app-text-tertiary);
  margin-left: 4px;
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

.section-count {
  padding: 7px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.82);
  color: var(--app-text-secondary);
  font-size: 13px;
  white-space: nowrap;
  box-shadow: var(--app-shadow);
}

/* 手机：密度切换器换行占满宽度；平板：回到同行右侧 */
.density-switch {
  flex-basis: 100%;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  padding: 6px;
  border-radius: 18px;
  background: var(--app-glass);
  box-shadow: var(--app-shadow);
}

@media (min-width: 600px) {
  .density-switch {
    flex-basis: auto;
    display: inline-grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    order: 2; /* 平板：密度选择器排在按钮前面 */
  }

  .goods-header-btns {
    order: 3; /* 平板：两个按钮排在密度选择器后面 */
  }
}

.density-switch__option {
  min-width: 0;
  height: 36px;
  padding: 0 12px;
  border: none;
  border-radius: 14px;
  background: transparent;
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 600;
  transition: transform 0.16s ease, background 0.16s ease, color 0.16s ease;
}

.density-switch__option--active {
  background: #141416;
  color: #ffffff;
}

.density-switch__option:active {
  transform: scale(0.96);
}

/* ── 时间线切换按钮 ── */
.timeline-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border: none;
  border-radius: 18px;
  background: var(--app-glass);
  color: var(--app-text-secondary);
  box-shadow: var(--app-shadow);
  transition: transform 0.16s ease, background 0.16s ease, color 0.16s ease;
  flex-shrink: 0;
}

.timeline-toggle svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.timeline-toggle--active {
  background: #141416;
  color: #ffffff;
}

.timeline-toggle:active {
  transform: scale(0.96);
}

/* ── 时间线年表模式 ── */
.tl-wrapper {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 28px;
}

/* === 年度 block wrapper === */
.tl-year-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 年度标题行 */
.tl-year-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0 10px;
}

.tl-year-num {
  font-size: 20px;
  font-weight: 700;
  color: var(--app-text-secondary);
  letter-spacing: -0.02em;
  line-height: 1;
}

.tl-year-meta {
  font-size: 12px;
  font-weight: 500;
  color: var(--app-text-tertiary);
  white-space: nowrap;
}

/* === 每个月份行（含左侧竖线和圆点）=== */
.tl-month-group {
  position: relative;
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  column-gap: 14px;
  padding-bottom: 26px;
}

.tl-month-group--last {
  padding-bottom: 0;
}

.tl-month-rail {
  position: relative;
  display: flex;
  justify-content: center;
}

/* 竖线 */

/* 圆点 */
.tl-month-dot {
  position: absolute;
  top: 7px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--app-text) 82%, var(--app-text-tertiary));
  border: 1.5px solid var(--app-bg, #f5f5f7);
  z-index: 1;
}

.tl-month-line {
  width: 1px;
  flex: 1;
  margin-top: 17px;
  border-radius: 999px;
  transform: scaleX(0.55);
  transform-origin: center top;
  background: color-mix(in srgb, var(--app-text-tertiary) 16%, transparent);
}

.tl-month-group--last .tl-month-line {
  display: none;
}

.tl-month-dot--muted {
  background: var(--app-text-tertiary);
}

.tl-month-content {
  min-width: 0;
  content-visibility: auto;
  contain-intrinsic-size: 1px 340px;
}

/* 月份小标题行 */
.tl-month-header {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  margin-bottom: 14px;
}

.tl-month-label {
  font-size: 18px;
  font-weight: 700;
  color: var(--app-text);
  letter-spacing: -0.01em;
}

/* 件数 pill */
.tl-month-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.tl-month-count {
  font-size: 12px;
  font-weight: 500;
  color: var(--app-text-tertiary);
  letter-spacing: 0.01em;
}

/* 金额：推到右侧，字号放大 */
.tl-month-spend {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.01em;
  color: color-mix(in srgb, var(--app-text) 76%, var(--app-text-tertiary));
}

/* === 缩略图网格 === */
.tl-thumb-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  content-visibility: auto;
  contain-intrinsic-size: 1px 240px;
}

@media (min-width: 600px) {
  .tl-thumb-grid { grid-template-columns: repeat(5, 1fr); }
}

@media (min-width: 900px) {
  .tl-thumb-grid { grid-template-columns: repeat(7, 1fr); }
}

@media (min-width: 1200px) {
  .tl-thumb-grid { grid-template-columns: repeat(9, 1fr); }
}

.tl-thumb-btn {
  display: flex;
  flex-direction: column;
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
  transition: transform 0.15s ease, opacity 0.15s ease;
  content-visibility: auto;
  contain-intrinsic-size: 132px 132px;
}

.tl-thumb-btn:active {
  transform: scale(0.94);
  opacity: 0.8;
}

.tl-thumb-img-wrap {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 14px;
  overflow: hidden;
  background: var(--app-surface-soft, #eeeff2);
  box-shadow: 0 6px 16px rgba(17, 20, 22, 0.06);
  border: 1px solid color-mix(in srgb, var(--app-text-tertiary) 10%, transparent);
  transition: box-shadow 0.2s ease, outline-color 0.2s ease, outline-offset 0.2s ease;
}

.tl-thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  display: block;
  background: transparent;
}

.tl-thumb-empty {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--app-text-tertiary);
  font-size: 14px;
}

/* === 缩略图选中高亮（outline + 阳边 + 浮层阴影）=== */
.tl-thumb-btn--active {
  transform: scale(1.04);
  z-index: 1;
  position: relative;
}

.tl-thumb-btn--active .tl-thumb-img-wrap {
  outline: 2px solid var(--app-text);
  outline-offset: 3px;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.20), 0 3px 8px rgba(0, 0, 0, 0.10);
}

.sort-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border: none;
  border-radius: 18px;
  background: var(--app-glass);
  color: var(--app-text-secondary);
  box-shadow: var(--app-shadow);
  transition: transform 0.16s ease, background 0.16s ease, color 0.16s ease;
  flex-shrink: 0;
}

.sort-toggle svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.sort-toggle--asc {
  background: #141416;
  color: #ffffff;
}

.sort-toggle:active {
  transform: scale(0.96);
}

.goods-list {
  display: grid;
  gap: var(--card-gap);
  align-items: start;
}

.goods-list--density-animating {
  animation: density-grid-pulse 170ms ease;
  transform-origin: top center;
  will-change: opacity, transform;
}

@keyframes density-grid-pulse {
  0% {
    opacity: 0.78;
    transform: scale(0.987);
  }

  100% {
    opacity: 1;
    transform: scale(1);
  }
}

.fab {
  position: fixed;
  right: 16px;
  bottom: calc(var(--tabbar-height) + env(safe-area-inset-bottom));
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--fab-size);
  height: var(--fab-size);
  border: none;
  border-radius: 50%;
  background: #141416;
  color: #ffffff;
  box-shadow: var(--app-shadow);
  transition: transform 0.16s ease, box-shadow 0.16s ease;
  z-index: 65;
}

.fab svg {
  width: 22px;
  height: 22px;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
}

.fab:active {
  transform: scale(0.96);
}

/* -------- Selection mode AppBar -------- */
.selection-header-spacer {
  height: 64px;
}

.selection-header {
  position: fixed;
  top: calc(env(safe-area-inset-top) + var(--selection-header-offset, 20px));
  left: 50%;
  z-index: 70;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: min(100vw, 430px);
  padding: 10px var(--page-padding);
  border-radius: 22px;
  background: var(--app-glass-strong);
  border: 1px solid var(--app-glass-border);
  box-shadow: 0 10px 26px rgba(20, 20, 22, 0.08);
  backdrop-filter: blur(24px) saturate(145%);
  -webkit-backdrop-filter: blur(24px) saturate(145%);
  transform: translateX(-50%);
}

/* 左侧返回箭头按鈕 */
.sel-back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 50%;
  background: var(--app-glass);
  border: 1px solid var(--app-glass-border);
  color: var(--app-text);
  flex-shrink: 0;
  cursor: pointer;
  transition: opacity 0.16s ease;
}

.sel-back-btn svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.sel-back-btn:active {
  opacity: 0.6;
}

/* 右侧胶囊按鈕 */
.sel-all-btn {
  border: none;
  background: color-mix(in srgb, var(--app-glass) 76%, var(--app-surface));
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 500;
  padding: 4px 10px;
  border-radius: 12px;
  min-width: 48px;
  cursor: pointer;
  flex-shrink: 0;
  transition: opacity 0.16s ease;
}

.sel-all-btn:active {
  opacity: 0.6;
}

.sel-title {
  flex: 1;
  text-align: center;
  color: var(--app-text);
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

/* -------- Selection bottom action bar -------- */
.selection-action-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  gap: 10px;
  padding: 12px 16px calc(env(safe-area-inset-bottom) + 12px);
  background: var(--app-glass-strong);
  border-top: 1px solid var(--app-glass-border);
  backdrop-filter: blur(22px) saturate(145%);
  -webkit-backdrop-filter: blur(22px) saturate(145%);
  box-shadow: 0 -1px 0 color-mix(in srgb, var(--app-glass-border) 60%, transparent), 0 -16px 36px rgba(0, 0, 0, 0.12);
  z-index: 80;
}

.sel-action-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 50px;
  border: none;
  border-radius: 14px;
  background: color-mix(in srgb, var(--app-glass) 72%, var(--app-surface));
  color: var(--app-text-secondary);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  letter-spacing: -0.02em;
  transition: transform 0.14s ease, opacity 0.14s ease;
}

.sel-action-btn:active {
  transform: scale(0.97);
}

.sel-action-btn:disabled {
  opacity: 0.38;
  pointer-events: none;
}

.sel-action-btn svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
  flex-shrink: 0;
}

.sel-action-btn--danger {
  background: #f2f2f7;
  color: var(--app-text);
}

.sel-bar-enter-active,
.sel-bar-leave-active {
  transition: transform 0.24s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.2s ease;
}

.sel-bar-enter-from,
.sel-bar-leave-to {
  transform: translateY(100%);
  opacity: 0;
}

.batch-edit-popup {
  overflow: hidden;
}

.batch-edit-sheet {
  padding: 12px 16px calc(env(safe-area-inset-bottom) + 16px);
  background:
    radial-gradient(circle at top, rgba(255, 255, 255, 0.2), transparent 34%),
    color-mix(in srgb, var(--app-surface) 92%, transparent);
  backdrop-filter: blur(22px) saturate(140%);
  -webkit-backdrop-filter: blur(22px) saturate(140%);
}

.batch-edit-sheet__handle {
  width: 42px;
  height: 5px;
  margin: 0 auto 18px;
  border-radius: 999px;
  background: rgba(20, 20, 22, 0.12);
}

.batch-edit-hero {
  margin-bottom: 14px;
}

.batch-edit-hero__label {
  color: var(--app-text-tertiary);
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.batch-edit-hero__title {
  margin-top: 6px;
  color: var(--app-text);
  font-size: 26px;
  font-weight: 600;
  letter-spacing: -0.04em;
}

.batch-edit-hero__desc {
  margin-top: 8px;
  color: var(--app-text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.batch-edit-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 14px;
  border-radius: var(--radius-card);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border-radius: var(--radius-small);
  background: var(--app-surface-soft);
}

.field-label {
  color: var(--app-text);
  font-size: 14px;
  font-weight: 600;
}

.date-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 48px;
  padding: 0 14px;
  border: 1px solid rgba(20, 20, 22, 0.08);
  border-radius: 16px;
  background: var(--app-surface);
  color: var(--app-text);
  text-align: left;
  transition: border-color 0.18s ease, transform 0.16s ease, box-shadow 0.18s ease;
}

.date-field:active {
  transform: scale(0.98);
}

.date-field:focus-visible {
  border-color: rgba(20, 20, 22, 0.16);
  box-shadow: 0 0 0 3px rgba(20, 20, 22, 0.04);
  outline: none;
}

.date-field span {
  color: var(--app-text);
  font-size: 16px;
}

.date-field__value--placeholder {
  color: var(--app-placeholder);
}

.date-field__icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  stroke: #8e8e93;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.multi-select {
  position: relative;
}

.multi-select__trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 48px;
  padding: 10px 14px;
  border: 1px solid rgba(20, 20, 22, 0.08);
  border-radius: 16px;
  background: var(--app-surface);
  color: var(--app-text);
  text-align: left;
  transition: border-color 0.18s ease, transform 0.16s ease, box-shadow 0.18s ease;
}

.multi-select__trigger:active {
  transform: scale(0.98);
}

.multi-select--open .multi-select__trigger,
.multi-select__trigger:focus-visible {
  border-color: rgba(20, 20, 22, 0.16);
  box-shadow: 0 0 0 3px rgba(20, 20, 22, 0.04);
  outline: none;
}

.multi-select__content {
  display: flex;
  flex: 1;
  min-width: 0;
}

.multi-select__placeholder {
  color: var(--app-placeholder);
  font-size: 16px;
}

.multi-select__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.multi-select__chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(20, 20, 22, 0.08);
  color: var(--app-text);
  font-size: 13px;
  font-weight: 500;
  line-height: 1.2;
}

.multi-select__chip-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 50%;
  background: rgba(20, 20, 22, 0.12);
  color: var(--app-text-secondary);
  font-size: 12px;
  line-height: 1;
}

.multi-select__arrow {
  width: 18px;
  height: 18px;
  margin-left: 10px;
  flex-shrink: 0;
  stroke: #8e8e93;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform 0.18s ease;
}

.multi-select--open .multi-select__arrow {
  transform: rotate(180deg);
}

.multi-select__panel {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  z-index: 40;
  width: 100%;
  max-height: 240px;
  overflow-y: auto;
  padding: 8px;
  border: 1px solid rgba(20, 20, 22, 0.05);
  border-radius: 18px;
  background: var(--app-surface);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.08);
}

.multi-select__option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 44px;
  padding: 0 12px;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: #141416;
  font-size: 15px;
  text-align: left;
  transition: background 0.16s ease, color 0.16s ease;
}

.multi-select__option:active {
  background: #f5f5f7;
}

.multi-select__option--active {
  background: rgba(20, 20, 22, 0.06);
  font-weight: 600;
}

.multi-select__check {
  width: 16px;
  height: 16px;
  margin-left: 10px;
  flex-shrink: 0;
  stroke: #141416;
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.multi-select__empty {
  padding: 14px 12px;
  color: #8e8e93;
  font-size: 14px;
  text-align: center;
}

.batch-edit-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 16px;
}

.picker-popup {
  overflow: hidden;
}

:deep(.picker-popup .van-picker) {
  --van-picker-background: var(--app-surface);
  --van-picker-toolbar-height: 52px;
  --van-picker-option-font-size: 17px;
  --van-picker-title-font-size: 16px;
  --van-picker-confirm-action-color: var(--app-text);
  --van-picker-cancel-action-color: #8e8e93;
}

:deep(.picker-popup .van-picker__toolbar) {
  padding: 0 8px;
}

:deep(.picker-popup .van-picker__title) {
  font-weight: 600;
}

:deep(.picker-popup .van-picker-column__item) {
  color: var(--app-text-secondary);
}

:deep(.picker-popup .van-picker-column__item--selected) {
  color: var(--app-text);
}

:deep(.picker-popup .van-picker-column) {
  touch-action: pan-y;
}

/* -------- 批量删除确认弹窗（对齐 DetailView 风格）------- */
.confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--app-overlay);
  backdrop-filter: blur(18px) saturate(125%);
  -webkit-backdrop-filter: blur(18px) saturate(125%);
}

.confirm-card {
  width: min(100%, 360px);
  padding: 22px;
  border-radius: 24px;
  background: var(--app-surface);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.12);
}

.confirm-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 14px;
  background: rgba(199, 68, 68, 0.1);
  color: #c74444;
}

.confirm-icon svg {
  width: 20px;
  height: 20px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.confirm-title {
  margin-top: 16px;
  color: var(--app-text);
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.03em;
}

.confirm-desc {
  margin-top: 8px;
  color: var(--app-text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.confirm-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 20px;
}

.confirm-btn {
  height: 48px;
  border: none;
  border-radius: 16px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.16s ease, opacity 0.16s ease, background 0.16s ease;
}

.confirm-btn:active {
  transform: scale(0.96);
}

.confirm-btn:disabled {
  opacity: 0.4;
  pointer-events: none;
}

.confirm-btn--ghost {
  background: var(--app-surface-soft);
  color: var(--app-text);
}

.confirm-btn--danger {
  background: #141416;
  color: #ffffff;
}

.confirm-modal-enter-active,
.confirm-modal-leave-active {
  transition: opacity 180ms ease;
}

.confirm-modal-enter-from,
.confirm-modal-leave-to {
  opacity: 0;
}

/* ── 深色模式覆盖 ── */
@media (prefers-color-scheme: dark) {
  /* 日期选择器深色适配 */
  :deep(.picker-popup .van-picker) {
    --van-picker-mask-color:
      linear-gradient(180deg, rgba(24, 24, 28, 0.92), rgba(24, 24, 28, 0)),
      linear-gradient(0deg, rgba(24, 24, 28, 0.92), rgba(24, 24, 28, 0));
  }

  :deep(.picker-popup.van-popup),
  :deep(.picker-popup.van-popup--bottom) {
    background: rgba(24, 24, 28, 0.94);
    border: 1px solid rgba(255, 255, 255, 0.06);
    box-shadow: 0 24px 56px rgba(0, 0, 0, 0.42);
    backdrop-filter: blur(24px) saturate(150%);
    -webkit-backdrop-filter: blur(24px) saturate(150%);
  }

  /* 主页搜索按钮 */
  .hero-search {
    background: var(--app-glass);
  }

  /* 数量 pill */
  .section-count {
    background: var(--app-glass);
  }

  /* 激活态按钮（密度 / 排序 / 时间线）深色下反色 */
  .density-switch__option--active,
  .sort-toggle--asc,
  .timeline-toggle--active {
    background: #f5f5f7;
    color: #141416;
  }

  /* 月份 pill 件数 */
  .tl-month-count {
    color: var(--app-text-secondary);
  }

  /* 月份金额：深色模式更亮蓝 */
  .tl-month-line {
    background: color-mix(in srgb, var(--app-text-secondary) 18%, transparent);
  }

  .tl-month-spend {
    color: color-mix(in srgb, var(--app-text) 80%, var(--app-text-secondary));
  }

  .tl-thumb-img-wrap {
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.24);
    border-color: rgba(255, 255, 255, 0.08);
  }

  .tl-thumb-btn--active .tl-thumb-img-wrap {
    outline: 2px solid rgba(245, 245, 247, 0.80);
    outline-offset: 3px;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.44), 0 3px 8px rgba(0, 0, 0, 0.24);
  }

  /* FAB 新增按钮 */
  .fab {
    background: #f5f5f5;
    color: #141416;
  }

  /* ---- 多选顶部栏 ---- */
  .selection-header {
    background: var(--app-glass-strong);
    border-color: var(--app-glass-border);
    box-shadow: 0 14px 34px rgba(0, 0, 0, 0.34);
  }

  .sel-back-btn {
    background: var(--app-glass);
    border-color: var(--app-glass-border);
  }

  .sel-all-btn {
    background: rgba(255, 255, 255, 0.07);
    color: var(--app-text-secondary);
  }

  /* ---- 多选底部操作栏 ---- */
  .selection-action-bar {
    background: var(--app-glass-strong);
    border-top-color: var(--app-glass-border);
    box-shadow: 0 -1px 0 rgba(255, 255, 255, 0.06), 0 -14px 34px rgba(0, 0, 0, 0.34);
  }

  .sel-action-btn {
    background: rgba(255, 255, 255, 0.07);
    color: var(--app-text-secondary);
  }

  /* ---- 批量编辑抽屉 ---- */
  .batch-edit-sheet {
    background:
      radial-gradient(circle at top, rgba(255, 255, 255, 0.08), transparent 36%),
      rgba(20, 20, 22, 0.78);
  }

  .batch-edit-sheet__handle {
    background: rgba(255, 255, 255, 0.12);
  }

  .batch-edit-card {
    background: var(--app-surface);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  }

  .field {
    background: var(--app-surface-soft);
  }

  .date-field,
  .multi-select__trigger {
    background: var(--app-surface);
    border-color: rgba(255, 255, 255, 0.07);
    color: var(--app-text);
  }

  .multi-select__panel {
    background: var(--app-surface);
    border-color: rgba(255, 255, 255, 0.05);
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.3);
  }

  .multi-select__option {
    color: var(--app-text);
  }

  .multi-select__option:active {
    background: rgba(255, 255, 255, 0.06);
  }

  .multi-select__option--active {
    background: rgba(255, 255, 255, 0.07);
  }

  .multi-select__chip {
    background: rgba(255, 255, 255, 0.10);
  }

  .multi-select__chip-remove {
    background: rgba(255, 255, 255, 0.10);
  }

  /* ---- 批量删除确认弹窗 ---- */
  .confirm-overlay {
    background: rgba(0, 0, 0, 0.34);
  }

  .confirm-card {
    background: rgba(24, 24, 28, 0.8);
    border: 1px solid var(--app-glass-border);
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.4);
  }

  .confirm-btn--ghost {
    background: var(--app-surface-soft);
    color: var(--app-text);
  }

  .date-field,
  .multi-select__trigger {
    border-color: rgba(255, 255, 255, 0.07);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
  }

  .multi-select__panel {
    border-color: rgba(255, 255, 255, 0.06);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.36);
  }

  .multi-select__option {
    color: var(--app-text);
  }

  .multi-select__option:active {
    background: rgba(255, 255, 255, 0.07);
  }

  .multi-select__option--active {
    background: rgba(255, 255, 255, 0.08);
  }

  .multi-select__check {
    stroke: var(--app-text);
  }

  .confirm-btn--danger {
    background: #f5f5f7;
    color: #d32f2f;
  }
}
</style>


