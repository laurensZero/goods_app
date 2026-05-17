<template>
  <section class="search-section">
    <div class="search-section__bar-wrap">
      <button class="search-section__close" type="button" aria-label="关闭搜索" @click="handleClose">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M15 18L9 12L15 6" />
        </svg>
      </button>

      <SearchBar
        v-model="filters.keyword"
        placeholder="搜索名称、分类、IP、角色、备注"
        class="search-section__bar"
      />
    </div>

    <button class="search-section__toggle" type="button" :aria-expanded="advancedExpanded" @click="toggleSearchAdvanced">
      <div class="search-section__toggle-main">
        <div class="search-section__toggle-copy">
          <p class="search-section__eyebrow">高级筛选</p>
          <h2 class="search-section__title">组合条件</h2>
          <div class="search-section__summary">
            <span>{{ scopeLabel }}</span>
            <span v-if="activeSearchFilterCount > 0">已启用 {{ activeSearchFilterCount }}</span>
          </div>
        </div>
      </div>
      <span class="search-section__toggle-icon" aria-hidden="true">
        <svg :class="{ 'search-section__toggle-icon--open': advancedExpanded }" viewBox="0 0 24 24" fill="none">
          <path d="M7 10L12 15L17 10" />
        </svg>
      </span>
    </button>

    <Transition name="search-advanced-panel">
      <div v-if="advancedExpanded" class="search-section__panel-wrap">
        <section class="search-section__card">
          <div class="search-section__head">
            <div>
              <p class="search-section__eyebrow">筛选方案</p>
              <h3 class="search-section__sub-title">保存组合</h3>
            </div>
            <div class="search-section__actions">
              <button v-if="activeSearchFilterCount > 0" class="search-section__chip-btn" type="button" @click="$emit('reset')">重置</button>
            </div>
          </div>

          <div class="search-section__field-grid">
            <div class="search-section__field-block">
              <label class="search-section__label">价格区间</label>
              <div class="search-section__range-row">
                <input v-model="filters.priceMin" class="search-section__input" type="number" min="0" inputmode="decimal" placeholder="最低价">
                <span class="search-section__range-gap">-</span>
                <input v-model="filters.priceMax" class="search-section__input" type="number" min="0" inputmode="decimal" placeholder="最高价">
              </div>
            </div>

            <div class="search-section__field-block">
              <label class="search-section__label">排序方式</label>
              <AppSelect v-model="filters.sortBy" :options="GOODS_FILTER_SORT_OPTIONS" placeholder="请选择排序" />
            </div>

            <div class="search-section__field-block">
              <label class="search-section__label">备注</label>
              <AppSelect v-model="filters.hasNote" :options="GOODS_FILTER_BOOLEAN_OPTIONS" placeholder="不限" />
            </div>
          </div>

          <div class="search-section__field-block">
            <label class="search-section__label">购入时间</label>
            <div class="search-section__chip-wrap">
              <button
                v-for="option in GOODS_FILTER_DATE_PRESET_OPTIONS"
                :key="option.value"
                type="button"
                :class="['search-section__chip', { 'search-section__chip--active': filters.acquiredPreset === option.value }]"
                @click="filters.acquiredPreset = option.value"
              >
                {{ option.label }}
              </button>
            </div>
            <div v-if="filters.acquiredPreset === 'custom'" class="search-section__range-row search-section__range-row--date">
              <input v-model="filters.acquiredFrom" class="search-section__input" type="date">
              <span class="search-section__range-gap">-</span>
              <input v-model="filters.acquiredTo" class="search-section__input" type="date">
            </div>
          </div>

          <div v-if="categoryOptions.length" class="search-section__field-block">
            <label class="search-section__label">分类</label>
            <div class="search-section__chip-wrap">
              <button
                v-for="option in categoryOptions"
                :key="option.value"
                type="button"
                :class="['search-section__chip', { 'search-section__chip--active': filters.categories.includes(option.value) }]"
                @click="toggleFilterValue('categories', option.value)"
              >
                {{ option.label }}
              </button>
            </div>
          </div>

          <div v-if="ipOptions.length" class="search-section__field-block">
            <label class="search-section__label">IP</label>
            <div class="search-section__chip-wrap">
              <button
                v-for="option in ipOptions"
                :key="option.value"
                type="button"
                :class="['search-section__chip', { 'search-section__chip--active': filters.ips.includes(option.value) }]"
                @click="toggleFilterValue('ips', option.value)"
              >
                {{ option.label }}
              </button>
            </div>
          </div>

          <div v-if="characterOptions.length" class="search-section__field-block">
            <div class="search-section__field-head">
              <label class="search-section__label">角色</label>
              <button
                v-if="hasCollapsedCharacterOptions"
                class="search-section__field-toggle"
                type="button"
                @click="showAllCharacterOptions = !showAllCharacterOptions"
              >
                {{ showAllCharacterOptions ? '收起角色' : '展开角色' }}
              </button>
            </div>
            <div class="search-section__chip-wrap">
              <button
                v-for="option in visibleCharacterOptions"
                :key="option.value"
                type="button"
                :class="['search-section__chip', { 'search-section__chip--active': filters.characters.includes(option.value) }]"
                @click="toggleFilterValue('characters', option.value)"
              >
                {{ option.label }}
              </button>
            </div>
          </div>

          <div v-if="storageLocationTree.length || hasUnassignedStorageLocation" class="search-section__field-block">
            <label class="search-section__label">存放位置</label>
            <div class="search-section__location-tree">
              <button
                v-if="hasUnassignedStorageLocation"
                type="button"
                :class="['search-section__chip', { 'search-section__chip--active': filters.storageLocations.includes(GOODS_FILTER_SPECIAL_VALUES.noStorageLocation) }]"
                @click="toggleFilterValue('storageLocations', GOODS_FILTER_SPECIAL_VALUES.noStorageLocation)"
              >
                未设置位置
              </button>

              <StorageLocationFilterTree
                v-for="node in storageLocationTree"
                :key="node.path"
                :node="node"
                :selected-values="filters.storageLocations"
                @toggle="toggleFilterValue('storageLocations', $event)"
              />
            </div>
          </div>
        </section>
      </div>
    </Transition>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import SearchBar from '@/components/common/SearchBar.vue'
import AppSelect from '@/components/common/AppSelect.vue'
import StorageLocationFilterTree from '@/components/storage/StorageLocationFilterTree.vue'
import {
  GOODS_FILTER_BOOLEAN_OPTIONS,
  GOODS_FILTER_DATE_PRESET_OPTIONS,
  GOODS_FILTER_SORT_OPTIONS,
  GOODS_FILTER_SPECIAL_VALUES,
  countActiveGoodsFilters,
  normalizeGoodsFilterConditions
} from '@/utils/goods/filters'
import { buildStorageLocationPath, normalizeStorageLocationValue, splitStorageLocationPath } from '@/utils/storageLocations'

defineOptions({ name: 'GoodsSearchPanel' })

const props = defineProps({
  active: {
    type: Boolean,
    default: false
  },
  filters: {
    type: Object,
    required: true
  },
  sourceList: {
    type: Array,
    default: () => []
  },
  storageLocationTreeSource: {
    type: Array,
    default: () => []
  },
  scopeLabel: {
    type: String,
    default: '收藏库'
  },
  advancedExpanded: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['close', 'reset', 'update:advancedExpanded'])
const showAllCharacterOptions = ref(false)

function buildOptionList(values, specialOption = null) {
  const base = [...new Set(values.map((item) => String(item || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
    .map((value) => ({ label: value, value }))

  return specialOption ? [specialOption, ...base] : base
}

function toggleFilterValue(key, value) {
  const current = Array.isArray(props.filters[key]) ? [...props.filters[key]] : []
  props.filters[key] = current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value]
}

const normalizedFilters = computed(() => normalizeGoodsFilterConditions({
  ...props.filters,
  keyword: String(props.filters.keyword || '').trim().toLowerCase()
}))

const activeSearchFilterCount = computed(() => countActiveGoodsFilters(normalizedFilters.value))

const categoryOptions = computed(() => buildOptionList(
  props.sourceList.map((item) => item.category),
  props.sourceList.some((item) => !String(item.category || '').trim())
    ? { label: '未分类', value: GOODS_FILTER_SPECIAL_VALUES.uncategorized }
    : null
))

const ipOptions = computed(() => buildOptionList(
  props.sourceList.map((item) => item.ip),
  props.sourceList.some((item) => !String(item.ip || '').trim())
    ? { label: '未设置 IP', value: GOODS_FILTER_SPECIAL_VALUES.noIp }
    : null
))

const characterSourceList = computed(() => {
  if (props.filters.ips.length === 0) return props.sourceList

  return props.sourceList.filter((item) => {
    const itemIp = String(item.ip || '').trim()
    return props.filters.ips.some((value) => (
      value === GOODS_FILTER_SPECIAL_VALUES.noIp ? !itemIp : value === itemIp
    ))
  })
})

const characterOptions = computed(() => buildOptionList(
  characterSourceList.value.flatMap((item) => (Array.isArray(item.characters) ? item.characters : [])),
  characterSourceList.value.some((item) => !Array.isArray(item.characters) || item.characters.length === 0)
    ? { label: '未设置角色', value: GOODS_FILTER_SPECIAL_VALUES.noCharacter }
    : null
))

const hasCollapsedCharacterOptions = computed(() => (
  characterOptions.value.some((option) => option.value !== GOODS_FILTER_SPECIAL_VALUES.noCharacter)
))

const visibleCharacterOptions = computed(() => {
  if (showAllCharacterOptions.value) return characterOptions.value
  return characterOptions.value.filter((option) => option.value === GOODS_FILTER_SPECIAL_VALUES.noCharacter)
})

watch(
  () => props.filters.characters.slice(),
  (selectedValues) => {
    if (selectedValues.some((value) => value !== GOODS_FILTER_SPECIAL_VALUES.noCharacter)) {
      showAllCharacterOptions.value = true
    }
  },
  { immediate: true }
)

watch(
  () => characterOptions.value.map((option) => option.value),
  (nextOptions) => {
    const allowedValues = new Set(nextOptions)
    const nextCharacters = props.filters.characters.filter((value) => allowedValues.has(value))

    if (nextCharacters.length !== props.filters.characters.length) {
      props.filters.characters = nextCharacters
    }
  },
  { immediate: true }
)

const hasUnassignedStorageLocation = computed(() => (
  props.sourceList.some((item) => !normalizeStorageLocationValue(item.storageLocation))
))

const storageLocationCounts = computed(() => {
  const counts = new Map()

  for (const item of props.sourceList) {
    const normalizedPath = normalizeStorageLocationValue(item.storageLocation)
    if (!normalizedPath) continue

    const pathParts = []
    for (const part of splitStorageLocationPath(normalizedPath)) {
      pathParts.push(part)
      const currentPath = buildStorageLocationPath(pathParts)
      counts.set(currentPath, (counts.get(currentPath) || 0) + 1)
    }
  }

  return counts
})

const storageLocationTree = computed(() => {
  const attachCounts = (nodes = []) => nodes.map((node) => ({
    name: node.name,
    path: node.path,
    depth: Math.max(0, Number(node.depth || 1) - 1),
    itemCount: storageLocationCounts.value.get(node.path) || 0,
    children: attachCounts(node.children || [])
  }))

  return attachCounts(props.storageLocationTreeSource)
})

function setAdvancedExpanded(value) {
  emit('update:advancedExpanded', value)
}

function toggleSearchAdvanced() {
  setAdvancedExpanded(!props.advancedExpanded)
}

function resetSearchFilters() {
  emit('reset')
}

async function handleClose() {
  if (props.advancedExpanded) {
    setAdvancedExpanded(false)
    await nextTick()
  }

  emit('close')
}

watch(() => props.active, (active) => {
  if (!active) {
    setAdvancedExpanded(false)
  }
})

onBeforeUnmount(() => {
  setAdvancedExpanded(false)
})
</script>

<style scoped>
.search-section {
  position: relative;
  margin-top: 8px;
  padding: 0 var(--page-padding) 0;
  display: grid;
  gap: 12px;
}

.search-section__bar-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.search-section__bar {
  flex: 1;
  min-width: 0;
}

.search-section__close {
  width: var(--icon-button-size);
  height: var(--icon-button-size);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  background: var(--app-glass);
  color: var(--app-text);
  box-shadow: var(--app-shadow);
  flex-shrink: 0;
  transition: transform 0.16s ease, background 0.16s ease;
}

.search-section__close svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.search-section__toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 14px 16px;
  border: none;
  border-radius: 18px;
  background:
    radial-gradient(120% 100% at 0% 0%, color-mix(in srgb, var(--app-glass) 72%, transparent), transparent 60%),
    color-mix(in srgb, var(--app-surface) 84%, var(--app-glass));
  box-shadow: var(--app-shadow);
  color: var(--app-text);
  text-align: left;
}

.search-section__toggle-main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  min-width: 0;
}

.search-section__toggle-copy {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.search-section__eyebrow {
  color: var(--app-text-tertiary);
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.search-section__title {
  margin-top: 4px;
  font-size: 17px;
  font-weight: 800;
  letter-spacing: -0.03em;
}

.search-section__summary {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  color: var(--app-text-secondary);
  font-size: 12px;
}

.search-section__toggle-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  color: var(--app-text-tertiary);
}

.search-section__toggle-icon svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform 0.2s ease;
}

.search-section__toggle-icon--open {
  transform: rotate(180deg);
}

.search-section__panel-wrap {
  position: absolute;
  left: var(--page-padding);
  right: var(--page-padding);
  top: calc(100% + 12px);
  z-index: 4;
  display: grid;
  gap: 12px;
}

.search-section__card {
  display: grid;
  gap: 14px;
  padding: 16px;
  border-radius: 22px;
  background: color-mix(in srgb, var(--app-surface) 86%, var(--app-glass));
  border: 1px solid color-mix(in srgb, var(--app-glass-border) 90%, transparent);
  box-shadow: var(--app-shadow);
}

.search-section__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.search-section__sub-title {
  margin-top: 4px;
  font-size: 16px;
  font-weight: 800;
}

.search-section__actions {
  display: inline-flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.search-section__chip-btn {
  border: none;
  border-radius: 999px;
  padding: 8px 12px;
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.search-section__field-grid {
  display: grid;
  gap: 14px;
}

.search-section__field-block {
  display: grid;
  gap: 10px;
}

.search-section__field-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.search-section__field-toggle {
  border: none;
  border-radius: 999px;
  padding: 6px 10px;
  background: var(--app-surface-soft);
  color: var(--app-text-tertiary);
  font-size: 12px;
  font-weight: 600;
}

.search-section__label {
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 700;
}

.search-section__range-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.search-section__range-row--date {
  flex-wrap: wrap;
}

.search-section__range-gap {
  color: var(--app-text-tertiary);
  flex-shrink: 0;
}

.search-section__input {
  width: 100%;
  min-width: 0;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--app-glass-border) 90%, transparent);
  border-radius: 16px;
  background: var(--app-surface-soft);
  color: var(--app-text);
  font-size: 14px;
}

.search-section__input:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--app-text) 30%, transparent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--app-text) 8%, transparent);
}

.search-section__chip-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.search-section__chip {
  border: none;
  border-radius: 999px;
  padding: 9px 12px;
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
  font-size: 12px;
  font-weight: 600;
  transition: transform 0.16s ease, background 0.16s ease, color 0.16s ease;
}

.search-section__chip--active {
  background: #141416;
  color: #fff;
}

.search-section__location-tree {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 8px;
}

.search-section__location-tree :deep(.location-node) {
  max-width: 100%;
}

.search-section__location-tree :deep(.location-node__chip) {
  max-width: min(100%, 420px);
}

.search-mode-panel-enter-active,
.search-advanced-panel-enter-active {
  transition:
    opacity 0.16s ease,
    transform 0.16s cubic-bezier(0.22, 0.8, 0.22, 1);
}

.search-mode-panel-leave-active,
.search-advanced-panel-leave-active {
  transition:
    opacity 0.08s ease,
    transform 0.08s cubic-bezier(0.22, 0.8, 0.22, 1);
}

.search-mode-panel-enter-from,
.search-mode-panel-leave-to {
  opacity: 0;
  transform: translateX(10px);
}

.search-advanced-panel-enter-from,
.search-advanced-panel-leave-to {
  opacity: 0;
  transform: translateX(8px);
}

.search-advanced-panel-enter-to,
.search-advanced-panel-leave-from {
  opacity: 1;
  transform: translateX(0);
}

@media (prefers-reduced-motion: reduce) {
  .search-mode-panel-enter-active,
  .search-advanced-panel-enter-active,
  .search-mode-panel-leave-active,
  .search-advanced-panel-leave-active {
    transition: opacity 120ms ease;
  }

  .search-mode-panel-enter-from,
  .search-mode-panel-leave-to,
  .search-advanced-panel-enter-from,
  .search-advanced-panel-leave-to {
    transform: none;
  }
}

:global(html.theme-dark) .search-section__toggle,
:global(html.theme-dark) .search-section__card {
  background:
    radial-gradient(120% 100% at 0% 0%, color-mix(in srgb, var(--app-glass) 58%, transparent), transparent 60%),
    color-mix(in srgb, var(--app-surface) 78%, var(--app-glass));
}

:global(html.theme-dark) .search-section__chip-btn,
:global(html.theme-dark) .search-section__field-toggle,
:global(html.theme-dark) .search-section__chip,
:global(html.theme-dark) .search-section__input {
  background: color-mix(in srgb, var(--app-surface-soft) 72%, var(--app-glass));
}

:global(html.theme-dark) .search-section__chip--active {
  background: #f5f5f7;
  color: #141416;
}

:global(html.theme-dark) .search-section__close {
  background: var(--app-glass);
}
</style>