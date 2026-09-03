<template>
  <div class="page checkout-page">
    <NavBar :title="t('checkout.title')" show-back @back="handleBack">
      <template #right>
        <button
          type="button"
          class="nav-icon-btn queue-entry-btn"
          :aria-label="t('checkout.queueOpen')"
          :title="t('checkout.queueOpen')"
          @click="showQueueManager = true"
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 7h16M4 12h10M4 17h16" />
          </svg>
          <span v-if="activeQueueItems.length" class="queue-entry-btn__badge">{{ activeQueueItems.length }}</span>
        </button>
      </template>
    </NavBar>

    <main class="page-body">
      <StepProgress :progress="displayProgress" />

      <Transition name="step-fade" mode="out-in">
        <CheckoutStepCookie
          v-if="currentStep.key === 'cookie'"
          key="cookie"
          v-model="cookieInput"
          v-model:rememberCookie="rememberCookie"
          :is-native-platform="isNativePlatform"
          :cookie-valid="cookieValid"
          :has-saved-cookie="hasSavedCookie"
          :cookie-warning-message="cookieWarningMessage"
          :step-number="displayStepIndex + 1"
          :step-count="displayStepCount"
          @clear-saved="clearSavedCookie(false)"
        />

        <CheckoutStepAddress
          v-else-if="currentStep.key === 'address'"
          key="address"
          :addresses="addresses"
          :selected-address-id="selectedAddressId"
          :address-loading="addressLoading"
          :address-error="addressError"
          :format-address="formatAddress"
          :step-number="displayStepIndex + 1"
          :step-count="displayStepCount"
          @select-address="selectAddress"
        />

        <CheckoutStepGoods
          v-else-if="currentStep.key === 'goods'"
          key="goods"
          :is-point-order="isPointOrder"
          :items="items"
          :cookie="cookie"
          v-model:search-keyword="searchKeyword"
          :search-results="searchResults"
          :searching="searching"
          :search-error="searchError"
          :search-expanded="searchExpanded"
          :search-loading-more="searchLoadingMore"
          :show-search-toggle="showSearchToggle"
          :show-search-load-more-status="showSearchLoadMoreStatus"
          :search-load-more-ref="searchLoadMoreRef"
          :visible-search-results="visibleSearchResults"
          :get-search-result-cover="getSearchResultCover"
          :toggle-search-expanded="toggleSearchExpanded"
          :load-more-search-results="loadMoreSearchResults"
          :is-tablet="isTabletViewport"
          :selected-search-goods-id="selectedSearchGoodsId"
          :select-search-result="handleSelectSearchResult"
          :long-press-search-result="handleLongPressSearchResult"
          :point-balance="pointBalance"
          :point-loading="pointLoading"
          :point-error="pointError"
          v-model:active-point-shop-code="activePointShopCode"
          :point-shop-options="POINT_SHOP_OPTIONS"
          :visible-point-goods="visiblePointGoods"
          :point-selecting-id="pointSelectingId"
          :format-fen="formatFen"
          :format-sale-time="formatSaleTime"
          :handle-search="handleSearch"
          :add-item-from-search="addItemFromSearch"
          :load-point-goods="loadPointGoods"
          :point-shop-label="pointShopLabel"
          :is-point-goods-affordable="isPointGoodsAffordable"
          :select-point-goods="selectPointGoods"
          :remove-item="removeItem"
          :update-item-sku="updateItemSku"
          :update-item-quantity="updateItemQuantity"
          :get-item-cover="getItemCover"
          :get-item-unit-price="getItemUnitPrice"
          :get-locked-sku-stock="getLockedSkuStock"
          :step-number="displayStepIndex + 1"
          :step-count="displayStepCount"
          @set-order-mode="setOrderMode"
          @open-cart-picker="showCartPicker = true"
        />

        <CheckoutStepCoupon
          v-else-if="currentStep.key === 'coupon'"
          key="coupon"
          :coupon-processing="couponProcessing"
          :coupon-results="couponResults"
          :step-number="displayStepIndex + 1"
          :step-count="displayStepCount"
        />

        <CheckoutStepGifts
          v-else-if="currentStep.key === 'gifts'"
          key="gifts"
          :gift-activities="giftActivities"
          :gift-loading="giftLoading"
          :gift-error="giftError"
          :total-amount="totalAmount"
          :is-tablet="isTabletViewport"
          :format-fen="formatFen"
          :get-matched-stage="getMatchedStage"
          :is-activity-active="isActivityActive"
          :gift-activity-state-text="giftActivityStateText"
          :get-available-gifts="getAvailableGifts"
          :is-gift-selected="isGiftSelected"
          :toggle-gift="toggleGift"
          :get-gift-image-url="getGiftImageUrl"
          :step-number="displayStepIndex + 1"
          :step-count="displayStepCount"
        />

        <CheckoutStepReview
          v-else-if="currentStep.key === 'review'"
          key="review"
          :items="items"
          :is-point-order="isPointOrder"
          :total-amount="totalAmount"
          :total-point-cost="totalPointCost"
          :best-coupon="bestCoupon"
          :discount-amount="discountAmount"
          :pay-total="payTotal"
          :selected-gift-sections="selectedGiftSections"
          :selected-address="selectedAddress"
          v-model:remark="remark"
          :format-fen="formatFen"
          :coupon-name="couponName"
          :format-address="formatAddress"
          :get-item-cover="getItemCover"
          :get-item-price="getItemPrice"
          :get-gift-image-url="getGiftImageUrl"
          :step-number="displayStepIndex + 1"
          :step-count="displayStepCount"
        />

        <CheckoutStepSubmit
          v-else-if="currentStep.key === 'submit'"
          key="submit"
          :order-result="orderResult"
          :is-point-order="isPointOrder"
          :total-point-cost="totalPointCost"
          :timer-enabled="timerEnabled"
          :timer-target-time="timerTargetTime"
          :formatted-timer-target="formattedTimerTarget"
          :remaining-text="remainingText"
          :retry-count="retryCount"
          :concurrency="concurrency"
          :max-concurrency="maxConcurrency"
          :qq-bound="qqBinding.isBound"
          :checkout-notify="qqBinding.checkoutNotify"
          :queue-items="queueItems"
          :active-queue-items="activeQueueItems"
          :error="error"
          :format-fen="formatFen"
          :step-number="displayStepIndex + 1"
          :step-count="displayStepCount"
          @timer-toggle="handleTimerToggle"
          @open-timer-picker="openTimerPicker"
          @decrease-retry="decreaseRetryCount"
          @increase-retry="increaseRetryCount"
          @infinite-retry="setInfiniteRetry"
          @decrease-concurrency="decreaseConcurrency"
          @increase-concurrency="increaseConcurrency"
          @toggle-checkout-notify="(v) => qqBinding.toggleCheckoutNotify(v).catch(() => {})"
          @open-queue="showQueueManager = true"
        />
      </Transition>
    </main>

    <!-- Floating action footer -->
    <div v-if="!orderResult" class="float-footer">
      <div class="float-footer__btns">
        <button v-if="!isFirstStep" class="btn-float btn-float--ghost" type="button" @click="handlePreviousStep">
          {{ t('checkout.back') }}
        </button>
        <button class="btn-float btn-float--primary" type="button" :disabled="stepAction.disabled" @click="stepAction.handler">
          <span v-if="stepAction.busy" class="parse-spinner" />
          {{ stepAction.label }}
        </button>
      </div>
    </div>

    <!-- 定时下单时间选择（与预购提醒一致） -->
    <AppDateTimePicker
      v-model:show="showTimerPicker"
      v-model="timerDateTime"
      :title="t('checkout.scheduledPurchase')"
      :min-date="timerMinDate"
      :max-date="timerMaxDate"
      @confirm="onTimerConfirm"
    />

    <Popup
      v-model:show="showLeaveConfirm"
      :position="leaveConfirmPosition"
      :round="!isTabletViewport"
      :close-on-click-overlay="false"
      :class="['picker-popup', 'leave-confirm-popup', { 'picker-popup--center': isTabletViewport }]"
    >
      <div class="leave-confirm">
        <div class="leave-confirm__content">
          <h3 class="leave-confirm__title">{{ t('checkout.leaveTitle') }}</h3>
          <p class="leave-confirm__message">{{ t('checkout.leaveConfirm') }}</p>
        </div>
        <div class="leave-confirm__actions">
          <button type="button" class="leave-confirm__button leave-confirm__button--secondary" @click="showLeaveConfirm = false">
            {{ t('common.cancel') }}
          </button>
          <button type="button" class="leave-confirm__button leave-confirm__button--primary" @click="confirmLeave">
            {{ t('common.confirm') }}
          </button>
        </div>
      </div>
    </Popup>

    <CheckoutQueueManager
      v-model:show="showQueueManager"
      :position="queueManagerPosition"
      :is-tablet-viewport="isTabletViewport"
      :display-queue-items="displayQueueItems"
      :failed-queue-items="failedQueueItems"
      :format-queue-time="formatQueueTime"
      :queue-status-text="queueStatusText"
      :open-queue-detail="openQueueDetail"
      :retry-queued-order="retryQueuedOrder"
      :remove-queued-order="removeQueuedOrder"
      @clear-failed="failedQueueItems.forEach((item) => removeQueuedOrder(item.id))"
    />

    <CheckoutQueueDetail
      v-model:show="showQueueDetail"
      :position="queueDetailPosition"
      :is-tablet-viewport="isTabletViewport"
      :active-queue-detail="activeQueueDetail"
      :format-queue-time="formatQueueTime"
      :format-fen="formatFen"
      :queue-status-text="queueStatusText"
      :retry-queued-order="retryQueuedOrder"
      :remove-queued-order="removeQueuedOrder"
    />

    <CheckoutCartPicker
      v-model:show="showCartPicker"
      :position="cartPickerPosition"
      :is-tablet-viewport="isTabletViewport"
      :cookie="cookie"
      :add-items-from-cart="addItemsFromCart"
      @added="handleCartAdded"
    />

    <AppToast :message="toastMsg" />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { runWithRouteTransition } from '@/utils/routeTransition'
import { useI18n } from 'vue-i18n'
import { Popup } from 'vant'
import NavBar from '@/components/common/NavBar.vue'
import AppDateTimePicker from '@/components/common/AppDateTimePicker.vue'
import StepProgress from '@/components/checkout/StepProgress.vue'
import CheckoutStepCookie from '@/components/checkout/CheckoutStepCookie.vue'
import CheckoutStepAddress from '@/components/checkout/CheckoutStepAddress.vue'
import CheckoutStepGoods from '@/components/checkout/CheckoutStepGoods.vue'
import CheckoutStepCoupon from '@/components/checkout/CheckoutStepCoupon.vue'
import CheckoutStepGifts from '@/components/checkout/CheckoutStepGifts.vue'
import CheckoutStepReview from '@/components/checkout/CheckoutStepReview.vue'
import CheckoutStepSubmit from '@/components/checkout/CheckoutStepSubmit.vue'
import CheckoutQueueManager from '@/components/checkout/CheckoutQueueManager.vue'
import CheckoutQueueDetail from '@/components/checkout/CheckoutQueueDetail.vue'
import CheckoutCartPicker from '@/components/checkout/CheckoutCartPicker.vue'
import AppToast from '@/components/common/AppToast.vue'
import { useCheckoutFlow, STEPS } from '@/composables/checkout/useCheckoutFlow'
import { useCheckoutAddress } from '@/composables/checkout/useCheckoutAddress'
import { useCheckoutGoods } from '@/composables/checkout/useCheckoutGoods'
import { useCheckoutGifts } from '@/composables/checkout/useCheckoutGifts'
import { POINT_SHOP_OPTIONS, useCheckoutPoints } from '@/composables/checkout/useCheckoutPoints'
import { useCheckoutOrderQueue } from '@/composables/checkout/useCheckoutOrderQueue'
import { useCheckoutTimer } from '@/composables/checkout/useCheckoutTimer'
import { useMihoyoCookieState } from '@/composables/import/useMihoyoCookieState'
import { useTabletViewport } from '@/composables/useTabletViewport'
import { receiveCoupon, submitCheckoutOrder } from '@/utils/mihoyo/checkout'
import { canUseNativeMihoyoImport, getNativeMihoyoCookie, importMihoyoCartWithSession } from '@/utils/mihoyo/nativeImport'
import { formatPrice, formatDate } from '@/utils/format'
import { useToast } from '@/composables/useToast'
import { useDialogBackButton } from '@/composables/useDialogBackButton'
import { useQQBindingStore } from '@/stores/qqBinding'
import { createCheckoutNotify } from '@/services/qqService'
import { isMihoyoCookieExpiredError } from '@/utils/mihoyo/index'

const router = useRouter()
const route = useRoute()
const { t } = useI18n()
const { showToast, toastMsg } = useToast()

const flow = useCheckoutFlow()
const address = useCheckoutAddress()
const goods = useCheckoutGoods()
const points = useCheckoutPoints()
const gifts = useCheckoutGifts()
const orderQueue = useCheckoutOrderQueue()
const qqBinding = useQQBindingStore()
// 倒计时基准时钟：手动时间用本地时钟，自动预填（开售/活动时间，服务器域）用服务器时钟
const timer = useCheckoutTimer(() => (timerManuallySet.value ? Date.now() : orderQueue.getServerNow()))

const {
  cookieInput, rememberCookie, hasSavedCookie, cookieValid,
  cookieWarningMessage, canAutoSubmitSavedCookie, savedCookieValue,
  initializeCookieState, applySavedCookieToInput, persistCookieAfterSuccess, handleCookieFailure, clearSavedCookie,
} = useMihoyoCookieState()

const isNativePlatform = computed(() => canUseNativeMihoyoImport())

const { currentStep, cookie, remark, error, loading, setError, nextStep, prevStep, goToStep } = flow
const isFirstStep = flow.isFirstStep

const couponProcessing = ref(false)
const couponResults = ref([])
const claimedCoupons = ref([])
const submitting = ref(false)
const orderResult = ref(null)
const currentOrderQueued = ref(false)
const isPointOrder = ref(false)
const pointSelectingId = ref('')

const addressLoading = address.loading
const addressError = address.error
const addresses = address.addresses
const selectedAddressId = address.selectedAddressId
const selectedAddress = address.selectedAddress
const selectAddress = address.selectAddress
const formatAddress = address.formatAddress

const items = goods.items
const searchKeyword = goods.searchKeyword
const searchResults = goods.searchResults
const searching = goods.searching
const searchError = goods.searchError
const searchExpanded = goods.searchExpanded
const searchLoadingMore = goods.searchLoadingMore
const showSearchToggle = goods.showSearchToggle
const showSearchLoadMoreStatus = goods.showSearchLoadMoreStatus
const searchLoadMoreRef = goods.searchLoadMoreRef
const visibleSearchResults = goods.visibleSearchResults
const getSearchResultCover = goods.getSearchResultCover
const toggleSearchExpanded = goods.toggleSearchExpanded
const loadMoreSearchResults = goods.loadMoreSearchResults
const selectSearchResult = goods.selectSearchResult
const selectedSearchGoodsId = goods.selectedSearchGoodsId
const totalAmount = goods.totalAmount
const allCoupons = goods.allCoupons
const allGiftActivities = goods.allGiftActivities
const addItemFromSearch = goods.addItemFromSearch
const addItemsFromCart = goods.addItemsFromCart
const removeItem = goods.removeItem
const updateItemSku = goods.updateItemSku
const updateItemQuantity = goods.updateItemQuantity
const handleSearch = goods.handleSearch

async function handleSelectSearchResult(result) {
  if (result.is_added) return
  if (result.is_sold_out) {
    showToast(t('checkout.searchSoldOutHint'))
    return
  }
  selectSearchResult(result)
  const res = await addItemFromSearch(result, cookie.value, searchKeyword.value)
  if (res?.status === 'soldout') {
    showToast(t('checkout.searchSkuSoldOutHint'))
  } else if (res?.status === 'duplicate') {
    showToast(t('checkout.searchDuplicate'))
  } else if (res?.status === 'error') {
    showToast(t('checkout.searchAddFailed'))
  }
}

async function handleLongPressSearchResult(result) {
  if (!result.is_sold_out || result.is_added) return
  selectSearchResult(result)
  const res = await goods.forceAddItemFromSearch(result, cookie.value, searchKeyword.value)
  if (res?.status === 'forced') {
    showToast(t('checkout.searchForcedAdded'))
  } else if (res?.status === 'duplicate') {
    showToast(t('checkout.searchDuplicate'))
  } else if (res?.status === 'error') {
    showToast(t('checkout.searchAddFailed'))
  }
}

const pointBalance = points.point
const visiblePointGoods = points.visibleGoods
const activePointShopCode = points.activeShopCode
const pointLoading = points.loading
const pointError = points.error

const giftActivities = gifts.activities
const giftLoading = gifts.loading
const giftError = gifts.error
const toggleGift = gifts.toggleGift
const isGiftSelected = gifts.isGiftSelected
const getSelectedGiftItems = gifts.getSelectedGiftItems
const getMatchedStage = gifts.getMatchedStage
const isActivityActive = gifts.isActivityActive
const buildGiftPayload = gifts.buildGiftPayload

const queueItems = orderQueue.queue
const displayQueueItems = orderQueue.displayQueueItems
const activeQueueItems = orderQueue.activeQueueItems
const failedQueueItems = orderQueue.failedQueueItems
const queueProcessing = orderQueue.processing
const enqueueOrder = orderQueue.enqueueOrder
const removeQueuedOrder = orderQueue.removeQueuedOrder
const retryQueuedOrder = orderQueue.retryQueuedOrder
const syncServerClock = orderQueue.syncServerClock

const showQueueManager = ref(false)
const showLeaveConfirm = ref(false)

const timerEnabled = timer.enabled
const timerTargetTime = timer.targetTime
const remainingText = timer.remainingText
const setTargetTime = timer.setTargetTime
const setTimerEnabled = timer.setEnabled
const timerStartWatching = timer.startWatching
const timerStopWatching = timer.stopWatching

/* ── Step 页头 ── */
const displayStepKeys = computed(() => isPointOrder.value
  ? ['cookie', 'address', 'goods', 'review', 'submit']
  : STEPS.map((step) => step.key))
const displayStepIndex = computed(() => {
  const index = displayStepKeys.value.indexOf(currentStep.value.key)
  return index >= 0 ? index : flow.currentStepIndex.value
})
const displayStepCount = computed(() => displayStepKeys.value.length)
const displayProgress = computed(() => ((displayStepIndex.value + 1) / displayStepCount.value) * 100)

const totalPointCost = computed(() => items.value.reduce(
  (sum, item) => sum + (Number(item.pointCost) || 0) * Math.max(1, Number(item.quantity) || 1),
  0,
))

/* ── 底部主操作按钮 ── */
const stepAction = computed(() => {
  const key = currentStep.value.key
  switch (key) {
    case 'cookie':
      return {
        label: isNativePlatform.value ? t('checkout.loginAndFetch') : t('checkout.next'),
        handler: handleCookieNext,
        disabled: !isNativePlatform.value && !cookieValid.value && !canAutoSubmitSavedCookie.value,
        busy: loading.value,
      }
    case 'address':
      return {
        label: t('checkout.next'),
        handler: nextStep,
        disabled: !selectedAddressId.value || addressLoading.value,
        busy: addressLoading.value,
      }
    case 'goods':
      return {
        label: t('checkout.next'),
        handler: handleGoodsNext,
        disabled: !items.value.length || items.value.some((i) => i.loading || i.error) || (isPointOrder.value && totalPointCost.value > pointBalance.value),
        busy: false,
      }
    case 'coupon':
      return {
        label: t('checkout.next'),
        handler: handleCouponNext,
        disabled: couponProcessing.value,
        busy: couponProcessing.value,
      }
    case 'gifts':
      return {
        label: t('checkout.next'),
        handler: handleGiftsNext,
        disabled: giftLoading.value,
        busy: giftLoading.value,
      }
    case 'review':
      return {
        label: t('checkout.proceedToSubmit'),
        handler: nextStep,
        disabled: false,
        busy: false,
      }
    case 'submit': {
      if (submitting.value) {
        return { label: t('checkout.submitting'), handler: handleSubmit, disabled: true, busy: true }
      }
      if (timerEnabled.value) {
        return {
          label: queueSyncing.value ? t('checkout.syncingClock') : timerTargetTime.value ? `${t('checkout.addToQueue')}${remainingText.value ? ` · ${remainingText.value}` : ''}` : t('checkout.addToQueue'),
          handler: handleQueueOrder,
          disabled: !timerTargetTime.value || !items.value.length || items.value.some((i) => i.loading || i.error) || queueProcessing.value || queueSyncing.value,
          busy: queueProcessing.value || queueSyncing.value,
        }
      }
      return { label: t('checkout.placeOrder'), handler: handleSubmit, disabled: false, busy: false }
    }
    default:
      return { label: t('checkout.next'), handler: nextStep, disabled: false, busy: false }
  }
})

// 米游铺接口价格单位是「分」，÷100 转元后格式化
function formatFen(fen) {
  return formatPrice(Number(fen || 0) / 100)
}

// 优惠券不可叠加，只取可用的最优一张（减免最大）
const bestCoupon = computed(() => {
  const orderTotal = totalAmount.value
  let best = null
  for (const c of claimedCoupons.value) {
    const deduction = Number(c.deduction) || 0
    if (deduction <= 0) continue
    if (orderTotal < (Number(c.threshold) || 0)) continue
    if (!best || deduction > (Number(best.deduction) || 0)) best = c
  }
  return best
})

const discountAmount = computed(() => Number(bestCoupon.value?.deduction) || 0)

// 用券后的应付金额（最低为 0）
const payTotal = computed(() => Math.max(0, totalAmount.value - discountAmount.value))

function couponName(c) {
  return c.name || `满${((c.threshold || 0) / 100).toFixed(0)}减${((c.deduction || 0) / 100).toFixed(0)}`
}

const selectedGiftSections = computed(() => {
  if (isPointOrder.value) return []
  return giftActivities.value
    .map((activity) => {
      const stage = getMatchedStage(activity, totalAmount.value)
      const giftItems = getSelectedGiftItems(activity, totalAmount.value)
      if (!stage || !giftItems.length) return null
      return {
        activityId: activity.activityId,
        name: activity.name || t('checkout.giftActivity'),
        threshold: stage.threshold,
        num: stage.num,
        gifts: giftItems,
      }
    })
    .filter(Boolean)
})

// 当前选中 SKU 的单价（单位：分）
function getItemUnitPrice(item) {
  if (item.skus.length > 0) {
    const sku = item.skus.find((s) => s.id === item.selectedSkuId)
    return sku?.price ?? item.price
  }
  return item.price
}

function getItemPrice(item) {
  return getItemUnitPrice(item) * item.quantity
}

function formatSaleTime(ts) {
  if (!ts) return ''
  return new Date(ts * 1000).toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatQueueTime(ts) {
  if (!ts) return ''
  return formatDate(new Date(ts), 'YYYY-MM-DD HH:mm')
}

const showQueueDetail = ref(false)
const activeQueueDetail = ref(null)

function openQueueDetail(entry) {
  activeQueueDetail.value = entry
  showQueueDetail.value = true
}

function queueStatusText(entry) {
  switch (entry.status) {
    case 'success':
      return t('checkout.queueSuccess')
    case 'failed':
      return t('checkout.queueFailed')
    case 'running':
      return t('checkout.queueRunning')
    default:
      return t('checkout.queuePending')
  }
}

function getGiftImageUrl(gift) {
  return gift?.cover_url || gift?.img_url || gift?.image_url || gift?.goods_cover_url || ''
}

function getAvailableGifts(act, totalFee) {
  const stage = getMatchedStage(act, totalFee)
  if (!stage) return []
  // 全部展示（含已领完），库存为 0 的由模板置灰禁用
  return stage.gifts || []
}

// 未开始 / 已结束活动的提示文案（未开始附上开始时间）
function giftActivityStateText(act) {
  if (!act) return ''
  const nowSec = act.serverTime || Math.floor(Date.now() / 1000)
  if (act.startTime && nowSec < act.startTime) {
    const timeStr = formatSaleTime(act.startTime)
    return timeStr ? `${t('checkout.giftNotStarted')} · ${timeStr}` : t('checkout.giftNotStarted')
  }
  if (act.endTime && nowSec > act.endTime) return t('checkout.giftEnded')
  return ''
}

function pointShopLabel(shop) {
  const translated = t(shop.labelKey)
  return translated === shop.labelKey ? shop.fallback : translated
}

function isPointGoodsAffordable(item) {
  return Number(item?.point) <= Number(pointBalance.value)
}

async function loadPointGoods(force = false) {
  if (!cookie.value) return
  if (!force && points.loaded.value) return
  await points.load(cookie.value)
}

function setOrderMode(pointMode) {
  const next = Boolean(pointMode)
  if (isPointOrder.value === next) return
  isPointOrder.value = next
  goods.clearItems()
  setError('')
  if (next) void loadPointGoods()
}

async function selectPointGoods(pointGoodsItem) {
  if (!pointGoodsItem || pointSelectingId.value) return
  if (pointGoodsItem.is_sold_out || !isPointGoodsAffordable(pointGoodsItem)) return
  if (items.value.some((item) => item.goodsId === pointGoodsItem.goods_id)) return

  goods.clearItems()
  pointSelectingId.value = pointGoodsItem.goods_id
  try {
    const ok = await goods.addItemFromPointGoods(pointGoodsItem, cookie.value)
    if (!ok) setError(t('checkout.pointGoodsUnavailable'))
  } finally {
    pointSelectingId.value = ''
  }
}

function handlePreviousStep() {
  // 积分订单跳过优惠券/满赠，确认页返回时直接回到商品页。
  if (isPointOrder.value && currentStep.value.key === 'review') {
    goToStep(STEPS.findIndex((step) => step.key === 'goods'))
    return
  }
  prevStep()
}

const showTimerPicker = ref(false)
const timerDateTime = ref('')
const timerManuallySet = ref(false)
// 用当天零点作边界，日期 tab 不能选昨天以前
const timerMinDate = computed(() => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
})
const timerMaxDate = computed(() => {
  const d = new Date()
  d.setFullYear(d.getFullYear() + 5)
  d.setHours(0, 0, 0, 0)
  return d
})

const formattedTimerTarget = computed(() => {
  if (!timerTargetTime.value) return ''
  return formatDate(new Date(timerTargetTime.value), 'YYYY-MM-DD HH:mm')
})

function handleTimerToggle() {
  timerManuallySet.value = true
  setTimerEnabled(!timerEnabled.value)
}

function openTimerPicker() {
  const base = timerTargetTime.value || Date.now() + 60000
  timerDateTime.value = formatDate(new Date(base), 'YYYY-MM-DDTHH:mm')
  showTimerPicker.value = true
}

function onTimerConfirm(value) {
  const ts = new Date(String(value).replace(' ', 'T')).getTime()
  if (ts > Date.now()) {
    setTargetTime(ts)
    timerManuallySet.value = true
  } else {
    showToast(t('checkout.timerPast'))
  }
  showTimerPicker.value = false
}

// 进入下单步骤时：自动预填定时时间 = max(商品开售时间, 满赠活动开始时间) 中最晚的未来时刻
watch(() => currentStep.value.key, (key) => {
  if (key !== 'submit' || timerManuallySet.value) return
  let latest = 0
  for (const item of items.value) {
    const itemTs = Number(item.saleTime) * 1000
    if (itemTs > Date.now() && itemTs > latest) latest = itemTs
  }
  for (const act of giftActivities.value) {
    const actTs = Number(act.startTime) * 1000
    if (actTs > Date.now() && actTs > latest) latest = actTs
  }
  if (latest && latest !== timerTargetTime.value) {
    setTargetTime(latest)
    setTimerEnabled(true)
  }
})

// 定时下单：仅在「提交步骤 + 定时开启 + 已设时间」时启动倒计时展示
watch([timerEnabled, timerTargetTime, () => currentStep.value.key], ([enabled, target, key]) => {
  if (enabled && target && key === 'submit') {
    // 刷新服务器时钟偏移，确保自动预填时间的倒计时与服务器同步
    if (!timerManuallySet.value) {
      void syncServerClock(cookie.value)
    }
    timerStartWatching(() => {})
  } else {
    timerStopWatching()
  }
})

async function handleCookieNext() {
  let activeCookie = cookieInput.value.trim()
  if (!activeCookie && canAutoSubmitSavedCookie.value) {
    activeCookie = savedCookieValue.value
  }
  if (!activeCookie && isNativePlatform) {
    try {
      // 参考购物车导入流程：调用原生插件，内部会自动打开 WebView 让用户登录
      await importMihoyoCartWithSession()
      const nativeCookie = await getNativeMihoyoCookie()
      if (nativeCookie) activeCookie = nativeCookie
    } catch {}
  }
  if (!activeCookie) {
    setError(t('checkout.cookieRequired'))
    return
  }
  cookie.value = activeCookie
  loading.value = true
  try {
    await address.loadAddresses(cookie.value)
    await persistCookieAfterSuccess()
    nextStep()
  } catch (e) {
    if (isMihoyoCookieExpiredError(e)) {
      await handleCookieFailure(e)
      setError(t('checkout.cookieExpired'))
    } else {
      setError(e.message)
    }
  } finally {
    loading.value = false
  }
}

function handleGoodsNext() {
  if (!items.value.length) {
    setError(t('checkout.noGoods'))
    return
  }
  const invalid = items.value.find((item) => item.error)
  if (invalid) {
    setError(invalid.error)
    return
  }
  if (isPointOrder.value) {
    goToStep(STEPS.findIndex((step) => step.key === 'review'))
    return
  }
  if (isPointOrder.value && totalPointCost.value > pointBalance.value) {
    setError(t('checkout.notEnoughPoints'))
    return
  }
  nextStep()
  claimCoupons()
}

async function claimCoupons() {
  couponProcessing.value = true
  couponResults.value = []
  claimedCoupons.value = []
  const coupons = allCoupons.value
  const orderTotal = totalAmount.value

  for (const coupon of coupons) {
    const id = coupon.coupon_id || coupon.id || coupon.couponId
    const threshold = coupon.threshold || 0
    const deduction = coupon.deduction || 0
    const name = coupon.name || `满${(threshold / 100).toFixed(0)}减${(deduction / 100).toFixed(0)}`
    if (orderTotal >= threshold) {
      if (!id) {
        couponResults.value.push({ ...coupon, name, success: false })
        continue
      }
      const res = await receiveCoupon(id, cookie.value)
      // 已领取过 ≠ 失败：券已在手，下单时同样生效，按成功处理
      const alreadyClaimed = !res.ok && /领取过|已领取|已领过|重复领取|重复领取过/i.test(res.message || '')
      couponResults.value.push({ ...coupon, name, success: res.ok || alreadyClaimed, message: res.ok ? '' : (res.message || '') })
      if (res.ok || alreadyClaimed) claimedCoupons.value.push({ ...coupon, name })
    }
  }
  couponProcessing.value = false
}

function handleCouponNext() {
  nextStep()
  loadGifts()
}

async function loadGifts() {
  const refs = allGiftActivities.value
  if (!refs.length) return
  await gifts.loadActivities(refs, cookie.value, totalAmount.value)
}

// 商品增删/数量/款式变化时，重新匹配满赠阶梯并自动选中
watch(totalAmount, (newTotal) => {
  if (giftActivities.value.length) {
    gifts.autoSelectGifts(newTotal)
  }
})

// 定时抢购成功 → 写入 QQ 通知（需绑定 QQ 且开启对应开关）。
// 通过队列的 onCheckoutSuccess 订阅在「抢到那一刻」触发，
// 与队列里既有的 success 项无关，因此历史订单不会再次推送。
function handleCheckoutSuccess(entry) {
  if (!qqBinding.isBound || !qqBinding.checkoutNotify) return
  const orderNo = entry.result?.orderNo || ''
  const amount = entry.result?.amount || 0
  const productName = entry.result?.productName || ''
  const goodsText = entry.summary?.goodsText || ''
  const title = t('checkout.qqNotifyTitle')
  const contentLines = [
    `${t('checkout.qqNotifyBodyGreeting')}${goodsText || t('checkout.order')}`,
    ...(orderNo ? [t('checkout.orderNo') + '：' + orderNo] : []),
    ...(productName ? [productName] : []),
    ...(amount ? [t('checkout.qqNotifyAmount') + '：' + (amount / 100).toFixed(2)] : []),
    t('checkout.qqNotifyBody'),
  ]
  void createCheckoutNotify({ title, content: contentLines.join('\n') })
    .then(() => showToast(t('checkout.qqNotifySent')))
    .catch(() => showToast(t('checkout.qqNotifyFailed')))
}
let unsubscribeCheckoutSuccess = null

function handleGiftsNext() {
  nextStep()
}

function buildOrderSnapshot() {
  const itemsPayload = items.value.map((item) => ({
    goodsId: item.goodsId,
    skuId: item.selectedSkuId,
    shopCode: item.shopCode,
    nums: item.quantity,
    fromCart: Boolean(item.fromCart),
  }))
  const isFromShopCar = itemsPayload.length > 0 && itemsPayload.every((item) => item.fromCart)
  const giftPayload = isPointOrder.value
    ? []
    : buildGiftPayload(items.value[0]?.shopCode || '', totalAmount.value)
  return {
    itemsPayload,
    giftPayload,
    isFromShopCar,
    snapshot: {
      cookie: cookie.value,
      addressId: selectedAddressId.value,
      remark: remark.value,
      isFromShopCar,
      isPointOrder: isPointOrder.value,
      items: itemsPayload,
      giftActivities: giftPayload,
    },
    summary: {
      goodsText: `${isPointOrder.value ? `${t('checkout.pointExchange')}：` : ''}${items.value.map((item) => item.name || item.goodsId).filter(Boolean).join('、')}`,
      giftText: selectedGiftSections.value.map((activity) => `${activity.name}：${activity.gifts.map((gift) => gift.name).join('、')}`).filter(Boolean).join('；'),
    },
  }
}

/* ── 从购物车选择 ── */
const { isTabletViewport } = useTabletViewport()
const cartPickerPosition = computed(() => (isTabletViewport.value ? 'center' : 'bottom'))
const queueManagerPosition = computed(() => (isTabletViewport.value ? 'center' : 'bottom'))
const queueDetailPosition = computed(() => (isTabletViewport.value ? 'center' : 'bottom'))
const leaveConfirmPosition = computed(() => (isTabletViewport.value ? 'center' : 'bottom'))
const showCartPicker = ref(false)

function handleCartAdded(added) {
  if (added) {
    showToast(t('checkout.cartAdded', { n: added }))
  }
}

// 商品封面：优先取当前选中 SKU 的图，其次商品主图
function getItemCover(item) {
  const sku = item.skus.find((s) => s.id === item.selectedSkuId)
  return sku?.cover || item.cover || ''
}

// 锁定 SKU 的库存（购物车导入时）
function getLockedSkuStock(item) {
  const sku = item.skus.find((s) => s.id === item.selectedSkuId)
  return sku?.stock ?? -1
}

/**
 * 提交订单
 * @returns {{ok: boolean, retriable: boolean}} retriable 为 false 表示无需重试（如 cookie 失效）
 */
async function handleSubmit() {
  if (submitting.value) return { ok: false, retriable: false }
  submitting.value = true
  setError('')

  try {
    await orderQueue.syncServerClock(cookie.value, true)
    if (items.value.some((item) => item.error)) {
      throw new Error(items.value.find((item) => item.error)?.error || t('checkout.orderFailed'))
    }

    const { itemsPayload, giftPayload, isFromShopCar } = buildOrderSnapshot()

    const result = await submitCheckoutOrder(cookie.value, {
      addressId: selectedAddressId.value,
      items: itemsPayload,
      giftActivities: giftPayload,
      isFromShopCar,
      remark: remark.value,
    })

    orderResult.value = result
    showToast(t('checkout.orderSuccess'))
    return { ok: true, retriable: true }
  } catch (e) {
    if (isMihoyoCookieExpiredError(e)) {
      await handleCookieFailure(e)
      setError(t('checkout.cookieExpired'))
      return { ok: false, retriable: false }
    }
    setError(e.message || t('checkout.orderFailed'))
    return { ok: false, retriable: true }
  } finally {
    submitting.value = false
  }
}

const queueSyncing = ref(false)

async function handleQueueOrder() {
  if (queueProcessing.value || queueSyncing.value) return
  if (!timerEnabled.value || !timerTargetTime.value) {
    setError(t('checkout.timerPast'))
    return
  }
  if (!items.value.length || !selectedAddressId.value) {
    setError(t('checkout.noGoods'))
    return
  }
  const invalid = items.value.find((item) => item.error)
  if (invalid) {
    setError(invalid.error)
    return
  }

  queueSyncing.value = true
  try {
    // 不强制刷新：60s TTL 内命中缓存的时钟偏移即可，避免加入队列前串行等网络同步拖慢响应
    const serverNow = await orderQueue.syncServerClock(cookie.value, false)
    const offsetMs = serverNow - Date.now()
    const { itemsPayload, giftPayload, snapshot, summary } = buildOrderSnapshot()
    enqueueOrder({
      scheduledAt: timerManuallySet.value ? timerTargetTime.value + offsetMs : timerTargetTime.value,
      displayAt: timerTargetTime.value,
      retryCount: retryCount.value,
      concurrency: concurrency.value,
      snapshot: {
        ...snapshot,
        items: itemsPayload,
        giftActivities: giftPayload,
        displayAt: timerTargetTime.value,
      },
      summary,
    })
  } finally {
    queueSyncing.value = false
  }

  currentOrderQueued.value = true
  showToast(t('checkout.queueAdded', { n: 1 }))
}

const retryCount = ref(3)

function decreaseRetryCount() {
  if (retryCount.value === Infinity) {
    retryCount.value = 10
    return
  }
  retryCount.value = Math.max(0, retryCount.value - 1)
}

function increaseRetryCount() {
  if (retryCount.value === Infinity) return
  retryCount.value = Math.min(10, retryCount.value + 1)
}

function setInfiniteRetry() {
  retryCount.value = Infinity
}

// 同一笔订单的并发提交数（1-5），应对热门商品
const maxConcurrency = 5
const concurrency = ref(1)

function decreaseConcurrency() {
  concurrency.value = Math.max(1, concurrency.value - 1)
}

function increaseConcurrency() {
  concurrency.value = Math.min(maxConcurrency, concurrency.value + 1)
}

function handleBack() {
  if (!orderResult.value && items.value.length && !currentOrderQueued.value) {
    showLeaveConfirm.value = true
    return
  }
  leaveCheckout()
}

function confirmLeave() {
  showLeaveConfirm.value = false
  leaveCheckout()
}

function leaveCheckout() {
  runWithRouteTransition(() => router.push('/manage'), { direction: 'back' })
}

useDialogBackButton(() => {
  if (showLeaveConfirm.value) {
    showLeaveConfirm.value = false
    return
  }
  handleBack()
}, computed(() => !orderResult.value))

onMounted(async () => {
  await initializeCookieState()
  // 加载 QQ 绑定状态（决定定时抢购成功通知开关是否可用）
  await qqBinding.init().catch(() => {})
  // 订阅「抢购成功」事件：只在真正抢到那一刻触发一次，不含历史/遗留成功项
  unsubscribeCheckoutSuccess = orderQueue.onCheckoutSuccess(handleCheckoutSuccess)
  // 有已保存的有效 cookie 时，自动完成登录并直接进入地址步骤
  if (canAutoSubmitSavedCookie.value) {
    applySavedCookieToInput()
    await handleCookieNext()
  }
  // 从「我的」页快速进入队列管理（/checkout?queue=1）
  if (route.query?.queue && queueItems.value.length) {
    showQueueManager.value = true
  }
})

onUnmounted(() => {
  timerStopWatching()
  unsubscribeCheckoutSuccess?.()
})
</script>

<style scoped>
.checkout-page .page-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 10px var(--page-padding) 130px;
}

/* 每个步骤的区块：内部卡片之间保持间距（由各步骤组件内联的自包含样式负责） */

/* ── 底部浮动操作栏 ── */
.float-footer {
  position: fixed;
  left: 50%;
  bottom: max(20px, env(safe-area-inset-bottom));
  transform: translateX(-50%);
  width: min(calc(100vw - 32px), 420px);
  z-index: var(--z-float);
  pointer-events: none;
}

.float-footer__btns {
  display: flex;
  gap: 10px;
  pointer-events: auto;
}

.btn-float {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 52px;
  border: none;
  border-radius: var(--radius-card);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.02em;
  box-shadow: var(--app-shadow);
  transition: transform var(--motion-fast) var(--motion-ease-default), opacity var(--motion-fast) ease;
}

.btn-float:active:not(:disabled) {
  transform: scale(0.98);
}

.btn-float--primary {
  background: var(--app-text);
  color: var(--app-surface);
}

.btn-float--ghost {
  background: var(--app-surface-soft);
  color: var(--app-text);
}

.btn-float--primary:disabled,
.btn-float--ghost:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-float .parse-spinner {
  width: 16px;
  height: 16px;
  border-width: 2px;
}

@media (min-width: 900px) {
  .float-footer {
    width: min(calc(100vw - 48px), 520px);
  }
}

/* ── 队列入口 ── */
.queue-entry-btn {
  position: relative;
}

.queue-entry-btn__badge {
  position: absolute;
  right: -4px;
  top: -4px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: #c74444;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  line-height: 16px;
  text-align: center;
  box-shadow: 0 0 0 2px var(--app-bg);
}

/* ── 离开确认 ── */
.leave-confirm-popup {
  overflow: hidden;
}

.leave-confirm {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 22px 20px calc(env(safe-area-inset-bottom, 0px) + 18px);
}

.leave-confirm__content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.leave-confirm__title {
  margin: 0;
  color: var(--app-text);
  font-size: 18px;
  font-weight: 700;
}

.leave-confirm__message {
  margin: 0;
  color: var(--app-text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.leave-confirm__actions {
  display: flex;
  gap: 10px;
}

.leave-confirm__button {
  flex: 1;
  min-height: 44px;
  border: none;
  border-radius: var(--radius-small);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.leave-confirm__button--secondary {
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
}

.leave-confirm__button--primary {
  background: var(--app-text);
  color: var(--app-surface);
}

/* ── 过渡 ── */
.step-fade-enter-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.step-fade-leave-active {
  transition: opacity 0.18s ease;
}

.step-fade-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.step-fade-leave-to {
  opacity: 0;
}
</style>
