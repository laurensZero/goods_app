<template>
  <div class="page detail-page" :class="{ 'detail-page--entry-lock': detailEntryScrollLockActive }">
    <NavBar :title="item ? (item.isWishlist ? '心愿详情' : '收藏详情') : '详情'" show-back @back="handleBackNavigation">
      <template #right>
        <button class="nav-icon-btn" type="button" aria-label="编辑" @click="handleEditGoods">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 20H21" />
            <path d="M16.5 3.5A2.12 2.12 0 0 1 19.5 6.5L8 18L4 19L5 15L16.5 3.5Z" />
          </svg>
        </button>
        <button class="nav-icon-btn" type="button" aria-label="分享" @click="showShareSheet = true">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
            <polyline points="16 6 12 2 8 6" />
            <line x1="12" y1="2" x2="12" y2="15" />
          </svg>
        </button>
        <button class="nav-icon-btn danger" type="button" aria-label="删除" @click="handleDelete">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M3 6H21" />
            <path d="M8 6V4H16V6" />
            <path d="M19 6L18 20H6L5 6" />
            <path d="M10 11V17" />
            <path d="M14 11V17" />
          </svg>
        </button>
      </template>
    </NavBar>

    <main v-if="item" ref="pageBodyRef" class="page-body">
      <section class="detail-shell">
        <section class="cover-stage">
          <div class="cover-glow" />
          <div ref="coverCardRef" class="cover-card" :style="coverCardStyle">
            <img v-if="cachedImgSrc" :src="cachedImgSrc" :alt="item.name" class="cover-img" />
            <div v-else class="cover-fallback">
              <span class="cover-initial">{{ coverInitial }}</span>
            </div>
          </div>
          <div v-if="galleryImages.length > 1" class="cover-gallery">
            <button
              v-for="image in galleryImages"
              :key="image.id"
              type="button"
              :class="['cover-gallery__item', { 'cover-gallery__item--active': image.id === activeImageId }]"
              @click="activeImageId = image.id"
            >
              <img :src="image.uri" :alt="image.label || getImageKindLabel(image.kind)" class="cover-gallery__img" />
              <span class="cover-gallery__meta">{{ image.label || getImageKindLabel(image.kind) }}</span>
            </button>
          </div>
        </section>

        <section class="hero-card">
          <div class="hero-meta">
            <span v-if="item.isWishlist" class="hero-chip wish-chip">心愿单</span>
            <span v-if="item.category" class="hero-chip">{{ item.category }}</span>
            <span v-if="item.ip" class="hero-chip ip-chip">{{ item.ip }}</span>
            <span v-for="ch in item.characters || []" :key="ch" class="hero-chip char-chip">{{ ch }}</span>
            <span v-for="tag in item.tags || []" :key="tag" class="hero-chip tag-chip">#{{ tag }}</span>
            <span v-if="acquiredAtDisplayText" class="hero-date">{{ item.isWishlist ? '计划于' : '购入于' }} {{ acquiredAtDisplayText }}</span>
          </div>

          <h1 class="hero-name">{{ item.name }}</h1>

          <div class="hero-price">
            <span class="price-label">{{ heroPriceLabel }}</span>
            <p class="price-value">
              <span class="price-currency">¥</span>
              <span class="price-amount">{{ heroPriceAmount }}</span>
              <span v-if="showHeroPointsInline" class="price-points">+{{ item.points }}积分</span>
            </p>
            <p v-if="heroPriceHint" class="price-hint">{{ heroPriceHint }}</p>
          </div>

          <button v-if="item.isWishlist" class="hero-action-btn" type="button" @click="markAsOwned">
            标记为已入手
          </button>
        </section>

        <section class="info-section">
          <div class="section-head">
            <p class="section-label">信息卡片</p>
            <h2 class="section-title">收藏信息</h2>
          </div>

          <div class="info-card">
            <article class="info-tile">
              <span class="info-label">分类</span>
              <strong class="info-value">{{ item.category || '未填写' }}</strong>
            </article>

            <article v-if="item.ip" class="info-tile">
              <span class="info-label">IP</span>
              <strong class="info-value">{{ item.ip }}</strong>
            </article>

            <article v-if="item.characters && item.characters.length" class="info-tile">
              <span class="info-label">角色名</span>
              <strong class="info-value">{{ item.characters.join('、') }}</strong>
            </article>

            <article v-if="item.tags && item.tags.length" class="info-tile">
              <span class="info-label">自定义标签</span>
              <strong class="info-value">{{ item.tags.map((tag) => `#${tag}`).join('、') }}</strong>
            </article>

            <article class="info-tile">
              <span class="info-label">{{ item.isWishlist ? '预计入手日期' : '购入日期' }}</span>
              <strong class="info-value">{{ acquiredAtDisplayText }}</strong>
            </article>

            <article v-if="showOfficialPriceTile" class="info-tile">
              <span class="info-label">价格</span>
              <strong class="info-value">{{ officialPriceText }}</strong>
            </article>

            <article v-if="showActualPriceTile" class="info-tile">
              <span class="info-label">入手价</span>
              <strong class="info-value">{{ actualPriceDisplayText }}</strong>
            </article>

            <article v-if="item.storageLocation" class="info-tile">
              <span class="info-label">收纳位置</span>
              <strong class="info-value">{{ item.storageLocation }}</strong>
            </article>

            <article v-if="variantText" class="info-tile">
              <span class="info-label">款式</span>
              <strong class="info-value">{{ variantText }}</strong>
            </article>

            <article v-if="!item.isWishlist && holdingDays !== null" class="info-tile">
              <span class="info-label">持有时长</span>
              <strong class="info-value">{{ holdingDays }} 天</strong>
            </article>

            <article v-if="item.quantity > 1" class="info-tile">
              <span class="info-label">数量</span>
              <strong class="info-value">{{ item.quantity }} 件</strong>
            </article>

          </div>
        </section>

        <section v-if="item.note" class="note-section">
          <div class="section-head section-head--split">
            <div>
              <p class="section-label">附加信息</p>
              <h2 class="section-title">备注</h2>
            </div>
            <button class="section-head__copy" type="button" @click="copyNoteMarkdown">复制 markdown</button>
          </div>

          <article class="note-card">
            <div class="note-body note-body--markdown" v-html="noteHtml" />
          </article>
        </section>

        <section v-if="trackList.length" class="note-section">
          <div class="section-head">
            <p class="section-label">音乐信息</p>
            <h2 class="section-title">专辑曲目</h2>
          </div>

          <EventTrackList :tracks="trackList" />
        </section>
      </section>
    </main>

    <EmptyState
      v-else
      icon="✦"
      title="找不到这件收藏"
      description="它可能已被删除，或者当前数据还没有完成同步。"
    />

    <Transition name="dialog-fade">
      <div v-if="showDeleteDialog" class="dialog-overlay" @click="closeDeleteDialog">
        <div class="dialog-card" @click.stop>
          <div class="dialog-icon">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M3 6H21" />
              <path d="M8 6V4H16V6" />
              <path d="M19 6L18 20H6L5 6" />
              <path d="M10 11V17" />
              <path d="M14 11V17" />
            </svg>
          </div>

          <h2 class="dialog-title">移到回收站？</h2>
          <p class="dialog-desc">{{ item?.name || '该收藏' }} 会先进入回收站，之后仍然可以恢复。</p>

          <div class="dialog-actions">
            <button class="dialog-btn dialog-btn--ghost" type="button" @click="closeDeleteDialog">取消</button>
            <button class="dialog-btn dialog-btn--danger" type="button" @click="confirmDelete">移入回收站</button>
          </div>
        </div>
      </div>
    </Transition>

    <ShareSheet :show="showShareSheet" :goods-items="item ? [item] : []" @close="showShareSheet = false" />
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useGoodsStore } from '@/stores/goods'
import { getCachedImage } from '@/utils/imageCache'
import { formatDate } from '@/utils/format'
import { GOODS_IMAGE_KIND_OPTIONS, getPrimaryGoodsImage, normalizeGoodsImageList } from '@/utils/goodsImages'
import { getGoodsVariant } from '@/utils/goodsIdentity'
import { scrollToTopAnimated } from '@/utils/scrollToTopAnimated'
import { renderMarkdown } from '@/utils/markdown'
import { getPendingDetailReturnPath, getPendingDetailTransitionKind, runWithRouteTransition, setPendingDetailReturnPath, clearPendingDetailTransitionKind } from '@/utils/routeTransition'
import { playGoodsHeroForward, prepareGoodsHeroBack } from '@/utils/nativeGoodsHeroTransition'
import { addAndroidBackButtonListener } from '@/utils/androidBackButton'
import NavBar from '@/components/common/NavBar.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import EventTrackList from '@/components/events/EventTrackList.vue'
import ShareSheet from '@/components/goods/ShareSheet.vue'

const HOME_MODE_STORAGE_KEY = 'goods_home_mode_v1'
const HOME_MODE_EVENT = 'goods-app:home-mode-change'
const COLLECTION_TAB_STORAGE_KEY = 'goods_collection_tab_v1'
const COLLECTION_TAB_EVENT = 'goods-app:collection-tab-change'

const props = defineProps({ id: { type: String, required: true } })
const router = useRouter()
const store = useGoodsStore()
const pageBodyRef = ref(null)
const coverCardRef = ref(null)
let removeAndroidBackListener = null

function waitForNextFrame() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve())
  })
}

function readElementRect(el) {
  if (!el) return null
  const rect = el.getBoundingClientRect()
  if (!Number.isFinite(rect.left) || !Number.isFinite(rect.top) || !Number.isFinite(rect.width) || !Number.isFinite(rect.height)) {
    return null
  }
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height
  }
}

function isRectStable(prevRect, nextRect, tolerance = 0.5) {
  if (!prevRect || !nextRect) return false
  return Math.abs(prevRect.left - nextRect.left) <= tolerance &&
    Math.abs(prevRect.top - nextRect.top) <= tolerance &&
    Math.abs(prevRect.width - nextRect.width) <= tolerance &&
    Math.abs(prevRect.height - nextRect.height) <= tolerance
}

async function waitForStableHeroTarget(el, maxFrames = 6) {
  let previousRect = null
  for (let frame = 0; frame < maxFrames; frame += 1) {
    await waitForNextFrame()
    const currentRect = readElementRect(el)
    if (isRectStable(previousRect, currentRect)) return
    previousRect = currentRect
  }
}

async function playGoodsHeroForwardWhenReady() {
  if (getPendingDetailTransitionKind() === 'detail-fade') return
  await nextTick()
  await waitForStableHeroTarget(coverCardRef.value)
  playGoodsHeroForward(props.id, coverCardRef.value)
}

const item = computed(() => store.getById(props.id))
const trackList = computed(() =>
  (Array.isArray(item.value?.tracks) ? item.value.tracks : []).filter((entry) => entry?.title || entry?.artist || entry?.neteaseSongId)
)
const showDeleteDialog = ref(false)
const showShareSheet = ref(false)
const activeImageId = ref('')

const colorMap = {
  手办: ['#2c2c2e', '#3a3a3c'],
  挂件: ['#1c3a5e', '#2a5298'],
  徽章: ['#3a1c5e', '#6a3d9a'],
  卡片: ['#1c4a3a', '#2e7d5c'],
  'CD/专辑': ['#4a2c1c', '#8b4513'],
  服饰: ['#4a3a1c', '#8b6914'],
  其他: ['#3a3a3a', '#5a5a5a']
}

const coverBg = computed(() => {
  const [from, to] = colorMap[item.value?.category] ?? ['#2c2c2e', '#3a3a3c']
  return `linear-gradient(135deg, ${from}, ${to})`
})
const coverCardStyle = computed(() => {
  const style = {}
  if (!cachedImgSrc.value) {
    style.background = coverBg.value
  }
  return style
})

const galleryImages = computed(() => normalizeGoodsImageList(item.value?.images))
const activeImage = computed(() => (
  galleryImages.value.find((image) => image.id === activeImageId.value)
  || getPrimaryGoodsImage(galleryImages.value)
))
const coverInitial = computed(() => (item.value?.name ?? '?').trim().charAt(0).toUpperCase() || '?')
const variantText = computed(() => getGoodsVariant(item.value))
function hasActualPriceValue(value) {
  return value !== '' && value != null
}

function hasPriceValue(value) {
  return value !== '' && value != null
}

const heroPriceAmount = computed(() => {
  if (!item.value) return '—'
  if (item.value.isWishlist) return hasPriceValue(item.value.price) ? item.value.price : '—'
  if (unitActualPriceAmountText.value) return unitActualPriceAmountText.value
  return hasActualPriceValue(item.value.actualPrice)
    ? item.value.actualPrice
    : (hasPriceValue(item.value.price) ? item.value.price : '—')
})
const heroPriceLabel = computed(() => {
  if (!item.value) return '价格'
  if (unitActualPriceAmountText.value) return '价格'
  if (item.value.isWishlist) return '目标价格'
  return hasActualPriceValue(item.value.actualPrice) ? '入手价' : '价格'
})
const showHeroPointsInline = computed(() => !unitActualPriceAmountText.value && !hasActualPriceValue(item.value?.actualPrice) && !!item.value?.points)
const noteHtml = computed(() => renderMarkdown(item.value?.note || ''))

async function copyNoteMarkdown() {
  const text = String(item.value?.note || '').trim()
  if (!text) return

  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // 在某些环境下剪贴板可能不可用，静默失败
  }
}
const heroPriceHint = computed(() => {
  if (!item.value || item.value.isWishlist) return ''
  if (unitActualPriceAmountText.value) return ''
  const parts = []
  if (hasActualPriceValue(item.value.actualPrice) && hasPriceValue(item.value.price)) {
    parts.push(`价格 ¥${item.value.price}`)
  }
  return parts.join(' ')
})
const officialPriceText = computed(() => {
  if (!hasPriceValue(item.value?.price)) return '未填写'
  return item.value.points ? `¥${item.value.price} +${item.value.points}积分` : `¥${item.value.price}`
})
const showOfficialPriceTile = computed(() => !item.value?.isWishlist && hasPriceValue(item.value?.price))
const unitActualPriceAmountText = computed(() => {
  const quantity = Number(item.value?.quantity) || 1
  if (quantity < 2) return ''

  const list = Array.isArray(item.value?.unitActualPriceList) ? item.value.unitActualPriceList : []
  const normalized = list
    .map((value) => {
      const numeric = Number.parseFloat(String(value || '').trim())
      if (!Number.isFinite(numeric) || numeric < 0) return ''
      return `${Math.round(numeric * 100) / 100}`
    })
    .filter(Boolean)

  if (normalized.length < 2) return ''
  return normalized.join(' / ')
})
const unitActualPriceText = computed(() => {
  if (!unitActualPriceAmountText.value) return ''
  return unitActualPriceAmountText.value.split(' / ').map((value) => `¥${value}`).join(' / ')
})
const actualPriceDisplayText = computed(() => {
  if (unitActualPriceText.value) return unitActualPriceText.value
  if (hasActualPriceValue(item.value?.actualPrice)) return `¥${item.value.actualPrice}`
  return '未填写'
})
const showActualPriceTile = computed(() => !item.value?.isWishlist && (hasActualPriceValue(item.value?.actualPrice) || !!unitActualPriceText.value))
const unitAcquiredAtText = computed(() => {
  const quantity = Number(item.value?.quantity) || 1
  if (quantity < 2) return ''

  const list = Array.isArray(item.value?.unitAcquiredAtList) ? item.value.unitAcquiredAtList : []
  const seen = new Set()
  const deduped = []

  for (const date of list) {
    const normalized = String(date || '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) continue
    if (seen.has(normalized)) continue
    seen.add(normalized)
    deduped.push(normalized)
  }

  if (deduped.length <= 1) return ''

  return deduped.join(' / ')
})
const acquiredAtDisplayText = computed(() => {
  if (!item.value) return '未填写'

  if (!item.value.isWishlist && unitAcquiredAtText.value) {
    return unitAcquiredAtText.value
  }

  return item.value.acquiredAt || '未填写'
})

const cachedImgSrc = ref('')
const DETAIL_SCROLL_LOCK_CLASS = 'detail-route-scroll-lock'
const DETAIL_ENTRY_SCROLL_LOCK_MS = 380
const detailEntryScrollLockActive = ref(false)
let detailEntryScrollLockTimer = 0

function syncDetailScrollLock(active) {
  document.documentElement.classList.toggle(DETAIL_SCROLL_LOCK_CLASS, active)
  document.body.classList.toggle(DETAIL_SCROLL_LOCK_CLASS, active)
}

function clearDetailEntryScrollLockTimer() {
  if (!detailEntryScrollLockTimer) return
  window.clearTimeout(detailEntryScrollLockTimer)
  detailEntryScrollLockTimer = 0
}

function releaseDetailEntryScrollLock() {
  clearDetailEntryScrollLockTimer()
  detailEntryScrollLockActive.value = false
}

function lockDetailEntryScrollLock(duration = DETAIL_ENTRY_SCROLL_LOCK_MS) {
  clearDetailEntryScrollLockTimer()
  detailEntryScrollLockActive.value = true
  if (duration <= 0) {
    releaseDetailEntryScrollLock()
    return
  }
  detailEntryScrollLockTimer = window.setTimeout(() => {
    detailEntryScrollLockTimer = 0
    detailEntryScrollLockActive.value = false
  }, duration)
}

function resetScrollPosition() {
  const pageBody = pageBodyRef.value
  if (!pageBody) return
  pageBody.scrollTop = 0
}

async function prepareDetailLayout() {
  await nextTick()
  resetScrollPosition()
}

watch(
  () => activeImage.value?.uri,
  async (url) => {
    cachedImgSrc.value = url ? await getCachedImage(url) : ''
  },
  { immediate: true }
)

watch(
  () => galleryImages.value,
  (images) => {
    if (images.length === 0) {
      activeImageId.value = ''
      return
    }

    if (images.some((image) => image.id === activeImageId.value)) return
    activeImageId.value = images.find((image) => image.isPrimary)?.id || images[0].id
  },
  { immediate: true, deep: true }
)

const holdingDays = computed(() => {
  const date = item.value?.acquiredAt
  if (!date) return null

  const diff = Date.now() - new Date(date).getTime()
  const days = Math.floor(diff / 86400000)
  return days >= 0 ? days : null
})

function handleDelete() {
  showDeleteDialog.value = true
}

function handleEditGoods() {
  runWithRouteTransition(() => router.push(`/edit/${props.id}`), { direction: 'forward' })
}

function closeDeleteDialog() {
  showDeleteDialog.value = false
}

async function confirmDelete() {
  await store.removeGoods(props.id)
  showDeleteDialog.value = false
  router.back()
}

async function markAsOwned() {
  if (!item.value) return
  await store.updateGoods(props.id, {
    isWishlist: false,
    acquiredAt: item.value.acquiredAt || formatDate(new Date(), 'YYYY-MM-DD')
  })

  const targetPath = '/home'
  syncCollectionContextForPath(targetPath)
  prepareGoodsHeroBack({
    goodsId: props.id,
    sourceEl: coverCardRef.value,
    targetPath
  })

  runWithRouteTransition(() => router.replace(targetPath), { direction: 'back' })
}

function handleBackNavigation() {
  const useFadeTransition = getPendingDetailTransitionKind() === 'detail-fade'
  const returnPath = getPendingDetailReturnPath()
  const currentPath = router.currentRoute.value?.fullPath || ''
  const historyBackPath = window.history?.state?.back || ''
  const fallbackPath = '/home'
  const targetPath = (() => {
    if (returnPath && returnPath !== currentPath) return returnPath
    if (historyBackPath && historyBackPath !== currentPath && !historyBackPath.startsWith('/detail/')) return historyBackPath
    return fallbackPath
  })()
  const shouldUseHistoryBack = historyBackPath === targetPath

  syncCollectionContextForPath(targetPath)

  const navigateBack = shouldUseHistoryBack
    ? () => router.back()
    : () => router.replace(targetPath)

  setPendingDetailReturnPath('')

  if (useFadeTransition) {
    runWithRouteTransition(navigateBack, {
      direction: 'back',
      preferFallback: true,
      detailTransitionKind: 'detail-fade'
    })
    clearPendingDetailTransitionKind()
    return
  }

  prepareGoodsHeroBack({
    goodsId: props.id,
    sourceEl: coverCardRef.value,
    targetPath
  })

  if (shouldUseHistoryBack) {
    router.back()
    return
  }

  router.replace(targetPath)
}

function syncCollectionContextForPath(path) {
  if (typeof window === 'undefined') return

  const normalizedPath = String(path || '')
  const nextCollectionTab = normalizedPath.startsWith('/wishlist')
    ? 'wishlist'
    : normalizedPath.startsWith('/leaderboard')
      ? 'stats'
      : 'goods'

  localStorage.setItem(COLLECTION_TAB_STORAGE_KEY, nextCollectionTab)
  window.dispatchEvent(new CustomEvent(COLLECTION_TAB_EVENT, {
    detail: { tab: nextCollectionTab }
  }))

  if (normalizedPath.startsWith('/home')) {
    localStorage.setItem(HOME_MODE_STORAGE_KEY, 'goods')
    window.dispatchEvent(new CustomEvent(HOME_MODE_EVENT, {
      detail: { mode: 'goods' }
    }))
  }
}

function handleAndroidBackButton(event) {
  event.preventDefault()
  handleBackNavigation()
}

onMounted(async () => {
  syncDetailScrollLock(true)
  lockDetailEntryScrollLock()
  removeAndroidBackListener = addAndroidBackButtonListener(handleAndroidBackButton)
  await prepareDetailLayout()
  await playGoodsHeroForwardWhenReady()
})

onBeforeUnmount(() => {
  releaseDetailEntryScrollLock()
  syncDetailScrollLock(false)
  if (removeAndroidBackListener) {
    removeAndroidBackListener()
    removeAndroidBackListener = null
  }
})

watch(
  () => props.id,
  async () => {
    lockDetailEntryScrollLock()
    activeImageId.value = ''
    await prepareDetailLayout()
    await playGoodsHeroForwardWhenReady()
  }
)

function getImageKindLabel(kind) {
  return GOODS_IMAGE_KIND_OPTIONS.find((option) => option.value === kind)?.label || '图片'
}

</script>

<style scoped>
.detail-page {
  height: 100dvh;
  overflow: hidden;
}

.detail-page .page-body {
  overscroll-behavior-y: contain;
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.detail-page--entry-lock .page-body {
  overflow: hidden;
  overscroll-behavior: none;
  touch-action: none;
}

.detail-page .page-body::-webkit-scrollbar {
  width: 0;
  height: 0;
  display: none;
}

.detail-shell {
  display: flex;
  flex-direction: column;
  gap: var(--section-gap);
  padding: 6px var(--page-padding) 32px;
}

.nav-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--icon-button-size);
  height: var(--icon-button-size);
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.84);
  color: var(--app-text);
  box-shadow: var(--app-shadow);
  transition: transform 0.16s ease, background 0.16s ease;
}

.nav-icon-btn svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.nav-icon-btn:active {
  transform: scale(0.96);
}

.nav-icon-btn.danger {
  color: #c74444;
}

.cover-stage {
  position: relative;
}

.cover-glow {
  position: absolute;
  inset: 20px;
  border-radius: 999px;
  background: rgba(20, 20, 22, 0.05);
  filter: blur(22px);
}

.cover-card {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: var(--radius-large);
  overflow: hidden;
  box-shadow: var(--app-shadow);
  background: linear-gradient(180deg, var(--app-surface-soft), var(--app-surface-muted));
}

.cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cover-fallback {
  display: flex;
  width: 100%;
  height: 100%;
  align-items: center;
  justify-content: center;
}

.cover-initial {
  color: rgba(255, 255, 255, 0.88);
  font-size: 92px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.06em;
}

.cover-gallery {
  display: flex;
  gap: 10px;
  margin-top: 12px;
  overflow-x: auto;
  padding: 4px 2px 2px;
  scrollbar-width: none;
}

.cover-gallery::-webkit-scrollbar {
  display: none;
}

.cover-gallery__item {
  position: relative;
  flex: none;
  width: 84px;
  min-width: 84px;
  max-width: 84px;
  padding: 0;
  border: none;
  border-radius: 18px;
  background: transparent;
  box-shadow: none;
  overflow: hidden;
  text-align: left;
  transition: transform 0.16s ease;
}

.cover-gallery__item--active {
  transform: translateY(-2px);
}

.cover-gallery__item::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 18px;
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
}

.cover-gallery__item--active::before {
  box-shadow:
    inset 0 0 0 2px #141416,
    var(--app-shadow);
}

.cover-gallery__img {
  display: block;
  position: relative;
  z-index: 1;
  width: 84px;
  height: 84px;
  padding: 5px;
  border-radius: 18px;
  object-fit: cover;
}

.cover-gallery__meta {
  position: absolute;
  left: 10px;
  bottom: 10px;
  z-index: 2;
  max-width: calc(100% - 20px);
  padding: 3px 7px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  color: #141416;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hero-card,
.info-card,
.note-card {
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
}

.hero-card {
  padding: 22px;
  border-radius: var(--radius-large);
}

.hero-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.hero-chip {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 0 14px;
  border-radius: 999px;
  background: #141416;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
}

.hero-date,
.hero-name,
.info-label,
.info-value {
  -webkit-user-select: text;
  -moz-user-select: text;
  -ms-user-select: text;
  user-select: text;
}

.hero-chip.ip-chip {
  background: #1c3558;
  color: #8ab4f8;
}

.hero-chip.wish-chip {
  background: #c7375d;
  color: #fff1f4;
}

.hero-chip.char-chip {
  background: #1e3a2f;
  color: #5de2a0;
}

.hero-chip.tag-chip {
  background: #4b315d;
  color: #f1dcff;
}

.hero-date {
  color: var(--app-text-tertiary);
  font-size: 13px;
}

.hero-name {
  margin-top: 14px;
  color: var(--app-text);
  font-size: 22px;
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: -0.03em;
}

.hero-price {
  margin-top: 18px;
}

.hero-action-btn {
  margin-top: 16px;
  min-height: 44px;
  padding: 0 16px;
  border: none;
  border-radius: 14px;
  background: #141416;
  color: #ffffff;
  font-size: 14px;
  font-weight: 600;
  width: fit-content;
}

.price-label {
  color: var(--app-text-tertiary);
  font-size: 13px;
}

.price-value {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-top: 8px;
}

.price-currency {
  color: var(--app-text);
  font-size: 18px;
  font-weight: 600;
}

.price-amount {
  color: var(--app-text);
  font-size: 30px;
  font-weight: 700;
  letter-spacing: -0.04em;
}

.price-points {
  margin-left: 6px;
  color: var(--app-text-tertiary);
  font-size: 15px;
  font-weight: 500;
  align-self: flex-end;
  margin-bottom: 3px;
}

.price-hint {
  margin: 6px 0 0;
  color: var(--app-text-tertiary);
  font-size: 13px;
}

.section-head {
  margin-bottom: 14px;
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

.info-card {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  padding: 12px;
  border-radius: var(--radius-card);
}

.info-tile {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  border-radius: var(--radius-small);
  background: var(--app-surface-soft);
}

.info-label {
  color: var(--app-text-tertiary);
  font-size: 13px;
}

.info-value {
  color: var(--app-text);
  font-size: 16px;
  font-weight: 600;
  line-height: 1.4;
  word-break: break-word;
}

.note-card {
  padding: 18px;
  border-radius: var(--radius-card);
}

.note-body {
  color: var(--app-text-secondary);
  font-size: 16px;
  line-height: 1.7;
  white-space: pre-wrap;
  -webkit-user-select: text;
  -moz-user-select: text;
  -ms-user-select: text;
  user-select: text;
}

.note-body--markdown {
  white-space: normal;
  word-break: break-word;
}

.note-body--markdown :deep(> :first-child) {
  margin-top: 0;
}

.note-body--markdown :deep(> :last-child) {
  margin-bottom: 0;
}

.note-body--markdown :deep(p),
.note-body--markdown :deep(ul),
.note-body--markdown :deep(ol),
.note-body--markdown :deep(blockquote),
.note-body--markdown :deep(pre),
.note-body--markdown :deep(h1),
.note-body--markdown :deep(h2),
.note-body--markdown :deep(h3),
.note-body--markdown :deep(h4),
.note-body--markdown :deep(h5),
.note-body--markdown :deep(h6),
.note-body--markdown :deep(hr) {
  margin: 0 0 12px;
}

.note-body--markdown :deep(h1),
.note-body--markdown :deep(h2),
.note-body--markdown :deep(h3),
.note-body--markdown :deep(h4),
.note-body--markdown :deep(h5),
.note-body--markdown :deep(h6) {
  color: var(--app-text);
  line-height: 1.35;
  font-weight: 700;
}

.note-body--markdown :deep(h1) { font-size: 22px; }
.note-body--markdown :deep(h2) { font-size: 20px; }
.note-body--markdown :deep(h3) { font-size: 18px; }
.note-body--markdown :deep(h4) { font-size: 17px; }
.note-body--markdown :deep(h5),
.note-body--markdown :deep(h6) { font-size: 16px; }

.note-body--markdown :deep(p) {
  white-space: pre-wrap;
}

.note-body--markdown :deep(ul),
.note-body--markdown :deep(ol) {
  padding-left: 22px;
}

.note-body--markdown :deep(ul) {
  list-style: disc;
  list-style-position: outside;
}

.note-body--markdown :deep(ol) {
  list-style: decimal;
  list-style-position: outside;
}

.note-body--markdown :deep(li) {
  display: list-item;
}

.note-body--markdown :deep(li.task-list-item) {
  list-style: none;
}

.note-body--markdown :deep(li + li) {
  margin-top: 6px;
}

.note-body--markdown :deep(blockquote) {
  padding: 10px 14px;
  border-left: 3px solid rgba(20, 20, 22, 0.14);
  border-radius: 0 12px 12px 0;
  background: rgba(20, 20, 22, 0.04);
  color: var(--app-text-secondary);
}

.note-body--markdown :deep(pre) {
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(20, 20, 22, 0.06);
  overflow-x: auto;
}

.note-body--markdown :deep(code) {
  padding: 0.15em 0.35em;
  border-radius: 6px;
  background: rgba(20, 20, 22, 0.08);
  font-size: 0.95em;
}

.note-body--markdown :deep(pre code) {
  padding: 0;
  background: transparent;
}

.note-body--markdown :deep(hr) {
  border: none;
  border-top: 1px solid rgba(20, 20, 22, 0.12);
}

.note-body--markdown :deep(a) {
  color: #2563eb;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(20, 20, 22, 0.22);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.dialog-card {
  width: min(100%, 360px);
  padding: 22px;
  border-radius: 24px;
  background: var(--app-surface);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.12);
}

.dialog-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 14px;
  background: rgba(199, 68, 68, 0.1);
  color: #c74444;
}

.dialog-icon svg {
  width: 20px;
  height: 20px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.dialog-title {
  margin-top: 16px;
  color: var(--app-text);
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.03em;
}

.dialog-desc {
  margin-top: 8px;
  color: var(--app-text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.dialog-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 20px;
}

.dialog-btn {
  height: 48px;
  border: none;
  border-radius: 16px;
  font-size: 15px;
  font-weight: 600;
  transition: transform 0.16s ease, opacity 0.16s ease, background 0.16s ease;
}

.dialog-btn:active {
  transform: scale(0.96);
}

.dialog-btn--ghost {
  background: var(--app-surface-soft);
  color: var(--app-text);
}

.dialog-btn--danger {
  background: #141416;
  color: #ffffff;
}

.dialog-fade-enter-active,
.dialog-fade-leave-active {
  transition: opacity 180ms ease;
}

.dialog-fade-enter-from,
.dialog-fade-leave-to {
  opacity: 0;
}

/* 鈹€鈹€ 骞虫澘 / 澶у睆閫傞厤锛氬乏灏侀潰 + 鍙宠鎯呭弻鏍忓竷灞€ 鈹€鈹€ */
@media (min-width: 900px) {
  .detail-shell {
    display: grid;
    grid-template-columns: clamp(280px, 42%, 480px) 1fr;
    column-gap: 28px;
    padding-top: 24px;
    align-items: start;
  }

  /* 灏侀潰鍥哄畾鍦ㄥ乏鍒楋紝绮樻€у畾浣嶈窡闅忔粴鍔?*/
  .cover-stage {
    grid-column: 1;
    grid-row: 1 / 10;
    position: sticky;
    top: 16px;
  }

  /* 鍙冲垪锛歨ero / info / note 渚濇鍙犳斁 */
  .hero-card,
  .info-section,
  .note-section {
    grid-column: 2;
  }

  /* 淇℃伅鍗℃墿灞曞埌 3 鍒?*/
  .info-card {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

:global(html.theme-dark) .cover-glow {
    background: rgba(255, 255, 255, 0.04);
  }

:global(html.theme-dark) .cover-card {
    background: linear-gradient(180deg, #242428, #1a1a1d);
  }

:global(html.theme-dark) .dialog-btn--ghost {
    background: var(--app-surface-soft);
  }

:global(html.theme-dark) .dialog-btn--danger {
    background: #f5f5f7;
    color: #d32f2f;
  }

:global(html.theme-dark) .hero-chip {
    background: rgba(255, 255, 255, 0.12);
  }

:global(html.theme-dark) .hero-chip.ip-chip {
    background: rgba(74, 122, 236, 0.22);
  }

:global(html.theme-dark) .hero-chip.char-chip {
    background: rgba(93, 226, 160, 0.15);
  }

:global(html.theme-dark) .hero-chip.tag-chip {
    background: rgba(201, 148, 255, 0.18);
    color: #f1dcff;
  }

:global(html.theme-dark) .nav-icon-btn {
    background: var(--app-glass);
  }
</style>
