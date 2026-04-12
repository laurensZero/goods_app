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
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { DatePicker, Popup } from 'vant'

const CENTER_BREAKPOINT = 900

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

const viewportWidth = ref(typeof window === 'undefined' ? 0 : window.innerWidth)
const shouldCenter = computed(() => props.isTablet || viewportWidth.value >= CENTER_BREAKPOINT)
const popupPosition = computed(() => (shouldCenter.value ? 'center' : 'bottom'))

function handleResize() {
  viewportWidth.value = window.innerWidth
}

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

onMounted(() => {
  handleResize()
  window.addEventListener('resize', handleResize, { passive: true })
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
})
</script>
