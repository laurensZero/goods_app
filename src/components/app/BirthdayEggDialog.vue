<template>
  <Transition name="sheet-pop">
    <div v-if="showDialog" class="overlay" @click.self="store.dismiss()">
      <div
        class="dialog birthday-dialog"
        :style="accentStyle"
        @touchstart.passive="onTouchStart"
        @touchend.passive="onTouchEnd"
      >
        <div class="birthday-ribbon" aria-hidden="true">🎂</div>
        <p class="birthday-kicker">Happy Birthday</p>
        <h3 class="dialog-title">{{ t('birthday.todayTitle', { name: current.name }) }}</h3>

        <p class="birthday-meta">
          <span v-if="current.ip" class="birthday-meta__ip">{{ current.ip }}</span>
          <span>{{ t('birthday.dateLabel', { month: current.month, day: current.day }) }}</span>
        </p>

        <p class="birthday-message">
          {{ current.message || t('birthday.defaultMessage', { name: current.name }) }}
        </p>

        <div class="birthday-stats">
          <div class="birthday-stat">
            <span class="birthday-stat__value">{{ t('birthday.countValue', { count: formatQuantity(current.quantity) }) }}</span>
            <span class="birthday-stat__label">{{ t('birthday.countLabel') }}</span>
          </div>
          <div class="birthday-stat">
            <span class="birthday-stat__value">¥ {{ formatMoney(current.totalValue) }}</span>
            <span class="birthday-stat__label">{{ t('birthday.spendLabel') }}</span>
          </div>
        </div>

        <div v-if="current.imageUrls.length" class="birthday-wall">
          <img
            v-for="(url, index) in current.imageUrls"
            :key="`${current.id}-${index}`"
            :src="url"
            alt=""
            loading="lazy"
          />
        </div>

        <div v-if="birthdays.length > 1" class="birthday-pager" role="tablist">
          <button
            v-for="(entry, index) in birthdays"
            :key="entry.id"
            type="button"
            class="birthday-dot"
            :class="{ 'birthday-dot--active': index === activeIndex }"
            :aria-label="entry.name"
            @click="activeIndex = index"
          />
        </div>

        <div class="dialog-actions">
          <button type="button" class="dialog-btn dialog-btn--primary" @click="store.dismiss()">
            {{ t('common.known') }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCharacterBirthdayStore } from '@/stores/characterBirthday'

const { t } = useI18n()
const store = useCharacterBirthdayStore()

const activeIndex = ref(0)
const birthdays = computed(() => store.visibleBirthdays)
const showDialog = computed(() => store.dialogVisible && birthdays.value.length > 0)
const current = computed(() => birthdays.value[Math.min(activeIndex.value, birthdays.value.length - 1)] || birthdays.value[0])

watch(showDialog, (visible) => {
  if (visible) activeIndex.value = 0
})

// color 来自云端表，仅接受 #RGB/#RRGGBB(AA)，防止注入任意 CSS 值
const accentStyle = computed(() => {
  const color = String(current.value?.color || '').trim()
  if (!/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(color)) return {}
  return { '--birthday-accent': color }
})

let touchStartX = 0
function onTouchStart(event) {
  touchStartX = event.changedTouches?.[0]?.clientX ?? 0
}
function onTouchEnd(event) {
  if (birthdays.value.length < 2) return
  const deltaX = (event.changedTouches?.[0]?.clientX ?? 0) - touchStartX
  if (Math.abs(deltaX) < 48) return
  const total = birthdays.value.length
  activeIndex.value = (activeIndex.value + (deltaX < 0 ? 1 : total - 1)) % total
}

function formatQuantity(value) {
  const numeric = Number(value || 0)
  if (!Number.isFinite(numeric)) return '0'
  const text = numeric.toFixed(2).replace(/\.00$/, '').replace(/(\.[0-9]*?)0+$/, '$1')
  return text === '-0' ? '0' : text
}

function formatMoney(value) {
  return Number(value || 0).toFixed(2)
}
</script>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-dialog-high);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--app-overlay);
  backdrop-filter: blur(var(--app-frost-soft-blur)) saturate(var(--app-frost-saturate));
  -webkit-backdrop-filter: blur(var(--app-frost-soft-blur)) saturate(var(--app-frost-saturate));
}

.birthday-dialog {
  --birthday-accent: var(--app-text);
  position: relative;
  width: min(100%, 420px);
  max-height: 82vh;
  padding: 24px;
  border-radius: var(--radius-large);
  border-top: 4px solid var(--birthday-accent);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
  overflow-y: auto;
  scrollbar-width: none;
}

.birthday-dialog::-webkit-scrollbar {
  display: none;
}

.birthday-ribbon {
  position: absolute;
  top: 16px;
  right: 20px;
  font-size: 28px;
  line-height: 1;
}

.birthday-kicker {
  color: var(--birthday-accent);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.dialog-title {
  margin: 8px 0 0;
  color: var(--app-text);
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.04em;
}

.birthday-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  color: var(--app-text-tertiary);
  font-size: 13px;
}

.birthday-meta__ip {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
  font-weight: 500;
}

.birthday-message {
  margin-top: 12px;
  color: var(--app-text-secondary);
  font-size: 14px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

.birthday-stats {
  display: flex;
  gap: 12px;
  margin-top: 16px;
}

.birthday-stat {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px;
  border-radius: var(--radius-xs);
  background: var(--app-surface-soft);
}

.birthday-stat__value {
  color: var(--app-text);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.birthday-stat__label {
  color: var(--app-text-tertiary);
  font-size: 12px;
}

.birthday-wall {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  margin-top: 16px;
}

.birthday-wall img {
  display: block;
  width: 100%;
  aspect-ratio: 1;
  border-radius: var(--radius-xs);
  object-fit: cover;
  background: var(--app-surface-soft);
}

.birthday-pager {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-top: 16px;
}

.birthday-dot {
  width: 8px;
  height: 8px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--app-surface-soft);
  transition: background 0.2s ease, transform 0.2s ease;
}

.birthday-dot--active {
  background: var(--birthday-accent);
  transform: scale(1.25);
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}

.dialog-btn {
  min-height: 42px;
  padding: 0 18px;
  border: none;
  border-radius: var(--radius-xs);
  font-size: 14px;
  font-weight: 500;
}

.dialog-btn--primary {
  background: var(--app-text);
  color: var(--app-bg);
}
</style>
