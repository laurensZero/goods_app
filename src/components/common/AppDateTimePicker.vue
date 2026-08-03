<template>
  <Popup
    v-model:show="showProxy"
    teleport="body"
    :z-index="zIndex"
    :lock-scroll="false"
    :position="popupPosition"
    :round="!isTablet"
    transition="sheet-pop"
    :class="['picker-popup', { 'picker-popup--center': isTablet }]"
    @opened="onOpened"
  >
    <div class="dt-picker">
      <div class="dt-picker-toolbar">
        <button class="dt-picker-btn" @click="handleCancel">{{ t('common.cancel') }}</button>
        <div class="dt-picker-tabs">
          <button
            :class="['dt-picker-tab', { 'dt-picker-tab--active': activeTab === 'date' }]"
            @click="activeTab = 'date'"
          >{{ t('common.date') }}</button>
          <button
            :class="['dt-picker-tab', { 'dt-picker-tab--active': activeTab === 'time' }]"
            @click="activeTab = 'time'"
          >{{ t('common.time') }}</button>
        </div>
        <button class="dt-picker-btn dt-picker-btn--confirm" @click="handleConfirm">{{ t('common.confirm') }}</button>
      </div>

      <div class="dt-picker-preview">
        {{ previewText }}
      </div>

      <DatePicker
        v-show="activeTab === 'date'"
        v-model="dateValue"
        :min-date="minDate"
        :max-date="maxDate"
        :show-toolbar="false"
      />
      <TimePicker
        v-show="activeTab === 'time'"
        v-model="timeValue"
        :columns-type="['hour', 'minute']"
        :show-toolbar="false"
      />
    </div>
  </Popup>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { DatePicker, TimePicker, Popup } from 'vant'

const props = defineProps({
  show: { type: Boolean, default: false },
  modelValue: { type: String, default: '' },
  title: { type: String, default: '' },
  minDate: { type: Date, default: null },
  maxDate: { type: Date, default: null },
  isTablet: { type: Boolean, default: false },
  zIndex: { type: Number, default: 2000 }
})

const emit = defineEmits(['update:show', 'update:modelValue', 'confirm', 'cancel'])
const { t } = useI18n()

const activeTab = ref('date')
const dateValue = ref([])
const timeValue = ref([])

const popupPosition = computed(() => (props.isTablet ? 'center' : 'bottom'))

const showProxy = computed({
  get: () => props.show,
  set: (v) => emit('update:show', v)
})

const previewText = computed(() => {
  const d = dateValue.value
  const t = timeValue.value
  if (!d.length || !t.length) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d[0]}-${pad(d[1])}-${pad(d[2])} ${pad(t[0])}:${pad(t[1])}`
})

function parseModelValue(val) {
  const str = String(val || '').replace(' ', 'T').slice(0, 16)
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/)
  if (match) {
    return {
      date: [Number(match[1]), Number(match[2]), Number(match[3])],
      time: [String(match[4]), String(match[5])]
    }
  }
  const now = new Date()
  return {
    date: [now.getFullYear(), now.getMonth() + 1, now.getDate()],
    time: [String(now.getHours()).padStart(2, '0'), String(now.getMinutes()).padStart(2, '0')]
  }
}

function onOpened() {
  const parsed = parseModelValue(props.modelValue)
  dateValue.value = parsed.date
  timeValue.value = parsed.time
  activeTab.value = 'date'
}

function handleCancel() {
  showProxy.value = false
  emit('cancel')
}

function handleConfirm() {
  const d = dateValue.value
  const t = timeValue.value
  if (!d.length || !t.length) return
  const pad = (n) => String(n).padStart(2, '0')
  const result = `${d[0]}-${pad(d[1])}-${pad(d[2])}T${pad(t[0])}:${pad(t[1])}`
  emit('update:modelValue', result)
  emit('confirm', result)
  showProxy.value = false
}
</script>

<style scoped>
.dt-picker {
  padding-bottom: env(safe-area-inset-bottom, 0);
}

.dt-picker-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px 8px;
}

.dt-picker-btn {
  border: none;
  background: none;
  font-size: 15px;
  color: var(--app-text-secondary);
  cursor: pointer;
  padding: 4px 8px;
}

.dt-picker-btn--confirm {
  color: var(--app-chip-accent-text);
  font-weight: 600;
}

.dt-picker-tabs {
  display: flex;
  gap: 4px;
  background: var(--app-surface-soft);
  border-radius: 10px;
  padding: 3px;
}

.dt-picker-tab {
  border: none;
  background: none;
  font-size: 13px;
  font-weight: 500;
  color: var(--app-text-tertiary);
  padding: 5px 14px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.dt-picker-tab--active {
  background: var(--app-surface);
  color: var(--app-text);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

.dt-picker-preview {
  text-align: center;
  font-size: 20px;
  font-weight: 600;
  color: var(--app-text);
  padding: 4px 16px 12px;
  letter-spacing: 0.5px;
}
</style>
