<template>
  <div class="sq sq-rating">
    <div class="sq-header">
      <h3 class="sq-title">{{ question.title }}</h3>
      <span v-if="question.required" class="sq-required">*</span>
      <span v-else class="sq-optional">({{ t('survey.optional') }})</span>
    </div>
    <p v-if="question.description" class="sq-desc">{{ question.description }}</p>
    <div class="sq-rating-body">
      <div class="sq-stars">
        <button
          v-for="star in maxRating"
          :key="star"
          type="button"
          class="sq-star"
          :class="{ 'sq-star--active': star <= (modelValue || 0) }"
          @click="$emit('update:modelValue', star === modelValue ? 0 : star)"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        </button>
      </div>
      <div v-if="hasLabels" class="sq-rating-labels">
        <span class="sq-rating-label sq-rating-label--min">{{ question.labels?.['1'] || '' }}</span>
        <span class="sq-rating-label sq-rating-label--max">{{ question.labels?.[String(maxRating)] || '' }}</span>
      </div>
      <div v-if="modelValue > 0" class="sq-rating-value">
        {{ modelValue }} / {{ maxRating }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

defineOptions({ name: 'SurveyQuestionRating' })

const { t } = useI18n()

const props = defineProps({
  question: { type: Object, required: true },
  modelValue: { type: Number, default: 0 }
})

defineEmits(['update:modelValue'])

const maxRating = computed(() => {
  const max = Number(props.question.maxRating) || 5
  return Math.max(1, Math.min(10, max))
})

const hasLabels = computed(() => {
  const labels = props.question.labels || {}
  return !!(labels['1'] || labels[String(maxRating.value)])
})
</script>

<style scoped>
.sq {
  padding: 16px 0;
}
.sq-header {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-bottom: 4px;
}
.sq-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--van-text-color);
  margin: 0;
}
.sq-required {
  color: var(--van-danger-color);
  font-weight: 700;
}
.sq-optional {
  font-size: 12px;
  color: var(--van-text-color-3);
  font-weight: 400;
}
.sq-desc {
  font-size: 13px;
  color: var(--van-text-color-2);
  margin: 0 0 12px;
  line-height: 1.5;
}
.sq-rating-body {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}
.sq-stars {
  display: flex;
  gap: 4px;
}
.sq-star {
  width: 40px;
  height: 40px;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--van-border-color);
  transition: all 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
}
.sq-star svg {
  width: 32px;
  height: 32px;
}
.sq-star--active {
  color: #f5a623;
}
.sq-star:active {
  transform: scale(0.9);
}
.sq-rating-labels {
  display: flex;
  justify-content: space-between;
  width: 100%;
  max-width: 240px;
}
.sq-rating-label {
  font-size: 11px;
  color: var(--van-text-color-3);
}
.sq-rating-value {
  font-size: 13px;
  color: var(--van-text-color-2);
  font-weight: 500;
}
</style>
