<!--
  ImportImagePicker.vue
  导入表单图片多选器：标签行（可带 actions 插槽，如「包含详情图」开关）
  + 横向滚动的图片选择条。v-model 为已选图片数组。
-->
<template>
  <div class="field">
    <div v-if="hasActions" class="field-row">
      <span class="field-label">{{ displayLabel }}<span v-if="modelValue.length > 1" class="img-picker-count">{{ modelValue.length }}</span></span>
      <slot name="actions" />
    </div>
    <span v-else class="field-label">{{ displayLabel }}<span v-if="modelValue.length > 1" class="img-picker-count">{{ modelValue.length }}</span></span>

    <div class="img-picker-scroll">
      <button
        v-for="(img, idx) in images"
        :key="idx"
        type="button"
        class="img-picker-item"
        :class="{ 'img-picker-item--active': modelValue.includes(img) }"
        @click="toggle(img)"
      >
        <img :src="img + thumbQuery" :alt="t('import.imageAlt', { index: idx + 1 })" loading="lazy" />
        <span v-if="idx === 0" class="img-picker-badge">{{ t('import.cover') }}</span>
        <div v-if="modelValue.includes(img)" class="img-picker-check">✓</div>
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, useSlots } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  images: {
    type: Array,
    default: () => []
  },
  modelValue: {
    type: Array,
    default: () => []
  },
  thumbQuery: {
    type: String,
    default: ''
  },
  label: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['update:modelValue'])

const slots = useSlots()
const { t } = useI18n()

const hasActions = computed(() => Boolean(slots.actions))
const displayLabel = computed(() => props.label || t('import.selectImages'))

function toggle(img) {
  const next = [...props.modelValue]
  const idx = next.indexOf(img)
  if (idx >= 0) {
    next.splice(idx, 1)
  } else {
    next.push(img)
  }
  emit('update:modelValue', next)
}
</script>

<style scoped>
.field {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border-radius: var(--radius-small, 12px);
  background: var(--app-surface-soft);
}

.field-label {
  color: var(--app-text);
  font-size: 14px;
  font-weight: 600;
}

.field-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.img-picker-scroll {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding: 4px 2px 6px;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.img-picker-scroll::-webkit-scrollbar {
  display: none;
}

.img-picker-item {
  flex-shrink: 0;
  position: relative;
  width: 80px;
  height: 80px;
  border: 2px solid transparent;
  border-radius: var(--radius-xs);
  overflow: hidden;
  padding: 0;
  background: var(--app-surface-soft);
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s, transform 0.12s;
}

.img-picker-item:active {
  transform: scale(0.96);
}

.img-picker-item--active {
  border-color: #2070c0;
  box-shadow: 0 0 0 1px color-mix(in srgb, #4a7aec 36%, transparent);
}

.img-picker-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.img-picker-badge {
  position: absolute;
  bottom: 3px;
  left: 3px;
  padding: 1px 5px;
  border-radius: 5px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 10px;
  font-weight: 500;
}

.img-picker-check {
  position: absolute;
  top: 3px;
  right: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #2070c0;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.img-picker-count {
  display: inline-block;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: #2070c0;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
  text-align: center;
  margin-left: 4px;
  vertical-align: middle;
}

:global(html.theme-dark) .img-picker-item {
  background: rgba(255, 255, 255, 0.06);
}

:global(html.theme-dark) .img-picker-item--active {
  border-color: rgba(109, 157, 255, 0.86);
  box-shadow: 0 0 0 1px rgba(109, 157, 255, 0.26);
}
</style>
