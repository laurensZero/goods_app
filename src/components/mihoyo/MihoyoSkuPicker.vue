<!--
  MihoyoSkuPicker.vue
  米游铺多级 SKU 选择器：按 sale_attrs 维度分组展示，每个维度一行可选 chips。
    - 单选（multi=false）：每个维度选一个，点同层其它项即切换；定位到唯一组合。
    - 多选（multi=true）：维度内可多选，自动展开为所选值的全部有效组合。
    - layout="card"：有图的层级按「大图卡片」展示（对齐旧版款式卡片）；无图层级仍是 chips。
    - 多个层级时，第一级只用文字（地区等限定维度图片无意义），其余层级才展示图片。
  v-model 统一为「选中的 variant key 数组」。
  用法：<MihoyoSkuPicker v-model="selectedKeys" :groups="skuGroups" :variants="variants" multi />
-->
<template>
  <div class="mh-sku-picker">
    <div v-for="(level, position) in levels" :key="level.index" class="mh-sku-level">
      <div v-if="level.name" class="mh-sku-level__name">{{ level.name }}</div>

      <!-- 大图卡片：仅「有图的层级」使用 -->
      <div
        v-if="layout === 'card' && levelShowsImage(position)"
        class="mh-sku-level__cards"
      >
        <button
          v-for="item in optionsOf(level)"
          :key="item.key"
          type="button"
          class="mh-sku-card"
          :class="{ 'mh-sku-card--selected': isChosen(level, item) }"
          @click="onToggle(level, item)"
        >
          <span class="mh-sku-card__img-wrap">
            <img
              v-if="coverOf(item)"
              :src="coverOf(item)"
              :alt="item.text"
              class="mh-sku-card__img"
              loading="lazy"
              decoding="async"
            />
            <span v-else class="mh-sku-card__fallback">{{ (item.text || '款').charAt(0) }}</span>
            <span v-if="isSuggested(item)" class="mh-sku-card__tag">{{ suggestTagText || '猜你想要' }}</span>
          </span>
          <span class="mh-sku-card__text">{{ item.text }}</span>
          <span v-if="isWished(item) || isOwned(item)" class="mh-sku-card__badges">
            <span v-if="isWished(item)" class="mh-sku-opt__badge mh-sku-opt__badge--wished">
              {{ wishedText || '已加' }}
            </span>
            <span v-if="isOwned(item)" class="mh-sku-opt__badge mh-sku-opt__badge--owned">
              {{ ownedText || '已有' }}
            </span>
          </span>
        </button>
      </div>

      <!-- 紧凑 chips：无图层级，或 layout="chips" -->
      <div v-else class="mh-sku-level__options">
        <button
          v-for="item in optionsOf(level)"
          :key="item.key"
          type="button"
          class="mh-sku-opt"
          :class="{ 'mh-sku-opt--selected': isChosen(level, item) }"
          @click="onToggle(level, item)"
        >
          <span v-if="levelShowsImage(position) && coverOf(item)" class="mh-sku-opt__thumb">
            <img :src="coverOf(item)" :alt="item.text" loading="lazy" decoding="async" />
          </span>
          <span class="mh-sku-opt__text">{{ item.text }}</span>
          <span v-if="isSuggested(item)" class="mh-sku-opt__tag">{{ suggestTagText || '猜你想要' }}</span>
          <span v-if="isWished(item)" class="mh-sku-opt__badge mh-sku-opt__badge--wished">
            {{ wishedText || '已加' }}
          </span>
          <span v-if="isOwned(item)" class="mh-sku-opt__badge mh-sku-opt__badge--owned">
            {{ ownedText || '已有' }}
          </span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import {
  buildPickerLevels,
  buildItemLevelIndex,
  buildVariantEntries,
  resolveSelectedVariantsFromEntries,
  selectionFromVariantKeys,
  isSelectableGroup,
  toggleSelection,
  variantItemKeys,
  sameKeySet,
} from '@/utils/mihoyo/skuSelection'

defineOptions({ name: 'MihoyoSkuPicker' })

const props = defineProps({
  // normalizeSaleAttrGroups 后的维度组
  groups: { type: Array, default: () => [] },
  // 扁平 variants（{ text, key, cover_url, price }）
  variants: { type: Array, default: () => [] },
  // 选中的 variant key 数组
  modelValue: { type: Array, default: () => [] },
  // 维度内是否可多选（自动展开组合）
  multi: { type: Boolean, default: false },
  // 展示形态：chips（紧凑）/ card（有图层级用大图卡片，对齐旧版款式卡片）
  layout: { type: String, default: 'chips' },
  // >0 且 variants 数量超过该值时，把每个维度内的选项倒序展示
  reverseWhenMany: { type: Number, default: 0 },
  // 需要标记「猜你想要」的维度项 key
  suggestedKeys: { type: Array, default: () => [] },
  suggestTagText: { type: String, default: '' },
  // 维度项「已加心愿单 / 已有」标记（按维度项 key 命中）
  wishedKeys: { type: Array, default: () => [] },
  ownedKeys: { type: Array, default: () => [] },
  wishedText: { type: String, default: '' },
  ownedText: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue', 'change'])

// 兜底：拿不到 sale_attrs 维度组时，退化成「一个维度、每个款式一项」的扁平列表
const sourceGroups = computed(() => {
  const groups = Array.isArray(props.groups) ? props.groups : []
  if (groups.some(isSelectableGroup)) return groups
  const variants = Array.isArray(props.variants) ? props.variants : []
  if (!variants.length) return groups
  return [{
    name: '',
    content: variants.map((v) => ({
      key: String(v.key || ''),
      text: String(v.text || v.key || ''),
      cover_url: v.cover_url || v.img_url || '',
    })),
  }]
})

const levels = computed(() => buildPickerLevels(sourceGroups.value))
const itemLevelIndex = computed(() => buildItemLevelIndex(sourceGroups.value))
const entries = computed(() => buildVariantEntries(props.variants))

const selection = ref({})

// 选中结果（用预计算的 entries，避免每次渲染重复 split key）
const resolvedVariants = computed(() =>
  resolveSelectedVariantsFromEntries(entries.value, levels.value, selection.value, props.multi),
)
const resolvedKeys = computed(() => resolvedVariants.value.map((v) => v.key))

function syncFromModel(keys) {
  if (sameKeySet(keys, resolvedKeys.value)) return
  selection.value = selectionFromVariantKeys(keys, levels.value, itemLevelIndex.value)
}

watch(() => props.modelValue, syncFromModel, { immediate: true, deep: true })
watch([levels, () => props.variants], () => syncFromModel(props.modelValue))

const shouldReverse = computed(() =>
  props.reverseWhenMany > 0 && props.variants.length > props.reverseWhenMany,
)

function optionsOf(level) {
  return shouldReverse.value ? [...level.content].reverse() : level.content
}

// 多层级时，第一级只用文字；单层级保留图片
function levelShowsImage(position) {
  return levels.value.length <= 1 || position > 0
}

function isChosen(level, item) {
  return (selection.value[level.index] || []).includes(item.key)
}

// 维度项封面：优先自身 cover_url，其次从包含它的 variant 里取一张代表图
const itemCoverMap = computed(() => {
  const map = new Map()
  for (const variant of props.variants) {
    const cover = variant?.cover_url || variant?.img_url
    if (!cover) continue
    for (const key of variantItemKeys(variant)) {
      if (!map.has(key)) map.set(key, cover)
    }
  }
  return map
})

function coverOf(item) {
  return item?.cover_url || item?.img_url || itemCoverMap.value.get(item?.key) || ''
}

const suggestedSet = computed(() => new Set(props.suggestedKeys))
const wishedSet = computed(() => new Set(props.wishedKeys))
const ownedSet = computed(() => new Set(props.ownedKeys))
function isSuggested(item) {
  return suggestedSet.value.has(item.key)
}
function isWished(item) {
  return wishedSet.value.has(item.key)
}
function isOwned(item) {
  return ownedSet.value.has(item.key)
}

function onToggle(level, item) {
  selection.value = toggleSelection(selection.value, level.index, item.key, props.multi)
  emit('update:modelValue', resolvedKeys.value)
  emit('change', resolvedVariants.value)
}
</script>

<style scoped>
.mh-sku-picker {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.mh-sku-level__name {
  display: block;
  margin-bottom: 6px;
  color: var(--app-text-secondary);
  font-size: var(--font-small);
}

.mh-sku-level__options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

/* ── 紧凑 chips（对齐枢纽页多级规格 .sku-chip 风格） ── */
.mh-sku-opt {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--app-border, rgba(142, 142, 147, 0.28));
  border-radius: var(--radius-xs);
  background: var(--app-surface);
  color: var(--app-text);
  font-size: var(--font-body);
  line-height: 1.3;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, color 0.15s;
}

.mh-sku-opt:has(.mh-sku-opt__thumb) {
  padding-left: 6px;
}

.mh-sku-opt:active {
  transform: scale(0.97);
}

.mh-sku-opt--selected {
  border-color: color-mix(in srgb, var(--app-chip-accent-text) 42%, transparent);
  background: color-mix(in srgb, var(--app-chip-accent-text) 12%, var(--app-surface));
  color: var(--app-chip-accent-text);
  font-weight: 600;
}

.mh-sku-opt__thumb {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-tiny);
  overflow: hidden;
  flex-shrink: 0;
  background: var(--app-surface-muted);
}

.mh-sku-opt__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.mh-sku-opt__text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mh-sku-opt__tag {
  flex-shrink: 0;
  padding: 2px 6px;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, #f0a020 18%, transparent);
  color: #b9741a;
  font-size: var(--font-micro);
  font-weight: 600;
  line-height: 1.4;
}

.mh-sku-opt__badge {
  flex-shrink: 0;
  padding: 2px 6px;
  border-radius: var(--radius-pill);
  font-size: var(--font-micro);
  font-weight: 600;
  line-height: 1.4;
  white-space: nowrap;
}

.mh-sku-opt__badge--wished {
  background: rgba(47, 158, 94, 0.14);
  color: #2f9e5e;
}

.mh-sku-opt__badge--owned {
  background: rgba(47, 127, 211, 0.14);
  color: #2f7fd3;
}

/* ── 大图卡片（对齐旧版款式卡片尺寸） ── */
.mh-sku-level__cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(108px, 1fr));
  gap: 10px;
}

.mh-sku-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  width: 100%;
  min-width: 0;
  padding: 10px;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-xs, 10px);
  background: var(--app-surface);
  color: var(--app-text);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, box-shadow 0.15s, transform 0.1s;
}

.mh-sku-card:active {
  transform: scale(0.96);
}

.mh-sku-card--selected {
  border-color: color-mix(in srgb, #4a7aec 70%, var(--app-border));
  background: color-mix(in srgb, #4a7aec 14%, var(--app-surface));
  box-shadow:
    0 0 0 1px color-mix(in srgb, #4a7aec 40%, transparent),
    0 10px 24px color-mix(in srgb, #4a7aec 10%, transparent);
}

.mh-sku-card__img-wrap {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: var(--radius-tiny);
  overflow: hidden;
  background: var(--app-surface-soft);
}

.mh-sku-card__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.mh-sku-card__fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: var(--app-text-secondary);
  font-size: var(--font-title-xl);
  font-weight: 600;
}

.mh-sku-card__tag {
  position: absolute;
  top: 6px;
  left: 6px;
  padding: 2px 6px;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, #f0a020 85%, transparent);
  color: #fff;
  font-size: var(--font-micro);
  font-weight: 600;
  line-height: 1.5;
}

.mh-sku-card__text {
  font-size: var(--font-body);
  font-weight: 500;
  line-height: 1.3;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.mh-sku-card--selected .mh-sku-card__text {
  color: #2070c0;
  font-weight: 600;
}

.mh-sku-card__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
</style>
