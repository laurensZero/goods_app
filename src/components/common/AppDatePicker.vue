<template>
  <AppSheet
    v-model="showProxy"
    :z-index="zIndex"
    :position="popupPosition"
    sheet-class="picker-popup"
  >
    <div class="picker-wheel-root" @wheel="onWheel">
      <DatePicker
        ref="pickerRef"
        v-model="innerValue"
        :title="title"
        :type="type"
        :min-date="minDate"
        :max-date="maxDate"
        :min-hour="minHour"
        :max-hour="maxHour"
        :min-minute="minMinute"
        :max-minute="maxMinute"
        @cancel="handleCancel"
        @confirm="handleConfirm"
      />
    </div>
  </AppSheet>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { DatePicker } from 'vant'
import AppSheet from '@/components/common/AppSheet.vue'
import { usePickerWheel } from '@/composables/usePickerWheel'

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  modelValue: {
    type: Array,
    default: () => []
  },
  title: {
    type: String,
    default: ''
  },
  type: {
    type: String,
    default: 'date'
  },
  minDate: {
    type: Date,
    default: null
  },
  maxDate: {
    type: Date,
    default: null
  },
  minHour: {
    type: Number,
    default: 0
  },
  maxHour: {
    type: Number,
    default: 23
  },
  minMinute: {
    type: Number,
    default: 0
  },
  maxMinute: {
    type: Number,
    default: 59
  },
  isTablet: {
    type: Boolean,
    default: false
  },
  zIndex: {
    type: Number,
    default: 2000
  }
})

const emit = defineEmits(['update:show', 'update:modelValue', 'cancel', 'confirm'])

const pickerRef = ref(null)
// 本地草稿：滑动期间不写回父组件，避免滚动卡顿和确认时被旧值覆盖
const innerValue = ref([])

const popupPosition = computed(() => (props.isTablet ? 'center' : 'bottom'))

const showProxy = computed({
  get: () => props.show,
  set: (value) => emit('update:show', value)
})

const { onWheel } = usePickerWheel(innerValue, {
  mode: props.type === 'datetime' || props.type === 'time' ? 'time' : 'date',
  minDate: props.minDate || undefined,
  maxDate: props.maxDate || undefined,
  minHour: props.minHour,
  maxHour: props.maxHour,
  minMinute: props.minMinute,
  maxMinute: props.maxMinute
})

function cloneValue(value) {
  return Array.isArray(value) ? value.map((item) => String(item ?? '')) : []
}

function syncFromModel() {
  innerValue.value = cloneValue(props.modelValue)
}

// 打开前先写入草稿，保证 DatePicker 挂载时就是目标值
watch(
  () => props.show,
  async (show) => {
    if (!show) return
    syncFromModel()
    await nextTick()
    // 弹层完全挂载后纠正滚动位置（应对 modelValue 从空/无效值恢复）
    try {
      pickerRef.value?.setValues?.(innerValue.value)
    } catch {
      // ignore
    }
  },
  { immediate: true }
)

function handleCancel() {
  emit('update:show', false)
  emit('cancel')
}

function handleConfirm(payload) {
  const values = cloneValue(payload?.selectedValues ?? innerValue.value)
  if (values.length) {
    innerValue.value = values
    emit('update:modelValue', values)
  }
  emit('confirm', { ...payload, selectedValues: values })
  emit('update:show', false)
}
</script>

<style scoped>
.picker-wheel-root {
  /* 让滚轮事件稳定落在列上，不触发外层页面滚动 */
  touch-action: none;
}
</style>
