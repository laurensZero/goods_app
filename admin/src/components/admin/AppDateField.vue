<template>
  <div ref="rootRef" class="app-date" :class="{ 'app-date--open': open, 'app-date--disabled': disabled }">
    <button class="app-date__trigger" type="button" :disabled="disabled" @click="toggle">
      <span class="app-date__value" :class="{ 'app-date__value--placeholder': !displayText }">
        {{ displayText || placeholder || (type === 'datetime' ? '选择日期时间…' : '选择日期…') }}
      </span>

      <svg class="app-date__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="5" width="18" height="16" rx="3" />
        <path d="M8 3V7" />
        <path d="M16 3V7" />
        <path d="M3 10H21" />
      </svg>
    </button>

    <transition name="select-panel">
      <div v-if="open" class="app-date__panel">
        <div class="app-date__cal">
          <div class="app-date__nav">
            <button class="app-date__nav-btn" type="button" aria-label="上个月" @click="shiftMonth(-1)">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 18L9 12L15 6" /></svg>
            </button>
            <span class="app-date__month">{{ year }} 年 {{ month + 1 }} 月</span>
            <button class="app-date__nav-btn" type="button" aria-label="下个月" @click="shiftMonth(1)">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 6L15 12L9 18" /></svg>
            </button>
          </div>

          <div class="app-date__weekdays">
            <span v-for="w in WEEKDAYS" :key="w">{{ w }}</span>
          </div>

          <div class="app-date__days">
            <button
              v-for="cell in weeks"
              :key="cell.date.getTime()"
              type="button"
              class="app-date__day"
              :class="{
                'app-date__day--outside': !cell.inMonth,
                'app-date__day--today': cell.isToday,
                'app-date__day--selected': cell.isSelected
              }"
              @click="pickDay(cell.date)"
            >
              {{ cell.day }}
            </button>
          </div>
        </div>

        <div v-if="type === 'datetime'" class="app-date__time">
          <span class="app-date__time-label">时间</span>
          <AppSelect v-model="hour" :options="HOURS" class="app-date__time-select" />
          <span class="app-date__colon">:</span>
          <AppSelect v-model="minute" :options="MINUTES" class="app-date__time-select" />
        </div>

        <div class="app-date__footer">
          <button
            v-if="clearable && modelValue"
            class="app-date__action"
            type="button"
            @click="clearValue"
          >
            清除
          </button>
          <button class="app-date__action app-date__action--primary" type="button" @click="confirm">
            确定
          </button>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import AppSelect from './AppSelect.vue'

const props = defineProps({
  modelValue: {
    type: [String, Number],
    default: ''
  },
  placeholder: {
    type: String,
    default: ''
  },
  type: {
    type: String,
    default: 'datetime'
  },
  clearable: {
    type: Boolean,
    default: true
  },
  disabled: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue', 'change'])

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

const HOURS = Array.from({ length: 24 }, (_, i) => ({ value: i, label: String(i).padStart(2, '0') }))
const MINUTES = Array.from({ length: 60 }, (_, i) => ({ value: i, label: String(i).padStart(2, '0') }))

const rootRef = ref(null)
const open = ref(false)

const year = ref(new Date().getFullYear())
const month = ref(new Date().getMonth())
const day = ref(new Date().getDate())
const hour = ref(0)
const minute = ref(0)

const pad = (n) => String(n).padStart(2, '0')

function parseValue(value) {
  if (value === '' || value === null || value === undefined) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

const displayText = computed(() => {
  const d = parseValue(props.modelValue)
  if (!d) return ''
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  if (props.type === 'datetime') {
    return `${date} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  return date
})

function initFromValue() {
  const d = parseValue(props.modelValue) || new Date()
  year.value = d.getFullYear()
  month.value = d.getMonth()
  day.value = d.getDate()
  hour.value = d.getHours()
  minute.value = d.getMinutes()
}

function toggle() {
  if (props.disabled) return
  if (open.value) {
    close()
  } else {
    initFromValue()
    open.value = true
  }
}

function close() {
  open.value = false
}

function sameDate(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

const weeks = computed(() => {
  const first = new Date(year.value, month.value, 1)
  const startOffset = (first.getDay() + 6) % 7
  const base = new Date(year.value, month.value, 1 - startOffset)
  const cells = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(base)
    d.setDate(base.getDate() + i)
    cells.push({
      date: d,
      day: d.getDate(),
      inMonth: d.getMonth() === month.value,
      isToday: sameDate(d, new Date()),
      isSelected: d.getFullYear() === year.value && d.getMonth() === month.value && d.getDate() === day.value
    })
  }
  return cells
})

function shiftMonth(delta) {
  let m = month.value + delta
  let y = year.value
  if (m < 0) { m = 11; y -= 1 }
  if (m > 11) { m = 0; y += 1 }
  year.value = y
  month.value = m
}

function pickDay(d) {
  year.value = d.getFullYear()
  month.value = d.getMonth()
  day.value = d.getDate()
}

function formatValue() {
  const date = `${year.value}-${pad(month.value + 1)}-${pad(day.value)}`
  if (props.type === 'datetime') {
    return `${date}T${pad(hour.value)}:${pad(minute.value)}`
  }
  return date
}

function confirm() {
  emit('update:modelValue', formatValue())
  emit('change', formatValue())
  close()
}

function clearValue() {
  emit('update:modelValue', '')
  emit('change', '')
  close()
}

function handleClickOutside(event) {
  if (!rootRef.value?.contains(event.target)) {
    close()
  }
}

function handleKeydown(event) {
  if (event.key === 'Escape') close()
}

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside)
  document.addEventListener('touchstart', handleClickOutside)
  document.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleClickOutside)
  document.removeEventListener('touchstart', handleClickOutside)
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<style scoped>
.app-date {
  position: relative;
  width: 100%;
  min-width: 0;
}

.app-date__trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: var(--input-height);
  padding: 0 12px;
  border: 1px solid var(--app-input-border);
  border-radius: var(--radius-xs);
  background: var(--app-surface);
  color: var(--app-text);
  font-size: 14px;
  text-align: left;
  cursor: pointer;
  transition: border-color var(--motion-fast) var(--motion-ease-default),
    box-shadow var(--motion-fast) var(--motion-ease-default),
    transform var(--motion-fast) var(--motion-ease-default);
}

.app-date__trigger:active {
  transform: scale(0.99);
}

.app-date--disabled .app-date__trigger {
  opacity: 0.55;
  cursor: not-allowed;
}

.app-date--open .app-date__trigger,
.app-date__trigger:focus-visible {
  border-color: var(--app-input-focus-border);
  box-shadow: 0 0 0 4px var(--app-input-focus-ring);
  outline: none;
}

.app-date__value {
  overflow: hidden;
  color: var(--app-text);
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-date__value--placeholder {
  color: var(--app-placeholder);
}

.app-date__icon {
  width: 16px;
  height: 16px;
  margin-left: 8px;
  flex-shrink: 0;
  stroke: var(--app-text-tertiary);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.app-date__panel {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 50;
  width: 300px;
  max-width: calc(100vw - 24px);
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-card);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
  display: grid;
  gap: 10px;
}

.app-date__nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.app-date__month {
  font-size: 14px;
  font-weight: 600;
  color: var(--app-text);
}

.app-date__nav-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
  cursor: pointer;
  transition: background var(--motion-fast) ease, transform var(--motion-fast) ease;
}

.app-date__nav-btn:active {
  transform: scale(0.94);
}

.app-date__nav-btn svg {
  width: 16px;
  height: 16px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.app-date__weekdays,
.app-date__days {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
}

.app-date__weekdays span {
  font-size: 11px;
  color: var(--app-text-tertiary);
  text-align: center;
  padding: 4px 0;
}

.app-date__day {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--app-text);
  font-size: 13px;
  cursor: pointer;
  transition: background var(--motion-fast) ease, color var(--motion-fast) ease,
    transform var(--motion-fast) ease;
}

.app-date__day:hover {
  background: var(--app-surface-soft);
}

.app-date__day:active {
  transform: scale(0.94);
}

.app-date__day--outside {
  color: var(--app-text-tertiary);
  opacity: 0.6;
}

.app-date__day--today {
  color: var(--app-pending);
  font-weight: 700;
}

.app-date__day--selected {
  background: var(--app-text);
  color: var(--app-bg);
  font-weight: 600;
}

.app-date__time {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-top: 10px;
  border-top: 1px solid var(--app-border);
}

.app-date__time-label {
  font-size: 12px;
  color: var(--app-text-secondary);
  margin-right: 2px;
}

.app-date__time-select {
  flex: 1;
  min-width: 0;
}

.app-date__colon {
  color: var(--app-text-tertiary);
  font-size: 14px;
  font-weight: 600;
}

.app-date__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px solid var(--app-border);
}

.app-date__action {
  min-height: 32px;
  padding: 0 16px;
  border: none;
  border-radius: 10px;
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: transform var(--motion-fast) ease, opacity var(--motion-fast) ease;
}

.app-date__action:active {
  transform: scale(0.96);
}

.app-date__action--primary {
  background: var(--app-text);
  color: var(--app-bg);
}

:global(html.theme-dark) .app-date__trigger {
  border-color: rgba(255, 255, 255, 0.08);
}

:global(html.theme-dark) .app-date__panel {
  border-color: rgba(255, 255, 255, 0.08);
  background: color-mix(in srgb, var(--app-surface) 96%, var(--app-glass));
  backdrop-filter: blur(var(--app-frost-blur)) saturate(var(--app-frost-saturate));
  -webkit-backdrop-filter: blur(var(--app-frost-blur)) saturate(var(--app-frost-saturate));
}

:global(html.theme-dark) .app-date__day--selected {
  background: rgba(245, 245, 247, 0.92);
  color: #141416;
}
</style>
