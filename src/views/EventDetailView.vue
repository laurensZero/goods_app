<template>
  <div
    v-if="event"
    class="page event-detail-page"
    :class="{
      'event-detail-page--entry-lock': detailEntryScrollLockActive
    }"
  >
    <NavBar :title="event.name || t('events.detail.eventDetail')" show-back @back="handleBackNavigation">
      <template #right>
        <button class="nav-icon-btn" type="button" :aria-label="t('events.detail.editEvent')" @click="handleEditEvent">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5Z" />
          </svg>
        </button>
        <button class="nav-icon-btn danger" type="button" :aria-label="t('events.detail.deleteEvent')" @click="showDeleteDialog = true">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M3 6H21" />
            <path d="M8 6V4H16V6" />
            <path d="M19 6L18 20H6L5 6" />
          </svg>
        </button>
      </template>
    </NavBar>

    <main ref="pageBodyRef" class="page-body">
      <section class="detail-shell">
        <aside class="media-column">
          <section class="cover-stage">
            <div
              ref="coverCardRef"
              class="cover-card"
              :class="{ 'cover-card--empty': !event.coverImage }"
              :data-event-hero-id="String(eventId || '')"
              :style="coverCardStyle"
            >
              <LazyCachedImage
                v-if="event.coverImage"
                :src="event.coverImage"
                :alt="event.name"
                :lazy="false"
                loading="eager"
                fetchpriority="high"
                resume-decode-validation
                :skeleton-enabled="false"
                :class="['event-cover-media', { 'event-cover-media--hero-hidden': !coverMediaVisible } ]"
                :image-attrs="{ class: 'cover-card__img' }"
              />
              <div v-else class="cover-card__fallback">{{ coverFallback }}</div>
            </div>

            <div v-if="event.photos?.length" class="gallery-card">
              <EventPhotoGrid :photos="event.photos" :suspend="!galleryReady" @preview="openPhotoPreview" />
            </div>
          </section>
        </aside>

        <section class="content-column">
          <section class="hero-card">
            <div class="hero-card__meta">
              <span class="hero-chip" :class="typeChipClass">{{ typeLabel }}</span>
              <span v-if="event.tags?.length" class="hero-chip hero-chip--tag">{{ event.tags[0] }}</span>
              <span v-if="event.location" class="hero-date">{{ event.location }}</span>
              <span v-if="event.startDate" class="hero-date">{{ dateDisplay }}</span>
            </div>

            <h1 class="hero-title">{{ event.name }}</h1>

            <div v-if="hasTicketPrice" class="hero-price">
              <span class="hero-price__label">{{ t('events.detail.ticketing') }}</span>
              <p class="hero-price__value">
                <span class="hero-price__currency">¥</span>
                <span class="hero-price__amount">{{ ticketPriceAmount }}</span>
              </p>
            </div>
          </section>

          <section v-if="infoItems.length > 0" class="info-section">
            <div class="section-head">
              <p class="section-label">{{ t('events.detail.infoCards') }}</p>
              <h2 class="section-title">{{ t('events.detail.eventInfo') }}</h2>
            </div>

            <div class="info-card">
              <article v-for="item in infoItems" :key="item.label" class="info-tile">
                <span class="info-label">{{ item.label }}</span>
                <strong class="info-value">{{ item.value }}</strong>
              </article>
            </div>
          </section>

          <section v-if="event.description" class="note-section">
            <div class="section-head">
              <p class="section-label">{{ t('events.detail.additionalInfo') }}</p>
              <h2 class="section-title">{{ t('events.detail.notes') }}</h2>
            </div>

            <article class="note-card">
              <div class="note-body note-body--markdown" v-html="eventDescriptionHtml" />
            </article>
          </section>

          <section v-if="showExpenseSection" class="expense-section">
            <div class="section-head">
              <p class="section-label">{{ t('events.detail.expenses') }}</p>
              <h2 class="section-title">{{ t('events.detail.otherExpenses') }}</h2>
            </div>

            <article class="expense-card">
              <div class="expense-card__summary">
                <span>{{ t('events.detail.total') }}</span>
                <strong>¥{{ Math.round(expenseSectionTotalAmount * 100) / 100 }}</strong>
              </div>

              <div class="expense-list">
                <div v-if="linkedGoodsTotalPrice > 0" class="expense-row">
                  <div class="expense-row__copy">
                    <strong>{{ t('events.detail.goodsCost') }}</strong>
                  </div>
                  <span class="expense-row__amount">¥{{ Math.round(linkedGoodsTotalPrice * 100) / 100 }}</span>
                </div>
                <div v-for="expense in otherExpenseItems" :key="expense.id" class="expense-row">
                  <div class="expense-row__copy">
                    <strong>{{ expense.name }}</strong>
                  </div>
                  <span class="expense-row__amount">¥{{ Math.round((Number.parseFloat(expense.amount) || 0) * 100) / 100 }}</span>
                </div>
              </div>
            </article>
          </section>

          <section v-if="trackList.length > 0" class="track-section">
            <div class="section-head section-head--toggle">
              <div>
                <p class="section-label">Setlist</p>
                <h2 class="section-title">{{ t('events.detail.concertSetlist') }}</h2>
              </div>
              <button
                type="button"
                class="section-toggle-btn"
                :aria-expanded="trackSectionExpanded ? 'true' : 'false'"
                @click="trackSectionExpanded = !trackSectionExpanded"
              >
                <span>{{ trackSectionExpanded ? t('events.detail.collapse') : t('events.detail.expand') }}</span>
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" :class="{ 'section-toggle-btn__icon--expanded': trackSectionExpanded }">
                  <path d="M6 9L12 15L18 9" />
                </svg>
              </button>
            </div>

            <article v-show="trackSectionExpanded" class="note-card">
              <EventTrackList :tracks="trackList" />
            </article>
          </section>

          <section v-if="linkedGoodsList.length > 0" class="linked-section">
            <div class="section-head">
              <p class="section-label">Linked Goods</p>
              <h2 class="section-title">{{ t('events.detail.linkedGoods') }}</h2>
            </div>

            <div class="linked-goods-grid">
              <a
                v-for="goods in linkedGoodsList"
                :key="goods.id"
                href="#"
                class="linked-goods-card"
                role="link"
                :data-linked-goods-id="String(goods.id || '')"
                @click.prevent="openLinkedGoodsDetail(goods, $event)"
              >
                <div class="linked-goods-card__media" :data-goods-hero-id="String(goods.id || '')">
                  <LazyCachedImage
                    v-if="goods.coverImage"
                    :src="goods.coverImage"
                    :alt="goods.name"
                    :lazy="true"
                    resume-decode-validation
                    root-margin="220px 0px"
                    :skeleton-delay-ms="120"
                    class="linked-goods-card__img"
                  />
                  <div v-else class="linked-goods-card__placeholder">{{ goods.name?.trim()?.charAt(0) || t('goods.heroFallbackGoods') }}</div>
                </div>
                <span class="linked-goods-card__name">{{ goods.name }}</span>
              </a>
            </div>
          </section>
        </section>
      </section>
    </main>

    <Transition name="sheet-pop">
      <div v-if="showDeleteDialog" class="dialog-overlay" @click.self="showDeleteDialog = false">
        <div class="dialog-card">
          <h3 class="dialog-title">{{ t('events.detail.deleteDialog.title') }}</h3>
          <p class="dialog-message">{{ t('events.detail.deleteDialog.message', { name: event.name }) }}</p>
          <div class="dialog-actions">
            <button class="dialog-btn" type="button" @click="showDeleteDialog = false">{{ t('events.detail.deleteDialog.cancel') }}</button>
            <button class="dialog-btn danger" type="button" @click="handleDelete">{{ t('events.detail.deleteDialog.confirm') }}</button>
          </div>
        </div>
      </div>
    </Transition>

    <Transition name="photo-preview">
      <div v-if="previewPhoto" class="photo-preview-overlay">
        <div
          ref="previewStageRef"
          class="photo-preview__stage"
          @touchstart="onPreviewTouchStart"
          @touchmove="onPreviewTouchMove"
          @touchend="onPreviewTouchEnd"
          @touchcancel="onPreviewTouchEnd"
          @click="onPreviewStageClick"
          @dblclick="onPreviewDblClick"
        >
          <div class="photo-preview__zoom" :style="previewZoomStyle">
            <div class="photo-preview__track" :style="photoTrackStyle">
              <div class="photo-preview__cell">
                <LazyCachedImage
                  v-if="prevPhoto"
                  :src="prevPhoto.uri"
                  :alt="prevPhoto.caption || t('events.photoAlt', { index: previewPhotoIndex })"
                  :lazy="false"
                  loading="eager"
                  fetchpriority="low"
                  :image-attrs="{ class: 'photo-preview__img' }"
                />
              </div>
              <div class="photo-preview__cell">
                <LazyCachedImage
                  v-if="previewPhoto && previewPhoto.uri"
                  :key="previewPhoto.uri"
                  :src="previewPhoto.uri"
                  :alt="previewPhoto.caption || t('events.photoAlt', { index: previewPhotoIndex + 1 })"
                  :lazy="false"
                  loading="eager"
                  fetchpriority="high"
                  resume-decode-validation
                  :image-attrs="{ class: 'photo-preview__img' }"
                />
              </div>
              <div class="photo-preview__cell">
                <LazyCachedImage
                  v-if="nextPhoto"
                  :src="nextPhoto.uri"
                  :alt="nextPhoto.caption || t('events.photoAlt', { index: previewPhotoIndex + 2 })"
                  :lazy="false"
                  loading="eager"
                  fetchpriority="low"
                  :image-attrs="{ class: 'photo-preview__img' }"
                />
              </div>
            </div>
          </div>
        </div>
        <button
          v-if="canGoPrevPhoto"
          class="photo-preview__nav photo-preview__nav--prev"
          type="button"
          @click.stop="showPrevPhoto"
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 18L9 12L15 6" />
          </svg>
        </button>
        <button
          v-if="canGoNextPhoto"
          class="photo-preview__nav photo-preview__nav--next"
          type="button"
          @click.stop="showNextPhoto"
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M9 6L15 12L9 18" />
          </svg>
        </button>
        <button class="photo-preview__close" type="button" @click.stop="closePhotoPreview">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M18 6L6 18" />
            <path d="M6 6L18 18" />
          </svg>
        </button>
      </div>
    </Transition>
  </div>

  <div v-else class="page event-detail-page">
    <NavBar :title="t('events.detail.eventDetail')" show-back />
    <main class="page-body">
      <section class="empty-wrap">
        <EmptyState
          icon="✨"
          :title="t('events.detail.notFound')"
          :description="t('events.detail.notFoundDesc')"
          :action-text="t('events.detail.backToList')"
          @action="router.push('/events')"
        />
      </section>
    </main>
  </div>
</template>

<script setup>
import { computed, nextTick, onActivated, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { useEventsStore } from '@/stores/events'
import { useGoodsStore } from '@/stores/goods'
import EmptyState from '@/components/common/EmptyState.vue'
import NavBar from '@/components/common/NavBar.vue'
import LazyCachedImage from '@/components/image/LazyCachedImage.vue'
import { clearRouteTransitionFallback, getPendingDetailReturnPath, runWithRouteTransition, setPendingDetailReturnPath } from '@/utils/routeTransition'
import { hasPendingEventHeroForward, hasPendingGoodsHeroBack, playEventHeroForward, playGoodsHeroBack, prepareEventHeroBack, prepareGoodsHeroForward, getHeroBackDurationMs } from '@/utils/platform/nativeGoodsHeroTransition'
import { addAndroidBackButtonListener } from '@/utils/platform/androidBackButton'
import { getCachedImage, preloadImages } from '@/utils/image/cache'
import { resolvePhotoThumbUrl } from '@/utils/image/thumbUrl'
import { renderMarkdown } from '@/utils/markdown'

defineOptions({ name: 'EventDetailView' })

const EVENT_DETAIL_STATE_PREFIX = 'event-detail-state-v1'
const EVENT_DETAIL_PENDING_PREFIX = 'event-detail-pending-v1'
const EVENT_DETAIL_TRACK_KEY_PREFIX = 'event-detail-track-expanded-v1'
const EVENT_DETAIL_ENTRY_SCROLL_LOCK_MS = 380

const props = defineProps({
  id: { type: String, default: '' }
})

const router = useRouter()
const route = useRoute()
const eventsStore = useEventsStore()
const goodsStore = useGoodsStore()
const { t } = useI18n()
const pageBodyRef = ref(null)
const coverCardRef = ref(null)
const eventDisplayReady = ref(true)
const coverMediaVisible = ref(false)
const galleryReady = ref(false)
const detailEntryScrollLockActive = ref(false)
let detailEntryScrollLockTimer = 0
let galleryReadyTimer = 0

const showDeleteDialog = ref(false)
const previewPhotoIndex = ref(-1)
const previewStageRef = ref(null)
const previewZoom = reactive({ scale: 1, x: 0, y: 0 })
const previewSwipeX = ref(0)
const pzAnimating = ref(false)
const trackSectionExpanded = ref(true)
let removeAndroidBackListener = null

const PREVIEW_MAX_SCALE = 4
const PREVIEW_DOUBLE_TAP_SCALE = 2.5
const PREVIEW_DOUBLE_TAP_GAP_MS = 300
const PREVIEW_BLANK_TAP_TOLERANCE_PX = 10
// 未放大时左右滑动切换图片的触发阈值（占屏宽比例）
const PREVIEW_SWIPE_RATIO = 0.18
// 画廊揭示最多等照片缓存这么久，超时兜底放行（避免个别图片失败导致画廊永远不出现）
const GALLERY_READY_MAX_WAIT_MS = 1500
let pzGesture = null
let pzStart = null
let pzTapMoved = false
let pzLastTap = { time: 0, x: 0, y: 0 }
let pzLastTouchEndAt = 0
let pzPendingBlankClose = null
let pzAnimatingTimer = 0
let eventPhotosPreloadPromise = Promise.resolve()

function waitForNextFrame() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve())
  })
}

function isEventHeroTargetReady(el) {
  if (!el) return false
  const imageRoot = el.querySelector?.('[data-lazy-image-ready]') || null
  if (!imageRoot) return true
  return imageRoot.getAttribute('data-lazy-image-ready') === 'true'
}

async function playEventHeroForwardWhenReady() {
  // 没有待播放的 hero 时直接跳过，避免空等 12 帧导致封面图迟迟不显示。
  if (!hasPendingEventHeroForward(eventId.value)) return false
  await nextTick()
  const targetEl = coverCardRef.value
  if (!targetEl) return false

  const targetReadyNeeded = !!event.value?.coverImage
  for (let frame = 0; frame < 12; frame += 1) {
    if (!targetReadyNeeded || isEventHeroTargetReady(targetEl)) {
      const heroPromise = await playEventHeroForward(eventId.value, targetEl)
      if (heroPromise) {
        await heroPromise
        tryPlayLinkedGoodsBackHero()
        return true
      }
      // 播放调用已消费 pending 快照，继续空转只会推迟封面显示
      return false
    }
    await waitForNextFrame()
  }

  return false
}

const eventId = computed(() => props.id || route.params.id)
const event = computed(() => eventsStore.getById(eventId.value))
const eventDescriptionHtml = ref('')
watch(() => event.value?.description || '', async (description) => {
  eventDescriptionHtml.value = description ? await renderMarkdown(description) : ''
}, { immediate: true })
const eventStateKey = computed(() => `${EVENT_DETAIL_STATE_PREFIX}:${String(eventId.value || '')}`)
const eventPendingKey = computed(() => `${EVENT_DETAIL_PENDING_PREFIX}:${String(eventId.value || '')}`)
const eventTrackKey = computed(() => `${EVENT_DETAIL_TRACK_KEY_PREFIX}:${String(eventId.value || '')}`)

const TYPE_MAP = computed(() => ({
  exhibition: { label: t('events.typeExhibition'), cls: 'type-exhibition' },
  concert: { label: t('events.typeConcert'), cls: 'type-concert' },
  other: { label: t('events.typeOther'), cls: 'type-other' }
}))

const typeInfo = computed(() => TYPE_MAP.value[event.value?.type] || TYPE_MAP.value.other)
const typeLabel = computed(() => typeInfo.value.label)
const typeChipClass = computed(() => typeInfo.value.cls)
const coverFallback = computed(() => event.value?.name?.trim()?.charAt(0) || t('goods.heroFallbackEvent'))
const coverCardStyle = computed(() => ({}))
const dateDisplay = computed(() => {
  if (!event.value?.startDate) return t('common.unfilled')
  if (!event.value.endDate || event.value.endDate === event.value.startDate) return event.value.startDate
  return `${event.value.startDate} - ${event.value.endDate}`
})
const linkedGoodsList = computed(() =>
  (event.value?.linkedGoodsIds || []).map((id) => goodsStore.getById(id)).filter(Boolean)
)
const linkedGoodsImageUrls = computed(() => (
  linkedGoodsList.value.map((goods) => String(goods?.coverImage || '').trim()).filter(Boolean)
))
const eventPhotoUris = computed(() => (
  (Array.isArray(event.value?.photos) ? event.value.photos : [])
    .map((photo) => String(photo?.uri || '').trim())
    .filter(Boolean)
))
const trackList = computed(() =>
  (Array.isArray(event.value?.tracks) ? event.value.tracks : []).filter((item) => item?.title || item?.artist || item?.neteaseSongId || item?.qqSongId)
)
const tagsDisplay = computed(() => (
  event.value?.tags?.length ? event.value.tags.join('、') : t('common.unfilled')
))
const hasTicketPrice = computed(() => String(event.value?.ticketPrice || '').trim() !== '')
const ticketPriceAmount = computed(() => {
  const value = Number.parseFloat(String(event.value?.ticketPrice || '').trim())
  return Number.isFinite(value) ? String(Math.round(value * 100) / 100) : '0'
})
const otherExpenseItems = computed(() => (
  Array.isArray(event.value?.otherExpenses)
    ? event.value.otherExpenses
      .map((item, index) => ({
        id: String(item?.id || `expense_${index}`),
        name: String(item?.name || '').trim(),
        amount: String(item?.amount || '').trim()
      }))
      .filter((item) => item.name || item.amount)
    : []
))
const otherExpenseTotalAmount = computed(() => (
  otherExpenseItems.value.reduce((sum, item) => sum + (Number.parseFloat(item.amount) || 0), 0)
))
const linkedGoodsTotalPrice = computed(() =>
  linkedGoodsList.value.reduce((sum, item) => {
    const unitActualSum = (Array.isArray(item?.unitActualPriceList) ? item.unitActualPriceList : [])
      .reduce((acc, value) => acc + (Number.parseFloat(String(value || '').trim()) || 0), 0)
    if (unitActualSum > 0) return sum + unitActualSum
    if (item?.actualPrice !== '' && item?.actualPrice != null) {
      return sum + (Number.parseFloat(String(item.actualPrice).trim()) || 0)
    }
    const quantity = Math.max(1, Number(item?.quantity) || 1)
    return sum + ((Number.parseFloat(String(item?.price || '').trim()) || 0) * quantity)
  }, 0)
)
const showExpenseSection = computed(() => otherExpenseItems.value.length > 0 || linkedGoodsTotalPrice.value > 0)
const expenseSectionTotalAmount = computed(() => otherExpenseTotalAmount.value + linkedGoodsTotalPrice.value)

function clearDetailEntryScrollLockTimer() {
  if (!detailEntryScrollLockTimer) return
  window.clearTimeout(detailEntryScrollLockTimer)
  detailEntryScrollLockTimer = 0
}

function clearGalleryReadyTimer() {
  if (!galleryReadyTimer) return
  window.clearTimeout(galleryReadyTimer)
  galleryReadyTimer = 0
}

// 等照片进入内存缓存后再揭示画廊（上限 GALLERY_READY_MAX_WAIT_MS），
// 避免网格挂载时缓存未就绪出现整片灰色骨架
async function revealGalleryWhenPhotosReady(delayMs = 140) {
  clearGalleryReadyTimer()
  galleryReady.value = false
  const startedAt = Date.now()
  try {
    await Promise.race([
      eventPhotosPreloadPromise,
      new Promise((resolve) => window.setTimeout(resolve, GALLERY_READY_MAX_WAIT_MS))
    ])
  } catch {
    // 预加载失败也照常揭示，网格内 LazyCachedImage 自行兜底
  }
  const remaining = Math.max(0, Number(delayMs) || 0) - (Date.now() - startedAt)
  if (remaining > 0) {
    galleryReadyTimer = window.setTimeout(() => {
      galleryReadyTimer = 0
      galleryReady.value = true
    }, remaining)
    return
  }
  galleryReadyTimer = 0
  galleryReady.value = true
}

function releaseDetailEntryScrollLock() {
  clearDetailEntryScrollLockTimer()
  detailEntryScrollLockActive.value = false
}

function lockDetailEntryScrollLock(duration = EVENT_DETAIL_ENTRY_SCROLL_LOCK_MS) {
  clearDetailEntryScrollLockTimer()
  detailEntryScrollLockActive.value = true
  detailEntryScrollLockTimer = window.setTimeout(() => {
    detailEntryScrollLockTimer = 0
    detailEntryScrollLockActive.value = false
  }, Math.max(0, duration))
}

function getStoredViewState() {
  const raw = sessionStorage.getItem(eventStateKey.value)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return {
      top: Number(parsed.top) || 0
    }
  } catch {
    return null
  }
}

function getStoredTrackState() {
  const raw = localStorage.getItem(eventTrackKey.value)
  if (raw == null) return true
  return raw !== '0'
}

function saveViewState() {
  sessionStorage.setItem(
    eventStateKey.value,
    JSON.stringify({
      top: Number(pageBodyRef.value?.scrollTop || 0)
    })
  )
}

function clearViewState() {
  sessionStorage.removeItem(eventStateKey.value)
  sessionStorage.removeItem(eventPendingKey.value)
}

async function restoreViewState() {
  await nextTick()
  const storedState = getStoredViewState()
  const shouldRestore = sessionStorage.getItem(eventPendingKey.value) === '1'
  trackSectionExpanded.value = getStoredTrackState()

  if (!storedState || !shouldRestore) {
    if (pageBodyRef.value) {
      pageBodyRef.value.scrollTop = 0
    }
    clearViewState()
    return
  }

  await nextTick()
  await new Promise((resolve) => window.requestAnimationFrame(resolve))
  if (pageBodyRef.value) {
    pageBodyRef.value.scrollTop = storedState.top
  }
  sessionStorage.removeItem(eventPendingKey.value)
}

const infoItems = computed(() => {
  if (!event.value) return []

  const items = []
  if (event.value.type) {
    items.push({ label: t('events.detail.eventType'), value: typeLabel.value })
  }
  if (event.value.startDate) {
    items.push({ label: t('events.detail.startDate'), value: event.value.startDate })
  }
  if (event.value.endDate && event.value.endDate !== event.value.startDate) {
    items.push({ label: t('events.detail.endDate'), value: event.value.endDate })
  }
  if (event.value.location) {
    items.push({ label: t('events.detail.eventLocation'), value: event.value.location })
  }
  if (hasTicketPrice.value) {
    items.push({ label: t('events.detail.ticketPrice'), value: `¥${ticketPriceAmount.value}` })
  }
  if (showExpenseSection.value) {
    items.push({ label: t('events.detail.otherExpensesLabel'), value: `¥${Math.round(expenseSectionTotalAmount.value * 100) / 100}` })
  }
  if (event.value.type === 'exhibition' && String(event.value.ticketType || '').trim()) {
    items.push({ label: t('events.detail.ticketType'), value: String(event.value.ticketType || '').trim() })
  }
  if (event.value.type === 'concert' && String(event.value.seatInfo || '').trim()) {
    items.push({ label: t('events.detail.seat'), value: String(event.value.seatInfo || '').trim() })
  }
  if (Array.isArray(event.value.photos) && event.value.photos.length > 0) {
    items.push({ label: t('events.detail.eventPhotos'), value: `${event.value.photos.length} ${t('common.images_count')}` })
  }
  if (trackList.value.length > 0) {
    items.push({ label: t('events.detail.tracks'), value: `${trackList.value.length} ${t('common.tracksUnit')}` })
  }
  if (linkedGoodsList.value.length > 0) {
    items.push({ label: t('events.detail.linkedGoodsCount'), value: `${linkedGoodsList.value.length} ${t('common.items')}` })
  }
  if (event.value.tags?.length) {
    items.push({ label: t('events.detail.tags'), value: tagsDisplay.value })
  }
  return items
})

async function refresh() {
  if (!goodsStore.isReady) {
    await goodsStore.init()
  }
}

function preloadLinkedGoodsImages() {
  if (linkedGoodsImageUrls.value.length > 0) {
    preloadImages(linkedGoodsImageUrls.value)
  }
}

// 预热照片缩略图缓存并记录 Promise，供 revealGalleryWhenPhotosReady 等待
function preloadEventPhotos() {
  const photos = Array.isArray(event.value?.photos) ? event.value.photos : []
  if (!photos.length) {
    eventPhotosPreloadPromise = Promise.resolve()
    return
  }
  // 预热的也是缩略图（不是原图），避免页面刚打开就并发解码多张几 MB 原图
  eventPhotosPreloadPromise = Promise.all(
    photos.map((photo) => {
      const thumb = resolvePhotoThumbUrl(photo, { width: 800 })
      return thumb ? getCachedImage(thumb, { priority: 'preload' }).catch(() => null) : Promise.resolve(null)
    })
  ).then(() => {})
}

onMounted(async () => {
  removeAndroidBackListener = addAndroidBackButtonListener(handleAndroidBackButton)
  window.addEventListener('keydown', handlePreviewKeydown)
  lockDetailEntryScrollLock()
  galleryReady.value = false
  if (!eventsStore.isReady) {
    await eventsStore.init()
  }
  await refresh()
  await restoreViewState()
  preloadLinkedGoodsImages()
  preloadEventPhotos()
  
  // Check if there's a pending linked goods hero back animation
  const hasPendingBackAnimation = hasPendingGoodsHeroBack(route.fullPath)
  
  if (hasPendingBackAnimation) {
    coverMediaVisible.value = true
    await nextTick()
    tryPlayLinkedGoodsBackHero()
    revealGalleryWhenPhotosReady(getHeroBackDurationMs() + 120)
    // Don't show media until the back animation completes
    // The animation will handle visibility
  } else {
    coverMediaVisible.value = false
    await playEventHeroForwardWhenReady()
    coverMediaVisible.value = true
    revealGalleryWhenPhotosReady(140)
  }
})

onBeforeUnmount(() => {
  releaseDetailEntryScrollLock()
  clearGalleryReadyTimer()
  cancelLinkedGoodsBackHeroRetry()
  closePhotoPreview()
  window.removeEventListener('keydown', handlePreviewKeydown)
  if (typeof removeAndroidBackListener === 'function') {
    removeAndroidBackListener()
  }
  removeAndroidBackListener = null
})

onActivated(async () => {
  lockDetailEntryScrollLock()
  galleryReady.value = false
  await restoreViewState()
  preloadLinkedGoodsImages()
  preloadEventPhotos()
  
  // Check if there's a pending linked goods hero back animation
  const hasPendingBackAnimation = hasPendingGoodsHeroBack(route.fullPath)
  
  if (hasPendingBackAnimation) {
    await nextTick()
    tryPlayLinkedGoodsBackHero()
    revealGalleryWhenPhotosReady(getHeroBackDurationMs() + 120)
  } else {
    await playEventHeroForwardWhenReady()
    revealGalleryWhenPhotosReady(140)
  }

  coverMediaVisible.value = true
})

onBeforeRouteLeave((to) => {
  if (to.name === 'detail') {
    saveViewState()
    sessionStorage.setItem(eventPendingKey.value, '1')
    return
  }

  clearViewState()
})

watch(eventId, async () => {
  lockDetailEntryScrollLock()
  closePhotoPreview()
  coverMediaVisible.value = false
  galleryReady.value = false
  await restoreViewState()
  preloadLinkedGoodsImages()
  preloadEventPhotos()
  await playEventHeroForwardWhenReady()
  coverMediaVisible.value = true
  revealGalleryWhenPhotosReady(140)
})

watch(linkedGoodsImageUrls, () => {
  preloadLinkedGoodsImages()
})

watch(eventPhotoUris, () => {
  preloadEventPhotos()
})

watch(trackSectionExpanded, (value) => {
  if (!eventId.value) return
  localStorage.setItem(eventTrackKey.value, value ? '1' : '0')
})

const previewPhoto = computed(() => {
  const photos = event.value?.photos || []
  return previewPhotoIndex.value >= 0 ? (photos[previewPhotoIndex.value] || null) : null
})

const prevPhoto = computed(() => {
  const photos = event.value?.photos || []
  const i = previewPhotoIndex.value
  return i > 0 ? (photos[i - 1] || null) : null
})

const nextPhoto = computed(() => {
  const photos = event.value?.photos || []
  const i = previewPhotoIndex.value
  return i >= 0 && i < photos.length - 1 ? (photos[i + 1] || null) : null
})

const previewZoomStyle = computed(() => ({
  transform: `translate3d(${previewZoom.x}px, ${previewZoom.y}px, 0) scale(${previewZoom.scale})`,
  transition: pzAnimating.value ? 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none'
}))

// 三图轨道：prev/current/next 各占一屏宽，默认把 current 居中（translateX(-100%)），
// 拖动时叠加 previewSwipeX 即可同时看到前后图片
const photoTrackStyle = computed(() => ({
  transform: `translate3d(calc(-100% + ${previewSwipeX.value}px), 0, 0)`,
  transition: pzAnimating.value ? 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none'
}))

function setPreviewZoomAnimating(animate) {
  if (pzAnimatingTimer) {
    window.clearTimeout(pzAnimatingTimer)
    pzAnimatingTimer = 0
  }
  pzAnimating.value = !!animate
  if (animate) {
    pzAnimatingTimer = window.setTimeout(() => {
      pzAnimatingTimer = 0
      pzAnimating.value = false
    }, 280)
  }
}

function resetPreviewZoom(animate = false) {
  previewZoom.scale = 1
  previewZoom.x = 0
  previewZoom.y = 0
  setPreviewZoomAnimating(animate)
}

function snapBackPreviewSwipe() {
  setPreviewZoomAnimating(true)
  previewSwipeX.value = 0
}

// 提交滑动切换：先把整条轨道滑到目标位置（前后图自然露出），到位后无动画地把
// 索引归位并复位位移，因为归位后的「居中图」正是刚才滑入的那张，视觉上无缝衔接
function commitSwipeSwitch(direction) {
  const stageW = window.innerWidth
  setPreviewZoomAnimating(true)
  previewSwipeX.value = direction * stageW
  window.setTimeout(() => {
    previewPhotoIndex.value += direction < 0 ? 1 : -1
    pzAnimating.value = false
    previewSwipeX.value = 0
    window.requestAnimationFrame(() => {
      pzAnimating.value = false
    })
  }, 260)
}

function clampPreviewScale(value) {
  return Math.min(PREVIEW_MAX_SCALE, Math.max(1, value))
}

function previewMaxOffset(scale) {
  const stageEl = previewStageRef.value
  const imgs = stageEl?.querySelectorAll('.photo-preview__img') || []
  const imgEl = imgs[Math.min(1, imgs.length - 1)] || null
  const stageW = stageEl?.offsetWidth || window.innerWidth
  const stageH = stageEl?.offsetHeight || window.innerHeight
  // object-fit: contain 后的实际内容尺寸（未放大前），用于限制拖动范围
  let contentW = stageW
  let contentH = stageH
  const naturalW = imgEl?.naturalWidth || 0
  const naturalH = imgEl?.naturalHeight || 0
  if (naturalW > 0 && naturalH > 0) {
    const fit = Math.min(stageW / naturalW, stageH / naturalH)
    contentW = naturalW * fit
    contentH = naturalH * fit
  }
  return {
    x: Math.max(0, (contentW * scale - stageW) / 2),
    y: Math.max(0, (contentH * scale - stageH) / 2)
  }
}

function clampPreviewTranslate(x, y, scale) {
  const max = previewMaxOffset(scale)
  return {
    x: Math.min(max.x, Math.max(-max.x, x)),
    y: Math.min(max.y, Math.max(-max.y, y))
  }
}

function applyPreviewZoom(scale, x, y, animate = false) {
  const next = clampPreviewTranslate(x, y, scale)
  previewZoom.scale = scale
  previewZoom.x = next.x
  previewZoom.y = next.y
  setPreviewZoomAnimating(animate)
}

// 以点击点为不动点切换缩放：v = O + (b - O)*s + t ⇒ t1 = u - (u - t0)*(s1/s0)
function togglePreviewZoomAt(clientX, clientY) {
  if (previewZoom.scale > 1) {
    if (!isPointOnPreviewImage(clientX, clientY)) return
    applyPreviewZoom(1, 0, 0, true)
    return
  }
  const ux = clientX - window.innerWidth / 2
  const uy = clientY - window.innerHeight / 2
  applyPreviewZoom(
    PREVIEW_DOUBLE_TAP_SCALE,
    ux - (ux - previewZoom.x) * PREVIEW_DOUBLE_TAP_SCALE,
    uy - (uy - previewZoom.y) * PREVIEW_DOUBLE_TAP_SCALE,
    true
  )
}

function getTouchDistance(touches) {
  const dx = touches[0].clientX - touches[1].clientX
  const dy = touches[0].clientY - touches[1].clientY
  return Math.hypot(dx, dy)
}

// object-fit: contain 后的可见内容盒（含当前缩放/位移），用于判断点击是否落在空白区域
function isPointOnPreviewImage(clientX, clientY) {
  const stageEl = previewStageRef.value
  if (!stageEl) return true
  const stageW = stageEl.offsetWidth || window.innerWidth
  const stageH = stageEl.offsetHeight || window.innerHeight
  // 取当前居中（current）的图片用于命中判断
  const imgs = stageEl.querySelectorAll('.photo-preview__img')
  const imgEl = imgs[Math.min(1, imgs.length - 1)] || null
  const naturalW = imgEl?.naturalWidth || 0
  const naturalH = imgEl?.naturalHeight || 0
  let contentW = stageW
  let contentH = stageH
  if (naturalW > 0 && naturalH > 0) {
    const fit = Math.min(stageW / naturalW, stageH / naturalH)
    contentW = naturalW * fit
    contentH = naturalH * fit
  }
  // 变换以 stage 中心为原点：v = O + (b - O)*s + t
  const halfW = (contentW * previewZoom.scale) / 2 + PREVIEW_BLANK_TAP_TOLERANCE_PX
  const halfH = (contentH * previewZoom.scale) / 2 + PREVIEW_BLANK_TAP_TOLERANCE_PX
  return (
    clientX >= stageW / 2 - halfW + previewZoom.x &&
    clientX <= stageW / 2 + halfW + previewZoom.x &&
    clientY >= stageH / 2 - halfH + previewZoom.y &&
    clientY <= stageH / 2 + halfH + previewZoom.y
  )
}

// 单击空白区关闭预览，但延迟执行：若紧跟双击（放大/缩小）则取消关闭，
// 避免双击首击落在角落空白时直接退出照片
function scheduleBlankCloseIfNeeded(clientX, clientY) {
  if (isPointOnPreviewImage(clientX, clientY)) return
  if (pzPendingBlankClose) clearTimeout(pzPendingBlankClose)
  pzPendingBlankClose = setTimeout(() => {
    pzPendingBlankClose = null
    closePhotoPreview()
  }, PREVIEW_DOUBLE_TAP_GAP_MS)
}

function cancelPendingBlankClose() {
  if (pzPendingBlankClose) {
    clearTimeout(pzPendingBlankClose)
    pzPendingBlankClose = null
  }
}

// 触屏产生的合成 click 需要忽略，只响应鼠标点击
function onPreviewStageClick(event) {
  if (Date.now() - pzLastTouchEndAt < 700) return
  if (event.detail > 1) {
    cancelPendingBlankClose()
    return
  }
  scheduleBlankCloseIfNeeded(event.clientX, event.clientY)
}

function onPreviewTouchStart(event) {
  const touches = event.touches
  if (touches.length >= 2) {
    pzGesture = 'pinch'
    pzStart = {
      distance: getTouchDistance(touches),
      centerX: (touches[0].clientX + touches[1].clientX) / 2,
      centerY: (touches[0].clientY + touches[1].clientY) / 2,
      scale: previewZoom.scale,
      x: previewZoom.x,
      y: previewZoom.y
    }
    return
  }
  pzGesture = 'pan'
  pzTapMoved = false
  pzStart = {
    startX: touches[0].clientX,
    startY: touches[0].clientY,
    x: previewZoom.x,
    y: previewZoom.y
  }
}

function onPreviewTouchMove(event) {
  if (!pzStart) return
  const touches = event.touches
  if (pzGesture === 'pinch') {
    if (touches.length < 2) return
    event.preventDefault()
    const nextScale = clampPreviewScale(pzStart.scale * getTouchDistance(touches) / Math.max(1, pzStart.distance))
    // 保持双指中心下的内容点不动
    const ux = pzStart.centerX - window.innerWidth / 2
    const uy = pzStart.centerY - window.innerHeight / 2
    const ratio = nextScale / Math.max(pzStart.scale, 0.01)
    pzTapMoved = true
    applyPreviewZoom(
      nextScale,
      ux - (ux - pzStart.x) * ratio,
      uy - (uy - pzStart.y) * ratio
    )
    return
  }
  if (previewZoom.scale <= 1) {
    if (
      Math.abs(touches[0].clientX - pzStart.startX) > 6 ||
      Math.abs(touches[0].clientY - pzStart.startY) > 6
    ) {
      pzTapMoved = true
    }
    // 未放大时，水平方向拖动提供切换图片的视觉反馈
    const dx = touches[0].clientX - pzStart.startX
    const dy = touches[0].clientY - pzStart.startY
    if (Math.abs(dx) > Math.abs(dy)) {
      // 水平主导时阻止浏览器返回手势/页面滚动抢占滑动
      event.preventDefault()
    }
    previewSwipeX.value = dx
    return
  }
  event.preventDefault()
  pzTapMoved = true
  applyPreviewZoom(
    previewZoom.scale,
    pzStart.x + (touches[0].clientX - pzStart.startX),
    pzStart.y + (touches[0].clientY - pzStart.startY)
  )
}

function onPreviewTouchEnd(event) {
  if (!pzStart) return
  if (event.touches.length === 0) {
    pzLastTouchEndAt = Date.now()
    if (pzGesture === 'pan') {
      const touch = event.changedTouches[0]
      const dx = previewSwipeX.value
      const dy = touch.clientY - pzStart.startY
      const swipeThreshold = Math.max(40, window.innerWidth * PREVIEW_SWIPE_RATIO)
      // 未放大时的水平滑动优先判定为切换图片
      if (Math.abs(dx) > swipeThreshold && Math.abs(dx) > Math.abs(dy)) {
        if ((dx < 0 && canGoNextPhoto.value) || (dx > 0 && canGoPrevPhoto.value)) {
          commitSwipeSwitch(dx < 0 ? -1 : 1)
        } else {
          snapBackPreviewSwipe()
        }
        pzStart = null
        pzGesture = null
        return
      }
      if (!pzTapMoved) {
        const now = pzLastTouchEndAt
        const isNearLastTap = Math.hypot(touch.clientX - pzLastTap.x, touch.clientY - pzLastTap.y) < 48
        if (now - pzLastTap.time < PREVIEW_DOUBLE_TAP_GAP_MS && isNearLastTap) {
          pzLastTap.time = 0
          cancelPendingBlankClose()
          togglePreviewZoomAt(touch.clientX, touch.clientY)
        } else {
          pzLastTap.time = now
          pzLastTap.x = touch.clientX
          pzLastTap.y = touch.clientY
          scheduleBlankCloseIfNeeded(touch.clientX, touch.clientY)
        }
      }
    }
    if (previewZoom.scale < 1) {
      applyPreviewZoom(1, 0, 0, true)
    }
    if (previewSwipeX.value !== 0) {
      snapBackPreviewSwipe()
    }
    pzStart = null
    pzGesture = null
    return
  }
  if (pzGesture === 'pinch' && event.touches.length === 1) {
    pzGesture = 'pan'
    pzTapMoved = true
    pzStart = {
      startX: event.touches[0].clientX,
      startY: event.touches[0].clientY,
      x: previewZoom.x,
      y: previewZoom.y
    }
  }
}

function onPreviewDblClick(event) {
  cancelPendingBlankClose()
  togglePreviewZoomAt(event.clientX, event.clientY)
}

function openPhotoPreview(index) {
  const photos = event.value?.photos || []
  if (!photos[index]?.uri) return
  resetPreviewZoom(false)
  previewSwipeX.value = 0
  pzLastTap.time = 0
  cancelPendingBlankClose()
  previewPhotoIndex.value = index
}

function closePhotoPreview() {
  previewPhotoIndex.value = -1
  previewSwipeX.value = 0
}

const canGoPrevPhoto = computed(() => previewPhotoIndex.value > 0)
const canGoNextPhoto = computed(() => {
  const photos = event.value?.photos || []
  return previewPhotoIndex.value >= 0 && previewPhotoIndex.value < photos.length - 1
})

function showPrevPhoto() {
  if (canGoPrevPhoto.value) commitSwipeSwitch(1)
}

function showNextPhoto() {
  if (canGoNextPhoto.value) commitSwipeSwitch(-1)
}

function handlePreviewKeydown(event) {
  if (previewPhotoIndex.value < 0) return
  if (event.key === 'Escape') {
    closePhotoPreview()
  } else if (event.key === 'ArrowLeft') {
    showPrevPhoto()
  } else if (event.key === 'ArrowRight') {
    showNextPhoto()
  }
}

async function handleDelete() {
  if (!event.value) return
  await eventsStore.removeEventRecord(event.value.id)
  showDeleteDialog.value = false
  router.replace('/events')
}

function handleEditEvent() {
  if (!event.value?.id) return
  runWithRouteTransition(
    () => router.push({
      path: `/events/edit/${event.value.id}`,
      query: { returnTo: route.fullPath }
    }),
    { direction: 'forward' }
  )
}

function handleBackNavigation() {
  const returnPath = getPendingDetailReturnPath()
  const currentPath = router.currentRoute.value?.fullPath || ''
  const historyBackPath = window.history?.state?.back || ''
  const filteredHistoryBackPath = historyBackPath.startsWith('/detail/') ? '' : historyBackPath
  const fallbackPath = '/events'
  const targetPath = (() => {
    if (returnPath && returnPath !== currentPath) return returnPath
    if (filteredHistoryBackPath && filteredHistoryBackPath !== currentPath) return filteredHistoryBackPath
    return fallbackPath
  })()
  const shouldUseHistoryBack = filteredHistoryBackPath === targetPath

  prepareEventHeroBack({
    eventId: eventId.value,
    sourceEl: coverCardRef.value,
    targetPath
  })

  setPendingDetailReturnPath('')

  if (shouldUseHistoryBack) {
    router.back()
    return
  }

  router.replace(targetPath)
}

function handleAndroidBackButton(event) {
  event.preventDefault()
  if (previewPhotoIndex.value >= 0) {
    closePhotoPreview()
    return
  }
  handleBackNavigation()
}

function openLinkedGoodsDetail(goods, domEvent) {
  const cardRoot = domEvent?.currentTarget || null
  const normalizedGoodsId = String(goods?.id || '')
  const escapedGoodsId = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(normalizedGoodsId)
    : normalizedGoodsId.replace(/"/g, '\\"')
  const heroSourceEl = cardRoot?.querySelector?.(`[data-goods-hero-id="${escapedGoodsId}"]`) || cardRoot

  clearRouteTransitionFallback()
  prepareGoodsHeroForward({
    goodsId: goods.id,
    sourceEl: heroSourceEl || null
  })
  setPendingDetailReturnPath(route.fullPath)
  router.push(`/detail/${goods.id}`).catch(() => {
    eventDisplayReady.value = true
  })
}

function resolveLinkedGoodsCover(goodsId) {
  const normalized = String(goodsId || '')
  if (!normalized) return null
  const escaped = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(normalized)
    : normalized.replace(/"/g, '\\"')
  const rootEl = pageBodyRef.value || document
  const cardRoot = rootEl?.querySelector?.(`[data-linked-goods-id="${escaped}"]`) || null
  if (cardRoot) {
    const coverInsideCard = cardRoot.querySelector?.(`[data-goods-hero-id="${escaped}"]`) || null
    if (coverInsideCard) return coverInsideCard
  }
  const directCover = rootEl?.querySelector?.(`[data-goods-hero-id="${escaped}"]`) || null
  if (directCover) return directCover
  return cardRoot
}

let linkedGoodsBackHeroRetryRaf = 0

function cancelLinkedGoodsBackHeroRetry() {
  if (linkedGoodsBackHeroRetryRaf) {
    window.cancelAnimationFrame(linkedGoodsBackHeroRetryRaf)
    linkedGoodsBackHeroRetryRaf = 0
  }
}

function scheduleLinkedGoodsBackHeroRetry(attempt = 0, onSuccess) {
  cancelLinkedGoodsBackHeroRetry()
  linkedGoodsBackHeroRetryRaf = window.requestAnimationFrame(() => {
    linkedGoodsBackHeroRetryRaf = 0
    const played = playGoodsHeroBack({
      currentPath: route.fullPath,
      resolveTargetEl: resolveLinkedGoodsCover
    })
    if (played) {
      // Animation started, show media after it completes
      const backDuration = getHeroBackDurationMs()
      window.setTimeout(() => {
        coverMediaVisible.value = true
        revealGalleryWhenPhotosReady(90)
      }, Math.max(0, backDuration + 40))
      if (typeof onSuccess === 'function') onSuccess()
      return
    }
    if (!hasPendingGoodsHeroBack(route.fullPath)) {
      return
    }
    if (attempt + 1 >= 20) {
      coverMediaVisible.value = true
      revealGalleryWhenPhotosReady(80)
      return
    }
    scheduleLinkedGoodsBackHeroRetry(attempt + 1, onSuccess)
  })
}

function tryPlayLinkedGoodsBackHero() {
  const played = playGoodsHeroBack({
    currentPath: route.fullPath,
    resolveTargetEl: resolveLinkedGoodsCover
  })
  if (played) {
    // Animation started, show media after it completes
    const backDuration = getHeroBackDurationMs()
    window.setTimeout(() => {
      coverMediaVisible.value = true
      revealGalleryWhenPhotosReady(90)
    }, Math.max(0, backDuration + 40))
  } else if (hasPendingGoodsHeroBack(route.fullPath)) {
    scheduleLinkedGoodsBackHeroRetry(0)
  } else {
    // No animation, show media immediately
    coverMediaVisible.value = true
    revealGalleryWhenPhotosReady(80)
  }
}
</script>

<style scoped>
.event-detail-page {
  height: 100dvh;
  overflow: hidden;
  background: var(--app-bg-gradient);
}

.event-detail-page--entry-lock .page-body {
  overflow: hidden;
  overscroll-behavior: none;
  touch-action: none;
}

.event-detail-page .page-body {
  width: min(100%, 2048px);
  margin: 0 auto;
  padding: min(env(safe-area-inset-top), 4px) var(--page-padding) 120px;
  overscroll-behavior-y: contain;
  -ms-overflow-style: none;
  scrollbar-width: none;
  overflow-x: hidden;
}

.event-detail-page .page-body::-webkit-scrollbar {
  width: 0;
  height: 0;
  display: none;
}

.detail-shell {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 24px;
}

.hero-card,
.info-card,
.note-card,
.expense-card,
.gallery-card,
.linked-goods-card,
.dialog-card {
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
}

.cover-stage {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.cover-card {
  width: 100%;
  aspect-ratio: 4 / 4.6;
  border-radius: 34px;
  overflow: hidden;
  background: linear-gradient(180deg, #2a2d35, #1d2028);
  box-shadow: var(--app-shadow);
}

.event-cover-media--hero-hidden {
  opacity: 0;
}

.cover-card--empty {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(180deg, #2c2f38, #242731);
}

:deep(.cover-card__img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.cover-card__fallback {
  color: rgba(255, 255, 255, 0.88);
  font-size: 84px;
  font-weight: 700;
  letter-spacing: -0.06em;
}

.gallery-card {
  padding: 12px;
  border-radius: 30px;
  min-width: 0;
  overflow: hidden;
}

.hero-card {
  padding: 28px;
  border-radius: 32px;
}

.hero-card__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.hero-chip {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 0 14px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 700;
}

.type-exhibition { background: rgba(90, 120, 250, 0.12); color: #355be0; }
.type-concert { background: rgba(250, 149, 90, 0.14); color: #d26f20; }
.type-market { background: rgba(250, 149, 90, 0.14); color: #d26f20; }
.type-exchange { background: rgba(50, 200, 140, 0.14); color: #188f63; }
.type-other { background: rgba(142, 142, 147, 0.14); color: #6a6e77; }

.hero-chip--tag {
  background: rgba(120, 100, 255, 0.1);
  color: #7864ff;
}

.hero-chip,
.hero-date,
.hero-title,
.hero-price__label,
.hero-price__currency,
.hero-price__amount,
.section-label,
.section-title,
.info-label,
.info-value,
.note-body,
.linked-goods-card__name,
.cover-card__fallback,
.dialog-title,
.dialog-message {
  -webkit-user-select: text;
  -moz-user-select: text;
  -ms-user-select: text;
  user-select: text;
}

.hero-date {
  color: var(--app-text-tertiary);
  font-size: 13px;
}

.hero-title {
  margin-top: 16px;
  color: var(--app-text);
  font-size: 22px;
  font-weight: 700;
  line-height: 1.35;
  letter-spacing: -0.04em;
}

.hero-price {
  margin-top: 18px;
}

.hero-price__label,
.section-label,
.info-label {
  color: var(--app-text-tertiary);
}

.hero-price__label {
  font-size: 13px;
}

.hero-price__value {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-top: 8px;
}

.hero-price__currency {
  color: var(--app-text);
  font-size: 18px;
  font-weight: 600;
}

.hero-price__amount {
  color: var(--app-text);
  font-size: 30px;
  font-weight: 700;
  letter-spacing: -0.05em;
}

.info-section,
.note-section,
.track-section,
.linked-section {
  margin-top: 18px;
}

.section-head {
  margin-bottom: 14px;
}

.section-head--toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.section-label {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.section-title {
  margin-top: 4px;
  color: var(--app-text);
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.03em;
}

.section-toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 38px;
  padding: 0 14px;
  border: none;
  border-radius: 999px;
  background: var(--app-surface-soft);
  color: var(--app-text);
  font-size: 13px;
  font-weight: 700;
  flex-shrink: 0;
}

.section-toggle-btn__icon--expanded {
  transform: rotate(180deg);
}

.section-toggle-btn svg {
  width: 16px;
  height: 16px;
  stroke: currentColor;
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform 160ms ease;
}

.info-card {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  padding: 12px;
  border-radius: 28px;
}

.info-tile {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 18px;
  border-radius: 20px;
  background: var(--app-surface-soft);
}

.info-label {
  font-size: 13px;
}

.info-value {
  color: var(--app-text);
  font-size: 16px;
  font-weight: 700;
  line-height: 1.5;
  word-break: break-word;
}

.note-card {
  padding: 24px;
  border-radius: 28px;
}

.note-body {
  color: var(--app-text-secondary);
  font-size: 15px;
  line-height: 1.85;
  white-space: pre-wrap;
}

.note-body--markdown {
  white-space: normal;
  word-break: break-word;
  user-select: text;
  -webkit-user-select: text;
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



.expense-section {
  margin-top: 18px;
}

.expense-card {
  padding: 20px 22px;
  border-radius: 28px;
  display: grid;
  gap: 14px;
}

.expense-card__summary {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.expense-card__summary span {
  color: var(--app-text-tertiary);
  font-size: 13px;
}

.expense-card__summary strong {
  color: var(--app-text);
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.04em;
}

.expense-list {
  display: grid;
  gap: 10px;
}

.expense-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 18px;
  background: color-mix(in srgb, var(--app-surface-soft) 92%, var(--app-surface));
}

.expense-row__copy {
  min-width: 0;
}

.expense-row__copy strong {
  color: var(--app-text);
  font-size: 14px;
  font-weight: 600;
  word-break: break-word;
}

.expense-row__amount {
  color: var(--app-text);
  font-size: 14px;
  font-weight: 700;
  flex-shrink: 0;
}

.linked-goods-grid {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

.linked-goods-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-radius: 20px;
  text-decoration: none;
  color: var(--app-text);
}

.linked-goods-card:active {
  transform: scale(0.96);
}

.linked-goods-card__media {
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 14px;
  overflow: hidden;
}

.linked-goods-card__img,
.linked-goods-card__placeholder {
  width: 100%;
  height: 100%;
  border-radius: 14px;
}

.linked-goods-card__img {
  display: block;
  background: var(--app-surface-soft);
  object-fit: cover;
}

.linked-goods-card__placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(180deg, #2c2f38, #242731);
  color: rgba(255, 255, 255, 0.82);
  font-size: 22px;
  font-weight: 700;
}

.linked-goods-card__name {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.nav-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--icon-button-size);
  height: var(--icon-button-size);
  border: none;
  border-radius: 50%;
  background: var(--app-glass);
  border: 1px solid var(--app-glass-border);
  box-shadow: var(--app-shadow);
  color: var(--app-text);
}

.nav-icon-btn.danger {
  color: #d15353;
}

.nav-icon-btn svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(20, 20, 22, 0.24);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.dialog-card {
  width: 100%;
  max-width: 340px;
  padding: 24px;
  border-radius: 24px;
  text-align: center;
}

.dialog-title {
  margin: 0 0 8px;
  color: var(--app-text);
  font-size: 18px;
  font-weight: 700;
}

.dialog-message {
  margin: 0 0 20px;
  color: var(--app-text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.dialog-actions {
  display: flex;
  gap: 10px;
}

.dialog-btn {
  flex: 1;
  height: 46px;
  border: none;
  border-radius: 16px;
  background: var(--app-surface-soft);
  color: var(--app-text);
  font-size: 15px;
  font-weight: 600;
}

.dialog-btn.danger {
  background: #16171b;
  color: #ffffff;
}

.dialog-fade-enter-active,
.dialog-fade-leave-active {
  transition: opacity 0.2s ease;
}

.dialog-fade-enter-from,
.dialog-fade-leave-to {
  opacity: 0;
}

.photo-preview-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: var(--app-bg);
  background: color-mix(in srgb, var(--app-bg) 80%, transparent);
  backdrop-filter: blur(40px) saturate(180%);
  -webkit-backdrop-filter: blur(40px) saturate(180%);
}

.photo-preview__close {
  position: absolute;
  top: calc(env(safe-area-inset-top) + 12px);
  right: 16px;
  z-index: 10;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: color-mix(in srgb, var(--app-surface) 55%, transparent);
  color: var(--app-text);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  transition: background-color 200ms ease, transform 180ms ease, backdrop-filter 200ms ease;
}

.photo-preview__close:hover {
  background: color-mix(in srgb, var(--app-surface) 72%, transparent);
}

.photo-preview__close:active {
  transform: scale(0.88);
  background: color-mix(in srgb, var(--app-surface) 82%, transparent);
}

.photo-preview__close svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 2.2;
}

.photo-preview__nav {
  position: absolute;
  top: 50%;
  z-index: 10;
  width: 40px;
  height: 40px;
  transform: translateY(-50%);
  border: none;
  border-radius: 50%;
  background: color-mix(in srgb, var(--app-surface) 55%, transparent);
  color: var(--app-text);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  transition: background-color 200ms ease, transform 180ms ease, backdrop-filter 200ms ease;
}

.photo-preview__nav:hover {
  background: color-mix(in srgb, var(--app-surface) 72%, transparent);
}

.photo-preview__nav:active {
  transform: translateY(-50%) scale(0.88);
  background: color-mix(in srgb, var(--app-surface) 82%, transparent);
}

.photo-preview__nav--prev {
  left: 16px;
}

.photo-preview__nav--next {
  right: 16px;
}

.photo-preview__nav svg {
  width: 20px;
  height: 20px;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.photo-preview__stage {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  touch-action: none;
}

.photo-preview__zoom {
  position: absolute;
  inset: 0;
  will-change: transform;
}

.photo-preview__track {
  position: absolute;
  inset: 0;
  display: flex;
  flex-wrap: nowrap;
  will-change: transform;
}

.photo-preview__cell {
  flex: 0 0 100%;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.photo-preview__zoom :deep(.lazy-image-element) {
  object-fit: contain;
}

.photo-preview-enter-active {
  transition: opacity 220ms ease;
}

.photo-preview-enter-active .photo-preview__stage {
  transition: transform 260ms var(--motion-ease-emphasis);
}

.photo-preview-leave-active {
  transition: opacity 180ms ease;
}

.photo-preview-leave-active .photo-preview__stage {
  transition: transform 180ms ease;
}

.photo-preview-enter-from,
.photo-preview-leave-to {
  opacity: 0;
}

.photo-preview-enter-from .photo-preview__stage {
  transform: scale(0.92);
}

.photo-preview-leave-to .photo-preview__stage {
  transform: scale(0.95);
}

.empty-wrap {
  padding-top: 40px;
}

@media (min-width: 900px) {
  .detail-shell {
    grid-template-columns: clamp(280px, 42%, 480px) 1fr;
    align-items: start;
    column-gap: 28px;
  }

  .media-column {
    position: sticky;
    top: 0;
    min-width: 0;
  }

  .info-card {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .linked-goods-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
}

@media (min-width: 1280px) {
  .linked-goods-grid {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }
}

@media (max-width: 899px) {
}

@media (max-width: 720px) {
  .info-card {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .linked-goods-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

</style>
