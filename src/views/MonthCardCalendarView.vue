<template>
  <div class="page month-card-page">
    <NavBar title="月卡日历" show-back />

    <main class="page-body">
      <section v-if="hasMonthCardRecords" class="hero-section">
        <div class="hero-copy">
          <p class="hero-label">Month Card Calendar</p>
          <h1 class="hero-title">{{ selectedGame || '全部游戏' }}</h1>
          <p class="hero-desc">同一游戏的多张月卡会按到期时间顺延累加，每张继续增加 30 天生效期。</p>
        </div>
      </section>

      <section v-if="hasMonthCardRecords" class="filter-section">
        <CategoryChips v-model="selectedGame" :categories="gameOptions" />
      </section>

      <section v-if="hasMonthCardRecords" class="summary-section">
        <article class="summary-card">
          <div class="summary-card__stats">
            <div class="summary-stat">
              <span class="summary-stat__value">{{ longestCoverageDays }}</span>
              <span class="summary-stat__label">最长持续生效天数</span>
            </div>
            <div class="summary-stat">
              <span class="summary-stat__value">{{ latestExpiryText }}</span>
              <span class="summary-stat__label">最晚到期</span>
            </div>
          </div>
        </article>
      </section>

      <section v-if="hasMonthCardRecords" class="calendar-section">
        <div
          ref="calendarFrameRef"
          :class="['calendar-frame', { 'calendar-frame--jumping': calendarJumping }]"
          @touchstart.passive="handleCalendarTouchStart"
          @touchmove.passive="handleCalendarTouchMove"
          @touchend="handleCalendarTouchEnd"
          @touchcancel="handleCalendarTouchCancel"
          @pointerdown="handleCalendarPointerDown"
          @pointermove="handleCalendarPointerMove"
          @pointerup="handleCalendarPointerUp"
          @pointercancel="handleCalendarPointerCancel"
        >
        <div class="calendar-section__toolbar">
          <button
            v-if="showJumpToToday"
            type="button"
            class="calendar-jump-btn"
            @pointerdown.stop
            @touchstart.stop
            @click="jumpToToday"
          >
            回到今天
          </button>
        </div>
        <div
          class="calendar-track"
          :class="{ 'calendar-track--animating': calendarAnimation.transition }"
          :style="calendarTrackStyle"
        >
          <section
            v-for="page in calendarPages"
            :key="page.id"
            class="calendar-page"
          >
            <div class="calendar-grid" :class="{ 'calendar-grid--dual': isTabletViewport }">
              <article
                v-for="month in page.months"
                :key="month.key"
                class="calendar-card"
              >
                <div class="calendar-card__head">
                  <div>
                    <p class="calendar-card__label">当前月份</p>
                    <p class="calendar-card__month">{{ month.label }}</p>
                  </div>
                  <div class="calendar-card__legend">
                    <span class="calendar-card__legend-dot" aria-hidden="true" />
                    <span class="calendar-card__legend-text">生效覆盖</span>
                  </div>
                </div>

                <div class="calendar-weekdays">
                  <span v-for="weekday in WEEK_LABELS" :key="weekday" class="calendar-weekdays__item">{{ weekday }}</span>
                </div>

                <div class="calendar-days">
                  <div
                    v-for="day in month.days"
                    :key="day.key"
                    :class="[
                      'calendar-day',
                      {
                        'calendar-day--outside': !day.inMonth,
                        'calendar-day--today': day.isToday,
                        'calendar-day--active': day.coverageCount > 0
                      }
                    ]"
                  >
                    <span
                      v-if="day.coverageCount > 0"
                      class="calendar-day__fill"
                      :style="{ opacity: day.coverageOpacity }"
                      aria-hidden="true"
                    />
                    <span class="calendar-day__number">{{ day.dayNumber }}</span>
                  </div>
                </div>
              </article>
            </div>
          </section>
        </div>
        </div>
      </section>

      <section v-if="hasMonthCardRecords" class="records-section">
        <div class="section-head">
          <p class="section-label">覆盖详情</p>
          <h2 class="section-title">{{ currentMonthRecordList.length }} 条生效区间</h2>
        </div>

        <div v-if="currentMonthRecordList.length > 0" class="record-list">
          <article v-for="record in currentMonthRecordList" :key="record.id" class="record-item">
            <div class="record-item__accent" :style="{ background: record.tint }" aria-hidden="true" />
            <div class="record-item__body">
              <div class="record-item__top">
                <div class="record-item__identity">
                  <LazyCachedImage
                    v-if="record.image"
                    :src="record.image"
                    :alt="record.itemName"
                    class="record-item__image"
                    loading="lazy"
                    decoding="async"
                  />
                  <div>
                    <p class="record-item__name">{{ record.itemName }}</p>
                    <p class="record-item__game">{{ record.game }}</p>
                  </div>
                </div>
                <p :class="['record-item__status', `record-item__status--${record.status}`]">{{ record.statusText }}</p>
              </div>
              <p class="record-item__meta">购买 {{ record.purchaseText }} · 生效 {{ record.startText }} - {{ record.endText }}</p>
            </div>
          </article>
        </div>

        <div v-else class="empty-mini">这个月没有月卡覆盖天数。</div>
      </section>

      <section v-if="!hasMonthCardRecords" class="empty-wrap">
        <EmptyState
          icon="✨"
          title="还没有月卡记录"
          description="添加空月祝福、列车补给凭证或绳网会员后，这里会按月显示覆盖天数。"
        />
      </section>
    </main>
  </div>
</template>

<script setup>
import { computed, onActivated, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import NavBar from '@/components/common/NavBar.vue'
import CategoryChips from '@/components/common/CategoryChips.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import LazyCachedImage from '@/components/image/LazyCachedImage.vue'
import { useRechargeStore } from '@/composables/recharge/useRechargeStore'
import { collectRechargeImageUrls } from '@/utils/rechargeImages'
import { preloadImages } from '@/utils/imageCache'

defineOptions({ name: 'MonthCardCalendarView' })

const MONTH_CARD_NAMES = new Set(['空月祝福', '列车补给凭证', '绳网会员'])
const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日']
const TINTS = [
  'linear-gradient(180deg, #8b5cf6 0%, #a855f7 100%)',
  'linear-gradient(180deg, #ec4899 0%, #f43f5e 100%)',
  'linear-gradient(180deg, #2563eb 0%, #3b82f6 100%)',
  'linear-gradient(180deg, #ea580c 0%, #f97316 100%)',
  'linear-gradient(180deg, #059669 0%, #10b981 100%)',
  'linear-gradient(180deg, #334155 0%, #0f172a 100%)'
]
const GAME_ORDER = ['原神', '星穹铁道', '绝区零']
const MONTH_CARD_IMAGE_MAP = {
  空月祝福: 'https://sdk-webstatic.mihoyo.com/sdk-payment-upload/2020/06/08/2da77803b9b2ffc2a2b763a59e9c125f_5219067706372136934.png',
  列车补给凭证: 'https://sdk-webstatic.mihoyo.com/sdk-payment-upload/2023/05/23/8c7da28aa8ee6a6866dd910b51b72a55_2347111329520592020.png',
  绳网会员: 'https://sdk-webstatic.mihoyo.com/sdk-payment-upload/2024/06/03/3dda8c162c789c6570cb93d0ee718767_3385183545176737004.png'
}

const rechargeStore = useRechargeStore()
const selectedGame = ref('')
const currentMonthIndex = ref(0)
const windowWidth = ref(typeof window === 'undefined' ? 390 : window.innerWidth)
const today = startOfDay(new Date())
const calendarFrameRef = ref(null)
const calendarJumping = ref(false)
const calendarAnimation = ref({
  offset: 0,
  transition: '',
  phase: 'idle'
})
let calendarAnimationTimer = null
const calendarTouchState = ref({
  startX: 0,
  startY: 0,
  deltaX: 0,
  deltaY: 0,
  displayOffset: 0,
  lockedAxis: '',
  isDragging: false,
  pointerId: null,
  lastX: 0,
  lastTime: 0,
  velocityX: 0
})

const isTabletViewport = computed(() => windowWidth.value >= 900)

const allMonthCardRecords = computed(() => {
  const grouped = new Map()

  for (const raw of rechargeStore.sortedRecords.value) {
    const itemName = String(raw?.itemName || '').trim()
    const game = String(raw?.game || '').trim()
    const chargedAt = String(raw?.chargedAt || '').trim()
    if (!MONTH_CARD_NAMES.has(itemName) || !game || !chargedAt) continue

    const purchaseDate = startOfDay(new Date(chargedAt))
    if (Number.isNaN(purchaseDate.getTime())) continue

    if (!grouped.has(game)) grouped.set(game, [])
    grouped.get(game).push({
      id: String(raw?.id || `${game}-${itemName}-${chargedAt}`),
      game,
      itemName,
      purchaseDate,
      updatedAt: Number(raw?.updatedAt || 0)
    })
  }

  const result = []

  for (const [game, records] of grouped.entries()) {
    const sorted = [...records].sort((a, b) => {
      const diff = a.purchaseDate.getTime() - b.purchaseDate.getTime()
      if (diff !== 0) return diff
      const updateDiff = a.updatedAt - b.updatedAt
      if (updateDiff !== 0) return updateDiff
      return a.id.localeCompare(b.id)
    })

    let lastEndDate = null
    sorted.forEach((record, index) => {
      const startDate = lastEndDate && record.purchaseDate.getTime() <= lastEndDate.getTime()
        ? addDays(lastEndDate, 1)
        : record.purchaseDate
      const endDate = addDays(startDate, 29)
      lastEndDate = endDate

      result.push({
        ...record,
        startDate,
        endDate,
        image: MONTH_CARD_IMAGE_MAP[record.itemName] || '',
        purchaseText: formatDate(record.purchaseDate),
        startText: formatDate(startDate),
        endText: formatDate(endDate),
        status: getStatus(startDate, endDate),
        statusText: getStatusText(startDate, endDate),
        tint: TINTS[index % TINTS.length]
      })
    })
  }

  return result.sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
})

const gameOptions = computed(() => {
  const set = new Set(allMonthCardRecords.value.map((item) => item.game))
  return Array.from(set).sort(compareGameOrder)
})

const scopedRecords = computed(() => {
  if (!selectedGame.value) return allMonthCardRecords.value
  return allMonthCardRecords.value.filter((item) => item.game === selectedGame.value)
})

const hasMonthCardRecords = computed(() => scopedRecords.value.length > 0)

const monthKeys = computed(() => {
  if (scopedRecords.value.length === 0) return [toMonthKey(today)]

  const firstStart = scopedRecords.value[0].startDate
  const lastEnd = scopedRecords.value.reduce((latest, item) => (
    item.endDate.getTime() > latest.getTime() ? item.endDate : latest
  ), scopedRecords.value[0].endDate)

  const keys = []
  let cursor = startOfMonth(firstStart)
  const finalMonth = startOfMonth(lastEnd)

  while (cursor.getTime() <= finalMonth.getTime()) {
    keys.push(toMonthKey(cursor))
    cursor = addMonths(cursor, 1)
  }

  const currentMonthKey = toMonthKey(today)
  if (!keys.includes(currentMonthKey)) {
    keys.push(currentMonthKey)
    keys.sort()
  }

  return keys
})

const currentMonthKey = computed(() => monthKeys.value[currentMonthIndex.value] || toMonthKey(today))
const visibleMonthKeys = computed(() => {
  const keys = [currentMonthKey.value]
  if (isTabletViewport.value) {
    const nextKey = monthKeys.value[currentMonthIndex.value + 1]
    if (nextKey) keys.push(nextKey)
  }
  return keys
})
const showJumpToToday = computed(() => !visibleMonthKeys.value.includes(toMonthKey(today)))

const currentMonthRecordList = computed(() => {
  const monthStart = parseMonthKey(currentMonthKey.value)
  const monthEnd = endOfMonth(monthStart)
  return scopedRecords.value
    .filter((item) => item.startDate.getTime() <= monthEnd.getTime() && item.endDate.getTime() >= monthStart.getTime())
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
})

const monthCardImageUrls = computed(() => {
  const urls = [
    ...Object.values(MONTH_CARD_IMAGE_MAP),
    ...collectRechargeImageUrls(scopedRecords.value)
  ]
  return Array.from(new Set(urls.filter(Boolean)))
})

const longestCoverageDays = computed(() => {
  const segments = buildCoverageSegments(scopedRecords.value)
  if (segments.length === 0) return 0
  return Math.max(...segments.map((segment) => diffInDays(segment.endDate, segment.startDate) + 1))
})

const latestExpiryText = computed(() => {
  if (scopedRecords.value.length === 0) return '-'
  const latest = scopedRecords.value.reduce((target, item) => (
    item.endDate.getTime() > target.getTime() ? item.endDate : target
  ), scopedRecords.value[0].endDate)
  return formatDate(latest)
})

const visibleMonths = computed(() => {
  if (!hasMonthCardRecords.value) return []

  return visibleMonthKeys.value.map((key) => buildMonthView(key, scopedRecords.value))
})

const calendarPages = computed(() => {
  if (!hasMonthCardRecords.value) return []

  const step = getMonthStep()
  const currentStart = currentMonthIndex.value
  const previousStart = Math.max(0, currentStart - step)
  const nextStart = Math.min(Math.max(monthKeys.value.length - 1, 0), currentStart + step)

  return [previousStart, currentStart, nextStart].map((startIndex, pageIndex) => ({
    id: `${startIndex}-${pageIndex}`,
    startIndex,
    months: buildPageMonths(startIndex)
  }))
})

const calendarDragOffset = computed(() => {
  if (!calendarTouchState.value.isDragging || calendarTouchState.value.lockedAxis !== 'x') return 0
  return calendarTouchState.value.displayOffset
})

const calendarTrackStyle = computed(() => ({
  transform: `translate3d(calc(-33.333333% + ${calendarAnimation.value.phase === 'idle' ? calendarDragOffset.value : calendarAnimation.value.offset}px), 0, 0)`,
  transition: calendarAnimation.value.transition || 'none'
}))

function handleResize() {
  windowWidth.value = window.innerWidth
}

function refreshRecords() {
  rechargeStore.init()
  rechargeStore.clearInvalidRecords()
  if (selectedGame.value && !gameOptions.value.includes(selectedGame.value)) {
    selectedGame.value = ''
  }
  syncMonthIndex()
}

function syncMonthIndex(preferredMonthKey = toMonthKey(today)) {
  const found = monthKeys.value.indexOf(preferredMonthKey)
  currentMonthIndex.value = found >= 0 ? found : Math.max(0, monthKeys.value.length - 1)
}

function goPrevMonth() {
  const step = getMonthStep()
  currentMonthIndex.value = Math.max(0, currentMonthIndex.value - step)
}

function goNextMonth() {
  const step = getMonthStep()
  currentMonthIndex.value = Math.min(monthKeys.value.length - 1, currentMonthIndex.value + step)
}

function getMonthStep() {
  return isTabletViewport.value ? 2 : 1
}

function buildPageMonths(startIndex) {
  const firstKey = monthKeys.value[startIndex] || currentMonthKey.value
  const keys = [firstKey]
  if (isTabletViewport.value) {
    const nextKey = monthKeys.value[startIndex + 1]
    if (nextKey) keys.push(nextKey)
  }
  return keys.map((key) => buildMonthView(key, scopedRecords.value))
}

function canGoPrevMonth() {
  return currentMonthIndex.value > 0
}

function canGoNextMonth() {
  return currentMonthIndex.value < monthKeys.value.length - 1
}

function getCalendarFrameWidth() {
  return calendarFrameRef.value?.offsetWidth || windowWidth.value || 320
}

function jumpToToday() {
  const todayMonthKey = toMonthKey(today)
  const targetIndex = monthKeys.value.indexOf(todayMonthKey)
  if (targetIndex < 0) return

  clearCalendarAnimationTimer()
  resetCalendarTouchState()
  calendarAnimation.value = {
    offset: 0,
    transition: '',
    phase: 'idle'
  }

  calendarJumping.value = true
  window.setTimeout(() => {
    currentMonthIndex.value = targetIndex
    window.setTimeout(() => {
      calendarJumping.value = false
    }, 170)
  }, 120)
}

function clearCalendarAnimationTimer() {
  if (calendarAnimationTimer) {
    clearTimeout(calendarAnimationTimer)
    calendarAnimationTimer = null
  }
}

function settleCalendarTrack(offset = 0, duration = 220) {
  clearCalendarAnimationTimer()
  calendarAnimation.value = {
    offset,
    transition: `transform ${duration}ms cubic-bezier(0.22, 1, 0.36, 1)`,
    phase: 'settling'
  }
  calendarAnimationTimer = setTimeout(() => {
    calendarAnimation.value = {
      offset: 0,
      transition: '',
      phase: 'idle'
    }
    calendarAnimationTimer = null
  }, duration)
}

function animateMonthSwipe(direction) {
  const canMove = direction === 'next' ? canGoNextMonth() : canGoPrevMonth()
  if (!canMove) {
    settleCalendarTrack(0, 220)
    return
  }

  clearCalendarAnimationTimer()

  const width = getCalendarFrameWidth()
  const sign = direction === 'next' ? -1 : 1
  const outOffset = sign * width

  calendarAnimation.value = {
    offset: outOffset,
    transition: 'transform 240ms cubic-bezier(0.22, 0.8, 0.3, 1)',
    phase: 'leaving'
  }

  calendarAnimationTimer = setTimeout(() => {
    if (direction === 'next') goNextMonth()
    else goPrevMonth()

    calendarAnimation.value = {
      offset: 0,
      transition: 'none',
      phase: 'entering'
    }

    requestAnimationFrame(() => {
      calendarAnimation.value = {
        offset: 0,
        transition: '',
        phase: 'idle'
      }
      calendarAnimationTimer = null
    })
  }, 240)
}

function getDampedOffset(rawDeltaX) {
  const frameWidth = getCalendarFrameWidth()
  const draggingToPrev = rawDeltaX > 0
  const draggingToNext = rawDeltaX < 0
  const atBoundary = (draggingToPrev && !canGoPrevMonth()) || (draggingToNext && !canGoNextMonth())
  if (!atBoundary) return rawDeltaX

  const constant = 0.55
  const distance = Math.abs(rawDeltaX)
  const rubberBand = (constant * distance * frameWidth) / (frameWidth + constant * distance)
  return Math.sign(rawDeltaX) * rubberBand
}

function resetCalendarTouchState() {
  calendarTouchState.value = {
    startX: 0,
    startY: 0,
    deltaX: 0,
    deltaY: 0,
    displayOffset: 0,
    lockedAxis: '',
    isDragging: false,
    pointerId: null,
    lastX: 0,
    lastTime: 0,
    velocityX: 0
  }
}

function startCalendarGesture(clientX, clientY, pointerId = null) {
  clearCalendarAnimationTimer()
  calendarAnimation.value = {
    offset: 0,
    transition: '',
    phase: 'idle'
  }
  calendarTouchState.value = {
    startX: clientX,
    startY: clientY,
    deltaX: 0,
    deltaY: 0,
    displayOffset: 0,
    lockedAxis: '',
    isDragging: true,
    pointerId,
    lastX: clientX,
    lastTime: performance.now(),
    velocityX: 0
  }
}

function moveCalendarGesture(clientX, clientY) {
  if (!calendarTouchState.value.isDragging) return

  const deltaX = clientX - calendarTouchState.value.startX
  const deltaY = clientY - calendarTouchState.value.startY
  const absX = Math.abs(deltaX)
  const absY = Math.abs(deltaY)
  const now = performance.now()
  const deltaTime = Math.max(now - calendarTouchState.value.lastTime, 1)
  const velocityX = (clientX - calendarTouchState.value.lastX) / deltaTime

  calendarTouchState.value.deltaX = deltaX
  calendarTouchState.value.deltaY = deltaY
  calendarTouchState.value.lastX = clientX
  calendarTouchState.value.lastTime = now
  calendarTouchState.value.velocityX = velocityX

  if (!calendarTouchState.value.lockedAxis && (absX > 10 || absY > 10)) {
    calendarTouchState.value.lockedAxis = absX > absY ? 'x' : 'y'
  }

  if (calendarTouchState.value.lockedAxis === 'x') {
    calendarTouchState.value.displayOffset = getDampedOffset(deltaX)
  }
}

function finishCalendarGesture() {
  const { deltaX, deltaY, lockedAxis, isDragging, velocityX } = calendarTouchState.value
  if (!isDragging) return

  const width = getCalendarFrameWidth()
  const distancePassed = Math.abs(deltaX) > Math.min(width * 0.18, 96)
  const flickPassed = Math.abs(velocityX) > 0.45 && Math.abs(deltaX) > 18

  if (lockedAxis === 'x' && Math.abs(deltaX) > Math.abs(deltaY) && (distancePassed || flickPassed)) {
    animateMonthSwipe(deltaX < 0 ? 'next' : 'prev')
  } else {
    settleCalendarTrack(0, 200)
  }

  resetCalendarTouchState()
}

function handleCalendarTouchStart(event) {
  const touch = event.touches?.[0]
  if (!touch) return
  startCalendarGesture(touch.clientX, touch.clientY)
}

function handleCalendarTouchMove(event) {
  const touch = event.touches?.[0]
  if (!touch) return
  moveCalendarGesture(touch.clientX, touch.clientY)
}

function handleCalendarTouchEnd() {
  finishCalendarGesture()
}

function handleCalendarTouchCancel() {
  resetCalendarTouchState()
}

function handleCalendarPointerDown(event) {
  if (event.pointerType === 'touch') return
  event.currentTarget?.setPointerCapture?.(event.pointerId)
  startCalendarGesture(event.clientX, event.clientY, event.pointerId)
}

function handleCalendarPointerMove(event) {
  if (calendarTouchState.value.pointerId !== event.pointerId) return
  moveCalendarGesture(event.clientX, event.clientY)
}

function handleCalendarPointerUp(event) {
  if (calendarTouchState.value.pointerId !== event.pointerId) return
  event.currentTarget?.releasePointerCapture?.(event.pointerId)
  finishCalendarGesture()
}

function handleCalendarPointerCancel(event) {
  if (calendarTouchState.value.pointerId !== event.pointerId) return
  event.currentTarget?.releasePointerCapture?.(event.pointerId)
  resetCalendarTouchState()
}

watch(selectedGame, () => {
  syncMonthIndex()
})

onMounted(() => {
  window.addEventListener('resize', handleResize, { passive: true })
  refreshRecords()
  preloadImages(monthCardImageUrls.value)
})

onActivated(() => {
  refreshRecords()
  preloadImages(monthCardImageUrls.value)
})

onBeforeUnmount(() => {
  clearCalendarAnimationTimer()
  window.removeEventListener('resize', handleResize)
})

watch(monthCardImageUrls, (urls) => {
  preloadImages(urls)
}, { immediate: true })

function buildCoverageSegments(records) {
  if (records.length === 0) return []

  const sorted = [...records].sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
  const segments = []
  let current = {
    startDate: sorted[0].startDate,
    endDate: sorted[0].endDate
  }

  for (let index = 1; index < sorted.length; index += 1) {
    const item = sorted[index]
    if (item.startDate.getTime() <= addDays(current.endDate, 1).getTime()) {
      if (item.endDate.getTime() > current.endDate.getTime()) {
        current.endDate = item.endDate
      }
      continue
    }

    segments.push(current)
    current = {
      startDate: item.startDate,
      endDate: item.endDate
    }
  }

  segments.push(current)
  return segments
}

function buildMonthView(monthKey, records) {
  const monthDate = parseMonthKey(monthKey)
  const monthStart = startOfMonth(monthDate)
  const monthEnd = endOfMonth(monthDate)
  const gridStart = addDays(monthStart, -getMondayBasedWeekday(monthStart))
  const gridEnd = addDays(monthEnd, 6 - getMondayBasedWeekday(monthEnd))
  const days = []

  for (let cursor = new Date(gridStart); cursor.getTime() <= gridEnd.getTime(); cursor = addDays(cursor, 1)) {
    const day = startOfDay(cursor)
    const coverageCount = records.filter((item) => (
      day.getTime() >= item.startDate.getTime() && day.getTime() <= item.endDate.getTime()
    )).length

    days.push({
      key: `${monthKey}-${day.toISOString()}`,
      dayNumber: day.getDate(),
      inMonth: day.getMonth() === monthDate.getMonth(),
      isToday: day.getTime() === today.getTime(),
      coverageCount,
      coverageOpacity: String(Math.min(0.48 + (coverageCount - 1) * 0.16, 0.92))
    })
  }

  return {
    key: monthKey,
    label: formatMonthLabel(monthKey),
    coverageDayCount: days.filter((day) => day.inMonth && day.coverageCount > 0).length,
    days
  }
}

function getStatus(startDate, endDate) {
  if (today.getTime() < startDate.getTime()) return 'upcoming'
  if (today.getTime() > endDate.getTime()) return 'expired'
  return 'active'
}

function getStatusText(startDate, endDate) {
  const status = getStatus(startDate, endDate)
  if (status === 'active') return '生效中'
  if (status === 'upcoming') return '未开始'
  return '已结束'
}

function diffInDays(later, earlier) {
  return Math.floor((startOfDay(later).getTime() - startOfDay(earlier).getTime()) / 86400000)
}

function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatMonthLabel(monthKey) {
  const date = parseMonthKey(monthKey)
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月`
}

function startOfDay(date) {
  const target = new Date(date)
  target.setHours(0, 0, 0, 0)
  return target
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0)
}

function addDays(date, days) {
  const target = new Date(date)
  target.setDate(target.getDate() + days)
  target.setHours(0, 0, 0, 0)
  return target
}

function addMonths(date, months) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1)
}

function getMondayBasedWeekday(date) {
  return (date.getDay() + 6) % 7
}

function toMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function parseMonthKey(monthKey) {
  const [year, month] = String(monthKey).split('-').map(Number)
  return new Date(year, (month || 1) - 1, 1)
}

function compareGameOrder(left, right) {
  const leftIndex = GAME_ORDER.indexOf(left)
  const rightIndex = GAME_ORDER.indexOf(right)

  if (leftIndex >= 0 && rightIndex >= 0) return leftIndex - rightIndex
  if (leftIndex >= 0) return -1
  if (rightIndex >= 0) return 1
  return left.localeCompare(right, 'zh-Hans-CN')
}
</script>

<style scoped>
.month-card-page {
  background: var(--app-bg-gradient);
}

.page-body {
  padding-bottom: calc(var(--tabbar-height) + env(safe-area-inset-bottom) + 40px);
}

.hero-section,
.filter-section,
.summary-section,
.calendar-section,
.records-section,
.empty-wrap {
  padding: 0 var(--page-padding);
  margin-top: var(--section-gap);
}

.hero-copy {
  max-width: 660px;
}

.hero-label,
.section-label,
.calendar-card__label {
  color: var(--app-text-tertiary);
  font-size: 13px;
}

.hero-title,
.section-title {
  margin-top: 4px;
  color: var(--app-text);
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.03em;
}

.hero-desc {
  margin-top: 10px;
  color: var(--app-text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.summary-card,
.calendar-card,
.record-item,
.empty-mini {
  border-radius: var(--radius-card);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
}

.summary-card,
.calendar-card {
  padding: 16px;
}

.summary-card__stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.summary-stat {
  padding: 14px;
  border-radius: 18px;
  background: color-mix(in srgb, var(--app-surface-soft) 60%, var(--app-surface));
  box-shadow: inset 0 0 0 1px var(--app-border);
}

.summary-stat__value {
  display: block;
  color: var(--app-text);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.summary-stat__label {
  display: block;
  margin-top: 6px;
  color: var(--app-text-secondary);
  font-size: 12px;
}

.calendar-section {
  position: relative;
}

.calendar-section__toolbar {
  position: absolute;
  top: 14px;
  right: 14px;
  z-index: 3;
  display: flex;
  justify-content: flex-end;
  pointer-events: none;
}

.calendar-jump-btn {
  padding: 9px 14px;
  border: none;
  border-radius: 999px;
  color: var(--app-text);
  font-size: 13px;
  font-weight: 700;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--app-surface) 84%, white), var(--app-surface-soft));
  box-shadow:
    0 10px 24px rgba(15, 23, 42, 0.08),
    inset 0 0 0 1px color-mix(in srgb, var(--app-border) 88%, transparent);
  pointer-events: auto;
}

.calendar-frame {
  position: relative;
  overflow: hidden;
  touch-action: pan-y;
  user-select: none;
  -webkit-user-select: none;
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}

.calendar-frame--jumping {
  opacity: 0.26;
  transform: translateY(4px);
}

.calendar-track {
  --calendar-page-gap: 12px;
  display: flex;
  width: 300%;
  margin: 0 calc(var(--calendar-page-gap) * -0.5);
  transition: none;
  will-change: transform;
}

.calendar-track--animating {
  transition: transform 280ms cubic-bezier(0.22, 0.9, 0.24, 1);
}

.calendar-page {
  width: calc(100% / 3);
  flex: 0 0 calc(100% / 3);
  padding: 0 calc(var(--calendar-page-gap) * 0.5);
  box-sizing: border-box;
}

.calendar-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

.calendar-grid--dual {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  justify-content: stretch;
}

.calendar-card {
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--app-text) 8%, transparent), transparent 30%),
    linear-gradient(180deg, color-mix(in srgb, var(--app-surface-soft) 46%, var(--app-surface)), var(--app-surface));
  user-select: none;
  -webkit-user-select: none;
}

.calendar-card__head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
}

.calendar-card__title {
  margin-top: 4px;
  color: var(--app-text);
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.03em;
}

.calendar-card__month {
  margin-top: 8px;
  color: var(--app-text);
  font-size: 30px;
  font-weight: 800;
  letter-spacing: -0.04em;
}

.calendar-card__legend {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-surface-soft) 76%, transparent);
  box-shadow: inset 0 0 0 1px var(--app-border);
}

.calendar-card__legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: linear-gradient(135deg, #fb7185 0%, #8b5cf6 55%, #60a5fa 100%);
}

.calendar-card__legend-text {
  color: var(--app-text-secondary);
  font-size: 12px;
}

.calendar-weekdays,
.calendar-days {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 8px;
}

.calendar-weekdays {
  margin-top: 16px;
}

.calendar-weekdays__item {
  color: var(--app-text-tertiary);
  font-size: 12px;
  text-align: center;
  user-select: none;
  -webkit-user-select: none;
}

.calendar-days {
  margin-top: 12px;
  align-content: start;
  grid-auto-rows: minmax(68px, auto);
  min-height: calc(68px * 6 + 8px * 5);
}

.calendar-day {
  position: relative;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  min-height: 68px;
  padding: 10px;
  overflow: hidden;
  border-radius: 18px;
  background: color-mix(in srgb, var(--app-surface) 88%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--app-border) 88%, transparent);
}

.calendar-day--outside {
  opacity: 0.42;
}

.calendar-day--today {
  box-shadow:
    inset 0 0 0 2px rgba(255, 255, 255, 0.72),
    inset 0 0 0 4px color-mix(in srgb, var(--app-text) 24%, transparent),
    0 12px 22px rgba(20, 20, 22, 0.1);
}

.calendar-day__fill {
  position: absolute;
  inset: 2px;
  border-radius: 16px;
  background: linear-gradient(135deg, rgba(251, 113, 133, 0.36) 0%, rgba(139, 92, 246, 0.38) 52%, rgba(96, 165, 250, 0.36) 100%);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.34),
    inset 0 -12px 20px rgba(139, 92, 246, 0.14);
}

.calendar-day__number {
  position: relative;
  z-index: 1;
  color: var(--app-text);
  font-size: 14px;
  font-weight: 700;
  user-select: none;
  -webkit-user-select: none;
}

@media (hover: hover) and (pointer: fine) {
  .calendar-frame {
    cursor: grab;
  }

  .calendar-frame:active {
    cursor: grabbing;
  }
}

.section-head {
  margin-bottom: 14px;
}

.record-list {
  display: grid;
  gap: 10px;
}

.record-item {
  display: grid;
  grid-template-columns: 5px minmax(0, 1fr);
  gap: 0;
  overflow: hidden;
}

.record-item__accent {
  min-height: 100%;
}

.record-item__body {
  min-width: 0;
  padding: 14px 16px;
  background: var(--app-surface);
}

.record-item__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.record-item__identity {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.record-item__image {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  object-fit: cover;
  box-shadow: inset 0 0 0 1px var(--app-border);
  flex-shrink: 0;
}

.record-item__name {
  color: var(--app-text);
  font-size: 15px;
  font-weight: 700;
}

.record-item__game {
  margin-top: 4px;
  color: var(--app-text-secondary);
  font-size: 12px;
}

.record-item__status {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 700;
}

.record-item__status--active {
  color: #0f766e;
}

.record-item__status--upcoming {
  color: #1d4ed8;
}

.record-item__status--expired {
  color: var(--app-text-tertiary);
}

.record-item__meta {
  margin-top: 8px;
  color: var(--app-text-secondary);
  font-size: 12px;
  line-height: 1.55;
}

.empty-mini {
  padding: 20px;
  color: var(--app-text-tertiary);
  font-size: 13px;
}

.empty-wrap {
  padding-top: 24px;
}

:global(html.theme-dark) .calendar-day__fill {
  background: linear-gradient(135deg, rgba(244, 114, 182, 0.34) 0%, rgba(167, 139, 250, 0.36) 50%, rgba(96, 165, 250, 0.32) 100%);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.12),
    inset 0 -12px 20px rgba(0, 0, 0, 0.2);
}

:global(html.theme-dark) .calendar-day--today {
  box-shadow:
    inset 0 0 0 2px rgba(255, 255, 255, 0.22),
    inset 0 0 0 4px rgba(255, 255, 255, 0.12),
    0 12px 22px rgba(0, 0, 0, 0.28);
}

:global(html.theme-dark) .calendar-card__legend-dot {
  background: linear-gradient(135deg, #f472b6 0%, #a78bfa 50%, #60a5fa 100%);
}

:global(html.theme-dark) .record-item__status--active {
  color: #5eead4;
}

:global(html.theme-dark) .record-item__status--upcoming {
  color: #93c5fd;
}

@media (max-width: 899px) {
  .page-body {
    padding-bottom: calc(var(--tabbar-height) + env(safe-area-inset-bottom) + 64px);
  }

  .calendar-card__head {
    align-items: flex-start;
    flex-direction: column;
  }

  .calendar-section__toolbar {
    top: 12px;
    right: 12px;
  }

  .calendar-card__legend {
    align-self: flex-start;
  }
}

@media (max-width: 560px) {
  .summary-card,
  .calendar-card {
    padding: 14px;
  }

  .calendar-weekdays,
  .calendar-days {
    gap: 6px;
  }

  .calendar-weekdays {
    margin-top: 14px;
  }

  .calendar-day {
    min-height: 52px;
    padding: 7px;
    border-radius: 14px;
  }

  .calendar-days {
    grid-auto-rows: minmax(52px, auto);
    min-height: calc(52px * 6 + 6px * 5);
  }

  .calendar-day__fill {
    inset: 1px;
    border-radius: 13px;
  }

  .calendar-day__number {
    font-size: 13px;
  }

  .calendar-card__month {
    font-size: 24px;
  }
}
</style>
