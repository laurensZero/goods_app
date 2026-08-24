<template>
  <div
    class="page events-page"
    :class="{ 'events-page--restoring': !eventsDisplayReady, 'events-page--top-jump': topJumpMasking }"
    :style="HOME_MOTION_CSS_VARS"
  >
    <main ref="pageBodyRef" class="page-body">
      <section v-if="!selectionMode" class="hero-section">
        <div class="hero-copy">
          <p class="hero-label">EVENTS ARCHIVE</p>
          <h1 class="hero-title">{{ t('events.title') }}</h1>
        </div>

        <div class="hero-actions">
          <button
            class="hero-search"
            type="button"
            :aria-label="t('events.map.openMap')"
            @click="goToMap"
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" />
              <path d="M9 4v14M15 6v14" />
            </svg>
          </button>

          <button
            class="hero-search"
            type="button"
            :aria-label="showSearch ? t('events.closeSearch') : t('events.openSearch')"
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

          <div class="summary-layout">
            <div class="summary-main">
              <div class="summary-head">
                <p class="summary-label">EVENT OVERVIEW</p>
              </div>

              <p class="summary-value">
                <span class="summary-count">{{ eventsStore.activeList.length }}</span>
                <span class="summary-unit">{{ t('events.eventsUnit') }}</span>
              </p>
            </div>

            <div class="summary-metrics">
              <div class="metric-chip">
                <span class="metric-chip__label">{{ t('events.ticketTotal') }}</span>
                <strong>{{ formatPrice(eventsStore.totalTicketAll) }}</strong>
              </div>
              <div class="metric-chip">
                <span class="metric-chip__label">{{ t('events.linkedGoodsCount') }}</span>
                <strong>{{ totalLinkedGoods }}</strong>
              </div>
              <div class="metric-chip">
                <span class="metric-chip__label">{{ t('events.eventPhotos') }}</span>
                <strong>{{ totalPhotos }}</strong>
              </div>
            </div>
          </div>
        </article>
      </section>

      <section v-if="eventsStore.activeList.length > 0" class="toolbar-section">
        <div class="toolbar-copy">
          <p class="toolbar-label">{{ searchKeyword ? t('events.searchResults') : t('events.myEvents') }}</p>
          <h2 class="toolbar-title">
            {{ searchKeyword ? t('events.matchingEvents') : t('events.allEvents') }}
            <span>{{ filteredEvents.length }} {{ t('common.events_count') }}</span>
          </h2>
        </div>

        <div class="toolbar-actions">
          <button
            type="button"
            :class="['mode-toggle', { 'mode-toggle--active': viewMode === 'timeline', 'mode-toggle--animating': toggleAnimating.timeline }]"
            :aria-label="t('events.timelineView')"
            @click="handleToggleTimeline"
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="8" />
              <g class="clock-hand">
                <path d="M12 8v4l2.5 2.5" />
              </g>
            </svg>
          </button>

          <button
            type="button"
            :class="['mode-toggle', { 'mode-toggle--active': viewMode === 'countdown', 'mode-toggle--animating': toggleAnimating.countdown }]"
            :aria-label="t('events.countdown.toggleAria')"
            @click="handleToggleCountdown"
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M8 2v4" />
              <path d="M16 2v4" />
              <rect x="3" y="4" width="18" height="18" rx="3" />
              <path d="M3 10h18" />
              <rect class="cal-mark" x="9.5" y="13.5" width="5" height="5" rx="1.4" />
            </svg>
          </button>

          <button
            type="button"
            :class="['sort-toggle', { 'sort-toggle--asc': sortDirection === 'asc' }]"
            :aria-label="sortDirection === 'asc' ? t('events.sortAscAria') : t('events.sortDescAria')"
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
        <section v-if="showSearch && eventsStore.activeList.length > 0" class="search-section">
          <div class="search-panel">
            <SearchBar
              v-model="searchKeyword"
              :placeholder="t('events.searchPlaceholder')"
              autofocus
            />
          </div>
        </section>
      </Transition>

      <template v-if="filteredEvents.length > 0">
        <Transition name="search-drop" mode="out-in">
          <section v-if="viewMode === 'countdown'" key="countdown" class="list-shell">
            <div class="cd-grid">
              <EventCountdownCard
                v-for="entry in countdownEntries"
                :key="entry.event.id"
                :event="entry.event"
                :status="entry.status"
                :days="entry.days"
                :ends-in-days="entry.endsInDays"
                :selection-mode="selectionMode"
                :selected="selectedIds.has(entry.event.id)"
                @long-press="enterSelectionMode"
                @toggle-select="toggleSelect"
                @open-detail="openDetail"
              />
            </div>
          </section>

          <section v-else :key="viewMode" class="list-shell">
            <template v-if="viewMode === 'grid'">
              <div class="event-grid">
                <EventCard
                  v-for="event in sortedEvents"
                  :key="event.id"
                  v-memo="[event, selectionMode, selectedIds.has(event.id)]"
                  :event="event"
                  :selection-mode="selectionMode"
                  :selected="selectedIds.has(event.id)"
                  @long-press="enterSelectionMode"
                  @toggle-select="toggleSelect"
                  @open-detail="openDetail"
                />
              </div>
            </template>

            <template v-else>
              <template v-for="yearGroup in groupedEventsByYear" :key="yearGroup.year || 'undated'">
                <div class="events-year-block">
                  <div v-if="!yearGroup.isUndated" class="events-year-header">
                    <span class="events-year-num">{{ yearGroup.year }}</span>
                    <span class="events-year-meta">{{ yearGroup.yearCount }} {{ t('common.events_count') }} / {{ formatPrice(yearGroup.yearTotal) }}</span>
                  </div>

                  <template v-for="(monthGroup, midx) in yearGroup.months" :key="monthGroup.yearMonth">
                    <section 
                      class="month-section month-section--timeline"
                      :class="{ 'month-section--last': midx === yearGroup.months.length - 1 }"
                    >
                      <div class="month-rail" aria-hidden="true">
                        <div class="month-dot" />
                        <div class="month-line" />
                      </div>

                      <div class="month-content">
                        <div class="month-head">
                          <div>
                            <template v-if="monthGroup.isUndated">
                              <h3 class="month-title">{{ t('events.undated') }}</h3>
                            </template>
                            <template v-else>
                              <span class="month-timeline-label">{{ monthGroup.month }} {{ t('events.monthSuffix') }}</span>
                            </template>
                          </div>
                        </div>

                        <div class="event-grid">
                          <!-- eslint-disable vue/valid-v-memo -->
                          <EventCard
                            v-for="event in monthGroup.items"
                            :key="event.id"
                            v-memo="[event, selectionMode, selectedIds.has(event.id)]"
                            :event="event"
                            :selection-mode="selectionMode"
                            :selected="selectedIds.has(event.id)"
                            @long-press="enterSelectionMode"
                            @toggle-select="toggleSelect"
                            @open-detail="openDetail"
                          />
                          <!-- eslint-enable vue/valid-v-memo -->
                        </div>
                      </div>
                    </section>
                  </template>
                </div>
              </template>
            </template>
          </section>
        </Transition>
      </template>

      <section v-else-if="eventsStore.activeList.length > 0" class="empty-wrap">
        <EmptyState
          icon="⌕"
          :title="t('events.noMatch')"
          :description="t('events.noMatchDesc')"
        />
      </section>

      <section v-else class="empty-wrap">
        <EmptyState
          icon="✦"
          :title="t('events.noEvents')"
          :description="t('events.longDesc')"
          :action-text="t('events.addFirst')"
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
        :aria-label="t('events.addActivity')"
        @click="goToAdd"
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 5V19" />
          <path d="M5 12H19" />
        </svg>
      </button>
    </Teleport>

    <DangerConfirmDialog
      v-model:show="showDeleteConfirm"
      :title="t('common.moveToTrash')"
      :description="t('common.moveToTrashDesc')"
      :confirm-text="t('goods.delete.moveToTrash')"
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
            {{ t('common.delete') }}{{ selectedIds.size > 0 ? ` (${selectedIds.size})` : '' }}
          </button>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import EmptyState from '@/components/common/EmptyState.vue'
import SearchBar from '@/components/common/SearchBar.vue'
import ScrollTopButton from '@/components/common/ScrollTopButton.vue'
import EventCard from '@/components/events/EventCard.vue'
import EventCountdownCard from '@/components/events/EventCountdownCard.vue'
import DangerConfirmDialog from '@/components/common/DangerConfirmDialog.vue'
import HomeSelectionHeader from '@/components/home/HomeSelectionHeader.vue'
import { useGoodsSelection } from '@/composables/goods/useGoodsSelection'
import { createPageScrollRestore } from '@/composables/scroll'
import { usePageScrollBinder } from '@/composables/scroll/usePageScrollBinder'
import { useEventsStore } from '@/stores/events'
import { formatPrice } from '@/utils/format'
import { addAndroidBackButtonListener } from '@/utils/platform/androidBackButton'
import { scrollToTopAnimated } from '@/utils/scrollToTopAnimated'
import { pinyinIncludes } from '@/utils/pinyin'
import { buildCountdownList } from '@/utils/events/countdown'
import { HOME_MOTION_CSS_VARS } from '@/constants/homeMotion'
import { clearRouteTransitionFallback, playRouteSceneSlide, runWithRouteTransition, setPendingDetailReturnPath } from '@/utils/routeTransition'
import { cleanupAllHeroes, hasPendingEventHeroBack, prepareEventHeroForward, playEventHeroBack } from '@/utils/platform/nativeGoodsHeroTransition'

defineOptions({ name: 'EventsView' })

const EVENT_VIEW_STORAGE_KEY = 'events-view-mode-v1'
const EVENT_VIEW_MODES = ['grid', 'timeline', 'countdown']
const EVENT_SORT_STORAGE_KEY = 'events-sort-direction-v1'
const SELECTION_HEADER_HEIGHT = 64
const SCROLL_TOP_ANCHOR_REASON = 'events:openDetail'
const SCROLL_TOP_BUTTON_THRESHOLD = 900
const EVENT_BACK_HERO_RETRY_MAX_FRAMES = 40

const router = useRouter()
const route = useRoute()
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
const viewMode = ref(normalizeViewMode(localStorage.getItem(EVENT_VIEW_STORAGE_KEY)))
const selectionHeaderTop = ref(0)
let pageScrollRaf = 0
let topJumpMaskTimer = 0
let eventBackHeroRetryRaf = 0
let eventBackHeroDeferredRestoreTimer = 0
let isRouteLeaving = false
let removeAndroidBackListener = null
let lastDetailNavigationTime = 0

function handleAndroidBackButton(event) {
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

const { t } = useI18n()

function normalizeViewMode(value) {
  return EVENT_VIEW_MODES.includes(value) ? value : 'grid'
}

function setViewMode(nextMode) {
  viewMode.value = normalizeViewMode(nextMode)
  localStorage.setItem(EVENT_VIEW_STORAGE_KEY, viewMode.value)
}

function toggleViewMode(mode) {
  setViewMode(viewMode.value === mode ? 'grid' : mode)
}

// ── 工具栏按钮微动效（时钟指针旋转 / 沙漏翻转漏沙）──

const MODE_TOGGLE_PULSE_MS = 750
const toggleAnimating = reactive({ timeline: false, countdown: false })
const modeTogglePulseTimers = { timeline: 0, countdown: 0 }

function pulseModeToggle(mode) {
  toggleAnimating[mode] = false
  requestAnimationFrame(() => {
    toggleAnimating[mode] = true
  })
  if (modeTogglePulseTimers[mode]) {
    window.clearTimeout(modeTogglePulseTimers[mode])
  }
  modeTogglePulseTimers[mode] = window.setTimeout(() => {
    toggleAnimating[mode] = false
    modeTogglePulseTimers[mode] = 0
  }, MODE_TOGGLE_PULSE_MS)
}

function clearModeTogglePulses() {
  for (const key of Object.keys(modeTogglePulseTimers)) {
    if (modeTogglePulseTimers[key]) {
      window.clearTimeout(modeTogglePulseTimers[key])
      modeTogglePulseTimers[key] = 0
    }
    toggleAnimating[key] = false
  }
}

function handleToggleTimeline() {
  pulseModeToggle('timeline')
  toggleViewMode('timeline')
}

function handleToggleCountdown() {
  pulseModeToggle('countdown')
  toggleViewMode('countdown')
}

const EVENT_TYPE_LABELS = computed(() => ({
  exhibition: t('events.typeExhibition'),
  concert: t('events.typeConcert'),
  other: t('events.typeOther')
}))

const {
  getScrollEl,
  getActiveScrollSource,
  markScrollSource,
  readScrollTop,
  hasPendingRestore,
  saveScrollPosition,
  restorePendingScrollPosition,
  restoreActivatedScrollPosition,
  rememberCurrentScrollPosition,
  clearDisplayedScrollPosition,
  resetStoredScrollOnReload,
  cancelPendingRestore
} = createPageScrollRestore('events')(pageBodyRef)

const { bindPageScroll, unbindPageScroll } = usePageScrollBinder({ getScrollEl, markScrollSource, handlePageScroll })

const filteredEvents = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  if (!keyword) return eventsStore.activeList

  return eventsStore.activeList.filter((event) => {
    const parts = [
      event.name,
      event.location,
      event.city,
      event.description,
      event.startDate,
      event.endDate,
      EVENT_TYPE_LABELS.value[event.type] || '',
      ...(Array.isArray(event.tags) ? event.tags : []),
      ...(Array.isArray(event.tracks) ? event.tracks.flatMap((track) => [track?.title, track?.artist, track?.album]) : [])
    ].filter(Boolean)

    // 原文匹配
    if (parts.join(' ').toLowerCase().includes(keyword)) return true

    // 拼音匹配（仅对含中文的字段）
    return parts.some((part) => pinyinIncludes(String(part), keyword))
  })
})

// Merged: sort + group into a single pass
const groupedEventsByYear = computed(() => {
  const getEvtTime = (evt) => {
    if (evt?.startDate) {
      const d = new Date(evt.startDate.replace(/-/g, '/'))
      if (!Number.isNaN(d.getTime())) return d.getTime()
    }
    return evt?.createdAt || 0
  }

  const sorted = [...filteredEvents.value].sort((left, right) => {
    const tA = getEvtTime(left)
    const tB = getEvtTime(right)
    if (tA !== tB) return sortDirection.value === 'asc' ? tA - tB : tB - tA
    // 同一天内使用与 DB 查询一致的确定性排序，保证跨设备顺序一致
    const dir = sortDirection.value === 'asc' ? 1 : -1
    const uA = left.updatedAt || 0
    const uB = right.updatedAt || 0
    if (uA !== uB) return (uA - uB) * dir
    const cA = left.createdAt || 0
    const cB = right.createdAt || 0
    if (cA !== cB) return (cA - cB) * dir
    const nA = String(left.name || '')
    const nB = String(right.name || '')
    if (nA !== nB) return nA.localeCompare(nB)
    return String(left.id || '').localeCompare(String(right.id || ''))
  })

  // Group by year-month in a single pass
  const grouped = {}
  for (const event of sorted) {
    let sourceDate = event?.startDate || ''
    if (!sourceDate && event?.createdAt) {
      const d = new Date(event.createdAt)
      if (!Number.isNaN(d.getTime())) {
        sourceDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      }
    }
    const yearMonth = sourceDate ? String(sourceDate).slice(0, 7) : 'undated'
    const key = /^\d{4}-\d{2}$/.test(yearMonth) ? yearMonth : 'undated'
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(event)
  }

  const sortedKeys = Object.keys(grouped).sort((a, b) => {
    if (a === 'undated') return 1
    if (b === 'undated') return -1
    return sortDirection.value === 'asc' ? a.localeCompare(b) : b.localeCompare(a)
  })

  // Build month groups and year groups in one pass
  const yearGroupsMap = new Map()
  const yearOrder = []

  for (const yearMonth of sortedKeys) {
    const isUndated = yearMonth === 'undated'
    const [year, month] = isUndated ? ['', ''] : yearMonth.split('-')
    const items = grouped[yearMonth]
    const totalTicket = items.reduce((sum, item) => sum + (Number.parseFloat(item.ticketPrice) || 0), 0)

    const monthGroup = {
      yearMonth,
      year: isUndated ? '' : year,
      month: isUndated ? '' : String(parseInt(month, 10)),
      isUndated,
      count: items.length,
      totalTicket,
      items
    }

    const yearKey = monthGroup.year || 'undated'
    if (!yearGroupsMap.has(yearKey)) {
      yearGroupsMap.set(yearKey, {
        year: monthGroup.year,
        isUndated: monthGroup.isUndated,
        months: [],
        yearTotal: 0,
        yearCount: 0
      })
      yearOrder.push(yearKey)
    }
    const yearGroup = yearGroupsMap.get(yearKey)
    yearGroup.months.push(monthGroup)
    yearGroup.yearCount += monthGroup.count
    yearGroup.yearTotal += monthGroup.totalTicket
  }

  return yearOrder.map(key => yearGroupsMap.get(key))
})

// Derive groupedEvents from groupedEventsByYear for backward compatibility
const groupedEvents = computed(() => {
  const result = []
  for (const yearGroup of groupedEventsByYear.value) {
    for (const monthGroup of yearGroup.months) {
      result.push(monthGroup)
    }
  }
  return result
})

// Derive sortedEvents from groupedEvents for backward compatibility
const sortedEvents = computed(() => {
  const result = []
  for (const monthGroup of groupedEvents.value) {
    for (const item of monthGroup.items) {
      result.push(item)
    }
  }
  return result
})

// Merged: totalLinkedGoods + totalPhotos in a single pass
const _eventTotals = computed(() => {
  let linkedGoods = 0
  let photos = 0
  for (const event of eventsStore.activeList) {
    linkedGoods += Array.isArray(event.linkedGoodsIds) ? event.linkedGoodsIds.length : 0
    photos += Array.isArray(event.photos) ? event.photos.length : 0
  }
  return { linkedGoods, photos }
})

const totalLinkedGoods = computed(() => _eventTotals.value.linkedGoods)
const totalPhotos = computed(() => _eventTotals.value.photos)

// 倒数视图：智能排序（进行中 → 未开始 → 已结束 → 无日期），不受升降序按钮影响
const countdownEntries = computed(() => buildCountdownList(filteredEvents.value))

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
} = useGoodsSelection(computed(() => filteredEvents.value), {
  historyKey: 'eventsSelectionMode',
  onExit: closeSelectionOverlays,
  getScrollTop: readScrollTop
})

function syncVisibleEventsCount() {}
function syncVisibleTimelineCount() {}

function toggleSortDirection() {
  sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
  localStorage.setItem(EVENT_SORT_STORAGE_KEY, sortDirection.value)
}

function toggleSearch() {
  showSearch.value = !showSearch.value
  if (!showSearch.value) searchKeyword.value = ''
}

function goToMap() {
  saveScrollPosition(true, 'events:goToMap', { includeAnchor: false })
  runWithRouteTransition(
    () => router.push('/events/map').catch(() => {
      eventsDisplayReady.value = true
    }),
    { direction: 'forward' }
  )
}

function openDetail(payload) {
  // 防止快速连续点击导致的多次导航
  const now = Date.now()
  if (now - lastDetailNavigationTime < 320) {
    return
  }
  lastDetailNavigationTime = now
  
  const p = typeof payload === 'object' && payload !== null ? payload : { id: payload }
  const eventId = p.id
  if (selectionMode.value) {
    toggleSelect(eventId)
    return
  }
  saveScrollPosition(true, `${SCROLL_TOP_ANCHOR_REASON}:${eventId}`)

  // 倒数模式卡片没有封面图：进/出详情改用统一的标准滑动过渡，不播 hero 动画
  if (viewMode.value === 'countdown') {
    runWithRouteTransition(
      () => router.push(`/events/${eventId}`).catch(() => {
        eventsDisplayReady.value = true
      }),
      { direction: 'forward', returnPath: route.fullPath }
    )
    return
  }

  clearRouteTransitionFallback()
  prepareEventHeroForward({ eventId, sourceEl: p.sourceEl || null })
  setPendingDetailReturnPath(route.fullPath)
  router.push(`/events/${eventId}`).catch(() => {
    eventsDisplayReady.value = true
  })
}

function resolveEventCardCover(eventId) {
  const normalized = String(eventId || '')
  if (!normalized) return null
  const escaped = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(normalized)
    : normalized.replace(/"/g, '\\"')

  const rootEl = getScrollEl() || pageBodyRef.value || document
  const cardRoot = rootEl?.querySelector?.(`[data-event-id="${escaped}"]`) || null
  if (cardRoot) {
    const coverInsideCard = cardRoot.querySelector?.(`[data-event-hero-id="${escaped}"]`) || null
    if (coverInsideCard) return coverInsideCard
  }

  const directCover = rootEl?.querySelector?.(`[data-event-hero-id="${escaped}"]`) || null
  if (directCover) return directCover
  return cardRoot
}

function tryPlayEventBackHero(onReady) {
  return playEventHeroBack({
    currentPath: route.fullPath,
    resolveTargetEl: resolveEventCardCover,
    onReady
  })
}

function cancelEventBackHeroRetry() {
  if (!eventBackHeroRetryRaf) return
  window.cancelAnimationFrame(eventBackHeroRetryRaf)
  eventBackHeroRetryRaf = 0
}

function clearEventBackHeroDeferredRestoreTimer() {
  if (!eventBackHeroDeferredRestoreTimer) return
  window.clearTimeout(eventBackHeroDeferredRestoreTimer)
  eventBackHeroDeferredRestoreTimer = 0
}

function scheduleEventBackHeroRetry(attempt = 0, hooks = null) {
  cancelEventBackHeroRetry()
  eventBackHeroRetryRaf = window.requestAnimationFrame(() => {
    eventBackHeroRetryRaf = 0
    const played = tryPlayEventBackHero(hooks?.onReady)
    if (played) {
      hooks?.onPlayed?.()
      return
    }
    if (!hasPendingEventHeroBack(route.fullPath)) {
      hooks?.onGiveUp?.()
      return
    }
    if (attempt + 1 >= EVENT_BACK_HERO_RETRY_MAX_FRAMES) {
      cleanupAllHeroes()
      hooks?.onGiveUp?.()
      return
    }
    scheduleEventBackHeroRetry(attempt + 1, hooks)
  })
}

function goToAdd() {
  saveScrollPosition(true, 'events:goToAdd', { includeAnchor: false })
  runWithRouteTransition(
    () => router.push({
      path: '/events/add',
      query: {
        returnTo: route.fullPath
      }
    }).catch(() => {
      eventsDisplayReady.value = true
    }),
    { direction: 'forward' }
  )
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

let _selectionSpacerEl = null
let _selectionHeaderFrameCount = 0
const SELECTION_HEADER_RECT_INTERVAL = 3 // 每 3 帧读取一次 getBoundingClientRect

function _resolveSelectionSpacer() {
  if (_selectionSpacerEl && _selectionSpacerEl.isConnected) return _selectionSpacerEl
  _selectionSpacerEl = pageBodyRef.value?.querySelector?.('.selection-header-spacer') || null
  return _selectionSpacerEl
}

function updateSelectionHeaderPosition() {
  // 帧节流：每 SELECTION_HEADER_RECT_INTERVAL 帧才读取一次 getBoundingClientRect
  _selectionHeaderFrameCount++
  if (_selectionHeaderFrameCount % SELECTION_HEADER_RECT_INTERVAL !== 0) return

  const spacer = _resolveSelectionSpacer()
  if (!spacer) {
    selectionHeaderTop.value = 0
    return
  }

  const rect = spacer.getBoundingClientRect()
  const maxTop = Math.max(0, window.innerHeight - SELECTION_HEADER_HEIGHT)
  selectionHeaderTop.value = Math.min(maxTop, Math.max(0, rect.top))
}

function handlePageScroll() {
  if (isRouteLeaving) return
  if (pageScrollRaf) return
  pageScrollRaf = window.requestAnimationFrame(() => {
    pageScrollRaf = 0
    if (isRouteLeaving) return
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
  scrollToTopAnimated(getScrollEl, 260, () => {
    updateScrollTopButtonVisibility()
    rememberCurrentScrollPosition()
  }, getActiveScrollSource())
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

async function refresh() {
  await eventsStore.refreshList()
}

watch(selectionMode, async (active) => {
  if (!active) {
    selectionHeaderTop.value = 0
    return
  }

  await nextTick()
  updateSelectionHeaderPosition()
})

onMounted(async () => {
  isRouteLeaving = false
  const didResetOnReload = resetStoredScrollOnReload()
  if (didResetOnReload) {
    clearDisplayedScrollPosition()
  }
  // Handle non-reload cold starts where stale session scroll state may persist.
  if (!didResetOnReload && !hasPendingRestore()) {
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
  bindAndroidBackButton()
})

onActivated(async () => {
  isRouteLeaving = false
  isEventsActive.value = true
  cancelEventBackHeroRetry()
  clearEventBackHeroDeferredRestoreTimer()
  // 倒数模式返回：清掉待播放的 hero，改播统一的标准滑动过渡
  if (viewMode.value === 'countdown') {
    const hadPendingHeroBack = hasPendingEventHeroBack(route.fullPath)
    cleanupAllHeroes()
    if (hadPendingHeroBack) {
      playRouteSceneSlide('back')
    }
  }
  // 仅 hero 返回动画需要整页遮罩：普通 tab 切换的滚动恢复同步完成，错误位置
  // 不会被绘制，整页 visibility:hidden 只会造成可感知的空白闪烁。
  if (hasPendingEventHeroBack(route.fullPath)) {
    eventsDisplayReady.value = false
  }
  await restoreActivatedScrollPosition(syncVisibleEventsCount, syncVisibleTimelineCount)
  await nextTick()
  const played = tryPlayEventBackHero()
  if (played) {
    eventsDisplayReady.value = true
  } else if (hasPendingEventHeroBack(route.fullPath)) {
    scheduleEventBackHeroRetry(0, {
      onPlayed: () => { eventsDisplayReady.value = true },
      onGiveUp: () => { eventsDisplayReady.value = true }
    })
  } else {
    eventsDisplayReady.value = true
  }
  bindPageScroll()
  updateScrollTopButtonVisibility()
  bindAndroidBackButton()
})

onDeactivated(() => {
  unbindAndroidBackButton()
  isEventsActive.value = false
  cancelEventBackHeroRetry()
  clearEventBackHeroDeferredRestoreTimer()
  cancelPendingRestore()
  if (!hasPendingRestore() && !isRouteLeaving) {
    rememberCurrentScrollPosition()
  }
  exitSelectionModeQuiet()
  unbindPageScroll()
})

onBeforeUnmount(() => {
  unbindAndroidBackButton()
  cancelEventBackHeroRetry()
  clearEventBackHeroDeferredRestoreTimer()
  clearModeTogglePulses()
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
  if (!hasPendingRestore() && !isRouteLeaving) {
    rememberCurrentScrollPosition()
  }
  exitSelectionModeQuiet()
})

onBeforeRouteLeave(() => {
  isRouteLeaving = true
  cancelEventBackHeroRetry()
  saveScrollPosition(false, 'events:onBeforeRouteLeave')
  if (pageScrollRaf) {
    window.cancelAnimationFrame(pageScrollRaf)
    pageScrollRaf = 0
  }
  unbindPageScroll()
})
</script>

<style scoped>
.events-page {
  position: relative;
  background: var(--app-bg-gradient);
}

.events-page--restoring {
  visibility: hidden;
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
.mode-toggle:active,
.sort-toggle:active {
  transform: scale(0.96);
}

.hero-search svg,
.mode-toggle svg,
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
  padding: 24px;
  border-radius: var(--radius-large);
  color: var(--summary-card-text);
  background:
    radial-gradient(circle at top left, rgba(255, 255, 255, 0.16), transparent 34%),
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
  top: -44px;
  left: -36px;
  width: 160px;
  height: 160px;
}

.summary-orb--right {
  right: -18px;
  bottom: -32px;
  width: 120px;
  height: 120px;
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
  margin: 22px 0 0;
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
  margin-top: 0;
}

.metric-chip {
  min-width: 0;
  padding: 12px 14px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.07);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
}

.metric-chip__label {
  display: block;
  color: var(--summary-card-label);
  font-size: 12px;
  line-height: 1.2;
}

.metric-chip strong {
  display: block;
  margin-top: 8px;
  color: var(--summary-card-text);
  font-size: 18px;
  font-weight: 700;
}

.summary-layout {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 18px;
}

.summary-main {
  min-width: 0;
}

.summary-card ::selection {
  color: var(--summary-card-text);
  background: color-mix(in srgb, var(--summary-card-text) 24%, transparent);
}

.summary-card ::-moz-selection {
  color: var(--summary-card-text);
  background: color-mix(in srgb, var(--summary-card-text) 24%, transparent);
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
  opacity: 0.54;
}

.sort-toggle__group path {
  stroke: currentColor;
  transition: stroke-width 180ms ease;
}

.sort-toggle__group--up path {
  stroke-width: 2.15;
}

.sort-toggle__group--down path {
  stroke-width: 2.65;
}

.sort-toggle--asc .sort-toggle__group--up {
  opacity: 1;
}

.sort-toggle--asc .sort-toggle__group--down {
  opacity: 0.54;
}

.sort-toggle:not(.sort-toggle--asc) .sort-toggle__group--up {
  opacity: 0.54;
}

.sort-toggle:not(.sort-toggle--asc) .sort-toggle__group--down {
  opacity: 1;
}

.sort-toggle--asc .sort-toggle__group--up path {
  stroke-width: 2.65;
}

.sort-toggle--asc .sort-toggle__group--down path {
  stroke-width: 2.15;
}

.mode-toggle {
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
  flex-shrink: 0;
  transition:
    transform var(--home-motion-density-duration) var(--home-motion-ease-standard),
    background var(--home-motion-density-duration) var(--home-motion-ease-standard),
    color var(--home-motion-density-duration) var(--home-motion-ease-standard);
}

.mode-toggle--active {
  background: #141416;
  color: #ffffff;
}

/* ---- 时钟指针：点击转一圈 ---- */

.clock-hand {
  transform-box: view-box;
  transform-origin: 50% 50%;
}

.mode-toggle--animating .clock-hand {
  /* 首尾均为 0°/360°，与静止态重合：起止无跳变，且视觉上完整转满一圈 */
  animation: mode-clock-spin 640ms cubic-bezier(0.5, 0.05, 0.35, 1);
}

@keyframes mode-clock-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* ---- 日历日期块：点击弹跳标记 ---- */

.mode-toggle .cal-mark {
  fill: currentColor;
  stroke: none;
  transform-box: view-box;
  transform-origin: 50% 50%;
}

.mode-toggle--animating .cal-mark {
  animation: cal-mark-pop 560ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes cal-mark-pop {
  0% { transform: scale(0.3); opacity: 0.35; }
  60% { transform: scale(1.18); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .mode-toggle--animating .clock-hand,
  .mode-toggle--animating .cal-mark {
    animation: none;
  }
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

.cd-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
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

.events-year-block {
  display: flex;
  flex-direction: column;
}

.events-year-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0 10px;
  margin-bottom: 8px;
}

.events-year-num {
  font-size: 20px;
  font-weight: 700;
  color: var(--app-text-secondary);
  letter-spacing: -0.02em;
  line-height: 1;
}

.events-year-meta {
  font-size: 12px;
  font-weight: 500;
  color: var(--app-text-tertiary);
}

.month-section--timeline {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  column-gap: 16px;
  padding-bottom: 24px;
}

.month-section--timeline.month-section--last {
  padding-bottom: 0;
}

.month-rail {
  position: relative;
  display: flex;
  justify-content: center;
}

.month-dot {
  position: relative;
  z-index: 1;
  width: 12px;
  height: 12px;
  margin-top: 8px;
  border-radius: 50%;
  background: #141416;
  box-shadow: 0 0 0 5px color-mix(in srgb, var(--app-surface) 72%, transparent);
}

.month-line {
  position: absolute;
  top: 20px;
  bottom: -24px;
  left: 50%;
  width: 2px;
  transform: translateX(-50%);
  background: linear-gradient(180deg, color-mix(in srgb, var(--app-text-tertiary) 28%, transparent), transparent);
}

.month-section--timeline.month-section--last .month-line {
  display: none;
}

.month-content {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.month-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
  min-width: 0;
}

.month-timeline-label {
  font-size: 18px;
  font-weight: 650;
  color: var(--app-text);
  letter-spacing: -0.03em;
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
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }

  .event-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .cd-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
  }
}

@media (min-width: 900px) {
  .summary-layout {
    grid-template-columns: minmax(0, 1fr) minmax(280px, 1fr);
    align-items: center;
    gap: 22px;
  }

  .summary-metrics {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    margin-top: 0;
  }

  .metric-chip {
    padding: 12px 14px;
  }

  .metric-chip strong {
    font-size: 16px;
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

  .sort-toggle {
    flex: 0 0 auto;
    width: 44px;
    height: 44px;
    border-radius: 16px;
  }

  .mode-toggle {
    width: 44px;
    height: 44px;
    border-radius: 16px;
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

  .cd-grid {
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
  .month-line {
    background: color-mix(in srgb, var(--app-text-secondary) 18%, transparent);
  }
}

:global(html.theme-dark) .mode-toggle--active {
  background: #f5f5f7;
  color: #141416;
}
</style>

