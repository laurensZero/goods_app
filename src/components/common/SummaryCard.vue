<template>
  <section class="summary-card" :class="{ 'summary-card--has-trend': hasTrendData }">
    <div class="summary-orb summary-orb--left" />
    <div class="summary-orb summary-orb--right" />

    <div class="summary-layout">
      <div class="summary-main">
        <div class="summary-head">
          <div class="summary-label-row">
            <p class="summary-label">{{ label }}</p>
            <div
              v-if="showTips"
              ref="valueTipsRef"
              class="summary-value-tips"
              :class="{ 'summary-value-tips--open': showValueTips }"
              @mouseenter="onValueTipsMouseEnter"
              @mouseleave="onValueTipsMouseLeave"
            >
              <button
                ref="valueTipsButtonRef"
                type="button"
                class="summary-tip-btn"
                :aria-expanded="showValueTips ? 'true' : 'false'"
                :aria-label="t('home.summary.totalAmountInfo')"
                @click.stop="toggleValueTips"
              >
                ?
              </button>
            </div>
          </div>
          <button
            type="button"
            class="summary-visibility-btn"
            :aria-label="isHidden ? t('home.summary.showAmount') : t('home.summary.hideAmount')"
            @click="toggleHidden"
          >
            <svg v-if="!isHidden" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M2.75 12C4.6 8.92 7.88 7 12 7s7.4 1.92 9.25 5c-1.85 3.08-5.13 5-9.25 5s-7.4-1.92-9.25-5Z" />
              <circle cx="12" cy="12" r="2.6" />
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 4 20 20" />
              <path d="M9.9 7.28A11.4 11.4 0 0 1 12 7c4.12 0 7.4 1.92 9.25 5a11.8 11.8 0 0 1-3.03 3.33" />
              <path d="M6.16 9.09A11.53 11.53 0 0 0 2.75 12c1.85 3.08 5.13 5 9.25 5 1.08 0 2.1-.13 3.04-.39" />
              <path d="M10.59 10.59A2.05 2.05 0 0 0 10 12c0 1.1.9 2 2 2 .52 0 1-.2 1.36-.53" />
            </svg>
          </button>
        </div>

        <p class="summary-value">
          <template v-if="isHidden">-</template>
          <template v-else>
            <span class="summary-currency">{{ currency }}</span>{{ intPart }}<span class="summary-decimal">.{{ decPart }}</span>
          </template>
        </p>

        <button
          v-if="hasTrendData"
          type="button"
          class="summary-trend-toggle"
          :class="{ 'summary-trend-toggle--open': showTrendDetails }"
          @click="toggleTrendDetails"
        >
          <span>{{ showTrendDetails ? t('home.summary.collapseTrend') : t('home.summary.viewTrend') }}</span>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M7 10L12 15L17 10" />
          </svg>
        </button>
      </div>

      <div v-if="hasTrendData" class="summary-trend summary-trend--desktop">
        <div class="summary-sparkline" aria-hidden="true">
          <svg viewBox="0 0 100 32" preserveAspectRatio="none">
            <path v-if="trendAreaPath" :d="trendAreaPath" class="summary-sparkline__area" />
            <path v-if="trendLinePath" :d="trendLinePath" class="summary-sparkline__line" />
          </svg>
        </div>

        <div class="summary-metrics">
          <article class="summary-metric">
            <p class="summary-metric__label">{{ t('home.summary.recent30Days') }}</p>
            <p class="summary-metric__value">¥{{ formatTrendAmount(recentChangeAmount) }}</p>
            <p class="summary-metric__meta">{{ recentChangeCount }} {{ t('home.summary.itemsUnit') }}</p>
          </article>

          <article class="summary-metric">
            <p class="summary-metric__label">{{ t('home.summary.thisMonth') }}</p>
            <p class="summary-metric__value">¥{{ formatTrendAmount(monthChangeAmount) }}</p>
            <p class="summary-metric__meta">{{ monthChangeCount }} {{ t('home.summary.itemsUnit') }}</p>
          </article>
        </div>
      </div>
    </div>

    <transition name="summary-trend-expand">
      <div v-if="hasTrendData && showTrendDetails" class="summary-trend summary-trend--mobile">
        <div class="summary-sparkline" aria-hidden="true">
          <svg viewBox="0 0 100 32" preserveAspectRatio="none">
            <path v-if="trendAreaPath" :d="trendAreaPath" class="summary-sparkline__area" />
            <path v-if="trendLinePath" :d="trendLinePath" class="summary-sparkline__line" />
          </svg>
        </div>

        <div class="summary-metrics">
          <article class="summary-metric">
            <p class="summary-metric__label">{{ t('home.summary.recent30Days') }}</p>
            <p class="summary-metric__value">¥{{ formatTrendAmount(recentChangeAmount) }}</p>
            <p class="summary-metric__meta">{{ recentChangeCount }} {{ t('home.summary.itemsUnit') }}</p>
          </article>

          <article class="summary-metric">
            <p class="summary-metric__label">{{ t('home.summary.thisMonth') }}</p>
            <p class="summary-metric__value">¥{{ formatTrendAmount(monthChangeAmount) }}</p>
            <p class="summary-metric__meta">{{ monthChangeCount }} {{ t('home.summary.itemsUnit') }}</p>
          </article>
        </div>
      </div>
    </transition>
  </section>

  <Teleport v-if="showTips" to="body">
    <transition name="summary-tip-fade">
      <div
        v-if="showValueTips"
        ref="valueTipsPopoverRef"
        class="summary-tip-popover"
        :style="valueTipsPopoverStyle"
        role="note"
        @mouseenter="onValueTipsPopoverMouseEnter"
        @mouseleave="onValueTipsPopoverMouseLeave"
      >
        <p class="summary-tip-title">{{ resolvedTipsTitle }}</p>
        <ul class="summary-tip-list">
          <li v-for="item in resolvedTipsItems" :key="item">{{ item }}</li>
        </ul>
      </div>
    </transition>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const SUMMARY_VISIBILITY_STORAGE_KEY = 'goods-app:home-total-value-hidden'

const props = defineProps({
  totalValue: { type: String, default: '0.00' },
  totalCount: { type: Number, default: 0 },
  trendItems: { type: Array, default: () => [] },
  trendDateField: { type: String, default: 'updatedAt' },
  label: { type: String, default: 'Collection Value' },
  storageKey: { type: String, default: SUMMARY_VISIBILITY_STORAGE_KEY },
  currency: { type: String, default: '¥' },
  showTips: { type: Boolean, default: true },
  tipsTitle: { type: String, default: '' },
  tipsItems: {
    type: Array,
    default: undefined
  }
})

const resolvedTipsTitle = computed(() => props.tipsTitle || t('home.summary.tipsTitle'))
const resolvedTipsItems = computed(() => props.tipsItems || [
  t('home.summary.tip1'),
  t('home.summary.tip2'),
  t('home.summary.tip3'),
  t('home.summary.tip4')
])

const intPart = computed(() => props.totalValue.split('.')[0])
const decPart = computed(() => props.totalValue.split('.')[1] ?? '00')
const isHidden = ref(localStorage.getItem(props.storageKey) === '1')
const showTrendDetails = ref(false)
const valueTipsRef = ref(null)
const valueTipsButtonRef = ref(null)
const valueTipsPopoverRef = ref(null)
const showValueTips = ref(false)
const valueTipsPinned = ref(false)
const valueTipsPopoverStyle = ref({})
const isValueTipsTriggerHovering = ref(false)
const isValueTipsPopoverHovering = ref(false)
let valueTipsHideTimer = 0

const hasTrendData = computed(() => Array.isArray(props.trendItems) && props.trendItems.length > 0)

const MS_PER_DAY = 24 * 60 * 60 * 1000

function parseTrendValue(item) {
  // Support recharge records (amount field)
  const amount = Number(item?.amount)
  if (Number.isFinite(amount)) return amount

  const totalValueNumber = Number(item?.totalValueNumber)
  if (Number.isFinite(totalValueNumber)) return totalValueNumber

  const effectivePriceNumber = Number(item?.effectivePriceNumber)
  const quantityNumber = Number(item?.quantityNumber ?? item?.quantity ?? 1) || 1
  if (Number.isFinite(effectivePriceNumber)) {
    return effectivePriceNumber * quantityNumber
  }

  const fallbackPrice = Number.parseFloat(item?.actualPrice ?? item?.price ?? '')
  return Number.isFinite(fallbackPrice) ? fallbackPrice * quantityNumber : 0
}

function getTrendTimestamp(item) {
  const fieldName = props.trendDateField || 'updatedAt'
  const rawValue = item?.[fieldName]
  if (fieldName === 'acquiredAt') {
    const timestamp = Date.parse(String(rawValue || ''))
    return Number.isFinite(timestamp) ? timestamp : 0
  }

  if (fieldName === 'createdAt' || fieldName === 'updatedAt') {
    return Number(rawValue) || 0
  }

  const timestamp = Date.parse(String(rawValue || ''))
  return Number.isFinite(timestamp) ? timestamp : (Number(rawValue) || 0)
}

// Single-pass computation for all trend stats to avoid 4 separate full-list scans
// Single-pass computation for all trend stats to avoid 4 separate full-list scans
const trendStats = computed(() => {
  const buckets = Array.from({ length: 30 }, () => 0)
  let recentCount = 0
  let monthCount = 0
  let monthAmount = 0

  if (hasTrendData.value) {
    const today = new Date()
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
    const sevenDayStart = startOfToday - (29 * MS_PER_DAY)
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).getTime()

    for (const item of props.trendItems) {
      const trendTimestamp = getTrendTimestamp(item)
      if (!trendTimestamp) continue

      const value = parseTrendValue(item)

      const dayIndex = Math.floor((startOfToday - new Date(trendTimestamp).setHours(0, 0, 0, 0)) / MS_PER_DAY)
      if (dayIndex >= 0 && dayIndex <= 29) {
        buckets[29 - dayIndex] += value
      }

      if (trendTimestamp >= sevenDayStart) recentCount++
      if (trendTimestamp >= monthStart) {
        monthCount++
        monthAmount += value
      }
    }
  }

  const recentAmount = buckets.reduce((sum, v) => sum + v, 0)
  return { buckets, recentCount, recentAmount, monthCount, monthAmount }
})

const trendSeries = computed(() => trendStats.value.buckets)
const recentChangeCount = computed(() => trendStats.value.recentCount)
const recentChangeAmount = computed(() => trendStats.value.recentAmount)
const monthChangeCount = computed(() => trendStats.value.monthCount)
const monthChangeAmount = computed(() => trendStats.value.monthAmount)

const trendLinePath = computed(() => buildTrendPath(trendSeries.value, false))
const trendAreaPath = computed(() => buildTrendPath(trendSeries.value, true))

function buildTrendPath(values, withArea) {
  const maxValue = Math.max(...values, 0)
  if (maxValue <= 0) return ''

  const width = 100
  const height = 32
  const points = values.map((value, index) => {
    const x = values.length <= 1 ? 0 : (index / (values.length - 1)) * width
    const y = height - ((value / maxValue) * (height - 6)) - 3
    return { x, y }
  })

  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ')
  if (!withArea) return line

  return `${line} L 100 32 L 0 32 Z`
}

function formatTrendAmount(value) {
  return Number(value || 0).toFixed(2)
}

function toggleHidden() {
  isHidden.value = !isHidden.value
}

function toggleTrendDetails() {
  showTrendDetails.value = !showTrendDetails.value
}

function onValueTipsMouseEnter() {
  isValueTipsTriggerHovering.value = true
  clearValueTipsHideTimer()
  showValueTips.value = true
}

function onValueTipsMouseLeave() {
  isValueTipsTriggerHovering.value = false
  queueValueTipsAutoHide()
}

function onValueTipsPopoverMouseEnter() {
  isValueTipsPopoverHovering.value = true
  clearValueTipsHideTimer()
  showValueTips.value = true
}

function onValueTipsPopoverMouseLeave() {
  isValueTipsPopoverHovering.value = false
  queueValueTipsAutoHide()
}

function toggleValueTips() {
  const nextPinned = !valueTipsPinned.value
  valueTipsPinned.value = nextPinned
  if (nextPinned) {
    clearValueTipsHideTimer()
    showValueTips.value = true
    return
  }

  showValueTips.value = isValueTipsTriggerHovering.value || isValueTipsPopoverHovering.value
}

function clearValueTipsHideTimer() {
  if (!valueTipsHideTimer) return
  window.clearTimeout(valueTipsHideTimer)
  valueTipsHideTimer = 0
}

function queueValueTipsAutoHide() {
  if (valueTipsPinned.value) return
  clearValueTipsHideTimer()
  valueTipsHideTimer = window.setTimeout(() => {
    if (valueTipsPinned.value) return
    if (isValueTipsTriggerHovering.value || isValueTipsPopoverHovering.value) return
    showValueTips.value = false
  }, 120)
}

function updateValueTipsPosition() {
  if (!showValueTips.value) return

  const trigger = valueTipsButtonRef.value
  if (!trigger) return

  const triggerRect = trigger.getBoundingClientRect()
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0
  const sideGap = 12
  const width = Math.max(220, Math.min(320, viewportWidth - (sideGap * 2)))

  let left = triggerRect.left + (triggerRect.width / 2) - (width / 2)
  left = Math.min(Math.max(left, sideGap), Math.max(sideGap, viewportWidth - width - sideGap))

  const measuredHeight = valueTipsPopoverRef.value?.offsetHeight || 170
  const normalTop = triggerRect.bottom + 10
  const hasBottomSpace = normalTop + measuredHeight <= (viewportHeight - sideGap)
  const top = hasBottomSpace
    ? normalTop
    : Math.max(sideGap, triggerRect.top - measuredHeight - 10)

  valueTipsPopoverStyle.value = {
    left: `${Math.round(left)}px`,
    top: `${Math.round(top)}px`,
    width: `${Math.round(width)}px`
  }
}

function handleOutsidePointerDown(event) {
  const host = valueTipsRef.value
  const popover = valueTipsPopoverRef.value
  if (!host) return
  if (host.contains(event.target)) return
  if (popover?.contains(event.target)) return
  clearValueTipsHideTimer()
  isValueTipsTriggerHovering.value = false
  isValueTipsPopoverHovering.value = false
  valueTipsPinned.value = false
  showValueTips.value = false
}

onMounted(() => {
  document.addEventListener('pointerdown', handleOutsidePointerDown)
  window.addEventListener('resize', updateValueTipsPosition, { passive: true })
  window.addEventListener('scroll', updateValueTipsPosition, { passive: true, capture: true })
})

onBeforeUnmount(() => {
  clearValueTipsHideTimer()
  document.removeEventListener('pointerdown', handleOutsidePointerDown)
  window.removeEventListener('resize', updateValueTipsPosition)
  window.removeEventListener('scroll', updateValueTipsPosition, true)
})

watch(showValueTips, async (visible) => {
  if (!visible) return
  await nextTick()
  updateValueTipsPosition()
})

watch(isHidden, (value) => {
  localStorage.setItem(props.storageKey, value ? '1' : '0')
}, { immediate: true })
</script>

<style scoped>
.summary-card {
  position: relative;
  padding: 24px;
  border-radius: var(--radius-large);
  overflow: hidden;
  color: var(--summary-card-text);
  background:
    radial-gradient(circle at top left, rgba(255, 255, 255, 0.16), transparent 34%),
    var(--summary-card-gradient);
  box-shadow: var(--app-shadow);
}

.summary-layout {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 18px;
}

.summary-main {
  min-width: 0;
}

.summary-card ::selection {
  color: var(--summary-card-text);
  background: color-mix(in srgb, var(--summary-card-text) 24%, transparent);
}

.summary-card ::-moz-selection {
  color: var(--summary-card-text);
  background: color-mix(in srgb, var(--summary-card-text) 24%, transparent);
}

.summary-orb {
  position: absolute;
  border-radius: 50%;
  background: var(--summary-card-orb);
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
  min-height: 32px;
}

.summary-label {
  color: var(--summary-card-label);
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.summary-label-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.summary-value-tips {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.summary-tip-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.92);
  font-size: 13px;
  font-weight: 700;
  line-height: 1;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.2);
  transition: transform 0.16s ease, background 0.16s ease;
}

.summary-tip-btn:active {
  transform: scale(0.94);
}

.summary-value-tips--open .summary-tip-btn {
  background: rgba(255, 255, 255, 0.3);
}

.summary-tip-popover {
  position: fixed;
  padding: 12px 14px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--app-glass-strong) 92%, transparent);
  border: 1px solid var(--app-glass-border);
  color: var(--app-text);
  box-shadow:
    0 12px 26px color-mix(in srgb, var(--app-overlay) 58%, transparent),
    inset 0 0 0 1px color-mix(in srgb, var(--app-glass-border) 28%, transparent);
  backdrop-filter: blur(var(--app-overlay-blur)) saturate(var(--app-overlay-saturate));
  -webkit-backdrop-filter: blur(var(--app-overlay-blur)) saturate(var(--app-overlay-saturate));
  z-index: 1200;
}

.summary-tip-title {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--app-text);
}

.summary-tip-list {
  margin: 8px 0 0;
  padding-left: 16px;
  display: grid;
  gap: 4px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--app-text-secondary);
}

.summary-tip-fade-enter-active,
.summary-tip-fade-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.summary-tip-fade-enter-from,
.summary-tip-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.summary-visibility-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--summary-card-button-text);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.08),
    0 8px 20px rgba(0, 0, 0, 0.16);
  transition: transform 0.16s ease, background 0.16s ease, color 0.16s ease;
}

.summary-visibility-btn:active {
  transform: scale(0.94);
  background: rgba(255, 255, 255, 0.12);
}

.summary-visibility-btn svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 2;
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

.summary-trend-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 16px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--summary-card-label);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.summary-trend-toggle svg {
  width: 14px;
  height: 14px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform 0.18s ease;
}

.summary-trend-toggle--open svg {
  transform: rotate(180deg);
}

.summary-trend {
  min-width: 0;
}

.summary-trend--desktop {
  display: none;
}

.summary-trend--mobile {
  margin-top: 18px;
}

.summary-sparkline {
  width: 100%;
  height: 46px;
  margin-bottom: 14px;
}

.summary-sparkline svg {
  width: 100%;
  height: 100%;
}

.summary-sparkline__line {
  fill: none;
  stroke: rgba(255, 255, 255, 0.85);
  stroke-width: 1.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.summary-sparkline__area {
  fill: rgba(255, 255, 255, 0.16);
}

.summary-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.summary-metric {
  min-width: 0;
  padding: 12px 14px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.07);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
}

.summary-metric__label {
  color: var(--summary-card-label);
  font-size: 12px;
  line-height: 1.2;
}

.summary-metric__value {
  margin-top: 8px;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.15;
}

.summary-metric__meta {
  margin-top: 4px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 11px;
}

.summary-trend-expand-enter-active,
.summary-trend-expand-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.summary-trend-expand-enter-from,
.summary-trend-expand-leave-to {
  opacity: 0;
  transform: translateY(-6px);
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

  .summary-metrics {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }
}

@media (min-width: 900px) {
  .summary-layout {
    grid-template-columns: minmax(0, 1fr) minmax(280px, 1fr);
    align-items: center;
    gap: 22px;
  }

  .summary-trend--desktop {
    display: grid;
    gap: 14px;
  }

  .summary-trend--mobile,
  .summary-trend-toggle {
    display: none;
  }

  .summary-metrics {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }

  .summary-metric__value {
    font-size: 16px;
  }
}
</style>
