<template>
  <div class="page recharge-view-page">
    <main ref="pageBodyRef" class="page-body">
      <section v-if="!rechargeSelectionMode" class="hero-section">
        <div class="hero-copy">
          <p class="hero-label">Recharge Archive</p>
          <h1 class="hero-title">{{ t('recharge.rechargeArchive') }}</h1>
        </div>

        <div class="hero-actions">
          <button
            class="hero-search"
            type="button"
            :aria-label="t('recharge.searchAria')"
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
        :active="isRechargeActive"
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
        :aria-label="t('recharge.addRecord')"
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
import { nextTick, onActivated, onDeactivated, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import RechargeContent from '@/components/recharge/RechargeContent.vue'
import ScrollTopButton from '@/components/common/ScrollTopButton.vue'
import { usePageScroll } from '@/composables/scroll'
import { runWithRouteTransition } from '@/utils/routeTransition'
import { scrollToTopAnimated } from '@/utils/scrollToTopAnimated'

defineOptions({ name: 'RechargeView' })

const { t } = useI18n()

const HOME_MODE_STORAGE_KEY = 'goods_home_mode_v1'
const HOME_MODE_EVENT = 'goods-app:home-mode-change'
const SCROLL_TOP_BUTTON_THRESHOLD = 900

const pageBodyRef = ref(null)
const rechargeContentRef = ref(null)
const rechargeSelectionMode = ref(false)
const showScrollTopButton = ref(false)
const isRechargeActive = ref(true)

let mountBootstrapSession = 0

const router = useRouter()

const {
  getScrollEl,
  getScrollSource,
  readScrollTop,
  saveScrollPosition,
  restore: restoreScrollState,
  rememberCurrentScrollPosition,
  clearDisplayedScrollPosition,
  resetStoredScrollOnReload
} = usePageScroll('recharge', pageBodyRef, {
  selector: '.recharge-view-page .page-body',
  onScroll: handlePageScroll,
})

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
  updateScrollTopButtonVisibility()
}

function scrollToTop() {
  scrollToTopAnimated(getScrollEl, 260, () => {
    updateScrollTopButtonVisibility()
    rememberCurrentScrollPosition()
  }, getScrollSource())
}

onMounted(async () => {
  const sessionId = ++mountBootstrapSession
  persistHomeMode('recharge')

  const didResetOnReload = resetStoredScrollOnReload()
  if (sessionId !== mountBootstrapSession) return
  if (didResetOnReload) {
    clearDisplayedScrollPosition()
  }

  await nextTick()
  if (sessionId !== mountBootstrapSession) return

  await restoreScrollState({ ifPending: true, phase: 'mounted' }, {
    syncViewport: (top) => {
      syncVisibleGoodsCount(top)
      syncVisibleTimelineMonthCount(top)
    },
  })
  if (sessionId !== mountBootstrapSession) return
  updateScrollTopButtonVisibility()
})

onActivated(async () => {
  isRechargeActive.value = true
  persistHomeMode('recharge')

  await restoreScrollState({ phase: 'activated' }, {
    syncViewport: (top) => {
      syncVisibleGoodsCount(top)
      syncVisibleTimelineMonthCount(top)
    },
  })
  await nextTick()
  updateScrollTopButtonVisibility()
})

onDeactivated(() => {
  isRechargeActive.value = false
  mountBootstrapSession += 1
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
  font-size: var(--font-body);
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

html.theme-dark .hero-search {
  background: var(--app-glass);
}

html.theme-dark .fab {
  background: var(--app-text);
  color: var(--app-surface);
}
</style>
