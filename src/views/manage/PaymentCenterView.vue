<template>
  <div class="page payments-page">
    <NavBar :title="t('manage.paymentsTitle')" show-back />

    <main ref="pageBodyRef" class="page-body page-entry">
      <section class="pay-hero">
        <article class="pay-hero__card">
          <div class="pay-hero__icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="2" y="5" width="20" height="14" rx="3" />
              <path d="M2 10h20" />
              <path d="M6 15h4" />
            </svg>
          </div>
          <div class="pay-hero__copy">
            <p class="pay-hero__label">{{ t('manage.paymentsHeroLabel') }}</p>
            <h1 class="pay-hero__title">{{ t('manage.paymentsTitle') }}</h1>
            <p class="pay-hero__desc">{{ t('manage.paymentsHeroDesc') }}</p>
            <div class="pay-hero__meta">
              <span class="pay-hero__chip">{{ t('manage.paymentsEntitlementsTitle') }} · {{ entitlements.length }}</span>
              <span class="pay-hero__chip">{{ t('manage.paymentsOrderCount', { count: orders.length }) }}</span>
            </div>
          </div>
        </article>
      </section>

      <section v-if="!loggedIn" class="pay-section">
        <div class="pay-card pay-card--center">
          <p class="pay-big">🔒</p>
          <h2 class="pay-card__title">{{ t('manage.paymentsLoginRequired') }}</h2>
          <button class="pay-btn pay-btn--primary" type="button" @click="goLogin">
            {{ t('manage.paymentsGoLogin') }}
          </button>
        </div>
      </section>

      <template v-else>
        <section class="pay-section">
          <div class="pay-section__head">
            <p class="pay-section__label">Products</p>
            <h2 class="pay-section__title">{{ t('manage.paymentsProductsTitle') }}</h2>
            <p class="pay-section__desc">{{ t('manage.paymentsProductsDesc') }}</p>
          </div>
          <div class="pay-product-list">
            <article v-for="product in products" :key="product.key" class="pay-product">
              <div class="pay-product__body">
                <h3 class="pay-product__title">{{ t(product.titleKey) }}</h3>
                <p class="pay-product__desc">{{ t(product.descKey) }}</p>
                <p class="pay-product__feature">{{ t('manage.paymentsFeature') }} · {{ t(product.featureKey) }}</p>
              </div>
              <div class="pay-product__side">
                <div class="pay-product__price"><span>¥</span>{{ formatYuan(product.amount) }}</div>
                <button
                  class="pay-btn pay-btn--primary pay-btn--sm"
                  type="button"
                  :disabled="busyProduct === product.key"
                  @click="buy(product)"
                >
                  {{ busyProduct === product.key ? t('manage.paymentsCreating') : t('manage.paymentsBuy') }}
                </button>
              </div>
            </article>
          </div>
        </section>

        <section v-if="currentOrder" class="pay-section">
          <div class="pay-section__head">
            <p class="pay-section__label">Pending</p>
            <h2 class="pay-section__title">{{ t('manage.paymentsCurrentOrder') }}</h2>
          </div>
          <div class="pay-card">
            <div class="pay-row">
              <span class="pay-chip" :class="`pay-chip--${currentOrder.status}`">{{ t(payStatusLabelKey(currentOrder.status)) }}</span>
              <span class="pay-money">¥{{ formatYuan(currentOrder.amount) }}</span>
            </div>
            <dl class="pay-dl">
              <dt>{{ t('manage.paymentsOrderNo') }}</dt>
              <dd>{{ currentOrder.out_trade_no }}</dd>
              <dt>{{ t('manage.paymentsFeature') }}</dt>
              <dd><code class="pay-code">{{ featureLabel(currentOrder.feature) }}</code></dd>
            </dl>
            <div class="pay-actions pay-actions--row">
              <button class="pay-btn pay-btn--primary" type="button" @click="goPay(currentOrder)">
                {{ t('manage.paymentsGoPay') }}
              </button>
              <button class="pay-btn" type="button" :disabled="refreshing" @click="refresh">
                {{ t('manage.paymentsRefresh') }}
              </button>
              <button class="pay-btn" type="button" :disabled="!!busyOrder" @click="cancelOrder(currentOrder)">
                {{ t('manage.paymentsCancelOrder') }}
              </button>
            </div>
          </div>
        </section>

        <section class="pay-section">
          <div class="pay-section__head">
            <p class="pay-section__label">Entitlements</p>
            <h2 class="pay-section__title">{{ t('manage.paymentsEntitlementsTitle') }}</h2>
          </div>
          <div v-if="entitlements.length" class="pay-tag-list">
            <span v-for="feature in entitlements" :key="feature" class="pay-tag">
              {{ featureLabel(feature) }}
            </span>
          </div>
          <p v-else class="pay-muted">{{ t('manage.paymentsNoEntitlements') }}</p>
        </section>

        <section class="pay-section">
          <div class="pay-section__head">
            <p class="pay-section__label">Orders</p>
            <h2 class="pay-section__title">{{ t('manage.paymentsHistoryTitle') }}</h2>
          </div>
          <div v-if="orders.length" class="pay-order-list">
            <article v-for="item in orders" :key="item.out_trade_no" class="pay-card pay-card--row">
              <div class="pay-order__main">
                <div class="pay-order__line">
                  <span class="pay-chip" :class="`pay-chip--${item.status}`">{{ t(payStatusLabelKey(item.status)) }}</span>
                  <span v-if="item.granted" class="pay-granted">✓ {{ t('manage.paymentsGranted') }}</span>
                </div>
                <p class="pay-order__no">{{ item.out_trade_no }}</p>
                <p class="pay-muted">{{ featureLabel(item.feature) }} · {{ item.created_at }}</p>
              </div>
              <div class="pay-order__side">¥{{ formatYuan(item.amount) }}</div>
            </article>
          </div>
          <p v-else class="pay-muted">{{ t('manage.paymentsNoHistory') }}</p>
        </section>

        <section class="pay-section">
          <div class="pay-card pay-card--soft">
            <h2 class="pay-card__title">{{ t('manage.paymentsLearnTitle') }}</h2>
            <p class="pay-body">{{ t('manage.paymentsLearnDesc') }}</p>
          </div>
        </section>
      </template>
    </main>

    <!-- 收银台弹窗（内容与 /pay/checkout/:outTradeNo 整页共用同一组件） -->
    <PayCheckoutSheet v-model="checkoutOpen" :out-trade-no="checkoutOutTradeNo" />
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import NavBar from '@/components/common/NavBar.vue'
import PayCheckoutSheet from '@/components/payment/PayCheckoutSheet.vue'
import { showGlobalToast } from '@/utils/globalToast'
import { useAuthStore } from '@/stores/auth'
import {
  FEATURE_LABEL_KEYS,
  PAY_PRODUCTS,
  createPayOrder,
  fetchPayOrders,
  formatYuan,
  mockGatewayAction,
  payStatusLabelKey
} from '@/services/payment/payService'

defineOptions({ name: 'PaymentCenterView' })

const { t } = useI18n()
const router = useRouter()
const authStore = useAuthStore()

const pageBodyRef = ref(null)
const products = PAY_PRODUCTS
const orders = ref([])
const entitlements = ref([])
const loggedIn = ref(false)
const refreshing = ref(false)
const busyProduct = ref('')
const busyOrder = ref('')
let pollTimer = null

// 收银台弹窗状态
const checkoutOpen = ref(false)
const checkoutOutTradeNo = ref('')

// 弹窗关闭后刷新：付款/取消都可能发生在弹窗内，回来列表要即时反映
watch(checkoutOpen, (open) => {
  if (!open) refresh()
})

/** 当前待支付订单（列表里第一条未过期的 pending） */
const currentOrder = computed(() => {
  const now = Date.now()
  return orders.value.find(
    (item) => item.status === 'pending' && new Date(item.expires_at || 0).getTime() > now
  ) || null
})

function featureLabel(feature) {
  const key = FEATURE_LABEL_KEYS[feature]
  return key ? t(key) : feature
}

async function refresh() {
  if (!loggedIn.value) return
  refreshing.value = true
  try {
    const data = await fetchPayOrders()
    orders.value = data?.orders || []
    entitlements.value = data?.entitlements || []
  } catch (e) {
    showGlobalToast(String(e?.message || e))
  } finally {
    refreshing.value = false
  }
}

/**
 * 打开收银台弹窗。真实接入时这一步会变成「跳转到支付宝/微信收银台」，
 * 弹窗换成一个跳转动作即可；下单/查单/回调逻辑都不用动。
 */
function openCheckout(outTradeNo) {
  checkoutOutTradeNo.value = outTradeNo
  checkoutOpen.value = true
}

async function buy(product) {
  busyProduct.value = product.key
  try {
    const data = await createPayOrder(product.key)
    const order = data?.order
    if (!order?.out_trade_no) throw new Error('order_create_failed')
    openCheckout(order.out_trade_no)
  } catch (e) {
    showGlobalToast(String(e?.message || e))
  } finally {
    busyProduct.value = ''
  }
}

function goPay(order) {
  openCheckout(order.out_trade_no)
}

async function cancelOrder(order) {
  busyOrder.value = order.out_trade_no
  try {
    await mockGatewayAction(order.out_trade_no, 'cancel')
    await refresh()
  } catch (e) {
    showGlobalToast(String(e?.message || e))
  } finally {
    busyOrder.value = ''
  }
}

function goLogin() {
  showGlobalToast(t('manage.paymentsNeedLoginToast'))
  router.push('/manage/sync')
}

onMounted(async () => {
  try {
    await authStore.init()
  } catch {
    // 忽略：未初始化时按未登录处理
  }
  loggedIn.value = authStore.isLoggedIn
  await refresh()
  // 有未支付订单时轮询，模拟「等回调确认」——支付结果最终以服务端为准
  pollTimer = window.setInterval(() => {
    if (document.visibilityState === 'visible' && currentOrder.value) refresh()
  }, 4000)
})

onBeforeUnmount(() => {
  if (pollTimer) window.clearInterval(pollTimer)
})
</script>

<style scoped src="@/assets/views/PaymentsView.css"></style>
