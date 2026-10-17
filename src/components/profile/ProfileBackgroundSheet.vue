<template>
  <!-- 背景编辑的所有改动都是即时落库的（滑杆/排序/删除都直接写 store），
       所以点遮罩空白处直接退出不会丢编辑结果，无需二次确认 -->
  <AppSheet
    :model-value="modelValue"
    sheet-class="bg-sheet"
    @update:model-value="(v) => emit('update:modelValue', v)"
    @closed="handleClosed"
  >
    <div class="bg-sheet__head">
      <div>
        <p class="bg-sheet__eyebrow">{{ t('profile.background.eyebrow') }}</p>
        <h3 class="bg-sheet__title">{{ title }}</h3>
      </div>
      <span class="bg-sheet__count">{{ t('profile.background.count', { count: items.length }) }}</span>
    </div>

    <div class="bg-sheet__scroll">
    <div class="bg-sheet__add-row">
      <button class="bg-sheet__add" type="button" :disabled="adding" @click="addImage">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3.5" y="5" width="17" height="14" rx="3" />
          <circle cx="9" cy="10" r="1.4" />
          <path d="M4.5 16.5l4.2-3.6 3.2 2.6 3.1-2.8 4.5 4" />
        </svg>
        {{ adding ? t('profile.background.importing') : t('profile.background.addImage') }}
      </button>
      <button class="bg-sheet__add" type="button" @click="addGradient">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
          <path d="M3.5 15.5l17-7" />
        </svg>
        {{ t('profile.background.addGradient') }}
      </button>
    </div>

    <p v-if="!items.length" class="bg-sheet__empty">{{ t('profile.background.empty') }}</p>

    <div v-else class="bg-sheet__grid">
      <div
        v-for="(item, index) in items"
        :key="item.id"
        :class="['bg-tile', { 'bg-tile--active': item.id === selectedId }]"
      >
        <button class="bg-tile__preview" type="button" @click="selectItem(item.id)">
          <img v-if="item.kind === 'image'" class="bg-tile__img" :src="item.uri" alt="" />
          <span
            v-else
            class="bg-tile__img bg-tile__img--gradient"
            :style="{ backgroundImage: gradientCss(item.gradient) }"
          />
          <span class="bg-tile__index">{{ index + 1 }}</span>
        </button>
        <div class="bg-tile__tools">
          <button type="button" :disabled="index === 0" :aria-label="t('profile.background.movePrev')" @click="move(index, -1)">◀</button>
          <button type="button" :disabled="index === items.length - 1" :aria-label="t('profile.background.moveNext')" @click="move(index, 1)">▶</button>
          <button type="button" class="bg-tile__remove" :aria-label="t('common.delete')" @click="removeItem(index)">✕</button>
        </div>
      </div>
    </div>

    <template v-if="selectedItem">
      <div class="bg-sheet__section">
        <p class="bg-sheet__section-title">{{ t('profile.background.tuneTitle') }}</p>

        <template v-if="selectedItem.kind === 'gradient'">
          <div class="bg-sheet__swatches">
            <button
              v-for="(preset, index) in gradientPresets"
              :key="index"
              type="button"
              :class="['bg-swatch', { 'bg-swatch--active': isActivePreset(preset) }]"
              :style="{ backgroundImage: gradientCss(preset) }"
              :aria-label="t('profile.background.gradientPreset', { index: index + 1 })"
              @click="applyPreset(preset)"
            />
          </div>
        </template>

        <template v-else>
          <label class="bg-sheet__field">
            <span class="bg-sheet__field-label">{{ t('profile.background.focal') }}</span>
            <input
              class="bg-sheet__range"
              type="range"
              min="0"
              max="1"
              step="0.01"
              :value="selectedItem.focalY"
              @input="patchSelected({ focalY: Number($event.target.value) })"
            />
          </label>
          <label class="bg-sheet__field">
            <span class="bg-sheet__field-label">{{ t('profile.background.scale') }}</span>
            <input
              class="bg-sheet__range"
              type="range"
              min="1"
              max="2.2"
              step="0.02"
              :value="selectedItem.scale"
              @input="patchSelected({ scale: Number($event.target.value) })"
            />
          </label>
          <label class="bg-sheet__field">
            <span class="bg-sheet__field-label">{{ t('profile.background.blur') }}</span>
            <input
              class="bg-sheet__range"
              type="range"
              min="0"
              max="24"
              step="1"
              :value="selectedItem.blur"
              @input="patchSelected({ blur: Number($event.target.value) })"
            />
          </label>
        </template>

        <label class="bg-sheet__field">
          <span class="bg-sheet__field-label">{{ t('profile.background.overlay') }}</span>
          <input
            class="bg-sheet__range"
            type="range"
            min="0"
            max="0.85"
            step="0.01"
            :value="selectedItem.overlay"
            @input="patchSelected({ overlay: Number($event.target.value) })"
          />
        </label>
      </div>
    </template>

    <div class="bg-sheet__section">
      <p class="bg-sheet__section-title">{{ t('profile.background.rotationTitle') }}</p>

      <div class="bg-sheet__segmented">
        <button
          v-for="option in rotationModeOptions"
          :key="option.value"
          type="button"
          :class="['bg-seg', { 'bg-seg--active': rotation.mode === option.value }]"
          @click="patchRotation({ mode: option.value })"
        >
          {{ option.label }}
        </button>
      </div>

      <label v-if="rotation.mode === 'interval'" class="bg-sheet__field">
        <span class="bg-sheet__field-label">{{ t('profile.background.intervalLabel', { seconds: rotation.intervalSec }) }}</span>
        <input
          class="bg-sheet__range"
          type="range"
          min="3"
          max="60"
          step="1"
          :value="rotation.intervalSec"
          @input="patchRotation({ intervalSec: Number($event.target.value) })"
        />
      </label>

      <div class="bg-sheet__sub-row">
        <span class="bg-sheet__sub-label">{{ t('profile.background.orderLabel') }}</span>
        <div class="bg-sheet__segmented bg-sheet__segmented--compact">
          <button
            v-for="option in orderOptions"
            :key="option.value"
            type="button"
            :class="['bg-seg', { 'bg-seg--active': rotation.order === option.value }]"
            @click="patchRotation({ order: option.value })"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <div class="bg-sheet__sub-row">
        <span class="bg-sheet__sub-label">{{ t('profile.background.transitionLabel') }}</span>
        <div class="bg-sheet__segmented bg-sheet__segmented--compact">
          <button
            v-for="option in transitionOptions"
            :key="option.value"
            type="button"
            :class="['bg-seg', { 'bg-seg--active': rotation.transition === option.value }]"
            @click="patchRotation({ transition: option.value })"
          >
            {{ option.label }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="items.length" class="bg-sheet__section">
      <p class="bg-sheet__section-title">{{ t('profile.background.themeTitle') }}</p>

      <div class="bg-sheet__segmented">
        <button
          v-for="option in themeOptions"
          :key="option.value"
          type="button"
          :class="['bg-seg', { 'bg-seg--active': theme.source === option.value }]"
          @click="patchTheme({ source: option.value })"
        >
          {{ option.label }}
        </button>
      </div>

      <div v-if="theme.source === 'custom'" class="bg-sheet__sub-row">
        <span class="bg-sheet__sub-label">{{ t('profile.background.themeCustomLabel') }}</span>
        <input
          class="bg-sheet__color"
          type="color"
          :value="theme.customColor"
          :aria-label="t('profile.background.themeCustomLabel')"
          @input="patchTheme({ customColor: $event.target.value })"
        >
      </div>

      <p class="bg-sheet__hint">{{ t('profile.background.themeHint') }}</p>
    </div>
    </div>

    <div class="bg-sheet__footer">
      <button
        v-if="showFollowIp && followingIp"
        class="bg-sheet__ghost"
        type="button"
        @click="emit('follow-ip')"
      >
        {{ t('profile.background.followIp', { ip: inheritLabel }) }}
      </button>
      <button class="bg-sheet__done" type="button" @click="close">{{ t('common.done') }}</button>
    </div>
  </AppSheet>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppSheet from '@/components/common/AppSheet.vue'
import { useDialogBackButton } from '@/composables/useDialogBackButton'
import { showGlobalToast } from '@/utils/globalToast'
import { pickImageFile } from '@/utils/image/localImage'
import { createProfileBackgroundImageItem, readProfileImageDimensions } from '@/utils/profile/backgroundImage'
import {
  PROFILE_GRADIENT_PRESETS,
  makeProfileItemId,
  normalizeProfileItem
} from '@/utils/profile/collectionProfile'

const { t } = useI18n()

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: '' },
  items: { type: Array, default: () => [] },
  rotation: { type: Object, required: true },
  theme: { type: Object, required: true },
  showFollowIp: { type: Boolean, default: false },
  followingIp: { type: Boolean, default: false },
  inheritLabel: { type: String, default: '' }
})

const emit = defineEmits(['update:modelValue', 'update:items', 'update:rotation', 'update:theme', 'follow-ip'])

const selectedId = ref('')
const adding = ref(false)
const gradientPresets = PROFILE_GRADIENT_PRESETS

const selectedItem = computed(() => props.items.find((item) => item.id === selectedId.value) || null)

const rotationModeOptions = computed(() => [
  { value: 'off', label: t('profile.background.rotationOff') },
  { value: 'visit', label: t('profile.background.rotationVisit') },
  { value: 'interval', label: t('profile.background.rotationInterval') }
])

const orderOptions = computed(() => [
  { value: 'seq', label: t('profile.background.orderSeq') },
  { value: 'random', label: t('profile.background.orderRandom') }
])

const transitionOptions = computed(() => [
  { value: 'fade', label: t('profile.background.transitionFade') },
  { value: 'kenburns', label: t('profile.background.transitionKenburns') }
])

const themeOptions = computed(() => [
  { value: 'background', label: t('profile.background.themeBackground') },
  { value: 'app', label: t('profile.background.themeApp') },
  { value: 'custom', label: t('profile.background.themeCustom') }
])

useDialogBackButton(close, () => props.modelValue)

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    if (!selectedId.value || !props.items.some((item) => item.id === selectedId.value)) {
      selectedId.value = props.items[0]?.id || ''
    }
  }
)

function close() {
  emit('update:modelValue', false)
}

function handleClosed() {
  selectedId.value = ''
  adding.value = false
}

function gradientCss(gradient) {
  const colors = Array.isArray(gradient) ? gradient : PROFILE_GRADIENT_PRESETS[0]
  return `linear-gradient(145deg, ${colors[0]} 0%, ${colors[1]} 100%)`
}

function selectItem(id) {
  selectedId.value = id
}

function emitItems(nextItems) {
  emit('update:items', nextItems)
}

function addImage() {
  if (adding.value) return
  adding.value = true
  let previewUrl = ''
  let previewId = ''
  void (async () => {
    try {
      // 直接拿 File：避免大图先转 base64；先显示预览，解码/压缩/落盘全部后台继续
      const file = await pickImageFile()
      if (!file) return

      previewUrl = URL.createObjectURL(file)
      previewId = makeProfileItemId()
      const dims = await readProfileImageDimensions(file)
      const previewItem = normalizeProfileItem({
        id: previewId,
        kind: 'image',
        uri: previewUrl,
        width: dims.width,
        height: dims.height,
        mimeType: String(file.type || ''),
        fileSize: Number(file.size) || 0
      })
      // 立即上屏（收藏馆页头 / 弹窗网格马上能看到），此时不标同步脏
      emitItems([...props.items, previewItem])
      selectedId.value = previewId
      showGlobalToast(t('profile.background.processing'))

      // 后台处理：解码 → 缩放/压缩 → 落盘 → 取主题色；完成后原地替换预览地址
      const finalItem = await createProfileBackgroundImageItem(file)
      emitItems(props.items.map((item) => (
        item.id === previewId ? { ...finalItem, id: previewId } : item
      )))
      if (selectedId.value === previewId) selectedId.value = previewId
    } catch (e) {
      console.warn('[profile] add background image failed', e)
      if (previewId) emitItems(props.items.filter((item) => item.id !== previewId))
      showGlobalToast(t('profile.background.importFailed'))
    } finally {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      adding.value = false
    }
  })()
}

function addGradient() {
  const preset = PROFILE_GRADIENT_PRESETS[Math.floor(Math.random() * PROFILE_GRADIENT_PRESETS.length)]
  const item = normalizeProfileItem({
    id: makeProfileItemId(),
    kind: 'gradient',
    gradient: preset
  })
  emitItems([...props.items, item])
  selectedId.value = item.id
}

function move(index, delta) {
  const target = index + delta
  if (target < 0 || target >= props.items.length) return
  const next = [...props.items]
  const [moved] = next.splice(index, 1)
  next.splice(target, 0, moved)
  emitItems(next)
}

function removeItem(index) {
  const next = props.items.filter((_, i) => i !== index)
  emitItems(next)
  if (!next.some((item) => item.id === selectedId.value)) {
    selectedId.value = next[0]?.id || ''
  }
}

function patchSelected(patch) {
  const id = selectedId.value
  if (!id) return
  emitItems(props.items.map((item) => (
    item.id === id ? normalizeProfileItem({ ...item, ...patch }) : item
  )))
}

function isActivePreset(preset) {
  const current = selectedItem.value?.gradient
  return Array.isArray(current) && current[0] === preset[0] && current[1] === preset[1]
}

function applyPreset(preset) {
  patchSelected({ gradient: preset })
}

function patchRotation(patch) {
  emit('update:rotation', { ...props.rotation, ...patch })
}

function patchTheme(patch) {
  emit('update:theme', { ...props.theme, ...patch })
}
</script>

<style scoped>
.bg-sheet__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 12px;
  flex-shrink: 0;
}

.bg-sheet__eyebrow {
  margin: 0 0 2px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--app-text-tertiary);
}

.bg-sheet__title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--app-text);
  overflow-wrap: anywhere;
}

.bg-sheet__count {
  flex-shrink: 0;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--app-chip-bg);
  color: var(--app-text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.bg-sheet__scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

.bg-sheet__add-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  padding-bottom: 14px;
}.bg-sheet__add {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 12px 10px;
  border: 1px dashed color-mix(in srgb, var(--app-text) 20%, transparent);
  border-radius: var(--radius-small);
  background: var(--app-surface-soft);
  color: var(--app-text);
  font-size: 13.5px;
  font-weight: 600;
}

.bg-sheet__add:disabled {
  opacity: 0.6;
}

.bg-sheet__add svg {
  width: 17px;
  height: 17px;
  stroke: currentColor;
  stroke-width: 1.9;
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.bg-sheet__empty {
  margin: 4px 0 16px;
  padding: 22px 16px;
  border-radius: var(--radius-small);
  background: var(--app-surface-soft);
  color: var(--app-text-tertiary);
  font-size: 13px;
  text-align: center;
}

.bg-sheet__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
  gap: 10px;
  padding-bottom: 16px;
}

.bg-tile {
  position: relative;
  border-radius: var(--radius-small);
  overflow: hidden;
  border: 2px solid transparent;
  background: var(--app-surface-soft);
}

.bg-tile--active {
  border-color: var(--app-primary);
}

.bg-tile__preview {
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 3 / 4;
  padding: 0;
  border: none;
  background: none;
}

.bg-tile__img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.bg-tile__img--gradient {
  display: block;
}

.bg-tile__index {
  position: absolute;
  left: 6px;
  top: 6px;
  min-width: 18px;
  padding: 1px 5px;
  border-radius: 999px;
  background: rgba(20, 20, 22, 0.5);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
}

.bg-tile__tools {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 2px;
  padding: 4px 4px 5px;
  background: var(--app-surface);
}

.bg-tile__tools button {
  flex: 1;
  min-width: 0;
  padding: 4px 0;
  border: none;
  border-radius: 8px;
  background: none;
  color: var(--app-text-secondary);
  font-size: 11px;
}

.bg-tile__tools button:disabled {
  opacity: 0.32;
}

.bg-tile__remove {
  color: #d25353 !important;
}

.bg-sheet__section {
  padding: 14px 0 4px;
  border-top: 1px solid var(--app-border);
}

.bg-sheet__section-title {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 700;
  color: var(--app-text);
}

.bg-sheet__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-bottom: 12px;
}

.bg-sheet__field-label {
  font-size: 12.5px;
  color: var(--app-text-secondary);
}

.bg-sheet__range {
  width: 100%;
  accent-color: var(--app-primary);
}

.bg-sheet__swatches {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(56px, 1fr));
  gap: 8px;
  padding-bottom: 12px;
}

.bg-swatch {
  height: 44px;
  border-radius: var(--radius-xs);
  border: 2px solid transparent;
}

.bg-swatch--active {
  border-color: var(--app-text);
}

.bg-sheet__segmented {
  display: flex;
  gap: 6px;
  padding: 4px;
  margin-bottom: 12px;
  border-radius: var(--radius-small);
  background: var(--app-surface-soft);
}

.bg-sheet__segmented--compact {
  margin-bottom: 0;
  flex-shrink: 0;
}

.bg-seg {
  flex: 1;
  padding: 8px 6px;
  border: none;
  border-radius: var(--radius-xs);
  background: none;
  color: var(--app-text-secondary);
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
}

.bg-seg--active {
  background: var(--app-surface);
  color: var(--app-text);
  box-shadow: var(--app-shadow-sm);
}

.bg-sheet__sub-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 10px;
}

.bg-sheet__sub-label {
  font-size: 12.5px;
  color: var(--app-text-secondary);
}

.bg-sheet__color {
  width: 44px;
  height: 32px;
  padding: 0;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-xs);
  background: none;
}

.bg-sheet__hint {
  margin: 0 0 6px;
  font-size: 11.5px;
  line-height: 1.45;
  color: var(--app-text-tertiary);
}

.bg-sheet__footer {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-top: 16px;
  flex-shrink: 0;
}

.bg-sheet__ghost {
  flex: 1;
  padding: 13px 14px;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-small);
  background: var(--app-surface-soft);
  color: var(--app-text);
  font-size: 13.5px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bg-sheet__done {
  flex: 1;
  padding: 13px 14px;
  border: none;
  border-radius: var(--radius-small);
  background: var(--app-primary);
  color: var(--app-surface);
  font-size: 14px;
  font-weight: 700;
}

html.theme-dark .bg-sheet__done {
  color: #101014;
}
</style>
