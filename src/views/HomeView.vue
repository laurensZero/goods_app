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
          <div>
            <p class="section-label">我的收藏</p>
            <h2 class="section-title">全部谷子<span class="goods-count"> {{ totalQuantity }} 件</span></h2>
          </div>
          <div class="goods-header-actions">
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
            <div class="density-switch" aria-label="展示密度切换">
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
        </div>
      </section>

      <section v-if="goodsList.length > 0" class="goods-section">
        <div
          :class="['goods-list', { 'goods-list--density-animating': isDensityAnimating }]"
          :style="goodsGridStyle"
        >
          <GoodsCard
            v-for="item in goodsList"
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

      <section v-else class="empty-wrap">
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
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { useRouter } from 'vue-router'
import { useGoodsStore } from '@/stores/goods'
import { preloadImages } from '@/utils/imageCache'
import { useGoodsSelection } from '@/composables/useGoodsSelection'
import SummaryCard from '@/components/SummaryCard.vue'
import GoodsCard from '@/components/GoodsCard.vue'
import EmptyState from '@/components/EmptyState.vue'
import AddMethodSheet from '@/components/AddMethodSheet.vue'
import GoodsBatchEditSheet from '@/components/GoodsBatchEditSheet.vue'
import GoodsSelectionActionBar from '@/components/GoodsSelectionActionBar.vue'
import GoodsDeleteConfirm from '@/components/GoodsDeleteConfirm.vue'

defineOptions({ name: 'HomeView' })

const store = useGoodsStore()
const pageBodyRef = ref(null)
const batchEditSheetRef = ref(null)
const DENSITY_STORAGE_KEY = 'goods-app:home-density'
const HOME_SCROLL_STORAGE_KEY = 'home-scroll'
const HOME_SCROLL_RESTORE_PENDING_KEY = 'home-scroll-restore-pending'
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
const selectionHeaderTopOffset = ref(SELECTION_HEADER_INITIAL_OFFSET)
const minDate = new Date(2000, 0, 1)
const maxDate = new Date(2100, 11, 31)
let densityAnimationTimer = 0
let nativeBackButtonHandle = null
let selectionHeaderScrollBound = false

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
  const urls = store.list.map((g) => g.image).filter(Boolean)
  if (urls.length) preloadImages(urls)
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
  const delays = [0, 50, 100, 200]
  delays.forEach(delay => setTimeout(setAll, delay))
}

function bindSelectionHeaderScroll() {
  if (selectionHeaderScrollBound) return
  getScrollEl()?.addEventListener('scroll', updateSelectionHeaderOffset, { passive: true })
  window.addEventListener('scroll', updateSelectionHeaderOffset, { passive: true })
  selectionHeaderScrollBound = true
}

function unbindSelectionHeaderScroll() {
  if (!selectionHeaderScrollBound) return
  getScrollEl()?.removeEventListener('scroll', updateSelectionHeaderOffset)
  window.removeEventListener('scroll', updateSelectionHeaderOffset)
  selectionHeaderScrollBound = false
}

onMounted(async () => {
  restoreDisplayDensity()
  window.addEventListener('resize', _onResize, { passive: true })
  await refresh()
  await nextTick()
  bindSelectionHeaderScroll()
  updateSelectionHeaderOffset()
  const shouldRestore = sessionStorage.getItem(HOME_SCROLL_RESTORE_PENDING_KEY) === '1'
  const stored = _savedScrollTop || Number(sessionStorage.getItem(HOME_SCROLL_STORAGE_KEY) || 0)
  if (shouldRestore) {
    applyScrollPosition(stored)
    sessionStorage.removeItem(HOME_SCROLL_RESTORE_PENDING_KEY)
  }
  window.addEventListener('popstate', handleSelectionPopState)
  await bindNativeBackButton()
})

onActivated(async () => {
  isHomeActive.value = true
  // KeepAlive 保留了 DOM，先读取当前真实滚动位置（KeepAlive 会保留 DOM 状态）
  const domTop = getScrollEl()?.scrollTop ?? 0
  const shouldRestore = sessionStorage.getItem(HOME_SCROLL_RESTORE_PENDING_KEY) === '1'
  const topToRestore = domTop > 0
    ? domTop
    : shouldRestore
      ? (_savedScrollTop || Number(sessionStorage.getItem(HOME_SCROLL_STORAGE_KEY) || 0))
      : 0
  await refresh()
  await nextTick()
  bindSelectionHeaderScroll()
  applyScrollPosition(topToRestore)
  updateSelectionHeaderOffset()
  if (shouldRestore) {
    sessionStorage.removeItem(HOME_SCROLL_RESTORE_PENDING_KEY)
  }
  await bindNativeBackButton()
})

onDeactivated(() => {
  isHomeActive.value = false
  // 不在此处调用 saveScrollPosition：onDeactivated 触发时 window.scrollY 可能已被路由重置为 0
  // 滚动位置已由 openDetail / handleImport / goToAdd 在跳转前显式保存
  exitSelectionModeQuiet()
  unbindSelectionHeaderScroll()
  void unbindNativeBackButton()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', _onResize)
  if (densityAnimationTimer) {
    window.clearTimeout(densityAnimationTimer)
    densityAnimationTimer = 0
  }
  unbindSelectionHeaderScroll()
  window.removeEventListener('popstate', handleSelectionPopState)
  void unbindNativeBackButton()
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
const totalValue = computed(() =>
  goodsList.value.reduce((sum, g) => sum + (Number(g.price) || 0) * (Number(g.quantity) || 1), 0).toFixed(2)
)
const totalQuantity = computed(() =>
  goodsList.value.reduce((sum, g) => sum + (Number(g.quantity) || 1), 0)
)
const goodsGridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${getResponsiveCols(displayDensity.value)}, minmax(0, 1fr))`
}))
const selectionHeaderStyle = computed(() => ({
  '--selection-header-offset': `${selectionHeaderTopOffset.value}px`
}))

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
  const scrolled = Math.min(readScrollTop(), SELECTION_HEADER_INITIAL_OFFSET)
  selectionHeaderTopOffset.value = Math.max(0, SELECTION_HEADER_INITIAL_OFFSET - scrolled)
}

function openDetail(id) {
  saveScrollPosition()
  router.push(`/detail/${id}`)
}

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
  onExit: closeSelectionOverlays
})

async function bindNativeBackButton() {
  if (!Capacitor.isNativePlatform() || nativeBackButtonHandle) return

  nativeBackButtonHandle = await App.addListener('backButton', ({ canGoBack }) => {
    if (batchEditSheetRef.value?.consumeBack()) {
      return
    }

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
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.goods-header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
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

.density-switch {
  display: inline-grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  padding: 6px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.86);
  box-shadow: var(--app-shadow);
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

.sort-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border: none;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.86);
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
  background: rgba(245, 245, 247, 0.76);
  box-shadow: 0 10px 26px rgba(20, 20, 22, 0.08);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
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
  background: rgba(0, 0, 0, 0.05);
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
  background: #f2f2f2;
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
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  box-shadow: 0 -1px 0 rgba(0, 0, 0, 0.08), 0 -8px 24px rgba(0, 0, 0, 0.06);
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
  background: #f2f2f7;
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
    radial-gradient(circle at top, rgba(20, 20, 22, 0.05), transparent 42%),
    #f5f5f7;
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
  background: #ffffff;
  box-shadow: var(--app-shadow);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border-radius: var(--radius-small);
  background: #f4f4f6;
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
  background: #ffffff;
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
  background: #ffffff;
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
  background: #ffffff;
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
  --van-picker-background: #ffffff;
  --van-picker-toolbar-height: 52px;
  --van-picker-option-font-size: 17px;
  --van-picker-title-font-size: 16px;
  --van-picker-confirm-action-color: #141416;
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

/* -------- 批量删除确认弹窗（对齐 DetailView 风格）------- */
.confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(20, 20, 22, 0.22);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.confirm-card {
  width: min(100%, 360px);
  padding: 22px;
  border-radius: 24px;
  background: #ffffff;
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
  background: #f4f4f6;
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
</style>


