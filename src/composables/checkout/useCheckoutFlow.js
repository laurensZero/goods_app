/**
 * 下单流程状态机
 * 步骤: cookie → address → goods → coupon → gifts → review → submit → done
 */
import { computed, ref, shallowRef } from 'vue'

export const STEPS = [
  { key: 'cookie', label: '登录' },
  { key: 'address', label: '地址' },
  { key: 'goods', label: '商品' },
  { key: 'coupon', label: '优惠券' },
  { key: 'gifts', label: '赠品' },
  { key: 'review', label: '确认' },
  { key: 'submit', label: '下单' },
]

export function useCheckoutFlow() {
  const currentStepIndex = ref(0)
  const cookie = ref('')
  const remark = ref('')
  const error = ref('')
  const loading = ref(false)

  const currentStep = computed(() => STEPS[currentStepIndex.value])
  const isFirstStep = computed(() => currentStepIndex.value === 0)
  const isLastStep = computed(() => currentStepIndex.value === STEPS.length - 1)
  const progress = computed(() => ((currentStepIndex.value + 1) / STEPS.length) * 100)

  const canGoNext = ref(false)

  function setError(msg) {
    error.value = msg
  }

  function clearError() {
    error.value = ''
  }

  function nextStep() {
    if (currentStepIndex.value < STEPS.length - 1) {
      clearError()
      currentStepIndex.value++
      canGoNext.value = false
    }
  }

  function prevStep() {
    if (currentStepIndex.value > 0) {
      clearError()
      currentStepIndex.value--
      canGoNext.value = false
    }
  }

  function goToStep(index) {
    if (index >= 0 && index < STEPS.length) {
      clearError()
      currentStepIndex.value = index
      canGoNext.value = false
    }
  }

  return {
    currentStepIndex,
    currentStep,
    isFirstStep,
    isLastStep,
    progress,
    cookie,
    remark,
    error,
    loading,
    canGoNext,
    setError,
    clearError,
    nextStep,
    prevStep,
    goToStep,
    STEPS,
  }
}
