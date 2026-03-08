<template>
  <div class="page home-page">
    <main ref="pageBodyRef" class="page-body">
      <section class="hero-section">
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

      <section class="summary-section">
        <SummaryCard :total-value="totalValue" :total-count="goodsList.length" />
      </section>

      <section class="goods-header-section">
        <div class="goods-header-row">
          <div>
            <p class="section-label">我的收藏</p>
            <h2 class="section-title">全部谷子<span class="goods-count"> {{ goodsList.length }} 件</span></h2>
          </div>
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
      </section>

      <section v-if="goodsList.length > 0" class="goods-section">
        <div class="goods-list" :style="goodsGridStyle">
          <GoodsCard
            v-for="item in goodsList"
            :key="item.id"
            :item="item"
            :density="displayDensity"
            @click="openDetail(item.id)"
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
      <button class="fab" type="button" aria-label="添加" @click="showAddSheet = true">
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
    />
  </div>
</template>

<script setup>
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useGoodsStore } from '@/stores/goods'
import { preloadImages } from '@/utils/imageCache'
import SummaryCard from '@/components/SummaryCard.vue'
import GoodsCard from '@/components/GoodsCard.vue'
import EmptyState from '@/components/EmptyState.vue'
import AddMethodSheet from '@/components/AddMethodSheet.vue'

defineOptions({ name: 'HomeView' })

const store = useGoodsStore()
const pageBodyRef = ref(null)
const DENSITY_STORAGE_KEY = 'goods-app:home-density'
const densityModes = [
  { value: 'comfortable', label: '舒适', columns: 2 },
  { value: 'standard', label: '标准', columns: 3 },
  { value: 'compact', label: '紧凑', columns: 4 }
]
const densityColumnsMap = Object.fromEntries(densityModes.map((mode) => [mode.value, mode.columns]))

const displayDensity = ref('comfortable')

// 模块级变量，KeepAlive 激活期间稳定保存滚动位置
let _savedScrollTop = 0

// 添加方式面板
const showAddSheet = ref(false)
const router = useRouter()
function handleImport() {
  showAddSheet.value = false
  saveScrollPosition()
  router.push('/import')
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

// 同时读 page-body.scrollTop 和 window.scrollY，取非零的那个
function readScrollTop() {
  const elTop = getScrollEl()?.scrollTop ?? 0
  const winTop = window.scrollY || document.documentElement.scrollTop || 0
  return elTop > 0 ? elTop : winTop
}

function saveScrollPosition() {
  const top = readScrollTop()
  _savedScrollTop = top
  sessionStorage.setItem('home-scroll', String(top))
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

onMounted(async () => {
  restoreDisplayDensity()
  await refresh()
  await nextTick()
  const stored = _savedScrollTop || Number(sessionStorage.getItem('home-scroll') || 0)
  applyScrollPosition(stored)
})

onActivated(async () => {
  // KeepAlive 保留了 DOM，先读取当前真实滚动位置（KeepAlive 会保留 DOM 状态）
  const domTop = getScrollEl()?.scrollTop ?? 0
  const topToRestore = domTop > 0
    ? domTop
    : (_savedScrollTop || Number(sessionStorage.getItem('home-scroll') || 0))
  await refresh()
  await nextTick()
  applyScrollPosition(topToRestore)
})

onDeactivated(() => {
  // 不在此处调用 saveScrollPosition：onDeactivated 触发时 window.scrollY 可能已被路由重置为 0
  // 滚动位置已由 openDetail / handleImport / goToAdd 在跳转前显式保存
})

onBeforeUnmount(() => {
  // 仅在值大于 0 时才覆盖，避免卸载时 DOM 已清空导致用 0 覆盖正确值
  const top = readScrollTop()
  if (top > 0) {
    _savedScrollTop = top
    sessionStorage.setItem('home-scroll', String(top))
  }
})

watch(displayDensity, (value) => {
  localStorage.setItem(DENSITY_STORAGE_KEY, value)
})

const goodsList = computed(() => store.list)
const totalValue = computed(() =>
  goodsList.value.reduce((sum, g) => sum + (Number(g.price) || 0), 0).toFixed(2)
)
const goodsGridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${densityColumnsMap[displayDensity.value] || 2}, minmax(0, 1fr))`
}))

function setDisplayDensity(mode) {
  if (densityColumnsMap[mode]) {
    displayDensity.value = mode
  }
}

function restoreDisplayDensity() {
  const storedDensity = localStorage.getItem(DENSITY_STORAGE_KEY)
  if (storedDensity && densityColumnsMap[storedDensity]) {
    displayDensity.value = storedDensity
  }
}

function openDetail(id) {
  saveScrollPosition()
  router.push(`/detail/${id}`)
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
  margin-top: 14px;
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

.goods-list {
  display: grid;
  gap: var(--card-gap);
  align-items: start;
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
</style>
