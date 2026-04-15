<template>
  <div class="page recharge-view-page">
    <main ref="pageBodyRef" class="page-body">
      <section v-if="!rechargeSelectionMode" class="hero-section">
        <div class="hero-copy">
          <p class="hero-label">Recharge Archive</p>
          <h1 class="hero-title">充值库</h1>
        </div>

        <div class="hero-actions">
          <button
            class="hero-search"
            type="button"
            aria-label="搜索"
            @click="handleHeroSearch"
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20L16.65 16.65" />
            </svg>
          </button>
        </div>
      </section>

      <RechargeContent
        ref="rechargeContentRef"
        @selection-change="handleRechargeSelectionChange"
        @open-month-card="openMonthCardCalendar"
      />
    </main>

    <Teleport to="body">
      <ScrollTopButton
        :show="showScrollTopButton && isRechargeActive && !rechargeSelectionMode"
        @click="scrollToTop"
      />
      <button
        v-if="isRechargeActive && !rechargeSelectionMode"
        class="fab"
        type="button"
        aria-label="添加充值记录"
        @click="openRechargeAdd"
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 5V19" />
          <path d="M5 12H19" />
        </svg>
      </button>
    </Teleport>
  </div>
</template>

<script setup>
import { nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import RechargeContent from '@/components/recharge/RechargeContent.vue'
import ScrollTopButton from '@/components/common/ScrollTopButton.vue'
import { useRechargeScrollRestore } from '@/composables/scroll/useRechargeScrollRestore'
import { runWithRouteTransition } from '@/utils/routeTransition'
import { scrollToTopAnimated } from '@/utils/scrollToTopAnimated'

defineOptions({ name: 'RechargeView' })

const HOME_MODE_STORAGE_KEY = 'goods_home_mode_v1'
const HOME_MODE_EVENT = 'goods-app:home-mode-change'
const SCROLL_TOP_BUTTON_THRESHOLD = 900

const pageBodyRef = ref(null)
const rechargeContentRef = ref(null)
const rechargeSelectionMode = ref(false)
const showScrollTopButton = ref(false)
const isRechargeActive = ref(true)

let pageScrollBound = false
let pageScrollRaf = 0
let elementScrollHandler = null
let windowScrollHandler = null
let isRouteLeaving = false
let mountBootstrapSession = 0

const router = useRouter()
const route = useRoute()

const {
  getScrollEl,
  getActiveScrollSource,
  markScrollSource,
  readScrollTop,
  getStoredScrollState,
  hasPendingRestore,
  saveScrollPosition,
  restorePendingScrollPosition,
  restoreActivatedScrollPosition,
  rememberCurrentScrollPosition,
  clearDisplayedScrollPosition,
  resetStoredScrollOnReload,
  cancelPendingRestore
} = useRechargeScrollRestore(pageBodyRef)

function persistHomeMode(mode) {
  const normalizedMode = mode === 'recharge' ? 'recharge' : 'goods'
  localStorage.setItem(HOME_MODE_STORAGE_KEY, normalizedMode)
  window.dispatchEvent(new CustomEvent(HOME_MODE_EVENT, {
    detail: { mode: normalizedMode }
  }))
}

function syncVisibleGoodsCount() {}
function syncVisibleTimelineMonthCount() {}

function handleRechargeSelectionChange(active) {
  rechargeSelectionMode.value = Boolean(active)
}

function handleHeroSearch() {
  rechargeContentRef.value?.toggleSearch?.()
}

function openRechargeAdd() {
  rechargeContentRef.value?.openAddMethodSheet?.()
}

function openMonthCardCalendar() {
  saveScrollPosition(true, 'recharge:openMonthCardCalendar')
  runWithRouteTransition(
    () => router.push('/recharge/month-cards'),
    { direction: 'forward' }
  )
}

function updateScrollTopButtonVisibility() {
  showScrollTopButton.value = readScrollTop() >= SCROLL_TOP_BUTTON_THRESHOLD
}

function handlePageScroll() {
  if (isRouteLeaving) return
  if (pageScrollRaf) return
  pageScrollRaf = window.requestAnimationFrame(() => {
    pageScrollRaf = 0
    if (isRouteLeaving) return
    rememberCurrentScrollPosition()
    updateScrollTopButtonVisibility()
  })
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

function scrollToTop() {
  scrollToTopAnimated(getScrollEl, 260, () => {
    updateScrollTopButtonVisibility()
    rememberCurrentScrollPosition()
  }, getActiveScrollSource())
}

onMounted(async () => {
  isRouteLeaving = false
  const sessionId = ++mountBootstrapSession
  persistHomeMode('recharge')

  const didResetOnReload = resetStoredScrollOnReload()
  if (sessionId !== mountBootstrapSession) return
  if (didResetOnReload) {
    clearDisplayedScrollPosition()
  }

  await nextTick()
  if (sessionId !== mountBootstrapSession) return

  bindPageScroll()
  const pendingState = getStoredScrollState()
  if (pendingState?.source) {
    markScrollSource(pendingState.source)
  }
  await restorePendingScrollPosition(syncVisibleGoodsCount, syncVisibleTimelineMonthCount)
  if (sessionId !== mountBootstrapSession) return
  updateScrollTopButtonVisibility()
})

onActivated(async () => {
  isRouteLeaving = false
  isRechargeActive.value = true
  persistHomeMode('recharge')

  const storedState = getStoredScrollState()
  if (storedState?.source) {
    markScrollSource(storedState.source)
  }
  await restoreActivatedScrollPosition(syncVisibleGoodsCount, syncVisibleTimelineMonthCount)
  await nextTick()
  bindPageScroll()
  updateScrollTopButtonVisibility()
})

onDeactivated(() => {
  isRechargeActive.value = false
  mountBootstrapSession += 1
  cancelPendingRestore()
  if (!hasPendingRestore() && !isRouteLeaving) {
    rememberCurrentScrollPosition()
  }
  unbindPageScroll()
})

onBeforeUnmount(() => {
  cancelPendingRestore()
  if (pageScrollRaf) {
    window.cancelAnimationFrame(pageScrollRaf)
    pageScrollRaf = 0
  }
  unbindPageScroll()
  if (!hasPendingRestore() && !isRouteLeaving) {
    rememberCurrentScrollPosition()
  }
})

onBeforeRouteLeave(() => {
  isRouteLeaving = true
  saveScrollPosition(false, `recharge:onBeforeRouteLeave:${route.fullPath}`)
  if (pageScrollRaf) {
    window.cancelAnimationFrame(pageScrollRaf)
    pageScrollRaf = 0
  }
  unbindPageScroll()
})
</script>

<style scoped>
.recharge-view-page {
  position: relative;
  background: var(--app-bg-gradient);
}

.page-body {
  padding-top: calc(env(safe-area-inset-top) + 20px);
}

.hero-section {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding: 0 var(--page-padding);
}

.hero-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex: 1;
  min-width: 0;
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

.hero-title {
  margin-top: 4px;
  color: var(--app-text);
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.04em;
}

.hero-search {
  width: var(--icon-button-size);
  height: var(--icon-button-size);
  border: none;
  border-radius: 50%;
  background: var(--app-glass);
  box-shadow: var(--app-shadow);
  color: var(--app-text);
  flex-shrink: 0;
  transition: transform 0.16s ease, background 0.16s ease;
  display: flex;
  align-items: center;
  justify-content: center;
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
  background: var(--app-text);
  color: var(--app-surface);
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

:global(html.theme-dark) .hero-search {
  background: var(--app-glass);
}

:global(html.theme-dark) .fab {
  background: var(--app-text);
  color: var(--app-surface);
}
</style>
