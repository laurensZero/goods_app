<template>
  <section class="summary-card">
    <div class="summary-orb summary-orb--left" />
    <div class="summary-orb summary-orb--right" />

    <div class="summary-head">
      <p class="summary-label">Collection Value</p>
      <button
        type="button"
        class="summary-visibility-btn"
        :aria-label="isHidden ? '显示总金额' : '隐藏总金额'"
        @click="toggleHidden"
      >
        <svg v-if="!isHidden" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
          <circle cx="12" cy="12" r="3.2" />
        </svg>
        <svg v-else viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M3 3 21 21" />
          <path d="M10.6 6.2A11.8 11.8 0 0 1 12 6c6.5 0 10 6 10 6a18.8 18.8 0 0 1-4.1 4.5" />
          <path d="M6.7 6.8C4.1 8.3 2 12 2 12s3.5 6 10 6c1 0 2-.1 2.9-.4" />
          <path d="M9.9 9.9A3.2 3.2 0 0 0 14.1 14.1" />
        </svg>
      </button>
    </div>

    <p class="summary-value">
      <span class="summary-currency">¥</span>{{ displayIntPart }}<span class="summary-decimal">.{{ displayDecPart }}</span>
    </p>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'

const SUMMARY_VISIBILITY_STORAGE_KEY = 'goods-app:home-total-value-hidden'

const props = defineProps({
  totalValue: { type: String, default: '0.00' },
  totalCount: { type: Number, default: 0 }
})

const intPart = computed(() => props.totalValue.split('.')[0])
const decPart = computed(() => props.totalValue.split('.')[1] ?? '00')
const isHidden = ref(localStorage.getItem(SUMMARY_VISIBILITY_STORAGE_KEY) === '1')
const displayIntPart = computed(() => (
  isHidden.value
    ? intPart.value.replace(/\d/g, '•') || '••••'
    : intPart.value
))
const displayDecPart = computed(() => (
  isHidden.value
    ? decPart.value.replace(/\d/g, '•') || '••'
    : decPart.value
))

function toggleHidden() {
  isHidden.value = !isHidden.value
}

watch(isHidden, (value) => {
  localStorage.setItem(SUMMARY_VISIBILITY_STORAGE_KEY, value ? '1' : '0')
}, { immediate: true })
</script>

<style scoped>
.summary-card {
  position: relative;
  padding: 24px;
  border-radius: var(--radius-large);
  overflow: hidden;
  color: #fff;
  background:
    radial-gradient(circle at top left, rgba(255, 255, 255, 0.16), transparent 34%),
    linear-gradient(145deg, #17181c 0%, #24262d 52%, #33363e 100%);
  box-shadow: var(--app-shadow);
}

.summary-orb {
  position: absolute;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  pointer-events: none;
  filter: blur(2px);
}

.summary-orb--left {
  top: -44px;
  left: -36px;
  width: 160px;
  height: 160px;
}

.summary-orb--right {
  right: -18px;
  bottom: -32px;
  width: 120px;
  height: 120px;
}

.summary-head,
.summary-value {
  position: relative;
  z-index: 1;
}

.summary-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.summary-label {
  color: rgba(255, 255, 255, 0.56);
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.summary-visibility-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  transition: transform 0.16s ease, background 0.16s ease, border-color 0.16s ease;
}

.summary-visibility-btn:active {
  transform: scale(0.94);
}

.summary-visibility-btn svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 1.9;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.summary-value {
  margin: 22px 0 0;
  font-size: 44px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.05em;
}

.summary-currency {
  margin-right: 4px;
  font-size: 20px;
  font-weight: 600;
  vertical-align: 14px;
  opacity: 0.78;
}

.summary-decimal {
  font-size: 22px;
  font-weight: 600;
  opacity: 0.72;
}

@media (max-width: 360px) {
  .summary-value {
    font-size: 38px;
  }
}
</style>
