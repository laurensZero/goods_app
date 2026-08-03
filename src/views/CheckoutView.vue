<template>
  <div class="page checkout-page">
    <NavBar :title="t('checkout.title')" show-back @back="handleBack" />

    <main class="page-body">
      <StepProgress :progress="progress" />

      <Transition name="step-fade" mode="out-in">
        <!-- Step 0: Cookie -->
        <section v-if="currentStep.key === 'cookie'" key="cookie" class="form-section">
          <div class="section-head">
            <p class="section-label">{{ stepLabel }}</p>
            <h2 class="section-title">{{ stepTitle }}</h2>
          </div>

          <div class="field-card">
            <div class="cookie-info">
              <div class="cookie-info__icon">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 8v4" />
                  <circle cx="12" cy="16" r="1" fill="currentColor" />
                </svg>
              </div>
              <div class="cookie-info__body">
                <template v-if="isNativePlatform">
                  <p class="cookie-info__title">{{ t('import.nativeLoginTitle') }}</p>
                  <ol class="cookie-info__steps">
                    <li>{{ t('import.nativeStep1') }}</li>
                    <li>{{ t('import.nativeStep2') }}</li>
                    <li>{{ t('import.nativeStep3') }}</li>
                    <li>{{ t('import.nativeStep4Cart') }}</li>
                  </ol>
                </template>
                <template v-else>
                  <p class="cookie-info__title">{{ t('import.howToGetCookie') }}</p>
                  <ol class="cookie-info__steps">
                    <li>{{ t('import.cartCookieStep1') }}</li>
                    <li>{{ t('import.cartCookieStep2') }}</li>
                    <li>{{ t('import.cartCookieStep3') }}</li>
                    <li>{{ t('import.cartCookieStep4') }}</li>
                    <li>{{ t('import.cartCookieStep5') }}</li>
                  </ol>
                </template>
              </div>
            </div>
          </div>

          <div v-if="!isNativePlatform" class="field">
            <span class="field-label">{{ t('import.pasteCookie') }}</span>
            <textarea
              v-model="cookieInput"
              class="cookie-textarea"
              :placeholder="t('import.cookiePlaceholder')"
              spellcheck="false"
              autocomplete="off"
            />
            <p v-if="cookieInput && !cookieValid" class="field-error">{{ t('import.cookieInvalid') }}</p>
          </div>

          <div v-if="!isNativePlatform" class="cookie-actions">
            <label class="remember-row">
              <input v-model="rememberCookie" class="remember-checkbox" type="checkbox" />
              <span>{{ t('import.rememberCookie') }}</span>
            </label>
            <button v-if="hasSavedCookie" class="link-btn" type="button" @click="clearSavedCookie(false)">
              {{ t('import.clearSaved') }}
            </button>
          </div>
          <p v-if="cookieWarningMessage" class="cookie-tip cookie-tip--warn">{{ cookieWarningMessage }}</p>
        </section>

        <!-- Step 1: Address -->
        <section v-else-if="currentStep.key === 'address'" key="address" class="form-section">
          <div class="section-head">
            <p class="section-label">{{ stepLabel }}</p>
            <h2 class="section-title">{{ stepTitle }}</h2>
          </div>

          <div v-if="addressLoading" class="loading-state">
            <div class="parse-spinner" />
            <p class="loading-text">{{ t('checkout.fetchingAddress') }}</p>
          </div>
          <template v-else>
            <p v-if="addressError" class="step-error">{{ addressError }}</p>
            <div v-if="!addresses.length" class="field-card">
              <p class="empty-hint">{{ t('checkout.noAddress') }}</p>
            </div>
            <div v-else class="address-list">
              <button
                v-for="addr in addresses"
                :key="addr.id"
                type="button"
                class="address-card"
                :class="{ 'address-card--selected': selectedAddressId === String(addr.id) }"
                @click="selectAddress(addr.id)"
              >
                <div class="address-card__radio">
                  <span class="radio-dot" :class="{ 'radio-dot--on': selectedAddressId === String(addr.id) }" />
                </div>
                <div class="address-card__body">
                  <div class="address-card__head">
                    <span class="address-card__name">{{ addr.connect_name }}</span>
                    <span class="address-card__phone">{{ addr.phone }}</span>
                    <span v-if="addr.is_default" class="address-card__badge">{{ t('checkout.default') }}</span>
                  </div>
                  <p class="address-card__detail">{{ formatAddress(addr) }}</p>
                </div>
              </button>
            </div>
          </template>
        </section>

        <!-- Step 2: Goods -->
        <section v-else-if="currentStep.key === 'goods'" key="goods" class="form-section">
          <div class="section-head">
            <p class="section-label">{{ stepLabel }}</p>
            <h2 class="section-title">{{ stepTitle }}</h2>
          </div>

          <div class="field-card">
            <div class="search-row">
              <input
                v-model="searchKeyword"
                type="text"
                class="search-input"
                :placeholder="t('checkout.searchOrUrl')"
                @keydown.enter.prevent="handleSearch(cookie)"
              />
              <button class="search-btn" type="button" :disabled="searching" @click="handleSearch(cookie)">
                {{ searching ? t('import.searching') : t('common.search') }}
              </button>
            </div>
            <p v-if="searchError" class="field-error">{{ searchError }}</p>

            <div v-if="searchResults.length" class="search-results">
              <button
                v-for="r in searchResults"
                :key="r.goods_id"
                type="button"
                class="search-result-row"
                @click="addItemFromSearch(r, cookie)"
              >
                <img v-if="r.cover_url" :src="r.cover_url" class="search-result-thumb" loading="lazy" />
                <span class="search-result-name">{{ r.name }}</span>
              </button>
            </div>

            <button class="cart-entry" type="button" @click="openCartPicker">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="9" cy="20" r="1.5" />
                <circle cx="18" cy="20" r="1.5" />
                <path d="M3 4h2l2.2 10.2a1 1 0 0 0 1 .8h9.9a1 1 0 0 0 1-.77L21 7H7.4" />
              </svg>
              <span>{{ t('checkout.fromCart') }}</span>
              <svg class="cart-entry__arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>

          <div v-if="!items.length" class="field-card">
            <p class="empty-hint">{{ t('checkout.addGoodsHint') }}</p>
          </div>

          <TransitionGroup name="goods-expand" tag="div" class="checkout-items">
            <div v-for="item in items" :key="item.id" class="field-card checkout-item">
              <div v-if="item.loading" class="item-loading">
                <div class="parse-spinner" />
              </div>
              <template v-else>
                <div v-if="item.error" class="item-error">{{ item.error }}</div>
                <div class="item-head">
                  <img v-if="getItemCover(item)" :src="getItemCover(item)" class="item-cover" loading="lazy" />
                  <div class="item-info">
                    <h3 class="item-name">{{ item.name || item.goodsId }}</h3>
                    <p class="item-price">{{ formatFen(getItemUnitPrice(item)) }}</p>
                  </div>
                  <button class="item-remove" type="button" :aria-label="t('common.delete')" @click="removeItem(item.id)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>

                <!-- SKU selector：购物车带 SKU 的不再选择，仅展示 -->
                <div v-if="!item.skuLocked && item.skus.length > 1" class="sku-section">
                  <p class="sku-label">{{ t('checkout.sku') }}</p>
                  <div class="sku-chips">
                    <button
                      v-for="sku in item.skus"
                      :key="sku.id"
                      type="button"
                      class="sku-chip"
                      :class="{ 'sku-chip--selected': item.selectedSkuId === sku.id, 'sku-chip--disabled': sku.soldOut }"
                      :disabled="sku.soldOut"
                      @click="updateItemSku(item.id, sku.id, sku.text)"
                    >
                      {{ sku.text }}
                      <span v-if="sku.soldOut" class="sku-chip__soldout">{{ t('checkout.soldOut') }}</span>
                      <span v-else-if="sku.stock >= 0" class="sku-chip__stock">{{ t('checkout.stock', { n: sku.stock }) }}</span>
                    </button>
                  </div>
                </div>
                <p v-else-if="item.skuLocked && item.selectedSkuText" class="item-sku-locked">
                  {{ t('checkout.sku') }}：{{ item.selectedSkuText }}
                </p>

                <!-- Quantity -->
                <div class="qty-row">
                  <span class="qty-label">{{ t('checkout.quantity') }}</span>
                  <div class="qty-controls">
                    <button type="button" class="qty-btn" :disabled="item.quantity <= 1" @click="updateItemQuantity(item.id, item.quantity - 1)">−</button>
                    <span class="qty-value">{{ item.quantity }}</span>
                    <button type="button" class="qty-btn" @click="updateItemQuantity(item.id, item.quantity + 1)">+</button>
                  </div>
                </div>

                <!-- Sale time -->
                <p v-if="item.saleTime && item.saleTime * 1000 > Date.now()" class="item-sale-time">
                  {{ t('checkout.saleTime') }}: {{ formatSaleTime(item.saleTime) }}
                </p>
              </template>
            </div>
          </TransitionGroup>
        </section>

        <!-- Step 3: Coupon (auto) -->
        <section v-else-if="currentStep.key === 'coupon'" key="coupon" class="form-section">
          <div class="section-head">
            <p class="section-label">{{ stepLabel }}</p>
            <h2 class="section-title">{{ stepTitle }}</h2>
          </div>

          <div v-if="couponProcessing" class="loading-state">
            <div class="parse-spinner" />
            <p class="loading-text">{{ t('checkout.claimingCoupons') }}</p>
            <p class="loading-sub">{{ t('checkout.pleaseWait') }}</p>
          </div>
          <template v-else>
            <div class="field-card">
              <div v-if="couponResults.length" class="coupon-list">
                <div v-for="c in couponResults" :key="c.coupon_id" class="coupon-item" :class="{ 'coupon-item--ok': c.success }">
                  <span class="coupon-item__icon">{{ c.success ? '✓' : '✗' }}</span>
                  <span class="coupon-item__name">{{ c.name || c.coupon_id }}</span>
                  <span class="coupon-item__status">{{ c.success ? t('checkout.couponClaimed') : (c.message || t('checkout.couponFailed')) }}</span>
                </div>
              </div>
              <p v-else class="empty-hint">{{ t('checkout.noCoupons') }}</p>
            </div>
          </template>
        </section>

        <!-- Step 4: Gifts -->
        <section v-else-if="currentStep.key === 'gifts'" key="gifts" class="form-section">
          <div class="section-head">
            <p class="section-label">{{ stepLabel }}</p>
            <h2 class="section-title">{{ stepTitle }}</h2>
          </div>

          <div v-if="giftLoading" class="loading-state">
            <div class="parse-spinner" />
            <p class="loading-text">{{ t('checkout.loadingGifts') }}</p>
          </div>
          <template v-else>
            <p v-if="giftError" class="step-error">{{ giftError }}</p>
            <div v-if="!giftActivities.length" class="field-card">
              <p class="empty-hint">{{ t('checkout.noGifts') }}</p>
            </div>
            <div v-else class="gift-sections">
              <div v-for="act in giftActivities" :key="act.activityId" class="field-card">
                <p class="gift-activity__title">{{ act.name || t('checkout.giftActivity') }}</p>
                <template v-if="getMatchedStage(act, totalAmount)">
                  <p class="gift-activity__tier">
                    {{ t('checkout.tierThreshold', { amount: formatFen(getMatchedStage(act, totalAmount)?.threshold || 0) }) }}
                    — {{ t('checkout.selectN', { n: getMatchedStage(act, totalAmount).num }) }}
                  </p>
                  <div class="gift-grid">
                    <button
                      v-for="gift in getAvailableGifts(act, totalAmount)"
                      :key="gift.goods_id"
                      type="button"
                      class="gift-card"
                      :class="{
                        'gift-card--selected': isGiftSelected(act.activityId, gift.goods_id),
                        'gift-card--soldout': gift.stock <= 0,
                      }"
                      :disabled="gift.stock <= 0"
                      @click="toggleGift(act.activityId, gift.goods_id, getMatchedStage(act, totalAmount)?.num || 1)"
                    >
                      <div class="gift-card__check">
                        <svg v-if="isGiftSelected(act.activityId, gift.goods_id)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </div>
                      <span class="gift-card__name">{{ gift.name }}</span>
                      <span class="gift-card__stock">
                        {{ gift.stock <= 0 ? t('checkout.soldOut') : t('checkout.stock', { n: gift.stock }) }}
                      </span>
                    </button>
                  </div>
                </template>
                <p v-else class="gift-activity__empty">{{ t('checkout.giftThresholdNotMet') }}</p>
              </div>
            </div>
          </template>
        </section>

        <!-- Step 5: Review -->
        <section v-else-if="currentStep.key === 'review'" key="review" class="form-section">
          <div class="section-head">
            <p class="section-label">{{ stepLabel }}</p>
            <h2 class="section-title">{{ stepTitle }}</h2>
          </div>

          <div class="field-card">
            <p class="card-label">{{ t('checkout.orderItems') }}</p>
            <div v-for="item in items" :key="item.id" class="review-item">
              <p class="review-item__name">{{ item.name }}</p>
              <div class="review-item__meta">
                <span class="review-item__sku">{{ item.selectedSkuText || '' }}</span>
                <span class="review-item__qty">x{{ item.quantity }}</span>
                <span class="review-item__price">{{ formatFen(getItemPrice(item)) }}</span>
              </div>
            </div>
          </div>

          <div class="field-card">
            <p class="card-label">{{ t('checkout.shippingAddress') }}</p>
            <p v-if="selectedAddress" class="review-address">
              {{ selectedAddress.connect_name }} {{ selectedAddress.phone }}<br />
              {{ formatAddress(selectedAddress) }}
            </p>
          </div>

          <div class="field">
            <span class="field-label">{{ t('checkout.remark') }}</span>
            <input v-model="remark" type="text" :placeholder="t('checkout.remarkPlaceholder')" maxlength="50" />
          </div>

          <div class="review-total">
            <div class="review-total__row">
              <span>{{ t('checkout.goodsAmount') }}</span>
              <span>{{ formatFen(totalAmount) }}</span>
            </div>
            <div v-if="bestCoupon" class="review-total__row review-total__row--discount">
              <span>{{ couponName(bestCoupon) }}</span>
              <span>-{{ formatFen(discountAmount) }}</span>
            </div>
            <div class="review-total__row review-total__row--pay">
              <span>{{ t('checkout.total') }}</span>
              <span class="review-total__amount">{{ formatFen(payTotal) }}</span>
            </div>
          </div>
        </section>

        <!-- Step 6: Submit -->
        <section v-else-if="currentStep.key === 'submit'" key="submit" class="form-section">
          <div v-if="!orderResult" class="section-head">
            <p class="section-label">{{ stepLabel }}</p>
            <h2 class="section-title">{{ stepTitle }}</h2>
          </div>

          <template v-if="!orderResult">
            <div class="field-card">
              <div class="timer-header">
                <h3 class="timer-title">{{ t('checkout.scheduledPurchase') }}</h3>
                <button type="button" class="timer-toggle" :aria-pressed="timerEnabled" @click="handleTimerToggle">
                  <div class="save-char-toggle" :class="{ 'save-char-toggle--on': timerEnabled }">
                    <div class="save-char-knob" />
                  </div>
                </button>
              </div>
              <div v-if="timerEnabled" class="timer-body">
                <p class="timer-hint">{{ t('checkout.timerHint') }}</p>
                <button class="timer-field" type="button" @click="openTimerPicker">
                  <span :class="{ 'timer-field__placeholder': !timerTargetTime }">
                    {{ timerTargetTime ? formattedTimerTarget : t('checkout.selectTime') }}
                  </span>
                  <svg class="timer-field__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M12 2v4M12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12z" />
                    <path d="M12 9v3l2 2" />
                  </svg>
                </button>
                <p v-if="timerTargetTime" class="timer-countdown">
                  {{ t('checkout.countdown') }}: <strong>{{ remainingText }}</strong>
                </p>
                <div class="retry-row">
                  <span class="retry-label">{{ t('checkout.retryCount') }}</span>
                  <div class="retry-controls">
                    <div class="qty-controls">
                      <button type="button" class="qty-btn" :disabled="retryCount === 0" @click="decreaseRetryCount">−</button>
                      <span class="qty-value">{{ retryCount === Infinity ? '∞' : retryCount }}</span>
                      <button type="button" class="qty-btn" @click="increaseRetryCount">+</button>
                    </div>
                    <button
                      type="button"
                      class="retry-infinite"
                      :class="{ 'retry-infinite--active': retryCount === Infinity }"
                      :aria-label="t('checkout.retryForever')"
                      @click="setInfiniteRetry"
                    >∞</button>
                  </div>
                </div>
              </div>
            </div>

            <p v-if="error" class="step-error">{{ error }}</p>
          </template>

          <!-- Order success -->
          <template v-else>
            <div class="order-success">
              <div class="order-success__icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
              <h2 class="order-success__title">{{ t('checkout.orderCreated') }}</h2>
              <p class="order-success__amount">{{ formatFen(orderResult.amount || 0) }}</p>
              <div class="order-success__info">
                <p>{{ t('checkout.orderNo') }}: {{ orderResult.orderNo }}</p>
                <p v-if="orderResult.productName" class="order-success__product">{{ orderResult.productName }}</p>
              </div>
              <p class="order-success__hint">{{ t('checkout.payInMihoyoApp') }}</p>
            </div>
          </template>
        </section>
      </Transition>
    </main>

    <!-- Floating action footer -->
    <div v-if="!orderResult" class="float-footer">
      <div class="float-footer__btns">
        <button v-if="!isFirstStep" class="btn-float btn-float--ghost" type="button" @click="prevStep">
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

    <!-- 从购物车选择 -->
    <Popup
      v-model:show="showCartPicker"
      :position="cartPickerPosition"
      :round="!isTabletViewport"
      :lock-scroll="false"
      :class="['picker-popup', { 'picker-popup--center': isTabletViewport }]"
    >
      <div class="cart-picker">
        <p class="cart-picker__title">{{ t('checkout.fromCart') }}</p>

        <div v-if="cartLoading" class="loading-state">
          <div class="parse-spinner" />
          <p class="loading-text">{{ t('checkout.loadingCart') }}</p>
        </div>
        <p v-else-if="cartError" class="step-error cart-picker__error">{{ cartError }}</p>
        <p v-else-if="!cartItems.length" class="empty-hint cart-picker__empty">{{ t('checkout.cartEmpty') }}</p>
        <ul v-else class="cart-picker__list">
          <li
            v-for="item in cartItems"
            :key="item.key"
            class="cart-picker-item"
            :class="{ 'cart-picker-item--selected': cartSelected.has(item.key) }"
            @click="toggleCartItem(item.key)"
          >
            <img v-if="item.cover" :src="item.cover" class="cart-picker-item__thumb" loading="lazy" />
            <span v-else class="cart-picker-item__thumb cart-picker-item__thumb--fallback">{{ (item.name || '?').charAt(0) }}</span>
            <div class="cart-picker-item__body">
              <p class="cart-picker-item__name">{{ item.name }}</p>
              <p v-if="item.skuText" class="cart-picker-item__sku">{{ item.skuText }}</p>
            </div>
            <span class="cart-picker-item__check">
              <svg v-if="cartSelected.has(item.key)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
          </li>
        </ul>

        <div class="cart-picker__actions">
          <button class="cart-picker-btn cart-picker-btn--cancel" type="button" @click="showCartPicker = false">
            {{ t('common.cancel') }}
          </button>
          <button
            class="cart-picker-btn cart-picker-btn--confirm"
            type="button"
            :disabled="!cartSelected.size || cartAdding"
            @click="handleAddFromCart"
          >
            <span v-if="cartAdding" class="parse-spinner" />
            {{ t('checkout.addSelected', { n: cartSelected.size }) }}
          </button>
        </div>
      </div>
    </Popup>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { runWithRouteTransition } from '@/utils/routeTransition'
import { useI18n } from 'vue-i18n'
import { Popup } from 'vant'
import NavBar from '@/components/common/NavBar.vue'
import AppDateTimePicker from '@/components/common/AppDateTimePicker.vue'
import StepProgress from '@/components/checkout/StepProgress.vue'
import { useCheckoutFlow, STEPS } from '@/composables/checkout/useCheckoutFlow'
import { useCheckoutAddress } from '@/composables/checkout/useCheckoutAddress'
import { useCheckoutGoods } from '@/composables/checkout/useCheckoutGoods'
import { useCheckoutGifts } from '@/composables/checkout/useCheckoutGifts'
import { useCheckoutTimer } from '@/composables/checkout/useCheckoutTimer'
import { useMihoyoCookieState } from '@/composables/import/useMihoyoCookieState'
import { useTabletViewport } from '@/composables/useTabletViewport'
import { receiveCoupon, preCreateOrder, createOrder } from '@/utils/mihoyo/checkout'
import { canUseNativeMihoyoImport, getNativeMihoyoCookie, importMihoyoCartWithSession } from '@/utils/mihoyo/nativeImport'
import { formatPrice, formatDate } from '@/utils/format'
import { useToast } from '@/composables/useToast'
import { useDialogBackButton } from '@/composables/useDialogBackButton'
import { isMihoyoCookieExpiredError, fetchCartList } from '@/utils/mihoyo/index'

const router = useRouter()
const { t } = useI18n()
const { showToast } = useToast()

const flow = useCheckoutFlow()
const address = useCheckoutAddress()
const goods = useCheckoutGoods()
const gifts = useCheckoutGifts()
const timer = useCheckoutTimer()

const {
  cookieInput, rememberCookie, hasSavedCookie, cookieValid,
  cookieWarningMessage, canAutoSubmitSavedCookie, savedCookieValue,
  initializeCookieState, applySavedCookieToInput, persistCookieAfterSuccess, handleCookieFailure, clearSavedCookie,
} = useMihoyoCookieState()

const isNativePlatform = computed(() => canUseNativeMihoyoImport())

const { currentStepIndex, currentStep, isFirstStep, progress, cookie, remark, error, loading, setError, nextStep, prevStep } = flow

const couponProcessing = ref(false)
const couponResults = ref([])
const claimedCoupons = ref([])
const submitting = ref(false)
const orderResult = ref(null)

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
const totalAmount = goods.totalAmount
const allCoupons = goods.allCoupons
const allGiftActivities = goods.allGiftActivities
const addItemFromSearch = goods.addItemFromSearch
const addItemFromCart = goods.addItemFromCart
const removeItem = goods.removeItem
const updateItemSku = goods.updateItemSku
const updateItemQuantity = goods.updateItemQuantity
const handleSearch = goods.handleSearch

const giftActivities = gifts.activities
const giftLoading = gifts.loading
const giftError = gifts.error
const toggleGift = gifts.toggleGift
const isGiftSelected = gifts.isGiftSelected
const getMatchedStage = gifts.getMatchedStage
const buildGiftPayload = gifts.buildGiftPayload

const timerEnabled = timer.enabled
const timerTargetTime = timer.targetTime
const remainingText = timer.remainingText
const setTargetTime = timer.setTargetTime
const setTimerEnabled = timer.setEnabled
const timerStartWatching = timer.startWatching
const timerStopWatching = timer.stopWatching

/* ── Step 页头 ── */
const stepLabel = computed(() =>
  t('checkout.stepLabel', { current: currentStepIndex.value + 1, total: STEPS.length })
)
const stepTitle = computed(() => {
  const key = currentStep.value.key
  return t(`checkout.step${key.charAt(0).toUpperCase()}${key.slice(1)}`)
})

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
        disabled: !items.value.length || items.value.some((i) => i.loading),
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
        // 定时模式：设好时间后到点自动下单，按钮仅作倒计时/重试展示
        const label = scheduledRetrying.value
          ? t('checkout.retrying', { n: retryDisplay.value.n, total: retryDisplay.value.total })
          : timerTargetTime.value
            ? `${t('checkout.scheduleOrder')}${remainingText.value ? ` · ${remainingText.value}` : ''}`
            : t('checkout.scheduleOrder')
        return { label, handler: () => {}, disabled: true, busy: false }
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

function getAvailableGifts(act, totalFee) {
  const stage = getMatchedStage(act, totalFee)
  if (!stage) return []
  // 全部展示（含已领完），库存为 0 的由模板置灰禁用
  return stage.gifts || []
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

// 进入下单步骤时：若已添加的商品含晚于当前的开售时间，自动预填并开启定时
watch(() => currentStep.value.key, (key) => {
  if (key !== 'submit' || timerManuallySet.value) return
  let latest = 0
  for (const item of items.value) {
    const t = Number(item.saleTime) * 1000
    if (t > Date.now() && t > latest) latest = t
  }
  if (latest && latest !== timerTargetTime.value) {
    setTargetTime(latest)
    setTimerEnabled(true)
  }
})

// 定时下单：仅在「提交步骤 + 定时开启 + 已设时间」时启动到点自动下单（失败自动重试）
watch([timerEnabled, timerTargetTime, () => currentStep.value.key], ([enabled, target, key]) => {
  if (enabled && target && key === 'submit') {
    timerStartWatching(() => fireScheduledSubmit())
  } else {
    timerStopWatching()
    clearScheduledRetry()
  }
})

onUnmounted(clearScheduledRetry)

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
  await persistCookieAfterSuccess()
  loading.value = true
  try {
    await address.loadAddresses(cookie.value)
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
  nextStep()
  claimCoupons()
}

async function claimCoupons() {
  couponProcessing.value = true
  couponResults.value = []
  claimedCoupons.value = []
  const coupons = allCoupons.value
  const orderTotal = totalAmount.value
  console.log('[checkout] coupons to claim:', coupons.length, 'orderTotal:', orderTotal)

  for (const coupon of coupons) {
    const id = coupon.coupon_id || coupon.id || coupon.couponId
    const threshold = coupon.threshold || 0
    const deduction = coupon.deduction || 0
    const name = coupon.name || `满${(threshold / 100).toFixed(0)}减${(deduction / 100).toFixed(0)}`
    console.log('[checkout] coupon:', { id, threshold, deduction, name, orderTotal })
    if (orderTotal >= threshold) {
      if (!id) {
        console.warn('[checkout] coupon missing id:', coupon)
        couponResults.value.push({ ...coupon, name, success: false })
        continue
      }
      const res = await receiveCoupon(id, cookie.value)
      console.log('[checkout] coupon claim result:', id, res)
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

function handleGiftsNext() {
  nextStep()
}

/* ── 从购物车选择 ── */
const { isTabletViewport } = useTabletViewport()
const cartPickerPosition = computed(() => (isTabletViewport.value ? 'center' : 'bottom'))
const showCartPicker = ref(false)
const cartLoading = ref(false)
const cartError = ref('')
const cartItems = ref([])
const cartSelected = ref(new Set())
const cartAdding = ref(false)

function openCartPicker() {
  // 先立即打开弹窗显示加载态，再后台拉取购物车
  showCartPicker.value = true
  if (!cartItems.value.length && !cartLoading.value) {
    loadCartItems()
  }
}

async function loadCartItems() {
  cartLoading.value = true
  cartError.value = ''
  try {
    const shops = await fetchCartList(cookie.value)
    cartItems.value = flattenCart(shops)
  } catch (e) {
    cartError.value = e.message || '加载购物车失败'
  } finally {
    cartLoading.value = false
  }
}

function flattenCart(shops) {
  const result = []
  for (const shop of shops) {
    const shopCode = shop?.shop_code || ''
    for (const item of (shop?.list || [])) {
      const goodsId = String(item.goods_id || item.goodsId || '')
      if (!goodsId) continue
      result.push({
        key: `${shopCode}_${goodsId}_${item.sku_id ?? ''}`,
        goodsId,
        skuId: item.sku_id != null ? Number(item.sku_id) : null,
        shopCode,
        name: item.goods_name || item.name || '',
        cover: item.cover_url || '',
        skuText: item.sale_attr_val || item.sku_text || '',
      })
    }
  }
  return result
}

function toggleCartItem(key) {
  const next = new Set(cartSelected.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  cartSelected.value = next
}

async function handleAddFromCart() {
  if (!cartSelected.value.size || cartAdding.value) return
  cartAdding.value = true
  const selected = cartItems.value.filter((i) => cartSelected.value.has(i.key))
  let added = 0
  for (const item of selected) {
    if (await addItemFromCart(item, cookie.value)) added++
  }
  cartAdding.value = false
  showCartPicker.value = false
  cartSelected.value = new Set()
  if (added) {
    showToast(t('checkout.cartAdded', { n: added }))
  }
}

// 商品封面：优先取当前选中 SKU 的图，其次商品主图
function getItemCover(item) {
  const sku = item.skus.find((s) => s.id === item.selectedSkuId)
  return sku?.cover || item.cover || ''
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
    const itemsPayload = items.value.map((item) => ({
      goodsId: item.goodsId,
      skuId: item.selectedSkuId,
      shopCode: item.shopCode,
      nums: item.quantity,
    }))

    const giftPayload = buildGiftPayload(items.value[0]?.shopCode || '')

    const { code } = await preCreateOrder(cookie.value, {
      addressId: selectedAddressId.value,
      items: itemsPayload,
      giftActivities: giftPayload,
    })

    const result = await createOrder(cookie.value, {
      addressId: selectedAddressId.value,
      code,
      remark: remark.value,
      items: itemsPayload,
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

/* ── 定时抢购重试（次数由用户设置，0-10；∞ 表示抢到为止） ── */
const retryCount = ref(3)
const scheduledRetrying = ref(false)
const scheduledRetryCount = ref(0)
let scheduledSubmitTimer = null

const retryDisplay = computed(() => ({
  n: String(scheduledRetryCount.value),
  total: retryCount.value === Infinity ? '∞' : String(retryCount.value),
}))

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

function clearScheduledRetry() {
  if (scheduledSubmitTimer) {
    clearTimeout(scheduledSubmitTimer)
    scheduledSubmitTimer = null
  }
  scheduledRetryCount.value = 0
  scheduledRetrying.value = false
}

// 到点触发：先做一次提交，失败则带退避重试
async function fireScheduledSubmit() {
  clearScheduledRetry()
  await runScheduledAttempt()
}

async function runScheduledAttempt() {
  const { ok, retriable } = await handleSubmit()
  if (ok || !retriable) return

  scheduledRetryCount.value++
  // 无限重试：抢到为止；有限次数：超过则放弃
  if (retryCount.value !== Infinity && scheduledRetryCount.value > retryCount.value) {
    scheduledRetrying.value = false
    setError(t('checkout.retryExhausted'))
    return
  }
  scheduledRetrying.value = true
  showToast(t('checkout.retrying', { n: retryDisplay.value.n, total: retryDisplay.value.total }))
  // 退避：0.5s 起步翻倍，上限 10s，避免无限模式下持续高频轰炸
  const delay = Math.min(500 * Math.pow(2, scheduledRetryCount.value - 1), 10000)
  scheduledSubmitTimer = setTimeout(() => {
    scheduledSubmitTimer = null
    scheduledRetrying.value = false
    runScheduledAttempt()
  }, delay)
}

function handleBack() {
  if (orderResult.value) {
    runWithRouteTransition(() => router.push('/my'), { direction: 'back' })
  } else if (isFirstStep.value) {
    runWithRouteTransition(() => router.back(), { direction: 'back' })
  } else {
    prevStep()
  }
}

useDialogBackButton(() => {
  if (orderResult.value) {
    runWithRouteTransition(() => router.push('/my'), { direction: 'back' })
  } else if (!isFirstStep.value) {
    prevStep()
  } else {
    runWithRouteTransition(() => router.back(), { direction: 'back' })
  }
}, computed(() => !orderResult.value))

onMounted(async () => {
  await initializeCookieState()
  // 有已保存的有效 cookie 时，自动完成登录并直接进入地址步骤
  if (canAutoSubmitSavedCookie.value) {
    applySavedCookieToInput()
    await handleCookieNext()
  }
})
</script>

<style scoped>
.checkout-page .page-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 10px var(--page-padding) 130px;
}

/* 每个步骤的区块：内部卡片之间保持间距 */
.form-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* ── 区块页头 ── */
.section-head {
  margin-bottom: 2px;
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

/* ── 外卡片 + 内字段块（与 ImportView/AddItemView 范式一致） ── */
.field-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 14px;
  border-radius: var(--radius-card);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
}

.field {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border-radius: var(--radius-small);
  background: var(--app-surface-soft);
}

.field-label {
  color: var(--app-text);
  font-size: 14px;
  font-weight: 600;
}

.field input,
.field textarea {
  width: 100%;
  min-height: 44px;
  border: 1px solid transparent;
  border-radius: var(--radius-small);
  background: var(--app-surface);
  color: var(--app-text);
  font-size: 16px;
  padding: 0 14px;
  outline: none;
  transition: border-color 0.16s ease, background 0.16s ease;
}

.field textarea {
  min-height: 88px;
  padding: 12px 14px;
  resize: vertical;
  line-height: 1.45;
  font-family: inherit;
}

.field input::placeholder,
.field textarea::placeholder {
  color: var(--app-placeholder);
}

.field input:focus,
.field textarea:focus {
  border-color: rgba(20, 20, 22, 0.16);
  background: var(--app-surface);
}

.field-error {
  margin-top: 2px;
  font-size: 12px;
  color: #c74444;
  line-height: 1.5;
}

.step-error {
  padding: 10px 14px;
  border-radius: var(--radius-small);
  background: rgba(199, 68, 68, 0.08);
  color: #c74444;
  font-size: 13px;
  line-height: 1.5;
}

/* ── Cookie 说明卡 ── */
.cookie-textarea {
  font-family: monospace;
  font-size: 13px;
}

.cookie-info {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.cookie-info__icon {
  flex-shrink: 0;
  width: 42px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-xs);
  background: #e8f4ff;
  color: #2070c0;
}

.cookie-info__icon svg {
  width: 22px;
  height: 22px;
}

.cookie-info__body {
  flex: 1;
  min-width: 0;
}

.cookie-info__title {
  font-size: 15px;
  font-weight: 600;
  color: var(--app-text);
  margin-bottom: 8px;
}

.cookie-info__steps {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  color: var(--app-text-secondary);
  line-height: 1.7;
}

.cookie-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.remember-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--app-text-secondary);
  cursor: pointer;
}

.remember-checkbox {
  width: 16px;
  height: 16px;
  accent-color: #2070c0;
}

.link-btn {
  background: none;
  border: none;
  color: var(--app-text-secondary);
  font-size: 13px;
  cursor: pointer;
  padding: 6px 0;
}

.cookie-tip {
  font-size: 12px;
  padding: 8px 12px;
  border-radius: var(--radius-xs);
}

.cookie-tip--warn {
  background: rgba(255, 149, 0, 0.1);
  color: #c77700;
}

/* ── 地址 ── */
.address-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.address-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  width: 100%;
  padding: 14px 16px;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-card);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.16s ease, box-shadow 0.16s ease, background 0.16s ease, transform 0.12s ease;
}

.address-card:active {
  transform: scale(0.98);
}

.address-card--selected {
  border-color: color-mix(in srgb, #4a7aec 55%, var(--app-border));
  background: color-mix(in srgb, #4a7aec 10%, var(--app-surface));
  box-shadow: 0 0 0 1px color-mix(in srgb, #4a7aec 22%, transparent);
}

.address-card__radio {
  padding-top: 2px;
}

.radio-dot {
  display: block;
  width: 18px;
  height: 18px;
  border: 2px solid var(--app-text-tertiary);
  border-radius: 50%;
  transition: border-color 0.16s ease;
}

.radio-dot--on {
  border-color: #2070c0;
  box-shadow: inset 0 0 0 4px #2070c0;
}

.address-card__body {
  flex: 1;
  min-width: 0;
}

.address-card__head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.address-card__name {
  font-size: 15px;
  font-weight: 600;
  color: var(--app-text);
}

.address-card__phone {
  font-size: 13px;
  color: var(--app-text-secondary);
}

.address-card__badge {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: var(--radius-xxs);
  background: color-mix(in srgb, #4a7aec 12%, var(--app-surface-soft));
  color: #2070c0;
  font-weight: 500;
}

.address-card__detail {
  font-size: 13px;
  color: var(--app-text-secondary);
  line-height: 1.5;
}

/* ── 商品搜索 ── */
.search-row {
  display: flex;
  gap: 10px;
}

.search-input {
  flex: 1;
  min-width: 0;
  min-height: 46px;
  border: 1px solid transparent;
  border-radius: var(--radius-small);
  background: var(--app-surface-soft);
  color: var(--app-text);
  font-size: 15px;
  padding: 0 14px;
  outline: none;
  transition: border-color 0.16s ease, background 0.16s ease;
}

.search-input:focus {
  border-color: rgba(20, 20, 22, 0.16);
  background: var(--app-surface);
}

.search-btn {
  flex-shrink: 0;
  min-width: 80px;
  min-height: 46px;
  padding: 0 14px;
  border: none;
  border-radius: var(--radius-small);
  background: var(--app-text);
  color: var(--app-surface);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s ease, transform 0.12s ease;
}

.search-btn:not(:disabled):active {
  transform: scale(0.96);
}

.search-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.search-results {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 260px;
  overflow-y: auto;
}

.search-result-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-small);
  background: var(--app-surface);
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.search-result-row:active {
  background: var(--app-surface-soft);
}

.search-result-thumb {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-xs);
  object-fit: cover;
  background: var(--app-surface-soft);
}

.search-result-name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--app-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── 从购物车选择入口 ── */
.cart-entry {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 12px 14px;
  border: none;
  border-radius: var(--radius-small);
  background: var(--app-surface-soft);
  color: var(--app-text);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.16s ease, transform 0.12s ease;
}

.cart-entry > svg:first-child {
  width: 18px;
  height: 18px;
  stroke: #2070c0;
}

.cart-entry__arrow {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  color: var(--app-text-tertiary);
  margin-left: auto;
}

.cart-entry:active {
  transform: scale(0.98);
  background: var(--app-surface-muted);
}

/* ── 商品列表 ── */
.checkout-items {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.checkout-item {
  gap: 12px;
}

.item-loading {
  display: flex;
  justify-content: center;
  padding: 24px;
}

.item-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.item-cover {
  flex-shrink: 0;
  width: 56px;
  height: 56px;
  border-radius: var(--radius-xs);
  object-fit: cover;
  background: var(--app-surface-soft);
}

.item-info {
  flex: 1;
  min-width: 0;
}

.item-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--app-text);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-remove {
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  background: rgba(199, 68, 68, 0.08);
  color: #c74444;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.12s ease;
}

.item-remove svg {
  width: 15px;
  height: 15px;
}

.item-remove:active {
  transform: scale(0.92);
  background: rgba(199, 68, 68, 0.16);
}

.item-price {
  margin-top: 4px;
  font-size: 15px;
  color: #2070c0;
  font-weight: 600;
}

.item-error {
  padding: 8px 12px;
  border-radius: var(--radius-xs);
  background: rgba(199, 68, 68, 0.06);
  color: #c74444;
  font-size: 13px;
}

/* ── SKU ── */
.sku-section {
  margin-top: 2px;
}

.sku-label {
  font-size: 12px;
  color: var(--app-text-tertiary);
  margin-bottom: 8px;
}

.item-sku-locked {
  font-size: 13px;
  color: var(--app-text-secondary);
  line-height: 1.5;
}

.sku-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.sku-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border: 1px solid var(--app-border);
  border-radius: 999px;
  background: var(--app-surface);
  font-size: 13px;
  color: var(--app-text);
  cursor: pointer;
  transition: border-color 0.16s ease, background 0.16s ease, color 0.16s ease;
}

.sku-chip:not(:disabled):active {
  transform: scale(0.96);
}

.sku-chip--selected {
  border-color: color-mix(in srgb, #4a7aec 60%, var(--app-border));
  background: color-mix(in srgb, #4a7aec 12%, var(--app-surface));
  color: #2070c0;
  font-weight: 500;
}

.sku-chip--disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.sku-chip__soldout {
  font-size: 11px;
  color: #c74444;
}

.sku-chip__stock {
  font-size: 11px;
  color: var(--app-text-tertiary);
}

/* ── 数量 ── */
.qty-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.qty-label {
  font-size: 13px;
  color: var(--app-text-secondary);
}

.qty-controls {
  display: flex;
  align-items: center;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-xs);
  overflow: hidden;
}

.qty-btn {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: var(--app-surface-soft);
  color: var(--app-text);
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
}

.qty-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.qty-btn:active:not(:disabled) {
  background: var(--app-surface-muted);
}

.qty-value {
  width: 40px;
  text-align: center;
  font-size: 14px;
  font-weight: 500;
  color: var(--app-text);
  border-left: 1px solid var(--app-border);
  border-right: 1px solid var(--app-border);
  line-height: 34px;
}

.item-sale-time {
  margin-top: 2px;
  font-size: 12px;
  color: #c77700;
}

/* ── 优惠券 ── */
.coupon-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.coupon-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--radius-small);
  background: var(--app-surface-soft);
}

.coupon-item--ok {
  background: rgba(40, 167, 69, 0.08);
}

.coupon-item__icon {
  flex-shrink: 0;
  width: 18px;
  font-size: 14px;
  font-weight: 700;
  color: #c74444;
}

.coupon-item--ok .coupon-item__icon {
  color: #28a745;
}

.coupon-item__name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--app-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.coupon-item__status {
  flex-shrink: 0;
  max-width: 55%;
  font-size: 12px;
  color: var(--app-text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: right;
}

/* ── 赠品 ── */
.gift-sections {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.gift-activity__title {
  font-size: 15px;
  font-weight: 600;
  color: var(--app-text);
}

.gift-activity__tier {
  font-size: 13px;
  color: var(--app-text-secondary);
}

.gift-activity__empty {
  font-size: 13px;
  color: var(--app-text-tertiary);
  padding: 8px 0;
  text-align: center;
}

.gift-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.gift-card {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-small);
  background: var(--app-surface);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.16s ease, background 0.16s ease, transform 0.12s ease;
}

.gift-card:active {
  transform: scale(0.98);
}

.gift-card--selected {
  border-color: color-mix(in srgb, #4a7aec 60%, var(--app-border));
  background: color-mix(in srgb, #4a7aec 8%, var(--app-surface));
}

.gift-card--soldout {
  opacity: 0.45;
  cursor: not-allowed;
  background: var(--app-surface-soft);
  border-color: var(--app-border);
}

.gift-card__check {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border: 1.5px solid var(--app-text-tertiary);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.16s ease;
}

.gift-card--selected .gift-card__check {
  border-color: #2070c0;
  background: #2070c0;
}

.gift-card__check svg {
  width: 14px;
  height: 14px;
  stroke: #fff;
}

.gift-card__name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--app-text);
}

.gift-card__stock {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--app-text-tertiary);
}

/* ── 确认页 ── */
.card-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--app-text-tertiary);
}

.review-item {
  padding: 8px 0;
  border-bottom: 1px solid var(--app-border);
}

.review-item:last-child {
  border-bottom: none;
}

.review-item__name {
  color: var(--app-text);
  font-size: 14px;
  line-height: 1.45;
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}

.review-item__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 3px;
}

.review-item__sku {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--app-text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.review-item__qty {
  flex-shrink: 0;
  font-size: 13px;
  color: var(--app-text-secondary);
}

.review-item__price {
  flex-shrink: 0;
  font-weight: 500;
  color: #2070c0;
}

.review-address {
  font-size: 14px;
  color: var(--app-text);
  line-height: 1.6;
}

.review-total {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
  border-radius: var(--radius-card);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
  font-size: 14px;
  color: var(--app-text);
}

.review-total__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.review-total__row--discount {
  color: #28a745;
}

.review-total__row--pay {
  font-size: 15px;
  font-weight: 600;
  padding-top: 8px;
  border-top: 1px solid var(--app-border);
}

.review-total__amount {
  font-size: 20px;
  color: #2070c0;
}

/* ── 定时下单 ── */
.timer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.timer-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--app-text);
}

.timer-toggle {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
}

.save-char-toggle {
  width: 44px;
  height: 26px;
  border-radius: 13px;
  background: color-mix(in srgb, var(--app-text) 12%, var(--app-surface-soft));
  position: relative;
  transition: background 0.22s;
}

.save-char-toggle--on {
  background: #2070c0;
}

.save-char-knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--app-surface);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.22);
  transition: transform 0.22s var(--motion-ease-spring);
}

.save-char-toggle--on .save-char-knob {
  transform: translateX(18px);
}

.timer-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.timer-hint {
  font-size: 13px;
  color: var(--app-text-secondary);
}

.timer-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  min-height: 44px;
  padding: 0 14px;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-small);
  background: var(--app-surface);
  color: var(--app-text);
  font-size: 15px;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.16s ease, transform 0.16s ease;
}

.timer-field:active {
  transform: scale(0.98);
}

.timer-field__placeholder {
  color: var(--app-placeholder);
}

.timer-field__icon {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  stroke: var(--app-text-tertiary);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.timer-countdown {
  font-size: 13px;
  color: var(--app-text-secondary);
}

.timer-countdown strong {
  color: #2070c0;
  font-size: 15px;
}

.retry-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.retry-label {
  font-size: 13px;
  color: var(--app-text-secondary);
}

.retry-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.retry-infinite {
  width: 34px;
  height: 34px;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-xs);
  background: var(--app-surface-soft);
  color: var(--app-text);
  font-size: 16px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  transition: border-color 0.16s ease, background 0.16s ease, color 0.16s ease;
}

.retry-infinite:active:not(.retry-infinite--active) {
  transform: scale(0.96);
}

.retry-infinite--active {
  border-color: color-mix(in srgb, #4a7aec 60%, var(--app-border));
  background: color-mix(in srgb, #4a7aec 12%, var(--app-surface));
  color: #2070c0;
}

/* ── 购物车选择面板 ── */
.cart-picker {
  display: flex;
  flex-direction: column;
  max-height: 75dvh;
  padding: 16px 20px calc(env(safe-area-inset-bottom, 0px) + 16px);
}

.cart-picker__title {
  font-size: 17px;
  font-weight: 700;
  color: var(--app-text);
  text-align: center;
  margin-bottom: 14px;
}

.cart-picker__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.cart-picker-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-small);
  background: var(--app-surface);
  cursor: pointer;
  transition: border-color 0.16s ease, background 0.16s ease;
}

.cart-picker-item--selected {
  border-color: color-mix(in srgb, #4a7aec 60%, var(--app-border));
  background: color-mix(in srgb, #4a7aec 8%, var(--app-surface));
}

.cart-picker-item__thumb {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: var(--radius-xs);
  object-fit: cover;
  background: var(--app-surface-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 700;
  color: var(--app-text-tertiary);
}

.cart-picker-item__body {
  flex: 1;
  min-width: 0;
}

.cart-picker-item__name {
  font-size: 13px;
  font-weight: 500;
  color: var(--app-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cart-picker-item__sku {
  font-size: 12px;
  color: var(--app-text-tertiary);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cart-picker-item__check {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border: 1.5px solid var(--app-text-tertiary);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.16s ease;
}

.cart-picker-item--selected .cart-picker-item__check {
  border-color: #2070c0;
  background: #2070c0;
}

.cart-picker-item__check svg {
  width: 14px;
  height: 14px;
  stroke: #fff;
}

.cart-picker__actions {
  display: flex;
  gap: 10px;
  margin-top: 14px;
  flex-shrink: 0;
}

.cart-picker-btn {
  flex: 1;
  height: 48px;
  border: none;
  border-radius: var(--radius-small);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s ease, transform 0.12s ease;
}

.cart-picker-btn:active:not(:disabled) {
  transform: scale(0.97);
}

.cart-picker-btn--cancel {
  background: var(--app-surface-soft);
  color: var(--app-text);
}

.cart-picker-btn--confirm {
  background: var(--app-text);
  color: var(--app-surface);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.cart-picker-btn--confirm:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.cart-picker-btn--confirm .parse-spinner {
  width: 16px;
  height: 16px;
  border-color: color-mix(in srgb, currentColor 35%, transparent);
  border-top-color: currentColor;
}

.cart-picker__error {
  margin-bottom: 12px;
}

.cart-picker__empty {
  padding: 24px 0;
}

/* ── 下单成功 ── */
.order-success {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 32px 16px 16px;
}

.order-success__icon {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: rgba(40, 167, 69, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
}

.order-success__icon svg {
  width: 32px;
  height: 32px;
  stroke: #28a745;
}

.order-success__title {
  font-size: 20px;
  font-weight: 700;
  color: var(--app-text);
  margin-bottom: 8px;
}

.order-success__amount {
  font-size: 28px;
  font-weight: 700;
  color: #2070c0;
  margin-bottom: 16px;
}

.order-success__info {
  padding: 12px 16px;
  border-radius: var(--radius-small);
  background: var(--app-surface-soft);
  font-size: 13px;
  color: var(--app-text-secondary);
  line-height: 1.6;
  margin-bottom: 12px;
}

.order-success__product {
  color: var(--app-text);
}

.order-success__hint {
  font-size: 13px;
  color: var(--app-text-tertiary);
}

/* ── 空态 & 加载 ── */
.empty-hint {
  text-align: center;
  font-size: 14px;
  color: var(--app-text-tertiary);
  padding: 12px 0;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 180px;
  padding: 24px 16px;
}

.loading-text {
  font-size: 14px;
  color: var(--app-text-secondary);
}

.loading-sub {
  font-size: 13px;
  color: var(--app-text-tertiary);
}

.parse-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid color-mix(in srgb, var(--app-text) 20%, transparent);
  border-top-color: var(--app-text);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

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

.goods-expand-enter-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.goods-expand-leave-active {
  transition: opacity 0.18s ease;
}

.goods-expand-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.goods-expand-leave-to {
  opacity: 0;
}

/* ── 平板端 ── */
@media (min-width: 900px) {
  .float-footer {
    width: min(calc(100vw - 48px), 520px);
  }
}

/* ── 深色模式（仅补充蓝强调色与输入框在暗底的提亮，其余由 token 自动适配） ── */
:global(html.theme-dark) .field input,
:global(html.theme-dark) .field textarea,
:global(html.theme-dark) .search-input,
:global(html.theme-dark) .timer-field {
  border-color: rgba(255, 255, 255, 0.07);
  background: color-mix(in srgb, var(--app-surface) 92%, var(--app-glass));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

:global(html.theme-dark) .field input:focus,
:global(html.theme-dark) .field textarea:focus,
:global(html.theme-dark) .search-input:focus {
  border-color: rgba(255, 255, 255, 0.12);
  background: color-mix(in srgb, var(--app-surface) 94%, var(--app-glass));
}

:global(html.theme-dark) .cookie-info__icon {
  background: rgba(109, 157, 255, 0.14);
  color: #bfd4ff;
}

:global(html.theme-dark) .address-card--selected {
  border-color: rgba(109, 157, 255, 0.82);
  background: color-mix(in srgb, #4a7aec 18%, var(--app-surface));
  box-shadow: 0 0 0 1px rgba(109, 157, 255, 0.28);
}

:global(html.theme-dark) .radio-dot {
  border-color: rgba(255, 255, 255, 0.3);
}

:global(html.theme-dark) .radio-dot--on {
  border-color: rgba(109, 157, 255, 0.9);
  box-shadow: inset 0 0 0 4px rgba(109, 157, 255, 0.9);
}

:global(html.theme-dark) .sku-chip {
  border-color: rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
}

:global(html.theme-dark) .sku-chip--selected {
  border-color: rgba(109, 157, 255, 0.72);
  background: color-mix(in srgb, #4a7aec 16%, var(--app-surface));
  color: #a9c5ff;
}

:global(html.theme-dark) .gift-card {
  border-color: rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
}

:global(html.theme-dark) .gift-card--selected {
  border-color: rgba(109, 157, 255, 0.72);
  background: color-mix(in srgb, #4a7aec 14%, var(--app-surface));
}

:global(html.theme-dark) .gift-card__check {
  border-color: rgba(255, 255, 255, 0.3);
}

:global(html.theme-dark) .search-result-row {
  border-color: rgba(255, 255, 255, 0.08);
}

:global(html.theme-dark) .save-char-toggle {
  background: rgba(255, 255, 255, 0.14);
}

:global(html.theme-dark) .save-char-knob {
  background: rgba(255, 255, 255, 0.94);
}
</style>
