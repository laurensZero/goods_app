<template>
  <div class="pay-checkout-panel">
    <p v-if="showIntro" class="pay-sheet__banner">{{ t('manage.paymentsCashierBanner') }}</p>

    <section v-if="loading && !order" class="pay-section">
      <p class="pay-muted">{{ t('common.loading') }}</p>
    </section>

    <section v-else-if="!order" class="pay-section">
      <div class="pay-card pay-card--center">
        <p class="pay-big">🔍</p>
        <h3 class="pay-card__title">{{ errorText || t('manage.paymentsCashierNotFound') }}</h3>
        <button class="pay-btn" type="button" @click="emit('close')">
          {{ t('common.close') }}
        </button>
      </div>
    </section>

    <template v-else>
      <section class="pay-section">
        <div class="pay-card">
          <div class="pay-amount">
            <span class="pay-amount__symbol">¥</span>{{ formatYuan(order.amount) }}
          </div>
          <div class="pay-amount__meta">
            <span class="pay-chip" :class="`pay-chip--${displayStatus}`">{{ t(payStatusLabelKey(displayStatus)) }}</span>
            <span class="pay-muted">{{ order.currency }}</span>
          </div>

          <dl class="pay-dl">
            <dt>{{ t('manage.paymentsOrderNo') }}</dt>
            <dd>{{ order.out_trade_no }}</dd>
            <dt>{{ t('manage.paymentsFeature') }}</dt>
            <dd><code class="pay-code">{{ featureLabel(order.feature) }}</code></dd>
            <dt>{{ t('manage.paymentsExpiresAt') }}</dt>
            <dd>{{ expiresText }}</dd>
            <template v-if="order.paid_at">
              <dt>{{ t('manage.paymentsPaidAt') }}</dt>
              <dd>{{ order.paid_at }}</dd>
            </template>
            <template v-if="order.trade_no">
              <dt>{{ t('manage.paymentsCashierGatewayOrder') }}</dt>
              <dd class="pay-code">{{ order.trade_no }}</dd>
            </template>
          </dl>

          <div class="pay-actions">
            <template v-if="displayStatus === 'pending'">
              <button class="pay-btn pay-btn--primary" type="button" :disabled="!!busy" @click="runAction('pay')">
                {{ busy === 'pay' ? t('common.loading') : t('manage.paymentsCashierPay', { amount: `¥${formatYuan(order.amount)}` }) }}
              </button>
              <button class="pay-btn" type="button" :disabled="!!busy" @click="runAction('cancel')">
                {{ t('manage.paymentsCancelOrder') }}
              </button>
            </template>
            <template v-else-if="displayStatus === 'paid'">
              <p class="pay-result pay-result--ok">✅ {{ t('manage.paymentsCashierSuccess') }}</p>
              <button class="pay-btn" type="button" :disabled="!!busy" @click="runAction('replay')">
                {{ busy === 'replay' ? t('common.loading') : t('manage.paymentsCashierReplay') }}
              </button>
              <button class="pay-btn pay-btn--primary" type="button" @click="emit('close')">
                {{ t('manage.paymentsCashierBack') }}
              </button>
            </template>
            <template v-else>
              <p class="pay-result">{{ t(payStatusLabelKey(displayStatus)) }}</p>
              <button class="pay-btn pay-btn--primary" type="button" @click="emit('close')">
                {{ t('manage.paymentsCashierBack') }}
              </button>
            </template>
          </div>

          <p v-if="ackText" class="pay-ack">
            <span class="pay-muted">{{ t('manage.paymentsCashierAck') }}:</span> {{ ackText }}
          </p>
          <p v-if="errorText && order" class="pay-error">{{ errorText }}</p>
        </div>
      </section>

      <section class="pay-section">
        <div class="pay-card pay-card--soft">
          <h3 class="pay-card__title">{{ t('manage.paymentsLearnTitle') }}</h3>
          <p class="pay-body">{{ t('manage.paymentsLearnDesc') }}</p>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  FEATURE_LABEL_KEYS,
  fetchPayOrder,
  formatYuan,
  mockGatewayAction,
  payStatusLabelKey
} from '@/services/payment/payService'

defineOptions({ name: 'PayCheckoutPanel' })

const props = defineProps({
  outTradeNo: { type: String, default: '' },
  /** 弹窗形态下展示顶部说明；整页形态由页面 hero 承担，无需重复 */
  showIntro: { type: Boolean, default: false }
})

const emit = defineEmits(['close'])

const { t } = useI18n()

const order = ref(null)
const loading = ref(true)
const busy = ref('')
const ackText = ref('')
const errorText = ref('')
const now = ref(Date.now())
let timer = null

/** 待支付但已过有效期时，展示为「已过期」 */
const displayStatus = computed(() => {
  if (order.value?.status === 'pending' && order.value?.expires_at) {
    return new Date(order.value.expires_at).getTime() <= now.value ? 'expired' : 'pending'
  }
  return order.value?.status || 'pending'
})

const expiresText = computed(() => {
  if (!order.value?.expires_at) return '-'
  if (displayStatus.value !== 'pending') return order.value.expires_at
  const left = new Date(order.value.expires_at).getTime() - now.value
  const total = Math.max(0, Math.floor(left / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
})

function featureLabel(feature) {
  const key = FEATURE_LABEL_KEYS[feature]
  return key ? t(key) : feature
}

/** 已知的网关错误码 → 用户可读文案；未知返回空串，由调用方决定回落。 */
function knownGatewayErrorText(reason) {
  if (reason === 'unauthorized') return t('manage.paymentsLoginRequired')
  if (reason === 'mock_gateway_disabled') return t('manage.paymentsAdminOnly')
  return ''
}

async function load() {
  loading.value = true
  try {
    const { order: fetched } = await fetchPayOrder(props.outTradeNo)
    order.value = fetched
    errorText.value = ''
  } catch (e) {
    const reason = String(e?.message || e)
    order.value = null
    errorText.value = knownGatewayErrorText(reason) || t('manage.paymentsCashierNotFound')
  } finally {
    loading.value = false
  }
}

async function runAction(action) {
  busy.value = action
  ackText.value = ''
  errorText.value = ''
  try {
    const result = await mockGatewayAction(props.outTradeNo, action)
    ackText.value = String(result?.ack || '')
    if (result?.error) throw new Error(result.error)
    await load()
  } catch (e) {
    const reason = String(e?.message || e)
    errorText.value = knownGatewayErrorText(reason) || reason
  } finally {
    busy.value = ''
  }
}

// 弹窗复用同一个组件实例打开不同订单时，单号变化要重新拉取
watch(() => props.outTradeNo, (next, prev) => {
  if (next && next !== prev) load()
})

onMounted(() => {
  load()
  timer = window.setInterval(() => { now.value = Date.now() }, 1000)
})

onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer)
})
</script>

<style scoped src="@/assets/views/PaymentsView.css"></style>
