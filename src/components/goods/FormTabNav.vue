<template>
  <nav class="tab-nav" :aria-label="t('common.aria.formGroups')">
    <div class="tab-nav__scroll">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        type="button"
        :class="['tab-nav__item', { 'tab-nav__item--active': modelValue === tab.key }]"
        :aria-pressed="modelValue === tab.key"
        @click="$emit('update:modelValue', tab.key)"
      >
        <span class="tab-nav__label">{{ tab.label }}</span>
        <span v-if="tab.badge" class="tab-nav__badge" aria-hidden="true"></span>
      </button>
    </div>
  </nav>
</template>

<script setup>
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

defineProps({
  modelValue: {
    type: String,
    required: true
  },
  tabs: {
    type: Array,
    default: () => []
  }
})

defineEmits(['update:modelValue'])
</script>
