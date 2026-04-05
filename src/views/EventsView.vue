<template>
  <div
    class="page events-page"
    :class="{ 'events-page--restoring': !eventsDisplayReady, 'events-page--top-jump': topJumpMasking }"
  >
    <main ref="pageBodyRef" class="page-body">
      <section v-if="!selectionMode" class="hero-section">
        <div class="hero-copy">
          <p class="hero-label">EVENTS ARCHIVE</p>
          <h1 class="hero-title">活动记录</h1>
        </div>

        <div class="hero-actions">
          <button
            class="hero-search"
            type="button"
            :aria-label="showSearch ? '关闭搜索' : '搜索活动'"
            @click="toggleSearch"
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20L16.65 16.65" />
            </svg>
          </button>
        </div>
      </section>

      <HomeSelectionHeader
        :show="selectionMode"
        :selected-count="selectedIds.size"
        :all-selected="allSelected"
        :header-style="selectionHeaderStyle"
        @back="exitSelectionMode"
        @toggle-all="toggleSelectAll"
      />

      <section class="summary-section">
        <article class="summary-card">
          <div class="summary-orb summary-orb--left" />
          <div class="summary-orb summary-orb--right" />

          <div class="summary-head">
            <p class="summary-label">EVENT OVERVIEW</p>
          </div>

          <p class="summary-value">
            <span class="summary-count">{{ eventsStore.list.length }}</span>
            <span class="summary-unit">场活动</span>
          </p>

          <div class="summary-metrics">
            <div class="metric-chip">
              <span class="metric-chip__label">票务总额</span>
              <strong>{{ formatPrice(eventsStore.totalTicketAll) }}</strong>
            </div>
            <div class="metric-chip">
              <span class="metric-chip__label">关联谷子</span>
              <strong>{{ totalLinkedGoods }}</strong>
            </div>
            <div class="metric-chip">
              <span class="metric-chip__label">活动照片</span>
              <strong>{{ totalPhotos }}</strong>
            </div>
          </div>
        </article>
      </section>

      <section v-if="eventsStore.list.length > 0" class="toolbar-section">
        <div class="toolbar-copy">
          <p class="toolbar-label">{{ searchKeyword ? '搜索结果' : '我的活动' }}</p>
          <h2 class="toolbar-title">
            {{ searchKeyword ? '匹配活动' : '全部活动' }}
            <span>{{ filteredEvents.length }} 场</span>
          </h2>
        </div>

        <div class="toolbar-actions">
          <div class="view-switch" :style="viewSwitchStyle" aria-label="活动展示方式切换">
            <span class="view-switch__indicator" aria-hidden="true" />
            <button
              v-for="option in viewOptions"
              :key="option.value"
              type="button"
              :class="['view-switch__option', { 'view-switch__option--active': viewMode === option.value }]"
              @click="setViewMode(option.value)"
            >
              {{ option.label }}
            </button>
          </div>

          <button
            type="button"
            :class="['sort-toggle', { 'sort-toggle--asc': sortDirection === 'asc' }]"
            :aria-label="sortDirection === 'asc' ? '当前按时间升序，点击切换降序' : '当前按时间降序，点击切换升序'"
            @click="toggleSortDirection"
          >
            <svg class="sort-toggle__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <g class="sort-toggle__group sort-toggle__group--up">
                <path d="M7 18V7" />
                <path d="M3.5 10.5L7 7L10.5 10.5" />
              </g>
              <g class="sort-toggle__group sort-toggle__group--down">
                <path d="M17 6V17" />
                <path d="M13.5 13.5L17 17L20.5 13.5" />
              </g>
            </svg>
          </button>
        </div>
      </section>

      <Transition name="search-drop">
        <section v-if="showSearch && !selectionMode && eventsStore.list.length > 0" class="search-section">
          <div class="search-panel">
            <SearchBar
              v-model="searchKeyword"
              placeholder="搜索活动名称、地点、标签"
              autofocus
            />
          </div>
        </section>
      </Transition>

      <section v-if="filteredEvents.length > 0 && viewMode === 'grid'" class="list-shell">
        <div class="event-grid">
          <EventCard
            v-for="event in sortedEvents"
            :key="event.id"
            :event="event"
            :selection-mode="selectionMode"
            :selected="selectedIds.has(event.id)"
            @long-press="enterSelectionMode"
            @toggle-select="toggleSelect"
            @open-detail="openDetail"
          />
        </div>
      </section>

      <section v-else-if="filteredEvents.length > 0" class="list-shell">
        <template v-for="group in groupedEvents" :key="group.yearMonth">
          <section class="month-section">
            <div class="month-head">
              <div>
                <template v-if="group.isUndated">
                  <h3 class="month-title">未设置日期</h3>
                </template>
                <template v-else>
                  <p class="month-label">{{ group.year }} 年</p>
                  <h3 class="month-title">{{ group.month }} 月</h3>
                </template>
              </div>

              <div class="month-meta">
                <span class="month-count">{{ group.count }} 场</span>
                <span v-if="group.totalTicket > 0" class="month-ticket">{{ formatPrice(group.totalTicket) }}</span>
              </div>
            </div>

            <div class="event-grid">
              <EventCard
                v-for="event in group.items"
                :key="event.id"
                :event="event"
                :selection-mode="selectionMode"
                :selected="selectedIds.has(event.id)"
                @long-press="enterSelectionMode"
                @toggle-select="toggleSelect"
                @open-detail="openDetail"
              />
            </div>
          </section>
        </template>
      </section>

      <section v-else-if="eventsStore.list.length > 0" class="empty-wrap">
        <EmptyState
          icon="⌕"
          title="没有找到匹配的活动"
          description="试试换个关键词，或者关闭搜索看看全部活动。"
        />
      </section>

      <section v-else class="empty-wrap">
        <EmptyState
          icon="✦"
          title="还没有活动记录"
          description="把展会、市集、交换会和线下活动整理进来，这里就会像收藏页一样排成完整档案。"
          action-text="添加第一场活动"
          @action="goToAdd"
        />
      </section>
    </main>

    <Teleport v-if="isEventsActive" to="body">
      <ScrollTopButton :show="showScrollTopButton && !selectionMode" @click="scrollToTop" />
      <button
        v-if="!selectionMode"
        class="fab"
        type="button"
        aria-label="添加活动"
        @click="goToAdd"
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 5V19" />
          <path d="M5 12H19" />
        </svg>
      </button>
    </Teleport>

    <GoodsDeleteConfirm
      v-model:show="showDeleteConfirm"
      :selected-count="selectedIds.size"
      @confirm="confirmDelete"
    />

    <Teleport to="body">
      <Transition name="sel-bar">
        <div v-if="selectionMode" class="event-selection-action-bar">
          <button
            class="event-selection-action-btn"
            type="button"
            :disabled="selectedIds.size === 0"
            @click="batchDelete"
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14H6L5 6" />
              <path d="M10 11v6M14 11v6" />
            </svg>
            删除{{ selectedIds.size > 0 ? ` (${selectedIds.size})` : '' }}
          </button>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import EmptyState from '@/components/common/EmptyState.vue'
import SearchBar from '@/components/common/SearchBar.vue'
import ScrollTopButton from '@/components/common/ScrollTopButton.vue'
import EventCard from '@/components/events/EventCard.vue'
import GoodsDeleteConfirm from '@/components/goods/GoodsDeleteConfirm.vue'
import HomeSelectionHeader from '@/components/home/HomeSelectionHeader.vue'
import { useGoodsSelection } from '@/composables/goods/useGoodsSelection'
import { useEventsScrollRestore } from '@/composables/scroll/useEventsScrollRestore'
import { useEventsStore } from '@/stores/events'
import { formatPrice } from '@/utils/format'

defineOptions({ name: 'EventsView' })

const EVENT_VIEW_STORAGE_KEY = 'events-view-mode-v1'
const EVENT_SORT_STORAGE_KEY = 'events-sort-direction-v1'
const SELECTION_HEADER_HEIGHT = 64
const SCROLL_TOP_ANCHOR_REASON = 'events:openDetail'
const SCROLL_TOP_BUTTON_THRESHOLD = 900

const router = useRouter()
const eventsStore = useEventsStore()
const pageBodyRef = ref(null)
const isEventsActive = ref(true)
const eventsDisplayReady = ref(false)
const showDeleteConfirm = ref(false)
const showSearch = ref(false)
const showScrollTopButton = ref(false)
const searchKeyword = ref('')
const topJumpMasking = ref(false)
const sortDirection = ref(localStorage.getItem(EVENT_SORT_STORAGE_KEY) === 'asc' ? 'asc' : 'desc')
const viewMode = ref(localStorage.getItem(EVENT_VIEW_STORAGE_KEY) === 'timeline' ? 'timeline' : 'grid')
const selectionHeaderTop = ref(0)
let pageScrollBound = false
let pageScrollRaf = 0
let elementScrollHandler = null
let windowScrollHandler = null
let topJumpMaskTimer = 0

const viewOptions = [
  { value: 'grid', label: '平铺' },
  { value: 'timeline', label: '时间线' }
]

const EVENT_TYPE_LABELS = {
  exhibition: '展会',
  concert: '音乐会',
  other: '其他'
}

const {
  getScrollEl,
  getActiveScrollSource,
  markScrollSource,
  readScrollTop,
  getStoredScrollState,
  saveScrollPosition,
  restorePendingScrollPosition,
  restoreActivatedScrollPosition,
  rememberCurrentScrollPosition,
  clearDisplayedScrollPosition,
  resetStoredScrollOnReload,
  cancelPendingRestore
} = useEventsScrollRestore(pageBodyRef)

const filteredEvents = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  if (!keyword) return eventsStore.list

  return eventsStore.list.filter((event) => {
    const haystack = [
      event.name,
      event.location,
      event.description,
      event.startDate,
      event.endDate,
      EVENT_TYPE_LABELS[event.type] || '',
      ...(Array.isArray(event.tags) ? event.tags : [])
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return haystack.includes(keyword)
  })
})

const sortedEvents = computed(() =>
  [...filteredEvents.value].sort((left, right) => {
    const leftDate = String(left?.startDate || left?.createdAt || '')
    const rightDate = String(right?.startDate || right?.createdAt || '')
    return sortDirection.value === 'asc'
      ? leftDate.localeCompare(rightDate)
      : rightDate.localeCompare(leftDate)
  })
)

const groupedEvents = computed(() => {
  const grouped = {}

  for (const event of sortedEvents.value) {
    const sourceDate = String(event?.startDate || event?.createdAt || '').slice(0, 10)
    const yearMonth = sourceDate ? sourceDate.slice(0, 7) : 'undated'
    const key = /^\d{4}-\d{2}$/.test(yearMonth) ? yearMonth : 'undated'
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(event)
  }

  const sortedKeys = Object.keys(grouped).sort((a, b) => {
    if (a === 'undated') return 1
    if (b === 'undated') return -1
    return sortDirection.value === 'asc' ? a.localeCompare(b) : b.localeCompare(a)
  })

  return sortedKeys.map((yearMonth) => {
    const isUndated = yearMonth === 'undated'
    const [year, month] = isUndated ? ['', ''] : yearMonth.split('-')
    const items = grouped[yearMonth]

    return {
      yearMonth,
      year: isUndated ? '' : year,
      month: isUndated ? '' : String(parseInt(month, 10)),
      isUndated,
      count: items.length,
      totalTicket: items.reduce((sum, item) => sum + (Number.parseFloat(item.ticketPrice) || 0), 0),
      items
    }
  })
})

const totalLinkedGoods = computed(() =>
  eventsStore.list.reduce((sum, event) => sum + (Array.isArray(event.linkedGoodsIds) ? event.linkedGoodsIds.length : 0), 0)
)

const totalPhotos = computed(() =>
  eventsStore.list.reduce((sum, event) => sum + (Array.isArray(event.photos) ? event.photos.length : 0), 0)
)

const viewSwitchStyle = computed(() => ({
  '--view-switch-count': String(viewOptions.length),
  '--view-switch-index': String(Math.max(viewOptions.findIndex((item) => item.value === viewMode.value), 0))
}))

const selectionHeaderStyle = computed(() => ({
  '--selection-header-top': `${selectionHeaderTop.value}px`
}))

function closeSelectionOverlays() {
  showDeleteConfirm.value = false
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
} = useGoodsSelection(computed(() => eventsStore.list), {
  historyKey: 'eventsSelectionMode',
  onExit: closeSelectionOverlays,
  getScrollTop: readScrollTop
})

function syncVisibleEventsCount() {}
function syncVisibleTimelineCount() {}

function setViewMode(nextMode) {
  viewMode.value = nextMode === 'timeline' ? 'timeline' : 'grid'
  localStorage.setItem(EVENT_VIEW_STORAGE_KEY, viewMode.value)
}

function toggleSortDirection() {
  sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
  localStorage.setItem(EVENT_SORT_STORAGE_KEY, sortDirection.value)
}

function toggleSearch() {
  showSearch.value = !showSearch.value
  if (!showSearch.value) searchKeyword.value = ''
}

function openDetail(id) {
  if (selectionMode.value) {
    toggleSelect(id)
    return
  }
  saveScrollPosition(true, `${SCROLL_TOP_ANCHOR_REASON}:${id}`)
  eventsDisplayReady.value = false
  router.push(`/events/${id}`).catch(() => {
    eventsDisplayReady.value = true
  })
}

function goToAdd() {
  saveScrollPosition(true, 'events:goToAdd')
  eventsDisplayReady.value = false
  router.push('/events/add').catch(() => {
    eventsDisplayReady.value = true
  })
}

function batchDelete() {
  if (selectedIds.value.size === 0) return
  showDeleteConfirm.value = true
}

async function confirmDelete() {
  showDeleteConfirm.value = false
  await eventsStore.removeMultipleEventRecords(selectedIds.value)
  exitSelectionModeQuiet()
}

function updateSelectionHeaderPosition() {
  const spacer = pageBodyRef.value?.querySelector?.('.selection-header-spacer')
  if (!spacer) {
    selectionHeaderTop.value = 0
    return
  }

  const rect = spacer.getBoundingClientRect()
  const maxTop = Math.max(0, window.innerHeight - SELECTION_HEADER_HEIGHT)
  selectionHeaderTop.value = Math.min(maxTop, Math.max(0, rect.top))
}

function handlePageScroll() {
  if (pageScrollRaf) return
  pageScrollRaf = window.requestAnimationFrame(() => {
    pageScrollRaf = 0
    rememberCurrentScrollPosition()
    if (selectionMode.value) updateSelectionHeaderPosition()
    updateScrollTopButtonVisibility()
  })
}

function updateScrollTopButtonVisibility() {
  showScrollTopButton.value = readScrollTop() >= SCROLL_TOP_BUTTON_THRESHOLD
}

function scrollToTop() {
  triggerTopJumpMask()
  const scrollEl = getScrollEl?.()
  if (scrollEl) {
    scrollEl.scrollTop = 0
  }
  try { document.documentElement.scrollTop = 0 } catch {}
  try { document.body.scrollTop = 0 } catch {}
  try { window.scrollTo(0, 0) } catch {}
  updateScrollTopButtonVisibility()
  rememberCurrentScrollPosition()
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

function bindPageScroll() {
  if (pageScrollBound) return

  elementScrollHandler = () => {
    markScrollSource('element')
    handlePageScroll()
  }
  windowScrollHandler = () => {
    markScrollSource('window')
    handlePageScroll()
  }
  getScrollEl()?.addEventListener('scroll', elementScrollHandler, { passive: true })
  window.addEventListener('scroll', windowScrollHandler, { passive: true })
  pageScrollBound = true
}

function unbindPageScroll() {
  if (!pageScrollBound) return
  if (elementScrollHandler) {
    getScrollEl()?.removeEventListener('scroll', elementScrollHandler)
    elementScrollHandler = null
  }
  if (windowScrollHandler) {
    window.removeEventListener('scroll', windowScrollHandler)
    windowScrollHandler = null
  }
  pageScrollBound = false
}

async function refresh() {
  await eventsStore.refreshList()
}

watch(selectionMode, async (active) => {
  if (!active) {
    selectionHeaderTop.value = 0
    return
  }

  showSearch.value = false
  await nextTick()
  updateSelectionHeaderPosition()
})

onMounted(async () => {
  const didResetOnReload = resetStoredScrollOnReload()
  if (didResetOnReload) {
    clearDisplayedScrollPosition()
  }

  if (!eventsStore.isReady) {
    await eventsStore.init()
  }

  eventsDisplayReady.value = false
  await refresh()
  await nextTick()
  bindPageScroll()
  await restorePendingScrollPosition(syncVisibleEventsCount, syncVisibleTimelineCount)
  await nextTick()
  eventsDisplayReady.value = true
  updateScrollTopButtonVisibility()
  window.addEventListener('popstate', handleSelectionPopState)
})

onActivated(async () => {
  isEventsActive.value = true
  eventsDisplayReady.value = false
  await refresh()
  await restoreActivatedScrollPosition(syncVisibleEventsCount, syncVisibleTimelineCount)
  await nextTick()
  eventsDisplayReady.value = true
  bindPageScroll()
  updateScrollTopButtonVisibility()
})

onDeactivated(() => {
  isEventsActive.value = false
  cancelPendingRestore()
  rememberCurrentScrollPosition()
  if (readScrollTop() > 1) {
    eventsDisplayReady.value = false
  }
  exitSelectionModeQuiet()
  unbindPageScroll()
})

onBeforeUnmount(() => {
  if (topJumpMaskTimer) {
    window.clearTimeout(topJumpMaskTimer)
    topJumpMaskTimer = 0
  }
  cancelPendingRestore()
  if (pageScrollRaf) {
    window.cancelAnimationFrame(pageScrollRaf)
    pageScrollRaf = 0
  }
  unbindPageScroll()
  window.removeEventListener('popstate', handleSelectionPopState)
  rememberCurrentScrollPosition()
  exitSelectionModeQuiet()
})

onBeforeRouteLeave(async () => {
  saveScrollPosition(true, 'events:onBeforeRouteLeave')
  eventsDisplayReady.value = false
  await nextTick()
})
</script>

<style scoped>
.events-page {
  position: relative;
  background: var(--app-bg-gradient);
}

.events-page--top-jump .page-body {
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

.events-page--restoring {
  visibility: hidden;
}

.page-body {
  width: min(100%, 2048px);
  margin: 0 auto;
  padding: calc(env(safe-area-inset-top) + 20px) var(--page-padding) 120px;
}

.hero-section,
.summary-section,
.toolbar-section,
.search-section,
.list-shell,
.empty-wrap {
  margin-top: var(--section-gap);
}

.hero-section {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-top: 0;
}

.hero-copy {
  max-width: 320px;
}

.hero-label,
.toolbar-label,
.month-label {
  color: var(--app-text-tertiary);
  font-size: 13px;
  letter-spacing: 0.08em;
}

.hero-label {
  text-transform: uppercase;
}

.hero-title,
.month-title {
  margin-top: 4px;
  color: var(--app-text);
  font-weight: 700;
  letter-spacing: -0.04em;
}

.hero-title {
  font-size: 28px;
}

.month-title {
  font-size: 28px;
}

.hero-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.hero-search {
  width: var(--icon-button-size);
  height: var(--icon-button-size);
  border: none;
  border-radius: 50%;
  background: var(--app-glass);
  box-shadow: var(--app-shadow);
  color: var(--app-text);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.16s ease;
}

.hero-search:active,
.sort-toggle:active,
.view-switch__option:active {
  transform: scale(0.96);
}

.hero-search svg,
.sort-toggle__icon,
.fab svg,
.event-selection-action-btn svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.summary-card {
  position: relative;
  overflow: hidden;
  min-height: 164px;
  padding: 24px;
  border-radius: var(--radius-large);
  color: var(--summary-card-text);
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--summary-card-text) 14%, transparent), transparent 26%),
    radial-gradient(circle at bottom right, color-mix(in srgb, var(--summary-card-text) 9%, transparent), transparent 22%),
    var(--summary-card-gradient);
  box-shadow: var(--app-shadow);
}

.summary-orb {
  position: absolute;
  border-radius: 50%;
  background: var(--summary-card-orb);
  pointer-events: none;
  filter: blur(2px);
}

.summary-orb--left {
  top: -38px;
  left: -20px;
  width: 136px;
  height: 136px;
}

.summary-orb--right {
  right: -42px;
  bottom: -46px;
  width: 160px;
  height: 160px;
}

.summary-head,
.summary-value,
.summary-metrics {
  position: relative;
  z-index: 1;
}

.summary-head {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 32px;
}

.summary-label {
  color: var(--summary-card-label);
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.summary-value {
  margin: 16px 0 0;
  font-size: 0;
}

.summary-count {
  font-size: 56px;
  font-weight: 700;
  letter-spacing: -0.06em;
}

.summary-unit {
  margin-left: 8px;
  font-size: 18px;
  font-weight: 600;
  color: color-mix(in srgb, var(--summary-card-text) 76%, transparent);
}

.summary-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 18px;
}

.metric-chip {
  padding: 14px 16px;
  border-radius: 20px;
  background: color-mix(in srgb, var(--summary-card-text) 8%, transparent);
}

.metric-chip__label {
  display: block;
  color: color-mix(in srgb, var(--summary-card-text) 62%, transparent);
  font-size: 12px;
}

.metric-chip strong {
  display: block;
  margin-top: 6px;
  color: var(--summary-card-text);
  font-size: 18px;
  font-weight: 700;
}

.toolbar-section {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
}

.toolbar-copy {
  flex: 1;
  min-width: 0;
}

.toolbar-actions {
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  gap: 8px;
  flex-shrink: 0;
}

.toolbar-title {
  margin-top: 4px;
  color: var(--app-text);
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.04em;
}

.toolbar-title span {
  color: var(--app-text-tertiary);
  font-size: 17px;
  font-weight: 400;
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
  transition:
    transform var(--home-motion-density-duration) var(--home-motion-ease-standard),
    background var(--home-motion-density-duration) var(--home-motion-ease-standard),
    color var(--home-motion-density-duration) var(--home-motion-ease-standard);
}

.sort-toggle__group {
  transition: opacity 180ms ease, color 180ms ease;
}

.sort-toggle__group path {
  stroke: currentColor;
  transition: stroke-width 180ms ease;
}

.sort-toggle__group--up {
  color: #b7bcc5;
}

.sort-toggle__group--down {
  color: #5f6570;
}

.sort-toggle__group--up path {
  stroke-width: 2.15;
}

.sort-toggle__group--down path {
  stroke-width: 2.65;
}

.sort-toggle--asc .sort-toggle__group--up {
  color: #141416;
}

.sort-toggle--asc .sort-toggle__group--down {
  color: #b7bcc5;
}

.sort-toggle--asc .sort-toggle__group--up path {
  stroke-width: 2.65;
}

.sort-toggle--asc .sort-toggle__group--down path {
  stroke-width: 2.15;
}

.view-switch {
  position: relative;
  display: grid;
  grid-template-columns: repeat(var(--view-switch-count, 2), minmax(0, 1fr));
  gap: 6px;
  padding: 6px;
  border-radius: 18px;
  background: var(--app-glass);
  box-shadow: var(--app-shadow);
}

.view-switch__indicator {
  position: absolute;
  top: 6px;
  left: 6px;
  height: 36px;
  width: calc((100% - 12px - (6px * (var(--view-switch-count, 2) - 1))) / var(--view-switch-count, 2));
  border-radius: 14px;
  background: #141416;
  transform: translateX(calc((100% + 6px) * var(--view-switch-index, 0)));
  transition: transform calc(var(--home-motion-density-duration) + 80ms) var(--home-motion-ease-emphasis);
  box-shadow: 0 6px 14px rgba(20, 20, 22, 0.12);
}

.view-switch__option {
  position: relative;
  z-index: 1;
  min-width: 0;
  height: 36px;
  padding: 0 12px;
  border: none;
  border-radius: 14px;
  background: transparent;
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 600;
  transition:
    transform var(--home-motion-density-duration) var(--home-motion-ease-standard),
    color var(--home-motion-density-duration) var(--home-motion-ease-standard);
}

.view-switch__option--active {
  color: #ffffff;
}

.search-panel {
  padding: 10px;
  border-radius: 24px;
  background: color-mix(in srgb, var(--app-glass-strong) 85%, transparent);
  border: 1px solid var(--app-glass-border);
  backdrop-filter: blur(18px) saturate(135%);
  -webkit-backdrop-filter: blur(18px) saturate(135%);
  box-shadow: var(--app-shadow);
}

.search-drop-enter-active,
.search-drop-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}

.search-drop-enter-from,
.search-drop-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.list-shell {
  display: grid;
  gap: 28px;
}

.month-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.month-meta {
  display: flex;
  align-items: center;
  gap: 10px;
}

.month-count {
  color: var(--app-text-secondary);
  font-size: 15px;
  font-weight: 600;
}

.month-ticket {
  padding: 8px 12px;
  border-radius: 999px;
  background: var(--app-surface);
  color: var(--app-text);
  font-size: 13px;
  font-weight: 700;
  box-shadow: var(--app-shadow);
}

.event-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 14px;
}

.fab {
  position: fixed;
  right: 16px;
  bottom: calc(var(--tabbar-height) + env(safe-area-inset-bottom));
  width: var(--fab-size);
  height: var(--fab-size);
  border: none;
  border-radius: 50%;
  background: var(--app-text);
  color: var(--app-surface);
  box-shadow: var(--app-shadow);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 65;
  transition: transform 0.16s ease, box-shadow 0.16s ease;
}

.fab:active {
  transform: scale(0.96);
}

.fab svg {
  width: 22px;
  height: 22px;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
}

.event-selection-action-bar {
  position: fixed;
  left: 50%;
  bottom: max(12px, env(safe-area-inset-bottom));
  width: min(calc(100vw - 24px), 320px);
  padding: 10px;
  border-radius: 22px;
  background: var(--app-glass-strong);
  border: 1px solid var(--app-glass-border);
  backdrop-filter: blur(24px) saturate(145%);
  -webkit-backdrop-filter: blur(24px) saturate(145%);
  box-shadow: var(--app-shadow);
  transform: translateX(-50%);
  z-index: 80;
}

.event-selection-action-btn {
  width: 100%;
  height: 50px;
  border: none;
  border-radius: 14px;
  background: color-mix(in srgb, var(--app-glass) 72%, var(--app-surface));
  color: var(--app-text);
  font-size: 15px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.event-selection-action-btn:disabled {
  opacity: 0.38;
  pointer-events: none;
}

.sel-bar-enter-active,
.sel-bar-leave-active {
  transition: transform 0.24s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.2s ease;
}

.sel-bar-enter-from,
.sel-bar-leave-to {
  transform: translate(-50%, 100%);
  opacity: 0;
}

@media (max-width: 1200px) {
  .event-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (max-width: 899px) {
  .summary-metrics {
    grid-template-columns: 1fr;
  }

  .event-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
}

@media (max-width: 720px) {
  .month-head {
    flex-direction: column;
    align-items: stretch;
  }

  .month-meta {
    justify-content: space-between;
  }

  .toolbar-section {
    align-items: flex-end;
    gap: 10px;
  }

  .toolbar-actions {
    width: auto;
    flex: 0 0 auto;
    justify-content: flex-end;
    gap: 6px;
  }

  .view-switch {
    flex: 0 0 auto;
    width: 180px;
    min-width: 180px;
    padding: 5px;
    gap: 4px;
    border-radius: 16px;
  }

  .sort-toggle {
    flex: 0 0 auto;
    width: 44px;
    height: 44px;
    border-radius: 16px;
  }

  .view-switch__indicator {
    top: 5px;
    left: 5px;
    height: 34px;
    width: calc((100% - 10px - (4px * (var(--view-switch-count, 2) - 1))) / var(--view-switch-count, 2));
    transform: translateX(calc((100% + 4px) * var(--view-switch-index, 0)));
  }

  .view-switch__option {
    height: 34px;
    padding: 0 10px;
    font-size: 12px;
    border-radius: 12px;
  }

  .toolbar-title {
    font-size: 20px;
  }

  .toolbar-title span {
    font-size: 15px;
  }

  .summary-card {
    min-height: 0;
    padding: 20px 18px;
  }

  .summary-count {
    font-size: 46px;
  }

  .summary-unit {
    font-size: 16px;
  }

  .month-title {
    font-size: 24px;
  }

  .event-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .fab {
    right: 16px;
    bottom: calc(var(--tabbar-height) + env(safe-area-inset-bottom));
    width: var(--fab-size, 56px);
    height: var(--fab-size, 56px);
  }
}

@media (prefers-color-scheme: dark) {
  .view-switch__indicator {
    background: #f5f5f7;
  }

  .view-switch__option--active {
    color: #141416;
  }

  .sort-toggle__group--up {
    color: #70757f;
  }

  .sort-toggle__group--down {
    color: #f5f5f7;
  }

  .sort-toggle--asc .sort-toggle__group--up {
    color: #f5f5f7;
  }

  .sort-toggle--asc .sort-toggle__group--down {
    color: #70757f;
  }
}
</style>

