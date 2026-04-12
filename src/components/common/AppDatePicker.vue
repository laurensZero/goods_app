<template>
  <Popup
    v-model:show="showProxy"
    teleport="body"
    :z-index="zIndex"
    :lock-scroll="false"
    :position="popupPosition"
    :round="!isTablet"
    :class="['picker-popup', { 'picker-popup--center': isTablet }]"
  >
    <DatePicker
      v-model="valueProxy"
      :title="title"
      :min-date="minDate"
      :max-date="maxDate"
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
  minDate: {
    type: Date,
    default: null
  },
  maxDate: {
    type: Date,
    default: null
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
