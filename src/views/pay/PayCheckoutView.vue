<template>
  <div class="page pay-checkout-page">
    <NavBar :title="t('manage.paymentsCashierTitle')" show-back @back="goBack" />

    <main class="page-body page-entry">
      <section class="pay-hero">
        <article class="pay-hero__card">
          <div class="pay-hero__icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="2" y="5" width="20" height="14" rx="3" />
              <path d="M2 10h20" />
            </svg>
          </div>
          <div class="pay-hero__copy">
            <p class="pay-hero__label">MOCK CHECKOUT</p>
            <h1 class="pay-hero__title">{{ t('manage.paymentsCashierTitle') }}</h1>
            <p class="pay-hero__desc">{{ t('manage.paymentsCashierBanner') }}</p>
          </div>
        </article>
      </section>

      <!-- 整页形态：内容与 App 内弹窗（PayCheckoutSheet）共用同一组件 -->
      <PayCheckoutPanel :out-trade-no="outTradeNo" @close="goBack" />
    </main>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import NavBar from '@/components/common/NavBar.vue'
import PayCheckoutPanel from '@/components/payment/PayCheckoutPanel.vue'

defineOptions({ name: 'PayCheckoutView' })

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const outTradeNo = computed(() => String(route.params.outTradeNo || ''))

// 保留为降级/深链入口：直接访问本页、或将来接真实网关「跳出 App 后回来」时，
// 都能靠这里查单恢复；日常主流程走 PaymentCenterView 里的弹窗。
function goBack() {
  if (router.hasRoute('manage-payments')) {
    router.replace({ name: 'manage-payments' })
  } else {
    router.back()
  }
}
</script>

<style scoped src="@/assets/views/PaymentsView.css"></style>
