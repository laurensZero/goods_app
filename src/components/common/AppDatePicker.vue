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
  >
    <DatePicker
      v-model="valueProxy"
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
  </Popup>
</template>

<script setup>
import { computed } from 'vue'
import { DatePicker, Popup } from 'vant'

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

const popupPosition = computed(() => (props.isTablet ? 'center' : 'bottom'))

const showProxy = computed({
  get: () => props.show,
  set: (value) => emit('update:show', value)
})

const valueProxy = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

function handleCancel(event) {
  emit('update:show', false)
  emit('cancel', event)
}

function handleConfirm(payload) {
  emit('confirm', payload)
}
</script>
