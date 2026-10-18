<template>
  <div ref="pageRootRef" class="page profile-page" :style="[HOME_MOTION_CSS_VARS, profileThemeStyle]">
    <main
      ref="pageBodyRef"
      class="page-body profile-body"
      :class="{ 'page-entry': !enteringFromDetail }"
    >
      <ProfileHero
        :title="title"
        :eyebrow="eyebrow"
        :chip-label="chipLabel"
        :chip-clickable="!!chipLabel && isCharacter"
        :item="currentItem"
        :transition="rotationTransition"
        :has-multiple="hasMultiple"
        :low-perf="isLowPerfDevice"
        @back="goBack"
        @open-settings="openBackgroundSheet"
        @next-background="nextBackground"
        @chip-click="openParentIp"
      />

      <section class="profile-stats">
        <div class="profile-cards">
          <article class="stat-card">
            <p class="stat-card__value">
              {{ stats.totalCount }}<span class="stat-card__unit">{{ t('profile.stats.unit') }}</span>
            </p>
            <p class="stat-card__label">{{ t('profile.stats.totalCount') }}</p>
          </article>

          <article class="stat-card">
            <div class="stat-card__value-row">
              <p class="stat-card__value">
                {{ amountHidden ? '¥••••' : `¥${formattedValue}` }}
              </p>
              <button
                class="stat-card__eye"
                type="button"
                :aria-label="amountHidden ? t('profile.toolbar.showAmount') : t('profile.toolbar.hideAmount')"
                @click="toggleAmountHidden"
              >
                <svg v-if="!amountHidden" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M2.75 12C4.6 8.92 7.88 7 12 7s7.4 1.92 9.25 5c-1.85 3.08-5.13 5-9.25 5s-7.4-1.92-9.25-5Z" />
                  <circle cx="12" cy="12" r="2.6" />
                </svg>
                <svg v-else viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M4 4 20 20" />
                  <path d="M9.9 7.28A11.4 11.4 0 0 1 12 7c4.12 0 7.4 1.92 9.25 5a11.8 11.8 0 0 1-3.03 3.33" />
                  <path d="M6.16 9.09A11.53 11.53 0 0 0 2.75 12c1.85 3.08 5.13 5 9.25 5 1.08 0 2.1-.13 3.04-.39" />
                </svg>
              </button>
            </div>
            <p class="stat-card__label">{{ t('profile.stats.totalValue') }}</p>
          </article>
        </div>
      </section>

      <section class="profile-toolbar">
        <div
          class="density-switch"
          :style="densitySwitchStyle"
          :aria-label="t('profile.toolbar.densityAria')"
        >
          <span class="density-switch__indicator" aria-hidden="true" />
          <button
            v-for="mode in densityModes"
            :key="mode.value"
            type="button"
            :class="['density-switch__option', { 'density-switch__option--active': displayDensity === mode.value }]"
            @click="setDisplayDensityWithFlip(mode.value)"
          >
            {{ mode.label }}
          </button>
        </div>

        <button
          type="button"
          :class="[
            'sort-toggle',
            {
              'sort-toggle--asc': showSortAscVisual,
              'sort-toggle--animating': isSortAnimating,
              'sort-toggle--locked': sortDirectionLocked
            }
          ]"
          :aria-label="sortButtonLabel"
          @click="handleSortClick"
          @touchstart.passive="startSortLongPress"
          @touchend="cancelSortLongPress"
          @touchcancel="cancelSortLongPress"
          @mousedown.left="startSortLongPress"
          @mouseup="cancelSortLongPress"
          @mouseleave="cancelSortLongPress"
          @contextmenu.prevent="openSortSheet"
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
      </section>

      <GoodsCardGridSection
        v-if="sortedItems.length > 0"
        ref="gridRef"
        :items="visibleSortedItems"
        :index-offset="visibleGoodsStartIndex"
        :before-spacer-height="visibleGoodsHeadSpacerHeight"
        :after-spacer-height="visibleGoodsTailSpacerHeight"
        :density="displayDensity"
        :grid-style="goodsGridStyle"
        :transitioning="isDensityAnimating"
        :is-sort-animating="isSortAnimating"
        :window-width="windowWidth"
        :low-perf-motion="isLowPerfDevice"
        @open-detail="openDetail"
      />

      <section v-else-if="store.isReady" class="profile-empty">
        <EmptyState
          icon="✦"
          :title="t('profile.empty.title')"
          :description="t('profile.empty.description')"
          :action-text="t('profile.empty.action')"
          @action="goToAdd"
        />
      </section>

      <GoodsListSkeleton v-else />
    </main>

    <ProfileBackgroundSheet
      v-model="showBackgroundSheet"
      :title="sheetTitle"
      :items="editableItems"
      :rotation="editableRotation"
      :theme="editableTheme"
      :show-follow-ip="isCharacter"
      :following-ip="isCharacter && hasCharacterOverride && !!ip"
      :inherit-label="ip"
      @update:items="applyItems"
      @update:rotation="applyRotation"
      @update:theme="applyTheme"
      @follow-ip="followIp"
    />

    <AppSheet v-model="showSortSheet" sheet-class="profile-sort-sheet">
      <p class="sheet-title">{{ t('profile.sortSheet.title') }}</p>
      <div class="profile-sort-options">
        <button
          v-for="option in sortOptions"
          :key="option.value"
          type="button"
          :class="['profile-sort-option', { 'profile-sort-option--active': sortMode === option.value }]"
          @click="selectSortMode(option.value)"
        >
          <span>{{ option.label }}</span>
          <span class="profile-sort-option__meta">
            {{ option.value === 'custom' || sortDirectionLocked
              ? (option.ascLabel || option.descLabel)
              : (sortDirection === 'asc' ? option.ascLabel : option.descLabel) }}
          </span>
        </button>
      </div>
      <button class="sheet-cancel" type="button" @click="showSortSheet = false">{{ t('common.cancel') }}</button>
    </AppSheet>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useGoodsStore } from '@/stores/goods'
import { usePresetsStore } from '@/stores/presets'
import { useCollectionProfileStore } from '@/stores/collectionProfile'
import { useHomePreferences } from '@/composables/home/useHomePreferences'
import { useDensityGridViewport } from '@/composables/home/useDensityGridViewport'
import { useGoodsGridDensityFlip } from '@/composables/home/useGoodsGridDensityFlip'
import { HOME_MOTION_CSS_VARS } from '@/constants/homeMotion'
import { buildReverseGoodsSortIds } from '@/stores/goods/goodsOrder'
import { useProfileBackground } from '@/composables/profile/useProfileBackground'
import { useVirtualGridMetrics } from '@/composables/goods/useVirtualGridMetrics'
import { createPageScrollRestore, usePageScrollBinder } from '@/composables/scroll'
import { useGoodsBackHero } from '@/composables/goods/useGoodsBackHero'
import { hasPendingGoodsHeroBack, isGoodsHeroAnimating, prepareGoodsHeroForward } from '@/utils/platform/nativeGoodsHeroTransition'
import { showGlobalToast } from '@/utils/globalToast'
import { useDialogBackButton } from '@/composables/useDialogBackButton'
import ProfileHero from '@/components/profile/ProfileHero.vue'
import ProfileBackgroundSheet from '@/components/profile/ProfileBackgroundSheet.vue'
import GoodsCardGridSection from '@/components/goods/GoodsCardGridSection.vue'
import GoodsListSkeleton from '@/components/common/GoodsListSkeleton.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import AppSheet from '@/components/common/AppSheet.vue'
import { createHomeSortOptions, isHomeSortDirectionLocked, sortHomeGoodsList } from '@/utils/goods/homeSort'
import { resolveCharacterFilterShare } from '@/utils/goods/characterShare'
import {
  DEFAULT_PROFILE_THEME,
  accentContrastColor,
  collectProfileSetLocalPaths,
  normalizeProfileTheme,
  resolveProfileAccent
} from '@/utils/profile/collectionProfile'
import { formatCompactNumber } from '@/utils/format'
import { clearPendingDetailTransitionKind, runWithRouteTransition, setPendingDetailReturnPath } from '@/utils/routeTransition'

const AMOUNT_HIDDEN_KEY = 'goods-app:profile-amount-hidden'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const store = useGoodsStore()
const presets = usePresetsStore()
const profileStore = useCollectionProfileStore()

const pageRootRef = ref(null)
const pageBodyRef = ref(null)

// 从商品详情返回时，hero 共享元素回退动画已经在演，内容块不再叠一层进场动画。
// 必须在 setup 期同步取（onMounted 里 tryPlayNativeGoodsBackHero 会把 pending 标记消费掉）
const enteringFromDetail = hasPendingGoodsHeroBack(route.fullPath)

const isCharacter = computed(() => route.name === 'character-profile')
const characterName = computed(() => String(route.params.charName || '').trim())
const ipName = computed(() => String(route.params.ipName || '').trim())
// 角色名可能在不同 IP 下重名，入口可用 ?ip= 显式带上所属 IP。
// null = 未指定（回退按名字查第一个），'' = 明确「无 IP」。
const characterIpQuery = computed(() => (route.query.ip === undefined ? null : String(route.query.ip || '').trim()))

const ip = computed(() => {
  if (!isCharacter.value) return ipName.value
  if (characterIpQuery.value !== null) return characterIpQuery.value
  return String(presets.characters.find((item) => item.name === characterName.value)?.ip || '').trim()
})

const title = computed(() => (isCharacter.value ? characterName.value : ipName.value))
const eyebrow = computed(() => (isCharacter.value ? t('profile.eyebrow.character') : t('profile.eyebrow.ip')))
const chipLabel = computed(() => (isCharacter.value && ip.value ? ip.value : ''))

/* ── 商品集合与统计 ── */

const matchedItems = computed(() => {
  // 必须用 view 列表：视图层条目才带 totalValueNumber / acquiredTime，
  // 原始行没有这些字段，会导致金额恒为 0、按价格/入手时间排序无变化
  const list = store.collectionViewList
  if (isCharacter.value) {
    const name = characterName.value
    if (!name) return []
    // 显式指定 IP 时按 (ip, name) 精确匹配（同名角色分属不同 IP 时才不会互相串数据）；
    // 未指定时维持旧的按名字匹配。
    const scopedIp = characterIpQuery.value
    return list.filter((item) => (
      Array.isArray(item.characters)
      && item.characters.includes(name)
      && (scopedIp === null || String(item.ip || '').trim() === scopedIp)
    ))
  }
  const target = ipName.value
  if (!target) return []
  return list.filter((item) => String(item.ip || '').trim() === target)
})

const stats = computed(() => {
  const characterFilters = isCharacter.value && characterName.value ? [characterName.value] : []
  let totalCount = 0
  let totalValue = 0

  for (const item of matchedItems.value) {
    const share = resolveCharacterFilterShare(item, characterFilters)
    totalCount += share.units
    totalValue += share.value
  }

  return { totalCount, totalValue }
})

const formattedValue = computed(() => formatCompactNumber(stats.value.totalValue))

const amountHidden = ref(false)

function toggleAmountHidden() {
  amountHidden.value = !amountHidden.value
  try {
    localStorage.setItem(AMOUNT_HIDDEN_KEY, amountHidden.value ? '1' : '0')
  } catch {}
}

/* ── 排序 / 密度 ── */

const windowWidth = ref(typeof window === 'undefined' ? 390 : window.innerWidth)

function onResize() {
  windowWidth.value = window.innerWidth
}

const {
  densityModes,
  displayDensity,
  sortDirection,
  sortMode,
  isDensityAnimating,
  isSortAnimating,
  getResponsiveCols,
  setDisplayDensity,
  toggleSortDirection,
  triggerSortAnimation,
  setSortMode
} = useHomePreferences(windowWidth, {
  storageKeys: {
    displayMode: 'goods-app:profile-display-mode',
    gridDensity: 'goods-app:profile-grid-density',
    sortDirection: 'goods-app:profile-sort-direction',
    sortMode: 'goods-app:profile-sort-mode',
    groupDisplayMode: 'goods-app:profile-group-display-mode'
  },
  allowTimeline: false,
  t
})

const sortOptions = computed(() => createHomeSortOptions(t))
const sortDirectionLocked = computed(() => isHomeSortDirectionLocked(sortMode.value))
const currentSortLabel = computed(() => (
  sortOptions.value.find((option) => option.value === sortMode.value)?.label || t('profile.toolbar.sortAria')
))

const sortedItems = computed(() => sortHomeGoodsList(matchedItems.value, sortMode.value, sortDirection.value))

const goodsGridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${getResponsiveCols(displayDensity.value)}, minmax(0, 1fr))`
}))

const isLowPerfDevice = typeof navigator !== 'undefined' && (
  (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4)
  || (navigator.deviceMemory && navigator.deviceMemory <= 4)
)

/* 密度切换：滑块的位移交给 CSS 变量，卡片位移交给密度 FLIP（与主页 / 收藏页同一套） */
const densitySwitchStyle = computed(() => ({
  '--density-switch-count': Math.max(densityModes.value.length, 1),
  '--density-switch-index': Math.max(0, densityModes.value.findIndex((mode) => mode.value === displayDensity.value))
}))

const ROW_HEIGHT_MAP = {
  comfortable: 308,
  standard: 272,
  compact: 236
}

function getGoodsListEl() {
  const grid = gridRef.value
  if (!grid) return null
  return grid.goodsListEl?.value || grid.goodsListEl || grid.$el || null
}

const {
  getDensityScrollTop,
  getFlipViewportHeight,
  getFlipViewportRect,
  getContainerScrollOffset
} = useDensityGridViewport({
  getScrollEl: () => pageBodyRef.value
})

const densityFlip = useGoodsGridDensityFlip({
  getContainer: () => getGoodsListEl(),
  getDisplayDensity: () => displayDensity.value,
  getResponsiveCols,
  rowHeightMap: ROW_HEIGHT_MAP,
  getDensityScrollTop,
  getFlipViewportHeight,
  getFlipViewportRect,
  getContainerScrollOffset,
  isLowPerfDevice,
  getItemCount: () => sortedItems.value.length
})

function setDisplayDensityWithFlip(mode) {
  if (displayDensity.value === mode) return
  const captured = densityFlip.capture()
  setDisplayDensity(mode)
  if (captured) densityFlip.animate()
}

/* ── 网格虚拟化：与主页 / 收藏页同一套窗口化渲染 ──
   收藏馆可能一次命中成百上千件，全量渲染会让滚动 / 密度切换明显掉帧，
   这里只渲染视口附近的行，其余用首尾 spacer 撑住滚动高度。 */

/* 滚动记忆 + 滚动来源标记：虚拟化窗口和共享元素回退动画都靠它读当前滚动位置
   （收藏馆不在 keepAlive 列表里，从详情返回是重新挂载） */
const {
  getScrollEl,
  markScrollSource,
  readScrollTop,
  saveScrollPosition,
  restorePendingScrollPosition
} = createPageScrollRestore('profile')(pageBodyRef)

const INITIAL_RENDER_ROWS = 6
const GOODS_GRID_ROW_GAP = 12
const GOODS_GRID_OVERSCAN_ROWS = 4
const GOODS_GRID_OVERSCAN_ROWS_WIDE = 3
const TABLET_BREAKPOINT = 900
// 按密度模式和设备类型设置不同的最大渲染卡片数
// 手机端（<900px）列数少，可以加载更少；平板端（≥900px）列数多，需要更多
const GOODS_GRID_MAX_RENDER_CARDS_MAP = {
  comfortable: { mobile: 40, tablet: 56 },  // 手机2-3列，平板4-5列，行高320
  standard: { mobile: 54, tablet: 72 },     // 手机3-4列，平板5-6列，行高284
  compact: { mobile: 64, tablet: 80 }       // 手机4-5列，平板6-8列，行高248
}

function getMaxRenderCards(density) {
  const config = GOODS_GRID_MAX_RENDER_CARDS_MAP[density] || { mobile: 54, tablet: 72 }
  return windowWidth.value >= TABLET_BREAKPOINT ? config.tablet : config.mobile
}

function getInitialVisibleCount() {
  return Math.max(getResponsiveCols(displayDensity.value) * INITIAL_RENDER_ROWS, 24)
}

const visibleGoodsStartIndex = ref(0)
const visibleGoodsRenderCount = ref(getInitialVisibleCount())
const shouldVirtualizeGoodsList = computed(() => sortedItems.value.length > getMaxRenderCards(displayDensity.value))
const visibleGoodsEndIndex = computed(() =>
  shouldVirtualizeGoodsList.value
    ? Math.min(sortedItems.value.length, visibleGoodsStartIndex.value + visibleGoodsRenderCount.value)
    : sortedItems.value.length
)

const visibleSortedItems = computed(() =>
  shouldVirtualizeGoodsList.value
    ? sortedItems.value.slice(visibleGoodsStartIndex.value, visibleGoodsEndIndex.value)
    : sortedItems.value
)

const gridMetrics = useVirtualGridMetrics({
  getGridEl: () => getGoodsListEl(),
  getCols: () => getResponsiveCols(displayDensity.value),
  getDensity: () => displayDensity.value,
  fallbackRowHeightMap: ROW_HEIGHT_MAP,
  fallbackRowGap: GOODS_GRID_ROW_GAP
})

function resolveGoodsViewportHeight(options = {}) {
  const { useFlipViewport = false, viewportHeight = 0 } = options
  if (Number.isFinite(viewportHeight) && viewportHeight > 0) return viewportHeight
  return useFlipViewport
    ? getFlipViewportHeight()
    : (pageBodyRef.value?.clientHeight || window.innerHeight || 800)
}

function syncVirtualGoodsViewport(scrollTop = 0, options = {}) {
  if (!shouldVirtualizeGoodsList.value) {
    visibleGoodsStartIndex.value = 0
    visibleGoodsRenderCount.value = sortedItems.value.length
    return
  }

  const normalizedTop = Math.max(0, Number(scrollTop) || 0)
  const viewportHeight = resolveGoodsViewportHeight(options)
  const cols = getResponsiveCols(displayDensity.value)
  const rowSpan = gridMetrics.getRowSpan()
  const overscanRows = cols >= 5 ? GOODS_GRID_OVERSCAN_ROWS_WIDE : GOODS_GRID_OVERSCAN_ROWS
  const maxRenderCards = getMaxRenderCards(displayDensity.value)
  const viewportRows = Math.max(1, Math.ceil(Math.max(viewportHeight, rowSpan) / rowSpan))
  const totalItems = sortedItems.value.length
  const totalRows = Math.ceil(totalItems / cols)
  // 滚动位置越过列表末尾（回弹、恢复时数据变短等）时钳制到最后一行，避免渲染空窗口
  const startRow = Math.min(
    Math.max(0, gridMetrics.rowAtOffset(normalizedTop) - overscanRows),
    Math.max(0, totalRows - 1)
  )
  const renderRows = Math.max(INITIAL_RENDER_ROWS, viewportRows + overscanRows * 2)
  const startIndex = Math.min(totalItems, startRow * cols)
  const remainingItems = Math.max(0, totalItems - startIndex)
  const renderCount = Math.min(
    remainingItems,
    Math.min(
      maxRenderCards,
      Math.max(cols * 4, renderRows * cols)
    )
  )

  visibleGoodsStartIndex.value = startIndex
  visibleGoodsRenderCount.value = renderCount
}

const visibleGoodsHeadSpacerHeight = computed(() => {
  if (!shouldVirtualizeGoodsList.value) return 0
  const cols = getResponsiveCols(displayDensity.value)
  return gridMetrics.headSpacerHeight(Math.floor(visibleGoodsStartIndex.value / cols))
})

const visibleGoodsTailSpacerHeight = computed(() => {
  if (!shouldVirtualizeGoodsList.value) return 0
  const remainingItems = Math.max(0, sortedItems.value.length - visibleGoodsEndIndex.value)
  if (!remainingItems) return 0
  const cols = getResponsiveCols(displayDensity.value)
  return gridMetrics.tailSpacerHeight(Math.ceil(remainingItems / cols))
})

let pageScrollRaf = 0

function handlePageScroll() {
  if (isGoodsHeroAnimating()) return
  if (pageScrollRaf) return
  pageScrollRaf = window.requestAnimationFrame(() => {
    pageScrollRaf = 0
    // 回退动画期间换渲染窗口会把正在飞的卡片从 DOM 里摘掉
    if (isGoodsHeroAnimating()) return
    syncVirtualGoodsViewport(readScrollTop())
  })
}

const { bindPageScroll, unbindPageScroll } = usePageScrollBinder({ getScrollEl, markScrollSource, handlePageScroll })

watch(
  [() => sortedItems.value.length, displayDensity, sortDirection, sortMode, windowWidth],
  () => {
    syncVirtualGoodsViewport(readScrollTop(), { useFlipViewport: true })
    gridMetrics.scheduleMeasure()
  },
  { immediate: true }
)

// 实测行高落地后按真实行距重算渲染窗口（spacer computed 会随之重新求值）
watch(gridMetrics.metricsVersion, () => {
  syncVirtualGoodsViewport(readScrollTop(), { useFlipViewport: true })
})

/* 排序按钮：点按切方向，长按（或右键）挑排序方式 —— 与主页 / 收藏页完全一致 */
const LONG_PRESS_DELAY_MS = 420
const customVisualAsc = ref(true)
const showSortAscVisual = computed(() => (
  sortDirectionLocked.value ? customVisualAsc.value : sortDirection.value === 'asc'
))
const sortButtonLabel = computed(() => {
  const directionLabel = sortDirectionLocked.value
    ? t('home.sort.customClickReverse')
    : (sortDirection.value === 'asc' ? t('profile.toolbar.asc') : t('profile.toolbar.desc'))
  return `${currentSortLabel.value} · ${directionLabel}`
})

let sortLongPressTimer = 0
let suppressNextSortClick = false

function clearSortLongPressTimer() {
  if (!sortLongPressTimer) return
  window.clearTimeout(sortLongPressTimer)
  sortLongPressTimer = 0
}

function openSortSheet() {
  clearSortLongPressTimer()
  suppressNextSortClick = true
  showSortSheet.value = true
}

function startSortLongPress() {
  clearSortLongPressTimer()
  sortLongPressTimer = window.setTimeout(() => {
    sortLongPressTimer = 0
    openSortSheet()
  }, LONG_PRESS_DELAY_MS)
}

function cancelSortLongPress() {
  clearSortLongPressTimer()
}

async function reverseCustomSortOrder() {
  const displayIds = sortedItems.value
    .filter((item) => item && item._type !== 'group' && item.id)
    .map((item) => String(item.id))
  const ids = buildReverseGoodsSortIds(store.list, false, displayIds, 'custom')
  if (ids.length < 2) return
  triggerSortAnimation()
  try {
    await store.reorderGoods(ids, 'custom')
  } catch (e) {
    console.error('[profile] reverse custom sort failed:', e)
  }
}

async function handleSortClick() {
  if (suppressNextSortClick) {
    suppressNextSortClick = false
    return
  }
  if (sortDirectionLocked.value) {
    // 自定义：点按 = 纯反向，并对调加深的上下箭头
    customVisualAsc.value = !customVisualAsc.value
    await reverseCustomSortOrder()
    return
  }
  toggleSortDirection()
}

/* ── 背景 ── */

const resolved = computed(() => profileStore.resolve({ ip: ip.value, character: isCharacter.value ? characterName.value : '' }))

const pageActive = ref(true)

function onVisibilityChange() {
  pageActive.value = document.visibilityState === 'visible'
}

const { currentItem, hasMultiple, next: nextBackground } = useProfileBackground({
  resolvedRef: resolved,
  isActive: pageActive
})

const rotationTransition = computed(() => resolved.value?.set?.rotation?.transition || 'fade')

/* ── 主题色：深浅永远跟 App，强调色按各收藏馆自己的设置 ── */
const profileTheme = computed(() => resolved.value?.set?.theme || DEFAULT_PROFILE_THEME)
const profileAccent = computed(() => resolveProfileAccent(profileTheme.value, currentItem.value))
const profileThemeStyle = computed(() => ({
  '--profile-accent': profileAccent.value || 'var(--app-primary)',
  '--profile-accent-contrast': profileAccent.value
    ? accentContrastColor(profileAccent.value)
    : 'var(--app-surface)'
}))

const hasCharacterOverride = computed(() => (
  isCharacter.value && profileStore.hasCharacterProfile(ip.value, characterName.value)
))

/* ── 背景编辑 ── */

const showBackgroundSheet = ref(false)
const editableItems = ref([])
const editableRotation = ref({ mode: 'visit', intervalSec: 8, order: 'seq', transition: 'fade' })
const editableTheme = ref(normalizeProfileTheme())

const sheetTitle = computed(() => (
  isCharacter.value && ip.value
    ? `${title.value} · ${ip.value}`
    : title.value
))

function openBackgroundSheet() {
  editableItems.value = (resolved.value?.set?.items || []).map((item) => ({ ...item }))
  editableRotation.value = { ...(resolved.value?.set?.rotation || { mode: 'visit', intervalSec: 8, order: 'seq', transition: 'fade' }) }
  editableTheme.value = normalizeProfileTheme(resolved.value?.set?.theme)
  showBackgroundSheet.value = true
}

function writeSet(set, options = {}) {
  if (isCharacter.value) {
    profileStore.writeCharacterProfile(ip.value, characterName.value, set, options)
  } else {
    profileStore.writeIpProfile(ipName.value, set, options)
  }
}

function applyItems(nextItems) {
  const previous = editableItems.value
  const nextPaths = new Set(collectProfileSetLocalPaths({ items: nextItems }))
  const removed = collectProfileSetLocalPaths({ items: previous })
    .filter((localPath) => !nextPaths.has(localPath))
  if (removed.length > 0) void profileStore.deleteFiles(removed)

  editableItems.value = nextItems
  // 导入中的临时预览条目用 blob: 地址，仅先显示、不标同步脏：
  // 等压缩/落盘完成替换成真实文件地址后再触发后台推送，避免把原图抢占上传。
  const hasPendingPreview = nextItems.some((item) => String(item?.uri || '').startsWith('blob:'))
  writeSet(
    { items: nextItems, rotation: editableRotation.value, theme: editableTheme.value },
    { silent: hasPendingPreview }
  )
}

function applyRotation(nextRotation) {
  editableRotation.value = nextRotation
  writeSet({ items: editableItems.value, rotation: nextRotation, theme: editableTheme.value })
}

function applyTheme(nextTheme) {
  const normalized = normalizeProfileTheme(nextTheme)
  editableTheme.value = normalized
  writeSet({ items: editableItems.value, rotation: editableRotation.value, theme: normalized })
}

function followIp() {
  void profileStore.clearCharacterProfile(ip.value, characterName.value)
  showBackgroundSheet.value = false
  showGlobalToast(t('profile.background.followedIp'))
}

/* ── 导航 ── */

/* 从详情返回时把卡片从详情封面飞回原位（滚动记忆在网格虚拟化一节里建立）。 */
const {
  tryPlayNativeGoodsBackHero,
  scheduleGoodsBackHeroRetry,
  cancelGoodsBackHeroRetry,
  clearDeferredRestoreTimer
} = useGoodsBackHero({
  getScrollEl: () => pageBodyRef.value,
  rootRef: pageRootRef,
  maxRetryFrames: 40
})

function goBack() {
  // 深链 / 冷启动直接落在收藏馆时没有上一条历史，router.back() 会原地不动（连退出动画都没有），
  // 与 main.js 的安卓返回键同一套兜底：没有历史就 replace 回主页。
  const historyBack = router.options.history.state?.back
  if (historyBack == null) {
    runWithRouteTransition(() => router.replace('/home'), { direction: 'back' })
    return
  }
  runWithRouteTransition(() => router.back(), { direction: 'back' })
}

function openParentIp() {
  if (!ip.value) return
  runWithRouteTransition(
    () => router.push({ name: 'ip-profile', params: { ipName: ip.value } }),
    { direction: 'forward' }
  )
}

let lastDetailNavigationTime = 0

function openDetail(payload) {
  const now = Date.now()
  if (now - lastDetailNavigationTime < 320) return

  const id = typeof payload === 'object' && payload !== null ? payload.id : payload
  if (!id) return
  lastDetailNavigationTime = now

  const sourceEl = typeof payload === 'object' && payload !== null ? payload.sourceEl : null
  saveScrollPosition(true, `profile:openDetail:${id}`)
  clearPendingDetailTransitionKind()
  setPendingDetailReturnPath(route.fullPath)
  prepareGoodsHeroForward({ goodsId: id, sourceEl: sourceEl || null })
  void router.push(`/detail/${id}`)
}

function goToAdd() {
  void router.push('/add')
}

function selectSortMode(mode) {
  if (mode === 'custom') customVisualAsc.value = sortDirection.value === 'asc'
  setSortMode(mode)
  showSortSheet.value = false
}

const showSortSheet = ref(false)
const gridRef = ref(null)

useDialogBackButton(() => { showSortSheet.value = false }, () => showSortSheet.value)

onMounted(async () => {
  window.addEventListener('resize', onResize)
  document.addEventListener('visibilitychange', onVisibilityChange)
  bindPageScroll()
  try {
    amountHidden.value = localStorage.getItem(AMOUNT_HIDDEN_KEY) === '1'
  } catch {}

  void profileStore.init()

  await nextTick()
  // 从详情返回：先把渲染窗口滚到目标行（否则卡片不在 DOM 里），
  // 再归位滚动，最后播共享元素回退动画
  await restorePendingScrollPosition(syncVirtualGoodsViewport, () => {})
  await nextTick()
  if (!tryPlayNativeGoodsBackHero() && hasPendingGoodsHeroBack(route.fullPath)) {
    scheduleGoodsBackHeroRetry()
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  unbindPageScroll()
  if (pageScrollRaf) {
    window.cancelAnimationFrame(pageScrollRaf)
    pageScrollRaf = 0
  }
  gridMetrics.cancelMeasure()
  cancelGoodsBackHeroRetry()
  clearDeferredRestoreTimer()
  clearSortLongPressTimer()
})
</script>

<style scoped>
.profile-page {
  position: relative;
  /* 宽屏超过这个宽度后不再拉伸，hero 文案 / 统计 / 工具条 / 网格共用同一条中轴线 */
  --profile-content-max: 1120px;
  --profile-gutter: max(var(--page-padding), calc((100% - var(--profile-content-max)) / 2));
  /* 每个收藏馆独立的主题色（由 ProfileView 绑定覆盖）；深浅色仍由 App 主题决定 */
  --profile-accent: var(--app-primary);
  --profile-accent-contrast: var(--app-surface);
  background:
    radial-gradient(120% 300px at 50% 0%, color-mix(in srgb, var(--profile-accent) 14%, transparent), transparent 72%),
    var(--app-bg-gradient);
}

.profile-body {
  padding-bottom: calc(30px + env(safe-area-inset-bottom));
}

.profile-stats {
  padding: 16px var(--profile-gutter, var(--page-padding)) 4px;
}

.profile-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.stat-card {
  padding: 18px 14px;
  border-radius: var(--radius-card);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
  text-align: center;
}

/* 金额数值和眼睛按钮用 center 对齐：baseline 会把图标压到文字基线上，看着偏高 */
.stat-card__value-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.stat-card__value {
  margin: 0;
  font-size: 26px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--app-text);
}

.stat-card__unit {
  margin-left: 3px;
  font-size: 13px;
  font-weight: 600;
  color: var(--app-text-secondary);
}

.stat-card__label {
  margin: 6px 0 0;
  font-size: 12.5px;
  color: var(--app-text-secondary);
}

.stat-card__eye {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: none;
  color: var(--app-text-secondary);
}

.stat-card__eye svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 1.9;
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.profile-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px var(--profile-gutter, var(--page-padding)) 12px;
}

/* ── 密度开关 / 排序按钮：与 HomeGoodsToolbar 完全同一套尺寸、配色与动效 ── */

.density-switch {
  flex: 1;
  min-width: 0;
  position: relative;
  display: grid;
  grid-template-columns: repeat(var(--density-switch-count, 3), minmax(0, 1fr));
  gap: var(--density-switch-gap, 6px);
  padding: var(--density-switch-pad, 6px);
  --density-switch-gap: 6px;
  --density-switch-pad: 6px;
  --density-switch-height: 36px;
  --density-switch-duration: calc(var(--home-motion-density-duration) + 80ms);
  --density-switch-count: 3;
  --density-switch-index: 0;
  border-radius: 18px;
  background: var(--app-glass);
  box-shadow: var(--app-shadow);
}

.density-switch__option {
  min-width: 0;
  position: relative;
  z-index: 1;
  height: var(--density-switch-height, 36px);
  /* 手机上和排序按钮同排，横向留白比主页略紧，保证英文标签不换行 */
  padding: 0 8px;
  white-space: nowrap;
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

.density-switch__option--active {
  color: var(--profile-accent-contrast, #ffffff);
}

.density-switch__option:active {
  transform: scale(0.96);
}

.density-switch__indicator {
  position: absolute;
  top: var(--density-switch-pad, 6px);
  left: var(--density-switch-pad, 6px);
  height: var(--density-switch-height, 36px);
  width: calc(
    (100% - (var(--density-switch-gap, 6px) * (var(--density-switch-count, 3) - 1)) - (var(--density-switch-pad, 6px) * 2))
    / var(--density-switch-count, 3)
  );
  border-radius: 14px;
  background: var(--profile-accent, #141416);
  transform: translateX(calc((100% + var(--density-switch-gap, 6px)) * var(--density-switch-index, 0)));
  transition:
    transform var(--density-switch-duration) var(--home-motion-ease-emphasis),
    background var(--home-motion-density-duration) var(--home-motion-ease-standard),
    box-shadow var(--home-motion-density-duration) var(--home-motion-ease-standard);
  box-shadow: 0 6px 14px rgba(20, 20, 22, 0.12);
  will-change: transform;
  pointer-events: none;
  z-index: 0;
}

.sort-toggle {
  display: inline-flex;
  flex-shrink: 0;
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

.sort-toggle__icon {
  width: 18px;
  height: 18px;
  overflow: visible;
  transform-origin: center;
  color: var(--app-text-secondary);
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.sort-toggle__group {
  opacity: 0.54;
  transition:
    opacity 180ms ease,
    color 180ms ease;
}

.sort-toggle__group path {
  stroke: currentColor;
  transition: stroke-width 180ms ease, stroke 180ms ease;
}

.sort-toggle__group--up path {
  stroke-width: 2.15;
}

.sort-toggle__group--down path {
  stroke-width: 2.65;
}

.sort-toggle--asc .sort-toggle__group--up {
  opacity: 1;
  color: var(--profile-accent, var(--app-text-secondary));
}

.sort-toggle--asc .sort-toggle__group--down {
  opacity: 0.54;
}

.sort-toggle:not(.sort-toggle--asc) .sort-toggle__group--up {
  opacity: 0.54;
}

.sort-toggle:not(.sort-toggle--asc) .sort-toggle__group--down {
  opacity: 1;
  color: var(--profile-accent, var(--app-text-secondary));
}

.sort-toggle--asc .sort-toggle__group--up path {
  stroke-width: 2.65;
}

.sort-toggle--asc .sort-toggle__group--down path {
  stroke-width: 2.15;
}

.sort-toggle:active {
  transform: scale(0.96);
}

.sort-toggle--animating {
  animation: sort-toggle-pulse var(--home-motion-sort-duration) var(--home-motion-ease-emphasis);
}

.sort-toggle--animating .sort-toggle__icon {
  animation: sort-toggle-icon-pulse 220ms var(--home-motion-ease-emphasis);
}

@keyframes sort-toggle-pulse {
  0% {
    transform: scale(1);
    box-shadow: var(--app-shadow);
  }

  45% {
    transform: scale(1.08);
    box-shadow: 0 12px 28px rgba(20, 20, 22, 0.16);
  }

  100% {
    transform: scale(1);
    box-shadow: var(--app-shadow);
  }
}

@keyframes sort-toggle-icon-pulse {
  0% {
    transform: scale(0.92);
  }

  55% {
    transform: scale(1.08);
  }

  100% {
    transform: scale(1);
  }
}

html.theme-dark .density-switch__indicator {
  background: var(--profile-accent, #f5f5f7);
}

html.theme-dark .density-switch__option--active {
  color: var(--profile-accent-contrast, #141416);
}

@media (prefers-reduced-motion: reduce) {
  .density-switch__indicator,
  .density-switch__option {
    transition-duration: 0ms;
  }
}

.profile-empty {
  padding: 40px var(--profile-gutter, var(--page-padding));
}

/* GoodsCardGridSection 的根节点：与 HomeView / WishlistView 保持同样的边距约定 */
.goods-section {
  padding: 0 var(--profile-gutter, var(--page-padding));
  margin-top: var(--section-gap);
}

.profile-sort-options {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
}

.sheet-title {
  margin: 0 0 12px;
  font-size: 15px;
  font-weight: 700;
  color: var(--app-text);
}

.sheet-cancel {
  width: 100%;
  padding: 13px 14px;
  border: none;
  border-radius: var(--radius-small);
  background: var(--app-surface-soft);
  color: var(--app-text);
  font-size: 14px;
  font-weight: 600;
}.profile-sort-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 14px;
  border: 1px solid transparent;
  border-radius: var(--radius-small);
  background: var(--app-surface-soft);
  color: var(--app-text);
  font-size: 14px;
  font-weight: 600;
}

.profile-sort-option--active {
  border-color: var(--app-primary);
}

.profile-sort-option__meta {
  font-size: 12px;
  font-weight: 500;
  color: var(--app-text-secondary);
}

/* ── 平板 / 宽屏：统计区两张数据卡随内容宽度铺开，网格随内容宽度收边 ── */
@media (min-width: 900px) {
  .profile-stats {
    padding-top: 22px;
    padding-bottom: 8px;
  }

  .profile-cards {
    gap: 14px;
  }

  .stat-card {
    padding: 24px 18px;
  }

  .stat-card__value {
    font-size: 32px;
  }

  .stat-card__unit {
    font-size: 14px;
  }

  .stat-card__label {
    margin-top: 8px;
    font-size: 13px;
  }

  .stat-card__eye {
    width: 30px;
    height: 30px;
  }

  .stat-card__eye svg {
    width: 20px;
    height: 20px;
  }

  .profile-toolbar {
    padding-top: 18px;
    padding-bottom: 14px;
  }

  .density-switch {
    flex: 0 1 520px;
  }

  .density-switch__option {
    padding: 0 16px;
    font-size: 13.5px;
  }

  .sort-toggle {
    margin-left: auto;
  }

  .profile-empty {
    padding: 64px var(--profile-gutter, var(--page-padding));
  }

  .profile-body {
    padding-bottom: calc(48px + env(safe-area-inset-bottom));
  }
}
</style>
