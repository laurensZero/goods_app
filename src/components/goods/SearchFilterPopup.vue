<template>
  <Popup
    v-model:show="showProxy"
    teleport="body"
    :position="popupPosition"
    round
    :class="['search-filter-popup-popup', { 'search-filter-popup-popup--tablet': isTablet }]"
    :style="popupStyle"
  >
    <div class="filter-popup">
      <!-- Header -->
      <header class="filter-popup__header">
        <button class="icon-btn" type="button" :aria-label="t('common.back')" @click="$emit('update:visible', false)">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 18L9 12L15 6" />
          </svg>
        </button>

        <SearchBar
          :model-value="filters.keyword"
          :placeholder="t('search.placeholder')"
          autofocus
          class="filter-popup__search"
          @update:model-value="$emit('update-keyword', $event)"
        />

        <span v-if="activeFilterCount > 0" class="filter-popup__badge">{{ activeFilterCount }}</span>
      </header>

      <!-- Body -->
      <div class="filter-popup__body">
        <!-- Advanced Filters toggle -->
        <section class="content-section">
          <button
            class="advanced-toggle"
            type="button"
            :aria-expanded="advancedExpanded"
            @click="advancedExpanded = !advancedExpanded"
          >
            <div class="advanced-toggle__inner">
              <div class="advanced-toggle__hero">
                <p class="section-label">{{ t('search.advancedFilters') }}</p>
                <h2 class="section-title section-title--sub section-title--tight">{{ t('search.advancedFilters') }}</h2>
                <div class="advanced-summary">
                  <span>{{ scope === 'wishlist' ? t('search.wishlistScope') : t('search.collectionScope') }}</span>
                  <span v-if="activeFilterCount > 0" class="advanced-toggle__count">{{ t('common.enabled') }} {{ activeFilterCount }}</span>
                </div>
              </div>
              <span class="advanced-toggle__icon" aria-hidden="true">
                <svg :class="{ 'advanced-toggle__arrow--open': advancedExpanded }" viewBox="0 0 24 24" fill="none">
                  <path d="M7 10L12 15L17 10" />
                </svg>
              </span>
            </div>
          </button>
        </section>

        <!-- Expanded: Presets + Filter Conditions -->
        <Transition name="advanced-panel">
          <div v-if="advancedExpanded" class="advanced-panel-wrap">
            <!-- Presets -->
            <section class="content-section">
              <div class="section-head">
                <div>
                  <p class="section-label">{{ t('search.filterPresets') }}</p>
                  <h2 class="section-title section-title--sub">{{ t('search.saveCombo') }}</h2>
                </div>
                <div class="head-actions">
                  <button class="ghost-btn" type="button" @click="presetEditorVisible = !presetEditorVisible">
                    {{ presetEditorVisible ? t('search.collapse') : t('search.saveCurrent') }}
                  </button>
                  <button v-if="activeFilterCount > 0" class="ghost-btn" type="button" @click="$emit('reset')">
                    {{ t('common.reset') }}
                  </button>
                </div>
              </div>

              <div v-if="searchPresets.length" class="preset-list">
                <article
                  v-for="preset in searchPresets"
                  :key="preset.id"
                  :class="['preset-card', { 'preset-card--active': activePresetId === preset.id }]"
                >
                  <button class="preset-main" type="button" @click="$emit('select-preset', preset)">
                    <span class="preset-name">{{ preset.name }}</span>
                    <span class="preset-meta">{{ formatPresetSummary(preset.conditions) }}</span>
                  </button>
                  <button
                    class="preset-delete"
                    type="button"
                    :aria-label="t('search.deletePreset')"
                    @click.stop="$emit('remove-preset', preset.id)"
                  >
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M18 6L6 18" />
                      <path d="M6 6L18 18" />
                    </svg>
                  </button>
                </article>
              </div>
              <div v-else class="surface-card muted-copy">{{ t('search.presetHint') }}</div>

              <!-- Preset editor -->
              <div v-if="presetEditorVisible" class="surface-card preset-editor">
                <label class="field-label" for="sfp-preset-name">{{ t('search.presetNameLabel') }}</label>
                <input
                  id="sfp-preset-name"
                  v-model.trim="presetDraftName"
                  class="field-input"
                  type="text"
                  maxlength="24"
                  :placeholder="t('search.presetNamePlaceholder')"
                >
                <div class="head-actions">
                  <button
                    class="primary-btn"
                    type="button"
                    :disabled="!presetDraftName"
                    @click="$emit('save-preset', presetDraftName)"
                  >
                    {{ t('search.saveNewPreset') }}
                  </button>
                  <button
                    v-if="activePresetId"
                    class="secondary-btn"
                    type="button"
                    :disabled="!presetDraftName"
                    @click="$emit('update-preset')"
                  >
                    {{ t('search.updateCurrent') }}
                  </button>
                </div>
              </div>
            </section>

            <!-- Filter Conditions -->
            <section class="content-section">
              <div class="section-head">
                <div>
                  <p class="section-label">{{ t('search.filterConditions') }}</p>
                  <h2 class="section-title section-title--sub">{{ t('search.comboConditions') }}</h2>
                </div>
              </div>

              <div class="surface-card filter-card">
                <!-- Price Range -->
                <div class="field-grid">
                  <div class="field-block">
                    <label class="field-label">{{ t('search.priceRange') }}</label>
                    <div class="range-row">
                      <input
                        :value="filters.priceMin"
                        class="field-input"
                        type="number"
                        min="0"
                        inputmode="decimal"
                        :placeholder="t('search.minPrice')"
                        @input="$emit('update-field', { key: 'priceMin', value: $event.target.value })"
                      >
                      <span class="range-gap">-</span>
                      <input
                        :value="filters.priceMax"
                        class="field-input"
                        type="number"
                        min="0"
                        inputmode="decimal"
                        :placeholder="t('search.maxPrice')"
                        @input="$emit('update-field', { key: 'priceMax', value: $event.target.value })"
                      >
                    </div>
                  </div>

                  <div class="field-block">
                    <label class="field-label">{{ t('common.note') }}</label>
                    <div class="chip-wrap">
                      <button
                        v-for="option in GOODS_FILTER_BOOLEAN_OPTIONS"
                        :key="option.value"
                        type="button"
                        :class="['chip', { 'chip--active': filters.hasNote === option.value }]"
                        @click="$emit('update-field', { key: 'hasNote', value: option.value })"
                      >
                        {{ option.label }}
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Collect Status (collection scope only) -->
                <div v-if="scope === 'collection'" class="field-block">
                  <label class="field-label">{{ t('search.collectStatus') }}</label>
                  <div class="chip-wrap">
                    <button
                      v-for="option in GOODS_FILTER_COLLECT_STATUS_OPTIONS"
                      :key="option.value"
                      type="button"
                      :class="['chip', { 'chip--active': filters.collectStatuses.includes(option.value) }]"
                      @click="$emit('toggle-filter', { key: 'collectStatuses', value: option.value })"
                    >
                      {{ option.label }}
                    </button>
                  </div>
                </div>

                <!-- Acquire Time -->
                <div class="field-block">
                  <label class="field-label">{{ t('search.acquireTime') }}</label>
                  <div class="chip-wrap">
                    <button
                      v-for="option in GOODS_FILTER_DATE_PRESET_OPTIONS"
                      :key="option.value"
                      type="button"
                      :class="['chip', { 'chip--active': filters.acquiredPreset === option.value }]"
                      @click="$emit('update-field', { key: 'acquiredPreset', value: option.value })"
                    >
                      {{ option.label }}
                    </button>
                  </div>
                  <div v-if="filters.acquiredPreset === 'custom'" class="range-row range-row--date">
                    <button class="date-field" type="button" @click="openDatePicker('from')">
                      <span :class="{ 'date-field__value--placeholder': !filters.acquiredFrom }">
                        {{ filters.acquiredFrom || t('search.startDate') }}
                      </span>
                      <svg class="date-field__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <rect x="3" y="5" width="18" height="16" rx="3" />
                        <path d="M8 3V7" />
                        <path d="M16 3V7" />
                        <path d="M3 10H21" />
                      </svg>
                    </button>
                    <span class="range-gap">-</span>
                    <button class="date-field" type="button" @click="openDatePicker('to')">
                      <span :class="{ 'date-field__value--placeholder': !filters.acquiredTo }">
                        {{ filters.acquiredTo || t('search.endDate') }}
                      </span>
                      <svg class="date-field__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <rect x="3" y="5" width="18" height="16" rx="3" />
                        <path d="M8 3V7" />
                        <path d="M16 3V7" />
                        <path d="M3 10H21" />
                      </svg>
                    </button>
                  </div>
                </div>

                <!-- Category -->
                <div v-if="categoryOptions.length" class="field-block">
                  <label class="field-label">{{ t('common.category') }}</label>
                  <div class="chip-wrap">
                    <button
                      v-for="option in categoryOptions"
                      :key="option.value"
                      type="button"
                      :class="['chip', { 'chip--active': filters.categories.includes(option.value) }]"
                      @click="$emit('toggle-filter', { key: 'categories', value: option.value })"
                    >
                      {{ option.label }}
                    </button>
                  </div>
                </div>

                <!-- IP -->
                <div v-if="ipOptions.length" class="field-block">
                  <label class="field-label">{{ t('common.ip') }}</label>
                  <div class="chip-wrap">
                    <button
                      v-for="option in ipOptions"
                      :key="option.value"
                      type="button"
                      :class="['chip', { 'chip--active': filters.ips.includes(option.value) }]"
                      @click="$emit('toggle-filter', { key: 'ips', value: option.value })"
                    >
                      {{ option.label }}
                    </button>
                  </div>
                </div>

                <!-- Character -->
                <div v-if="characterOptions.length" class="field-block">
                  <div class="field-head">
                    <label class="field-label">{{ t('common.character') }}</label>
                    <button
                      v-if="hasCollapsedCharacterOptions"
                      class="field-toggle"
                      type="button"
                      @click="$emit('toggle-character-expand')"
                    >
                      {{ showAllCharacterOptions ? t('search.collapseCharacters') : t('search.expandCharacters') }}
                    </button>
                  </div>
                  <div class="chip-wrap">
                    <button
                      v-for="option in visibleCharacterOptions"
                      :key="option.value"
                      type="button"
                      :class="['chip', { 'chip--active': filters.characters.includes(option.value) }]"
                      @click="$emit('toggle-filter', { key: 'characters', value: option.value })"
                    >
                      {{ option.label }}
                    </button>
                  </div>
                </div>

                <!-- Storage Location (collection scope only) -->
                <div v-if="scope === 'collection' && (storageLocationTree.length || hasUnassignedStorageLocation)" class="field-block">
                  <label class="field-label">{{ t('search.storageLocation') }}</label>
                  <div class="location-tree">
                    <button
                      v-if="hasUnassignedStorageLocation"
                      type="button"
                      :class="['chip', { 'chip--active': filters.storageLocations.includes(GOODS_FILTER_SPECIAL_VALUES.noStorageLocation) }]"
                      @click="$emit('toggle-filter', { key: 'storageLocations', value: GOODS_FILTER_SPECIAL_VALUES.noStorageLocation })"
                    >
                      {{ t('search.noLocation') }}
                    </button>

                    <StorageLocationFilterTree
                      v-for="node in storageLocationTree"
                      :key="node.path"
                      :node="node"
                      :selected-values="filters.storageLocations"
                      @toggle="$emit('toggle-filter', { key: 'storageLocations', value: $event })"
                    />
                  </div>
                </div>
              </div>
            </section>
          </div>
        </Transition>

        <!-- Empty state when no filters active -->
        <section v-if="!isFiltering" class="content-section">
          <EmptyState
            icon="✨"
            :title="t('search.startSearch')"
            :description="t('search.startSearchDesc')"
          />
        </section>
      </div>

      <!-- Footer -->
      <footer class="filter-popup__footer">
        <button class="secondary-btn" type="button" @click="$emit('reset')">
          {{ t('common.reset') }}
        </button>
        <button class="primary-btn" type="button" @click="$emit('update:visible', false)">
          {{ t('common.close') }}
        </button>
      </footer>

      <AppDatePicker
        v-model:show="showDatePicker"
        v-model="datePickerValue"
        :z-index="3000"
        :is-tablet="isTablet"
        :title="datePickerTarget === 'from' ? t('search.selectAcquiredFrom') : t('search.selectAcquiredTo')"
        :min-date="minDate"
        :max-date="maxDate"
        @confirm="onDateConfirm"
      />
    </div>
  </Popup>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { Popup } from 'vant'
import { useI18n } from 'vue-i18n'
import { useTabletViewport } from '@/composables/useTabletViewport'
import SearchBar from '@/components/common/SearchBar.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import AppDatePicker from '@/components/common/AppDatePicker.vue'
import { formatDate } from '@/utils/format'
import StorageLocationFilterTree from '@/components/storage/StorageLocationFilterTree.vue'
import {
  GOODS_FILTER_SPECIAL_VALUES,
  GOODS_FILTER_DATE_PRESET_OPTIONS,
  GOODS_FILTER_BOOLEAN_OPTIONS,
  GOODS_FILTER_COLLECT_STATUS_OPTIONS
} from '@/utils/goods/filters'

const { t } = useI18n()
const { isTabletViewport: isTablet, updateViewport } = useTabletViewport()
onMounted(() => updateViewport())

const popupPosition = computed(() => isTablet.value ? 'center' : 'bottom')
const popupStyle = computed(() => isTablet.value
  ? { width: 'min(900px, calc(100vw - 32px))', height: 'calc(100vh - 32px)' }
  : { height: '85vh' }
)

const emit = defineEmits([
  'update:visible',
  'update-keyword',
  'update-field',
  'toggle-filter',
  'reset',
  'select-preset',
  'save-preset',
  'update-preset',
  'remove-preset',
  'toggle-character-expand'
])

const props = defineProps({
  visible: { type: Boolean, default: false },
  filters: { type: Object, required: true },
  categoryOptions: { type: Array, default: () => [] },
  ipOptions: { type: Array, default: () => [] },
  characterOptions: { type: Array, default: () => [] },
  visibleCharacterOptions: { type: Array, default: () => [] },
  hasCollapsedCharacterOptions: { type: Boolean, default: false },
  showAllCharacterOptions: { type: Boolean, default: false },
  storageLocationTree: { type: Array, default: () => [] },
  hasUnassignedStorageLocation: { type: Boolean, default: false },
  activeFilterCount: { type: Number, default: 0 },
  scope: { type: String, default: 'collection' },
  searchPresets: { type: Array, default: () => [] },
  activePresetId: { type: String, default: '' },
  activePresetName: { type: String, default: '' },
  formatPresetSummary: { type: Function, default: () => '' }
})

const showProxy = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

const presetEditorVisible = ref(false)
const presetDraftName = ref('')
const advancedExpanded = ref(false)

const isFiltering = computed(() => props.activeFilterCount > 0 || (props.filters.keyword && props.filters.keyword.trim()))

// Date picker
const showDatePicker = ref(false)
const datePickerTarget = ref('from')
const datePickerValue = ref([])
const minDate = new Date(2000, 0, 1)
const maxDate = new Date(2100, 11, 31)

function normalizeDateParts(dateString) {
  const [fallbackYear, fallbackMonth, fallbackDay] = formatDate(new Date(), 'YYYY-MM-DD').split('-')
  if (!dateString) return [fallbackYear, fallbackMonth, fallbackDay]
  const [year = fallbackYear, month = fallbackMonth, day = fallbackDay] = `${dateString}`.split('-')
  return [year, month.padStart(2, '0'), day.padStart(2, '0')]
}

function openDatePicker(target) {
  datePickerTarget.value = target
  const dateString = target === 'from' ? props.filters.acquiredFrom : (props.filters.acquiredTo || props.filters.acquiredFrom)
  datePickerValue.value = normalizeDateParts(dateString)
  showDatePicker.value = true
}

function onDateConfirm({ selectedValues }) {
  const [year, month, day] = normalizeDateParts(selectedValues.join('-'))
  const dateString = `${year}-${month}-${day}`

  if (datePickerTarget.value === 'from') {
    emit('update-field', { key: 'acquiredFrom', value: dateString })
    if (props.filters.acquiredTo && props.filters.acquiredTo < dateString) {
      emit('update-field', { key: 'acquiredTo', value: dateString })
    }
  } else {
    emit('update-field', { key: 'acquiredTo', value: dateString })
    if (props.filters.acquiredFrom && props.filters.acquiredFrom > dateString) {
      emit('update-field', { key: 'acquiredFrom', value: dateString })
    }
  }

  datePickerValue.value = [year, month, day]
  showDatePicker.value = false
}
</script>

<style scoped>
:global(.search-filter-popup-popup.van-popup) {
  background: color-mix(in srgb, var(--app-bg) 88%, transparent);
  backdrop-filter: blur(20px) saturate(1.2);
  -webkit-backdrop-filter: blur(20px) saturate(1.2);
}

.filter-popup {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: transparent;
}

/* ── Header ── */
.filter-popup__header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px var(--page-padding) 8px;
  flex-shrink: 0;
}

.filter-popup__header .icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--icon-button-size);
  height: var(--icon-button-size);
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--app-surface-soft);
  color: var(--app-text);
  flex-shrink: 0;
}

.filter-popup__header .icon-btn svg {
  width: 20px;
  height: 20px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.filter-popup__search {
  flex: 1;
  min-width: 0;
}

.filter-popup__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 7px;
  border-radius: 999px;
  background: var(--app-pending-bg, #0e74e9);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
}

/* ── Body ── */
.filter-popup__body {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 0 var(--page-padding);
  scrollbar-width: none;
}

.filter-popup__body::-webkit-scrollbar {
  display: none;
}

/* ── Footer ── */
.filter-popup__footer {
  display: flex;
  gap: 10px;
  padding: 12px var(--page-padding) calc(12px + env(safe-area-inset-bottom, 0px));
  flex-shrink: 0;
}

.filter-popup__footer .secondary-btn,
.filter-popup__footer .primary-btn {
  flex: 1;
}

/* ── Content section ── */
.content-section {
  margin-bottom: var(--section-gap);
}

.section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.advanced-toggle {
  display: block;
  width: 100%;
  padding: 18px;
  border: none;
  border-radius: var(--radius-card);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
  text-align: left;
  transition: transform 0.14s ease, opacity 0.16s ease;
}

.advanced-toggle:active {
  transform: scale(0.988);
}

.advanced-toggle__inner {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.advanced-toggle__hero {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.advanced-toggle__hero .section-label,
.advanced-toggle__hero .section-title,
.advanced-summary {
  margin: 0;
}

.advanced-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--app-text-secondary);
}

.advanced-toggle__count {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 8px;
  background: var(--app-primary, #07c160);
  color: #fff;
  font-size: 11px;
  font-weight: 500;
}

.advanced-toggle__icon svg {
  width: 18px;
  height: 18px;
  stroke: var(--app-text-secondary);
  stroke-width: 2;
  transition: transform 0.2s ease;
}

.advanced-toggle__arrow--open {
  transform: rotate(180deg);
}

.advanced-panel-enter-active,
.advanced-panel-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.advanced-panel-enter-from,
.advanced-panel-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.advanced-panel-wrap {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.section-label {
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--app-text-tertiary);
}

.section-title {
  margin: 2px 0 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--app-text);
}

.section-title--sub {
  font-size: 16px;
}

.section-title--tight {
  margin-top: 1px;
}

.head-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

/* ── Buttons ── */
.ghost-btn {
  padding: 6px 12px;
  border: none;
  border-radius: var(--radius-small);
  background: transparent;
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 600;
}

.ghost-btn:active {
  background: var(--app-surface-soft);
}

.primary-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: var(--button-height);
  padding: 0 20px;
  border: none;
  border-radius: var(--radius-small);
  background: var(--app-text);
  color: var(--app-bg);
  font-size: 15px;
  font-weight: 600;
}

.primary-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.secondary-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: var(--button-height);
  padding: 0 20px;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-small);
  background: var(--app-surface);
  color: var(--app-text);
  font-size: 15px;
  font-weight: 600;
}

.secondary-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ── Surface card ── */
.surface-card {
  padding: 14px;
  border-radius: var(--radius-card);
  background: var(--app-surface);
}

.muted-copy {
  color: var(--app-text-tertiary);
  font-size: 14px;
}

/* ── Preset list ── */
.preset-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.preset-card {
  display: flex;
  align-items: stretch;
  border-radius: var(--radius-card);
  background: var(--app-surface);
  overflow: hidden;
}

.preset-card--active {
  box-shadow: inset 0 0 0 2px var(--app-pending);
}

.preset-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 12px 14px;
  border: none;
  background: transparent;
  text-align: left;
}

.preset-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--app-text);
}

.preset-meta {
  font-size: 12px;
  color: var(--app-text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.preset-delete {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: var(--app-text-tertiary);
}

.preset-delete svg {
  width: 16px;
  height: 16px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* ── Preset editor ── */
.preset-editor {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.preset-editor .head-actions {
  margin-top: 4px;
}

/* ── Filter card ── */
.filter-card {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.field-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.field-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--app-text-secondary);
}

.field-toggle {
  border: none;
  background: transparent;
  color: var(--app-pending);
  font-size: 13px;
  font-weight: 600;
}

.field-input {
  width: 100%;
  height: 48px;
  padding: 0 14px;
  border: 1px solid var(--app-input-border, rgba(20, 20, 22, 0.08));
  border-radius: 16px;
  background: var(--app-surface);
  color: var(--app-text);
  font-size: 16px;
  outline: none;
  box-shadow: inset 0 1px 0 color-mix(in srgb, #ffffff 68%, transparent);
  transition: border-color 0.18s ease;
}

.field-input:focus {
  border-color: var(--app-input-focus-border, rgba(20, 20, 22, 0.16));
}

.field-input::placeholder {
  color: var(--app-placeholder);
}

.field-input::-webkit-inner-spin-button,
.field-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.field-input[type='number'] {
  -moz-appearance: textfield;
}

/* ── Range row ── */
.range-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.range-row .field-input {
  flex: 1;
  min-width: 0;
}

.range-gap {
  flex-shrink: 0;
  color: var(--app-text-tertiary);
  font-size: 14px;
  font-weight: 600;
}

.range-row--date {
  margin-top: 4px;
}

/* ── Date field ── */
.date-field {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  height: 48px;
  padding: 0 14px;
  border: 1px solid var(--app-input-border, rgba(20, 20, 22, 0.08));
  border-radius: 16px;
  background: var(--app-surface);
  color: var(--app-text);
  font-size: 15px;
  text-align: left;
  box-shadow: inset 0 1px 0 color-mix(in srgb, #ffffff 68%, transparent);
  transition: border-color 0.18s ease;
}

.date-field:active {
  border-color: var(--app-input-focus-border, rgba(20, 20, 22, 0.16));
}

.date-field__value--placeholder {
  color: var(--app-placeholder);
}

.date-field__icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  stroke: var(--app-text-tertiary);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* ── Chips ── */
.chip-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chip {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  min-width: 0;
  padding: 8px 12px;
  border: none;
  border-radius: 14px;
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  transition: background 0.16s ease, color 0.16s ease, transform 0.16s ease;
}

.chip:active {
  transform: scale(0.988);
}

.chip--active {
  background: #141416;
  color: #fff;
}

:global(html.theme-dark) .chip--active {
  background: #f5f5f7;
  color: #141416;
}

/* ── Location tree ── */
.location-tree {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 8px;
}

/* ── Dark mode overrides ── */
:global(html.theme-dark) .filter-popup__header .icon-btn {
    background: rgba(255, 255, 255, 0.08);
  }

:global(html.theme-dark) .chip--active {
    background: #f5f5f7;
    color: #141416;
  }

:global(html.theme-dark) .primary-btn {
    background: #f5f5f7;
    color: #141416;
  }

:global(html.theme-dark) .secondary-btn {
    border-color: rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.06);
    color: #f5f5f7;
  }

:global(html.theme-dark) .field-input {
    border-color: rgba(255, 255, 255, 0.05) !important;
    background: color-mix(in srgb, var(--app-surface) 96%, var(--app-glass)) !important;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02) !important;
  }

:global(html.theme-dark) .field-input:focus {
    border-color: rgba(118, 148, 210, 0.28) !important;
  }

:global(html.theme-dark) .date-field {
    border-color: rgba(255, 255, 255, 0.05) !important;
    background: color-mix(in srgb, var(--app-surface) 96%, var(--app-glass)) !important;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02) !important;
  }

:global(html.theme-dark) .date-field__value--placeholder {
    color: rgba(245, 245, 247, 0.72);
  }

:global(html.theme-dark) .date-field__icon {
    stroke: rgba(245, 245, 247, 0.72);
  }

:global(html.theme-dark) .preset-card {
    background: rgba(255, 255, 255, 0.04);
  }

:global(html.theme-dark) .surface-card {
    background: rgba(255, 255, 255, 0.04);
  }

:global(html.theme-dark) .chip {
    background: rgba(255, 255, 255, 0.08);
    color: #f5f5f7;
  }
</style>
