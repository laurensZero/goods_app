<template>
  <section class="editor-panel">
    <div class="editor-group">
      <p class="editor-group-title">{{ t('imageEditor.frame') }}</p>

      <div class="frame-categories">
        <button
          v-for="category in categoryOptions"
          :key="category.id"
          type="button"
          :class="['editor-chip', activeCategory === category.id && 'editor-chip--active']"
          :disabled="saving"
          @click="activeCategory = category.id"
        >
          {{ t(category.nameKey) }}
        </button>
      </div>

      <div class="frame-list">
        <button
          v-for="option in visibleFrames"
          :key="option.id"
          type="button"
          :class="['frame-item', modelValue === option.id && 'frame-item--active']"
          :disabled="saving"
          @click="emit('update:modelValue', option.id)"
        >
          <span class="frame-item__thumb">
            <EditorCanvasPreview
              :source="source"
              :frame="option.frame"
              :frame-colors="option.id === modelValue ? resolvedColors : option.defaultColors"
              :bg-color="bgColor"
              :fit-ratio="fitRatioPercent / 100"
              :padding="4"
            />
          </span>
          <span class="frame-item__label">{{ t(option.nameKey) }}</span>
        </button>
      </div>

      <p class="editor-hint">{{ t('imageEditor.frameHint') }}</p>
    </div>

    <div v-if="activeFrame && activeFrame.colorways && activeFrame.colorways.length" class="editor-group">
      <p class="editor-group-title">{{ t('imageEditor.frameColorway') }}</p>
      <div class="colorway-list">
        <button
          v-for="colorway in activeFrame.colorways"
          :key="colorway.id"
          type="button"
          :class="['colorway-item', colorwayId === colorway.id && 'colorway-item--active']"
          :disabled="saving"
          @click="emit('update:colorwayId', colorway.id)"
        >
          <span class="colorway-item__dots" aria-hidden="true">
            <span
              v-for="(color, index) in colorwaySwatches(colorway)"
              :key="index"
              class="colorway-item__dot"
              :style="{ background: color }"
            />
          </span>
          <span class="colorway-item__label">{{ t(colorway.nameKey) }}</span>
        </button>
      </div>
    </div>

    <div v-if="activeFrame && activeFrame.colorSlots && activeFrame.colorSlots.length" class="editor-group">
      <p class="editor-group-title">{{ t('imageEditor.frameTuning') }}</p>

      <div class="slot-list">
        <button
          v-for="slot in activeFrame.colorSlots"
          :key="slot.key"
          type="button"
          :class="['slot-item', activeSlotKey === slot.key && 'slot-item--active']"
          :disabled="saving"
          @click="toggleSlot(slot.key)"
        >
          <span class="slot-item__swatch" :style="{ background: resolvedColors[slot.key] }" aria-hidden="true" />
          <span class="slot-item__label">{{ t(slot.nameKey) }}</span>
        </button>
      </div>

      <div v-if="activeSlotKey" class="slot-picker">
        <HslColorPicker
          :model-value="resolvedColors[activeSlotKey]"
          pick-fallback-enabled
          @update:model-value="onSlotColorChange"
        />
      </div>
    </div>

    <div class="editor-group">
      <p class="editor-group-title">{{ t('imageEditor.composition') }}</p>
      <label class="editor-slider">
        <div class="editor-slider__head">
          <span>{{ t('imageEditor.whiteBgRatio') }}</span>
          <strong>{{ fitRatioPercent }}%</strong>
        </div>
        <input
          :value="fitRatioPercent"
          type="range"
          min="40"
          max="100"
          step="1"
          :disabled="saving"
          @input="emit('update:fitRatioPercent', Number($event.target.value))"
        />
      </label>
    </div>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import EditorCanvasPreview from '@/components/image/editor/EditorCanvasPreview.vue'
import HslColorPicker from '@/components/common/HslColorPicker.vue'
import {
  FRAME_CATEGORIES,
  FRAME_NONE_ID,
  getFrameById,
  getFramesByCategory,
  resolveFrameColors
} from '@/config/imageFrames'

const props = defineProps({
  modelValue: { type: String, default: FRAME_NONE_ID },
  colorwayId: { type: String, default: '' },
  colorOverrides: { type: Object, default: () => ({}) },
  source: { type: Object, default: null },
  bgColor: { type: String, default: '#ffffff' },
  fitRatioPercent: { type: Number, default: 100 },
  saving: { type: Boolean, default: false }
})

const emit = defineEmits([
  'update:modelValue',
  'update:colorwayId',
  'update:colorOverrides',
  'update:fitRatioPercent'
])

const { t } = useI18n()

const activeCategory = ref('')
const activeSlotKey = ref('')

const activeFrame = computed(() => getFrameById(props.modelValue))

const categoryOptions = computed(() => [
  { id: '', nameKey: 'imageEditor.frameCategoryAll' },
  ...FRAME_CATEGORIES
])

const visibleFrames = computed(() => {
  const noneOption = { id: FRAME_NONE_ID, nameKey: 'imageEditor.frameNone', frame: null, defaultColors: null }
  if (!activeCategory.value) {
    return [
      noneOption,
      ...getFramesByCategory('').map((frame) => ({
        id: frame.id,
        nameKey: frame.nameKey,
        frame,
        defaultColors: resolveFrameColors(frame, '', null)
      }))
    ]
  }
  return [
    ...getFramesByCategory(activeCategory.value).map((frame) => ({
      id: frame.id,
      nameKey: frame.nameKey,
      frame,
      defaultColors: resolveFrameColors(frame, '', null)
    })),
    noneOption
  ]
})

const resolvedColors = computed(() => (
  resolveFrameColors(activeFrame.value, props.colorwayId, props.colorOverrides)
))

function colorwaySwatches(colorway) {
  const frame = activeFrame.value
  if (!frame) return []
  return (frame.colorSlots || [])
    .map((slot) => colorway.palette?.[slot.key] || frame.palette?.[slot.key])
    .filter(Boolean)
    .slice(0, 4)
}

function toggleSlot(key) {
  activeSlotKey.value = activeSlotKey.value === key ? '' : key
}

function onSlotColorChange(color) {
  const key = activeSlotKey.value
  if (!key || !color) return
  emit('update:colorOverrides', { ...props.colorOverrides, [key]: color })
}

watch(activeFrame, () => {
  activeSlotKey.value = ''
})
</script>

<style scoped>
.frame-categories {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

/* 自动换行铺开，而不是横向滚动条：
   桌面端没有横向滚动条就翻不到后面的款式，这里让所有模板直接可见。 */
.frame-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
  gap: 8px;
}

.frame-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 6px;
  border: 2px solid transparent;
  border-radius: var(--radius-card, 18px);
  background: var(--app-surface);
  color: var(--app-text-secondary);
  font: inherit;
  transition: border-color var(--motion-fast, 200ms) ease, transform var(--motion-fast, 200ms) ease;
}

.frame-item--active {
  border-color: var(--app-text);
  color: var(--app-text);
}

.frame-item:active {
  transform: scale(var(--press-scale-button, 0.96));
}

.frame-item:disabled {
  opacity: 0.5;
}

.frame-item__thumb {
  display: block;
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: var(--radius-small, 14px);
  overflow: hidden;
  background: var(--app-surface-soft);
}

.frame-item__label {
  font-size: 11px;
  font-weight: 600;
  line-height: 1.2;
  text-align: center;
}

.colorway-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.colorway-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  min-width: 62px;
  padding: 8px 10px;
  border: 2px solid transparent;
  border-radius: var(--radius-small, 14px);
  background: var(--app-surface);
  color: var(--app-text-secondary);
  font: inherit;
}

.colorway-item--active {
  border-color: var(--app-text);
  color: var(--app-text);
}

.colorway-item__dots {
  display: flex;
}

.colorway-item__dot {
  width: 18px;
  height: 18px;
  margin-left: -6px;
  border-radius: 50%;
  box-shadow: 0 0 0 2px var(--app-surface);
}

.colorway-item__dot:first-child {
  margin-left: 0;
}

.colorway-item__label {
  font-size: 11px;
  font-weight: 600;
}

.slot-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.slot-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px 6px 6px;
  border: 2px solid transparent;
  border-radius: 999px;
  background: var(--app-surface);
  color: var(--app-text-secondary);
  font: inherit;
}

.slot-item--active {
  border-color: var(--app-text);
  color: var(--app-text);
}

.slot-item__swatch {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px rgba(20, 20, 22, 0.12);
}

.slot-item__label {
  font-size: 12px;
  font-weight: 600;
}

.slot-picker {
  padding: 14px;
  border-radius: var(--radius-card, 18px);
  background: var(--app-surface-soft);
}
</style>
