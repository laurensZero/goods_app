<template>
  <div class="sq sq-matrix">
    <div class="sq-header">
      <h3 class="sq-title">{{ question.title }}</h3>
      <span v-if="question.required" class="sq-required">*</span>
      <span v-else class="sq-optional">({{ t('survey.optional') }})</span>
    </div>
    <p v-if="question.description" class="sq-desc">{{ question.description }}</p>
    <div class="sq-matrix-grid">
      <div
        v-for="row in question.rows"
        :key="row.id"
        class="sq-matrix-row"
      >
        <div class="sq-matrix-row-label">{{ row.label }}</div>
        <div class="sq-matrix-row-stars">
          <div
            v-for="(col, colIdx) in question.columns"
            :key="col.id"
            class="sq-matrix-cell"
            :class="{ 'sq-matrix-cell--active': selectedStarIndex(row.id) >= colIdx }"
            @click="setRowValue(row.id, col.id)"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

defineOptions({ name: 'SurveyQuestionMatrix' })

const { t } = useI18n()

const props = defineProps({
  question: { type: Object, required: true },
  modelValue: { type: Object, default: () => ({}) }
})

const emit = defineEmits(['update:modelValue'])

const currentValue = computed(() => {
  return props.modelValue || {}
})

function selectedStarIndex(rowId) {
  const val = currentValue.value[rowId]
  if (!val) return -1
  return props.question.columns.findIndex(c => c.id === val)
}

function setRowValue(rowId, value) {
  const next = { ...currentValue.value, [rowId]: value }
  emit('update:modelValue', next)
}
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

/* Grid layout — one screen, no horizontal scroll */
.sq-matrix-grid {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
}
.sq-matrix-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 0;
  border-top: 1px solid var(--van-border-color);
}
.sq-matrix-row:first-child {
  border-top: none;
}
.sq-matrix-row-label {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--van-text-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sq-matrix-row-stars {
  flex-shrink: 0;
  display: flex;
  gap: 2px;
}
.sq-matrix-cell {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--van-border-color);
  cursor: pointer;
  transition: color 0.15s;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}
.sq-matrix-cell svg {
  width: 24px;
  height: 24px;
  pointer-events: none;
}
.sq-matrix-cell--active {
  color: #f5a623 !important;
}
.sq-matrix-cell:active {
  transform: scale(0.9);
}
</style>
