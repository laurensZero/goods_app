<template>
  <AppSheet
    :model-value="modelValue"
    size="wide"
    placement="auto"
    @update:model-value="onUpdate"
  >
    <header class="pay-sheet-head">
      <div>
        <p class="pay-hero__label">MOCK CHECKOUT</p>
        <h2 class="pay-sheet__title">{{ t('manage.paymentsCashierTitle') }}</h2>
      </div>
      <button class="pay-sheet__close" type="button" @click="close">{{ t('common.close') }}</button>
    </header>

    <PayCheckoutPanel :out-trade-no="outTradeNo" show-intro @close="close" />
  </AppSheet>
</template>

<script setup>
// 收银台弹窗外壳：手机底部上滑抽屉、宽屏居中对话框（AppSheet 的 auto 行为）。
// 内容与 /pay/checkout/:outTradeNo 整页共用 PayCheckoutPanel，避免两套实现漂移。
import { useI18n } from 'vue-i18n'
import AppSheet from '@/components/common/AppSheet.vue'
import PayCheckoutPanel from '@/components/payment/PayCheckoutPanel.vue'
import { useDialogBackButton } from '@/composables/useDialogBackButton'

defineOptions({ name: 'PayCheckoutSheet' })

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  outTradeNo: { type: String, default: '' }
})

const emit = defineEmits(['update:modelValue'])

const { t } = useI18n()

function close() {
  emit('update:modelValue', false)
}

function onUpdate(value) {
  emit('update:modelValue', value)
}

// 接管 Android 返回键：关闭弹窗而不是退出页面
useDialogBackButton(close, () => props.modelValue)
</script>

<style scoped src="@/assets/views/PaymentsView.css"></style>
